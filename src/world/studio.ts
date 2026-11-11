import {
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { FONT } from '../ui-theme.js';
import { fireflies } from './jungle.js';
import type { SceneryRoots } from './scenery.js';
import { crystals } from './themes.js';

/**
 * The Light Lab: one clean, modern stage for every chapter, in place of the
 * storybook jungle, river and mine.
 *
 * - The table: a self-healing cutting mat (bright green, a 1 cm grid with
 *   5 and 10 cm lines and a centimetre rule along the edges) on a rounded
 *   board whose rim takes the chapter's colour. The grid is to scale, so the
 *   machines and the spark's world read as real engineering at real sizes.
 * - The screen: a white lightbox bezel on two slim aluminium legs.
 * - Around you: nothing but a few slow motes of light (or your own room).
 */

/** The board's footprint in stage space (front is toward the player, +z). */
const BOARD = { left: -0.62, right: 0.62, front: 0.28, back: -0.62 };
const BOARD_DEPTH = 0.035;
const CORNER = 0.07;
const MAT_GREEN = '#2a9a5f';
/** Canvas pixels per metre of mat. */
const PX = 1650;

let matMap: CanvasTexture | null = null;

/** The cutting mat, drawn once: the grid is exactly 1 cm on the board. */
function matTexture(): CanvasTexture {
  if (matMap) return matMap;
  const width = BOARD.right - BOARD.left;
  const depth = BOARD.front - BOARD.back;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * PX);
  canvas.height = Math.round(depth * PX);
  const g = canvas.getContext('2d')!;
  // The mat: a deep green, a touch lighter in the middle.
  const base = g.createRadialGradient(canvas.width / 2, canvas.height / 2, 50, canvas.width / 2, canvas.height / 2, canvas.width * 0.7);
  base.addColorStop(0, '#33a96a');
  base.addColorStop(1, MAT_GREEN);
  g.fillStyle = base;
  g.fillRect(0, 0, canvas.width, canvas.height);
  // Grid: 1 cm, 5 cm and 10 cm lines, centred on the board's middle.
  const cm = PX / 100;
  const ox = canvas.width / 2;
  const oy = canvas.height - BOARD.front * PX;
  for (let i = -Math.ceil(canvas.width / cm); i <= Math.ceil(canvas.width / cm); i++) {
    const x = ox + i * cm;
    if (x < 0 || x > canvas.width) continue;
    g.strokeStyle = i % 10 === 0 ? 'rgba(255,255,255,0.42)' : i % 5 === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
    g.lineWidth = i % 10 === 0 ? 2.4 : i % 5 === 0 ? 1.6 : 1;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, canvas.height);
    g.stroke();
  }
  for (let j = -Math.ceil(canvas.height / cm); j <= Math.ceil(canvas.height / cm); j++) {
    const y = oy + j * cm;
    if (y < 0 || y > canvas.height) continue;
    g.strokeStyle = j % 10 === 0 ? 'rgba(255,255,255,0.42)' : j % 5 === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
    g.lineWidth = j % 10 === 0 ? 2.4 : j % 5 === 0 ? 1.6 : 1;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(canvas.width, y);
    g.stroke();
  }
  // A 45° and a 60° angle guide from the near left corner, as on a real mat.
  g.strokeStyle = 'rgba(255, 214, 90, 0.5)';
  g.lineWidth = 2;
  for (const angle of [45, 60]) {
    const a = (angle * Math.PI) / 180;
    g.beginPath();
    g.moveTo(0.04 * PX, canvas.height - 0.04 * PX);
    g.lineTo(0.04 * PX + Math.cos(a) * 0.3 * PX, canvas.height - 0.04 * PX - Math.sin(a) * 0.3 * PX);
    g.stroke();
  }
  // Centimetre numbers along the near edge (from the middle) and the left edge.
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = `700 ${Math.round(cm * 1.6)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = -55; i <= 55; i += 5) {
    g.fillText(String(Math.abs(i)), ox + i * cm, canvas.height - cm * 2.2);
  }
  g.textAlign = 'left';
  for (let j = 5; j <= 85; j += 5) g.fillText(String(j), cm * 1.2, canvas.height - j * cm);
  // A small maker's mark at the back right.
  g.textAlign = 'right';
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.font = `800 ${Math.round(cm * 2.2)}px ${FONT}`;
  g.fillText('SHADOWPLAY  LIGHT LAB', canvas.width - cm * 3, cm * 3.5);
  g.font = `600 ${Math.round(cm * 1.4)}px ${FONT}`;
  g.fillText('1 square = 1 cm  ·  self-healing mat', canvas.width - cm * 3, cm * 6);

  matMap = new CanvasTexture(canvas);
  matMap.colorSpace = SRGBColorSpace;
  matMap.anisotropy = 4;
  return matMap;
}

function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number, path: Shape | Path): void {
  path.moveTo(x0 + r, y0);
  path.lineTo(x1 - r, y0);
  path.quadraticCurveTo(x1, y0, x1, y0 + r);
  path.lineTo(x1, y1 - r);
  path.quadraticCurveTo(x1, y1, x1 - r, y1);
  path.lineTo(x0 + r, y1);
  path.quadraticCurveTo(x0, y1, x0, y1 - r);
  path.lineTo(x0, y0 + r);
  path.quadraticCurveTo(x0, y0, x0 + r, y0);
}

/** The board: the mat on top, the chapter's colour around the rim. Top face at y = 0. */
function board(accent: number): Mesh {
  // Shape in (x, v) with v = −z, so the extrusion rotated flat puts the top at y = depth.
  const shape = new Shape();
  roundedRect(BOARD.left, -BOARD.front, BOARD.right, -BOARD.back, CORNER, shape);
  const geometry = new ExtrudeGeometry(shape, { depth: BOARD_DEPTH, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 10 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -BOARD_DEPTH - 0.004, 0);
  const map = matTexture().clone();
  map.needsUpdate = true;
  map.wrapS = map.wrapT = RepeatWrapping;
  // The caps' UVs are the shape's own coordinates: fit the mat to them.
  map.repeat.set(1 / (BOARD.right - BOARD.left), 1 / (BOARD.front - BOARD.back));
  map.offset.set(-BOARD.left / (BOARD.right - BOARD.left), BOARD.front / (BOARD.front - BOARD.back));
  const top = new MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 });
  const rim = new MeshStandardMaterial({ color: accent, roughness: 0.35, metalness: 0.05 });
  const mesh = new Mesh(geometry, [top, rim]);
  mesh.name = 'LabBoard';
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The lightbox: a white bezel around the paper on two brushed-aluminium legs
 * standing on the board, with the chapter's colour along the bottom edge.
 */
function lightbox(width: number, height: number, groundY: number, accent: number): Group {
  const group = new Group();
  group.name = 'Lightbox';
  const margin = 0.035;
  const outer = new Shape();
  roundedRect(-width / 2 - margin, -height / 2 - margin, width / 2 + margin, height / 2 + margin, 0.04, outer);
  const hole = new Path();
  roundedRect(-width / 2 + 0.004, -height / 2 + 0.004, width / 2 - 0.004, height / 2 - 0.004, 0.012, hole);
  outer.holes.push(hole);
  const bezel = new Mesh(
    new ExtrudeGeometry(outer, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 10 }),
    new MeshStandardMaterial({ color: 0xf6f8fb, roughness: 0.28, metalness: 0.02 }),
  );
  bezel.position.z = -0.012;
  group.add(bezel);
  // The chapter's colour: a strip along the bottom of the bezel.
  const stripShape = new Shape();
  roundedRect(-width / 2 + 0.06, -height / 2 - margin + 0.008, width / 2 - 0.06, -height / 2 - 0.006, 0.008, stripShape);
  const strip = new Mesh(new ExtrudeGeometry(stripShape, { depth: 0.004, bevelEnabled: false }), new MeshStandardMaterial({ color: accent, roughness: 0.3, emissive: accent, emissiveIntensity: 0.25 }));
  strip.position.z = 0.0105;
  group.add(strip);
  // Two slim legs with round feet, down to the board.
  const metal = new MeshStandardMaterial({ color: 0xc9d0da, roughness: 0.32, metalness: 0.75 });
  const legTop = -height / 2 - margin;
  const legLength = Math.max(0.02, legTop - groundY);
  for (const side of [-1, 1]) {
    const leg = new Mesh(new CylinderGeometry(0.0075, 0.0075, legLength, 16), metal);
    leg.position.set(side * (width / 2 - 0.1), legTop - legLength / 2, -0.004);
    group.add(leg);
    const foot = new Mesh(new CylinderGeometry(0.03, 0.034, 0.008, 32), metal);
    foot.position.set(side * (width / 2 - 0.1), groundY + 0.004, -0.004);
    group.add(foot);
  }
  return group;
}

export interface LabTheme {
  /** The chapter's colour (board rim, bezel strip). */
  accent: number;
  /** Glass crystals at the back corners, in this colour. */
  crystal: number;
}

/** Build the Light Lab for a chapter. */
export function decorateLab(roots: SceneryRoots, theme: LabTheme): void {
  const g = new Group();
  g.name = 'Earth';
  g.position.y = roots.floor;
  g.add(board(theme.accent));
  // A few glass crystals at the back corners: light, colour, and depth, out of the way.
  for (const [x, z, size, n, seed] of [[-0.54, -0.52, 0.07, 6, 31], [0.55, -0.5, 0.06, 5, 32], [-0.56, 0.18, 0.035, 4, 33], [0.57, 0.17, 0.035, 4, 34]] as const) {
    const cluster = crystals(size, n, seed, theme.crystal);
    cluster.position.set(x, -0.002, z);
    g.add(cluster);
  }
  roots.stage.add(g);
  roots.screen.add(lightbox(roots.screenWidth, roots.screenHeight, roots.screenGround, theme.accent));
  // Around you: a few slow motes of light.
  roots.room.add(fireflies(28, new Vector3(-1.4, 0.6, -0.6), new Vector3(1.4, 2.1, 2.0), { color: '255,236,190', size: 0.012, seed: 4 }));
}
