import { CylinderGeometry, Group, Mesh, SphereGeometry, Vector3 } from '@iwsdk/core';
import { buildFace, glossy, lathe, plush, softShade, tintTracker, type CreatureRig } from './rig.js';

const COAT = 0xd99a5b;
const CREAM = 0xfbe8cf;
const HOOF = 0x5a3a28;
const ANTLER = 0xf3dfb8;
const NOSE = 0x3b2a26;
const INNER_EAR = 0xffc3b0;

/** A spotted fawn standing on four slim legs. Origin at the hooves, facing +Z. */
export function createDeer(): CreatureRig {
  const tints: CreatureRig['tints'] = [];
  const track = tintTracker(tints);
  const coat = track(plush(COAT));
  const cream = track(plush(CREAM));
  const hoof = track(glossy(HOOF, 0.4));
  const antler = track(glossy(ANTLER, 0.5));
  const nose = track(glossy(NOSE, 0.25));
  const innerEar = track(plush(INNER_EAR));

  const root = new Group();
  root.name = 'Deer';
  const body = new Group();
  body.name = 'Body';
  root.add(body);

  // Barrel body, lying along Z.
  const barrel = new Mesh(new SphereGeometry(0.03, 28, 18), coat);
  barrel.name = 'Barrel';
  barrel.scale.set(0.85, 0.78, 1.35);
  barrel.position.set(0, 0.062, 0);
  body.add(barrel);
  const belly = new Mesh(new SphereGeometry(0.026, 22, 14), cream);
  belly.scale.set(0.75, 0.5, 1.2);
  belly.position.set(0, 0.05, 0.002);
  body.add(belly);
  // Fawn spots along the back.
  const spots: Array<[number, number]> = [[-0.012, 0.012], [0.011, -0.004], [-0.009, -0.016], [0.013, 0.018], [0, -0.026], [-0.015, 0.0]];
  for (const [x, z] of spots) {
    const spot = new Mesh(new SphereGeometry(0.0042, 10, 8), cream);
    spot.scale.set(1, 0.35, 1);
    const p = new Vector3(x, 0.083, z);
    spot.position.copy(p);
    body.add(spot);
  }

  // Legs: tapered cylinders with glossy hooves. Front legs kick when carried.
  const legGeometry = new CylinderGeometry(0.0055, 0.004, 0.042, 10);
  legGeometry.translate(0, -0.021, 0);
  const feet: Group[] = [];
  for (const [x, z, front] of [[-0.014, 0.026, true], [0.014, 0.026, true], [-0.014, -0.026, false], [0.014, -0.026, false]] as const) {
    const leg = new Group();
    leg.name = `${front ? 'Front' : 'Back'}Leg${x < 0 ? 'Left' : 'Right'}`;
    leg.position.set(x, 0.048, z);
    leg.add(new Mesh(legGeometry, coat));
    const h = new Mesh(new CylinderGeometry(0.0045, 0.005, 0.007, 10), hoof);
    h.position.y = -0.045;
    leg.add(h);
    body.add(leg);
    if (front) feet.push(leg);
  }

  const tail = new Group();
  tail.name = 'Tail';
  tail.position.set(0, 0.075, -0.04);
  tail.rotation.x = -0.6;
  const puff = new Mesh(new SphereGeometry(0.008, 12, 10), cream);
  puff.scale.set(0.9, 1.4, 0.8);
  tail.add(puff);
  body.add(tail);

  // Neck and head, held high.
  const neck = new Mesh(lathe([[0, 0], [0.012, 0.002], [0.01, 0.03], [0, 0.034]], 16), coat);
  neck.position.set(0, 0.07, 0.03);
  neck.rotation.x = 0.35;
  body.add(neck);

  const head = new Group();
  head.name = 'Head';
  head.position.set(0, 0.108, 0.043);
  body.add(head);
  const skull = new Mesh(new SphereGeometry(0.021, 26, 18), coat);
  skull.scale.set(1, 0.95, 1.05);
  head.add(skull);
  const snout = new Mesh(new SphereGeometry(0.012, 18, 12), cream);
  snout.scale.set(0.95, 0.8, 1.2);
  snout.position.set(0, -0.007, 0.017);
  head.add(snout);
  const noseTip = new Mesh(new SphereGeometry(0.0042, 12, 8), nose);
  noseTip.scale.set(1.3, 0.9, 1);
  noseTip.position.set(0, -0.004, 0.0305);
  head.add(noseTip);

  // Big leaf-shaped ears out to the sides.
  const ears: Group[] = [];
  for (const side of [-1, 1]) {
    const ear = new Group();
    ear.name = side < 0 ? 'EarLeft' : 'EarRight';
    ear.position.set(side * 0.016, 0.012, -0.004);
    ear.rotation.z = -side * 1.0;
    const outer = new Mesh(lathe([[0, 0], [0.007, 0.004], [0.009, 0.014], [0.006, 0.024], [0, 0.028]], 14), coat);
    outer.scale.set(1, 1, 0.45);
    ear.add(outer);
    const inner = new Mesh(lathe([[0, 0], [0.005, 0.005], [0.0065, 0.013], [0.004, 0.021], [0, 0.024]], 14), innerEar);
    inner.scale.set(1, 1, 0.3);
    inner.position.z = 0.0025;
    ear.add(inner);
    head.add(ear);
    ears.push(ear);

    // Little velvet antler nubs with a single fork.
    const nub = new Group();
    nub.position.set(side * 0.007, 0.019, -0.002);
    nub.rotation.z = -side * 0.25;
    const stem = new Mesh(new CylinderGeometry(0.0018, 0.0026, 0.016, 8), antler);
    stem.position.y = 0.008;
    nub.add(stem);
    const fork = new Mesh(new CylinderGeometry(0.0013, 0.0018, 0.008, 8), antler);
    fork.position.set(side * 0.003, 0.012, 0.002);
    fork.rotation.z = -side * 0.8;
    nub.add(fork);
    head.add(nub);
  }

  const { eyes, happyEyes, cheeks } = buildFace(head, track, {
    spacing: 0.011,
    y: 0.004,
    z: 0.016,
    size: 0.0068,
    iris: 0x4a2c1a,
    cheek: { x: 0.016, y: -0.006, z: 0.014, turn: 0.7, size: 0.0048 },
  });
  softShade(root);

  return {
    kind: 'deer',
    locomotion: 'hopper',
    root,
    body,
    head,
    ears,
    wings: [],
    eyes,
    happyEyes,
    cheeks,
    tail,
    feet,
    tints,
    radius: 0.045,
    height: 0.14,
  };
}
