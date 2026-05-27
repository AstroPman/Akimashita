import path from "node:path";
import type { NextConfig } from "next";

// `next dev` / `next build` は `apps/web/` 配下から実行する想定。
// 同一階層に `next.config.ts` がある前提で 2 つ上をモノレポ root とみなす。
const MONOREPO_ROOT = path.resolve(process.cwd(), "..", "..");

const nextConfig: NextConfig = {
  // `~/package-lock.json` が偶然存在しているため、Turbopack が workspace root を
  // `/Users/yuichi/` と誤推定して、ファイル監視・キャッシュキー計算がリポジトリ外に
  // ずれ、`globals.css` の編集が dev ビルドへ反映されなくなる事象を踏んだ。
  // 明示的にモノレポのルートを指定して回避する。
  turbopack: {
    root: MONOREPO_ROOT,
  },
};

export default nextConfig;
