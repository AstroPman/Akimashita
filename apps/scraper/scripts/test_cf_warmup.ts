import { warmMenestheSession } from '../src/scrapers/menesthe/cf_warmup.ts';
import { httpMenesthe } from '../src/lib/http.ts';

async function main() {
  const warmup = await warmMenestheSession();
  try {
    const body = await httpMenesthe.getJson(
      'https://men-esthe.jp/therapistlist.php?id=6441&more&p=0',
    );
    console.log(
      'therapistlist ok',
      Array.isArray(body),
      'len=',
      Array.isArray(body) ? body.length : typeof body,
    );
  } finally {
    await warmup.dispose();
  }
}

main().catch((e) => {
  console.error('FAILED', e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
