// esbuild で src/handlers/*.ts を Lambda 向け単独 .mjs にバンドルする。
// Lambda コンテナイメージの ${LAMBDA_TASK_ROOT} 直下に配置されることを想定し、
// 出力先は dist/ に並列で吐く（例: dist/availability.mjs）。
import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HANDLERS_DIR = path.resolve(__dirname, 'src/handlers');
const OUT_DIR = path.resolve(__dirname, 'dist');

const entryPoints = readdirSync(HANDLERS_DIR)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => path.join(HANDLERS_DIR, f));

if (entryPoints.length === 0) {
  console.error('No handler entry points found in', HANDLERS_DIR);
  process.exit(1);
}

await build({
  entryPoints,
  outdir: OUT_DIR,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: 'inline',
  // CJS 由来コードが require / __dirname / __filename を使う場合に備えるシム。
  banner: {
    js: [
      "import { createRequire as __cjs_createRequire } from 'node:module';",
      "import { fileURLToPath as __esm_fileURLToPath } from 'node:url';",
      "import { dirname as __esm_dirname } from 'node:path';",
      'const require = __cjs_createRequire(import.meta.url);',
      'const __filename = __esm_fileURLToPath(import.meta.url);',
      'const __dirname = __esm_dirname(__filename);',
    ].join('\n'),
  },
  // Lambda Node.js ランタイムが提供するため、AWS SDK は bundle に含めない。
  external: ['@aws-sdk/*', 'aws-sdk'],
  mainFields: ['module', 'main'],
  conditions: ['node', 'import'],
  logLevel: 'info',
});

console.log(`Built ${entryPoints.length} handler(s) into ${path.relative(__dirname, OUT_DIR)}/`);
