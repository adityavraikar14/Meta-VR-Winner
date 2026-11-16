import { CircleGeometry, Color, Mesh, MeshBasicMaterial, type MeshStandardMaterial } from '@iwsdk/core';

/**
 * How a beaten fighter goes: they fall (their death clip), their body turns
 * to black ink, they sink into a spreading pool of it, and the ink dissolves.
 * `melt` runs 0 → 1 over that. Used by every captain, Morwen and the Arena's
 * rivals, so no one simply vanishes.
 */
const INK = new Color(0x0b0812);

/** One body material at this point of the melt (after its own colour and hit flash are set). */
export function meltLook(material: MeshStandardMaterial, melt: number): void {
  if (melt <= 0) return;
  // First the colour drains to ink, then the ink fades.
  material.color.lerp(INK, Math.min(1, melt / 0.45) * 0.92);
  const k = Math.max(0, Math.min(1, (melt - 0.45) / 0.55));
  material.transparent = true;
  material.opacity = 1 - k * k * (3 - 2 * k);
  material.depthWrite = material.opacity > 0.5;
}

/** The pool of ink that spreads under them as they melt (lies flat at the feet). */
export function makePuddle(radius: number): Mesh {
  const puddle = new Mesh(new CircleGeometry(radius, 28), new MeshBasicMaterial({ color: 0x0b0812, transparent: true, opacity: 0, depthWrite: false }));
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.y = 0.003;
  puddle.renderOrder = 2;
  puddle.visible = false;
  return puddle;
}

/** The pool for this point of the melt: it spreads, darkens, and (at the very end) fades too. */
export function puddleLook(puddle: Mesh, melt: number): void {
  puddle.visible = melt > 0;
  if (!puddle.visible) return;
  const grow = Math.min(1, melt / 0.6);
  puddle.scale.setScalar(0.2 + 0.8 * grow * (2 - grow));
  (puddle.material as MeshBasicMaterial).opacity = 0.85 * Math.min(1, melt * 3) * (melt > 0.85 ? (1 - melt) / 0.15 : 1);
}
