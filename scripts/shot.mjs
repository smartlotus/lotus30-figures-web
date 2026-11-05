import { chromium, devices } from 'playwright';
const [,, url, out, mode = 'desktop', wait = '3500', actions = ''] = process.argv;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext(mode === 'phone' ? { ...devices['iPhone 15'] } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage(); const errs = [];
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => window.__ready, null, { timeout: 30000 }).catch(() => errs.push('NOT READY'));
await p.waitForTimeout(+wait);
for (const a of actions.split(';').filter(Boolean)) { const [k, v] = a.split('='); if (k === 'click') await p.click(v); if (k === 'wait') await p.waitForTimeout(+v); if (k === 'scroll') await p.evaluate((y) => scrollTo(0, y), +v); if (k === 'full') await p.screenshot({ path: v, fullPage: true }); if (k === 'shot') await p.screenshot({ path: v }); }
await p.screenshot({ path: out });
console.log(errs.length ? errs.join('\n') : 'no console errors');
await b.close();
