export const CONFIG = {
  arenaSize: 600,
  center: 300,
  hitRadius: 35,
  beamHalfAngle: Math.PI / 6,
  exposureSeconds: 0.25,
  immunitySeconds: 0.5,
  durationSeconds: 60,
  enemySpeed: 35,
  spawnStart: 1.5,
  spawnEnd: 0.65,
  maxEnemies: 12,
} as const;

export type Phase = 'ready' | 'playing' | 'paused' | 'won' | 'lost';

export interface Enemy {
  id: number;
  angle: number;
  radius: number;
  exposure: number;
}

export interface GameState {
  phase: Phase;
  elapsed: number;
  lives: number;
  score: number;
  beamAngle: number;
  enemies: Enemy[];
  nextSpawn: number;
  immunity: number;
  nextId: number;
}

export interface GameEvent {
  type: 'repel' | 'hit' | 'blocked';
  angle: number;
  radius: number;
}

const FIXED_STEP = 1 / 60;
const MAX_UPDATE = 0.1;
const EPSILON = 1e-10;

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function createState(): GameState {
  return {
    phase: 'ready',
    elapsed: 0,
    lives: 3,
    score: 0,
    beamAngle: -Math.PI / 2,
    enemies: [],
    nextSpawn: CONFIG.spawnStart,
    immunity: 0,
    nextId: 1,
  };
}

export function start(state: GameState): GameState {
  Object.assign(state, createState(), { phase: 'playing' as const });
  return state;
}

export function pause(state: GameState): GameState {
  if (state.phase === 'playing') state.phase = 'paused';
  return state;
}

export function resume(state: GameState): GameState {
  if (state.phase === 'paused') state.phase = 'playing';
  return state;
}

export function aim(state: GameState, angle: number): GameState {
  if ((state.phase === 'ready' || state.phase === 'playing') && Number.isFinite(angle)) {
    state.beamAngle = normalizeAngle(angle);
  }
  return state;
}

export function spawnInterval(elapsed: number): number {
  const progress = Math.min(1, Math.max(0, elapsed / CONFIG.durationSeconds));
  return CONFIG.spawnStart + (CONFIG.spawnEnd - CONFIG.spawnStart) * progress;
}

export function inBeam(enemyAngle: number, beamAngle: number): boolean {
  const difference = Math.atan2(
    Math.sin(enemyAngle - beamAngle),
    Math.cos(enemyAngle - beamAngle),
  );
  return Math.abs(difference) <= CONFIG.beamHalfAngle + EPSILON;
}

function spawnEnemy(state: GameState, random: () => number): void {
  const sample = random();
  const unit = Number.isFinite(sample) ? Math.min(1 - Number.EPSILON, Math.max(0, sample)) : 0;
  const angle = normalizeAngle(unit * Math.PI * 2 - Math.PI);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const radius = CONFIG.center / Math.max(Math.abs(cosine), Math.abs(sine));

  state.enemies.push({ id: state.nextId, angle, radius, exposure: 0 });
  state.nextId += 1;
}

function updateStep(state: GameState, dt: number, random: () => number, events: GameEvent[]): void {
  state.immunity = Math.max(0, state.immunity - dt);

  for (const enemy of state.enemies) {
    enemy.radius = Math.max(0, enemy.radius - CONFIG.enemySpeed * dt);
  }

  const survivors: Enemy[] = [];
  for (const enemy of state.enemies) {
    if (inBeam(enemy.angle, state.beamAngle)) {
      enemy.exposure += dt;
      if (enemy.exposure + EPSILON >= CONFIG.exposureSeconds) {
        state.score += 10;
        events.push({ type: 'repel', angle: enemy.angle, radius: enemy.radius });
        continue;
      }
    } else {
      enemy.exposure = 0;
    }
    survivors.push(enemy);
  }
  state.enemies = survivors;

  const arrivals = state.enemies
    .filter((enemy) => enemy.radius <= CONFIG.hitRadius)
    .sort((a, b) => a.id - b.id);
  if (arrivals.length > 0) {
    const arrivingIds = new Set(arrivals.map((enemy) => enemy.id));
    state.enemies = state.enemies.filter((enemy) => !arrivingIds.has(enemy.id));
    for (const enemy of arrivals) {
      if (state.immunity > 0) {
        events.push({ type: 'blocked', angle: enemy.angle, radius: enemy.radius });
      } else {
        state.lives = Math.max(0, state.lives - 1);
        state.immunity = CONFIG.immunitySeconds;
        events.push({ type: 'hit', angle: enemy.angle, radius: enemy.radius });
      }
    }
  }

  state.elapsed = Math.min(CONFIG.durationSeconds, state.elapsed + dt);
  if (state.lives <= 0) {
    state.phase = 'lost';
    return;
  }
  if (state.elapsed + EPSILON >= CONFIG.durationSeconds) {
    state.elapsed = CONFIG.durationSeconds;
    state.phase = 'won';
    return;
  }

  state.nextSpawn -= dt;
  if (state.nextSpawn <= EPSILON) {
    if (state.enemies.length < CONFIG.maxEnemies) {
      spawnEnemy(state, random);
    }
    // Do not accumulate a burst of queued spawns while the arena is full.
    state.nextSpawn += spawnInterval(state.elapsed);
  }
}

export function update(
  state: GameState,
  dt: number,
  random: () => number = Math.random,
): GameEvent[] {
  if (state.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return [];

  const boundedDt = Math.min(dt, MAX_UPDATE);
  const stepCount = Math.ceil(boundedDt / FIXED_STEP);
  const step = boundedDt / stepCount;
  const events: GameEvent[] = [];

  for (let index = 0; index < stepCount && state.phase === 'playing'; index += 1) {
    updateStep(state, step, random, events);
  }

  return events;
}
