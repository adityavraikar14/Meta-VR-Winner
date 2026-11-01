/**
 * Development-only test panel for the Arsenal level. Sign buttons pose the
 * simulated hands, so every summon goes through the real recognizer: hold a
 * ball to arm, then make an item's sign. Move buttons drive the hands for
 * throws and cuts. Recipes list each sequence and can play it. Not shown in
 * production builds.
 */
import { Item, ITEM_LABELS, ITEMS, RECIPES, SIGN_LABELS } from './gestures.js';
import type { SimMove, SimPose } from './sim-hands.js';
import type { WebcamHands } from './webcam-hands.js';

export type DebugCommand =
  | { type: 'pose'; pose: SimPose }
  | { type: 'move'; move: SimMove }
  | { type: 'recipe'; item: Item }
  | { type: 'handsOff' }
  | { type: 'clear' }
  | { type: 'recenter' }
  | { type: 'toggleReadout' }
  | { type: 'webcam'; cameraId?: string }
  | { type: 'swapHands' }
  | { type: 'tutorial' }
  | { type: 'skipStep' };

export interface DebugApi {
  command(command: DebugCommand): void;
  /** Multi-line status text, refreshed a few times a second. */
  readout(): string;
  /** The simulated pose shown as selected, or null when sim hands are off. */
  activePose(): SimPose | null;
  /** Webcam hand tracking, for its status, preview and camera list. */
  webcam: WebcamHands;
}

interface ButtonSpec {
  label: string;
  key: string;
  command: DebugCommand;
  pose?: SimPose;
}

const SIGN_BUTTONS: ButtonSpec[] = [
  { label: SIGN_LABELS.arm, key: '1', command: { type: 'pose', pose: 'arm' }, pose: 'arm' },
  { label: SIGN_LABELS.sword, key: '2', command: { type: 'pose', pose: 'sword' }, pose: 'sword' },
  { label: SIGN_LABELS.spear, key: '3', command: { type: 'pose', pose: 'spear' }, pose: 'spear' },
  { label: SIGN_LABELS.ball, key: '4', command: { type: 'pose', pose: 'ball' }, pose: 'ball' },
  { label: SIGN_LABELS.wall, key: '5', command: { type: 'pose', pose: 'wall' }, pose: 'wall' },
  { label: SIGN_LABELS.gun, key: '7', command: { type: 'pose', pose: 'gun' }, pose: 'gun' },
  { label: '🖐️ Relaxed', key: '6', command: { type: 'pose', pose: 'relaxed' }, pose: 'relaxed' },
];

const MOVE_BUTTONS: ButtonSpec[] = [
  { label: '🫸 Push / throw', key: 't', command: { type: 'move', move: 'push' } },
  { label: '↘️ Swing', key: 'g', command: { type: 'move', move: 'swing' } },
  { label: '💥 Shoot (thumb drop)', key: 'f', command: { type: 'move', move: 'shoot' } },
  { label: '🚫 Hands off', key: '0', command: { type: 'handsOff' } },
];

const WEBCAM_BUTTONS: ButtonSpec[] = [
  { label: '📷 Webcam on/off', key: 'y', command: { type: 'webcam' } },
  { label: '⇄ Swap left/right', key: 'u', command: { type: 'swapHands' } },
];

const TUTORIAL_BUTTONS: ButtonSpec[] = [
  { label: '🎓 Tutorial start/stop', key: 'j', command: { type: 'tutorial' } },
  { label: '⏭ Skip step', key: 'k', command: { type: 'skipStep' } },
];

const UTILITY_BUTTONS: ButtonSpec[] = [
  { label: '✖ Clear', key: 'c', command: { type: 'clear' } },
  { label: '⟳ Recenter', key: 'r', command: { type: 'recenter' } },
  { label: '👓 Headset readout', key: 'h', command: { type: 'toggleReadout' } },
];

const STYLE = `
#arsenal-debug {
  position: fixed; left: 12px; top: 12px; z-index: 2147483000; width: 340px;
  max-height: calc(100vh - 24px); overflow: auto;
  padding: 10px; border-radius: 10px; box-sizing: border-box;
  font: 12px/1.35 system-ui, sans-serif; color: #e6f3ff;
  background: rgba(8, 14, 28, 0.88); border: 1px solid #2c4870;
}
#arsenal-debug h2 { margin: 0 0 6px; font-size: 13px; display: flex; justify-content: space-between; }
#arsenal-debug h2 button { all: unset; cursor: pointer; color: #8fb6e8; font-weight: 400; }
#arsenal-debug h3 { margin: 10px 0 5px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #8fb6e8; }
#arsenal-debug .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
#arsenal-debug button.b {
  padding: 6px 3px; border-radius: 6px; border: 1px solid #3b6aa8; cursor: pointer;
  background: #16294a; color: #e6f3ff; font: 12px system-ui, sans-serif; line-height: 1.25;
}
#arsenal-debug button.b:hover { background: #22406f; }
#arsenal-debug button.b[data-on] { background: #2f5d9c; border-color: #9fd0ff; }
#arsenal-debug button.b kbd { display: block; opacity: 0.55; font-size: 10px; }
#arsenal-debug .recipe { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-top: 1px solid #1d3354; }
#arsenal-debug .recipe span { flex: 1; }
#arsenal-debug .recipe b { display: inline-block; min-width: 92px; }
#arsenal-debug .recipe button.b { padding: 3px 8px; }
#arsenal-debug pre { margin: 8px 0 0; font: 11px/1.35 ui-monospace, Consolas, monospace; white-space: pre-wrap; }
#arsenal-debug[data-collapsed] .body { display: none; }
#arsenal-debug .cam { display: none; margin-top: 6px; }
#arsenal-debug .cam[data-on] { display: block; }
#arsenal-debug .cam video { width: 100%; border-radius: 6px; transform: scaleX(-1); background: #000; }
#arsenal-debug .cam select { width: 100%; margin-top: 4px; background: #16294a; color: #e6f3ff; border: 1px solid #3b6aa8; border-radius: 6px; padding: 4px; }
#arsenal-debug .status { margin-top: 4px; color: #8fb6e0; }
`;

/** Mounts the panel; returns a function that removes it. */
export function mountDebugPanel(api: DebugApi): () => void {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'arsenal-debug';
  const title = document.createElement('h2');
  title.textContent = 'Arsenal test panel';
  const toggle = document.createElement('button');
  toggle.textContent = 'hide';
  toggle.addEventListener('click', () => {
    const collapsed = panel.toggleAttribute('data-collapsed');
    toggle.textContent = collapsed ? 'show' : 'hide';
  });
  title.appendChild(toggle);
  const body = document.createElement('div');
  body.className = 'body';

  const keyed: ButtonSpec[] = [];
  const poseButtons = new Map<SimPose, HTMLButtonElement>();
  const button = (spec: ButtonSpec): HTMLButtonElement => {
    const el = document.createElement('button');
    el.className = 'b';
    el.innerHTML = `${spec.label}<kbd>${spec.key.toUpperCase()}</kbd>`;
    el.addEventListener('click', () => api.command(spec.command));
    keyed.push(spec);
    if (spec.pose) poseButtons.set(spec.pose, el);
    return el;
  };
  const section = (heading: string, specs: ButtonSpec[]) => {
    const h = document.createElement('h3');
    h.textContent = heading;
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const spec of specs) grid.appendChild(button(spec));
    body.append(h, grid);
  };

  section('Tutorial', TUTORIAL_BUTTONS);
  section('Hand signs (held until changed)', SIGN_BUTTONS);
  section('Moves', MOVE_BUTTONS);

  const recipesHeading = document.createElement('h3');
  recipesHeading.textContent = 'Recipes';
  body.appendChild(recipesHeading);
  for (const item of ITEMS) {
    const row = document.createElement('div');
    row.className = 'recipe';
    const text = document.createElement('span');
    text.innerHTML = `<b>${ITEM_LABELS[item]}</b>${RECIPES[item].map((s) => SIGN_LABELS[s]).join(' → ')}`;
    const play = document.createElement('button');
    play.className = 'b';
    play.textContent = '▶';
    play.title = 'Play this recipe with the simulated hands';
    play.addEventListener('click', () => api.command({ type: 'recipe', item }));
    row.append(text, play);
    body.appendChild(row);
  }
  const tip = document.createElement('div');
  tip.style.cssText = 'margin-top:4px;color:#8fb6e0';
  tip.textContent =
    'Then: Push / throw launches a ball or spear, Swing cuts orbs with a sword or spear, Shoot fires the blaster (aim with the index finger).';
  body.appendChild(tip);

  // Webcam: real fingers from a camera, for testing without a headset.
  section('Webcam hands (real fingers, no headset)', WEBCAM_BUTTONS);
  const status = document.createElement('div');
  status.className = 'status';
  const cam = document.createElement('div');
  cam.className = 'cam';
  const picker = document.createElement('select');
  picker.title = 'Camera (a phone used as a webcam shows up here too)';
  picker.addEventListener('change', () => api.command({ type: 'webcam', cameraId: picker.value }));
  cam.append(api.webcam.video, picker);
  body.append(status, cam);
  let listed = false;
  const refreshCameras = async () => {
    const cameras = await api.webcam.cameras();
    const current = picker.value;
    picker.replaceChildren(
      ...cameras.map((c) => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.label;
        return option;
      }),
    );
    if (current) picker.value = current;
  };

  section('Level', UTILITY_BUTTONS);
  const readout = document.createElement('pre');
  body.appendChild(readout);
  panel.append(title, body);
  document.body.appendChild(panel);

  const onKey = (event: KeyboardEvent) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const match = keyed.find((b) => b.key === event.key.toLowerCase());
    if (match) api.command(match.command);
  };
  window.addEventListener('keydown', onKey);
  const timer = window.setInterval(() => {
    readout.textContent = api.readout();
    const active = api.activePose();
    for (const [pose, el] of poseButtons) el.toggleAttribute('data-on', pose === active);
    const webcam = api.webcam;
    cam.toggleAttribute('data-on', webcam.on);
    status.textContent =
      webcam.status === 'off'
        ? 'Uses your webcam, or a phone set up as a webcam. Loads Google MediaPipe from the internet the first time.'
        : `Camera: ${webcam.status}${webcam.active ? ` · hands seen ${webcam.visible()}` : ''}`;
    if (webcam.active && !listed) {
      listed = true;
      void refreshCameras();
    }
  }, 150);

  return () => {
    window.clearInterval(timer);
    window.removeEventListener('keydown', onKey);
    panel.remove();
    style.remove();
  };
}
