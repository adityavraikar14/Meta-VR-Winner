import type { Object3D, Vector3 } from '@iwsdk/core';
import { isMuted, playClick, playPrompt, setMuted } from './audio.js';
import { play, totalStars } from './progress.js';
import { PushButton } from './push-button.js';
import { stage } from './stage-state.js';
import { PUZZLES, WORLDS } from './world/puzzles.js';

/**
 * The game's menus, shown on the shadow screen with a row of physical push
 * buttons in front of it: Home (play, chapters, settings), a chapter
 * picker with stars and locks, and settings.
 */
export type MenuPage = 'home' | 'chapters' | 'settings';

/** What the menu asks the game to do. */
export type MenuAction = { do: 'play' } | { do: 'chapter'; index: number } | { do: 'table' };

type Draw = (kicker: string, title: string, body: string, footer?: string) => void;

interface Slot {
  label: string;
  run: () => MenuAction | null;
  /** Enter / Space presses this one on a desktop. */
  primary?: boolean;
}

/** Button rows in paper space: just in front of the screen, within easy reach. */
const ROW_Y = -0.06;
const ROW_Z = 0.62;
/** Menu buttons are a little smaller than the big title button, so four fit in a row. */
const BUTTON_SCALE = 0.8;
const LAYOUTS: Record<number, number[]> = {
  3: [-0.17, 0, 0.17],
  4: [-0.25, -0.083, 0.083, 0.25],
};

export class MainMenu {
  page: MenuPage | null = null;
  private readonly buttons: PushButton[] = [];
  private slots: Slot[] = [];
  private chapter = 0;

  constructor(
    private readonly parent: Object3D,
    /** The viewer's eyes in paper space, for turning buttons to face them. */
    private readonly viewer: Vector3,
    private readonly draw: Draw,
  ) {
    for (let i = 0; i < 4; i++) {
      const button = new PushButton(parent, '');
      button.show(false);
      this.buttons.push(button);
    }
  }

  /** Visible buttons, for the desktop mouse fallback. */
  get roots(): Object3D[] {
    return this.buttons.filter((b) => b.visible).map((b) => b.root);
  }

  open(page: MenuPage): void {
    if (page === 'chapters' && this.page !== 'chapters') this.chapter = worldOf(resumeIndex());
    this.page = page;
    this.layout();
  }

  close(): void {
    this.page = null;
    stage.previewWorld = null;
    for (const button of this.buttons) button.show(false);
  }

  /**
   * Run the buttons for one frame. `clicked` is the index of a root the
   * mouse hit (or -1); `enter` presses the primary button.
   */
  update(dt: number, tips: readonly Vector3[], clicked: number, enter: boolean): MenuAction | null {
    let action: MenuAction | null = null;
    let pressed = -1;
    const roots = this.roots;
    this.buttons.forEach((button, i) => {
      const slot = this.slots[i];
      const ray = slot !== undefined && this.page !== null &&
        ((clicked >= 0 && roots[clicked] === button.root) || (enter && slot.primary === true));
      if (button.update(dt, tips, ray) && pressed < 0) pressed = i;
    });
    if (pressed >= 0 && this.page !== null) {
      playClick();
      action = this.slots[pressed].run();
    }
    return action;
  }

  private layout(): void {
    this.slots = this.page === 'home' ? this.home() : this.page === 'chapters' ? this.chapters() : this.settings();
    const xs = LAYOUTS[this.slots.length];
    const eye = this.parent.localToWorld(this.viewer.clone());
    this.buttons.forEach((button, i) => {
      const slot = this.slots[i];
      if (!slot) {
        button.show(false);
        return;
      }
      button.setText(slot.label);
      button.root.position.set(xs[i], ROW_Y, ROW_Z);
      button.size = BUTTON_SCALE;
      button.root.lookAt(eye);
      button.show(true);
    });
  }

  // ----------------------------------------------------------------- Pages

  private home(): Slot[] {
    stage.previewWorld = null;
    const resume = resumeIndex();
    const fresh = resume === 0 && totalStars() === 0;
    const next = PUZZLES[resume];
    const body = fresh
      ? 'Trapped inside an old shadow theatre, your hands are your only tool. Their shadows come alive.'
      : next
        ? `${WORLDS[next.world].name}  ·  Next: ${next.title}`
        : 'Every chapter played. Pick any chapter to play again.';
    const footer = fresh ? 'Hands only  ·  Play seated  ·  About 10 minutes a chapter' : `${totalStars()} ★ collected`;
    this.draw('Escape the Lantern', 'Shadowplay', body, footer);
    return [
      { label: 'Chapters', run: () => this.go('chapters') },
      { label: fresh ? 'Play' : next ? 'Continue' : 'Replay', run: () => ({ do: 'play' }), primary: true },
      { label: 'Settings', run: () => this.go('settings') },
    ];
  }

  private chapters(): Slot[] {
    const w = this.chapter;
    stage.previewWorld = w;
    const levels = PUZZLES.map((p, index) => ({ p, index })).filter(({ p }) => p.world === w);
    const open = unlocked(w);
    const done = levels.filter(({ p }) => (play.stars[p.id] ?? 0) > 0).length;
    const stars = levels.reduce((sum, { p }) => sum + (play.stars[p.id] ?? 0), 0);
    const nextLevel = levels.find(({ p }) => !(play.stars[p.id] > 0)) ?? levels[0];
    const body = open
      ? `${done} of ${levels.length} levels played  ·  ${stars} of ${levels.length * 3} ★  ·  ${done < levels.length ? `Next: ${nextLevel.p.title}` : 'Play starts from the beginning'}`
      : `Locked. Finish ${WORLDS[w - 1]?.name ?? 'the chapter before'} to open the way here.`;
    this.draw(`Chapter ${w + 1} of ${WORLDS.length}`, WORLDS[w].name, body, open ? 'Push Play to start here' : '');
    const step = (d: number) => () => {
      this.chapter = (this.chapter + d + WORLDS.length) % WORLDS.length;
      this.layout();
      return null;
    };
    return [
      { label: 'Back', run: () => this.go('home') },
      { label: 'Prev', run: step(-1) },
      {
        label: open ? 'Play' : 'Locked',
        primary: true,
        run: () => {
          if (!open) {
            playPrompt();
            return null;
          }
          const start = done < levels.length ? nextLevel.index : levels[0].index;
          return { do: 'chapter', index: start };
        },
      },
      { label: 'Next', run: step(1) },
    ];
  }

  private settings(): Slot[] {
    stage.previewWorld = null;
    const table = stage.tableHeight !== null ? 'found' : 'not set (world floats)';
    this.draw(
      'Shadowplay',
      'Settings',
      `Sound: ${isMuted() ? 'off' : 'on'}  ·  Table: ${table}`,
      'During play, look at your open palm for the quick menu',
    );
    return [
      { label: 'Back', run: () => this.go('home'), primary: true },
      {
        label: isMuted() ? 'Sound on' : 'Mute',
        run: () => {
          setMuted(!isMuted());
          this.layout();
          return null;
        },
      },
      { label: 'Table', run: () => ({ do: 'table' }) },
      {
        label: 'Recenter',
        run: () => {
          stage.command = 'recenter';
          return null;
        },
      },
    ];
  }

  private go(page: MenuPage): null {
    this.open(page);
    return null;
  }
}

/** Where the story picks up: the saved level, or the end once everything is played. */
export function resumeIndex(): number {
  return play.puzzleIndex < 0 ? PUZZLES.length : play.puzzleIndex;
}

function worldOf(index: number): number {
  return PUZZLES[Math.min(index, PUZZLES.length - 1)]?.world ?? 0;
}

/** A chapter opens once the player has reached its first level. */
function unlocked(world: number): boolean {
  const first = PUZZLES.findIndex((p) => p.world === world);
  if (first <= 0) return true;
  let furthest = resumeIndex();
  PUZZLES.forEach((p, i) => {
    if ((play.stars[p.id] ?? 0) > 0) furthest = Math.max(furthest, i + 1);
  });
  return first <= furthest;
}
