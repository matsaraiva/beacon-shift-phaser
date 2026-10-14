import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  aim,
  createState,
  inBeam,
  pause,
  resume,
  spawnInterval,
  start,
  update,
  type Enemy,
} from './rules';

function enemy(id: number, angle = 0, radius = 200, exposure = 0): Enemy {
  return { id, angle, radius, exposure };
}

describe('Beacon Shift rules', () => {
  it('starts ready and resets every gameplay field when started again', () => {
    const state = createState();
    expect(state.phase).toBe('ready');
    expect(state.enemies).toEqual([]);
    expect(state.lives).toBe(3);

    state.elapsed = 12;
    state.lives = 1;
    state.score = 90;
    state.enemies.push(enemy(7));
    state.nextSpawn = 0.2;
    state.immunity = 0.4;
    state.nextId = 8;
    start(state);

    expect(state).toMatchObject({
      phase: 'playing',
      elapsed: 0,
      lives: 3,
      score: 0,
      beamAngle: -Math.PI / 2,
      enemies: [],
      nextSpawn: CONFIG.spawnStart,
      immunity: 0,
      nextId: 1,
    });
  });

  it('normalizes aiming across the angular wrap boundary', () => {
    const state = createState();
    aim(state, Math.PI + 0.1);
    expect(state.beamAngle).toBeCloseTo(-Math.PI + 0.1, 12);
  });

  it('includes the cone edge and handles angles across -pi and pi', () => {
    expect(inBeam(CONFIG.beamHalfAngle, 0)).toBe(true);
    expect(inBeam(CONFIG.beamHalfAngle + 0.001, 0)).toBe(false);
    expect(inBeam(-Math.PI + 0.02, Math.PI - 0.02)).toBe(true);
    expect(inBeam(-Math.PI + 0.8, Math.PI - 0.02)).toBe(false);
  });

  it('repels only after continuous exposure and resets interrupted exposure', () => {
    const state = createState();
    start(state);
    aim(state, 0);
    state.enemies.push(enemy(1));

    update(state, 0.1);
    update(state, 0.1);
    expect(state.enemies[0].exposure).toBeCloseTo(0.2, 10);

    aim(state, Math.PI);
    update(state, 0.05);
    expect(state.enemies[0].exposure).toBe(0);

    aim(state, 0);
    update(state, 0.1);
    update(state, 0.1);
    expect(state.score).toBe(0);
    expect(state.enemies).toHaveLength(1);
    const events = update(state, 0.05);

    expect(events).toEqual([{ type: 'repel', angle: 0, radius: expect.any(Number) }]);
    expect(state.score).toBe(10);
    expect(state.enemies).toHaveLength(0);
  });

  it('processes same-step arrivals by stable id and blocks follow-up damage', () => {
    const state = createState();
    start(state);
    state.enemies.push(enemy(2, 0.1, CONFIG.hitRadius + 0.1));
    state.enemies.push(enemy(1, -0.1, CONFIG.hitRadius + 0.1));

    const events = update(state, 0.02);

    expect(events.map(({ type }) => type)).toEqual(['hit', 'blocked']);
    expect(events.map(({ angle }) => angle)).toEqual([-0.1, 0.1]);
    expect(state.lives).toBe(2);
    expect(state.immunity).toBeCloseTo(CONFIG.immunitySeconds - 0.01, 10);
    expect(state.enemies).toHaveLength(0);

    for (let index = 0; index < 4; index += 1) update(state, 0.1);
    update(state, 0.09);
    expect(state.lives).toBe(2);
    state.enemies.push(enemy(3, 1, CONFIG.hitRadius + 0.1));
    expect(update(state, 0.02).map(({ type }) => type)).toEqual(['hit']);
    expect(state.lives).toBe(1);
  });

  it('repels before resolving an arrival in the same substep', () => {
    const state = createState();
    start(state);
    aim(state, 0);
    const step = 1 / 60;
    state.enemies.push(enemy(
      1,
      0,
      CONFIG.hitRadius + CONFIG.enemySpeed * step / 2,
      CONFIG.exposureSeconds - step,
    ));

    const events = update(state, step);

    expect(events.map(({ type }) => type)).toEqual(['repel']);
    expect(state.score).toBe(10);
    expect(state.lives).toBe(3);
    expect(state.enemies).toHaveLength(0);
  });

  it('lets a lethal arrival take precedence over surviving at 60 seconds', () => {
    const state = createState();
    start(state);
    state.elapsed = CONFIG.durationSeconds - 0.01;
    state.lives = 1;
    state.enemies.push(enemy(1, 0, CONFIG.hitRadius + 0.1));

    const events = update(state, 0.02);

    expect(events.map(({ type }) => type)).toEqual(['hit']);
    expect(state.phase).toBe('lost');
    expect(state.lives).toBe(0);
  });

  it('wins after 60 seconds and does not spawn after the result is reached', () => {
    const state = createState();
    start(state);
    state.elapsed = CONFIG.durationSeconds - 0.05;
    state.nextSpawn = 0.06;

    update(state, 0.1, () => 0.25);

    expect(state.phase).toBe('won');
    expect(state.elapsed).toBe(CONFIG.durationSeconds);
    expect(state.enemies).toHaveLength(0);
  });

  it('ramps spawn intervals and spawns at the square edge', () => {
    expect(spawnInterval(0)).toBe(CONFIG.spawnStart);
    expect(spawnInterval(CONFIG.durationSeconds / 2)).toBeCloseTo(1.075, 12);
    expect(spawnInterval(CONFIG.durationSeconds)).toBe(CONFIG.spawnEnd);

    const state = createState();
    start(state);
    state.elapsed = 30;
    state.nextSpawn = 0.001;
    update(state, 0.02, () => 0.25);

    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0].angle).toBeCloseTo(-Math.PI / 2, 12);
    expect(state.enemies[0].radius).toBeCloseTo(CONFIG.center - CONFIG.enemySpeed * 0.01, 10);
  });

  it('enforces the enemy cap without bursting queued spawns', () => {
    const state = createState();
    start(state);
    state.enemies = Array.from({ length: CONFIG.maxEnemies }, (_, index) => enemy(index + 1, 1, 200));
    state.nextSpawn = 0.001;

    update(state, 0.02, () => 0.25);

    expect(state.enemies).toHaveLength(CONFIG.maxEnemies);
    expect(state.nextSpawn).toBeGreaterThan(1.4);
  });

  it('freezes gameplay timers while paused and resumes them intentionally', () => {
    const state = createState();
    start(state);
    state.enemies.push(enemy(1, 0, 200, 0.1));
    state.immunity = 0.2;
    const elapsed = state.elapsed;
    const nextSpawn = state.nextSpawn;

    pause(state);
    update(state, 0.1);
    expect(state.elapsed).toBe(elapsed);
    expect(state.nextSpawn).toBe(nextSpawn);
    expect(state.immunity).toBe(0.2);
    expect(state.enemies[0].radius).toBe(200);

    resume(state);
    update(state, 0.02);
    expect(state.elapsed).toBeGreaterThan(elapsed);
    expect(state.immunity).toBeLessThan(0.2);
    expect(state.enemies[0].radius).toBeLessThan(200);
  });

  it('ignores invalid deltas and clamps a large frame to 0.1 seconds', () => {
    const state = createState();
    start(state);
    state.enemies.push(enemy(1, 0, 200, 0.1));
    state.immunity = 0.2;
    const beforeInvalidUpdates = structuredClone(state);

    for (const delta of [-0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(update(state, delta)).toEqual([]);
      expect(state).toEqual(beforeInvalidUpdates);
    }

    expect(update(state, 1)).toEqual([]);
    expect(state.elapsed).toBeCloseTo(0.1, 10);
    expect(state.enemies[0].radius).toBeCloseTo(196.5, 10);
    expect(state.enemies[0].exposure).toBe(0);
    expect(state.immunity).toBeCloseTo(0.1, 10);
  });
});
