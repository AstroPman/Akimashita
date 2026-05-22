import type { SiteName } from '@alimashita/shared';
import { createLogger } from './lib/logger.js';
import { runTherapistsJob } from './jobs/therapists.js';
import { runAvailabilityJob, type AvailabilityMode } from './jobs/availability.js';
import { runNotifyJob } from './jobs/notify.js';
import { runOfficialShiftsJob } from './jobs/official_shifts.js';
import {
  runExternalSalonsJob,
  type ExternalSalonsPhase,
} from './jobs/external_salons.js';

const log = createLogger('main');

type Stage = 'salons' | 'therapists' | 'availability' | 'official_shifts' | 'notify';

const KNOWN_SITES: ReadonlySet<SiteName> = new Set<SiteName>([
  'caskan',
  'grow',
  'edc',
  'estama',
  'eyoyaku',
]);

interface CliArgs {
  stage: Stage;
  loop: number;
  dryRun: boolean;
  limit: number | null;
  onlyUnsynced: boolean;
  salonsPhase: ExternalSalonsPhase;
  concurrency: number | null;
  availabilityMode: AvailabilityMode;
  /** --site=eyoyaku など。複数指定で配列に追加される (--site=a --site=b)。 */
  onlySites: SiteName[];
  /** --exclude-site=eyoyaku など。複数指定で配列に追加される。 */
  excludeSites: SiteName[];
  /** therapists ステージ専用: --max-per-site=20 でサイトごとに上限 N 件。 */
  maxPerSite: number | null;
}

function parseArgs(argv: string[]): CliArgs {
  const stageArg = argv.find((a) => a.startsWith('--stage='));
  if (!stageArg) {
    throw new Error(
      'Missing --stage argument. Use --stage=salons|therapists|availability|official_shifts|notify',
    );
  }
  const stageValue = stageArg.split('=', 2)[1];
  if (
    stageValue !== 'salons' &&
    stageValue !== 'therapists' &&
    stageValue !== 'availability' &&
    stageValue !== 'official_shifts' &&
    stageValue !== 'notify'
  ) {
    throw new Error(`Unknown stage: ${stageValue}`);
  }

  const loopArg = argv.find((a) => a.startsWith('--loop='));
  let loop = 1;
  if (loopArg) {
    const parsed = Number.parseInt(loopArg.split('=', 2)[1] ?? '1', 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error('--loop must be a positive integer');
    }
    loop = parsed;
  }

  const dryRun = argv.includes('--dry-run');

  const limitArg = argv.find((a) => a.startsWith('--limit='));
  let limit: number | null = null;
  if (limitArg) {
    const parsed = Number.parseInt(limitArg.split('=', 2)[1] ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error('--limit must be a positive integer');
    }
    limit = parsed;
  }

  const onlyUnsynced = argv.includes('--only-unsynced');

  const phaseArg = argv.find((a) => a.startsWith('--phase='));
  let salonsPhase: ExternalSalonsPhase = 'all';
  if (phaseArg) {
    const v = phaseArg.split('=', 2)[1];
    if (
      v !== 'areas' &&
      v !== 'discover' &&
      v !== 'details' &&
      v !== 'bookings' &&
      v !== 'therapists' &&
      v !== 'link' &&
      v !== 'all'
    ) {
      throw new Error(
        `--phase must be one of: areas | discover | details | bookings | therapists | link | all (got "${v}")`,
      );
    }
    salonsPhase = v;
  }

  const concurrencyArg = argv.find((a) => a.startsWith('--concurrency='));
  let concurrency: number | null = null;
  if (concurrencyArg) {
    const parsed = Number.parseInt(concurrencyArg.split('=', 2)[1] ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error('--concurrency must be a positive integer');
    }
    concurrency = parsed;
  }

  // --mode は --stage=availability 専用。指定なしなら従来挙動 (watch) を維持する。
  // research は salons.research_enabled=true 配下のセラピストだけを回し、通知パスはスキップする。
  const modeArg = argv.find((a) => a.startsWith('--mode='));
  let availabilityMode: AvailabilityMode = 'watch';
  if (modeArg) {
    const v = modeArg.split('=', 2)[1];
    if (v !== 'watch' && v !== 'research') {
      throw new Error(`--mode must be one of: watch | research (got "${v}")`);
    }
    availabilityMode = v;
  }

  // --site / --exclude-site は複数指定可。
  // therapists / availability ステージで使う運用フィルタ (eyoyaku を別 schedule に分離する等)。
  function collectSites(flag: string): SiteName[] {
    const out: SiteName[] = [];
    for (const a of argv) {
      if (!a.startsWith(`${flag}=`)) continue;
      const raw = a.split('=', 2)[1] ?? '';
      for (const piece of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!KNOWN_SITES.has(piece as SiteName)) {
          throw new Error(
            `${flag} must be one of ${Array.from(KNOWN_SITES).join(' | ')} (got "${piece}")`,
          );
        }
        out.push(piece as SiteName);
      }
    }
    return out;
  }
  const onlySites = collectSites('--site');
  const excludeSites = collectSites('--exclude-site');

  // --max-per-site: therapists ステージのブートストラップ分割実行用。
  const maxPerSiteArg = argv.find((a) => a.startsWith('--max-per-site='));
  let maxPerSite: number | null = null;
  if (maxPerSiteArg) {
    const parsed = Number.parseInt(maxPerSiteArg.split('=', 2)[1] ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error('--max-per-site must be a positive integer');
    }
    maxPerSite = parsed;
  }

  return {
    stage: stageValue,
    loop,
    dryRun,
    limit,
    onlyUnsynced,
    salonsPhase,
    concurrency,
    availabilityMode,
    onlySites,
    excludeSites,
    maxPerSite,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  log.info(`Starting stage: ${args.stage}${args.loop > 1 ? ` (loop=${args.loop})` : ''}`);

  switch (args.stage) {
    case 'salons':
      if (args.loop !== 1) {
        log.warn('--loop is ignored for stage=salons');
      }
      await runExternalSalonsJob({
        phase: args.salonsPhase,
        limit: args.limit ?? undefined,
      });
      break;
    case 'therapists':
      if (args.loop !== 1) {
        log.warn('--loop is ignored for stage=therapists');
      }
      await runTherapistsJob({
        onlyUnsynced: args.onlyUnsynced,
        onlySites: args.onlySites.length > 0 ? args.onlySites : undefined,
        excludeSites: args.excludeSites.length > 0 ? args.excludeSites : undefined,
        maxPerSite: args.maxPerSite ?? undefined,
      });
      break;
    case 'availability': {
      for (let i = 0; i < args.loop; i++) {
        if (args.loop > 1) {
          log.info(`availability iteration ${i + 1}/${args.loop} (mode=${args.availabilityMode})`);
        }
        await runAvailabilityJob({
          mode: args.availabilityMode,
          concurrency: args.concurrency ?? undefined,
          onlySites: args.onlySites.length > 0 ? args.onlySites : undefined,
          excludeSites: args.excludeSites.length > 0 ? args.excludeSites : undefined,
        });
        if (i < args.loop - 1) {
          await sleep(60_000);
        }
      }
      break;
    }
    case 'official_shifts': {
      if (args.loop !== 1) {
        log.warn('--loop is ignored for stage=official_shifts');
      }
      await runOfficialShiftsJob({
        concurrency: args.concurrency ?? undefined,
      });
      break;
    }
    case 'notify': {
      if (args.loop !== 1) {
        log.warn('--loop is ignored for stage=notify');
      }
      await runNotifyJob({
        dryRun: args.dryRun,
        usersPerRun: args.limit ?? undefined,
      });
      break;
    }
  }

  log.info(`Finished stage: ${args.stage}`);
}

main().catch((err) => {
  log.error('Fatal error', { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});
