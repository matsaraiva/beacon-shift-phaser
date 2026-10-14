import Phaser from 'phaser';
import { CONFIG, type GameEvent, type GameState } from './rules';

interface SceneBridge {
  state: GameState;
  tick: (deltaSeconds: number) => GameEvent[];
  ready: () => void;
  reducedMotion: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface VisualEffect {
  type: GameEvent['type'];
  angle: number;
  radius: number;
  age: number;
  duration: number;
}

const CENTER = CONFIG.center;
const ARENA_SIZE = CONFIG.arenaSize;
const MAX_EFFECTS = 36;
const TAU = Math.PI * 2;

const COLORS = {
  seaTop: 0x061725,
  seaBottom: 0x0c2a3d,
  seaDeep: 0x071d2d,
  fog: 0x547988,
  mapLine: 0x78949b,
  island: 0x1b3540,
  islandShadow: 0x102a36,
  islandEdge: 0x80978f,
  tower: 0xe9ddbd,
  towerShadow: 0xb6b39f,
  beaconRed: 0xd56759,
  lamp: 0xffe6a0,
  beam: 0xf4c879,
  ghost: 0x25344b,
  ghostEdge: 0x9fc6ce,
  ghostEye: 0xffcc79,
  shield: 0x8de2df,
  impact: 0xffaa82,
} as const;

function fillPolygon(
  graphics: Phaser.GameObjects.Graphics,
  points: Point[],
  color: number,
  alpha = 1,
  outline?: number,
  outlineAlpha = 1,
  lineWidth = 1,
): void {
  if (points.length < 3) return;

  graphics.fillStyle(color, alpha);
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    graphics.lineTo(points[index].x, points[index].y);
  }
  graphics.closePath();
  graphics.fillPath();

  if (outline !== undefined) {
    graphics.lineStyle(lineWidth, outline, outlineAlpha);
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      graphics.lineTo(points[index].x, points[index].y);
    }
    graphics.closePath();
    graphics.strokePath();
  }
}

function mixColor(from: number, to: number, amount: number): number {
  const t = Phaser.Math.Clamp(amount, 0, 1);
  const red = Math.round(Phaser.Math.Linear((from >> 16) & 0xff, (to >> 16) & 0xff, t));
  const green = Math.round(Phaser.Math.Linear((from >> 8) & 0xff, (to >> 8) & 0xff, t));
  const blue = Math.round(Phaser.Math.Linear(from & 0xff, to & 0xff, t));
  return (red << 16) | (green << 8) | blue;
}

function rotatePoint(x: number, y: number, angle: number): Point {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: x * cosine - y * sine, y: x * sine + y * cosine };
}

function deterministicUnit(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export class GameScene extends Phaser.Scene {
  private readonly bridge: SceneBridge;
  private background!: Phaser.GameObjects.Graphics;
  private landmark!: Phaser.GameObjects.Graphics;
  private beamGraphics!: Phaser.GameObjects.Graphics;
  private ambientGraphics!: Phaser.GameObjects.Graphics;
  private actorGraphics!: Phaser.GameObjects.Graphics;
  private effectGraphics!: Phaser.GameObjects.Graphics;
  private effects: VisualEffect[] = [];
  private ambientTime = 0;
  private lastElapsed = 0;

  constructor(bridge: SceneBridge) {
    super({ key: 'GameScene' });
    this.bridge = bridge;
  }

  create(): void {
    this.lastElapsed = this.bridge.state.elapsed;
    this.ambientTime = 0;
    this.effects = [];

    this.background = this.add.graphics().setDepth(0);
    this.drawBackground();

    this.beamGraphics = this.add.graphics().setDepth(1);
    this.ambientGraphics = this.add.graphics().setDepth(2);
    this.landmark = this.add.graphics().setDepth(3);
    this.drawLandmark();

    this.actorGraphics = this.add.graphics().setDepth(4);
    this.effectGraphics = this.add.graphics().setDepth(5);

    this.bridge.ready();
  }

  update(_time: number, delta: number): void {
    const deltaSeconds = Math.min(delta / 1000, 0.1);
    const phaseBeforeTick = this.bridge.state.phase;
    const events = this.bridge.tick(deltaSeconds);
    const state = this.bridge.state;

    if (state.elapsed < this.lastElapsed) this.clearEffects();
    this.lastElapsed = state.elapsed;

    if (
      phaseBeforeTick === 'playing'
      || state.phase === 'won'
      || state.phase === 'lost'
    ) {
      this.advanceEffects(deltaSeconds);
    }
    if (phaseBeforeTick !== 'paused' && !this.bridge.reducedMotion) {
      this.ambientTime += deltaSeconds;
    }
    this.addEventEffects(events);
    this.renderState(state);
  }

  clearEffects(): void {
    this.effects = [];
    this.effectGraphics?.clear();
  }

  private drawBackground(): void {
    const graphics = this.background;
    graphics.fillGradientStyle(COLORS.seaTop, COLORS.seaTop, COLORS.seaBottom, COLORS.seaDeep);
    graphics.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);

    graphics.fillStyle(0x83a1a7, 0.035);
    graphics.fillEllipse(116, 120, 278, 118);
    graphics.fillStyle(0x7193a1, 0.045);
    graphics.fillEllipse(510, 430, 250, 135);
    graphics.fillStyle(0x102e40, 0.18);
    graphics.fillRect(0, 440, ARENA_SIZE, 160);

    // Quiet chart-like wave contours keep the sea legible beneath the moving beam.
    for (let row = 0; row < 12; row += 1) {
      const baseY = 46 + row * 46;
      graphics.lineStyle(row % 3 === 0 ? 1.25 : 0.8, COLORS.mapLine, row % 3 === 0 ? 0.17 : 0.09);
      graphics.beginPath();
      for (let step = 0; step <= 28; step += 1) {
        const x = 18 + step * 20;
        const wave = Math.sin(step * 0.72 + row * 1.1) * 4 + Math.sin(step * 0.28 + row) * 2.5;
        const y = baseY + wave;
        if (step === 0) graphics.moveTo(x, y);
        else graphics.lineTo(x, y);
      }
      graphics.strokePath();
    }

    // Fixed flecks read as distant stars and chart lights, with no runtime assets.
    for (let index = 0; index < 58; index += 1) {
      const x = 24 + deterministicUnit(index + 1) * 552;
      const y = 22 + deterministicUnit(index + 97) * 556;
      const radius = index % 7 === 0 ? 1.6 : 0.8;
      graphics.fillStyle(index % 4 === 0 ? 0xe7d6aa : 0x95b7bd, index % 4 === 0 ? 0.38 : 0.23);
      graphics.fillCircle(x, y, radius);
    }

    // A fine navigational frame and compass ticks anchor the playable square.
    graphics.lineStyle(1, 0x9db6b6, 0.28);
    graphics.strokeRect(13, 13, 574, 574);
    graphics.lineStyle(1, 0xc2b783, 0.34);
    const tickPositions = [86, 158, 230, 370, 442, 514];
    for (const position of tickPositions) {
      graphics.lineBetween(position, 13, position, position % 2 === 0 ? 20 : 18);
      graphics.lineBetween(position, 587, position, position % 2 === 0 ? 580 : 582);
      graphics.lineBetween(13, position, position % 2 === 0 ? 20 : 18, position);
      graphics.lineBetween(587, position, position % 2 === 0 ? 580 : 582, position);
    }
    this.drawCornerMarks(graphics);
  }

  private drawCornerMarks(graphics: Phaser.GameObjects.Graphics): void {
    const corners: Array<[number, number, number, number]> = [
      [22, 22, 1, 1],
      [578, 22, -1, 1],
      [22, 578, 1, -1],
      [578, 578, -1, -1],
    ];
    graphics.lineStyle(1.5, 0xe3c078, 0.7);
    for (const [x, y, horizontal, vertical] of corners) {
      graphics.lineBetween(x, y, x + horizontal * 15, y);
      graphics.lineBetween(x, y, x, y + vertical * 15);
    }
  }

  private drawLandmark(): void {
    const graphics = this.landmark;

    graphics.fillStyle(0x7fb5bb, 0.055);
    graphics.fillEllipse(CENTER, CENTER + 10, 180, 132);
    graphics.lineStyle(1, 0xa3c0ba, 0.16);
    graphics.strokeEllipse(CENTER, CENTER + 8, 152, 112);

    const coast: Point[] = [];
    for (let index = 0; index < 36; index += 1) {
      const angle = (index / 36) * TAU;
      const wobble = 1 + Math.sin(angle * 3 + 0.5) * 0.055 + Math.cos(angle * 7) * 0.025;
      const radiusX = 64 * wobble;
      const radiusY = 49 * wobble;
      coast.push({ x: CENTER + Math.cos(angle) * radiusX, y: CENTER + 9 + Math.sin(angle) * radiusY });
    }
    fillPolygon(graphics, coast, COLORS.islandShadow, 1, 0x385360, 0.8, 2);

    const innerCoast = coast.map((point) => ({
      x: CENTER + (point.x - CENTER) * 0.86,
      y: CENTER + 9 + (point.y - CENTER - 9) * 0.82,
    }));
    fillPolygon(graphics, innerCoast, COLORS.island, 1, COLORS.islandEdge, 0.44, 1);

    graphics.lineStyle(1, 0xa4b69e, 0.26);
    graphics.strokeEllipse(CENTER, CENTER + 10, 92, 64);
    graphics.fillStyle(0x667c76, 0.34);
    graphics.fillEllipse(270, 335, 28, 13);
    graphics.fillEllipse(333, 334, 24, 12);
    graphics.fillEllipse(274, 274, 17, 10);
    graphics.fillEllipse(326, 273, 22, 11);
    graphics.fillEllipse(300, 356, 34, 12);

    // A narrow stone landing continues south from the island base.
    fillPolygon(
      graphics,
      [
        { x: 292, y: 342 }, { x: 308, y: 342 }, { x: 314, y: 396 },
        { x: 286, y: 396 },
      ],
      0x314c53,
      1,
      0x8b9c88,
      0.44,
      1,
    );
    graphics.lineStyle(1, 0xd0bf8d, 0.3);
    graphics.lineBetween(292, 353, 308, 353);
    graphics.lineBetween(290, 374, 310, 374);
    graphics.fillStyle(0x78928d, 0.65);
    graphics.fillCircle(288, 390, 5);
    graphics.fillCircle(312, 390, 5);

    // Lighthouse base and tapered tower.
    graphics.fillStyle(0x071b29, 0.42);
    graphics.fillEllipse(CENTER, 348, 50, 13);
    fillPolygon(
      graphics,
      [
        { x: 287, y: 302 }, { x: 313, y: 302 }, { x: 321, y: 351 },
        { x: 279, y: 351 },
      ],
      COLORS.tower,
      1,
      0xf3e8c7,
      0.88,
      1.5,
    );
    fillPolygon(graphics, [{ x: 287, y: 302 }, { x: 293, y: 302 }, { x: 290, y: 350 }, { x: 279, y: 350 }], 0xffffff, 0.26);

    fillPolygon(graphics, [{ x: 284, y: 318 }, { x: 316, y: 318 }, { x: 317, y: 324 }, { x: 283, y: 324 }], COLORS.beaconRed);
    fillPolygon(graphics, [{ x: 281, y: 339 }, { x: 319, y: 339 }, { x: 320, y: 345 }, { x: 280, y: 345 }], COLORS.beaconRed);
    graphics.fillStyle(0x3b5961, 0.9);
    graphics.fillRoundedRect(297, 328, 6, 9, 2);
    graphics.fillStyle(0xf4e9c9, 0.7);
    graphics.fillRect(294, 305, 3, 5);
    graphics.fillRect(303, 305, 3, 5);

    // Lantern room sits exactly on the rules' beam origin at (300, 300).
    graphics.fillStyle(0xffd982, 0.09);
    graphics.fillCircle(CENTER, CENTER, 23);
    graphics.fillStyle(0xffe8a5, 0.18);
    graphics.fillCircle(CENTER, CENTER, 14);
    graphics.lineStyle(1, 0xedd294, 0.9);
    graphics.lineBetween(282, 292, 318, 292);
    graphics.lineBetween(284, 307, 316, 307);
    graphics.fillStyle(0x91534c, 1);
    graphics.fillRect(286, 293, 28, 13);
    graphics.fillStyle(0xffe8a5, 0.95);
    graphics.fillRect(289, 294, 22, 10);
    graphics.fillStyle(0x9d5a50, 0.9);
    graphics.fillRect(299, 293, 2, 13);
    graphics.fillRect(286, 298, 28, 1.5);
    fillPolygon(graphics, [{ x: 281, y: 292 }, { x: 319, y: 292 }, { x: 312, y: 286 }, { x: 300, y: 281 }, { x: 288, y: 286 }], 0xb9564c, 1, 0xe9b779, 0.9, 1);
    graphics.fillStyle(0xe5c887, 1);
    graphics.fillRect(281, 291, 38, 2);
    graphics.fillStyle(COLORS.lamp, 1);
    graphics.fillCircle(CENTER, CENTER, 3.8);

    graphics.lineStyle(1, 0xa8b99c, 0.48);
    graphics.lineBetween(265, 352, 280, 348);
    graphics.lineBetween(320, 348, 336, 352);
  }

  private renderState(state: GameState): void {
    this.beamGraphics.clear();
    this.ambientGraphics.clear();
    this.actorGraphics.clear();
    this.effectGraphics.clear();

    this.drawBeam(state.beamAngle);
    this.drawAmbient(state);
    this.drawEnemies(state);
    this.drawProtection(state);
    this.drawEffects();

  }

  private drawBeam(angle: number): void {
    const graphics = this.beamGraphics;
    this.drawSector(graphics, angle, CONFIG.beamHalfAngle, 560, COLORS.beam, 0.115);
    this.drawSector(graphics, angle, 0.105, 560, 0xffe4a0, 0.09);

    graphics.lineStyle(1, 0xffe4a0, 0.28);
    const edgeOffset = CONFIG.beamHalfAngle;
    for (const edge of [angle - edgeOffset, angle + edgeOffset]) {
      graphics.lineBetween(CENTER, CENTER, CENTER + Math.cos(edge) * 560, CENTER + Math.sin(edge) * 560);
    }
    graphics.lineStyle(1, 0xffe7ae, 0.23);
    graphics.lineBetween(CENTER, CENTER, CENTER + Math.cos(angle) * 560, CENTER + Math.sin(angle) * 560);
  }

  private drawSector(
    graphics: Phaser.GameObjects.Graphics,
    angle: number,
    halfAngle: number,
    radius: number,
    color: number,
    alpha: number,
  ): void {
    const slices = Math.max(8, Math.ceil((halfAngle * 2) / 0.055));
    graphics.fillStyle(color, alpha);
    graphics.beginPath();
    graphics.moveTo(CENTER, CENTER);
    for (let index = 0; index <= slices; index += 1) {
      const edgeAngle = angle - halfAngle + (index / slices) * halfAngle * 2;
      graphics.lineTo(CENTER + Math.cos(edgeAngle) * radius, CENTER + Math.sin(edgeAngle) * radius);
    }
    graphics.closePath();
    graphics.fillPath();
  }

  private drawAmbient(state: GameState): void {
    const graphics = this.ambientGraphics;
    const drift = this.bridge.reducedMotion ? 0 : this.ambientTime;
    const pausedAlpha = state.phase === 'paused' ? 0.65 : 1;

    for (let index = 0; index < 4; index += 1) {
      const baseX = index % 2 === 0 ? 74 + index * 36 : 526 - index * 31;
      const baseY = 152 + index * 111;
      const shift = Math.sin(drift * 0.22 + index * 1.7) * (this.bridge.reducedMotion ? 0 : 18);
      graphics.fillStyle(COLORS.fog, (0.045 + index * 0.006) * pausedAlpha);
      graphics.fillEllipse(baseX + shift, baseY, 160 + index * 18, 42 + index * 6);
    }

    if (!this.bridge.reducedMotion && state.phase !== 'paused') {
      graphics.lineStyle(1, 0xb1c4ba, 0.13);
      const rippleX = 80 + ((drift * 12) % 440);
      const rippleY = 508 + Math.sin(drift * 0.7) * 16;
      graphics.strokeEllipse(rippleX, rippleY, 84, 19);
      graphics.strokeEllipse(rippleX, rippleY, 120, 30);
    }
  }

  private drawEnemies(state: GameState): void {
    const graphics = this.actorGraphics;
    for (const enemy of state.enemies) {
      const x = CENTER + Math.cos(enemy.angle) * enemy.radius;
      const y = CENTER + Math.sin(enemy.angle) * enemy.radius;
      const exposed = Phaser.Math.Clamp(enemy.exposure / CONFIG.exposureSeconds, 0, 1);
      const facing = enemy.angle + Math.PI * 1.5;
      const bob = this.bridge.reducedMotion ? 0 : Math.sin(this.ambientTime * 3 + enemy.id) * 1.4;
      this.drawCreature(graphics, x, y + bob, facing, enemy.id, exposed);
    }
  }

  private drawCreature(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    rotation: number,
    id: number,
    exposure: number,
  ): void {
    const color = mixColor(COLORS.ghost, 0x755348, exposure * 0.55);
    const edge = mixColor(COLORS.ghostEdge, 0xffd990, exposure * 0.72);
    graphics.fillStyle(0x9dd7da, 0.07 + exposure * 0.11);
    graphics.fillCircle(x, y, 22 + exposure * 3);

    const localShape: Point[] = [
      { x: -10, y: 7 }, { x: -13, y: 1 }, { x: -11, y: -5 },
      { x: -16, y: -12 }, { x: -9, y: -10 }, { x: -5, y: -18 },
      { x: 0, y: -12 }, { x: 5, y: -18 }, { x: 9, y: -10 },
      { x: 16, y: -12 }, { x: 11, y: -4 }, { x: 13, y: 2 },
      { x: 9, y: 8 }, { x: 5, y: 5 }, { x: 2, y: 13 },
      { x: -1, y: 7 }, { x: -5, y: 12 }, { x: -7, y: 6 },
    ];
    const worldShape = localShape.map((point) => {
      const rotated = rotatePoint(point.x, point.y, rotation);
      return { x: x + rotated.x, y: y + rotated.y };
    });
    fillPolygon(graphics, worldShape, color, 0.96, edge, 0.82, 1.35);

    // Tapered wisps and paired eyes make each target read as a creature, not a dot.
    graphics.lineStyle(1.4, edge, 0.6);
    for (const side of [-1, 1]) {
      const start = rotatePoint(side * 8, 4, rotation);
      const middle = rotatePoint(side * 13, 8, rotation);
      const tail = rotatePoint(side * 9, 15, rotation);
      graphics.beginPath();
      graphics.moveTo(x + start.x, y + start.y);
      graphics.lineTo(x + middle.x, y + middle.y);
      graphics.lineTo(x + tail.x, y + tail.y);
      graphics.strokePath();
    }

    for (const eyeSide of [-1, 1]) {
      const eye = rotatePoint(eyeSide * 4.2, -4, rotation);
      graphics.fillStyle(COLORS.ghostEye, 0.78 + exposure * 0.22);
      graphics.fillCircle(x + eye.x, y + eye.y, 1.8 + exposure * 0.6);
    }

    const progress = Phaser.Math.Clamp(exposure, 0, 1);
    graphics.lineStyle(1.8, 0xf5d591, 0.2);
    graphics.beginPath();
    graphics.arc(x, y, 21, -Math.PI / 2, -Math.PI / 2 + TAU, false);
    graphics.strokePath();
    if (progress > 0) {
      graphics.lineStyle(2.4, 0xffd991, 0.96);
      graphics.beginPath();
      graphics.arc(x, y, 21, -Math.PI / 2, -Math.PI / 2 + progress * TAU, false);
      graphics.strokePath();
    }

    graphics.fillStyle(0xd6c39e, 0.55);
    const mote = rotatePoint((deterministicUnit(id) - 0.5) * 5, 9, rotation);
    graphics.fillCircle(x + mote.x, y + mote.y, 1.1);
  }

  private drawProtection(state: GameState): void {
    if (state.immunity <= 0) return;
    const graphics = this.actorGraphics;
    const remaining = Phaser.Math.Clamp(state.immunity / CONFIG.immunitySeconds, 0, 1);
    const radius = 39 + (1 - remaining) * 3;
    graphics.lineStyle(2.2, COLORS.shield, 0.35 + remaining * 0.5);
    graphics.beginPath();
    graphics.arc(CENTER, CENTER, radius, -Math.PI / 2, -Math.PI / 2 + remaining * TAU, false);
    graphics.strokePath();
    graphics.lineStyle(1, COLORS.shield, 0.14 + remaining * 0.16);
    graphics.strokeCircle(CENTER, CENTER, 45);
  }

  private advanceEffects(deltaSeconds: number): void {
    for (const effect of this.effects) effect.age += deltaSeconds;
    this.effects = this.effects.filter((effect) => effect.age < effect.duration);
  }

  private addEventEffects(events: GameEvent[]): void {
    for (const event of events) {
      const duration = event.type === 'repel' ? 0.5 : event.type === 'hit' ? 0.62 : 0.42;
      if (this.effects.length >= MAX_EFFECTS) this.effects.shift();
      this.effects.push({ ...event, age: 0, duration });
    }
  }

  private drawEffects(): void {
    const graphics = this.effectGraphics;
    for (const effect of this.effects) {
      const progress = Phaser.Math.Clamp(effect.age / effect.duration, 0, 1);
      const fade = 1 - progress;
      const eventX = CENTER + Math.cos(effect.angle) * effect.radius;
      const eventY = CENTER + Math.sin(effect.angle) * effect.radius;

      if (effect.type === 'repel') {
        const ringRadius = this.bridge.reducedMotion ? 20 : 9 + progress * 22;
        graphics.lineStyle(2, COLORS.lamp, 0.8 * fade);
        graphics.strokeCircle(eventX, eventY, ringRadius);
        for (let spark = 0; spark < 7; spark += 1) {
          const angle = (spark / 7) * TAU + effect.angle;
          const distance = this.bridge.reducedMotion ? 21 : 8 + progress * 29;
          const x = eventX + Math.cos(angle) * distance;
          const y = eventY + Math.sin(angle) * distance;
          graphics.fillStyle(spark % 2 === 0 ? 0xffe5a2 : 0x9de1d8, fade * 0.9);
          graphics.fillCircle(x, y, this.bridge.reducedMotion ? 1.6 : Math.max(0.8, 2.2 * fade));
          graphics.lineStyle(1, 0xffe2a0, fade * 0.7);
          const halfLength = this.bridge.reducedMotion ? 2 : 3;
          graphics.lineBetween(
            x - Math.cos(angle) * halfLength,
            y - Math.sin(angle) * halfLength,
            x + Math.cos(angle) * halfLength,
            y + Math.sin(angle) * halfLength,
          );
        }
      } else {
        const blocked = effect.type === 'blocked';
        const color = blocked ? COLORS.shield : COLORS.impact;
        const x = CENTER + Math.cos(effect.angle) * Math.min(effect.radius, CONFIG.hitRadius);
        const y = CENTER + Math.sin(effect.angle) * Math.min(effect.radius, CONFIG.hitRadius);
        const ringRadius = this.bridge.reducedMotion
          ? blocked ? 42 : 50
          : 18 + progress * (blocked ? 38 : 54);
        graphics.lineStyle(blocked ? 2.4 : 3, color, 0.84 * fade);
        graphics.strokeCircle(CENTER, CENTER, ringRadius);
        graphics.lineStyle(1.2, color, 0.54 * fade);
        graphics.strokeCircle(x, y, this.bridge.reducedMotion ? 14 : 10 + progress * 18);
        graphics.fillStyle(color, 0.14 * fade);
        graphics.fillCircle(CENTER, CENTER, this.bridge.reducedMotion ? 17 : 12 + progress * 10);
      }
    }
  }
}
