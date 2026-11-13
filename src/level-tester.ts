import { mouseHandsOn, setMouseHands } from './mouse-hands.js';
import { stage } from './stage-state.js';

/**
 * A level tester for playing without a headset (dev builds only): a small
 * panel on the page listing every chapter and level. Click a level to jump
 * straight into it; each one shows its controls and the keys that do what
 * a hand would. Toggle the panel with Shift+L or its own button.
 *
 * It also sets the emulator up for this game: hands, not controllers (the
 * game is played with bare hands), and a seated view of the whole diorama.
 * Shift+V, or the view buttons, move the emulated head between a few seats.
 */

/** Emulator head poses: name, position (m) and pitch (degrees, down is negative). */
const VIEWS: { name: string; at: [number, number, number]; pitch: number }[] = [
  { name: 'Seat', at: [0, 1.6, 0], pitch: -18 },
  { name: 'Close', at: [0, 1.45, -0.22], pitch: -30 },
  { name: 'Top', at: [0, 1.95, -0.5], pitch: -75 },
  { name: 'Wide', at: [0, 1.75, 0.4], pitch: -20 },
];

interface EmulatedHandInput {
  position: { set(x: number, y: number, z: number): unknown };
  updatePinchValue?(value: number): void;
}

export interface EmulatedDevice {
  hands?: { left?: EmulatedHandInput; right?: EmulatedHandInput };
  position: { set(x: number, y: number, z: number): unknown };
  quaternion: { set(x: number, y: number, z: number, w: number): unknown };
  primaryInputMode: 'controller' | 'hand';
  /**
   * In 'manual' mode the emulator's own panels drive the device every frame;
   * in 'programmatic' mode they follow it, picking up changes on notifyStateChange.
   */
  controlMode?: 'manual' | 'programmatic';
  notifyStateChange?(): void;
}

/** The emulated headset the dev server injects (the one its own controls drive). */
export function emulatedDevice(): EmulatedDevice | null {
  const injected = (window as unknown as { IWER_DEVICE?: EmulatedDevice }).IWER_DEVICE;
  if (injected) return injected;
  const xr = navigator.xr as unknown as Record<symbol, { device?: EmulatedDevice }> | undefined;
  if (!xr) return null;
  const key = Object.getOwnPropertySymbols(xr).find((s) => s.description === '@iwer/xr-system');
  return (key && xr[key].device) || null;
}

/** Change the emulated device so its panels keep the change instead of restoring their own state. */
export function driveEmulator(change: (device: EmulatedDevice) => void): void {
  const device = emulatedDevice();
  if (!device) return;
  const manual = device.controlMode === 'manual';
  if (manual) device.controlMode = 'programmatic';
  change(device);
  device.notifyStateChange?.();
  if (manual) device.controlMode = 'manual';
}

let view = 0;

function setView(index: number): void {
  view = (index + VIEWS.length) % VIEWS.length;
  const { at, pitch } = VIEWS[view];
  const half = (pitch * Math.PI) / 360;
  driveEmulator((device) => {
    device.position.set(at[0], at[1], at[2]);
    device.quaternion.set(Math.sin(half), 0, 0, Math.cos(half));
  });
  console.log(`SHADOWPLAY tester view=${VIEWS[view].name}`);
}

function useHands(): void {
  if (emulatedDevice()?.primaryInputMode === 'hand') return;
  driveEmulator((device) => {
    device.primaryInputMode = 'hand';
  });
}

export interface TesterLevel {
  index: number;
  id: string;
  chapter: string;
  title: string;
  kind: string;
}

export interface TesterApi {
  levels(): TesterLevel[];
  current(): string;
  go(index: number): void;
  /** Key presses that act as a hand would in this level. */
  help(id: string): string;
  status(): string;
}

/** What each kind of level is played with, without a headset. */
const KEYS: Record<string, string> = {
  friend: 'B big friend · V small friend (as if your hand made the shadow)',
  walk: 'Your hand’s shadow is the bridge: place the emulated hand over the gap (or press N to skip)',
  warmup: 'Raise the emulated hand in front of you, or press N to skip',
  'smithy': 'F does the next smithing step: light, pump, heat, anvil, strike, quench',
  'healing-draught': '[ herbs in · ] lower the pot · ; raise it · / steep fully · ’ fill the vials',
  'strong-draught': '[ herbs in · ] lower the pot · ; raise it · / steep fully · ’ fill the vials',
  'broken-bridge': 'L lay a strong truss · M lay a weak square one · W an X-braced one · T test · U undo',
  'ore-train': 'L lay the basic truss (it will buckle!) · W lay an X-braced one (it holds) · T test · U undo',
  'sky-lantern': '[ light the burner · ] cup a hand under the flame (press again to take it away: too hot scorches the paper) · ; a gust now · / fan it back',
  'shadow-slingshot': '[ the slingshot comes alive (as if you held a V) · ] a perfect shot at the next target',
  'sword-training': '[ the blade comes alive (as if you held a flat hand) · ] a perfect block, parry or cut of the next strike',
  'gate-lock': '[ hold gentle tension (press again to let go) · ] set the binding pin · ; overset it · ’ release the lever (resets)',
  'shadow-dragon': 'First choose: [ Light · ] the Arsenal. Light: [ gather light · ] throw it. Either: ; dragon breathes · ’ dragon dives',
  duel: '[ draw ink · ] throw it · \' a drawing comes alive · ; rival throws · / rival special · + next phase · ` your super · - a herb · . win · , lose'
};

export function levelKeys(id: string, kind: string): string {
  if (id.startsWith('run-')) {
    return 'Shift+M: the mouse moves your hand (wheel: nearer/farther = bigger/smaller shadow) · [ drop the spark now · ] toggle a test shadow that solves the level';
  }
  return KEYS[id] ?? (id.startsWith('fight-') ? KEYS.duel : undefined) ?? KEYS[kind] ?? 'N to skip';
}

export function installLevelTester(api: TesterApi): void {
  if (!import.meta.env.DEV) return;
  const style = document.createElement('style');
  style.textContent = `
  #sp-tester { position: fixed; right: 12px; top: 12px; z-index: 2147483001; width: 320px; max-height: calc(100vh - 24px);
    overflow: auto; font: 13px/1.35 Georgia, serif; color: #ffe9c4; background: rgba(28, 16, 10, 0.94);
    border: 2px solid #c99a4c; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
  #sp-tester header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px;
    background: linear-gradient(#4a2c16, #2e1a0c); border-bottom: 1px solid #6b4424; position: sticky; top: 0; }
  #sp-tester header b { font-size: 15px; color: #f3d28a; }
  #sp-tester button { font: 600 12px Georgia, serif; cursor: pointer; border-radius: 8px; border: 1px solid #c99a4c;
    background: #3a2414; color: #ffe9c4; padding: 4px 8px; }
  #sp-tester button:hover { background: #5a3a1e; }
  #sp-tester .body { padding: 8px 10px 12px; }
  #sp-tester h4 { margin: 10px 0 4px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #d9a96a; }
  #sp-tester .lv { display: flex; width: 100%; text-align: left; gap: 8px; margin: 3px 0; padding: 6px 8px; }
  #sp-tester .lv span { color: #c9a57a; min-width: 18px; }
  #sp-tester .lv.on { background: #7a4a1c; border-color: #ffd27a; }
  #sp-tester .help { margin-top: 10px; padding: 8px; border-radius: 8px; background: rgba(255, 210, 140, 0.08); color: #f3e6c8; }
  #sp-tester .status { margin-top: 6px; color: #9aa3b0; font-size: 11px; }
  #sp-tester .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
  #sp-tester .row b { font-size: 12px; color: #d9a96a; margin-right: 2px; }
  #sp-tester .row button.on { background: #7a4a1c; border-color: #ffd27a; }
  #sp-tester.closed .body { display: none; }`;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'sp-tester';
  panel.className = 'closed';
  const header = document.createElement('header');
  header.innerHTML = '<b>Level Tester</b>';
  const toggle = document.createElement('button');
  toggle.textContent = 'Open';
  header.appendChild(toggle);
  const body = document.createElement('div');
  body.className = 'body';
  panel.append(header, body);
  document.body.appendChild(panel);

  const render = () => {
    body.innerHTML = '';
    const intro = document.createElement('div');
    intro.className = 'help';
    intro.textContent = 'Enter VR in the emulator first (Enter on the start screen), then pick a level, or use Page Down / Page Up to step through them (Home: first, End: the dragon). Mouse-drag looks around; Shift+V changes the view; Shift+M lets the mouse move a hand (wheel: nearer/farther, hold the right button to pinch).';
    body.appendChild(intro);
    // Where the emulated head sits, and hands (the game has no controller input).
    const views = document.createElement('div');
    views.className = 'row';
    views.innerHTML = '<b>View</b>';
    VIEWS.forEach((v, i) => {
      const b = document.createElement('button');
      b.textContent = v.name;
      if (i === view) b.className = 'on';
      b.onclick = () => {
        setView(i);
        render();
      };
      views.appendChild(b);
    });
    const mouse = document.createElement('button');
    mouse.textContent = mouseHandsOn() ? '🖱 Mouse hands: on' : '🖱 Mouse hands';
    if (mouseHandsOn()) mouse.className = 'on';
    mouse.title = 'Shift+M. The mouse moves a hand; wheel: nearer/farther; hold the right button to pinch; Shift: left hand.';
    mouse.onclick = () => {
      setMouseHands(!mouseHandsOn());
      render();
    };
    views.appendChild(mouse);
    const device = emulatedDevice();
    if (device && device.primaryInputMode !== 'hand') {
      const hands = document.createElement('button');
      hands.textContent = 'Use hands';
      hands.title = 'The emulator is in controller mode; this game is played with bare hands.';
      hands.onclick = () => {
        useHands();
        render();
      };
      views.appendChild(hands);
    }
    body.appendChild(views);
    let chapter = '';
    const current = api.current();
    for (const level of api.levels()) {
      if (level.chapter !== chapter) {
        chapter = level.chapter;
        const h = document.createElement('h4');
        h.textContent = chapter;
        body.appendChild(h);
      }
      const b = document.createElement('button');
      b.className = `lv${level.id === current ? ' on' : ''}`;
      b.innerHTML = `<span>${level.index < 1000 ? level.index + 1 : '⚔'}</span>${level.title}`;
      b.onclick = () => {
        api.go(level.index);
        setTimeout(render, 300);
      };
      body.appendChild(b);
    }
    const level = api.levels().find((l) => l.id === current);
    if (level) {
      const help = document.createElement('div');
      help.className = 'help';
      help.innerHTML = `<b>${level.title}</b><br>${api.help(level.id)}`;
      body.appendChild(help);
    }
    const status = document.createElement('div');
    status.className = 'status';
    status.textContent = api.status();
    body.appendChild(status);
  };

  toggle.onclick = () => {
    panel.classList.toggle('closed');
    toggle.textContent = panel.classList.contains('closed') ? 'Open' : 'Close';
    render();
  };
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'l' && e.shiftKey) toggle.click();
    if (e.key.toLowerCase() === 'v' && e.shiftKey) {
      setView(view + 1);
      if (!panel.classList.contains('closed')) render();
      return;
    }
    // Page Down / Page Up step through the levels; Home is the first, End the dragon.
    const story = api.levels().filter((l) => l.index < 1000);
    const at = story.findIndex((l) => l.id === api.current());
    const to = { PageDown: at + 1, PageUp: at - 1, Home: 0, End: story.length - 1 }[e.key];
    if (to === undefined) return;
    const level = story[Math.max(0, Math.min(story.length - 1, to))];
    api.go(level.index);
    console.log(`SHADOWPLAY tester go=${level.id}`);
  });
  // Keep the highlighted level and status fresh while open.
  setInterval(() => {
    if (!panel.classList.contains('closed')) {
      const on = body.querySelector('.lv.on');
      if (!on || !on.textContent?.includes(api.levels().find((l) => l.id === api.current())?.title ?? '\u0000')) render();
      const status = body.querySelector('.status');
      if (status) status.textContent = api.status();
    }
  }, 1000);
  // Start every load in hand mode, seated, looking at the whole diorama.
  const settle = (tries: number) => {
    if (emulatedDevice()) {
      useHands();
      setView(0);
    } else if (tries > 0) setTimeout(() => settle(tries - 1), 250);
  };
  settle(40);
  void stage;
}
