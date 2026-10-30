import {
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  ConeGeometry,
  TorusGeometry,
} from '@iwsdk/core';
import { glossy, lathe, plush, softShade } from '../creatures/rig.js';

/**
 * Pieces of the storybook diorama. Scenery is paper-cut: flat layered card
 * extruded a few millimetres, like a pop-up book. Things creatures touch
 * (logs, carrots, mushrooms) are soft 3D so they belong with the plush cast.
 * Every builder returns a Group with its origin on the ground.
 */

const CARD_DEPTH = 0.003;

function card(color: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
}

function cutout(shapes: Shape[], material: Material, z = 0): Mesh {
  const geometry = new ExtrudeGeometry(shapes, { depth: CARD_DEPTH, bevelEnabled: false, curveSegments: 10 });
  const mesh = new Mesh(geometry, material);
  mesh.position.z = z - CARD_DEPTH / 2;
  return mesh;
}

function circle(x: number, y: number, r: number): Shape {
  const s = new Shape();
  s.absarc(x, y, r, 0, Math.PI * 2, false);
  return s;
}

function rect(x: number, y: number, w: number, h: number): Shape {
  const s = new Shape();
  s.moveTo(x - w / 2, y);
  s.lineTo(x + w / 2, y);
  s.lineTo(x + w / 2 * 0.8, y + h);
  s.lineTo(x - w / 2 * 0.8, y + h);
  s.closePath();
  return s;
}

/** A round leafy paper tree, two card layers for depth. */
export function paperTree(height: number, leaf = 0x6fae5b, shade = 0x4d8a45): Group {
  const g = new Group();
  g.name = 'PaperTree';
  const h = height;
  const crown = (k: number) => [
    circle(0, h * 0.68, h * 0.24 * k),
    circle(-h * 0.17, h * 0.53, h * 0.17 * k),
    circle(h * 0.17, h * 0.55, h * 0.18 * k),
    circle(0, h * 0.86, h * 0.13 * k),
  ];
  g.add(cutout([rect(0, 0, h * 0.11, h * 0.5)], card(0x8a5a3a), 0));
  g.add(cutout(crown(1.1), card(shade), -0.004));
  g.add(cutout(crown(1), card(leaf), 0.002));
  return g;
}

/** A layered paper pine. */
export function paperPine(height: number, color = 0x3f7f5a): Group {
  const g = new Group();
  g.name = 'PaperPine';
  const h = height;
  g.add(cutout([rect(0, 0, h * 0.08, h * 0.25)], card(0x7a4e32), 0));
  for (let i = 0; i < 3; i++) {
    const s = new Shape();
    const base = h * (0.18 + i * 0.24);
    const w = h * (0.36 - i * 0.08);
    s.moveTo(-w, base);
    s.lineTo(w, base);
    s.lineTo(0, base + h * 0.42);
    s.closePath();
    const tone = i === 1 ? 0x4b8c62 : color;
    g.add(cutout([s], card(tone), i * 0.002));
  }
  return g;
}

/** A zig-zag tuft of paper grass. */
export function grass(width: number, color = 0x86bf5e): Group {
  const g = new Group();
  g.name = 'Grass';
  const s = new Shape();
  const blades = 5;
  s.moveTo(-width / 2, 0);
  for (let i = 0; i < blades; i++) {
    const x0 = -width / 2 + (width / blades) * i;
    const peak = width * (0.45 + ((i * 37) % 10) / 25);
    s.lineTo(x0 + width / blades / 2, peak);
    s.lineTo(x0 + width / blades, 0);
  }
  s.closePath();
  g.add(cutout([s], card(color)));
  return g;
}

/** A small paper bush. */
export function bush(size: number, color = 0x5d9e52): Group {
  const g = new Group();
  g.name = 'Bush';
  g.add(cutout([circle(0, size * 0.4, size * 0.4), circle(-size * 0.35, size * 0.28, size * 0.28), circle(size * 0.35, size * 0.3, size * 0.3)], card(color)));
  return g;
}

/** A soft 3D flower on a stem. */
export function flower(color: number): Group {
  const g = new Group();
  g.name = 'Flower';
  const stem = new Mesh(new CylinderGeometry(0.0012, 0.0015, 0.03, 6), card(0x5b9a45));
  stem.position.y = 0.015;
  g.add(stem);
  const petals = plush(color);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = new Mesh(new SphereGeometry(0.0045, 10, 8), petals);
    p.scale.set(1, 0.5, 1);
    p.position.set(Math.cos(a) * 0.005, 0.031, Math.sin(a) * 0.005);
    g.add(p);
  }
  const middle = new Mesh(new SphereGeometry(0.0035, 10, 8), plush(0xffd34d));
  middle.position.y = 0.033;
  g.add(middle);
  softShade(g);
  return g;
}

/** A fallen log lying along local X. */
export function log(length: number, radius: number): Group {
  const g = new Group();
  g.name = 'Log';
  const bark = plush(0x8b5a36);
  const rings = plush(0xe0b77f);
  const trunk = new Mesh(new CylinderGeometry(radius, radius * 1.05, length, 24), [bark, rings, rings]);
  trunk.rotation.z = Math.PI / 2;
  trunk.position.y = radius;
  g.add(trunk);
  const moss = plush(0x7fae4f);
  for (const [x, s] of [[-0.3, 1], [0.1, 0.8], [0.35, 0.6]] as const) {
    const m = new Mesh(new SphereGeometry(radius * 0.45 * s, 12, 8), moss);
    m.scale.set(1.4, 0.5, 1.1);
    m.position.set(x * length, radius * 1.9, 0);
    g.add(m);
  }
  softShade(g);
  return g;
}

/** A hollow log lying along local X, open at both ends, big enough for a snail. */
export function hollowLog(length: number, radius: number): Group {
  const g = new Group();
  g.name = 'HollowLog';
  const bark = plush(0x7f5232);
  bark.side = DoubleSide;
  const tube = new Mesh(new CylinderGeometry(radius, radius, length, 28, 1, true), bark);
  tube.rotation.z = Math.PI / 2;
  tube.position.y = radius;
  g.add(tube);
  const rimMaterial = plush(0xd9ad74);
  for (const side of [-1, 1]) {
    const rim = new Mesh(new TorusGeometry(radius, 0.005, 8, 28), rimMaterial);
    rim.rotation.y = Math.PI / 2;
    rim.position.set((side * length) / 2, radius, 0);
    g.add(rim);
  }
  const moss = plush(0x7fae4f);
  const top = new Mesh(new SphereGeometry(radius * 0.5, 12, 8), moss);
  top.scale.set(2, 0.4, 1);
  top.position.set(0, radius * 2, 0);
  g.add(top);
  softShade(g);
  return g;
}

/** A carrot lying on the ground, pointing along local X. */
export function carrot(): Group {
  const g = new Group();
  g.name = 'Carrot';
  const root = new Mesh(new ConeGeometry(0.011, 0.045, 14), plush(0xff8a2a));
  root.rotation.z = Math.PI / 2;
  root.position.set(0.012, 0.011, 0);
  g.add(root);
  const leaf = plush(0x5fb043);
  for (const a of [-0.5, 0, 0.5]) {
    const l = new Mesh(new ConeGeometry(0.003, 0.024, 6), leaf);
    l.position.set(-0.018, 0.016, 0);
    l.rotation.set(a, 0, Math.PI / 2 + 0.5);
    g.add(l);
  }
  softShade(g);
  return g;
}

/** A spotted toadstool. The returned cap material can be made to glow. */
export function mushroom(size: number, color = 0xe2483c): { group: Group; cap: MeshStandardMaterial } {
  const g = new Group();
  g.name = 'Mushroom';
  const stem = new Mesh(lathe([[0, 0], [size * 0.28, 0], [size * 0.22, size * 0.5], [size * 0.25, size * 0.75], [0, size * 0.75]]), plush(0xfaf0dc));
  g.add(stem);
  const cap = new MeshStandardMaterial({ color, roughness: 0.7, emissive: color, emissiveIntensity: 0 });
  const top = new Mesh(lathe([[0, size * 1.15], [size * 0.35, size * 1.1], [size * 0.62, size * 0.85], [size * 0.66, size * 0.7], [0, size * 0.72]]), cap);
  g.add(top);
  const dot = plush(0xfff8ec);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const d = new Mesh(new SphereGeometry(size * 0.08, 8, 6), dot);
    d.position.set(Math.cos(a) * size * 0.4, size * 1.02, Math.sin(a) * size * 0.4);
    g.add(d);
  }
  softShade(g);
  return { group: g, cap };
}

/** A gnarled root arch: the only way through is the small gap underneath. */
export function rootArch(radius: number): Group {
  const g = new Group();
  g.name = 'RootArch';
  const root = new Mesh(new TorusGeometry(radius, radius * 0.32, 12, 24, Math.PI), plush(0x8a5a3a));
  root.rotation.y = Math.PI / 2;
  g.add(root);
  const moss = plush(0x7fae4f);
  for (const z of [-0.6, 0, 0.6]) {
    const m = new Mesh(new SphereGeometry(radius * 0.35, 10, 8), moss);
    m.scale.set(1, 0.45, 1.2);
    m.position.set(0, Math.cos(z) * radius * 1.25, Math.sin(z) * radius * 1.2);
    g.add(m);
  }
  softShade(g);
  return g;
}

/** Red berries hanging in a cluster; origin at the stalk. */
export function berries(): Group {
  const g = new Group();
  g.name = 'Berries';
  const berry = glossy(0xd8304a, 0.25);
  for (const [x, y, z] of [[0, -0.012, 0], [0.008, -0.018, 0.004], [-0.007, -0.02, 0.003], [0.001, -0.026, -0.004], [-0.002, -0.017, -0.008]]) {
    const b = new Mesh(new SphereGeometry(0.0065, 12, 10), berry);
    b.position.set(x, y, z);
    g.add(b);
  }
  const stalk = new Mesh(new CylinderGeometry(0.0012, 0.0012, 0.014, 5), card(0x5b8a3a));
  stalk.position.y = -0.006;
  g.add(stalk);
  softShade(g);
  return g;
}

/** A tree with a branch reaching forward over the path; berries hang from its tip. */
export function berryTree(height: number, reach: number): { group: Group; tip: { x: number; y: number; z: number } } {
  const g = new Group();
  g.name = 'BerryTree';
  g.add(paperTree(height, 0x7cb35e, 0x55904a));
  const branch = new Mesh(new CylinderGeometry(0.004, 0.007, reach, 8), plush(0x8a5a3a));
  const y = height * 0.62;
  branch.rotation.x = Math.PI / 2 - 0.15;
  branch.position.set(0, y + Math.sin(0.15) * reach * 0.5, reach / 2);
  g.add(branch);
  const leaves = plush(0x6fae5b);
  for (const k of [0.55, 0.85]) {
    const l = new Mesh(new SphereGeometry(0.012, 10, 8), leaves);
    l.scale.set(1.3, 0.5, 1);
    l.position.set(0, y + Math.sin(0.15) * reach * k + 0.006, reach * k);
    g.add(l);
  }
  softShade(g);
  return { group: g, tip: { x: 0, y: y + Math.sin(0.15) * reach, z: reach } };
}

/** A golden five-point star, the shining goal of a level. */
export function goldStar(size: number): { group: Group; material: MeshStandardMaterial } {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? size : size * 0.45;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const material = new MeshStandardMaterial({ color: 0xffd25a, emissive: 0xffb020, emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.2 });
  const geometry = new ExtrudeGeometry(s, { depth: size * 0.25, bevelEnabled: true, bevelThickness: size * 0.08, bevelSize: size * 0.06, bevelSegments: 2 });
  geometry.center();
  const g = new Group();
  g.name = 'GoldStar';
  g.add(new Mesh(geometry, material));
  return { group: g, material };
}

/** A small dirt mound marking where something is buried. */
export function moundMark(): Group {
  const g = new Group();
  g.name = 'Mound';
  const m = new Mesh(new SphereGeometry(0.025, 14, 8), plush(0x9b7046));
  m.scale.set(1.2, 0.3, 1.2);
  g.add(m);
  softShade(g);
  return g;
}
