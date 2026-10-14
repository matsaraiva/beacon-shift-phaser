// Supplemental development-only rendering scenario. No shipped state-editing hook.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  const target = await context.newPage();
  const errors = [];
  target.on('pageerror', error => errors.push(error.message));
  // Inject a controlled starting state into Vite's served entry module in this QA context only.
  await target.route('**/src/main.ts', async route => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({ response, body: body + `\nstate.phase = 'playing'; state.elapsed = 45; state.nextSpawn = 100;
      state.enemies = Array.from({length:12}, (_, i) => ({id:i+1, angle:.05+i*Math.PI/12, radius:215+(i%3)*40, exposure:0})); state.nextId=13;\n` });
  });
  await target.goto('http://127.0.0.1:4175/beacon-shift-phaser/?qa=1');
  await target.waitForFunction(() => window.beaconSnapshot?.().enemies.length === 12);
  await target.evaluate(() => document.fonts.ready);
  await target.screenshot({ path: 'output/playwright/cap-12.png' });
  const frames = await target.evaluate(() => new Promise(resolve => {
    const samples = []; let prior = performance.now();
    function frame(now) { samples.push(now-prior); prior=now; if(samples.length<120) requestAnimationFrame(frame); else resolve(samples); }
    requestAnimationFrame(frame);
  }));
  const state = await target.evaluate(() => window.beaconSnapshot());
  if (state.enemies.length !== 12 || errors.length) throw new Error('Cap rendering scenario failed');
  const sorted = frames.slice().sort((a,b)=>a-b);
  const report = { scenario:'Controlled initial state, Vite development build, no game-clock edits', enemies:state.enemies.length, frames:frames.length, medianRafIntervalMs:sorted[60], maxRafIntervalMs:sorted.at(-1), userAgent:await target.evaluate(()=>navigator.userAgent), errors };
  await context.close();
  return report;
}
