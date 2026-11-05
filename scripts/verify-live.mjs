// 线上验收：node scripts/verify-live.mjs <url> <outdir>
// WebKit（iPhone 15）需要 GIO_USE_PROXY_RESOLVER=dummy GSETTINGS_BACKEND=memory；https 资源由 node 代取
import { webkit, chromium, devices } from 'playwright';
import fs from 'node:fs';
const url = process.argv[2] || 'https://smartlotus.github.io/ai-mascots-3d/';
const out = process.argv[3] || '/workspace/mascots/shots/live'; fs.mkdirSync(out, { recursive: true });
let bad = 0;
async function run(name, launch, ctxOpts, proxy) {
  const b = await launch(); const ctx = await b.newContext(ctxOpts);
  if (proxy) await ctx.route((u) => /^https?:/.test(u.href), async (r) => { try { r.fulfill({ response: await r.fetch() }); } catch { r.abort(); } });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  const t0 = Date.now();
  await p.goto(url, { waitUntil: 'load' });
  const ok = await p.waitForFunction(() => window.__ready, null, { timeout: 45000 }).then(() => true).catch(() => false);
  console.log(name, ok ? `ready ${Date.now() - t0}ms` : 'NOT READY');
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${out}/${name}-1-top.png` });
  await p.evaluate(() => window.__viewer?.setAutoRotate(false));
  for (const [id, ver] of [['claude', 'pixel'], ['antigravity', 'v1']]) { await p.click(`.rail-item[data-id="${id}"]`).catch(() => {}); await p.click(`#verSeg button[data-ver="${ver}"]`).catch(() => {}); await p.waitForTimeout(2200); await p.locator('#stage').screenshot({ path: `${out}/${name}-stage-${id}-${ver}.png` }); }
  await p.click('#tCompare'); await p.waitForTimeout(2200); await p.locator('#stage').screenshot({ path: `${out}/${name}-compare.png` }); await p.click('#tCompare');
  await p.click('#tExplode'); await p.waitForTimeout(1800); await p.locator('#stage').screenshot({ path: `${out}/${name}-explode.png` }); await p.click('#tExplode');
  await p.click('#lang'); await p.waitForTimeout(500);
  await p.locator('#gallery').scrollIntoViewIfNeeded(); await p.waitForTimeout(800); await p.screenshot({ path: `${out}/${name}-2-gallery.png` });
  await p.locator('#about').scrollIntoViewIfNeeded(); await p.waitForTimeout(500); await p.screenshot({ path: `${out}/${name}-3-about.png` });
  console.log(name, errs.length ? errs.join('\n  ') : 'no console errors'); if (!ok || errs.some((e) => e.startsWith('error') || e.startsWith('pageerror'))) bad++;
  await b.close();
}
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
await run('chrome-desktop', () => chromium.launch({ executablePath: '/usr/bin/google-chrome', args: GL }), { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN' });
await run('chrome-phone', () => chromium.launch({ executablePath: '/usr/bin/google-chrome', args: GL }), { ...devices['iPhone 15'], locale: 'zh-CN' });
if (!process.env.NO_WEBKIT) await run('webkit-iphone', () => webkit.launch({ env: { ...process.env, GIO_EXTRA_MODULES: '/opt/wk/usr/lib/x86_64-linux-gnu/gio/modules', GIO_USE_PROXY_RESOLVER: 'dummy', GSETTINGS_BACKEND: 'memory' } }), { ...devices['iPhone 15'], locale: 'zh-CN', ignoreHTTPSErrors: true }, url.startsWith('https'));
console.log(bad ? `${bad} BAD` : 'ALL OK');
