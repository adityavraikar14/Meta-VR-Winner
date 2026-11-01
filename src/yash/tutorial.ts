/**
 * The guided tutorial: one move at a time, each shown by translucent ghost
 * hands rather than a wall of text, moving on by itself once the player has
 * done it. The sentinel stays calm except on the blocking step.
 *
 * Steps only watch for events the level already produces, so adding a move
 * (the blaster, later) is one more entry in STEPS.
 */
import { Group, Vector3 } from '@iwsdk/core';
import type { ArsenalEvent } from './arsenal.js';
import type { GestureEvent, Item } from './gestures.js';
import { HandState } from './hands.js';
import { sfx } from './sfx.js';
import { HandSkeleton, SimHands, SimMove, SimPose } from './sim-hands.js';
import { Label } from './visuals.js';

export type TutorialEvent = GestureEvent | ArsenalEvent;

interface Step {
  /** Short instruction. */
  text: string;
  /** How to do it, in signs. */
  hint: string;
  /** Ghost hands cycle through these poses, repeating `move` if given; null hides them. */
  demo: { poses: SimPose[]; move?: SimMove } | null;
  done(event: TutorialEvent): boolean;
  /** The sentinel fires at the player during this step. */
  orbs?: boolean;
}

const summoned = (item: Item) => (e: TutorialEvent) => e.type === 'summon' && e.item === item;

const STEPS: Step[] = [
  {
    text: 'Hold an invisible ball',
    hint: '🤲 Palms facing each other, hands apart. Hold still.',
    demo: { poses: ['arm'] },
    done: (e) => e.type === 'armed',
  },
  {
    text: 'Summon a sword',
    hint: '🤲 Hold a ball, then ✊ make a fist',
    demo: { poses: ['arm', 'sword'] },
    done: summoned('sword'),
  },
  {
    text: 'Swing it, fast!',
    hint: '↘️ A quick slash through the air',
    demo: { poses: ['sword'], move: 'swing' },
    done: (e) => e.type === 'swing' && e.item === 'sword',
  },
  {
    text: 'Summon a spear',
    hint: '🤲 Hold a ball, then ✊✊ one fist above the other',
    demo: { poses: ['arm', 'spear'] },
    done: summoned('spear'),
  },
  {
    text: 'Throw the spear',
    hint: '🫸 Push forward and open your hands',
    demo: { poses: ['spear'], move: 'push' },
    done: (e) => e.type === 'launch' && e.item === 'spear',
  },
  {
    text: 'Summon a power ball',
    hint: '🤲 Hold a ball, then 🫴 turn your palm up',
    demo: { poses: ['arm', 'ball'] },
    done: summoned('ball'),
  },
  {
    text: 'Throw the ball',
    hint: '🫸 Push your palm forward, fast',
    demo: { poses: ['ball'], move: 'push' },
    done: (e) => e.type === 'launch' && e.item === 'ball',
  },
  {
    text: 'Raise a wall',
    hint: '🤲 Hold a ball, then 🙌 push both palms forward',
    demo: { poses: ['arm', 'wall'] },
    done: summoned('wall'),
  },
  {
    text: 'Block the orb with your wall',
    hint: 'Stay behind it. Wall gone? 🤲 then 🙌 again',
    demo: null,
    done: (e) => e.type === 'blocked',
    orbs: true,
  },
];

/** Seconds each demo pose is shown, and between demo moves. */
const DEMO_HOLD = 1.3;
const DEMO_MOVE_EVERY = 1.8;
/** "✓ Nice!" shows this long before the next step. */
const SUCCESS_TIME = 1.1;
/** The closing message shows this long. */
const FINISH_TIME = 3.5;
/** On the blocking step, an orb comes this often. */
const ORB_EVERY = 4;
/** Instructions float this far ahead of and above the eyes: about 20° up, clear of the sentinel's label. */
const TEXT_AHEAD = 0.8;
const TEXT_RISE = 0.3;
/** Ghost hands sit up and to the left, out of the way of the player's own hands. */
const GHOST_LEFT = 0.3;
const GHOST_RISE = 0.26;
const GHOST_AHEAD = 0.25;

export class Tutorial {
  readonly root = new Group();
  active = false;
  /** Index into STEPS, or STEPS.length once finished. */
  index = 0;

  private title = new Label(0.065);
  private hint = new Label(0.045);
  private ghost = new SimHands();
  private ghostHands: Record<'left' | 'right', HandState> = {
    left: new HandState('left'),
    right: new HandState('right'),
  };
  private skeletons = { left: new HandSkeleton(0x7fc8ff), right: new HandSkeleton(0x7fc8ff) };
  private successLeft = 0;
  private finishLeft = 0;
  private demoTime = 0;
  private moveTimer = 0;
  private orbTimer = 0;
  private origin = new Vector3();
  private up = new Vector3(0, 1, 0);

  constructor() {
    this.root.name = 'Tutorial';
    this.root.visible = false;
    this.root.add(this.title.sprite, this.hint.sprite, this.skeletons.left.root, this.skeletons.right.root);
  }

  get stepCount(): number {
    return STEPS.length;
  }

  /** True while the sentinel should keep quiet (everything but the blocking step). */
  get calm(): boolean {
    return this.active && !(STEPS[this.index]?.orbs ?? false);
  }

  start(): void {
    this.active = true;
    this.enter(0);
  }

  stop(): void {
    this.active = false;
    this.root.visible = false;
  }

  /** Test panel: skip to the next step. */
  skip(): void {
    if (this.active) this.enter(this.index + 1);
  }

  /** Feed every gesture and arsenal event here. */
  notify(event: TutorialEvent): void {
    if (!this.active || this.successLeft > 0 || this.index >= STEPS.length) return;
    if (!STEPS[this.index].done(event)) return;
    this.successLeft = SUCCESS_TIME;
    this.title.set('✓ Nice!', '#9dffb0');
    sfx.success();
  }

  /** `fireOrb` makes the sentinel attack once (used on the blocking step). */
  update(dt: number, time: number, head: Vector3, forward: Vector3, fireOrb: () => void): void {
    this.root.visible = this.active;
    if (!this.active) return;

    if (this.index >= STEPS.length) {
      this.finishLeft -= dt;
      if (this.finishLeft <= 0) this.stop();
    } else if (this.successLeft > 0) {
      this.successLeft -= dt;
      if (this.successLeft <= 0) this.enter(this.index + 1);
    }

    const right = this.origin.set(-forward.z, 0, forward.x);
    const step = STEPS[this.index];
    this.title.sprite.position.copy(head).addScaledVector(forward, TEXT_AHEAD).addScaledVector(this.up, TEXT_RISE);
    this.hint.sprite.position.copy(this.title.sprite.position).addScaledVector(this.up, -0.07);

    // Ghost hands: cycle the demo poses, repeating the demo move.
    const demo = step && this.successLeft <= 0 ? step.demo : null;
    for (const side of ['left', 'right'] as const) this.skeletons[side].root.visible = demo !== null;
    if (demo) {
      this.demoTime += dt;
      const pose = demo.poses[Math.floor(this.demoTime / DEMO_HOLD) % demo.poses.length];
      if (pose !== this.ghost.pose || !this.ghost.active) this.ghost.setPose(pose);
      if (demo.move) {
        this.moveTimer -= dt;
        if (this.moveTimer <= 0) {
          this.ghost.startMove(demo.move);
          this.moveTimer = DEMO_MOVE_EVERY;
        }
      }
      const ghostOrigin = right.multiplyScalar(-GHOST_LEFT).add(head).addScaledVector(this.up, GHOST_RISE).addScaledVector(forward, GHOST_AHEAD);
      this.ghost.apply(dt, time, ghostOrigin, forward, this.ghostHands);
      for (const side of ['left', 'right'] as const) this.skeletons[side].update(this.ghostHands[side]);
    }

    if (step?.orbs && this.successLeft <= 0) {
      this.orbTimer -= dt;
      if (this.orbTimer <= 0) {
        fireOrb();
        this.orbTimer = ORB_EVERY;
      }
    }
  }

  private enter(index: number): void {
    this.index = Math.min(index, STEPS.length);
    this.successLeft = 0;
    this.demoTime = 0;
    this.moveTimer = 0.6;
    this.orbTimer = 1.5;
    this.ghost.release();
    if (this.index >= STEPS.length) {
      this.title.set('🎉 Tutorial complete!', '#ffe27a');
      this.hint.set('Free play: the sentinel fights back now', '#bfe0ff');
      this.finishLeft = FINISH_TIME;
      for (const side of ['left', 'right'] as const) this.skeletons[side].root.visible = false;
      sfx.defeated();
      return;
    }
    const step = STEPS[this.index];
    this.title.set(`${this.index + 1}/${STEPS.length} · ${step.text}`);
    this.hint.set(step.hint, '#bfe0ff');
  }
}
