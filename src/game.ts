import { fitFont, font, roundRect as themeRoundRect, UI } from './ui-theme.js';
import {
  CanvasTexture,
  Color,
  createSystem,
  type Entity,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Pressed,
  Raycaster,
  Vector2,
  RayInteractable,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import {
  playAwaken,
  playClick,
  playGrow,
  playPrompt,
  playTinkle,
  setMusic,
  tickMusic,
} from './audio.js';
import { add as addResource, RESOURCE_ORDER } from './bag.js';
import { diagnoseDragon } from './fight/dragon3d.js';
import { installLevelTester, levelKeys } from './level-tester.js';
import { drawInventory } from './inventory-art.js';
import { drawJournal } from './journal-art.js';
import { installMouseHands } from './mouse-hands.js';
import { awardTrophies, trophyLine } from './trophies.js';
import { friendRunLines, JOURNAL, noteRun, pagesFilled } from './journal.js';
import { devActions, devInfo, installDevTools } from './dev-tools.js';
import { type GhostFocus, GhostHand } from './ghost-hand.js';
import {
  createExtension,
  fingersUp,
  readExtension,
  scorePair,
  scoreShape,
  type Finger,
  type PairRule,
  type ShapeRule,
  type ShapeScore,
} from './hand-pose.js';
import {
  HINT_DELAY,
  type Level,
  LEVELS,
  MATCH_HOLD,
  MATCH_THRESHOLD,
} from './levels.js';
import {
  copyBounds,
  createBounds,
  decodeCells,
  encodeCells,
  GRID,
  GRID_CELLS,
  type MaskBounds,
  MaskChannel,
  normalizeMask,
} from './matcher.js';
import { IntroShow } from './intro.js';
import { INVENTORY, JOURNAL_PAGE, MainMenu, type MenuAction, resumeIndex } from './menu.js';
import { PushButton } from './push-button.js';
import { ShadowWorld } from './shadow-world.js';
import { installWebcamPanel } from './webcam.js';
import { TableFinder } from './table.js';
import { loadProgress, play, resetProgress, saveProgress, totalStars } from './progress.js';
import {
  MASK_HEIGHT,
  MASK_WIDTH,
  PAPER_HEIGHT,
  PAPER_WIDTH,
  stage,
} from './stage-state.js';
import { DAILY_INDEX, DUEL, DUEL_INDEX, friendName, isSideGame, refreshWorkshop, WORKSHOP_INDEX, type Puzzle, PUZZLES, puzzleAt, WORLDS } from './world/puzzles.js';

type Phase = 'table' | 'growing' | 'title' | 'intro' | 'story' | 'matching' | 'awakening' | 'solving' | 'oops' | 'cleared' | 'arena';
type Problem =
  | Finger
  | 'direction'
  | 'thumbs'
  | 'spread'
  | 'twoHands'
  | 'offPaper'
  | 'noShadow'
  | null;

const OUTLINE_SIZE = 0.4;
/**
 * Shadow size (metres on the paper) that makes a normal-sized friend. Real
 * optics sets the shadow: magnification = lantern-to-paper ÷ lantern-to-hand,
 * so a hand near the lantern casts a big shadow and a big friend.
 */
const SHADOW_FOR_NORMAL = 0.38;
const BODY_SIZES: [number, number] = [0.7, 1.45];

function bodySizeFromShadow(shadow: number): number {
  return Math.min(BODY_SIZES[1], Math.max(BODY_SIZES[0], shadow / SHADOW_FOR_NORMAL));
}

/** Height or width of a shadow on the paper, whichever is larger, in metres. */
function shadowSpan(b: MaskBounds): number {
  const bw = ((b.maxX - b.minX + 1) / MASK_WIDTH) * PAPER_WIDTH;
  const bh = ((b.maxY - b.minY + 1) / MASK_HEIGHT) * PAPER_HEIGHT;
  return Math.max(bw, bh);
}

function sizeWord(size: number): string {
  if (size >= 1.32) return 'A huge ';
  if (size >= 1.12) return 'A big ';
  if (size <= 0.85) return 'A little ';
  return 'The ';
}
const SHADOW_OPACITY = 0.88;
const AWAKEN_SHIVER = 0.45;
const AWAKEN_DURATION = 1.8;
/** Seconds the story card stays up before play starts. */
const STORY_TIME = 4.5;
/** Seconds with no hand seen before the banner says how to bring them back. */
const HANDS_HINT_AFTER = 2.5;
/** Seconds the jungle takes to grow before the title appears. */
const GROW_TIME = 2.6;
/** Seconds the stars card stays up after a level. */
const CLEAR_TIME = 5;
/** Seconds to read why the wrong friend could not help. */
const OOPS_TIME = 3.2;
/** Seconds the first shadow must stay on the paper in the warm-up. */
const WARMUP_HOLD = 1.2;
/** Solve within this many seconds of choosing for the speed star. */
const FAST_TIME = 20;
/** Hands-on jobs take longer; finishing under this earns the speed star. */
const HANDS_ON_FAST = 150;
const CARD_SIZE = 0.11;
const CARD_GAP = 0.125;
/** Cards line the top of the paper; the bottom is hidden behind the stage. */
const CARD_Y = PAPER_HEIGHT / 2 - 0.075;
const RING_STEPS = 40;
/** The title screen's Play button, in paper space: low and within easy reach. */
const PLAY_BUTTON = new Vector3(0, -0.05, 0.64);
/** The Skip button, off to the right of the paper and clear of the hands-on machines. */
const SKIP_BUTTON = new Vector3(0.42, 0.02, 0.6);
const SKIP_SIZE = 0.75;
/** Phases in which a level is under way and can be skipped. */
const SKIPPABLE: ReadonlySet<Phase> = new Set(['story', 'matching', 'awakening', 'solving', 'oops']);
const VIEWER = new Vector3(0, 0.12, 1.0);
const INDEX_TIP = 9;
const THUMB_TIP = 4;

const DIM_OUTLINE = new Color(0x9a7442);
const HOT_OUTLINE = new Color(0xffc34d);
/** The target shape: a cream line warming to gold as your shadow nears it, over a dark glow. */
const TARGET_DIM = new Color(0xfff1c9);
const TARGET_HOT = new Color(0xffa41c);
const TARGET_HALO = 0x1b2340;

const DEV = import.meta.env.DEV;
const HAND_CHANNELS = [MaskChannel.Left, MaskChannel.Right] as const;

interface Card {
  mesh: Mesh;
  material: MeshBasicMaterial;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
}

function levelFor(kind: string): Level {
  return LEVELS.find((level) => level.id === kind) ?? LEVELS[0];
}

/**
 * Runs the story: each puzzle shows a story card, asks for a friend, judges
 * the player's hand shapes against the friends allowed, releases the
 * matched shadow as a creature that tries the puzzle, and awards stars.
 */
export class ShadowGameSystem extends createSystem({
  rayPressed: { required: [RayInteractable, Pressed] },
}) {
  private phase: Phase = 'story';
  private phaseTime = 0;
  private puzzleIndex = 0;
  /** The story's place, kept while a side game (the duel, the Daily Light) is on. */
  private storyIndex = 0;
  private puzzle: Puzzle | null = null;
  /** Shapes the player may make right now. */
  private candidates: Level[] = [];
  private raw: number[] = [];
  private smooth: number[] = [];
  private candidateShadow: boolean[] = [];
  private candidateBounds: MaskBounds[] = [];
  private candidateProblem: Problem[] = [];
  private best = -1;
  private chosen: Level = LEVELS[0];

  private hintShown = false;
  private wrongTries = 0;
  private matchTime = 0;

  /** The best hand's shadow this frame, for capture. */
  private shadow = new Uint8Array(GRID_CELLS);
  private candidate = new Uint8Array(GRID_CELLS);
  private scratchBounds = createBounds();
  private handShadow = [false, false];
  private handBounds = [createBounds(), createBounds()];
  private seenMaskVersion = -1;

  private extension = createExtension();
  private extensionRight = createExtension();
  private pairShadow = false;
  private pairBounds = createBounds();
  private shapeScore: ShapeScore = { score: 0, worst: null };
  private handScores = [0, 0];
  // Results of the last judgeSingle / judgePair call.
  private rawScore = 0;
  private problem: Problem = null;
  private hasShadow = false;
  private bounds = createBounds();

  private holdTime = 0;
  private struggleTime = 0;
  private needsRelease = false;

  private outline!: Mesh;
  private outlineMaterial!: MeshBasicMaterial;
  private outlineCanvas!: HTMLCanvasElement;
  private haloCanvas!: HTMLCanvasElement;
  private haloTexture!: CanvasTexture;
  private haloMaterial!: MeshBasicMaterial;
  private outlineTexture!: CanvasTexture;
  private cards: Card[] = [];
  private ring!: Mesh;
  private ringCanvas!: HTMLCanvasElement;
  private ringTexture!: CanvasTexture;
  private ringDrawn = -1;
  private banner!: Mesh;
  private bannerMaterial!: MeshBasicMaterial;
  private bannerCanvas!: HTMLCanvasElement;
  private bannerTexture!: CanvasTexture;
  private bannerShown = false;
  private creature!: Mesh;
  private creatureMaterial!: MeshBasicMaterial;
  private creatureCanvas!: HTMLCanvasElement;
  private creatureTexture!: CanvasTexture;
  private captionCanvas!: HTMLCanvasElement;
  private captionTexture!: CanvasTexture;
  private caption = '';

  private ghost!: GhostHand;
  private leftHanded = false;
  private playButton!: PushButton;
  /** Always-there Skip while a level is on, so any level can be passed over. */
  private skipButton!: PushButton;
  private skipEntity!: Entity;
  private skipClick = false;
  private buttonEntity!: Entity;
  private intro!: IntroShow;
  private table!: TableFinder;
  private menu!: MainMenu;
  /** Index of the menu button the mouse clicked this frame, or -1. */
  private menuClick = -1;
  /** Enter / Space pressed this frame with no other button to take it. */
  private enterPressed = false;
  /** The banner text the game asked for, the hands prompt shown over it, and how long hands have been gone. */
  private wantedCaption = '';
  private handsHint: string | null = null;
  private handsGone = 0;
  private headAt = new Vector3();
  private shadowWorld!: ShadowWorld;
  private introLine: string | null = null;
  /** A brand-new story: Play shows the opening show first. */
  private fresh = false;
  private walkCleared = false;
  private walkClearAt = 0;
  /** A ray press landed on the button since the last frame (presses can be shorter than a frame). */
  private rayClick = false;
  private tips = [new Vector3(), new Vector3()];
  private thumb = new Vector3();
  private pinch = new Vector3();
  private liveTips: Vector3[] = [];

  private creatureX = 0;
  private creatureY = 0;
  private creatureSize = OUTLINE_SIZE;
  /** Body size of the friend about to be born, from its shadow's size. */
  private bodySize = 1;
  private welcomed = false;

  init(): void {
    const paper = stage.paper;
    if (!paper) throw new Error('ShadowStageSystem must be registered first');

    this.outlineCanvas = makeCanvas(256, 256);
    this.outlineTexture = makeTexture(this.outlineCanvas);
    this.outlineMaterial = new MeshBasicMaterial({
      map: this.outlineTexture,
      transparent: true,
      depthWrite: false,
      color: TARGET_DIM.clone(),
      opacity: 0.95,
    });
    this.outline = new Mesh(new PlaneGeometry(1, 1), this.outlineMaterial);
    this.outline.name = 'TargetOutline';
    this.outline.scale.setScalar(OUTLINE_SIZE);
    this.outline.position.set(0, 0.02, 0.002);
    this.outline.renderOrder = 2;
    paper.add(this.outline);
    // A dark glow under the line, so it reads on light paper and over the player's own shadow.
    this.haloCanvas = makeCanvas(256, 256);
    this.haloTexture = makeTexture(this.haloCanvas);
    this.haloMaterial = new MeshBasicMaterial({ map: this.haloTexture, transparent: true, depthWrite: false, color: TARGET_HALO, opacity: 0.5 });
    const halo = new Mesh(this.outline.geometry, this.haloMaterial);
    halo.position.z = -0.001;
    halo.renderOrder = 1;
    this.outline.add(halo);

    for (let i = 0; i < LEVELS.length; i++) {
      const canvas = makeCanvas(128, 160);
      const texture = makeTexture(canvas);
      const material = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        color: DIM_OUTLINE.clone(),
      });
      const mesh = new Mesh(new PlaneGeometry(CARD_SIZE, CARD_SIZE * 1.25), material);
      mesh.name = 'FriendCard';
      mesh.renderOrder = 1;
      mesh.visible = false;
      paper.add(mesh);
      this.cards.push({ mesh, material, canvas, texture });
    }

    this.ringCanvas = makeCanvas(256, 256);
    this.ringTexture = makeTexture(this.ringCanvas);
    this.ring = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: this.ringTexture, transparent: true, depthWrite: false }),
    );
    this.ring.name = 'HoldRing';
    this.ring.renderOrder = 2;
    this.ring.visible = false;
    paper.add(this.ring);

    this.bannerCanvas = makeCanvas(1024, 512);
    this.bannerTexture = makeTexture(this.bannerCanvas);
    this.bannerMaterial = new MeshBasicMaterial({
      map: this.bannerTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    this.banner = new Mesh(new PlaneGeometry(0.8, 0.4), this.bannerMaterial);
    this.banner.name = 'StoryCard';
    this.banner.position.set(0, 0.03, 0.006);
    this.banner.renderOrder = 4;
    paper.add(this.banner);

    this.creatureCanvas = makeCanvas(256, 256);
    this.creatureTexture = makeTexture(this.creatureCanvas);
    this.creatureMaterial = new MeshBasicMaterial({
      map: this.creatureTexture,
      transparent: true,
      depthWrite: false,
      color: 0x140b05,
    });
    this.creature = new Mesh(new PlaneGeometry(1, 1), this.creatureMaterial);
    this.creature.name = 'ShadowCreature';
    this.creature.position.z = 0.005;
    this.creature.renderOrder = 3;
    this.creature.visible = false;
    paper.add(this.creature);

    this.captionCanvas = makeCanvas(1024, 112);
    this.captionTexture = makeTexture(this.captionCanvas);
    const captionMesh = new Mesh(
      new PlaneGeometry(PAPER_WIDTH * 0.9, (PAPER_WIDTH * 0.9 * 112) / 1024),
      // Drawn over everything: a dragon's wing or a boss in front of the screen never hides what to do.
      new MeshBasicMaterial({ map: this.captionTexture, transparent: true, depthTest: false, depthWrite: false }),
    );
    captionMesh.name = 'Caption';
    captionMesh.renderOrder = 20;
    // In front of every world's frame, so no beam or crossbar can cover it.
    captionMesh.position.set(0, PAPER_HEIGHT / 2 + 0.115, 0.075);
    paper.add(captionMesh);

    this.ghost = new GhostHand(paper);
    this.playButton = new PushButton(paper, 'Play');
    this.playButton.root.position.copy(PLAY_BUTTON);
    this.playButton.root.lookAt(paper.localToWorld(VIEWER.clone()));
    // Mouse, controller and pinch rays can press it too, not only a fingertip.
    this.buttonEntity = this.world.createTransformEntity(this.playButton.root, { parent: stage.paperEntity! });
    this.buttonEntity.addComponent(RayInteractable);
    this.skipButton = new PushButton(paper, 'Skip');
    this.skipButton.size = SKIP_SIZE;
    this.skipButton.root.position.copy(SKIP_BUTTON);
    this.skipButton.root.lookAt(paper.localToWorld(VIEWER.clone()));
    this.skipEntity = this.world.createTransformEntity(this.skipButton.root, { parent: stage.paperEntity! });
    this.skipEntity.addComponent(RayInteractable);
    this.queries.rayPressed.subscribe('qualify', (entity) => {
      if (entity === this.buttonEntity) this.rayClick = true;
      if (entity === this.skipEntity) this.skipClick = true;
    });
    this.addDesktopPress();
    this.intro = new IntroShow(paper);
    this.shadowWorld = new ShadowWorld(paper);
    devInfo.shadowWorld = () => ({
      mood: this.shadowWorld.mood,
      at: this.shadowWorld.position.map((n) => Number(n.toFixed(3))),
      falls: this.shadowWorld.falls,
      reached: this.shadowWorld.reached,
      ink: this.shadowWorld.inkUsed,
      line: this.shadowWorld.lastLine,
      // Bounding box of every lit mask cell: [minX, minY, maxX, maxY].
      shadow: (() => {
        const box = [MASK_WIDTH, MASK_HEIGHT, -1, -1];
        for (let i = 0; i < MASK_WIDTH * MASK_HEIGHT; i++) {
          const o = i * 4;
          if (stage.mask[o] < 128 && stage.mask[o + 1] < 128 && stage.mask[o + 2] < 128) continue;
          const x = i % MASK_WIDTH;
          const y = Math.floor(i / MASK_WIDTH);
          box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
          box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
        }
        return box;
      })(),
    });
    devInfo.playButton = () => {
      const round = (v: Vector3) => v.toArray().map((n) => Number(n.toFixed(3)));
      const at = this.playButton.root.getWorldPosition(new Vector3());
      // The right index tip in the button's own frame (+z out of the face).
      const tip = stage.tracked[1] ? this.playButton.root.worldToLocal(this.tips[1].clone()) : null;
      return { shown: this.playButton.visible, at: round(at), tip: tip && round(tip) };
    };

    loadProgress();
    this.menu = new MainMenu(paper, VIEWER, (kicker, title, body, footer) => {
      if (title === JOURNAL_PAGE) {
        drawJournal(this.bannerCanvas, Number(kicker));
        this.bannerTexture.needsUpdate = true;
        // A journal spread fills most of the screen, like the bag.
        this.banner.scale.setScalar(1.22);
        this.banner.position.y = 0.06;
      } else if (title === INVENTORY) {
        drawInventory(this.bannerCanvas, kicker);
        this.bannerTexture.needsUpdate = true;
        // The inventory fills most of the screen, so its slots and counts read easily.
        this.banner.scale.setScalar(1.22);
        this.banner.position.y = 0.06;
      } else {
        this.drawBanner(kicker, title, body, footer);
      }
      this.bannerShown = true;
    });
    this.table = new TableFinder(paper);
    // Dev: Y opens the Arena from the menu, as its button does; D starts the Ink Duel.
    devActions.y = () => {
      if (this.phase === 'title') this.menuAction({ do: 'arena' });
    };
    devActions.d = () => {
      if (this.phase === 'title') this.menuAction({ do: 'duel' });
    };
    devInfo.arena = () => ({ active: stage.arena, phase: this.phase });
    // Dev: F9 times each step of loading the dragon.
    devActions.f9 = () => void diagnoseDragon((line) => console.log(`SHADOWPLAY diag ${line}`));
    // Dev: Q opens the Bag; Z fills it with three of everything.
    devActions.q = () => {
      if (this.phase === 'title') this.menu.open('bag');
    };
    devActions.z = () => {
      for (const r of RESOURCE_ORDER) addResource(r, 3);
      if (this.phase === 'title') this.menu.open('bag');
    };
    // Dev: E opens the Credits page from the menu.
    devActions.e = () => {
      if (this.phase === 'title') this.menu.open('credits');
    };
    // Dev: S opens the Inventor's Journal from the menu.
    devActions.s = () => {
      if (this.phase === 'title') this.menu.open('journal');
    };
    // Dev: E opens Settings from the menu.
    devActions.e = () => {
      if (this.phase === 'title') this.menu.open('settings');
    };
    devActions.arrowleft = () => this.menu.turnJournal(-1);
    devActions.arrowright = () => this.menu.turnJournal(1);
    devInfo.table = () => ({
      height: stage.tableHeight,
      progress: Number(this.table.reading.progress.toFixed(2)),
      close: this.table.reading.close,
      hidden: stage.sceneryHidden,
    });
    this.showTable();

    installLevelTester({
      levels: () => [
        ...PUZZLES.map((p, index) => ({
          index,
          id: p.id,
          chapter: `Chapter ${p.world + 1} · ${WORLDS[p.world].name}`,
          title: p.title,
          kind: p.warmup ? 'warmup' : p.walk ? 'walk' : p.handsOn ? 'hands' : 'friend',
        })),
        { index: DAILY_INDEX, id: 'daily', chapter: 'Side games', title: 'Daily Light', kind: 'hands' },
        { index: WORKSHOP_INDEX, id: 'workshop', chapter: 'Side games', title: 'The Workshop', kind: 'hands' },
        { index: DUEL_INDEX, id: DUEL.id, chapter: 'Side games', title: DUEL.title, kind: 'hands' },
      ],
      current: () => this.puzzle?.id ?? '',
      go: (index) => {
        if (stage.arena) this.leaveArena();
        this.startPuzzle(index);
      },
      help: (id) => {
        const p = [...PUZZLES, DUEL].find((q) => q.id === id);
        return p ? `${p.ask}<br><br><i>Keys:</i> ${levelKeys(id, p.warmup ? 'warmup' : p.walk ? 'walk' : p.handsOn ? 'hands' : 'friend')}` : '';
      },
      status: () => `phase: ${this.phase} · ${stage.task?.caption ?? this.caption}`,
    });
    installWebcamPanel();
    installDevTools({
      capture: () => (this.hasShadow ? encodeCells(this.shadow) : ''),
      maskVersion: () => stage.maskVersion,
      next: () => this.skip(),
      reset: () => {
        resetProgress();
        this.startPuzzle(0);
      },
      spawnAll: () =>
        LEVELS.forEach((level, i) =>
          stage.spawns.push({ kind: level.id, x: -0.36 + i * 0.12, y: -0.12 }),
        ),
      spawn: (kind: string, size = 1) => stage.spawns.push({ kind, x: 0, y: -0.12, size }),
      summon: (kind: string | null, size: number) => {
        const index = kind ? this.candidates.findIndex((level) => level.id === kind) : 0;
        if (this.phase !== 'matching' || index < 0) return;
        // A square shadow of the size that makes this body, centred on the paper.
        const cells = Math.round(((size * SHADOW_FOR_NORMAL) / PAPER_WIDTH) * MASK_WIDTH);
        const b = this.candidateBounds[index];
        b.minX = Math.round(MASK_WIDTH / 2 - cells / 2);
        b.maxX = b.minX + cells - 1;
        b.minY = Math.round(MASK_HEIGHT / 2 - cells / 2);
        b.maxY = b.minY + cells - 1;
        this.awaken(this.candidates[index], index);
      },
      nextChapter: () => {
        const world = PUZZLES[this.puzzleIndex]?.world ?? -1;
        const next = PUZZLES.findIndex((p) => p.world > world);
        if (next >= 0) this.startPuzzle(next);
      },
      info: () => {
        const describe = (i: number) => {
          if (!stage.tracked[i]) return null;
          const ext = readExtension(stage.joints[i], createExtension());
          return {
            ext: Object.fromEntries(Object.entries(ext).map(([k, v]) => [k, Number(v.toFixed(2))])),
            up: Number(fingersUp(stage.joints[i], ext).toFixed(2)),
          };
        };
        const [l, r] = stage.joints;
        return {
          phase: this.phase,
          playing: stage.playing,
          menuOpen: stage.menuOpen,
          visibility: this.visibilityState.peek(),
          puzzle: this.puzzle?.id ?? 'free',
          candidates: this.candidates.map((c, i) => `${c.id}:${(this.smooth[i] ?? 0).toFixed(2)}`),
          unlocked: play.unlocked,
          stars: play.stars,
          hands: stage.handCount,
          maskVersion: stage.maskVersion,
          problem: this.best >= 0 ? this.candidateProblem[this.best] : null,
          left: describe(0),
          right: describe(1),
          thumbGap: Number(Math.hypot(l[12] - r[12], l[13] - r[13], l[14] - r[14]).toFixed(3)),
        };
      },
    });
  }

  update(delta: number): void {
    if (this.visibilityState.peek() === VisibilityState.VisibleBlurred) return;
    const dt = Math.min(delta, 0.1);
    this.phaseTime += dt;
    this.readShadows();
    this.handleCommand();
    // A level picked on the start page: straight into it once the headset view is up.
    if (stage.startAt !== null && this.visibilityState.peek() === VisibilityState.Visible) {
      const index = stage.startAt;
      stage.startAt = null;
      this.leaveTable();
      playAwaken();
      this.startPuzzle(index);
    }
    if (stage.startArena && this.visibilityState.peek() === VisibilityState.Visible) {
      stage.startArena = false;
      this.leaveTable();
      this.enterArena();
    }

    this.readTips();
    const pressed = this.playButton.update(dt, this.liveTips, this.rayClick);
    this.rayClick = false;
    if (pressed) playClick();
    this.skipButton.show(this.puzzle !== null && SKIPPABLE.has(this.phase) && !stage.menuOpen);
    const skipX = this.leftHanded ? SKIP_BUTTON.x : -SKIP_BUTTON.x;
    if (this.skipButton.root.position.x !== skipX) {
      // Moved to the other side: turn its face to the player again.
      this.skipButton.root.position.x = skipX;
      this.skipButton.root.lookAt(stage.paper!.localToWorld(VIEWER.clone()));
    }
    const skipped = this.skipButton.update(dt, this.liveTips, this.skipClick);
    this.skipClick = false;
    if (skipped) {
      playClick();
      if (isSideGame(this.puzzleIndex)) this.showTitle();
      else this.skip();
    }
    if (this.phase !== 'title') this.menu.update(dt, this.liveTips, -1, false);
    this.introLine = this.intro.update(dt);
    if (this.phase === 'matching' && !stage.menuOpen && this.shadowWorld.canDraw) this.feedInk(dt);
    this.shadowWorld.update(dt);

    stage.playing = this.phase === 'matching' && !stage.menuOpen;
    stage.fight = this.puzzle?.id === 'shadow-dragon' || this.puzzle?.id === 'duel';
    stage.titleMenu = this.phase === 'title';
    // Music only in the headset; the Arena keeps Yash's own soundscape.
    const inHeadset = this.visibilityState.peek() === VisibilityState.Visible;
    // The menu has its theme, each world its own, the duel a lively one; scenes can ask for battle music.
    const worldMusic = this.puzzle?.id === 'duel' ? 'duel' : WORLDS[this.puzzle?.world ?? 0]?.music ?? 'explore';
    const menuMusic = this.phase === 'title' || this.phase === 'table' || this.phase === 'growing' || this.phase === 'intro';
    setMusic(!inHeadset || stage.arena ? null : stage.music ?? (menuMusic ? 'menu' : worldMusic));
    tickMusic(dt);
    this.watchHands(dt, inHeadset);
    switch (this.phase) {
      case 'table':
        this.updateTable(dt, pressed);
        break;
      case 'growing':
        // A first-time player goes straight into the prologue, then level one: no menu to find first.
        if (this.phaseTime >= GROW_TIME) {
          if (resumeIndex() === 0 && totalStars() === 0) {
            this.showTitle();
            this.menu.close();
            this.startIntro();
          } else this.showTitle();
        }
        break;
      case 'title': {
        const action = this.menu.update(dt, this.liveTips, this.menuClick, this.enterPressed);
        if (action) this.menuAction(action);
        else if (this.phaseTime > 8) this.setCaption('Push a button with your fingertip, or point and pinch');
        break;
      }
      case 'intro':
        if (pressed || this.introLine === null) {
          this.intro.stop();
          this.playButton.show(false);
          this.startPuzzle(this.puzzleIndex);
        } else {
          this.setCaption(this.introLine);
        }
        break;
      case 'story':
        if (!this.welcomed) this.welcomeBack();
        if (this.phaseTime >= STORY_TIME) this.beginMatching();
        break;
      case 'matching':
        if (stage.menuOpen) {
          this.holdTime = 0;
          this.setCaption('Paused · poke a button, or lower your hand');
        } else if (this.puzzle?.warmup) this.updateWarmup(dt);
        else if (this.puzzle?.walk) this.updateWalk(dt);
        else if (this.puzzle?.handsOn) this.updateHandsOn(dt);
        else this.updateMatching(dt);
        break;
      case 'awakening':
        this.updateAwakening();
        break;
      case 'solving':
        this.updateSolving();
        break;
      case 'oops':
        if (this.phaseTime >= OOPS_TIME) this.beginMatching();
        break;
      case 'cleared':
        if (this.phaseTime >= CLEAR_TIME) {
          if (isSideGame(this.puzzleIndex)) this.showTitle();
          else this.startPuzzle(Math.min(this.puzzleIndex + 1, PUZZLES.length));
        }
        break;
    }

    // Whichever hand the player raises alone decides which way the ghost faces.
    if (stage.tracked[0] !== stage.tracked[1]) this.leftHanded = stage.tracked[0];
    this.ghost.setLeftHanded(this.leftHanded);
    const fade = this.phase === 'matching' && this.best >= 0 ? this.warmth(this.smooth[this.best]) : 0;
    this.ghost.update(dt, fade);

    this.menuClick = -1;
    this.enterPressed = false;
    const target = this.bannerShown ? 1 : 0;
    this.bannerMaterial.opacity += (target - this.bannerMaterial.opacity) * Math.min(1, dt * 5);
    this.banner.visible = this.bannerMaterial.opacity > 0.01;
  }

  // ------------------------------------------------------------ Story flow

  /**
   * Before anything else: find the player's real table. The world stays
   * hidden until a hand lies flat on it, then grows out from under the palm.
   */
  private showTable(): void {
    if (stage.tableHeight !== null) {
      this.showTitle();
      return;
    }
    this.table.reset();
    stage.sceneryHidden = true;
    this.bannerShown = false;
    this.playButton.setText('Skip');
    this.playButton.show(true);
    this.setCaption('Lay one hand flat on your table');
    this.setPhase('table');
  }

  /** A start-page shortcut skips finding the table: the world grows in at the default height. */
  private leaveTable(): void {
    if (this.phase !== 'table') return;
    this.table.hide();
    this.playButton.show(false);
    stage.sceneryHidden = false;
    stage.grow = { from: null };
    playGrow();
  }

  private updateTable(dt: number, skip: boolean): void {
    this.player.head.getWorldPosition(this.headAt);
    const reading = this.table.update(dt, stage.joints, stage.tracked, (v) => this.player.localToWorld(v), this.headAt.y);
    if (reading.height !== null || skip) {
      if (reading.height !== null) stage.tableHeight = reading.height;
      stage.sceneryHidden = false;
      stage.grow = { from: reading.height !== null ? reading.point.clone() : null };
      this.table.hide();
      this.playButton.show(false);
      playGrow();
      const world = WORLDS[PUZZLES[resumeIndex()]?.world ?? WORLDS.length - 1];
      this.setCaption(world.grows);
      this.setPhase('growing');
      return;
    }
    if (reading.close) {
      this.setCaption(`Hold still…  ${Math.round(reading.progress * 100)}%`);
    } else if (this.phaseTime > 9) {
      this.setCaption('No table nearby? Push Skip');
    } else {
      this.setCaption('Lay one hand flat on your table');
    }
  }

  /** The very first time: the shadow-puppet prologue (skippable), then level one. */
  private startIntro(): void {
    this.bannerShown = false;
    this.playButton.setText('Skip');
    this.playButton.show(true);
    this.intro.start();
    this.setPhase('intro');
  }

  /** Home: the title on the screen and a row of buttons (chapters, play, settings). */
  private showTitle(): void {
    this.leaveArena();
    // Back from a side game: the story's place, not the side game's.
    if (isSideGame(play.puzzleIndex)) play.puzzleIndex = this.storyIndex;
    const resume = resumeIndex();
    this.storyIndex = play.puzzleIndex;
    this.puzzleIndex = resume;
    this.puzzle = null;
    this.candidates = [];
    this.raw = [];
    this.smooth = [];
    this.best = -1;
    this.fresh = resume === 0 && totalStars() === 0;
    this.intro.stop();
    this.playButton.show(false);
    this.menu.open('home');
    this.setCaption(this.fresh ? 'Welcome! Push Play to begin' : 'Welcome back!');
    this.setPhase('title');
  }

  /** Yash's Arena takes over: the paper and the stage step aside until the wrist menu's Menu. */
  private enterArena(): void {
    playAwaken();
    stage.arena = true;
    stage.sceneryHidden = true;
    stage.paper!.visible = false;
    this.setPhase('arena');
  }

  private leaveArena(): void {
    if (!stage.arena) return;
    stage.arena = false;
    stage.sceneryHidden = false;
    stage.paper!.visible = true;
  }

  private menuAction(action: MenuAction): void {
    this.menu.close();
    if (action.do === 'table') {
      stage.tableHeight = null;
      this.showTable();
    } else if (action.do === 'chapter') {
      playAwaken();
      this.startPuzzle(action.index);
    } else if (action.do === 'workshop') {
      playAwaken();
      this.startPuzzle(WORKSHOP_INDEX);
    } else if (action.do === 'daily') {
      playAwaken();
      this.startPuzzle(DAILY_INDEX);
    } else if (action.do === 'duel') {
      playAwaken();
      this.startPuzzle(DUEL_INDEX);
    } else if (action.do === 'arena') {
      this.enterArena();
    } else if (this.fresh) {
      this.startIntro();
    } else {
      playAwaken();
      this.startPuzzle(this.puzzleIndex < PUZZLES.length ? this.puzzleIndex : 0);
    }
  }

  /**
   * Desktop fallback for the emulator and a flat browser, where no hand ray
   * points at the button: a mouse click on it, or Enter / Space.
   */
  private addDesktopPress(): void {
    const canvas = this.renderer.domElement;
    installMouseHands(canvas, () => (this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera));
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const onPointer = (event: PointerEvent) => {
      if (!this.playButton.visible && !this.skipButton.visible && this.menu.roots.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const camera = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
      raycaster.setFromCamera(ndc, camera);
      if (this.playButton.visible && raycaster.intersectObject(this.playButton.root, true).length > 0) this.rayClick = true;
      if (this.skipButton.visible && raycaster.intersectObject(this.skipButton.root, true).length > 0) this.skipClick = true;
      this.menu.roots.forEach((root, i) => {
        if (raycaster.intersectObject(root, true).length > 0) this.menuClick = i;
      });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (this.playButton.visible) this.rayClick = true;
      else this.enterPressed = true;
    };
    // Capture on the window: the emulator layers its own controls over the canvas.
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey);
    this.cleanupFuncs.push(
      () => window.removeEventListener('pointerdown', onPointer, true),
      () => window.removeEventListener('keydown', onKey),
    );
  }

  /** Each hand's pinch, in paper space, for drawing shadow ink. */
  private feedInk(dt: number): void {
    const paper = stage.paper!;
    for (const hand of HAND_CHANNELS) {
      const j = stage.joints[hand];
      const tracked = stage.tracked[hand];
      this.thumb.set(j[THUMB_TIP * 3], j[THUMB_TIP * 3 + 1], j[THUMB_TIP * 3 + 2]);
      this.pinch.set(j[INDEX_TIP * 3], j[INDEX_TIP * 3 + 1], j[INDEX_TIP * 3 + 2]);
      const gap = this.thumb.distanceTo(this.pinch);
      this.pinch.add(this.thumb).multiplyScalar(0.5);
      paper.worldToLocal(this.player.localToWorld(this.pinch));
      this.shadowWorld.drawInput(hand, tracked, gap, this.pinch, dt);
    }
  }

  /** World positions of the tracked index fingertips, for pushing buttons. */
  private readTips(): void {
    this.liveTips.length = 0;
    for (const hand of HAND_CHANNELS) {
      if (!stage.tracked[hand]) continue;
      const j = stage.joints[hand];
      const tip = this.tips[hand].set(j[INDEX_TIP * 3], j[INDEX_TIP * 3 + 1], j[INDEX_TIP * 3 + 2]);
      this.liveTips.push(this.player.localToWorld(tip));
    }
  }

  private startPuzzle(index: number): void {
    this.leaveArena();
    // Jumping straight into a level (dev keys) skips the table: show the world as it is.
    stage.sceneryHidden = false;
    this.table.hide();
    this.menu.close();
    this.puzzleIndex = index;
    if (index === WORKSHOP_INDEX) refreshWorkshop();
    this.puzzle = puzzleAt(index);
    // Side games (the duel, the Daily Light) never move the story's saved place.
    if (!isSideGame(index)) {
      play.puzzleIndex = this.puzzle ? index : -1;
      this.storyIndex = play.puzzleIndex;
      saveProgress();
    }
    play.puzzleIndex = this.puzzle ? index : -1;
    play.puzzleVersion++;
    play.outcome = null;

    const puzzle = this.puzzle;
    if (!puzzle) {
      this.candidates = [...LEVELS];
    } else if (puzzle.warmup || puzzle.walk || puzzle.handsOn) {
      this.candidates = [];
    } else if (puzzle.teach) {
      this.candidates = [levelFor(puzzle.teach)];
    } else {
      // Every friend taught so far in the story.
      this.candidates = PUZZLES.slice(0, index).flatMap((p) => (p.teach ? [levelFor(p.teach)] : []));
    }
    this.walkCleared = false;
    this.raw = this.candidates.map(() => 0);
    this.smooth = this.candidates.map(() => 0);
    this.candidateShadow = this.candidates.map(() => false);
    this.candidateBounds = this.candidates.map(() => createBounds());
    this.candidateProblem = this.candidates.map(() => null);
    this.best = -1;
    this.hintShown = false;
    this.wrongTries = 0;
    this.matchTime = 0;

    this.outline.visible = false;
    this.cards.forEach((card) => (card.mesh.visible = false));
    this.ring.visible = false;
    this.creature.visible = false;
    this.ghost.show(null);
    this.playButton.show(false);
    this.intro.stop();
    this.shadowWorld.load(puzzle?.walk ?? null);
    if (stage.shadowMaterial) stage.shadowMaterial.opacity = SHADOW_OPACITY;

    if (puzzle) {
      const firstOfWorld = PUZZLES.findIndex((p) => p.world === puzzle.world) === index;
      const side = isSideGame(this.puzzleIndex);
      const kicker = puzzle.id === 'duel'
        ? 'Side game · vs Morwen the Ink Witch'
        : puzzle.id === 'daily'
          ? 'Side game · a new course every day'
          : puzzle.id === 'workshop'
            ? 'Side game · build your own course'
          : `Chapter ${puzzle.world + 1} · ${WORLDS[puzzle.world].name}`;
      this.drawBanner(firstOfWorld || side ? kicker : WORLDS[puzzle.world].name, puzzle.title, puzzle.story);
      this.setCaption(puzzle.ask);
    } else {
      this.drawBanner(
        'You escaped the Lantern',
        'Free at last',
        'The Great Lantern carries you home. Your hands made light, friends, a bridge and an axe, and your Journal holds the science of it all. Thank you for playing.',
        `${totalStars()} of ${PUZZLES.length * 3} ★  ·  ${pagesFilled()} of ${JOURNAL.length} Journal pages`,
      );
      this.setCaption('Free play: make any friend’s shadow, or open the menu on your palm');
    }
    this.bannerShown = true;
    this.setPhase('story');
    playPrompt();
  }

  /** Restart and Skip from the hand menu. */
  private handleCommand(): void {
    const command = stage.command;
    if (command === 'drink' && this.puzzle?.id !== 'shadow-dragon') {
      // Outside the dragon's fire there is nothing to heal.
      stage.command = null;
      this.setCaption('You feel fine: save your draughts for the dragon');
      return;
    }
    if (command !== 'restart' && command !== 'skip' && command !== 'menu') return;
    stage.command = null;
    if (command === 'menu') {
      this.showTitle();
      return;
    }
    if (command === 'restart') this.startPuzzle(this.puzzleIndex);
    else if (this.puzzle) this.skip();
  }

  /** Moves on without stars; the level's friend still joins so later levels stay possible. */
  private skip(): void {
    if (this.puzzle?.teach && !play.unlocked.includes(this.puzzle.teach)) {
      play.unlocked.push(this.puzzle.teach);
    }
    this.startPuzzle(Math.min(this.puzzleIndex + 1, PUZZLES.length));
  }

  /** Each level starts on a clear stage now; kept as the hook for a returning-player greeting. */
  private welcomeBack(): void {
    this.welcomed = true;
  }

  private beginMatching(): void {
    this.bannerShown = false;
    this.holdTime = 0;
    this.struggleTime = 0;
    this.smooth.fill(0);
    this.best = -1;
    if (stage.shadowMaterial) stage.shadowMaterial.opacity = SHADOW_OPACITY;

    const teach = this.puzzle?.teach;
    if (teach) {
      const cells = decodeCells(levelFor(teach).outline);
      drawTargetLine(this.outlineCanvas, cells, false);
      drawTargetLine(this.haloCanvas, cells, true);
      this.haloTexture.needsUpdate = true;
      this.outlineTexture.needsUpdate = true;
      this.outline.visible = true;
      this.ghost.show(levelFor(teach));
    } else {
      this.ghost.show(null);
      this.outline.visible = false;
      // Choosing: a card for every friend the player can make.
      const n = this.candidates.length;
      this.cards.forEach((card, i) => {
        card.mesh.visible = i < n;
        if (i >= n) return;
        drawSilhouette(card.canvas, decodeCells(this.candidates[i].outline), 4, 0.9);
        // The friend's name under its shape, so new players know who is who.
        const ctx = card.canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 26px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.candidates[i].name, 64, 144, 124);
        card.texture.needsUpdate = true;
        card.mesh.position.set((i - (n - 1) / 2) * CARD_GAP, CARD_Y, 0.002);
      });
    }
    this.setPhase('matching');
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  /** The very first moment: any shadow held on the paper. */
  private updateWarmup(dt: number): void {
    let shadowOnPaper = false;
    for (const hand of HAND_CHANNELS) {
      if (stage.tracked[hand] && this.handShadow[hand] && !touchesEdge(this.handBounds[hand])) {
        shadowOnPaper = true;
      }
    }
    this.holdTime = shadowOnPaper ? this.holdTime + dt : Math.max(0, this.holdTime - dt * 2);
    this.showRing(this.holdTime / WARMUP_HOLD, 0, 0.02, 0.45);
    this.setCaption(
      shadowOnPaper
        ? 'That’s your shadow! Hold it there…'
        : stage.handCount > 0 && this.handShadow.some((s) => s)
          ? 'Bring your shadow fully onto the paper'
          : 'Raise your hand into the lantern light',
    );
    if (this.holdTime >= WARMUP_HOLD) {
      playAwaken();
      this.clearPuzzle();
    }
  }

  /** Shadow-world levels: the little friend does the walking; hands make the ground. */
  private updateWalk(dt: number): void {
    const world = this.shadowWorld;
    if (world.reached) {
      // Let it cheer for a moment before the stars card.
      if (!this.walkCleared) {
        this.walkCleared = true;
        this.walkClearAt = this.phaseTime + 1.6;
      }
      if (this.phaseTime >= this.walkClearAt) {
        playAwaken();
        this.clearPuzzle();
      }
      this.setCaption(this.puzzle!.solved);
      return;
    }
    this.matchTime += dt;
    let text = this.puzzle!.ask;
    if (world.mood === 'gone') text = world.falls > 1 ? 'Oops! Hold your hand still while it crosses' : 'Whoops! It fell. Try again!';
    else if (world.mood === 'edge' || world.mood === 'wall') {
      if (world.canDraw) {
        text = world.inkUsed === 0 || this.phaseTime < 8
          ? 'Pinch your fingers and draw a ramp in the air'
          : 'Draw it from the rabbit up to the ledge';
      } else {
        text = stage.handCount === 0 ? 'Raise your hand into the lantern light' : 'Lay your hand’s shadow across the gap';
      }
    }
    else if (world.mood === 'walk' && this.phaseTime > 2) text = 'Hold it steady…';
    this.setCaption(text);
  }

  /** Hands-on work (the forge): the scene says what to do next and when it is done. */
  private updateHandsOn(dt: number): void {
    this.matchTime += dt;
    const task = stage.task;
    if (task?.done) {
      if (!this.walkCleared) {
        this.walkCleared = true;
        this.walkClearAt = this.phaseTime + 1.5;
      }
      if (this.phaseTime >= this.walkClearAt) {
        playAwaken();
        this.clearPuzzle();
        return;
      }
    }
    this.setCaption(task?.caption || this.puzzle!.ask);
  }

  private updateMatching(dt: number): void {
    this.matchTime += dt;
    this.judgeCandidates(dt);
    const best = this.best;
    const level = best >= 0 ? this.candidates[best] : null;
    const score = best >= 0 ? this.smooth[best] : 0;
    const teaching = !!this.puzzle?.teach;

    if (teaching) {
      const warmth = this.warmth(score);
      this.outlineMaterial.color.copy(TARGET_DIM).lerp(TARGET_HOT, warmth);
      this.haloMaterial.opacity = 0.45 + 0.3 * warmth;
      const pulse = 1 + Math.sin(this.phaseTime * 6) * 0.02 * warmth;
      this.outline.scale.setScalar(OUTLINE_SIZE * pulse);
    }
    this.cards.forEach((card, i) => {
      if (!card.mesh.visible) return;
      const warmth = this.warmth(this.smooth[i]);
      card.material.color.copy(DIM_OUTLINE).lerp(HOT_OUTLINE, warmth);
      card.material.opacity = 0.55 + 0.45 * warmth;
      card.mesh.scale.setScalar(1 + warmth * 0.25);
    });

    // After a creature is freed, the hand must relax before the next shape
    // counts, so holding a pose does not spawn creature after creature.
    const strongest = Math.max(0, ...this.raw);
    if (this.needsRelease && (stage.handCount === 0 || strongest < 0.3)) {
      this.needsRelease = false;
    }

    const problem = best >= 0 ? this.candidateProblem[best] : null;
    this.struggleTime = stage.handCount > 0 && score < MATCH_THRESHOLD
      ? this.struggleTime + dt
      : 0;
    const anyPair = this.candidates.some((c) => c.pair);
    const allPair = this.candidates.every((c) => c.pair);
    let text = teaching ? `Make a ${level?.name ?? ''}: copy the glowing hand` : this.puzzle?.ask ?? 'Make any friend’s shadow';
    if (!teaching && this.puzzle && this.phaseTime > 4) text = 'Pick a friend: make their shadow';
    if (this.needsRelease) {
      text = 'Relax your hand for the next shape';
    } else if (stage.handCount === 0 || problem === 'noShadow') {
      if (this.phaseTime > 3) {
        text = allPair ? 'Raise both hands into the lantern light' : 'Raise your hand into the lantern light';
      }
    } else if (problem === 'twoHands' && allPair) {
      text = 'This one needs both hands';
    } else if (problem === 'offPaper') {
      text = 'Bring your shadow fully onto the paper';
    } else if (level && this.struggleTime > HINT_DELAY && (teaching || score > 0.35)) {
      // Teach the shape: the plain tip first, then alternate it with a
      // hint about whichever finger is furthest off.
      const tip = level.tip[0].toUpperCase() + level.tip.slice(1);
      const showHint = problem && this.struggleTime > HINT_DELAY * 2 &&
        Math.floor(this.struggleTime / 3) % 2 === 1;
      if (showHint) this.hintShown = true;
      const rule = (level.pair ?? level.shape)!;
      const prefix = teaching ? '' : `${level.name}: `;
      text = showHint ? hintFor(problem!, rule.fingers, level.pair?.spread) : prefix + tip;
    } else if (anyPair && problem === 'twoHands' && !teaching) {
      text = 'Pick a friend: make their shadow';
    }
    // A job that needs a big (or a small) friend: read out the size this shadow would make.
    const need = this.puzzle?.needSize;
    const most = this.puzzle?.maxSize;
    if ((need || most) && level && best >= 0 && this.candidateShadow[best] && score > 0.45 && !this.needsRelease) {
      const size = bodySizeFromShadow(shadowSpan(this.candidateBounds[best]));
      if (need) {
        text = size >= need
          ? `${level.name} size ×${size.toFixed(2)}: strong enough! Hold the shape`
          : `${level.name} size ×${size.toFixed(2)} (needs ×${need.toFixed(2)}): bring your hand closer to the lantern`;
      } else if (most) {
        text = size <= most
          ? `${level.name} size ×${size.toFixed(2)}: small enough! Hold the shape`
          : `${level.name} size ×${size.toFixed(2)} (needs ×${most.toFixed(2)} or less): move your hand away from the lantern`;
      }
    }
    if (DEV) text += `  ·  ${Math.round(score * 100)}%`;

    // The ghost hand: always on while teaching; when choosing, it steps in
    // for the friend the player is trying once they have struggled a while.
    if (!teaching) {
      const trying = level && this.struggleTime > HINT_DELAY && score > 0.25 && !this.needsRelease;
      if (trying) this.ghost.show(level);
      else if (score >= MATCH_THRESHOLD || stage.handCount === 0) this.ghost.show(null);
    }
    this.ghost.setFocus(this.struggleTime > HINT_DELAY * 2 ? ghostFocus(problem) : null);
    this.setCaption(text);

    const matched = level !== null && score >= MATCH_THRESHOLD &&
      this.candidateShadow[best] && !this.needsRelease;
    this.holdTime = matched ? this.holdTime + dt : 0;
    if (teaching) this.showRing(this.holdTime / MATCH_HOLD, 0, 0.02, OUTLINE_SIZE * 1.3);
    else if (best >= 0) {
      const card = this.cards[best].mesh;
      this.showRing(this.holdTime / MATCH_HOLD, card.position.x, card.position.y, CARD_SIZE * 1.6);
    }
    if (level && this.holdTime >= MATCH_HOLD) this.awaken(level, best);
  }

  private warmth(score: number): number {
    return Math.min(1, Math.max(0, (score - 0.2) / (MATCH_THRESHOLD - 0.2)));
  }

  private updateSolving(): void {
    const outcome = play.outcome;
    if (!outcome) return;
    play.outcome = null;
    if (outcome.solved) {
      this.clearPuzzle();
      return;
    }
    this.wrongTries++;
    this.setCaption(outcome.line ?? 'Hmm, that did not work. Try another friend!');
    this.setPhase('oops');
  }

  /** Level done: unlock its friend, award stars and show the card. */
  private clearPuzzle(): void {
    const puzzle = this.puzzle;
    this.ring.visible = false;
    if (!puzzle) return;
    if (puzzle.teach && !play.unlocked.includes(puzzle.teach)) play.unlocked.push(puzzle.teach);
    const stars = puzzle.warmup
      ? 3
      : puzzle.walk
        ? 1 + (this.shadowWorld.falls === 0 ? 1 : 0) + (this.matchTime < FAST_TIME ? 1 : 0)
        : puzzle.handsOn
          ? stage.task?.stars ?? 1 + ((stage.task?.mistakes ?? 0) === 0 ? 1 : 0) + (this.matchTime < HANDS_ON_FAST ? 1 : 0)
        : 1 + (!this.hintShown && this.wrongTries === 0 ? 1 : 0) + (this.matchTime < FAST_TIME ? 1 : 0);
    play.stars[puzzle.id] = Math.max(play.stars[puzzle.id] ?? 0, stars);
    // The Inventor's Journal: the level's own numbers, or your friend's body from its shadow.
    const machine = stage.runNotes?.() ?? null;
    const runLines = machine ?? (puzzle.warmup
      ? ['Your first shadow came to life']
      : puzzle.walk
        ? [`Crossed in ${Math.round(this.matchTime)} s`, this.shadowWorld.falls ? `Your friend fell ${this.shadowWorld.falls} time${this.shadowWorld.falls > 1 ? 's' : ''} on the way` : 'Not one fall on the way']
        : friendRunLines(this.creatureSize, this.bodySize));
    // A lost duel fills no page.
    const newPage = runLines.length > 0 && noteRun(stage.journalPage ?? puzzle.id, runLines);
    // Which powers beat the dragon, for the Trophy Shelf; then any trophies this clear earned.
    if (puzzle.id === 'shadow-dragon') {
      const feat = stage.journalPage === 'arsenal' ? 'dragon-arsenal' : 'dragon-light';
      if (!play.feats.includes(feat)) play.feats.push(feat);
    }
    const trophies = trophyLine(awardTrophies());
    // Resume from the next level if the player leaves now (a side game keeps the story's place).
    play.puzzleIndex = isSideGame(this.puzzleIndex)
      ? this.storyIndex
      : this.puzzleIndex + 1 < PUZZLES.length ? this.puzzleIndex + 1 : -1;
    saveProgress();
    play.puzzleIndex = this.puzzleIndex;

    const row = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    this.drawBanner(puzzle.title, row, puzzle.solved, `${totalStars()} ★ collected${newPage ? '  ·  New page in your Journal!' : ''}${trophies ? `  ·  ${trophies}` : ''}`);
    if (trophies) playTinkle();
    this.bannerShown = true;
    this.setCaption(puzzle.warmup ? 'Well done!' : stars === 3 ? 'Perfect!' : 'Level cleared!');
    this.setPhase('cleared');
  }

  // --------------------------------------------------------------- Judging

  /** Updates each hand's shadow bounds when a new mask arrives. */
  private readShadows(): void {
    if (stage.maskVersion === this.seenMaskVersion) return;
    this.seenMaskVersion = stage.maskVersion;
    if (this.candidates.some((c) => c.pair)) {
      // Two-hand shapes are one shadow: read both channels together.
      this.pairShadow = normalizeMask(
        stage.mask,
        MASK_WIDTH,
        MASK_HEIGHT,
        MaskChannel.Both,
        this.candidate,
        this.pairBounds,
      );
    }
    for (const channel of HAND_CHANNELS) {
      this.handShadow[channel] = normalizeMask(
        stage.mask,
        MASK_WIDTH,
        MASK_HEIGHT,
        channel,
        this.candidate,
        this.scratchBounds,
      );
      copyBounds(this.scratchBounds, this.handBounds[channel]);
      if (this.handShadow[channel] && channel === this.bestHand()) {
        this.shadow.set(this.candidate);
      }
    }
  }

  private bestHand(): number {
    return this.handScores[0] >= this.handScores[1] ? 0 : 1;
  }

  /** Scores every allowed friend's shape and picks the closest one. */
  private judgeCandidates(dt: number): void {
    const k = Math.min(1, dt * 10);
    let best = -1;
    this.candidates.forEach((level, i) => {
      if (level.pair) this.judgePair(level.pair);
      else if (level.shape) this.judgeSingle(level.shape);
      this.raw[i] = this.rawScore;
      this.smooth[i] += (this.rawScore - this.smooth[i]) * k;
      this.candidateShadow[i] = this.hasShadow;
      this.candidateProblem[i] = this.problem;
      copyBounds(this.bounds, this.candidateBounds[i]);
      // Ties go to the earlier friend, so one-hand problems are reported first.
      if (best < 0 || this.smooth[i] > this.smooth[best]) best = i;
    });
    if (best !== this.best) this.holdTime = 0;
    this.best = best;
  }

  /** Two-hand shapes: both hands tracked, one shadow fully on the paper. */
  private judgePair(rule: PairRule): void {
    this.hasShadow = false;
    this.rawScore = 0;
    if (stage.handCount === 0) {
      this.problem = null;
      return;
    }
    if (!stage.tracked[0] || !stage.tracked[1]) {
      this.problem = 'twoHands';
      return;
    }
    if (!this.pairShadow || !this.handShadow[0] || !this.handShadow[1]) {
      this.problem = 'noShadow';
      return;
    }
    if (touchesEdge(this.pairBounds)) {
      this.problem = 'offPaper';
      return;
    }
    readExtension(stage.joints[0], this.extension);
    readExtension(stage.joints[1], this.extensionRight);
    scorePair(rule, stage.joints[0], stage.joints[1], this.extension, this.extensionRight, this.shapeScore);
    this.hasShadow = true;
    copyBounds(this.pairBounds, this.bounds);
    this.rawScore = this.shapeScore.score;
    this.problem = this.shapeScore.worst;
  }

  /** One-hand shapes: either hand may make it; the better one counts. */
  private judgeSingle(rule: ShapeRule): void {
    let best = -1;
    this.problem = stage.handCount === 0 ? null : 'noShadow';
    for (let hand = 0; hand < 2; hand++) {
      this.handScores[hand] = 0;
      if (!stage.tracked[hand]) continue;
      if (!this.handShadow[hand]) continue;
      if (touchesEdge(this.handBounds[hand])) {
        if (best < 0) this.problem = 'offPaper';
        continue;
      }
      readExtension(stage.joints[hand], this.extension);
      scoreShape(rule, stage.joints[hand], this.extension, this.shapeScore);
      this.handScores[hand] = this.shapeScore.score;
      if (best < 0 || this.shapeScore.score > this.handScores[best]) {
        best = hand;
        this.problem = this.shapeScore.worst;
      }
    }
    this.hasShadow = best >= 0;
    if (best >= 0) copyBounds(this.handBounds[best], this.bounds);
    this.rawScore = best >= 0 ? this.handScores[best] : 0;
  }

  // ------------------------------------------------------------- Awakening

  /** The matched shadow peels off the hand and becomes a creature. */
  private awaken(level: Level, index: number): void {
    this.chosen = level;
    const b = this.candidateBounds[index];
    this.creatureSize = shadowSpan(b);
    this.bodySize = bodySizeFromShadow(this.creatureSize);
    this.creatureX = (((b.minX + b.maxX + 1) / 2) / MASK_WIDTH - 0.5) * PAPER_WIDTH;
    this.creatureY = (((b.minY + b.maxY + 1) / 2) / MASK_HEIGHT - 0.5) * PAPER_HEIGHT;
    drawSilhouette(this.creatureCanvas, decodeCells(level.outline), 3, 1);
    this.creatureTexture.needsUpdate = true;
    this.creature.position.x = this.creatureX;
    this.creature.position.y = this.creatureY;
    this.creature.scale.setScalar(this.creatureSize);
    this.creatureMaterial.opacity = 1;
    this.creature.visible = true;
    this.outline.visible = false;
    this.cards.forEach((card) => (card.mesh.visible = false));
    this.ring.visible = false;
    this.ghost.show(null);
    this.needsRelease = true;
    this.setCaption(`${sizeWord(this.bodySize)}${level.name} is free!`);
    this.setPhase('awakening');
    playAwaken();
  }

  private updateAwakening(): void {
    const t = this.phaseTime;
    const size = this.creatureSize;
    const shadowMaterial = stage.shadowMaterial;

    if (t < AWAKEN_SHIVER) {
      // Shiver in place while the hand shadow lets go.
      const k = t / AWAKEN_SHIVER;
      this.creature.position.x = this.creatureX + Math.sin(t * 90) * 0.006 * k;
      this.creature.position.y = this.creatureY;
      if (shadowMaterial) shadowMaterial.opacity = SHADOW_OPACITY * (1 - 0.8 * k);
    } else {
      // A few lively moves on the paper before stepping out into the room.
      const m = (t - AWAKEN_SHIVER) / (AWAKEN_DURATION - AWAKEN_SHIVER);
      const x = this.creatureX + Math.sin(m * Math.PI) * 0.05;
      let y = this.creatureY;
      let sx = 1;
      let sy = 1;
      switch (this.chosen.motion) {
        case 'hop': {
          const hop = Math.abs(Math.sin(m * Math.PI * 3.5));
          y += hop * 0.12;
          sy = 0.88 + hop * 0.2;
          sx = 1.08 - hop * 0.12;
          break;
        }
        case 'fly':
          y += m * 0.25 + Math.sin(m * Math.PI * 6) * 0.03;
          sy = 1 + Math.sin(m * Math.PI * 16) * 0.12;
          break;
        case 'crawl':
          sx = 1 + Math.sin(m * Math.PI * 10) * 0.06;
          break;
      }
      this.creature.position.set(x, y, this.creature.position.z);
      this.creature.scale.set(size * sx, size * sy, 1);
    }

    if (t >= AWAKEN_DURATION) {
      // The flat shadow hands over to its 3D self, which emerges from this spot.
      this.creature.visible = false;
      const attempt = this.puzzle !== null;
      stage.spawns.push({
        kind: this.chosen.id,
        x: this.creature.position.x,
        y: this.creature.position.y,
        attempt,
        size: this.bodySize,
      });
      if (shadowMaterial) shadowMaterial.opacity = SHADOW_OPACITY;
      if (attempt) {
        this.setCaption(`Go, ${friendName(this.chosen.id)}!`);
        this.setPhase('solving');
      } else {
        this.beginMatching();
      }
    }
  }

  // ------------------------------------------------------------- Drawing

  /** Gold progress ring around the shape being held. */
  private showRing(progress: number, x: number, y: number, size: number): void {
    const p = Math.min(1, Math.max(0, progress));
    this.ring.visible = p > 0;
    if (!this.ring.visible) return;
    this.ring.position.set(x, y, 0.004);
    this.ring.scale.setScalar(size);
    const step = Math.round(p * RING_STEPS);
    if (step === this.ringDrawn) return;
    this.ringDrawn = step;
    const ctx = this.ringCanvas.getContext('2d')!;
    const c = this.ringCanvas.width / 2;
    ctx.clearRect(0, 0, c * 2, c * 2);
    ctx.lineCap = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(255, 220, 150, 0.25)';
    ctx.beginPath();
    ctx.arc(c, c, c - 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffc34d';
    ctx.shadowColor = 'rgba(255, 190, 80, 0.9)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(c, c, c - 14, -Math.PI / 2, -Math.PI / 2 + (step / RING_STEPS) * Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    this.ringTexture.needsUpdate = true;
  }

  /** A storybook card on the paper: small heading, big title, a line of text. */
  private drawBanner(kicker: string, title: string, body: string, footer = ''): void {
    this.banner.scale.setScalar(1);
    this.banner.position.y = 0.03;
    const canvas = this.bannerCanvas;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    // A clean white card: soft shadow, a thick yellow border, a navy kicker pill, bold sans type.
    ctx.save();
    ctx.shadowColor = 'rgba(10, 20, 45, 0.35)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = UI.white;
    themeRoundRect(ctx, 16, 12, w - 32, h - 34, 44);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = UI.yellow;
    ctx.lineWidth = 10;
    themeRoundRect(ctx, 21, 17, w - 42, h - 44, 40);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // The kicker in a navy pill.
    const kickerPx = fitFont(ctx, kicker.toUpperCase(), 800, 28, w - 260);
    const kw = ctx.measureText(kicker.toUpperCase()).width + 56;
    ctx.fillStyle = UI.navy;
    themeRoundRect(ctx, w / 2 - kw / 2, 52, kw, kickerPx + 24, (kickerPx + 24) / 2);
    ctx.fill();
    ctx.fillStyle = UI.white;
    ctx.fillText(kicker.toUpperCase(), w / 2, 52 + (kickerPx + 24) / 2 + 1);
    const stars = /^[★☆]+$/.test(title);
    if (stars) {
      // Big gold stars with a navy outline; empty ones pale.
      ctx.font = font(900, 112);
      ctx.lineJoin = 'round';
      const gap = 120;
      [...title].forEach((ch, i) => {
        const x = w / 2 + (i - (title.length - 1) / 2) * gap;
        ctx.lineWidth = 10;
        ctx.strokeStyle = UI.navy;
        ctx.strokeText('★', x, 168);
        ctx.fillStyle = ch === '★' ? UI.yellow : '#e3e8f0';
        ctx.fillText('★', x, 168);
      });
    } else {
      ctx.fillStyle = UI.navy;
      fitFont(ctx, title, 800, 76, w - 120);
      ctx.fillText(title, w / 2, 168);
    }
    ctx.fillStyle = UI.ink;
    ctx.font = font(500, 34);
    wrapText(ctx, body, w / 2, 262, w - 200, 46);
    if (footer) {
      ctx.fillStyle = UI.green;
      fitFont(ctx, footer, 700, 28, w - 140);
      ctx.fillText(footer, w / 2, h - 70);
    }
    this.bannerTexture.needsUpdate = true;
  }

  /** What the game wants the banner to say; a hands prompt may stand in for it. */
  private setCaption(text: string): void {
    this.wantedCaption = text;
    this.paintCaption(this.handsHint ?? text);
  }

  /**
   * No hands seen for a moment in the headset: say how to bring them back
   * (hand tracking drops in dim light, or with hands out of view), or, with
   * controllers in hand, that this game is played with bare hands.
   */
  private watchHands(dt: number, inHeadset: boolean): void {
    const anyHand = stage.tracked[0] || stage.tracked[1];
    this.handsGone = inHeadset && !anyHand && !stage.arena ? this.handsGone + dt : 0;
    let hint: string | null = null;
    if (this.handsGone > HANDS_HINT_AFTER) {
      const sources = this.renderer.xr.getSession()?.inputSources;
      const controllers = !!sources && Array.from(sources).some((s) => !s.hand && !!s.gamepad);
      hint = controllers ? '🎮 Put the controllers down: this game is played with your hands' : '✋ Hold your hands up in front of you, in good light';
    }
    if (hint === this.handsHint) return;
    this.handsHint = hint;
    this.paintCaption(hint ?? this.wantedCaption);
  }

  private paintCaption(text: string): void {
    if (text === this.caption) return;
    this.caption = text;
    const canvas = this.captionCanvas;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // A navy pill with a bright yellow underline and bold white type.
    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    ctx.shadowColor = 'rgba(8, 14, 32, 0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = 'rgba(20, 33, 61, 0.94)';
    themeRoundRect(ctx, 8, 6, w - 16, h - 16, (h - 16) / 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = UI.yellow;
    themeRoundRect(ctx, w * 0.3, h - 13, w * 0.4, 6, 3);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = UI.white;
    fitFont(ctx, text, 700, 46, w - 90);
    ctx.fillText(text, w / 2, h / 2 - 1);
    this.captionTexture.needsUpdate = true;
  }
}

/** A shadow cut off by the paper edge cannot be judged fairly. */
function touchesEdge(b: MaskBounds): boolean {
  return b.minX <= 0 || b.minY <= 0 || b.maxX >= MASK_WIDTH - 1 || b.maxY >= MASK_HEIGHT - 1;
}

function ghostFocus(problem: Problem): GhostFocus {
  if (problem === null || problem === 'direction' || problem === 'twoHands' ||
    problem === 'offPaper' || problem === 'noShadow') return null;
  return problem;
}

function hintFor(
  problem: Exclude<Problem, null>,
  wants: Record<Finger, string>,
  spread?: 'wide' | 'together',
): string {
  if (problem === 'spread') {
    return spread === 'wide' ? 'Spread your fingers like feathers' : 'Keep your fingers together';
  }
  if (problem === 'direction') return 'Point your fingers up';
  if (problem === 'thumbs') return 'Hook your thumbs together';
  if (problem === 'twoHands') return 'This one needs both hands';
  if (problem === 'offPaper' || problem === 'noShadow') return 'Raise your hand into the lantern light';
  const verb = wants[problem] === 'out' ? 'Stretch' : 'Fold';
  return problem === 'thumb' ? `${verb} your thumb` : `${verb} your ${problem} finger`;
}

/** Centred text broken into lines that fit `maxWidth`. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  // A line break in the text starts a new paragraph.
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lineHeight;
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, x, y);
    y += lineHeight;
  }
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function makeTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Draws a cell map as a soft-edged white silhouette filling the canvas width (a square at the top). */
/**
 * A shape as a clean line around its edge, for the target on the paper: the
 * silhouette is grown in sixteen directions and the shape itself cut back
 * out, which leaves a band hugging the outside. `halo` draws it wide and soft.
 */
function drawTargetLine(canvas: HTMLCanvasElement, cells: Uint8Array, halo: boolean): void {
  const small = makeCanvas(GRID, GRID);
  const sctx = small.getContext('2d')!;
  const image = sctx.createImageData(GRID, GRID);
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const o = ((GRID - 1 - gy) * GRID + gx) * 4;
      image.data[o] = image.data[o + 1] = image.data[o + 2] = 255;
      image.data[o + 3] = cells[gy * GRID + gx] ? 255 : 0;
    }
  }
  sctx.putImageData(image, 0, 0);
  const ctx = canvas.getContext('2d')!;
  const s = canvas.width;
  const px = s / 256;
  ctx.clearRect(0, 0, s, s);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  const reach = (halo ? 9 : 3.4) * px;
  ctx.filter = `blur(${(halo ? 5 : 1.1) * px}px)`;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.drawImage(small, Math.cos(a) * reach, Math.sin(a) * reach, s, s);
  }
  ctx.globalCompositeOperation = 'destination-out';
  ctx.filter = `blur(${0.8 * px}px)`;
  ctx.drawImage(small, 0, 0, s, s);
  if (!halo) {
    // A faint fill: the place to put your shadow.
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.14;
    ctx.drawImage(small, 0, 0, s, s);
  }
  ctx.restore();
}

function drawSilhouette(
  canvas: HTMLCanvasElement,
  cells: Uint8Array,
  blur: number,
  alpha: number,
): void {
  const small = makeCanvas(GRID, GRID);
  const sctx = small.getContext('2d')!;
  const image = sctx.createImageData(GRID, GRID);
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      // Cell rows start at the bottom; canvas rows start at the top.
      const o = ((GRID - 1 - gy) * GRID + gx) * 4;
      image.data[o] = 255;
      image.data[o + 1] = 255;
      image.data[o + 2] = 255;
      image.data[o + 3] = cells[gy * GRID + gx] ? 255 : 0;
    }
  }
  sctx.putImageData(image, 0, 0);

  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.filter = `blur(${blur * (canvas.width / 256)}px)`;
  ctx.globalAlpha = alpha;
  ctx.drawImage(small, 0, 0, canvas.width, canvas.width);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
