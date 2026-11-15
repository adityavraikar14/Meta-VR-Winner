import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

/**
 * The screen as the back wall of a box of light: pale walls run from its
 * edges out towards you, and glowing edges trace the box, so the level reads
 * as a little room your hands reach into rather than a picture on a board.
 * The chapter's colour lights the edges. Nothing here casts or catches a
 * shadow: the hand shadows stay on the screen.
 */

/** How far the box reaches out of the screen towards you (metres). */
export const BOX_DEPTH = 0.11;
const EDGE = 0.0045;

/** Each chapter's edge colour: jungle green, river teal, ember orange, snow blue, dragon violet. */
const ACCENTS = [0x6dff5a, 0x4ae0ff, 0xffa030, 0xbfe4ff, 0xc890ff];

let wallTexture: CanvasTexture | null = null;

/** A wall: bright where it meets the lit screen, fading out towards you. */
function wallGradient(): CanvasTexture {
  if (wallTexture) return wallTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(255, 252, 240, 0.9)');
  grad.addColorStop(0.55, 'rgba(240, 246, 255, 0.45)');
  grad.addColorStop(1, 'rgba(230, 240, 255, 0.06)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 8);
  wallTexture = new CanvasTexture(canvas);
  wallTexture.colorSpace = SRGBColorSpace;
  return wallTexture;
}

/**
 * The box around a screen `width` × `height` (paper space, the screen at
 * z = 0, centred), its walls from `bottom` up (the stage hides what is below).
 */
export function shadowBox(width: number, height: number, bottom: number, world: number): Group {
  const group = new Group();
  group.name = 'ShadowBox';
  const accent = ACCENTS[world % ACCENTS.length];
  const wall = new MeshBasicMaterial({ map: wallGradient(), transparent: true, depthWrite: false, side: DoubleSide });
  const top = height / 2;
  const tall = top - bottom;
  const d = BOX_DEPTH;
  // Side walls: the gradient runs along the depth (u), from the screen out.
  for (const sign of [-1, 1]) {
    const side = new Mesh(new PlaneGeometry(d, tall), wall);
    // Turned so the gradient's bright end meets the screen (both walls the same way: they are two-sided).
    side.rotation.y = -Math.PI / 2;
    side.position.set((sign * width) / 2, bottom + tall / 2, d / 2);
    side.renderOrder = 1;
    group.add(side);
  }
  const lid = new Mesh(new PlaneGeometry(d, width), wall);
  // Lay it flat as a ceiling, its u (the gradient) running out from the screen.
  lid.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  lid.position.set(0, top, d / 2);
  lid.renderOrder = 1;
  group.add(lid);

  // Glowing edges: the rim of the screen, the four corners running out, and the box's open front.
  const glow = new MeshBasicMaterial({ color: accent });
  const bar = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const mesh = new Mesh(new BoxGeometry(sx, sy, sz), glow);
    mesh.position.set(x, y, z);
    group.add(mesh);
  };
  const w = width / 2;
  // The screen's rim (back of the box).
  bar(width + EDGE, EDGE, EDGE, 0, top, EDGE / 2);
  for (const sign of [-1, 1]) bar(EDGE, tall, EDGE, sign * w, bottom + tall / 2, EDGE / 2);
  // Running out towards you along the top corners and down the front.
  for (const sign of [-1, 1]) {
    bar(EDGE, EDGE, d, sign * w, top, d / 2);
    bar(EDGE, tall, EDGE, sign * w, bottom + tall / 2, d);
  }
  bar(width + EDGE, EDGE, EDGE, 0, top, d);
  // A soft halo on the front edges, so they glow rather than just being coloured.
  const halo = new MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.22, depthWrite: false });
  const soft = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const mesh = new Mesh(new BoxGeometry(sx, sy, sz), halo);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 2;
    group.add(mesh);
  };
  const H = EDGE * 4;
  soft(width + H, H, H, 0, top, d);
  for (const sign of [-1, 1]) {
    soft(H, tall, H, sign * w, bottom + tall / 2, d);
    soft(H, H, d, sign * w, top, d / 2);
  }
  return group;
}
