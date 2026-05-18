import { createLogger } from './lib/logger.js';
import { runTherapistsJob } from './jobs/therapists.js';
import { runAvailabilityJob } from './jobs/availability.js';
import { runNotifyJob } from './jobs/notify.js';
import {
  runExternalSalonsJob,
  type ExternalSalonsPhase,
} from './jobs/external_salons.js';

const log = createLogger('main');

type Stage = 'salons' | 'therapists' | 'availability' | 'notify';

interface CliArgs {
  stage: Stage;
  loop: number;
  dryRun: boolean;
  limit: number | null;
  onlyUnsynced: boolean;
  salonsPhase: ExternalSalonsPhase;
  concurrency: number | null;
}

function parseArgs(argv: string[]): CliArgs {
  const stageArg = argv.find((a) => a.startsWith('--stage='));
  if (!stageArg) {
    throw new Error(
      'Missing --stage argument. Use --stage=salons|therapists|availability|notify',
    );
  }
  const stageValue = stageArg.split('=', 2)[1];
  if (
    stageValue !== 'salons' &&
    stageValue !== 'therapists' &&
    stageValue !== 'availability' &&
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

  return {
    stage: stageValue,
    loop,
    dryRun,
    limit,
    onlyUnsynced,
    salonsPhase,
    concurrency,
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
      await runTherapistsJob({ onlyUnsynced: args.onlyUnsynced });
      break;
    case 'availability': {
      for (let i = 0; i < args.loop; i++) {
        if (args.loop > 1) {
          log.info(`availability iteration ${i + 1}/${args.loop}`);
        }
        await runAvailabilityJob({
          concurrency: args.concurrency ?? undefined,
        });
        if (i < args.loop - 1) {
          await sleep(60_000);
        }
      }
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
