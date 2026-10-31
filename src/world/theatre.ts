import { BoxGeometry, BufferAttribute, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from '@iwsdk/core';
import { surface } from './nature.js';

/**
 * The shadow theatre around the paper: a walnut frame with a heavier carved
 * top rail, a thin brass lip where wood meets paper, and crimson velvet
 * curtains drawn back to either side. Paper-space, origin at the paper
 * centre; nothing here casts a shadow, so the lantern only sees your hands.
 */
const BAR = 0.034;
const DEPTH = 0.032;
const CURTAIN_WIDTH = 0.17;

export function buildTheatre(width: number, height: number): Group {
  const root = new Group();
  root.name = 'Theatre';
  const wood = surface('wood', 1, 1, 0xd8c4b4);
  const brass = new MeshStandardMaterial({ color: 0xc89b52, metalness: 1, roughness: 0.32 });

  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: MeshStandardMaterial, name: string) => {
    const geometry = new BoxGeometry(w, h, d);
    // Keep the grain at a sensible scale whatever the bar's length.
    const uv = geometry.attributes.uv as BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, h) * 3, uv.getY(i) * Math.min(w, h) * 3);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.name = name;
    root.add(mesh);
    return mesh;
  };

  const outerW = width + BAR * 2;
  const z = DEPTH / 2 - 0.004;
  box(outerW, BAR, DEPTH, 0, -height / 2 - BAR / 2, z, wood, 'FrameBottom');
  box(BAR, height, DEPTH, -width / 2 - BAR / 2, 0, z, wood, 'FrameLeft');
  box(BAR, height, DEPTH, width / 2 + BAR / 2, 0, z, wood, 'FrameRight');
  // Top rail: a deeper beam with a projecting cap moulding.
  box(outerW, BAR * 1.25, DEPTH, 0, height / 2 + BAR * 0.625, z, wood, 'FrameTop');
  box(outerW + 0.02, 0.012, DEPTH + 0.014, 0, height / 2 + BAR * 1.25 + 0.006, z + 0.004, wood, 'FrameCap');
  // Brass lip around the paper.
  const lip = 0.004;
  box(width + lip * 2, lip, 0.006, 0, height / 2 + lip / 2, 0.003, brass, 'BrassTop');
  box(width + lip * 2, lip, 0.006, 0, -height / 2 - lip / 2, 0.003, brass, 'BrassBottom');
  box(lip, height, 0.006, -width / 2 - lip / 2, 0, 0.003, brass, 'BrassLeft');
  box(lip, height, 0.006, width / 2 + lip / 2, 0, 0.003, brass, 'BrassRight');

  const velvet = surface('velvet', 2.5, 4, 0xb04040);
  velvet.side = DoubleSide;
  for (const side of [-1, 1]) {
    const curtain = new Mesh(curtainGeometry(CURTAIN_WIDTH, height + BAR * 2.4, side), velvet);
    curtain.name = side < 0 ? 'CurtainLeft' : 'CurtainRight';
    curtain.position.set(side * (width / 2 + BAR + CURTAIN_WIDTH / 2 - 0.012), BAR * 0.5, DEPTH + 0.006);
    root.add(curtain);
  }
  return root;
}

/**
 * A drawn-back curtain: deep vertical folds, gathered tight at a tie-back
 * about a third of the way up and flaring out to the floor below it.
 */
function curtainGeometry(width: number, height: number, side: number): PlaneGeometry {
  const geometry = new PlaneGeometry(width, height, 56, 40);
  const position = geometry.attributes.position as BufferAttribute;
  const tie = -height * 0.18;
  for (let i = 0; i < position.count; i++) {
    const u = position.getX(i) / width + 0.5; // 0 inner edge .. 1 outer edge (before mirroring)
    const y = position.getY(i);
    // Distance from the tie-back, 0 at the cord.
    const fromTie = Math.abs(y - tie) / (height / 2);
    // Gathered towards the outer side at the cord, fuller above and below.
    const spread = 0.38 + 0.62 * Math.min(1, fromTie * 1.3);
    const across = (1 - spread) + u * spread;
    const x = (across - 0.5) * width;
    const folds = Math.sin(u * Math.PI * 9 + y * 3) * 0.011 * (0.5 + 0.5 * Math.min(1, fromTie * 2));
    const outer = side < 0 ? -x : x;
    position.setXYZ(i, outer, y, folds + 0.004 * Math.sin(u * Math.PI));
  }
  geometry.computeVertexNormals();
  return geometry;
}
