import { AdditiveBlending, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry } from '@iwsdk/core';

/**
 * A healing herb: a sprig of bright leaves around a glowing bud, floating in
 * the air within reach. The Ink Duel and the Arena grow one now and then
 * while you are hurt; pinching or touching it gives health back. `size` 1
 * is about 5 cm across (tabletop); the Arena uses a bigger one.
 */
export function herbSprig(size = 1): Group {
  const group = new Group();
  group.name = 'HealingHerb';
  const leaf = new MeshStandardMaterial({ color: 0x5fbf3a, emissive: 0x2a7a18, emissiveIntensity: 0.6, roughness: 0.5 });
  const blade = new IcosahedronGeometry(0.011 * size, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const mesh = new Mesh(blade, leaf);
    mesh.scale.set(0.45, 1.5, 0.2);
    mesh.position.set(Math.cos(a) * 0.008 * size, 0.006 * size, Math.sin(a) * 0.008 * size);
    mesh.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6);
    group.add(mesh);
  }
  const bud = new Mesh(new SphereGeometry(0.006 * size, 12, 8), new MeshBasicMaterial({ color: 0xd8ffb0 }));
  bud.position.y = 0.014 * size;
  const halo = new Mesh(new SphereGeometry(0.022 * size, 16, 10), new MeshBasicMaterial({ color: 0x7be36a, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false }));
  halo.position.y = 0.01 * size;
  group.add(bud, halo);
  group.traverse((o) => {
    o.userData.keep = true;
    o.raycast = () => {};
  });
  return group;
}

/** Frees a herb's geometry and materials once it is gone. */
export function disposeHerb(group: Group): void {
  group.removeFromParent();
  group.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    (mesh.material as MeshBasicMaterial).dispose();
  });
}
