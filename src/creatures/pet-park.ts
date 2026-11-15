import {
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  BoxGeometry,
  ConeGeometry,
  Vector3,
} from '@iwsdk/core';
import { playClick, playCollect, playPop, playTink, playWhoosh } from '../audio.js';
import { add as addResource, count } from '../bag.js';
import { stage } from '../stage-state.js';
import { FONT } from '../ui-theme.js';
import type { Beast } from './beast.js';
import type { ActStep, TaskStep } from './creature.js';
import type { HandState } from './hand-input.js';

/**
 * The Pet Park (Shadow Pets): choose your animal, make its shadow, and it
 * comes alive on the table. Then look after it and teach it, like a real pet:
 *
 *   The board on the table: choose a pet, and push any of 28 tricks.
 *   Hand signals, as dog trainers use: palm up (sit), palm down high above it
 *   (lie down), palm facing it (stay), finger gun (play dead), point at the
 *   table (go there), a quick lift of the open hand (jump).
 *   Your voice, where the browser can hear it (switch it on on the board).
 *   Play: throw the ball and it fetches; build a log hurdle, a hoop and a pet
 *   house from the wood and stone in your Bag, and it jumps, dives and naps.
 */

export interface ParkGround {
  /** Centre of the stage's top surface (world). */
  center: Vector3;
  /** The player's eyes (world). */
  viewer: Vector3;
}

type Page = 'choose' | 'tricks' | 'more' | 'play' | 'signals';

interface Tile {
  id: string;
  icon: string;
  label: string;
  /** Words that call it by voice. */
  words?: string[];
}

/** The animals you can choose, with the hand shape that makes each one's shadow. */
export const PARK_PETS: Array<{ id: string; icon: string; name: string; how: string }> = [
  { id: 'fox', icon: '🦊', name: 'Fox', how: 'Index and pinky up, the rest touching' },
  { id: 'horse', icon: '🐴', name: 'Horse', how: 'Flat hand on its side, thumb up' },
  { id: 'stag', icon: '🦌', name: 'Stag', how: 'Three fingers up for antlers' },
];

const TRICKS: Tile[] = [
  { id: 'come', icon: '👋', label: 'Come', words: ['come', 'here'] },
  { id: 'sit', icon: '🪑', label: 'Sit', words: ['sit'] },
  { id: 'down', icon: '⬇️', label: 'Lie down', words: ['down', 'lie'] },
  { id: 'stay', icon: '✋', label: 'Stay', words: ['stay', 'wait'] },
  { id: 'jump', icon: '⤴️', label: 'Jump', words: ['jump', 'up'] },
  { id: 'spin', icon: '🌀', label: 'Spin', words: ['spin', 'turn'] },
  { id: 'roll', icon: '🔄', label: 'Roll over', words: ['roll'] },
  { id: 'dead', icon: '💥', label: 'Play dead', words: ['dead', 'bang'] },
  { id: 'speak', icon: '🗣️', label: 'Speak', words: ['speak', 'talk', 'bark'] },
  { id: 'beg', icon: '🙏', label: 'Beg', words: ['beg', 'please'] },
  { id: 'five', icon: '🖐️', label: 'High five', words: ['five', 'paw'] },
  { id: 'dance', icon: '💃', label: 'Dance', words: ['dance'] },
];

const MORE: Tile[] = [
  { id: 'bow', icon: '🙇', label: 'Bow', words: ['bow'] },
  { id: 'rear', icon: '🐎', label: 'Rear up', words: ['rear', 'stand'] },
  { id: 'shake', icon: '💦', label: 'Shake off', words: ['shake'] },
  { id: 'yes', icon: '👍', label: 'Nod yes', words: ['yes', 'nod'] },
  { id: 'no', icon: '👎', label: 'Shake no', words: ['no'] },
  { id: 'hops', icon: '🐇', label: 'Happy hops', words: ['hop', 'happy'] },
  { id: 'pounce', icon: '🐾', label: 'Pounce', words: ['pounce', 'attack'] },
  { id: 'laps', icon: '🏃', label: 'Run laps', words: ['run', 'laps', 'race'] },
  { id: 'follow', icon: '☝️', label: 'Follow finger', words: ['follow', 'heel'] },
  { id: 'eat', icon: '🍓', label: 'Eat', words: ['eat', 'dinner', 'food'] },
  { id: 'drink', icon: '💧', label: 'Drink', words: ['drink', 'water'] },
  { id: 'sleep', icon: '😴', label: 'Sleep', words: ['sleep', 'bed', 'night'] },
];

const PLAY: Tile[] = [
  { id: 'fetch', icon: '🎾', label: 'Fetch', words: ['fetch', 'ball', 'get'] },
  { id: 'log', icon: '🪵', label: 'Jump the log', words: ['log', 'over'] },
  { id: 'hoop', icon: '⭕', label: 'Through hoop', words: ['hoop', 'through'] },
  { id: 'home', icon: '🏠', label: 'Go home', words: ['home', 'house', 'kennel'] },
  { id: 'build-log', icon: '🪵', label: 'Build log' },
  { id: 'build-hoop', icon: '⭕', label: 'Build hoop' },
  { id: 'build-house', icon: '🏠', label: 'Build house' },
  { id: 'voice', icon: '🎤', label: 'Voice' },
];

/** Every trick, in board order (for testing them all). */
export const PARK_TRICKS = [...TRICKS, ...MORE, ...PLAY.slice(0, 4)].map((t) => t.id);

/** What each build costs from the Bag (the first of each is free, a starter kit). */
const BUILDS: Record<string, { name: string; needs: Partial<Record<'wood' | 'stone' | 'crystal', number>> }> = {
  log: { name: 'log hurdle', needs: { wood: 2 } },
  hoop: { name: 'hoop', needs: { wood: 1, crystal: 1 } },
  house: { name: 'pet house', needs: { wood: 3, stone: 1 } },
};

const SIGNALS = [
  ['🖐️⬆', 'Open hand, palm UP, over your pet', 'Sit'],
  ['🖐️⬇', 'Open hand, palm DOWN, high above it', 'Lie down'],
  ['✋', 'Open hand, palm facing it', 'Stay'],
  ['👉', 'Point at a spot on the table', 'Go there'],
  ['🔫', 'Finger gun at it: bang!', 'Play dead'],
  ['🙌', 'Lift your open hand up quickly', 'Jump'],
  ['🤏', 'Pinch the ball and throw it', 'Fetch'],
  ['🫳', 'Rest your palm on its back', 'Sleep'],
] as const;

/** Stage-local spots (metres; +z towards you), on the table's surface. */
const FRONT = new Vector3(0, 0, 0.13);
const WATER_AT = new Vector3(0.38, 0, 0.06);
const LOG_AT = new Vector3(-0.05, 0, -0.12);
const HOOP_AT = new Vector3(0.22, 0, -0.22);
const HOUSE_AT = new Vector3(-0.4, 0, -0.28);
const BALL_HOME = new Vector3(-0.16, 0, 0.16);
const BOARD_AT = new Vector3(-0.47, 0.075, -0.1);
const BOARD_W = 0.3;
const BOARD_H = 0.21;
/** The table's playable area, stage-local. */
const AREA = { x: 0.56, zBack: -0.52, zFront: 0.24 };

const KEY = 'shadowplay.petpark.v1';

interface Built {
  log: boolean;
  hoop: boolean;
  house: boolean;
}

function loadBuilt(): Built {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { log: false, hoop: false, house: false, ...JSON.parse(raw) };
  } catch {
    /* private window: nothing kept */
  }
  return { log: false, hoop: false, house: false };
}

export class PetPark {
  readonly group = new Group();
  private readonly board = new Group();
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private page: Page = 'choose';
  private boardKey = '';
  private flashTile = -1;
  private flashTime = 0;
  private pressWait = 0;
  private readonly wasIn = [false, false];
  private message = '';
  private messageTime = 0;

  private readonly ball: Mesh;
  private readonly ballPos = new Vector3();
  private readonly ballVel = new Vector3();
  private ballHand = -1;
  /** The ball rides in the pet's mouth while it fetches. */
  private carried = false;
  private readonly logMesh: Group;
  private readonly hoopMesh: Group;
  private readonly houseMesh: Group;
  private built: Built = loadBuilt();

  /** The label over the pet: what it was just asked to do. */
  private readonly label: Sprite;
  private readonly labelCanvas = document.createElement('canvas');
  private readonly labelTexture: CanvasTexture;
  private labelTime = 0;

  /** Hand signals: how long each hand has held a sign, and a rest after one is obeyed. */
  private readonly signTime = [0, 0];
  private readonly signNow: Array<string | null> = [null, null];
  private signRest = 0;
  private readonly lastPalmY = [0, 0];
  private readonly aim: Mesh;

  /** Following your fingertip, for this many more seconds; a nap to start once a trick ends. */
  private followFor = 0;
  private napAfter = false;
  private recognizer: { stop(): void } | null = null;
  private voiceOn = false;

  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly q = new Quaternion();

  constructor(private readonly stageRoot: Object3D, private readonly floor: number) {
    this.group.name = 'PetPark';
    this.stageRoot.add(this.group);

    // The board: a tablet propped on the table, front left, within easy reach.
    this.canvas.width = 1024;
    this.canvas.height = Math.round((1024 * BOARD_H) / BOARD_W);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    const face = new Mesh(new PlaneGeometry(BOARD_W, BOARD_H), new MeshBasicMaterial({ map: this.texture, transparent: true }));
    face.renderOrder = 6;
    const back = new Mesh(new BoxGeometry(BOARD_W + 0.012, BOARD_H + 0.012, 0.008), new MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.8 }));
    back.position.z = -0.0045;
    this.board.add(back, face);
    this.board.position.copy(BOARD_AT).setY(floor + BOARD_AT.y);
    this.group.add(this.board);

    // The ball.
    this.ball = new Mesh(new SphereGeometry(0.014, 18, 12), new MeshStandardMaterial({ color: 0xd8f03a, roughness: 0.55 }));
    this.ball.castShadow = true;
    this.ballPos.copy(BALL_HOME).setY(floor + 0.014);
    this.group.add(this.ball);

    // The water dish.
    const dish = new Group();
    const blue = new MeshStandardMaterial({ color: 0x3a7bd5, roughness: 0.4 });
    const rim = new Mesh(new CylinderGeometry(0.036, 0.03, 0.016, 22, 1, true), blue);
    rim.position.y = 0.008;
    const water = new Mesh(new CylinderGeometry(0.033, 0.033, 0.002, 22), new MeshStandardMaterial({ color: 0x8fd4ff, roughness: 0.1, metalness: 0.1, emissive: 0x1a4a7a, emissiveIntensity: 0.3 }));
    water.position.y = 0.011;
    const base = new Mesh(new CylinderGeometry(0.03, 0.03, 0.003, 22), blue);
    dish.add(rim, water, base);
    dish.position.copy(WATER_AT).setY(floor);
    this.group.add(dish);

    // Things to build.
    this.logMesh = logHurdle();
    this.logMesh.position.copy(LOG_AT).setY(floor);
    this.hoopMesh = hoopStand();
    this.hoopMesh.position.copy(HOOP_AT).setY(floor);
    this.houseMesh = petHouse();
    this.houseMesh.position.copy(HOUSE_AT).setY(floor);
    this.group.add(this.logMesh, this.hoopMesh, this.houseMesh);
    this.showBuilt();

    // Where a pointing finger is sending the pet.
    this.aim = new Mesh(new TorusGeometry(0.025, 0.003, 6, 28), new MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.85, depthWrite: false }));
    this.aim.rotation.x = -Math.PI / 2;
    this.aim.visible = false;
    this.group.add(this.aim);

    this.labelCanvas.width = 512;
    this.labelCanvas.height = 128;
    this.labelTexture = new CanvasTexture(this.labelCanvas);
    this.labelTexture.colorSpace = SRGBColorSpace;
    this.label = new Sprite(new SpriteMaterial({ map: this.labelTexture, transparent: true, depthTest: false, depthWrite: false }));
    this.label.scale.set(0.16, 0.04, 1);
    this.label.renderOrder = 14;
    this.label.visible = false;
    this.group.add(this.label);
  }

  set visible(on: boolean) {
    this.group.visible = on;
    if (!on) this.setVoice(false);
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** Back to choosing a pet (New pet, or the park reopened). */
  reset(): void {
    this.page = 'choose';
    this.boardKey = '';
    this.followFor = 0;
    this.carried = false;
    this.ballPos.copy(BALL_HOME).setY(this.floor + 0.014);
    this.ballVel.set(0, 0, 0);
  }

  update(dt: number, hands: readonly HandState[], pets: readonly Beast[], ground: ParkGround, bowl: Vector3): void {
    if (!this.group.visible) return;
    const pet = pets.find((p) => p.emerged) ?? null;
    if (pet && this.page === 'choose') this.page = 'tricks';
    if (!pet && this.page !== 'choose' && !stage.petChoice) this.page = 'choose';
    this.messageTime = Math.max(0, this.messageTime - dt);
    if (this.messageTime === 0) this.message = '';
    this.faceBoard(ground.viewer);
    this.pressBoard(dt, hands, pet, ground, bowl);
    this.drawBoard(pet);
    this.updateBall(dt, hands, pet, ground);
    if (pet) {
      this.signals(dt, hands, pet, ground);
      this.follow(dt, hands, pet, ground);
      if (this.napAfter && pet.state === 'idle') {
        this.napAfter = false;
        pet.tuckIn();
      }
    } else this.aim.visible = false;
    this.updateLabel(dt, pet);
  }

  // ------------------------------------------------------------------ Board

  private faceBoard(viewer: Vector3): void {
    // Turned to face your eyes, so it reads square on.
    this.board.parent!.updateWorldMatrix(true, false);
    const at = this.board.getWorldPosition(this.v);
    this.w.copy(viewer);
    this.w.y = at.y + (viewer.y - at.y) * 0.85;
    this.board.lookAt(this.w);
  }

  private tiles(): Tile[] {
    if (this.page === 'choose') return PARK_PETS.map((p) => ({ id: `pet-${p.id}`, icon: p.icon, label: p.name }));
    if (this.page === 'tricks') return TRICKS;
    if (this.page === 'more') return MORE;
    if (this.page === 'play') return PLAY;
    return [];
  }

  /** Layout in canvas pixels: the tab row, then the tiles (4 × 3, or 3 big ones to choose a pet). */
  private tabRects(): Array<[Page, number, number, number, number]> {
    const W = this.canvas.width;
    const pages: Page[] = ['tricks', 'more', 'play', 'signals'];
    const w = (W - 40) / pages.length;
    return pages.map((p, i) => [p, 20 + i * w, 16, w - 10, 84]);
  }

  private tileRects(n: number): Array<[number, number, number, number]> {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const top = 116;
    if (this.page === 'choose') {
      const w = (W - 60) / 3;
      return Array.from({ length: n }, (_, i) => [20 + i * (w + 10), top + 60, w, H - top - 80]);
    }
    const cols = 4;
    const rows = 3;
    const w = (W - 40 - (cols - 1) * 10) / cols;
    const h = (H - top - 20 - (rows - 1) * 10) / rows;
    return Array.from({ length: n }, (_, i) => [20 + (i % cols) * (w + 10), top + Math.floor(i / cols) * (h + 10), w, h]);
  }

  private pressBoard(dt: number, hands: readonly HandState[], pet: Beast | null, ground: ParkGround, bowl: Vector3): void {
    this.pressWait = Math.max(0, this.pressWait - dt);
    this.flashTime = Math.max(0, this.flashTime - dt);
    const W = this.canvas.width;
    const H = this.canvas.height;
    hands.forEach((hand, h) => {
      if (!hand.tracked) {
        this.wasIn[h] = false;
        return;
      }
      const p = this.board.worldToLocal(this.v.copy(hand.indexTip));
      const inside = Math.abs(p.x) < BOARD_W / 2 && Math.abs(p.y) < BOARD_H / 2 && p.z < 0.012 && p.z > -0.03;
      const entered = inside && !this.wasIn[h];
      this.wasIn[h] = inside;
      if (!entered || this.pressWait > 0) return;
      const px = (p.x / BOARD_W + 0.5) * W;
      const py = (0.5 - p.y / BOARD_H) * H;
      this.pressWait = 0.35;
      if (this.page !== 'choose') {
        for (const [page, x, y, w, hh] of this.tabRects()) {
          if (px >= x && px <= x + w && py >= y && py <= y + hh) {
            this.page = page;
            playClick();
            return;
          }
        }
      }
      const tiles = this.tiles();
      this.tileRects(tiles.length).forEach(([x, y, w, hh], i) => {
        if (px < x || px > x + w || py < y || py > y + hh) return;
        this.flashTile = i;
        this.flashTime = 0.35;
        playClick();
        this.pressTile(tiles[i].id, pet, ground, bowl);
      });
    });
  }

  private pressTile(id: string, pet: Beast | null, ground: ParkGround, bowl: Vector3): void {
    if (id.startsWith('pet-')) {
      stage.petChoice = id.slice(4);
      const choice = PARK_PETS.find((p) => p.id === stage.petChoice)!;
      this.say(`Now make the ${choice.name}'s shadow: ${choice.how.toLowerCase()}`);
      return;
    }
    if (id.startsWith('build-')) {
      this.build(id.slice(6) as keyof Built);
      return;
    }
    if (id === 'voice') {
      this.setVoice(!this.voiceOn);
      return;
    }
    if (!pet) {
      this.say('Choose a pet and make its shadow first');
      return;
    }
    this.command(id, pet, ground, bowl);
  }

  private say(text: string, seconds = 3.5): void {
    this.message = text;
    this.messageTime = seconds;
    this.boardKey = '';
  }

  private drawBoard(pet: Beast | null): void {
    const tiles = this.tiles();
    const key = `${this.page}|${this.flashTime > 0 ? this.flashTile : -1}|${this.message}|${this.voiceOn}|${JSON.stringify(this.built)}|${pet?.kind ?? ''}|${stage.petChoice ?? ''}`;
    if (key === this.boardKey) return;
    this.boardKey = key;
    const g = this.canvas.getContext('2d')!;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#14213d';
    g.beginPath();
    g.roundRect(0, 0, W, H, 30);
    g.fill();
    g.strokeStyle = '#ffc928';
    g.lineWidth = 8;
    g.stroke();
    g.textBaseline = 'middle';
    if (this.page === 'choose') {
      g.fillStyle = '#ffc928';
      g.font = `900 46px ${FONT}`;
      g.textAlign = 'center';
      g.fillText('CHOOSE YOUR PET', W / 2, 62);
      g.fillStyle = '#d4def4';
      g.font = `700 30px ${FONT}`;
      g.fillText(this.message || 'Touch one, then make its shadow in the light', W / 2, 140, W - 60);
    } else {
      for (const [page, x, y, w, h] of this.tabRects()) {
        const on = page === this.page;
        g.fillStyle = on ? '#ffc928' : 'rgba(255,255,255,0.1)';
        g.beginPath();
        g.roundRect(x, y, w, h, 18);
        g.fill();
        g.fillStyle = on ? '#14213d' : '#ffffff';
        g.font = `900 34px ${FONT}`;
        g.textAlign = 'center';
        g.fillText({ tricks: 'TRICKS', more: 'MORE', play: 'PLAY · BUILD', signals: 'SIGNALS', choose: '' }[page], x + w / 2, y + h / 2 + 2, w - 16);
      }
    }
    if (this.page === 'signals') {
      g.textAlign = 'left';
      SIGNALS.forEach(([icon, how, does], i) => {
        const y = 140 + i * 66;
        g.fillStyle = '#ffffff';
        g.font = `40px "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        g.fillText(icon, 30, y);
        g.fillStyle = '#ffc928';
        g.font = `900 30px ${FONT}`;
        g.fillText(does, 150, y);
        g.fillStyle = '#ffffff';
        g.font = `700 27px ${FONT}`;
        g.fillText(how, 330, y, W - 350);
      });
    }
    const rects = this.tileRects(tiles.length);
    tiles.forEach((tile, i) => {
      const [x, y, w, h] = rects[i];
      const lit = this.flashTime > 0 && this.flashTile === i;
      const locked = this.locked(tile.id);
      g.fillStyle = lit ? '#ffc928' : locked ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.13)';
      g.beginPath();
      g.roundRect(x, y, w, h, 18);
      g.fill();
      if (tile.id === `pet-${stage.petChoice}`) {
        g.strokeStyle = '#7dffb0';
        g.lineWidth = 6;
        g.stroke();
      }
      g.textAlign = 'center';
      const big = this.page === 'choose';
      // Solid: a colour emoji takes the fill's opacity, and the tile's is nearly clear.
      g.fillStyle = '#ffffff';
      g.font = `${big ? 110 : 52}px "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      g.fillText(tile.icon, x + w / 2, y + h * (big ? 0.36 : 0.38));
      g.fillStyle = lit ? '#14213d' : locked ? 'rgba(255,255,255,0.4)' : '#ffffff';
      g.font = `900 ${big ? 46 : 30}px ${FONT}`;
      g.fillText(this.tileLabel(tile), x + w / 2, y + h * (big ? 0.7 : 0.8), w - 12);
      if (big) {
        const how = PARK_PETS.find((p) => `pet-${p.id}` === tile.id)?.how ?? '';
        g.fillStyle = '#9fb3d9';
        g.font = `700 22px ${FONT}`;
        wrap(g, how, w - 24).slice(0, 2).forEach((row, j) => g.fillText(row, x + w / 2, y + h * 0.83 + j * 26));
      }
    });
    if (this.page !== 'choose' && this.message) {
      // A message strip along the bottom.
      g.fillStyle = 'rgba(10, 16, 30, 0.92)';
      g.beginPath();
      g.roundRect(20, H - 74, W - 40, 60, 16);
      g.fill();
      g.fillStyle = '#7dffb0';
      g.font = `800 28px ${FONT}`;
      g.textAlign = 'center';
      g.fillText(this.message, W / 2, H - 44, W - 60);
    }
    this.texture.needsUpdate = true;
  }

  private tileLabel(tile: Tile): string {
    if (tile.id === 'voice') return this.voiceOn ? 'Voice: ON' : 'Voice: off';
    if (tile.id.startsWith('build-')) {
      const what = tile.id.slice(6) as keyof Built;
      return this.built[what] ? 'Built ✓' : `${tile.label} (${needsText(BUILDS[what].needs)})`;
    }
    return tile.label;
  }

  /** A play tile whose prop is not built yet. */
  private locked(id: string): boolean {
    return (id === 'log' && !this.built.log) || (id === 'hoop' && !this.built.hoop) || (id === 'home' && !this.built.house);
  }

  // ------------------------------------------------------------------ Build

  /** Dev: every prop built. */
  buildAll(): void {
    for (const what of ['log', 'hoop', 'house'] as const) if (!this.built[what]) this.build(what);
  }

  private build(what: keyof Built): void {
    if (this.built[what]) {
      this.say(`Your ${BUILDS[what].name} is already up`);
      return;
    }
    const needs = BUILDS[what].needs;
    const afford = Object.entries(needs).every(([r, n]) => count(r as 'wood') >= (n ?? 0));
    if (afford) {
      for (const [r, n] of Object.entries(needs)) addResource(r as 'wood', -(n ?? 0));
      this.say(`Built a ${BUILDS[what].name} from ${needsText(needs)} in your Bag!`);
    } else {
      this.say(`A starter ${BUILDS[what].name}, on the house! (Gather wood in the levels for more)`);
    }
    this.built[what] = true;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.built));
    } catch {
      /* not kept */
    }
    playCollect();
    this.showBuilt();
  }

  private showBuilt(): void {
    this.logMesh.visible = this.built.log;
    this.hoopMesh.visible = this.built.hoop;
    this.houseMesh.visible = this.built.house;
  }

  // --------------------------------------------------------------- Commands

  /** World point on the table at a stage-local spot. */
  private spot(local: Vector3, out = new Vector3()): Vector3 {
    return this.stageRoot.localToWorld(out.set(local.x, this.floor, local.z));
  }

  /** Ask the pet to do a trick (from the board, a hand signal or your voice). */
  command(id: string, pet: Beast, ground: ParkGround, bowl: Vector3, at?: Vector3): void {
    if (pet.state === 'held' || pet.state === 'thrown' || pet.state === 'emerging' || pet.state === 'leaping') {
      this.say('Put it down first!');
      return;
    }
    const steps = this.steps(id, pet, ground, bowl, at);
    if (!steps) return;
    this.followFor = id === 'follow' ? 10 : 0;
    if (id !== 'follow') pet.cancelTask();
    if (steps.length) pet.perform(steps);
    const name = { fox: 'Fox', horse: 'Horse', stag: 'Stag' }[pet.kind] ?? 'Pet';
    const tile = [...TRICKS, ...MORE, ...PLAY].find((t) => t.id === id);
    const what = id === 'go' ? 'Go there' : tile?.label ?? id;
    pet.feelings.obeyed(`${what}! Good ${name}`);
    this.showLabel(`${what}!`);
  }

  private steps(id: string, pet: Beast, ground: ParkGround, bowl: Vector3, at?: Vector3): TaskStep[] | null {
    const h = pet.height;
    const here = pet.position.clone();
    const face = ground.viewer.clone().setY(ground.center.y);
    const act = (s: Omit<ActStep, 'do'>): ActStep => ({ do: 'act', ...s });
    const sitClip = pet.hasClip('Sit') ? 'Sit' : 'Idle';
    const sitting = pet.hasClip('Sit') ? {} : { pitch: -0.42, lift: 0.06 };
    const ballAt = this.v.copy(this.ballPos).setY(this.floor);
    switch (id) {
      case 'come':
        return [{ do: 'walk', to: this.spot(FRONT) }, act({ time: 0.8, clip: 'Idle', face, sound: () => pet.speak() })];
      case 'sit':
        return [act({ time: 4, clip: sitClip, face, ...sitting })];
      case 'down':
        return [act({ time: 5, clip: pet.hasClip('Sit') ? 'Sit' : 'Idle_Headlow', face, lift: -0.3, pitch: 0.06 })];
      case 'stay':
        return [act({ time: 6, clip: 'Idle', face })];
      case 'jump':
        return [{ do: 'leap', to: here, height: h * 1.1, time: 0.8 }];
      case 'spin':
        return [act({ time: 1.6, clip: 'Walk', rate: 1.6, spin: 1 })];
      case 'roll':
        return [act({ time: 1.7, clip: 'Idle_HitReact_Left', once: true, roll: Math.PI * 2, lift: -0.15 })];
      case 'dead':
        return pet.hasClip('Death')
          ? [act({ time: 4.5, clip: 'Death', once: true }), act({ time: 0.6, clip: 'Idle' })]
          : [act({ time: 4.5, clip: 'Idle', roll: 1.45, lift: -0.25 })];
      case 'speak':
        return [act({ time: 1.3, clip: 'Idle', face, sound: () => pet.speak(), nod: 0.08, beat: 3 })];
      case 'beg':
        return [act({ time: 3, clip: sitClip, face, pitch: -0.62, lift: 0.14, nod: 0.05, beat: 2 })];
      case 'five':
        return [act({ time: 1.5, clip: 'Attack', once: true, face, pitch: -0.45, lift: 0.08, sound: () => playTink(0.05) })];
      case 'dance':
        return [act({ time: 3.2, clip: 'Walk', hop: 0.14, sway: 0.18, shake: 0.45, beat: 2 })];
      case 'bow':
        return [act({ time: 2.2, clip: 'Idle_Headlow', face, pitch: 0.35, lift: -0.06 })];
      case 'rear':
        return [act({ time: 1.7, clip: pet.hasClip('Attack_Kick') ? 'Attack_Kick' : 'Gallop_Jump', once: true, face, pitch: -0.8, lift: 0.12, sound: () => pet.speak() })];
      case 'shake':
        return [act({ time: 1.3, clip: 'Idle', sway: 0.24, shake: 0.12, beat: 9 })];
      case 'yes':
        return [act({ time: 1.6, clip: pet.hasClip('Sit_Yes') ? 'Sit_Yes' : 'Idle', face, nod: 0.2, beat: 2.5 })];
      case 'no':
        return [act({ time: 1.6, clip: 'Idle', face, shake: 0.42, beat: 2.5 })];
      case 'hops':
        return [act({ time: 2.2, clip: 'Idle', face, hop: 0.38, beat: 2.2, sound: () => pet.speak() })];
      case 'pounce': {
        const target = ballAt.clone();
        this.stageRoot.localToWorld(target);
        const from = here.clone().sub(target).setY(0).normalize().multiplyScalar(pet.length * 1.1).add(target);
        return [{ do: 'walk', to: from }, act({ time: 0.5, clip: 'Idle_Headlow', face: target, lift: -0.12 }), { do: 'leap', to: target, height: h * 0.5, time: 0.45 }, { do: 'call', run: () => this.kickBall(pet, 0.5) }];
      }
      case 'laps': {
        const steps: TaskStep[] = [];
        for (let i = 0; i <= 12; i++) {
          const a = (i / 6) * Math.PI;
          steps.push({ do: 'walk', to: this.spot(this.w.set(Math.cos(a) * 0.3, 0, -0.12 + Math.sin(a) * 0.22)) });
        }
        steps.push({ do: 'walk', to: this.spot(FRONT) }, act({ time: 1, clip: 'Idle', face, sound: () => pet.speak() }));
        return steps;
      }
      case 'follow':
        this.say('Hold one finger low over the table: it follows your fingertip');
        return [];
      case 'eat':
        return [{ do: 'walk', to: approach(bowl, here, pet.length * 0.75) }, act({ time: 3, clip: 'Eating', face: bowl }), { do: 'call', run: () => pet.feed() }];
      case 'drink': {
        const water = this.spot(WATER_AT);
        return [{ do: 'walk', to: approach(water, here, pet.length * 0.75) }, act({ time: 3, clip: 'Eating', face: water, sound: () => playPop(0.02) })];
      }
      case 'sleep':
        return [act({ time: 0.6, clip: 'Idle_Headlow' }), { do: 'call', run: () => (this.napAfter = true) }];
      case 'fetch': {
        if (this.ballHand >= 0) {
          this.say('Throw the ball first: pinch it, swing and let go');
          return null;
        }
        const ball = this.stageRoot.localToWorld(ballAt.clone());
        return [
          { do: 'walk', to: approach(ball, here, pet.length * 0.45) },
          act({ time: 0.5, clip: 'Eating', face: ball }),
          { do: 'call', run: () => (this.carried = true) },
          { do: 'walk', to: this.spot(FRONT) },
          act({ time: 0.8, clip: sitClip, face, ...sitting }),
          { do: 'call', run: () => this.dropBall(pet) },
        ];
      }
      case 'log': {
        if (!this.built.log) return this.needBuild('log');
        const left = this.spot(this.w.copy(LOG_AT).setX(LOG_AT.x - 0.13));
        const right = this.spot(this.w.copy(LOG_AT).setX(LOG_AT.x + 0.13));
        const [a, b] = here.distanceTo(left) < here.distanceTo(right) ? [left, right] : [right, left];
        return [{ do: 'walk', to: a }, act({ time: 0.4, clip: 'Idle', face: b }), { do: 'leap', to: b, height: h * 1.0, time: 0.8 }, act({ time: 1, clip: 'Idle', face, hop: 0.2, beat: 2, sound: () => pet.speak() })];
      }
      case 'hoop': {
        if (!this.built.hoop) return this.needBuild('hoop');
        const near = this.spot(this.w.copy(HOOP_AT).setX(HOOP_AT.x - 0.14));
        const far = this.spot(this.w.copy(HOOP_AT).setX(HOOP_AT.x + 0.14));
        const [a, b] = here.distanceTo(near) < here.distanceTo(far) ? [near, far] : [far, near];
        // Through the ring's middle: the leap's top carries its body through the hoop's centre.
        return [{ do: 'walk', to: a }, act({ time: 0.5, clip: 'Idle', face: b, lift: -0.1 }), { do: 'leap', to: b, height: Math.max(0.02, 0.085 - h * 0.45), time: 0.75 }, act({ time: 1, clip: 'Idle', face, sound: () => pet.speak() })];
      }
      case 'home': {
        if (!this.built.house) return this.needBuild('house');
        const door = this.spot(this.w.copy(HOUSE_AT).setZ(HOUSE_AT.z + 0.11));
        const inside = this.spot(HOUSE_AT);
        return [{ do: 'walk', to: door }, { do: 'walk', to: inside }, act({ time: 0.6, clip: 'Idle', face: door }), { do: 'call', run: () => (this.napAfter = true) }];
      }
      case 'go':
        return at ? [{ do: 'walk', to: at }, act({ time: 0.6, clip: 'Idle', face })] : null;
    }
    return null;
  }

  private needBuild(what: keyof Built): null {
    this.page = 'play';
    this.say(`Build the ${BUILDS[what].name} first: push Build ${what === 'house' ? 'house' : what}`);
    return null;
  }

  // ------------------------------------------------------------------ Ball

  private updateBall(dt: number, hands: readonly HandState[], pet: Beast | null, ground: ParkGround): void {
    const r = 0.014;
    if (this.carried && pet) {
      pet.mouth(this.v);
      this.ballPos.copy(this.stageRoot.worldToLocal(this.v));
      this.ballVel.set(0, 0, 0);
    } else if (this.ballHand >= 0) {
      const hand = hands[this.ballHand];
      if (!hand?.tracked || !hand.pinching) {
        // Thrown: the hand's speed, turned into the table's frame.
        this.stageRoot.getWorldQuaternion(this.q).invert();
        this.ballVel.copy(hand?.releaseVelocity ?? this.v.set(0, 0, 0)).applyQuaternion(this.q).clampLength(0, 3);
        this.ballHand = -1;
        if (this.ballVel.length() > 0.5) {
          playWhoosh(Math.min(1, this.ballVel.length() / 3));
          // A good throw: it chases the ball and brings it back, as any dog would.
          if (pet && pet.state === 'idle') window.setTimeout(() => this.autoFetch(pet, ground), 700);
        }
      } else this.ballPos.copy(this.stageRoot.worldToLocal(this.v.copy(hand.pinch)));
    } else {
      // Rolling and bouncing on the table.
      hands.forEach((hand, h) => {
        if (this.ballHand >= 0 || !hand.tracked || !hand.pinchStarted) return;
        this.stageRoot.localToWorld(this.w.copy(this.ballPos));
        if (this.w.distanceTo(hand.pinch) < 0.04) {
          this.ballHand = h;
          this.carried = false;
          playPop(0.03);
        }
      });
      const floorY = this.floor + r;
      this.ballVel.y -= 9.8 * dt;
      this.ballPos.addScaledVector(this.ballVel, dt);
      if (this.ballPos.y < floorY) {
        this.ballPos.y = floorY;
        if (this.ballVel.y < -0.4) playTink(Math.min(0.04, -this.ballVel.y * 0.01));
        this.ballVel.y = -this.ballVel.y * 0.45;
        if (Math.abs(this.ballVel.y) < 0.15) this.ballVel.y = 0;
        const friction = Math.max(0, 1 - 1.6 * dt);
        this.ballVel.x *= friction;
        this.ballVel.z *= friction;
      }
      // The table's edge: it bounces back in rather than falling off.
      if (Math.abs(this.ballPos.x) > AREA.x) {
        this.ballPos.x = Math.sign(this.ballPos.x) * AREA.x;
        this.ballVel.x *= -0.5;
      }
      if (this.ballPos.z < AREA.zBack || this.ballPos.z > AREA.zFront) {
        this.ballPos.z = Math.max(AREA.zBack, Math.min(AREA.zFront, this.ballPos.z));
        this.ballVel.z *= -0.5;
      }
    }
    this.ball.position.copy(this.ballPos);
    this.ball.rotation.x += this.ballVel.z * dt * 60;
    this.ball.rotation.z -= this.ballVel.x * dt * 60;
  }

  private autoFetch(pet: Beast, ground: ParkGround): void {
    if (!this.group.visible || pet.state !== 'idle' || this.ballHand >= 0 || this.carried) return;
    this.command('fetch', pet, ground, this.v.set(0, 0, 0));
  }

  private kickBall(pet: Beast, speed: number): void {
    this.stageRoot.worldToLocal(this.w.copy(pet.position));
    this.ballVel.set(this.ballPos.x - this.w.x, 0.4, this.ballPos.z - this.w.z).normalize().multiplyScalar(speed);
    playTink(0.04);
  }

  private dropBall(pet: Beast): void {
    this.carried = false;
    this.ballVel.set(0, 0.2, 0.15);
    pet.feelings.obeyed('It brought the ball back! Throw it again');
    this.showLabel('Good catch!');
  }

  // ------------------------------------------------------------ Hand signs

  /** Reads a hand sign held for a moment; each obeyed sign has a short rest after it. */
  private signals(dt: number, hands: readonly HandState[], pet: Beast, ground: ParkGround): void {
    this.signRest = Math.max(0, this.signRest - dt);
    const top = pet.position.y + pet.height;
    let aiming = false;
    hands.forEach((hand, h) => {
      const palmVy = dt > 0 ? (hand.palm.y - this.lastPalmY[h]) / dt : 0;
      this.lastPalmY[h] = hand.palm.y;
      if (!hand.tracked || hand.pinching || this.ballHand === h) {
        this.signTime[h] = 0;
        return;
      }
      const e = hand.ext;
      const open = e.index > 0.75 && e.middle > 0.75 && e.ring > 0.7;
      const across = Math.hypot(hand.palm.x - pet.position.x, hand.palm.z - pet.position.z);
      const height = hand.palm.y - ground.center.y;
      let sign: string | null = null;
      // The quick upward flick of an open hand: jump! (no hold needed)
      if (open && hand.palmNormal.y > 0.3 && palmVy > 0.9 && across < 0.45 && this.signRest === 0) {
        this.signRest = 1.6;
        this.command('jump', pet, ground, this.v);
        return;
      }
      if (open && hand.palmNormal.y > 0.65 && across < 0.4 && height > 0.06 && height < 0.5) sign = 'sit';
      else if (open && hand.palmNormal.y < -0.65 && across < 0.22 && hand.palm.y - top > 0.12 && height < 0.5) sign = 'down';
      else if (open && Math.abs(hand.palmNormal.y) < 0.35 && across < 0.45 && height < 0.45) {
        this.w.copy(pet.position).sub(hand.palm).setY(0).normalize();
        if (hand.palmNormal.x * this.w.x + hand.palmNormal.z * this.w.z > 0.6) sign = 'stay';
      } else if (e.index > 0.8 && e.middle < 0.45 && e.ring < 0.45 && e.pinky < 0.5) {
        this.w.copy(hand.indexTip).sub(hand.palm).normalize();
        if (e.thumb > 0.6) {
          // A finger gun aimed at it.
          this.v.copy(pet.position).addScaledVector(this.v.set(0, 1, 0), pet.height * 0.5).sub(hand.indexTip).normalize();
          if (this.w.dot(this.v) > 0.8) sign = 'dead';
        } else if (this.w.y < -0.35) {
          // Pointing down at the table: where it meets the table is where to go.
          const t = (ground.center.y - hand.indexTip.y) / this.w.y;
          if (t > 0 && t < 0.8) {
            this.v.copy(hand.indexTip).addScaledVector(this.w, t);
            const local = this.stageRoot.worldToLocal(this.v.clone());
            if (Math.abs(local.x) < AREA.x && local.z > AREA.zBack && local.z < AREA.zFront) {
              sign = 'go';
              aiming = true;
              this.aim.position.set(local.x, this.floor + 0.002, local.z);
            }
          }
        }
      }
      if (sign !== this.signNow[h]) {
        this.signNow[h] = sign;
        this.signTime[h] = 0;
      }
      if (!sign || this.signRest > 0) return;
      this.signTime[h] += dt;
      const hold = sign === 'go' ? 0.8 : sign === 'dead' ? 0.35 : 0.55;
      if (this.signTime[h] < hold) return;
      this.signTime[h] = 0;
      this.signRest = 2;
      if (sign === 'go') this.command('go', pet, ground, this.v, this.stageRoot.localToWorld(this.aim.position.clone()));
      else this.command(sign, pet, ground, this.v);
    });
    this.aim.visible = aiming;
    if (aiming) this.aim.scale.setScalar(1 + 0.15 * Math.sin(performance.now() / 120));
  }

  /** Follow my finger: it trots after your fingertip held low over the table. */
  private follow(dt: number, hands: readonly HandState[], pet: Beast, ground: ParkGround): void {
    if (this.followFor <= 0) return;
    this.followFor -= dt;
    const hand = hands.find((x) => x.tracked && x.ext.index > 0.7);
    if (!hand) return;
    const local = this.stageRoot.worldToLocal(this.v.copy(hand.indexTip));
    if (hand.indexTip.y - ground.center.y > 0.25) return;
    local.x = Math.max(-AREA.x, Math.min(AREA.x, local.x));
    local.z = Math.max(AREA.zBack, Math.min(AREA.zFront, local.z));
    const target = this.spot(local);
    if (pet.state === 'idle' || (pet.state === 'task' && pet.position.distanceTo(target) > pet.length * 1.2)) {
      if (pet.position.distanceTo(target) > pet.length * 0.8) {
        pet.cancelTask();
        pet.perform([{ do: 'walk', to: approach(target, pet.position, pet.length * 0.6) }]);
      }
    }
  }

  // ------------------------------------------------------------------ Voice

  private setVoice(on: boolean): void {
    if (!on) {
      this.voiceOn = false;
      this.recognizer?.stop();
      this.recognizer = null;
      return;
    }
    const Ctor = (window as unknown as { SpeechRecognition?: new () => SpeechLike; webkitSpeechRecognition?: new () => SpeechLike }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechLike }).webkitSpeechRecognition;
    if (!Ctor) {
      this.say('This browser cannot hear voices: use the board or hand signals', 4.5);
      return;
    }
    try {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = 'en-US';
      rec.onresult = (event) => {
        const result = event.results[event.results.length - 1];
        const said = result?.[0]?.transcript?.toLowerCase() ?? '';
        this.heard(said);
      };
      rec.onend = () => {
        // It stops after a pause: listen again while voice is on.
        if (this.voiceOn) {
          try {
            rec.start();
          } catch {
            /* already restarting */
          }
        }
      };
      rec.onerror = () => {
        this.say('Voice did not start: use the board or hand signals', 4);
        this.voiceOn = false;
      };
      rec.start();
      this.recognizer = rec;
      this.voiceOn = true;
      this.say('Listening: say "sit", "jump", "spin", "fetch"…', 4);
    } catch {
      this.say('Voice did not start: use the board or hand signals', 4);
    }
  }

  /** Pending voice command, picked up on the next update (it needs the pet and the ground). */
  pendingVoice: string | null = null;

  private heard(said: string): void {
    const tile = [...TRICKS, ...MORE, ...PLAY].find((t) => t.words?.some((w) => new RegExp(`\\b${w}\\b`).test(said)));
    if (tile) this.pendingVoice = tile.id;
  }

  /** Runs a command your voice gave since the last frame. */
  takeVoice(pet: Beast | null, ground: ParkGround, bowl: Vector3): void {
    if (!this.pendingVoice) return;
    const id = this.pendingVoice;
    this.pendingVoice = null;
    if (pet) this.command(id, pet, ground, bowl);
  }

  // ------------------------------------------------------------------ Label

  private showLabel(text: string): void {
    const g = this.labelCanvas.getContext('2d')!;
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = 'rgba(20, 33, 61, 0.92)';
    g.beginPath();
    g.roundRect(6, 10, 500, 108, 54);
    g.fill();
    g.strokeStyle = '#ffc928';
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = `900 58px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 66, 470);
    this.labelTexture.needsUpdate = true;
    this.labelTime = 1.8;
  }

  private updateLabel(dt: number, pet: Beast | null): void {
    this.labelTime = Math.max(0, this.labelTime - dt);
    this.label.visible = this.labelTime > 0 && !!pet;
    if (!pet || !this.label.visible) return;
    this.stageRoot.worldToLocal(this.v.copy(pet.position));
    this.label.position.set(this.v.x, this.v.y + pet.height * 1.6 + 0.04, this.v.z);
    (this.label.material as SpriteMaterial).opacity = Math.min(1, this.labelTime * 3);
  }
}

interface SpeechLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

/** A point `gap` short of `target`, on the side `from` comes from. */
function approach(target: Vector3, from: Vector3, gap: number): Vector3 {
  const d = from.clone().sub(target).setY(0);
  if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
  return target.clone().add(d.normalize().multiplyScalar(gap));
}

function needsText(needs: Partial<Record<string, number>>): string {
  return Object.entries(needs).map(([r, n]) => `${n} ${r}`).join(' + ');
}

function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const rows: string[] = [];
  let row = '';
  for (const word of text.split(' ')) {
    const next = row ? `${row} ${word}` : word;
    if (row && g.measureText(next).width > width) {
      rows.push(row);
      row = word;
    } else row = next;
  }
  if (row) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------- Props

/** A log on two little posts: a hurdle about 4 cm high, lying across the pet's path (along z). */
function logHurdle(): Group {
  const g = new Group();
  g.name = 'LogHurdle';
  const bark = new MeshStandardMaterial({ color: 0x7a4e2a, roughness: 0.9 });
  const ends = new MeshStandardMaterial({ color: 0xd2a676, roughness: 0.85 });
  const log = new Mesh(new CylinderGeometry(0.011, 0.012, 0.16, 14), [bark, ends, ends]);
  log.rotation.x = Math.PI / 2;
  log.position.y = 0.032;
  log.castShadow = true;
  g.add(log);
  for (const z of [-0.07, 0.07]) {
    const post = new Mesh(new CylinderGeometry(0.005, 0.006, 0.034, 8), bark);
    post.position.set(0, 0.017, z);
    g.add(post);
  }
  return g;
}

/** A hoop on a stand, facing along x, its middle about 8.5 cm up. */
function hoopStand(): Group {
  const g = new Group();
  g.name = 'Hoop';
  const ring = new Mesh(new TorusGeometry(0.045, 0.005, 10, 36), new MeshStandardMaterial({ color: 0xff5a7a, emissive: 0x7a1030, emissiveIntensity: 0.3, roughness: 0.4 }));
  ring.rotation.y = Math.PI / 2;
  ring.position.y = 0.085;
  const wood = new MeshStandardMaterial({ color: 0x9a6a3c, roughness: 0.8 });
  const post = new Mesh(new CylinderGeometry(0.004, 0.005, 0.04, 8), wood);
  post.position.y = 0.02;
  const foot = new Mesh(new CylinderGeometry(0.02, 0.022, 0.004, 14), wood);
  foot.position.y = 0.002;
  g.add(ring, post, foot);
  return g;
}

/** A little wooden pet house with a red roof, its door towards you. */
function petHouse(): Group {
  const g = new Group();
  g.name = 'PetHouse';
  const wood = new MeshStandardMaterial({ color: 0xc8935a, roughness: 0.8 });
  const dark = new MeshBasicMaterial({ color: 0x2a1a10, side: DoubleSide });
  const w = 0.16;
  const d = 0.17;
  const h = 0.12;
  const back = new Mesh(new BoxGeometry(w, h, 0.006), wood);
  back.position.set(0, h / 2, -d / 2);
  const left = new Mesh(new BoxGeometry(0.006, h, d), wood);
  left.position.set(-w / 2, h / 2, 0);
  const right = left.clone();
  right.position.x = w / 2;
  // The front wall, with a doorway (two side pieces and a lintel).
  const side = new Mesh(new BoxGeometry(w * 0.2, h, 0.006), wood);
  side.position.set(-w * 0.4, h / 2, d / 2);
  const side2 = side.clone();
  side2.position.x = w * 0.4;
  const lintel = new Mesh(new BoxGeometry(w, h * 0.2, 0.006), wood);
  lintel.position.set(0, h * 0.9, d / 2);
  const roof = new Mesh(new ConeGeometry(Math.hypot(w, d) * 0.62, 0.07, 4), new MeshStandardMaterial({ color: 0xc8402e, roughness: 0.6 }));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + 0.035;
  const floor = new Mesh(new PlaneGeometry(w, d), dark);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  for (const m of [back, left, right, side, side2, lintel, roof]) m.castShadow = true;
  g.add(back, left, right, side, side2, lintel, roof, floor);
  return g;
}
