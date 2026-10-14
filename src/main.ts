import Phaser from 'phaser';
import './style.css';
import { GameScene } from './GameScene';
import { aim, CONFIG, createState, pause, resume, start, update } from './rules';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const state = createState();
const frame = element('arena-frame');
const startButton = element<HTMLButtonElement>('start');
const pauseButton = element<HTMLButtonElement>('pause');
const restartButton = element<HTMLButtonElement>('restart');
const continueButton = element<HTMLButtonElement>('continue');
const overlay = element('overlay');
const remaining = element('time');
const lives = element('lives');
const score = element('score');
const status = element('status');
let best = 0;
try { best = Math.max(0, Number(localStorage.getItem('beacon-shift-best')) || 0); } catch { /* Storage is optional. */ }
const formatScore = (value: number) => String(value).padStart(3, '0');
element('best').textContent = `BEST ${formatScore(best)}`;
let source: 'pointer' | 'keyboard' = 'pointer';
const pressed = new Set<string>();
let activePointer: number | null = null;
let accumulator = 0;
let discardNextDelta = true;
let previousPhase = state.phase;
let pauseReason = 'Your watch is paused. The sea can wait.';

function clearInput() {
  pressed.clear();
  activePointer = null;
  accumulator = 0;
  discardNextDelta = true;
}

function renderHud() {
  frame.dataset.phase = state.phase;
  remaining.innerHTML = `${Math.ceil(CONFIG.durationSeconds - state.elapsed)}<span>s</span>`;
  lives.textContent = Array.from({ length: 3 }, (_, index) => index < state.lives ? '◆' : '◇').join(' ');
  lives.setAttribute('aria-label', `${state.lives} ${state.lives === 1 ? 'life' : 'lives'}`);
  score.textContent = formatScore(state.score);
  element('progress').style.width = `${state.elapsed / CONFIG.durationSeconds * 100}%`;
  element('protection').hidden = state.immunity <= 0 || state.phase !== 'playing';
  if (previousPhase === state.phase) return;
  previousPhase = state.phase;
  clearInput();
  startButton.hidden = state.phase !== 'ready';
  pauseButton.disabled = state.phase !== 'playing' && state.phase !== 'paused';
  restartButton.disabled = state.phase === 'ready';
  pauseButton.textContent = state.phase === 'paused' ? 'Resume' : 'Pause';
  overlay.hidden = state.phase === 'playing' || state.phase === 'ready';
  if (state.phase === 'playing') {
    status.textContent = 'Keep the fog at bay.';
  } else if (state.phase === 'paused') {
    element('overlay-label').textContent = 'WATCH ON HOLD';
    element('overlay-title').textContent = 'A moment of quiet.';
    element('overlay-copy').textContent = pauseReason;
    continueButton.textContent = 'Resume watch ↗';
    status.textContent = 'Paused. Take your time.';
    continueButton.focus({ preventScroll: true });
  } else if (state.phase === 'won' || state.phase === 'lost') {
    const won = state.phase === 'won';
    element('overlay-label').textContent = won ? 'WATCH COMPLETE' : 'THE LIGHT WENT OUT';
    element('overlay-title').textContent = won ? 'You held the night.' : 'The fog came closer.';
    const repelled = `${state.score / 10} ${state.score === 10 ? 'creature' : 'creatures'} repelled.`;
    element('overlay-copy').textContent = won
      ? `60 seconds. ${repelled} The coast is safe until dawn.`
      : `${state.elapsed.toFixed(1)} seconds held. ${repelled} Light the way again.`;
    continueButton.textContent = 'Another watch ↻';
    status.textContent = won ? 'The lighthouse stands.' : 'A new watch awaits.';
    if (state.score > best) {
      best = state.score;
      try { localStorage.setItem('beacon-shift-best', String(best)); } catch { /* Continue without persistent scores. */ }
      element('best').textContent = `BEST ${formatScore(best)}`;
    }
    continueButton.focus({ preventScroll: true });
  }
}

const scene = new GameScene({
  state,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  ready: () => {
    startButton.disabled = false;
    startButton.textContent = 'Begin watch ↗';
  },
  tick: (delta) => {
    if (discardNextDelta) { delta = 0; discardNextDelta = false; }
    const events = [];
    if (state.phase === 'playing') {
      accumulator += Math.min(.1, delta);
      while (accumulator >= 1 / 60 && state.phase === 'playing') {
        if (source === 'keyboard') {
          const left = pressed.has('arrowleft') || pressed.has('a');
          const right = pressed.has('arrowright') || pressed.has('d');
          aim(state, state.beamAngle + (Number(right) - Number(left)) * 2.5 / 60);
        }
        events.push(...update(state, 1 / 60));
        accumulator -= 1 / 60;
      }
    }
    renderHud();
    return events;
  },
});

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'arena',
  width: CONFIG.arenaSize,
  height: CONFIG.arenaSize,
  backgroundColor: '#0a2531',
  scene: [scene],
  audio: { noAudio: true },
  banner: false,
  autoFocus: false,
  input: { keyboard: false, mouse: false, touch: false },
  fps: { target: 60, smoothStep: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});

function begin() {
  clearInput();
  scene.clearEffects();
  source = 'pointer';
  start(state);
  renderHud();
  frame.focus({ preventScroll: true });
}
function hold(reason = 'Your watch is paused. The sea can wait.') {
  if (state.phase !== 'playing') return;
  pauseReason = reason;
  pause(state);
  renderHud();
}
function continueWatch() {
  if (state.phase !== 'paused') return;
  clearInput();
  resume(state);
  renderHud();
  frame.focus({ preventScroll: true });
}
function bindAction(button: HTMLButtonElement, action: () => void) {
  let touchId: number | null = null;
  let lastTouch = -Infinity;
  button.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && !button.disabled) touchId = event.pointerId;
    else if (event.pointerType !== 'touch') lastTouch = -Infinity;
  });
  button.addEventListener('pointercancel', () => { touchId = null; });
  button.addEventListener('pointerup', event => {
    if (event.pointerType !== 'touch' || event.pointerId !== touchId || button.disabled) return;
    touchId = null;
    const bounds = button.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    // Some touch browsers omit the compatibility click after a canvas drag/rotation.
    lastTouch = performance.now();
    action();
  });
  button.addEventListener('click', event => {
    if (event.detail > 0 && performance.now() - lastTouch < 700) return;
    action();
  });
}
bindAction(startButton, begin);
bindAction(restartButton, begin);
bindAction(pauseButton, () => state.phase === 'paused' ? continueWatch() : hold());
bindAction(continueButton, () => state.phase === 'paused' ? continueWatch() : begin());

function point(event: PointerEvent) {
  if (state.phase !== 'playing' || !(event.target instanceof HTMLCanvasElement)) return;
  if (event.pointerType !== 'mouse' && event.pointerId !== activePointer) return;
  const bounds = event.target.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width * CONFIG.arenaSize - CONFIG.center;
  const y = (event.clientY - bounds.top) / bounds.height * CONFIG.arenaSize - CONFIG.center;
  if (x * x + y * y < 4) return;
  source = 'pointer';
  pressed.clear();
  aim(state, Math.atan2(y, x));
}
frame.addEventListener('pointerdown', (event) => {
  if (!(event.target instanceof HTMLCanvasElement) || state.phase !== 'playing') return;
  event.preventDefault();
  frame.focus({ preventScroll: true });
  activePointer = event.pointerId;
  event.target.setPointerCapture(event.pointerId);
  point(event);
});
frame.addEventListener('pointermove', point);
const releasePointer = (event: PointerEvent) => { if (event.pointerId === activePointer) activePointer = null; };
frame.addEventListener('pointerup', releasePointer);
frame.addEventListener('pointercancel', releasePointer);
frame.addEventListener('lostpointercapture', releasePointer);
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (key === 'escape' || key === 'p') {
    if (event.repeat) return;
    if (state.phase === 'playing') hold(); else if (state.phase === 'paused') continueWatch();
    return;
  }
  if (state.phase !== 'playing' || document.activeElement !== frame || !['a', 'd', 'arrowleft', 'arrowright'].includes(key)) return;
  event.preventDefault();
  source = 'keyboard';
  pressed.add(key);
});
window.addEventListener('keyup', (event) => pressed.delete(event.key.toLowerCase()));
frame.addEventListener('focusout', () => pressed.clear());
window.addEventListener('blur', () => { hold('You left the outpost. Resume when you are ready.'); clearInput(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hold('You left the outpost. Resume when you are ready.'); clearInput(); }
});
new ResizeObserver(() => scene.scale?.refresh()).observe(element('arena'));

// Read-only observations for browser QA. Available only when explicitly requested in the URL.
if (new URLSearchParams(location.search).has('qa')) {
  Object.defineProperty(window, 'beaconSnapshot', {
    value: () => JSON.parse(JSON.stringify({ ...state, inputSource: source, pressed: [...pressed] })),
    writable: false,
  });
}
