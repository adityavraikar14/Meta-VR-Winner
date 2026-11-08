import {
  BufferAttribute,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';

/** How a creature gets around, which decides its idle behaviour. */
export type Locomotion = 'hopper' | 'flyer' | 'crawler';

/**
 * Named parts of a creature that its animation drives. Every creature model
 * returns this shape so behaviour code can stay creature-agnostic.
 */
export interface CreatureRig {
  kind: string;
  locomotion: Locomotion;
  root: Group;
  /** Squash and stretch pivot at the feet. */
  body: Group;
  head: Group;
  /** Ears that flatten when petted and twitch at rest (may be empty). */
  ears: Group[];
  /** Wings that flap in flight, pivoting at the shoulder (may be empty). */
  wings: Group[];
  /** Open eyes; scaled on Y to blink. */
  eyes: Group;
  /** Closed "^ ^" eyes shown when happy. */
  happyEyes: Group;
  cheeks: MeshBasicMaterial;
  tail: Group;
  feet: Group[];
  /** Every coloured material with its true colour, for the shadow-to-colour fade. */
  tints: Array<{ material: MeshPhysicalMaterial | MeshBasicMaterial; color: Color }>;
  /** Approximate body radius and height, for touch tests. */
  radius: number;
  height: number;
  /** Creature-specific parts: a snail's shell, a dragon's mouth. */
  extras?: { shell?: Group; mouth?: Group };
}

/** Soft velvet look for plush fur: rough base with a gentle sheen at grazing angles. */
export function plush(color: number): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color,
    roughness: 0.9,
    sheen: 0.35,
    sheenRoughness: 0.6,
    sheenColor: new Color(0xfff1e0),
  });
  material.userData.softShade = true;
  return material;
}

/** Smooth glossy surface for shells, horns and hooves. */
export function glossy(color: number, roughness = 0.35): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({ color, roughness, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  material.userData.softShade = true;
  return material;
}

/** Glossy dark eye material with a clear-coat highlight. */
export function eyeMaterial(color = 0x1d1418): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
}

/** A smooth surface of revolution through the given (radius, height) points. */
export function lathe(points: Array<[number, number]>, segments = 28): LatheGeometry {
  return new LatheGeometry(points.map(([r, y]) => new Vector2(r, y)), segments);
}

/** Registers materials whose colour fades in from shadow-black as a creature emerges. */
export function tintTracker(tints: CreatureRig['tints']) {
  return <M extends MeshPhysicalMaterial | MeshBasicMaterial>(material: M): M => {
    tints.push({ material, color: material.color.clone() });
    return material;
  };
}

/** Releases GPU resources of a rig that is no longer used. */
export function disposeRig(rig: CreatureRig): void {
  const materials = new Set<Material>();
  rig.root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    materials.add(mesh.material as Material);
  });
  materials.forEach((m) => m.dispose());
}

export interface FaceOptions {
  /** Eye centre spacing from the midline, height offset and forward depth. */
  spacing: number;
  y: number;
  z: number;
  /** Eye radius. */
  size: number;
  /** Iris colour, visible as a ring around the pupil. */
  iris?: number;
  cheekColor?: number;
  /** Cheek position (side offset, height, depth) and how far they turn outward. */
  cheek?: { x: number; y: number; z: number; turn: number; size: number };
}

/**
 * Big expressive cartoon eyes (iris, pupil, two highlights), "^ ^" happy
 * eyes and blush cheeks, added to a head. Every creature uses the same face
 * language so they read as one family.
 */
export function buildFace(
  head: Group,
  track: ReturnType<typeof tintTracker>,
  o: FaceOptions,
): { eyes: Group; happyEyes: Group; cheeks: MeshBasicMaterial } {
  const iris = track(new MeshPhysicalMaterial({ color: o.iris ?? 0x6b4226, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }));
  const pupil = track(eyeMaterial(0x120b0e));
  const shine = new MeshBasicMaterial({ color: 0xffffff });
  const cheeks = track(
    new MeshBasicMaterial({ color: o.cheekColor ?? 0xff97b2, transparent: true, opacity: 0.45, depthWrite: false }),
  );

  const eyes = new Group();
  eyes.name = 'Eyes';
  head.add(eyes);
  const happyEyes = new Group();
  happyEyes.name = 'HappyEyes';
  happyEyes.visible = false;
  head.add(happyEyes);
  const r = o.size;
  const arc = new TorusGeometry(r * 0.8, r * 0.17, 6, 16, Math.PI);
  for (const side of [-1, 1]) {
    const eye = new Group();
    eye.position.set(side * o.spacing, o.y, o.z);
    eye.rotation.y = side * 0.25;
    eyes.add(eye);
    const ball = new Mesh(new SphereGeometry(r, 20, 14), iris);
    ball.scale.set(1, 1.15, 0.55);
    eye.add(ball);
    const dark = new Mesh(new SphereGeometry(r * 0.68, 16, 12), pupil);
    dark.scale.set(1, 1.15, 0.5);
    dark.position.z = r * 0.16;
    eye.add(dark);
    const big = new Mesh(new SphereGeometry(r * 0.3, 10, 8), shine);
    big.position.set(r * 0.3, r * 0.42, r * 0.5);
    eye.add(big);
    const small = new Mesh(new SphereGeometry(r * 0.13, 8, 6), shine);
    small.position.set(-r * 0.32, -r * 0.35, r * 0.5);
    eye.add(small);

    const closed = new Mesh(arc, pupil);
    closed.position.set(side * o.spacing, o.y + r * 0.3, o.z + r * 0.3);
    happyEyes.add(closed);

    if (o.cheek) {
      const cheek = new Mesh(new CircleGeometry(o.cheek.size, 18), cheeks);
      cheek.position.set(side * o.cheek.x, o.cheek.y, o.cheek.z);
      cheek.rotation.y = side * o.cheek.turn;
      head.add(cheek);
    }
  }
  return { eyes, happyEyes, cheeks };
}

/** Fine whiskers either side of a muzzle. */
export function addWhiskers(head: Group, at: Vector3, length: number): void {
  const material = new MeshBasicMaterial({ color: 0x6b5b52, transparent: true, opacity: 0.7 });
  const geometry = new CylinderGeometry(0.00035, 0.00035, length, 4);
  geometry.rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    for (const tilt of [-0.18, 0.05, 0.25]) {
      const whisker = new Mesh(geometry, material);
      whisker.position.set(at.x + side * length * 0.5, at.y + tilt * 0.01, at.z);
      whisker.rotation.set(0, side * 0.25, side * tilt);
      head.add(whisker);
    }
  }
}

/**
 * Bakes soft top-down light into every plush or glossy surface as vertex
 * colours: full colour on top, a warm 35% darker underside. Gives the
 * rounded, sculpted look of animated-film characters at no runtime cost.
 */
export function softShade(root: Group): void {
  root.updateMatrixWorld(true);
  const point = new Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  });
  const span = Math.max(1e-6, maxY - minY);
  const shaded = new Set<object>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[];
    if (!materials.some((m) => m.userData.softShade) || shaded.has(mesh.geometry)) return;
    shaded.add(mesh.geometry);
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const height = (point.y - minY) / span;
      // Downward-facing surfaces get a touch more occlusion.
      const down = normal ? Math.max(0, -normal.getY(i)) : 0;
      const light = Math.min(1, 0.68 + 0.32 * Math.sqrt(height)) * (1 - down * 0.12);
      colors[i * 3] = light;
      colors[i * 3 + 1] = light * 0.97;
      colors[i * 3 + 2] = light * 0.94;
    }
    mesh.geometry.setAttribute('color', new BufferAttribute(colors, 3));
    for (const m of materials) if (m.userData.softShade) (m as MeshPhysicalMaterial).vertexColors = true;
  });
}
