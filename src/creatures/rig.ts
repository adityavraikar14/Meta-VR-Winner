import {
  Color,
  Group,
  LatheGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Vector2,
} from '@iwsdk/core';

/** How a creature gets around, which decides its idle behaviour. */
export type Locomotion = 'hopper' | 'flyer';

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
}

/** Soft velvet look for plush fur: rough base with a gentle sheen at grazing angles. */
export function plush(color: number): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color,
    roughness: 0.9,
    sheen: 0.35,
    sheenRoughness: 0.6,
    sheenColor: new Color(0xfff1e0),
  });
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
