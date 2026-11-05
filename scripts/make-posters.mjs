// 用 three.js 渲染透明背景海报：需要先 `npm run dev`（默认 5183 端口）
// 输出 public/posters/{id}-{ver}.webp (480px) 和 -sm.webp (96px)
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
const base = process.env.DEV_URL || 'http://127.0.0.1:5183';
const ids = ['claude', 'codex', 'qoder', 'zcode', 'notion', 'antigravity'];
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 1 });
fs.mkdirSync('public/posters', { recursive: true });
for (const id of ids) for (const ver of ['v1', 'pixel']) {
  const p = await ctx.newPage();
  await p.goto(`${base}/poster.html?id=${id}&ver=${ver}`);
  await p.waitForFunction(() => window.__posterReady, null, { timeout: 60000 });
  const png = await p.locator('#h').screenshot({ omitBackground: true });
  await sharp(png).resize(480).webp({ quality: 86, alphaQuality: 90 }).toFile(`public/posters/${id}-${ver}.webp`);
  await sharp(png).resize(112).webp({ quality: 86 }).toFile(`public/posters/${id}-${ver}-sm.webp`);
  console.log('poster', id, ver); await p.close();
}
await b.close();
