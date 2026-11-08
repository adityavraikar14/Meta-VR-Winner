import { Group, Mesh, SphereGeometry, TorusGeometry, CylinderGeometry, Vector3 } from '@iwsdk/core';
import {
  addWhiskers,
  buildFace,
  glossy,
  lathe,
  plush,
  softShade,
  tintTracker,
  type CreatureRig,
} from './rig.js';

const COAT = 0xe6b06a;
const WHITE = 0xfff3e2;
const EAR = 0xb9783f;
const NOSE = 0x2b1f1c;
const TONGUE = 0xff7f95;
const COLLAR = 0xe0413c;
const TAG = 0xf4c542;

/** A sitting puppy with floppy ears and a curly tail. Origin at the base, facing +Z. */
export function createDog(): CreatureRig {
  const tints: CreatureRig['tints'] = [];
  const track = tintTracker(tints);
  const coat = track(plush(COAT));
  const white = track(plush(WHITE));
  const earFur = track(plush(EAR));
  const nose = track(glossy(NOSE, 0.2));
  const tongue = track(glossy(TONGUE, 0.35));
  const collar = track(glossy(COLLAR, 0.4));
  const tag = track(glossy(TAG, 0.2));

  const root = new Group();
  root.name = 'Dog';
  const body = new Group();
  body.name = 'Body';
  root.add(body);

  // Sitting body: wide haunches, narrower chest.
  const torso = new Mesh(
    lathe([[0, 0], [0.024, 0.002], [0.035, 0.014], [0.034, 0.03], [0.027, 0.048], [0.016, 0.06], [0, 0.064]]),
    coat,
  );
  torso.scale.set(1, 1, 1.1);
  body.add(torso);
  const chest = new Mesh(new SphereGeometry(0.022, 20, 14), white);
  chest.scale.set(1, 1.2, 0.55);
  chest.position.set(0, 0.034, 0.024);
  body.add(chest);

  const feet: Group[] = [];
  for (const side of [-1, 1]) {
    const foot = new Group();
    foot.name = side < 0 ? 'FootLeft' : 'FootRight';
    foot.position.set(side * 0.019, 0.007, 0.012);
    const paw = new Mesh(new SphereGeometry(0.01, 16, 10), white);
    paw.scale.set(1, 0.7, 1.5);
    paw.position.z = 0.008;
    foot.add(paw);
    body.add(foot);
    feet.push(foot);

    // Front legs, straight down from the chest.
    const leg = new Mesh(new CylinderGeometry(0.0065, 0.0075, 0.03, 12), coat);
    leg.position.set(side * 0.011, 0.018, 0.026);
    body.add(leg);
    const frontPaw = new Mesh(new SphereGeometry(0.0078, 14, 10), white);
    frontPaw.scale.set(1, 0.7, 1.3);
    frontPaw.position.set(side * 0.011, 0.004, 0.03);
    body.add(frontPaw);
  }

  // Curly tail standing up behind.
  const tail = new Group();
  tail.name = 'Tail';
  tail.position.set(0, 0.02, -0.034);
  const curl = new Mesh(new TorusGeometry(0.009, 0.0045, 10, 20, Math.PI * 1.4), coat);
  curl.rotation.set(0, Math.PI / 2, 0.4);
  curl.position.y = 0.009;
  tail.add(curl);
  body.add(tail);

  const head = new Group();
  head.name = 'Head';
  head.position.set(0, 0.078, 0.006);
  body.add(head);
  const skull = new Mesh(new SphereGeometry(0.03, 30, 22), coat);
  skull.scale.set(1.1, 0.95, 1);
  head.add(skull);
  // A white blaze and muzzle.
  const muzzle = new Mesh(new SphereGeometry(0.015, 20, 14), white);
  muzzle.scale.set(1.15, 0.8, 1);
  muzzle.position.set(0, -0.009, 0.022);
  head.add(muzzle);
  const blaze = new Mesh(new SphereGeometry(0.008, 12, 10), white);
  blaze.scale.set(0.8, 1.8, 0.5);
  blaze.position.set(0, 0.012, 0.026);
  head.add(blaze);
  const noseMesh = new Mesh(new SphereGeometry(0.0055, 14, 10), nose);
  noseMesh.scale.set(1.3, 0.9, 1);
  noseMesh.position.set(0, -0.003, 0.036);
  head.add(noseMesh);
  const tongueMesh = new Mesh(new SphereGeometry(0.004, 12, 8), tongue);
  tongueMesh.scale.set(1.1, 0.5, 1.4);
  tongueMesh.position.set(0, -0.0165, 0.03);
  head.add(tongueMesh);
  addWhiskers(head, new Vector3(0, -0.008, 0.033), 0.018);

  // Floppy ears hang beside the head; they flap when it hops.
  const ears: Group[] = [];
  for (const side of [-1, 1]) {
    const ear = new Group();
    ear.name = side < 0 ? 'EarLeft' : 'EarRight';
    ear.position.set(side * 0.026, 0.014, -0.002);
    ear.rotation.set(0, 0, side * 2.7);
    const flap = new Mesh(lathe([[0, 0], [0.009, 0.004], [0.011, 0.016], [0.009, 0.026], [0, 0.03]], 14), earFur);
    flap.scale.set(1, 1, 0.4);
    ear.add(flap);
    head.add(ear);
    ears.push(ear);
  }

  // Red collar with a little gold tag.
  const collarRing = new Mesh(new TorusGeometry(0.019, 0.003, 8, 28), collar);
  collarRing.rotation.x = Math.PI / 2;
  collarRing.position.y = 0.058;
  body.add(collarRing);
  const tagMesh = new Mesh(new SphereGeometry(0.0038, 10, 8), tag);
  tagMesh.scale.set(1, 1, 0.4);
  tagMesh.position.set(0, 0.052, 0.021);
  body.add(tagMesh);

  const { eyes, happyEyes, cheeks } = buildFace(head, track, {
    spacing: 0.013,
    y: 0.006,
    z: 0.026,
    size: 0.0074,
    iris: 0x5a3417,
    cheek: { x: 0.021, y: -0.007, z: 0.022, turn: 0.6, size: 0.006 },
  });
  softShade(root);

  return {
    kind: 'dog',
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
    radius: 0.042,
    height: 0.12,
  };
}
