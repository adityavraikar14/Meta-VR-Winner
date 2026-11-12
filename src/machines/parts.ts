import { FONT } from '../ui-theme.js';
import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  CanvasTexture,
  Color,
  Curve,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { surface } from '../world/nature.js';

/**
 * Machine parts built the way a millwright would: wooden face gears with
 * square cogs, lantern pinions with round staves, an iron ratchet with a
 * gravity pawl, a winding drum, hemp rope. Gear sizes come from one shared
 * pitch, so any wheel meshes with any pinion and the speed ratio is simply
 * cogs ÷ staves.
 */

let seedValue = 7;
function random(): number {
  seedValue = (seedValue * 16807) % 2147483647;
  return (seedValue - 1) / 2147483646;
}

// ------------------------------------------------------------- Materials

let timberMaterial: MeshStandardMaterial | null = null;
let endGrainMaterial: MeshStandardMaterial | null = null;
let ironMaterial: MeshStandardMaterial | null = null;
let stoneMaterial: MeshStandardMaterial | null = null;
let hempMaterial: MeshStandardMaterial | null = null;
let brassMaterial: MeshStandardMaterial | null = null;

/** Weathered oak, grain along the part's length. */
export function timber(): MeshStandardMaterial {
  return (timberMaterial ??= surface('plank', 1, 1, 0xb29a80));
}

/** Darker, oiled hardwood for gear cogs and staves that take the wear. */
export function hardwood(): MeshStandardMaterial {
  return (endGrainMaterial ??= surface('wood', 1, 1, 0x8a6a50));
}

/** Old wrought iron: rusty, a little metallic where it rubs. */
export function iron(): MeshStandardMaterial {
  if (!ironMaterial) {
    ironMaterial = surface('iron', 1, 1, 0x8f8278);
    ironMaterial.metalness = 0.55;
  }
  return ironMaterial;
}

export function stone(): MeshStandardMaterial {
  return (stoneMaterial ??= surface('stone', 1, 1, 0xd6cdbf));
}

export function brass(): MeshStandardMaterial {
  return (brassMaterial ??= new MeshStandardMaterial({ color: 0xc8a050, metalness: 0.85, roughness: 0.35 }));
}

/** Three-strand hemp rope: a twisted stripe wrapped round the strand. */
export function hemp(): MeshStandardMaterial {
  if (!hempMaterial) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#9a8158';
    g.fillRect(0, 0, 32, 32);
    // Three strands spiralling: diagonal bands with a dark lay line between.
    for (let i = -2; i < 4; i++) {
      g.fillStyle = '#5e4b30';
      g.beginPath();
      const x = i * 11;
      g.moveTo(x, 0);
      g.lineTo(x + 3, 0);
      g.lineTo(x + 3 + 32, 32);
      g.lineTo(x + 32, 32);
      g.fill();
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    hempMaterial = new MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0 });
  }
  return hempMaterial;
}

// ---------------------------------------------------------------- Timber

/** A squared beam from `a` to `b`. */
export function beam(a: Vector3, b: Vector3, width: number, depth = width): Mesh {
  const length = a.distanceTo(b);
  const geometry = new BoxGeometry(width, length, depth);
  const mesh = new Mesh(geometry, timber());
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3().subVectors(b, a).normalize());
  mesh.name = 'Beam';
  return mesh;
}

/** An eight-sided shaft along +Y, the way mill shafts were hewn from a log. */
export function octShaft(length: number, radius: number, material = timber()): Mesh {
  const geometry = new CylinderGeometry(radius, radius, length, 8);
  geometry.translate(0, length / 2, 0);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'Shaft';
  return mesh;
}

/** An iron band shrunk round a shaft or hub. Ring in the XZ plane. */
export function band(radius: number, width = 0.0025): Mesh {
  const geometry = new CylinderGeometry(radius * 1.04, radius * 1.04, width, 14, 1, true);
  const mesh = new Mesh(geometry, iron());
  mesh.name = 'Band';
  return mesh;
}

/** A bearing block: a squared timber with an iron cap strap. */
export function bearing(size: number): Group {
  const group = new Group();
  group.name = 'Bearing';
  group.add(new Mesh(new BoxGeometry(size * 1.6, size, size), hardwood()));
  const strap = new Mesh(new BoxGeometry(size * 1.7, size * 0.18, size * 0.5), iron());
  strap.position.y = size * 0.5;
  group.add(strap);
  return group;
}

// ----------------------------------------------------------------- Gears

/** Arc length between neighbouring cogs on every wheel and pinion. */
export const GEAR_PITCH = 0.0122;

/** Pitch radius for a gear with this many teeth. */
export function pitchRadius(teeth: number): number {
  return (teeth * GEAR_PITCH) / (2 * Math.PI);
}

/**
 * A wooden face (crown) wheel lying flat, cogs pointing down from its rim.
 * Clasp-arm construction: two pairs of arms boxed round the shaft, a rim of
 * felloes, square cogs mortised into it. The wheel turns about +Y; cog `k`
 * sits at angle 2πk/teeth (rotation.y convention).
 */
export function crownWheel(teeth: number, shaftRadius: number): Group {
  const group = new Group();
  group.name = 'CrownWheel';
  const R = pitchRadius(teeth);
  const rimWidth = GEAR_PITCH * 1.5;
  const rimDepth = GEAR_PITCH * 0.9;
  const cog = GEAR_PITCH * 0.46;

  const wood: BufferGeometry[] = [];
  const rimShape = new Shape();
  rimShape.absarc(0, 0, R + rimWidth / 2, 0, Math.PI * 2, false);
  const hole = new Shape();
  hole.absarc(0, 0, R - rimWidth / 2, 0, Math.PI * 2, true);
  rimShape.holes.push(hole);
  const rim = new ExtrudeGeometry(rimShape, { depth: rimDepth, bevelEnabled: false, curveSegments: 48 });
  rim.rotateX(-Math.PI / 2);
  wood.push(rim);
  // Clasp arms: two parallel pairs crossing, gripping a square round the shaft.
  const armLength = (R + rimWidth * 0.3) * 2;
  const armWidth = rimDepth * 0.9;
  for (const along of [0, 1]) {
    for (const side of [-1, 1]) {
      const arm = new BoxGeometry(along ? armWidth : armLength, rimDepth * 0.95, along ? armLength : armWidth);
      const offset = side * (shaftRadius + armWidth / 2);
      arm.translate(along ? offset : 0, rimDepth / 2 + (along ? 0.0006 : -0.0006), along ? 0 : offset);
      wood.push(arm);
    }
  }
  // The extruded rim has no index; drop the boxes' too so they can merge.
  const wheelWood = new Mesh(mergeGeometries(wood.map((g) => (g.index ? g.toNonIndexed() : g)))!, timber());
  wheelWood.name = 'CrownWheelFrame';
  group.add(wheelWood);

  const cogs: BufferGeometry[] = [];
  for (let k = 0; k < teeth; k++) {
    const a = (k / teeth) * Math.PI * 2;
    const g = new BoxGeometry(cog, GEAR_PITCH * 1.05, cog * 1.25);
    // Slightly rounded working faces: taper the tip.
    g.translate(0, -GEAR_PITCH * 0.52, 0);
    g.rotateY(a + Math.PI / 2);
    g.translate(R * Math.cos(a), 0, -R * Math.sin(a));
    cogs.push(g);
  }
  const teethMesh = new Mesh(mergeGeometries(cogs)!, hardwood());
  teethMesh.name = 'CrownWheelCogs';
  group.add(teethMesh);
  // Iron ring binding the felloes.
  const ring = new Mesh(new TorusGeometry(R + rimWidth / 2, 0.0012, 4, 48), iron());
  ring.rotation.x = Math.PI / 2;
  ring.position.y = rimDepth * 0.5;
  group.add(ring);
  return group;
}

/**
 * A lantern pinion: two discs joined by round staves, turning about +Z.
 * Stave `j` sits at angle 2πj/staves from +X towards +Y.
 */
export function lanternPinion(staves: number, length: number, shaftRadius: number): Group {
  const group = new Group();
  group.name = 'LanternPinion';
  const r = pitchRadius(staves);
  const disc = r + GEAR_PITCH * 0.42;
  const thick = GEAR_PITCH * 0.32;
  const wood: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const g = new CylinderGeometry(disc, disc, thick, 24);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, side * (length / 2 + thick / 2));
    wood.push(g);
  }
  const discs = new Mesh(mergeGeometries(wood)!, timber());
  discs.name = 'PinionDiscs';
  group.add(discs);
  const rods: BufferGeometry[] = [];
  for (let j = 0; j < staves; j++) {
    const a = (j / staves) * Math.PI * 2;
    const g = new CylinderGeometry(GEAR_PITCH * 0.2, GEAR_PITCH * 0.2, length, 8);
    g.rotateX(Math.PI / 2);
    g.translate(r * Math.cos(a), r * Math.sin(a), 0);
    rods.push(g);
  }
  const staveMesh = new Mesh(mergeGeometries(rods)!, hardwood());
  staveMesh.name = 'PinionStaves';
  group.add(staveMesh);
  for (const side of [-1, 1]) {
    const hoop = new Mesh(new TorusGeometry(disc, 0.0009, 4, 28), iron());
    hoop.position.z = side * (length / 2 + thick / 2);
    group.add(hoop);
  }
  const hub = new Mesh(new CylinderGeometry(shaftRadius * 1.3, shaftRadius * 1.3, length, 8), timber());
  hub.rotation.x = Math.PI / 2;
  group.add(hub);
  return group;
}

/**
 * An iron ratchet wheel turning about +Z. The teeth lean so the pawl rides up
 * each slope while the wheel turns clockwise seen from +Z (winding) and
 * catches on the steep face if it tries to run back.
 */
export function ratchetWheel(teeth: number, radius: number, depth: number, thickness: number): Mesh {
  const shape = new Shape();
  for (let i = 0; i <= teeth; i++) {
    // Walk anticlockwise: each tooth rises slowly to its tip, then drops straight.
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 1) / teeth) * Math.PI * 2;
    if (i === 0) shape.moveTo(radius * Math.cos(a0), radius * Math.sin(a0));
    if (i === teeth) break;
    shape.lineTo((radius - depth) * Math.cos(a0), (radius - depth) * Math.sin(a0));
    shape.lineTo(radius * Math.cos(a1), radius * Math.sin(a1));
  }
  const geometry = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, -thickness / 2);
  const mesh = new Mesh(geometry, iron());
  mesh.name = 'Ratchet';
  return mesh;
}

/** A winding drum about +Z: a barrel of staves between two flanged cheeks. */
export function windingDrum(radius: number, length: number, flange: number): Group {
  const group = new Group();
  group.name = 'WindingDrum';
  const barrel = new CylinderGeometry(radius, radius, length, 16, 1, true);
  barrel.rotateX(Math.PI / 2);
  group.add(new Mesh(barrel, hardwood()));
  const cheeks: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const g = new CylinderGeometry(flange, flange, length * 0.12, 20);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, side * length * 0.56);
    cheeks.push(g);
  }
  group.add(new Mesh(mergeGeometries(cheeks)!, timber()));
  for (const side of [-1, 1]) {
    const hoop = new Mesh(new TorusGeometry(flange, 0.0011, 4, 28), iron());
    hoop.position.z = side * length * 0.56;
    group.add(hoop);
  }
  return group;
}

// ------------------------------------------------------------------ Rope

const ROPE_SEGMENTS = 6;
const unitRope = new CylinderGeometry(1, 1, 1, ROPE_SEGMENTS, 1, true);
unitRope.translate(0, 0.5, 0);

/** A straight run of rope between two points, moved every frame. */
export class RopeSpan {
  readonly mesh: Mesh;
  private readonly dir = new Vector3();
  private static readonly UP = new Vector3(0, 1, 0);

  constructor(private readonly radius: number) {
    this.mesh = new Mesh(unitRope, hemp());
    this.mesh.name = 'Rope';
    this.mesh.userData.keep = true;
    this.mesh.frustumCulled = false;
  }

  set(a: Vector3, b: Vector3): void {
    this.dir.subVectors(b, a);
    const length = this.dir.length();
    this.mesh.visible = length > 1e-4;
    if (!this.mesh.visible) return;
    this.mesh.position.copy(a);
    this.mesh.quaternion.setFromUnitVectors(RopeSpan.UP, this.dir.divideScalar(length));
    this.mesh.scale.set(this.radius, length, this.radius);
  }
}

class HelixCurve extends Curve<Vector3> {
  constructor(
    private readonly radius: number,
    private readonly turns: number,
    private readonly pitch: number,
  ) {
    super();
  }

  override getPoint(t: number, target = new Vector3()): Vector3 {
    const a = t * this.turns * Math.PI * 2;
    return target.set(this.radius * Math.cos(a), this.radius * Math.sin(a), -t * this.turns * this.pitch);
  }
}

/**
 * Rope wound on a drum (about +Z): a helix laid coil beside coil, shown up to
 * the wound length. Helix angle φ runs from +X towards +Y, advancing -Z.
 */
export class WoundRope {
  readonly mesh: Mesh;
  private readonly perTurn = 24;
  private readonly radial = 5;

  constructor(
    readonly radius: number,
    readonly turns: number,
    readonly pitch: number,
    ropeRadius: number,
  ) {
    const geometry = new TubeGeometry(new HelixCurve(radius, turns, pitch), turns * this.perTurn, ropeRadius, this.radial, false);
    this.mesh = new Mesh(geometry, hemp());
    this.mesh.name = 'WoundRope';
    this.mesh.userData.keep = true;
  }

  /** Show the coils from φ = 0 up to `angle` (radians of wrap). */
  wound(angle: number): void {
    const segments = Math.max(0, Math.min(this.turns * this.perTurn, Math.floor((angle / (Math.PI * 2)) * this.perTurn)));
    this.mesh.geometry.setDrawRange(0, segments * this.radial * 6);
  }

  /** Where the last coil leaves the drum along its axis (drum-local Z). */
  leaveZ(angle: number): number {
    return -(angle / (Math.PI * 2)) * this.pitch;
  }
}

// ----------------------------------------------------------------- Bucket

/** A coopered oak bucket with two iron hoops and a bail handle; origin at the bail top. */
export function bucket(
  radius: number,
  height: number,
): { group: Group; contents: Group; tint: Array<{ material: MeshStandardMaterial; color: number }> } {
  const group = new Group();
  group.name = 'Bucket';
  const body = new Group();
  const bailRise = radius * 1.05;
  body.position.y = -bailRise - height;
  group.add(body);

  // Its own materials, so it can be darkened while it is down the well.
  const oak = surface('plank', 1, 1, 0xb29a80);
  const hoopIron = surface('iron', 1, 1, 0x8f8278);
  hoopIron.metalness = 0.55;
  const staves = new CylinderGeometry(radius, radius * 0.86, height, 14, 1, true);
  staves.translate(0, height / 2, 0);
  const shell = new Mesh(staves, oak);
  shell.material.side = DoubleSide;
  body.add(shell);
  const floor = new Mesh(new CylinderGeometry(radius * 0.85, radius * 0.85, height * 0.06, 14), oak);
  floor.position.y = height * 0.06;
  body.add(floor);
  for (const at of [0.22, 0.8]) {
    const r = radius * (0.86 + 0.14 * at) + 0.0006;
    const hoop = new Mesh(new TorusGeometry(r, 0.0011, 4, 24), hoopIron);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = height * at;
    body.add(hoop);
  }
  const bail = new Mesh(new TorusGeometry(radius * 1.02, 0.0009, 4, 20, Math.PI), hoopIron);
  bail.position.y = height;
  body.add(bail);
  const contents = new Group();
  contents.position.y = height * 0.82;
  body.add(contents);
  return { group, contents, tint: [{ material: oak, color: 0xb29a80 }, { material: hoopIron, color: 0x8f8278 }] };
}

/** Water that fills a bucket, dark and glinting. */
export function bucketWater(radius: number): Mesh {
  const mesh = new Mesh(
    new CylinderGeometry(radius, radius, 0.001, 16),
    new MeshStandardMaterial({ color: 0x1d3038, roughness: 0.08, metalness: 0.2 }),
  );
  mesh.name = 'BucketWater';
  return mesh;
}

// ------------------------------------------------------------------ Well

/**
 * A dry-stone well head: courses of rough blocks laid in a ring with broken
 * joints, capstones on top, and a mouth that falls away into darkness.
 */
export function wellHead(inner: number, outer: number, height: number, seed = 3): Group {
  seedValue = seed;
  const group = new Group();
  group.name = 'WellHead';
  const courses = 4;
  const courseHeight = height / courses;
  const blocks: BufferGeometry[] = [];
  const mid = (inner + outer) / 2;
  const count = Math.round((Math.PI * 2 * mid) / ((outer - inner) * 1.5));
  for (let c = 0; c < courses; c++) {
    const top = c === courses - 1;
    const n = top ? Math.round(count * 0.8) : count;
    for (let i = 0; i < n; i++) {
      const a = ((i + (c % 2) * 0.5) / n) * Math.PI * 2;
      const arc = ((Math.PI * 2 * mid) / n) * 0.93;
      const w = (outer - inner) * (top ? 1.15 : 0.96);
      const h = courseHeight * (0.9 + random() * 0.08);
      const g = new BoxGeometry(arc * (0.92 + random() * 0.06), h, w);
      // Rough the block: nudge corners so no two stones are alike.
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        p.setXYZ(
          v,
          p.getX(v) * (1 + (random() - 0.5) * 0.08),
          p.getY(v) * (1 + (random() - 0.5) * 0.15),
          p.getZ(v) * (1 + (random() - 0.5) * 0.1),
        );
      }
      g.computeVertexNormals();
      g.rotateY(a + Math.PI / 2);
      g.translate(mid * Math.cos(a), c * courseHeight + h / 2, -mid * Math.sin(a));
      blocks.push(g);
    }
  }
  const wall = new Mesh(mergeGeometries(blocks)!, stone());
  wall.name = 'WellStones';
  group.add(wall);

  // The deep: a black mouth and walls that fade from stone into darkness.
  const mouth = new Mesh(new CylinderGeometry(inner * 1.01, inner * 1.01, 0.001, 32), new MeshBasicMaterial({ color: 0x020202 }));
  mouth.position.y = 0.0015;
  mouth.name = 'WellDark';
  group.add(mouth);
  const fade = new CylinderGeometry(inner * 0.995, inner * 0.995, height, 32, 4, true);
  const colors: number[] = [];
  const fp = fade.attributes.position;
  for (let v = 0; v < fp.count; v++) {
    const k = fp.getY(v) / height + 0.5;
    colors.push(0, 0, 0, 1 - k * 0.95);
  }
  fade.setAttribute('color', new Float32BufferAttribute(colors, 4));
  fade.translate(0, height / 2, 0);
  const shade = new Mesh(fade, new MeshBasicMaterial({ vertexColors: true, transparent: true, side: DoubleSide, depthWrite: false }));
  shade.name = 'WellShade';
  shade.renderOrder = 2;
  group.add(shade);
  return group;
}

// ------------------------------------------------------------------ Dial

/**
 * A brass-rimmed dial with a painted card face: a red band below the mark it
 * must reach, green above. `set(ratio)` swings the needle; 1 = on the mark.
 */
export class Dial {
  readonly group = new Group();
  private readonly needle = new Group();
  private shown = 0;
  private wobble = 0;

  constructor(radius: number, label: string) {
    this.group.name = 'Dial';
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#efe6d2';
    g.fillRect(0, 0, 256, 256);
    const cx = 128;
    const cy = 136;
    const arc = (from: number, to: number, color: string, width: number) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      g.arc(cx, cy, 92, from, to);
      g.stroke();
    };
    // Needle angle for ratio r: -135° (empty) … 0° (on the mark) … +135° (double).
    const angle = (r: number) => -Math.PI / 2 + ((Math.min(2, r) - 1) * Math.PI * 3) / 4;
    arc(angle(0), angle(1), '#b8322a', 16);
    arc(angle(1), angle(2), '#3f7d3a', 16);
    g.strokeStyle = '#14213d';
    for (let i = 0; i <= 20; i++) {
      const a = angle(i / 10);
      const long = i % 5 === 0;
      g.lineWidth = long ? 4 : 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (long ? 70 : 78), cy + Math.sin(a) * (long ? 70 : 78));
      g.lineTo(cx + Math.cos(a) * 86, cy + Math.sin(a) * 86);
      g.stroke();
    }
    g.fillStyle = '#14213d';
    g.font = `700 30px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(label, cx, cy + 62);
    g.font = `600 20px ${FONT}`;
    g.fillText('NEEDED', cx, 26);
    const face = new CanvasTexture(canvas);
    face.colorSpace = SRGBColorSpace;
    const card = new Mesh(new CircleGeometry(radius, 40), new MeshStandardMaterial({ map: face, roughness: 0.6 }));
    card.position.z = 0.0008;
    this.group.add(card);
    const bezel = new Mesh(new TorusGeometry(radius * 1.02, radius * 0.08, 6, 32), brass());
    bezel.position.z = 0.001;
    this.group.add(bezel);
    const back = new Mesh(new CylinderGeometry(radius * 1.05, radius * 1.05, 0.004, 32), brass());
    back.rotation.x = Math.PI / 2;
    back.position.z = -0.0015;
    this.group.add(back);
    const pointer = new Mesh(new BoxGeometry(radius * 0.05, radius * 0.78, 0.0008), new MeshBasicMaterial({ color: 0x14100c }));
    pointer.position.y = radius * 0.35;
    this.needle.add(pointer);
    const cap = new Mesh(new CylinderGeometry(radius * 0.09, radius * 0.09, 0.002, 12), brass());
    cap.rotation.x = Math.PI / 2;
    this.needle.add(cap);
    this.needle.position.set(0, ((cy - 128) / -128) * radius, 0.0022);
    this.group.add(this.needle);
  }

  /** Swing towards `ratio` with a little spring overshoot, like a real movement. */
  update(dt: number, ratio: number): void {
    const target = Math.min(2.08, Math.max(0, ratio));
    const k = 60;
    const damping = 9;
    this.wobble += ((target - this.shown) * k - this.wobble * damping) * dt;
    this.shown += this.wobble * dt;
    this.needle.rotation.z = -((Math.min(2.1, this.shown) - 1) * Math.PI * 3) / 4;
  }
}

// ------------------------------------------------------------------- Glow

/** A soft additive halo, for embers and the lantern stone. */
export function halo(size: number, color: number): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const c = new Color(color);
  const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${rgb},0.9)`);
  grad.addColorStop(0.35, `rgba(${rgb},0.35)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(
    new PlaneGeometry(size, size),
    new MeshBasicMaterial({ map: texture, transparent: true, blending: AdditiveBlending, depthWrite: false }),
  );
  mesh.name = 'Halo';
  mesh.userData.keep = true;
  return mesh;
}
