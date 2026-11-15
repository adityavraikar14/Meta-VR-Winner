import {
  BufferGeometry,
  type CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The Shadow Run course in three dimensions: the painting stays on the
 * screen (the back wall, where your hand's shadow falls), and everything the
 * spark touches stands out of it as real things you could pick up: earth
 * blocks with a grass top, gold stars that spin, a ring for a gate, thorn
 * balls on their stems. The physics is still the flat world on the screen;
 * these only give it depth.
 */

/** How far the ground stands out of the screen, towards you (metres). */
export const SLAB = 0.05;
/** Where the spark and everything it meets sit: in the middle of the ground's depth. */
export const Z_PLAY = SLAB * 0.5;

type Pt = readonly [number, number];

/** Colours of a chapter's ground, from its painted look. */
export interface GroundColours {
  top: string;
  lip: string;
  side: string;
  outline: string;
}

/**
 * The ground: one mesh for the front faces (the painted course, so the grass
 * band and the earth match the picture exactly), one for the tops and sides
 * (shaded by which way they face), and a shadow-catcher on the front faces so
 * your hand's shadow falls across the blocks too.
 */
export function groundBlocks(
  terrain: readonly (readonly Pt[])[],
  painting: CanvasTexture,
  width: number,
  height: number,
  colours: GroundColours,
  shadowMaterial: Material | null,
): Group {
  const group = new Group();
  group.name = 'Course3D';
  const front: number[] = [];
  const frontUv: number[] = [];
  const sides: number[] = [];
  const sideColour: number[] = [];
  const top = new Color(colours.top);
  const lip = new Color(colours.lip);
  const side = new Color(colours.side);
  const edge = new Color(colours.outline);
  const c = new Color();
  const push = (out: number[], x: number, y: number, z: number) => out.push(x, y, z);
  const colour = (col: Color) => sideColour.push(col.r, col.g, col.b);
  for (const piece of terrain) {
    // Front face: a fan over the convex piece, at the front of the slab.
    for (let i = 1; i + 1 < piece.length; i++) {
      for (const [x, y] of [piece[0], piece[i], piece[i + 1]]) {
        push(front, x, y, SLAB);
        frontUv.push(x / width + 0.5, y / height + 0.5);
      }
    }
    // Sides: a quad per edge, from the screen out to the front face.
    for (let i = 0; i < piece.length; i++) {
      const [x0, y0] = piece[i];
      const [x1, y1] = piece[(i + 1) % piece.length];
      const ex = x1 - x0;
      const ey = y1 - y0;
      const length = Math.hypot(ex, ey);
      if (length < 1e-5) continue;
      // Outward normal of a counter-clockwise piece; pieces are wound either way, so check.
      let nx = ey / length;
      let ny = -ex / length;
      const cx = piece.reduce((s, p) => s + p[0], 0) / piece.length;
      const cy = piece.reduce((s, p) => s + p[1], 0) / piece.length;
      if (((x0 + x1) / 2 - cx) * nx + ((y0 + y1) / 2 - cy) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      // Faces pointing down are never seen (the course sits on the screen's floor).
      if (ny < -0.6) continue;
      const up = ny > 0.35;
      // Wound so the face points out (it is drawn one-sided).
      const flip = nx * -ey + ny * ex > 0;
      const a = flip ? [x1, y1] : [x0, y0];
      const b = flip ? [x0, y0] : [x1, y1];
      const quad: Array<[number, number, number]> = [
        [a[0], a[1], 0],
        [b[0], b[1], 0],
        [b[0], b[1], SLAB],
        [a[0], a[1], 0],
        [b[0], b[1], SLAB],
        [a[0], a[1], SLAB],
      ];
      for (const [x, y, z] of quad) {
        push(sides, x, y, z);
        if (up) {
          // The top: grass, darker towards the screen (it sits in the shadow box), bright at the front lip.
          c.copy(top).lerp(lip, (z / SLAB) * 0.55).multiplyScalar(0.72 + 0.28 * (z / SLAB));
        } else {
          // Earth walls, lit from the upper left: left-facing walls lighter, right-facing darker.
          c.copy(side).multiplyScalar(0.62 + 0.18 * -nx + 0.1 * (z / SLAB));
          if (z === 0) c.lerp(edge, 0.35);
        }
        colour(c);
      }
    }
  }
  const frontGeometry = new BufferGeometry();
  frontGeometry.setAttribute('position', new Float32BufferAttribute(front, 3));
  frontGeometry.setAttribute('uv', new Float32BufferAttribute(frontUv, 2));
  const faces = new Mesh(frontGeometry, new MeshBasicMaterial({ map: painting }));
  faces.name = 'CourseFront';
  // Your hand's shadow falls on the blocks too, just as it does on the screen behind them.
  if (shadowMaterial) {
    const catcher = new Mesh(frontGeometry, shadowMaterial);
    catcher.position.z = 0.0006;
    catcher.receiveShadow = true;
    catcher.renderOrder = 2;
    group.add(catcher);
  }
  const sideGeometry = new BufferGeometry();
  sideGeometry.setAttribute('position', new Float32BufferAttribute(sides, 3));
  sideGeometry.setAttribute('color', new Float32BufferAttribute(sideColour, 3));
  const walls = new Mesh(sideGeometry, new MeshBasicMaterial({ vertexColors: true }));
  walls.name = 'CourseSides';
  group.add(faces, walls);
  return group;
}

/** A five-pointed star with bevelled edges, standing up, centred on its middle. */
export function starGeometry(radius: number): BufferGeometry {
  const shape = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 ? radius * 0.45 : radius;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const depth = radius * 0.32;
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: radius * 0.14,
    bevelSize: radius * 0.1,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** Gold, glowing a little from inside so it reads in any light. */
export function starMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: 0xffc62a, emissive: 0xff9a10, emissiveIntensity: 0.45, metalness: 0.35, roughness: 0.3 });
}

/** The gate: a fat glowing ring, standing to face you. */
export function gateMesh(radius: number): Mesh {
  const ring = new Mesh(
    new TorusGeometry(radius * 0.86, radius * 0.17, 12, 36),
    new MeshStandardMaterial({ color: 0xff9f1a, emissive: 0xff7a00, emissiveIntensity: 0.55, metalness: 0.2, roughness: 0.35 }),
  );
  ring.name = 'Gate3D';
  return ring;
}

/** An ink thorn: a dark spiky ball with a hot red heart. */
export function thornMesh(radius: number): Mesh {
  const core = new IcosahedronGeometry(radius * 0.55, 0);
  const parts: BufferGeometry[] = [core.toNonIndexed()];
  const up = new Vector3(0, 1, 0);
  const dir = new Vector3();
  const turn = new Quaternion();
  const m = new Matrix4();
  const position = core.getAttribute('position');
  const seen = new Set<string>();
  for (let i = 0; i < position.count; i++) {
    dir.fromBufferAttribute(position, i).normalize();
    const key = `${dir.x.toFixed(2)},${dir.y.toFixed(2)},${dir.z.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // A cone points up its y axis: lift it to the ball's surface, then turn it to point outwards.
    const spike = new ConeGeometry(radius * 0.22, radius * 0.75, 5);
    spike.translate(0, radius * 0.85, 0);
    spike.applyMatrix4(m.makeRotationFromQuaternion(turn.setFromUnitVectors(up, dir)));
    parts.push(spike.toNonIndexed());
    spike.dispose();
  }
  core.dispose();
  const merged = mergeGeometries(parts)!;
  merged.computeVertexNormals();
  const mesh = new Mesh(merged, new MeshStandardMaterial({ color: 0x1a0e18, emissive: 0x5a0a10, emissiveIntensity: 0.5, roughness: 0.55, metalness: 0.1 }));
  mesh.name = 'Thorn3D';
  return mesh;
}

/** A thorn's stem: a bramble up from the pit or a vine down from above, as a thin round stalk. */
export function stemMesh(length: number, bramble: boolean): Mesh {
  const mesh = new Mesh(
    new CylinderGeometry(0.0035, 0.0045, length, 6),
    new MeshStandardMaterial({ color: bramble ? 0x1c1016 : 0x2f6a2a, roughness: 0.8 }),
  );
  mesh.name = 'ThornStem';
  return mesh;
}
