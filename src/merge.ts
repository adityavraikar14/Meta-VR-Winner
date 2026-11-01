import { type BufferGeometry, type Material, Mesh, type Object3D } from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Cuts draw calls by merging sibling meshes that share a material into one
 * mesh. Only leaf meshes are merged, so anything animated through a parent
 * group (heads, ears, props that tween) keeps working. Mark a mesh with
 * `userData.keep = true` to leave it alone. Call before the first render.
 */
export function mergeStatic(root: Object3D): void {
  const parents: Object3D[] = [];
  root.traverse((o) => {
    if (o.children.length > 1) parents.push(o);
  });
  for (const parent of parents) mergeChildren(parent);
}

/**
 * Bakes modelling-only groups (pivots nothing animates) into their children
 * so more meshes end up as siblings that `mergeStatic` can combine. Groups in
 * `keep` stay, as do groups whose non-uniform scale could not be baked into a
 * rotated child without shearing.
 */
export function flattenGroups(root: Object3D, keep: Set<Object3D>): void {
  for (const child of [...root.children]) {
    flattenGroups(child, keep);
    const mesh = child as Mesh;
    if (mesh.isMesh || keep.has(child) || child.type !== 'Group') continue;
    const s = child.scale;
    const uniform = Math.abs(s.x - s.y) < 1e-6 && Math.abs(s.y - s.z) < 1e-6;
    if (!uniform && child.children.some((c) => c.rotation.x || c.rotation.y || c.rotation.z)) continue;
    child.updateMatrix();
    for (const inner of [...child.children]) {
      inner.applyMatrix4(child.matrix);
      root.add(inner);
    }
    root.remove(child);
  }
}

function mergeChildren(parent: Object3D): void {
  const buckets = new Map<string, Mesh[]>();
  for (const child of parent.children) {
    const mesh = child as Mesh;
    if (!mesh.isMesh || (mesh as { isInstancedMesh?: boolean }).isInstancedMesh) continue;
    if (mesh.children.length > 0 || mesh.userData.keep || !mesh.visible) continue;
    // With one material, draw groups (every Box, Cylinder, Extrude has them) change nothing.
    if (Array.isArray(mesh.material)) continue;
    if (mesh.geometry.morphAttributes.position) continue;
    const key = [
      (mesh.material as Material).uuid,
      mesh.geometry.index ? 'i' : 'n',
      Object.keys(mesh.geometry.attributes).sort().join(','),
      mesh.castShadow, mesh.receiveShadow, mesh.renderOrder,
    ].join('|');
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(mesh);
  }

  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const geometries: BufferGeometry[] = meshes.map((mesh) => {
      mesh.updateMatrix();
      const g = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      g.clearGroups();
      return g;
    });
    const merged = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    if (!merged) continue;
    const first = meshes[0];
    const mesh = new Mesh(merged, first.material);
    mesh.name = `${first.name || 'part'}+${meshes.length - 1}`;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    for (const old of meshes) {
      parent.remove(old);
      old.geometry.dispose();
    }
    parent.add(mesh);
  }
}
