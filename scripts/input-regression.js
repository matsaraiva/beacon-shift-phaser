// Focused regression checks after the touch-button and input-scope fixes.
async (page) => {
  const report = { checks: [], errors: [], failedRequests: [] };
  const assert = (value, text) => { if (!value) throw new Error(text); };
  const url = page.url();
  const context = await page.context().browser().newContext({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });
  const mobile = await context.newPage();
  mobile.on('pageerror', error => report.errors.push(error.message));
  mobile.on('requestfailed', request => report.failedRequests.push(request.url()));
  // Explicitly simulate storage denial; no game state or clock is changed.
  await mobile.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Test storage denial', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Test storage denial', 'SecurityError'); };
  });
  await mobile.goto(url);
  const state = () => mobile.evaluate(() => window.beaconSnapshot());
  await mobile.getByRole('button', { name: 'Begin watch ↗' }).tap();
  assert((await state()).phase === 'playing', 'Touch Start activates once with denied storage');
  for (let index = 0; index < 10; index++) {
    await mobile.locator('#restart').tap();
    assert((await state()).elapsed < .12 && (await state()).nextId === 1, 'Touch restart clears timers once');
  }
  await mobile.waitForTimeout(1600);
  assert((await state()).enemies.length === 1, 'One spawn after touch restarts');
  report.checks.push('Ten touch restarts each activate once; denied localStorage does not prevent play.');
  await mobile.locator('#pause').tap();
  assert((await state()).phase === 'paused', 'Touch Pause once');
  await mobile.locator('#pause').click();
  assert((await state()).phase === 'playing', 'Immediate hybrid mouse Resume is accepted');
  report.checks.push('Touch Pause followed immediately by mouse Resume works without duplicate compatibility clicks.');
  await mobile.locator('#pause').tap();
  await mobile.locator('#continue').focus();
  await mobile.keyboard.press('Enter');
  assert((await state()).phase === 'playing', 'Keyboard Resume activates after touch');
  report.checks.push('Keyboard Enter activates the focused Resume action after touch.');
  const canvas = await mobile.locator('canvas').boundingBox();
  const touch = await context.newCDPSession(mobile);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: canvas.x + canvas.width * .9, y: canvas.y + canvas.height * .5 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const cancelledAngle = (await state()).beamAngle;
  await mobile.locator('canvas').dispatchEvent('pointermove', { pointerType: 'touch', pointerId: 2, clientX: canvas.x, clientY: canvas.y });
  assert((await state()).beamAngle === cancelledAngle, 'Cancelled pointer does not keep aiming');
  report.checks.push('Cancelled touch releases aim control.');
  await mobile.setViewportSize({ width: 800, height: 360 });
  await mobile.waitForTimeout(350);
  await mobile.locator('#pause').tap();
  assert((await state()).phase === 'paused', 'Tap after orientation change');
  await mobile.locator('#continue').tap();
  assert((await state()).phase === 'playing', 'Resume tap after orientation change');
  report.checks.push('Touch Pause and Resume remain reliable after changing portrait to landscape.');
  assert(report.errors.length === 0 && report.failedRequests.length === 0, 'No runtime errors');
  await context.close();
  return report;
}
