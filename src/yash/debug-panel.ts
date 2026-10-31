/**
 * Development-only test panel for the Arsenal level. Sign buttons pose the
 * simulated hands, so every summon goes through the real recognizer: hold a
 * ball to arm, then make an item's sign. Move buttons drive the hands for
 * throws and cuts. Recipes list each sequence and can play it. Not shown in
 * production builds.
 */
import { Item, ITEM_LABELS, ITEMS, RECIPES, SIGN_LABELS } from './gestures.js';
import type { SimMove, SimPose } from './sim-hands.js';

export type DebugCommand =
  | { type: 'pose'; pose: SimPose }
  | { type: 'move'; move: SimMove }
  | { type: 'recipe'; item: Item }
  | { type: 'handsOff' }
  | { type: 'clear' }
  | { type: 'recenter' }
  | { type: 'toggleReadout' };

export interface DebugApi {
  command(command: DebugCommand): void;
  /** Multi-line status text, refreshed a few times a second. */
  readout(): string;
  /** The simulated pose shown as selected, or null when sim hands are off. */
  activePose(): SimPose | null;
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
  { label: '🖐️ Relaxed', key: '6', command: { type: 'pose', pose: 'relaxed' }, pose: 'relaxed' },
];

const MOVE_BUTTONS: ButtonSpec[] = [
  { label: '👉 Push / throw', key: 't', command: { type: 'move', move: 'push' } },
  { label: '↘️ Swing', key: 'g', command: { type: 'move', move: 'swing' } },
  { label: '🚫 Hands off', key: '0', command: { type: 'handsOff' } },
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
  tip.textContent = 'Then: Push / throw launches a ball or spear, Swing cuts orbs with a sword or spear.';
  body.appendChild(tip);

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
  }, 150);

  return () => {
    window.clearInterval(timer);
    window.removeEventListener('keydown', onKey);
    panel.remove();
    style.remove();
  };
}
