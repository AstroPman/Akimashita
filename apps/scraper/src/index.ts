import { createLogger } from './lib/logger.js';
import { runTherapistsJob } from './jobs/therapists.js';
import { runAvailabilityJob } from './jobs/availability.js';
import { runNotifyJob } from './jobs/notify.js';

const log = createLogger('main');

type Stage = 'salons' | 'therapists' | 'availability' | 'notify';

interface CliArgs {
  stage: Stage;
  loop: number;
  dryRun: boolean;
  limit: number | null;
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

  return { stage: stageValue, loop, dryRun, limit };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  log.info(`Starting stage: ${args.stage}${args.loop > 1 ? ` (loop=${args.loop})` : ''}`);

  switch (args.stage) {
    case 'salons':
      throw new Error('Stage 1 (salons) is not implemented yet. Manage seed.sql manually.');
    case 'therapists':
      if (args.loop !== 1) {
        log.warn('--loop is ignored for stage=therapists');
      }
      await runTherapistsJob();
      break;
    case 'availability': {
      for (let i = 0; i < args.loop; i++) {
        if (args.loop > 1) {
          log.info(`availability iteration ${i + 1}/${args.loop}`);
        }
        await runAvailabilityJob();
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
