import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  RingGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';

import { BUTTON, FONT, labelColor } from './ui-theme.js';

const BASE_RADIUS = 0.06;
const BASE_DEPTH = 0.012;
const CAP_RADIUS = 0.047;
const CAP_DEPTH = 0.016;
/** Cap face when nothing touches it, measured out from the back of the base. */
const CAP_REST = BASE_DEPTH + 0.014;
/** How far the cap travels before it bottoms out. */
const TRAVEL = 0.012;
/** The click happens this far down; it re-arms once the cap is nearly back up. */
const CLICK_AT = 0.0085;
const REARM_AT = 0.003;
/** Fingertip joints sit inside the finger pad by roughly this much. */
const FINGER_RADIUS = 0.008;
const SPRING = 18;

/** Default cap colour; setColor changes it per button. */
const DEFAULT_COLOR = BUTTON.red;

/**
 * The game's buttons are lantern lenses: a disc of coloured glass set in a
 * brushed-brass bezel on a dark iron backplate, lit from inside. Each has an
 * engraved icon and its word. The theme's bright colours become deep jewel
 * tones (ruby, emerald, sapphire, amber, amethyst), so a row of them reads at
 * a glance without looking like toys.
 */
const JEWEL: Record<number, number> = {
  [BUTTON.red]: 0xb81f35,
  [BUTTON.green]: 0x0f8a50,
  [BUTTON.blue]: 0x1f4fc4,
  [BUTTON.navy]: 0x26314d,
  [BUTTON.yellow]: 0xd48c0c,
  [BUTTON.teal]: 0x0b7f7a,
  [BUTTON.orange]: 0xcf5f12,
  [BUTTON.purple]: 0x5a32c0,
};

let backFace: CanvasTexture | null = null;

/** The back of every button: dark iron, a brass ring and four rivets, the lantern's sun in the middle. */
function backTexture(): CanvasTexture {
  if (backFace) return backFace;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const iron = g.createRadialGradient(64, 56, 4, 64, 64, 64);
  iron.addColorStop(0, '#3a404c');
  iron.addColorStop(1, '#15181e');
  g.fillStyle = iron;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#c9a25a';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#c9a25a';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.beginPath();
    g.arc(64 + Math.cos(a) * 38, 64 + Math.sin(a) * 38, 4, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(64 + Math.cos(a - 0.12) * 12, 64 + Math.sin(a - 0.12) * 12);
    g.lineTo(64 + Math.cos(a) * 24, 64 + Math.sin(a) * 24);
    g.lineTo(64 + Math.cos(a + 0.12) * 12, 64 + Math.sin(a + 0.12) * 12);
    g.fill();
  }
  g.beginPath();
  g.arc(64, 64, 10, 0, Math.PI * 2);
  g.fill();
  backFace = new CanvasTexture(canvas);
  backFace.colorSpace = SRGBColorSpace;
  return backFace;
}

let brass: MeshStandardMaterial | null = null;
let iron: MeshStandardMaterial | null = null;

/** The bezel and backplate are the same on every button: one material each. */
function metals(): { brass: MeshStandardMaterial; iron: MeshStandardMaterial } {
  brass ??= new MeshStandardMaterial({ color: 0xc9a25a, metalness: 0.9, roughness: 0.32 });
  iron ??= new MeshStandardMaterial({ color: 0x1b1f27, metalness: 0.6, roughness: 0.55 });
  return { brass, iron };
}

/**
 * A chunky round button. Push it with a fingertip: the lens follows the
 * finger down, clicks near the bottom of its travel and springs back up,
 * and glows brighter as a finger comes near. A ray click (mouse,
 * controller or pinch) presses it too.
 */
export class PushButton {
  readonly root = new Group();
  /** Overall size; the pop-in animation scales on top of it. */
  size = 1;
  private cap: Mesh;
  private capMaterial: MeshStandardMaterial;
  private face: Mesh;
  private faceCanvas: HTMLCanvasElement;
  private faceTexture: CanvasTexture;
  private halo: Mesh;
  private haloMaterial: MeshBasicMaterial;
  private travel = 0;
  private armed = true;
  private color: number = JEWEL[DEFAULT_COLOR];
  private text = '';
  /** A colour set with setColor wins over the label's own. */
  private pinned = false;
  /** The lens's own colour, and a lighter one it glows towards as a finger nears. */
  private idle = new Color(DEFAULT_COLOR);
  private lit = new Color(DEFAULT_COLOR).lerp(new Color(0xffffff), 0.45);
  private appear = 0;
  private shown = false;
  private time = 0;
  private local = new Vector3();

  constructor(parent: Object3D, text: string) {
    this.root.name = 'PushButton';
    this.root.visible = false;
    const { brass: bezelMetal, iron: plateMetal } = metals();

    // A dark iron backplate, and a brass bezel around the lens.
    const plate = new Mesh(new CylinderGeometry(BASE_RADIUS, BASE_RADIUS * 1.06, BASE_DEPTH, 48), plateMetal);
    plate.rotation.x = Math.PI / 2;
    plate.position.z = BASE_DEPTH / 2;
    const bezel = new Mesh(new TorusGeometry(CAP_RADIUS + 0.0055, 0.0042, 12, 56), bezelMetal);
    bezel.position.z = BASE_DEPTH + 0.002;
    this.root.add(plate, bezel);
    // The back: dark iron with a brass rosette, so a button seen from behind still looks made.
    const back = new Mesh(new CircleGeometry(BASE_RADIUS * 1.06, 48), new MeshBasicMaterial({ map: backTexture() }));
    back.rotation.y = Math.PI;
    back.position.z = -0.0005;
    this.root.add(back);

    // The light inside, seen as a soft ring around the bezel; it swells as a finger nears.
    this.haloMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false });
    this.halo = new Mesh(new RingGeometry(BASE_RADIUS * 0.98, BASE_RADIUS * 1.3, 56), this.haloMaterial);
    this.halo.position.z = BASE_DEPTH + 0.0005;
    this.root.add(this.halo);

    // The lens: coloured glass, lit from inside.
    this.capMaterial = new MeshStandardMaterial({
      color: DEFAULT_COLOR,
      roughness: 0.12,
      metalness: 0.1,
      emissive: this.idle.clone(),
      emissiveIntensity: 0.25,
    });
    this.cap = new Mesh(new CylinderGeometry(CAP_RADIUS * 0.96, CAP_RADIUS, CAP_DEPTH, 48), this.capMaterial);
    this.cap.rotation.x = Math.PI / 2;
    this.root.add(this.cap);

    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 256;
    this.faceCanvas.height = 256;
    this.faceTexture = new CanvasTexture(this.faceCanvas);
    this.faceTexture.colorSpace = SRGBColorSpace;
    this.faceTexture.anisotropy = 4;
    this.face = new Mesh(
      new CircleGeometry(CAP_RADIUS * 0.96, 48),
      new MeshBasicMaterial({ map: this.faceTexture, transparent: true }),
    );
    this.root.add(this.face);
    this.setText(text);
    this.placeCap();
    parent.add(this.root);
  }

  /** The lens's colour (a hex number), instead of the one its label would get. */
  setColor(color: number): void {
    this.pinned = true;
    this.applyColor(color);
    this.paint();
  }

  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    if (!this.pinned) this.applyColor(labelColor(text));
    this.paint();
  }

  private applyColor(color: number): void {
    const jewel = JEWEL[color] ?? color;
    this.color = jewel;
    this.capMaterial.color.setHex(jewel);
    this.idle.setHex(jewel);
    this.lit.setHex(jewel).lerp(new Color(0xffffff), 0.35);
    this.haloMaterial.color.setHex(jewel).lerp(new Color(0xffffff), 0.3);
  }

  /**
   * The lens face: deep glass lit from the centre, darker at the rim, a
   * glint across the top; an engraved icon and the word in spaced capitals.
   */
  private paint(): void {
    const canvas = this.faceCanvas;
    const g = canvas.getContext('2d')!;
    const c = canvas.width / 2;
    const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
    const base = new Color(this.color);
    const light = `#${base.clone().lerp(new Color(0xffffff), 0.35).getHexString()}`;
    const dark = `#${base.clone().multiplyScalar(0.45).getHexString()}`;
    g.clearRect(0, 0, canvas.width, canvas.height);
    // The glass: light in the middle, deep at the rim.
    const glass = g.createRadialGradient(c, c * 0.9, 8, c, c, c);
    glass.addColorStop(0, light);
    glass.addColorStop(0.55, hex(this.color));
    glass.addColorStop(1, dark);
    g.fillStyle = glass;
    g.beginPath();
    g.arc(c, c, c - 1, 0, Math.PI * 2);
    g.fill();
    // A fine inner ring, like a lens's ground edge.
    g.strokeStyle = 'rgba(255, 240, 210, 0.35)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(c, c, c - 12, 0, Math.PI * 2);
    g.stroke();
    // The glint across the top.
    const glint = g.createLinearGradient(0, 18, 0, c * 0.9);
    glint.addColorStop(0, 'rgba(255,255,255,0.42)');
    glint.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glint;
    g.beginPath();
    g.ellipse(c, c * 0.52, c * 0.7, c * 0.36, 0, Math.PI, 0);
    g.fill();

    const label = this.text.toUpperCase();
    const icon: Icon | undefined = ICONS[this.text.trim().toLowerCase().replace(/^slot \d$/, 'slot')];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const ink = '#fff4dc';
    if (icon) {
      // The icon, engraved: a dark offset under a cream stroke.
      g.save();
      g.translate(c, c - 30);
      g.scale(1.3, 1.3);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 8;
      g.translate(0, 3);
      icon(g);
      g.translate(0, -3);
      g.strokeStyle = ink;
      g.fillStyle = ink;
      g.lineWidth = 8;
      icon(g);
      g.restore();
    }
    // The word, in spaced capitals.
    const spaced = label.split('').join(' ');
    let px = icon ? 32 : 54;
    g.font = `800 ${px}px ${FONT}`;
    const room = canvas.width - (icon ? 70 : 50);
    while (px > 18 && g.measureText(spaced).width > room) {
      px -= 2;
      g.font = `800 ${px}px ${FONT}`;
    }
    const y = icon ? c + 58 : c + 2;
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillText(spaced, c, y + 3);
    g.fillStyle = ink;
    g.fillText(spaced, c, y);
    this.faceTexture.needsUpdate = true;
  }

  show(shown: boolean): void {
    this.shown = shown;
    if (shown) {
      this.armed = true;
      this.travel = 0;
    }
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /**
   * Moves the lens with any fingertip pushing on it (world positions) and
   * returns true on the frame it clicks. `rayClick` is a ray press that
   * landed on it this frame; the lens dips as if pushed.
   */
  update(dt: number, tips: readonly Vector3[], rayClick: boolean): boolean {
    this.time += dt;
    this.appear += ((this.shown ? 1 : 0) - this.appear) * Math.min(1, dt * 6);
    this.root.visible = this.appear > 0.02;
    if (!this.root.visible) return false;
    const pop = this.shown ? 1 + Math.max(0, 1 - this.appear) * 0.3 : this.appear;
    this.root.scale.setScalar(Math.max(0.001, pop) * this.size);

    let push = 0;
    let near = Infinity;
    if (rayClick) this.travel = TRAVEL;
    this.root.updateWorldMatrix(true, false);
    for (const tip of tips) {
      this.local.copy(tip);
      this.root.worldToLocal(this.local);
      const off = Math.hypot(this.local.x, this.local.y);
      const pad = this.local.z - FINGER_RADIUS;
      near = Math.min(near, Math.hypot(Math.max(0, off - CAP_RADIUS), Math.max(0, pad - CAP_REST)));
      // Only a finger over the lens and not already behind the plate pushes it.
      if (off < CAP_RADIUS + FINGER_RADIUS && pad < CAP_REST && this.local.z > -0.01) {
        push = Math.max(push, Math.min(TRAVEL, CAP_REST - pad));
      }
    }

    // The finger drives the lens down directly; the spring only lifts it.
    this.travel = push >= this.travel ? push : this.travel + (push - this.travel) * Math.min(1, dt * SPRING);
    this.placeCap();

    const glow = Math.max(0, 1 - near / 0.08);
    const breathe = 0.5 + 0.5 * Math.sin(this.time * 2.2);
    this.capMaterial.emissive.copy(this.idle).lerp(this.lit, glow);
    this.capMaterial.emissiveIntensity = 0.2 + 0.1 * breathe + 0.5 * glow;
    this.haloMaterial.opacity = 0.08 + 0.06 * breathe + 0.45 * glow + (this.travel / TRAVEL) * 0.3;

    let clicked = false;
    if (this.shown && (rayClick || (this.armed && this.travel >= CLICK_AT))) {
      this.armed = false;
      clicked = true;
    } else if (!this.armed && this.travel <= REARM_AT) {
      this.armed = true;
    }
    return clicked;
  }

  private placeCap(): void {
    this.cap.position.z = CAP_REST - CAP_DEPTH / 2 - this.travel;
    this.face.position.z = CAP_REST - this.travel + 0.0005;
  }
}

type Icon = (g: CanvasRenderingContext2D) => void;

/** Line icons, drawn about 70 px across around (0, 0). */
const play: Icon = (g) => {
  g.beginPath();
  g.moveTo(-16, -24);
  g.lineTo(26, 0);
  g.lineTo(-16, 24);
  g.closePath();
  g.fill();
};
const chevron = (dir: number, double = false): Icon => (g) => {
  for (const dx of double ? [-12, 12] : [0]) {
    g.beginPath();
    g.moveTo(dx - 9 * dir, -22);
    g.lineTo(dx + 13 * dir, 0);
    g.lineTo(dx - 9 * dir, 22);
    g.stroke();
  }
};
const arrowBack: Icon = (g) => {
  g.beginPath();
  g.moveTo(26, 0);
  g.lineTo(-24, 0);
  g.moveTo(-6, -20);
  g.lineTo(-26, 0);
  g.lineTo(-6, 20);
  g.stroke();
};
const book: Icon = (g) => {
  g.beginPath();
  g.moveTo(0, -18);
  g.quadraticCurveTo(-18, -26, -32, -20);
  g.lineTo(-32, 22);
  g.quadraticCurveTo(-18, 16, 0, 24);
  g.quadraticCurveTo(18, 16, 32, 22);
  g.lineTo(32, -20);
  g.quadraticCurveTo(18, -26, 0, -18);
  g.lineTo(0, 24);
  g.stroke();
};
const journal: Icon = (g) => {
  g.strokeRect(-22, -28, 44, 56);
  g.beginPath();
  for (const y of [-12, 0, 12]) {
    g.moveTo(-12, y);
    g.lineTo(12, y);
  }
  g.stroke();
};
const pouch: Icon = (g) => {
  g.beginPath();
  g.moveTo(-14, -18);
  g.quadraticCurveTo(-34, 4, -24, 22);
  g.quadraticCurveTo(0, 32, 24, 22);
  g.quadraticCurveTo(34, 4, 14, -18);
  g.closePath();
  g.moveTo(-16, -24);
  g.lineTo(16, -24);
  g.stroke();
};
const swords: Icon = (g) => {
  g.beginPath();
  g.moveTo(-24, -24);
  g.lineTo(20, 20);
  g.moveTo(24, -24);
  g.lineTo(-20, 20);
  g.moveTo(10, 26);
  g.lineTo(26, 10);
  g.moveTo(-10, 26);
  g.lineTo(-26, 10);
  g.stroke();
};
const sword: Icon = (g) => {
  g.beginPath();
  g.moveTo(-20, 20);
  g.lineTo(22, -22);
  g.moveTo(-26, 8);
  g.lineTo(-8, 26);
  g.stroke();
};
const gear: Icon = (g) => {
  g.beginPath();
  g.arc(0, 0, 11, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 19, Math.sin(a) * 19);
    g.lineTo(Math.cos(a) * 28, Math.sin(a) * 28);
    g.stroke();
  }
  g.beginPath();
  g.arc(0, 0, 21, 0, Math.PI * 2);
  g.stroke();
};
const dice: Icon = (g) => {
  g.strokeRect(-24, -24, 48, 48);
  for (const [x, y] of [[-11, -11], [11, 11], [0, 0], [11, -11], [-11, 11]]) {
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.fill();
  }
};
const sun: Icon = (g) => {
  g.beginPath();
  g.arc(0, 0, 12, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
    g.lineTo(Math.cos(a) * 29, Math.sin(a) * 29);
    g.stroke();
  }
};
const hammer: Icon = (g) => {
  g.beginPath();
  g.moveTo(-18, 24);
  g.lineTo(8, -2);
  g.stroke();
  g.beginPath();
  g.moveTo(-2, -16);
  g.lineTo(14, -32);
  g.lineTo(30, -16);
  g.lineTo(14, 0);
  g.closePath();
  g.stroke();
};
const quill: Icon = (g) => {
  g.beginPath();
  g.moveTo(-24, 26);
  g.quadraticCurveTo(-4, 0, 24, -26);
  g.quadraticCurveTo(14, 8, -10, 14);
  g.stroke();
};
const shield: Icon = (g) => {
  g.beginPath();
  g.moveTo(0, -28);
  g.lineTo(24, -18);
  g.quadraticCurveTo(24, 14, 0, 28);
  g.quadraticCurveTo(-24, 14, -24, -18);
  g.closePath();
  g.stroke();
};
const drop: Icon = (g) => {
  g.beginPath();
  g.moveTo(0, -28);
  g.quadraticCurveTo(22, 2, 16, 14);
  g.arc(0, 12, 16, 0.1, Math.PI - 0.1);
  g.quadraticCurveTo(-22, 2, 0, -28);
  g.stroke();
};
const speaker: Icon = (g) => {
  g.beginPath();
  g.moveTo(-24, -9);
  g.lineTo(-12, -9);
  g.lineTo(4, -24);
  g.lineTo(4, 24);
  g.lineTo(-12, 9);
  g.lineTo(-24, 9);
  g.closePath();
  g.stroke();
  g.beginPath();
  g.arc(6, 0, 18, -0.8, 0.8);
  g.stroke();
};
const loop: Icon = (g) => {
  g.beginPath();
  g.arc(0, 0, 22, -0.4, Math.PI * 1.55);
  g.stroke();
  g.beginPath();
  g.moveTo(14, -30);
  g.lineTo(22, -10);
  g.lineTo(2, -8);
  g.stroke();
};
const star: Icon = (g) => {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 11 : 27;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.stroke();
};
const lock: Icon = (g) => {
  g.strokeRect(-20, -4, 40, 30);
  g.beginPath();
  g.arc(0, -4, 13, Math.PI, 0);
  g.stroke();
};
const globe: Icon = (g) => {
  g.beginPath();
  g.arc(0, 0, 26, 0, Math.PI * 2);
  g.moveTo(-26, 0);
  g.lineTo(26, 0);
  g.ellipse(0, 0, 11, 26, 0, 0, Math.PI * 2);
  g.stroke();
};
const target: Icon = (g) => {
  g.beginPath();
  g.arc(0, 0, 20, 0, Math.PI * 2);
  g.moveTo(0, -30);
  g.lineTo(0, -10);
  g.moveTo(0, 10);
  g.lineTo(0, 30);
  g.moveTo(-30, 0);
  g.lineTo(-10, 0);
  g.moveTo(10, 0);
  g.lineTo(30, 0);
  g.stroke();
};
const gauge: Icon = (g) => {
  g.beginPath();
  g.arc(0, 10, 26, Math.PI, 0);
  g.moveTo(0, 10);
  g.lineTo(14, -8);
  g.stroke();
};
const table: Icon = (g) => {
  g.beginPath();
  g.moveTo(-30, -6);
  g.lineTo(30, -6);
  g.moveTo(-22, -6);
  g.lineTo(-22, 24);
  g.moveTo(22, -6);
  g.lineTo(22, 24);
  g.stroke();
};
const flask: Icon = (g) => {
  g.beginPath();
  g.moveTo(-8, -28);
  g.lineTo(-8, -6);
  g.lineTo(-24, 24);
  g.lineTo(24, 24);
  g.lineTo(8, -6);
  g.lineTo(8, -28);
  g.stroke();
};
const square: Icon = (g) => {
  g.strokeRect(-22, -22, 44, 44);
};

/** A house: home. */
const house: Icon = (g) => {
  g.beginPath();
  g.moveTo(-26, -2);
  g.lineTo(0, -26);
  g.lineTo(26, -2);
  g.stroke();
  g.beginPath();
  g.moveTo(-18, -8);
  g.lineTo(-18, 22);
  g.lineTo(18, 22);
  g.lineTo(18, -8);
  g.stroke();
  g.fillRect(-6, 6, 12, 16);
};

/** A door ajar with an arrow out: leave. */
const leave: Icon = (g) => {
  g.beginPath();
  g.moveTo(4, -22);
  g.lineTo(-18, -22);
  g.lineTo(-18, 22);
  g.lineTo(4, 22);
  g.stroke();
  g.beginPath();
  g.moveTo(-4, 0);
  g.lineTo(26, 0);
  g.moveTo(16, -10);
  g.lineTo(26, 0);
  g.lineTo(16, 10);
  g.stroke();
};

const ICONS: Partial<Record<string, Icon>> = {
  home: house,
  'leave?': leave,
  play,
  continue: play,
  replay: loop,
  drop: chevron(1),
  fight: sword,
  back: arrowBack,
  prev: chevron(-1),
  next: chevron(1),
  skip: chevron(1, true),
  chapters: book,
  story: book,
  journal,
  bag: pouch,
  battles: swords,
  settings: gear,
  random: dice,
  daily: sun,
  workshop: hammer,
  duel: quill,
  ink: quill,
  arena: shield,
  mute: speaker,
  'sound on': speaker,
  reset: loop,
  restart: loop,
  undo: arrowBack,
  test: flask,
  credits: star,
  trophies: star,
  locked: lock,
  around: globe,
  recenter: target,
  relaxed: gauge,
  'full speed': gauge,
  table,
  slot: square,
  levels: book,
  'new game': loop,
};
