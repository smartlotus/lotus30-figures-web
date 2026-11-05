import { chromium, devices } from 'playwright';
// 用法: node scripts/stage.mjs url outPrefix mode "id/ver,id/ver" [extra JS]
const [,, base, prefix, mode = 'desktop', list = 'claude/v1', js = ''] = process.argv;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext(mode === 'phone' ? { ...devices['iPhone 15'] } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
for (const it of list.split(',')) {
  const p = await ctx.newPage(); const errs = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); }); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${base}#/${it}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 30000 }).catch(() => errs.push('NOT READY'));
  await p.evaluate(() => { window.__viewer?.setAutoRotate(false); });
  if (js) await p.evaluate(js);
  await p.waitForTimeout(2200);
  await p.locator('#stage').screenshot({ path: `${prefix}-${it.replace('/', '-')}.png` });
  if (errs.length) console.log(it, errs.join(' | '));
  await p.close();
}
await b.close();
