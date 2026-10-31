/**
 * Development-only buttons and live readout for the Arsenal level. Every
 * button fires the same events a real gesture would, so everything after
 * recognition gets tested the same way. Not shown in production builds.
 */

export type DebugCommand =
  | 'arm'
  | 'sword'
  | 'spear'
  | 'ball'
  | 'wall'
  | 'throw'
  | 'clear'
  | 'recenter';

export interface DebugApi {
  command(command: DebugCommand): void;
  /** Multi-line status text, refreshed a few times a second. */
  readout(): string;
}

const BUTTONS: Array<{ command: DebugCommand; label: string; key: string }> = [
  { command: 'arm', label: '✋ Arm', key: '1' },
  { command: 'sword', label: '🗡️ Sword', key: '2' },
  { command: 'spear', label: '🔱 Spear', key: '3' },
  { command: 'ball', label: '🔮 Ball', key: '4' },
  { command: 'wall', label: '🧱 Wall', key: '5' },
  { command: 'throw', label: '➶ Throw', key: 't' },
  { command: 'clear', label: '✖ Clear', key: 'c' },
  { command: 'recenter', label: '⟳ Recenter', key: 'r' },
];

const STYLE = `
#arsenal-debug {
  position: fixed; left: 12px; top: 12px; z-index: 2147483000; width: 300px;
  padding: 10px; border-radius: 10px; box-sizing: border-box;
  font: 12px/1.35 ui-monospace, Consolas, monospace; color: #e6f3ff;
  background: rgba(8, 14, 28, 0.85); border: 1px solid #2c4870;
}
#arsenal-debug h2 { margin: 0 0 8px; font: 600 13px system-ui, sans-serif; display: flex; justify-content: space-between; }
#arsenal-debug h2 button { all: unset; cursor: pointer; color: #8fb6e8; }
#arsenal-debug .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
#arsenal-debug .grid button {
  padding: 7px 2px; border-radius: 6px; border: 1px solid #3b6aa8; cursor: pointer;
  background: #16294a; color: #e6f3ff; font: 12px system-ui, sans-serif;
}
#arsenal-debug .grid button:hover { background: #22406f; }
#arsenal-debug .grid button kbd { display: block; opacity: 0.55; font-size: 10px; }
#arsenal-debug pre { margin: 8px 0 0; white-space: pre-wrap; max-height: 40vh; overflow: auto; }
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
  title.textContent = 'Gesture debug';
  const toggle = document.createElement('button');
  toggle.textContent = 'hide';
  toggle.addEventListener('click', () => {
    const collapsed = panel.toggleAttribute('data-collapsed');
    toggle.textContent = collapsed ? 'show' : 'hide';
  });
  title.appendChild(toggle);

  const body = document.createElement('div');
  body.className = 'body';
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const { command, label, key } of BUTTONS) {
    const button = document.createElement('button');
    button.innerHTML = `${label}<kbd>${key.toUpperCase()}</kbd>`;
    button.addEventListener('click', () => api.command(command));
    grid.appendChild(button);
  }
  const readout = document.createElement('pre');
  body.append(grid, readout);
  panel.append(title, body);
  document.body.appendChild(panel);

  const onKey = (event: KeyboardEvent) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const match = BUTTONS.find((b) => b.key === event.key.toLowerCase());
    if (match) api.command(match.command);
  };
  window.addEventListener('keydown', onKey);
  const timer = window.setInterval(() => {
    readout.textContent = api.readout();
  }, 200);

  return () => {
    window.clearInterval(timer);
    window.removeEventListener('keydown', onKey);
    panel.remove();
    style.remove();
  };
}
