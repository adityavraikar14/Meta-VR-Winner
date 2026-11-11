import { type Camera, Raycaster, Vector2, Vector3 } from '@iwsdk/core';
import { driveEmulator } from './level-tester.js';

/**
 * Laptop testing with the mouse (dev builds only), instead of dragging the
 * emulator's hand gizmos. Shift+M (or the Level Tester's button) turns it on.
 *
 *   Move the mouse        the right hand follows the cursor, at a set distance from your eyes
 *   Mouse wheel           nearer to / farther from your eyes; the lantern is just behind them,
 *                         so nearer casts a bigger shadow and farther a smaller one
 *   Hold the right button pinch (draw ink, grab, press)
 *   Hold Shift            move the left hand instead
 *   Keys 1–9 (Shift: left) set the hand's shape, as before (dev-tools.ts)
 *
 * Left-drag still turns your head (the emulator's own control).
 */

const KEY = 'shadowplay.mouseHands';
const MIN_DEPTH = 0.15;
const MAX_DEPTH = 0.8;
const STEP = 0.02;

let on = (() => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();
let depth = 0.42;
let side: 'left' | 'right' = 'right';
let hud: HTMLDivElement | null = null;

export function mouseHandsOn(): boolean {
  return on;
}

export function setMouseHands(value: boolean): void {
  on = value;
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    // Not remembered; it still works this session.
  }
  paintHud();
}

function paintHud(): void {
  if (!hud) return;
  hud.hidden = !on;
  hud.textContent = `🖱 Mouse moves the ${side} hand · ${Math.round(depth * 100)} cm from your eyes · wheel: nearer/farther · hold right button: pinch · Shift: other hand · Shift+M: off`;
}

export function installMouseHands(canvas: HTMLCanvasElement, camera: () => Camera): void {
  if (!import.meta.env.DEV) return;
  hud = document.createElement('div');
  hud.style.cssText =
    'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483002;max-width:min(92vw,900px);' +
    'padding:8px 14px;border-radius:999px;background:rgba(27,35,64,0.88);color:#fff1c9;font:13px/1.35 system-ui,sans-serif;' +
    'pointer-events:none;text-align:center';
  document.body.appendChild(hud);
  paintHud();

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const at = new Vector3();
  let last: { x: number; y: number } | null = null;

  const place = () => {
    if (!on || !last) return;
    const rect = canvas.getBoundingClientRect();
    if (last.x < rect.left || last.x > rect.right || last.y < rect.top || last.y > rect.bottom) return;
    ndc.set(((last.x - rect.left) / rect.width) * 2 - 1, -((last.y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera());
    at.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, depth);
    driveEmulator((device) => {
      device.hands?.[side]?.position.set(at.x, at.y, at.z);
    });
  };

  const onMove = (event: PointerEvent) => {
    if (!on) return;
    const next = event.shiftKey ? 'left' : 'right';
    if (next !== side) {
      side = next;
      paintHud();
    }
    last = { x: event.clientX, y: event.clientY };
    place();
  };
  const onWheel = (event: WheelEvent) => {
    if (!on) return;
    event.preventDefault();
    event.stopPropagation();
    depth = Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, depth + (event.deltaY > 0 ? STEP : -STEP)));
    paintHud();
    place();
  };
  const pinch = (value: number) => (event: PointerEvent) => {
    if (!on || event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    driveEmulator((device) => device.hands?.[side]?.updatePinchValue?.(value));
  };
  const down = pinch(1);
  const up = pinch(0);
  const noMenu = (event: MouseEvent) => {
    if (on) event.preventDefault();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.shiftKey && event.key.toLowerCase() === 'm') setMouseHands(!on);
  };
  // Capture on the window: the emulator layers its own controls over the canvas.
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('contextmenu', noMenu, true);
  window.addEventListener('keydown', onKey);
  // A hand that moves with the head (left-drag) keeps its place under the cursor.
  setInterval(place, 100);
}
