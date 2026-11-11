import type { Object3D, Vector3 } from '@iwsdk/core';
import { isMuted, playClick, playPrompt, playTinkle, playUnfold, setMuted } from './audio.js';
import { craft, needsText, RECIPES } from './bag.js';
import { JOURNAL, pagesFilled } from './journal.js';
import { TROPHIES, trophiesEarned } from './trophies.js';
import { play, totalStars } from './progress.js';
import { PushButton } from './push-button.js';
import { stage } from './stage-state.js';
import { PUZZLES, WORLDS } from './world/puzzles.js';

/**
 * The game's menus, shown on the shadow screen with a row of physical push
 * buttons in front of it: Home (play, chapters, settings), a chapter
 * picker with stars and locks, and settings.
 */
export type MenuPage = 'home' | 'chapters' | 'settings' | 'credits' | 'bag' | 'battles' | 'journal';

/** What the menu asks the game to do. */
export type MenuAction = { do: 'play' } | { do: 'chapter'; index: number } | { do: 'table' } | { do: 'duel' } | { do: 'arena' };

type Draw = (kicker: string, title: string, body: string, footer?: string) => void;

/** Title that asks the screen to paint the inventory grid (the kicker carries its message). */
export const INVENTORY = '\u0000inventory';
/** Title that asks the screen to paint a journal page (the kicker carries its index). */
export const JOURNAL_PAGE = '\u0000journal';

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
  5: [-0.3, -0.15, 0, 0.15, 0.3],
  6: [-0.325, -0.195, -0.065, 0.065, 0.195, 0.325],
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
    for (let i = 0; i < 6; i++) {
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
    // The journal opens at the newest story page you have earned.
    if (page === 'journal' && this.page !== 'journal') {
      const earned = JOURNAL.map((p, i) => (play.journal[p.id] && p.id !== 'duel' ? i : -1)).filter((i) => i >= 0);
      this.journalPage = earned.length ? earned[earned.length - 1] : 0;
    }
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
    this.slots = this.page === 'home'
      ? this.home()
      : this.page === 'chapters'
        ? this.chapters()
        : this.page === 'credits'
          ? this.credits()
          : this.page === 'bag'
            ? this.bag()
            : this.page === 'battles'
              ? this.battles()
              : this.page === 'journal'
                ? this.journal()
                : this.settings();
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
      { label: 'Journal', run: () => this.go('journal') },
      { label: 'Bag', run: () => this.go('bag') },
      { label: 'Battles', run: () => this.go('battles') },
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
      { label: 'Credits', run: () => this.go('credits') },
      {
        label: 'Recenter',
        run: () => {
          stage.command = 'recenter';
          return null;
        },
      },
    ];
  }

  private crafted = '';

  /** What you have gathered, what you carry, and the recipes. */
  private bag(): Slot[] {
    this.draw(this.crafted, INVENTORY, '');
    this.crafted = '';
    return [
      { label: 'Back', run: () => this.go('home'), primary: true },
      ...RECIPES.map((recipe) => ({
        label: recipe.label,
        run: () => {
          if (craft(recipe)) {
            playTinkle();
            this.crafted = `Made a ${recipe.name}: ${recipe.does}`;
          } else {
            playPrompt();
            this.crafted = `${recipe.name} needs ${needsText(recipe)}`;
          }
          this.layout();
          return null;
        },
      })),
    ];
  }

  private battles(): Slot[] {
    this.draw('Side games', 'Battles', 'Ink Duel: draw in the air and throw your drawings at Morwen, the Ink Witch.  ·  Arena: the Arsenal\u2019s seven weapons against a sentinel, the dragon and Morwen.', 'Bring draughts, wards and sun shards from your bag');
    return [
      { label: 'Back', run: () => this.go('home'), primary: true },
      { label: 'Duel', run: () => ({ do: 'duel' }) },
      { label: 'Arena', run: () => ({ do: 'arena' }) },
    ];
  }

  private journalPage = 0;

  /** Turn the open Journal by `d` pages (dev keys ← →); the Trophy Shelf is the last spread. */
  turnJournal(d: number): void {
    if (this.page !== 'journal') return;
    const n = JOURNAL.length + 1;
    this.journalPage = (this.journalPage + d + n) % n;
    playUnfold();
    this.layout();
  }

  /** The Inventor's Journal: a page of real science per level, with your own numbers. */
  private journal(): Slot[] {
    // Every page, then the Trophy Shelf as the last spread.
    const n = JOURNAL.length + 1;
    const shelf = this.journalPage >= JOURNAL.length;
    const page = JOURNAL[Math.min(this.journalPage, JOURNAL.length - 1)];
    this.draw(
      String(this.journalPage),
      JOURNAL_PAGE,
      shelf ? `${trophiesEarned()} of ${TROPHIES.length} trophies` : `${pagesFilled()} of ${JOURNAL.length} pages filled`,
    );
    const step = (d: number) => () => {
      this.journalPage = (this.journalPage + d + n) % n;
      playUnfold();
      this.layout();
      return null;
    };
    const index = PUZZLES.findIndex((p) => p.id === (page.replay ?? page.id));
    const earned = !shelf && play.journal[page.id] !== undefined;
    return [
      { label: 'Back', run: () => this.go('home'), primary: true },
      { label: 'Prev', run: step(-1) },
      {
        label: shelf ? 'Trophies' : earned ? 'Replay' : 'Locked',
        run: () => {
          if (!earned) {
            playPrompt();
            return null;
          }
          return index < 0 ? { do: 'duel' } : { do: 'chapter', index };
        },
      },
      { label: 'Next', run: step(1) },
    ];
  }

  private creditPage = 0;

  private credits(): Slot[] {
    const n = CREDITS.length;
    const [title, body] = CREDITS[this.creditPage];
    this.draw(`Credits · ${this.creditPage + 1} of ${n}`, title, body, '');
    const step = (d: number) => () => {
      this.creditPage = (this.creditPage + d + n) % n;
      this.layout();
      return null;
    };
    return [
      { label: 'Back', run: () => this.go('settings'), primary: true },
      { label: 'Prev', run: step(-1) },
      { label: 'Next', run: step(1) },
    ];
  }

  private go(page: MenuPage): null {
    this.open(page);
    return null;
  }
}

/** Who made what (full list with links in CREDITS.md). */
const CREDITS: Array<[string, string]> = [
  ['The Dragon, the Phoenix, the Witch', 'European Dragon by Regina Cachoa · phoenix bird by NORBERTO-3D · Witch by LxNazarov (Sketchfab, CC BY 4.0)'],
  ['Animals', 'Elk by WildMesh 3D · Fox by pxltiger (Sketchfab, CC BY 4.0) · Horse by Quaternius (CC0)'],
  ['Music', 'Kevin MacLeod (incompetech.com), CC BY 4.0: Our Story Begins · Equatorial Complex · Morning · Tabuk · Final Battle of the Dark Wizards · Heroic Age · Call to Adventure'],
  ['The World', 'Plants, rocks, textures and the daylight sky: Poly Haven (CC0) · Leaves: ambientCG (CC0)'],
  ['The Arena', 'The Arsenal, a hand-sign fight with sword, spear, power ball, wall and blaster, by Yash Ammanavar'],
  ['Made With', 'Meta Immersive Web SDK and three.js · Machines, forge, brewing, sounds and shadows made in code'],
]

/** Where the story picks up: the saved level, or the end once everything is played. */
export function resumeIndex(): number {
  return play.puzzleIndex < 0 ? PUZZLES.length : play.puzzleIndex;
}

function worldOf(index: number): number {
  return PUZZLES[Math.min(index, PUZZLES.length - 1)]?.world ?? 0;
}

/**
 * Every chapter is open, so any level can be played straight away (Yash's
 * call, for anyone short of time). Continue still follows the story in order.
 */
function unlocked(_world: number): boolean {
  return true;
}
