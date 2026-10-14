// Real-time UI play: read-only snapshots choose targets; mouse input is the only action.
async (page) => {
  const errors = [], failures = [], warnings = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
  page.on('requestfailed', request => failures.push(request.url()));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(page.url());
  await page.getByRole('button', { name: 'Begin watch ↗' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Begin watch ↗' }).click();
  const bounds = await page.locator('canvas').boundingBox();
  const startTime = Date.now();
  let maxEnemies = 0, target = null, heldUntil = 0, captured = false;
  const samples = [];
  while (Date.now() - startTime < 80000) {
    const state = await page.evaluate(() => window.beaconSnapshot());
    maxEnemies = Math.max(maxEnemies, state.enemies.length);
    if (state.phase !== 'playing') {
      await page.screenshot({ path: 'output/playwright/won.png' });
      if (state.phase !== 'won') throw new Error(`Real gameplay did not survive: ${state.phase}`);
      return { phase: state.phase, elapsed: state.elapsed, wallSeconds: (Date.now() - startTime) / 1000, score: state.score, lives: state.lives, maxEnemies, samples, errors, failures, warnings };
    }
    if (Math.floor(state.elapsed / 10) > samples.length - 1) samples.push({ elapsed: state.elapsed, lives: state.lives, score: state.score, enemies: state.enemies.length });
    const current = state.enemies.find(enemy => enemy.id === target);
    if (!current || Date.now() >= heldUntil) {
      // Let threats approach to exercise high-density rendering before clearing the nearest.
      const closest = [...state.enemies].sort((a, b) => a.radius - b.radius)[0];
      if (closest && closest.radius < 105) { target = closest.id; heldUntil = Date.now() + 340; }
      else target = null;
    }
    const enemy = state.enemies.find(enemy => enemy.id === target);
    const angle = enemy ? enemy.angle : -Math.PI / 2;
    await page.mouse.move(bounds.x + bounds.width * (.5 + Math.cos(angle) * .42), bounds.y + bounds.height * (.5 + Math.sin(angle) * .42));
    if (!captured && state.elapsed > 44 && state.enemies.length >= 7) {
      await page.screenshot({ path: 'output/playwright/gameplay.png' });
      captured = true;
    }
    await page.waitForTimeout(90);
  }
  throw new Error('Real-time run exceeded 80 seconds');
}
