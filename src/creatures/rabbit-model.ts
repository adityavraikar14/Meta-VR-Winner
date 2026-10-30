import {
  CircleGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  TorusGeometry,
} from '@iwsdk/core';
import { eyeMaterial, lathe, plush, tintTracker, type CreatureRig } from './rig.js';

const FUR = 0xefd6bd;
const FUR_SHADE = 0xdcb894;
const INNER_EAR = 0xffb1c2;
const NOSE = 0xff8aa1;
const CHEEK = 0xff97b2;

/** Pear-shaped body: wide hips, narrower shoulders. Origin at the base. */
function bodyGeometry(): LatheGeometry {
  return lathe([
    [0, 0], [0.022, 0.002], [0.033, 0.012], [0.036, 0.026],
    [0.033, 0.042], [0.025, 0.054], [0.012, 0.061], [0, 0.063],
  ]);
}

/** Long rounded ear with a pointed-soft tip. Origin at the ear root. */
function earGeometry(scale = 1): LatheGeometry {
  return lathe(
    [
      [0, 0], [0.008, 0.004], [0.0115, 0.016], [0.012, 0.03],
      [0.0105, 0.043], [0.007, 0.052], [0, 0.057],
    ].map(([r, y]) => [r * scale, y * scale] as [number, number]),
    18,
  );
}

export function createRabbit(): CreatureRig {
  const tints: CreatureRig['tints'] = [];
  const track = tintTracker(tints);
  const fur = track(plush(FUR));
  const furShade = track(plush(FUR_SHADE));
  const innerEar = track(plush(INNER_EAR));
  const nose = track(plush(NOSE));
  const eye = track(eyeMaterial());
  const shine = new MeshBasicMaterial({ color: 0xffffff });
  const cheeks = track(
    new MeshBasicMaterial({ color: CHEEK, transparent: true, opacity: 0.45, depthWrite: false }),
  );

  const root = new Group();
  root.name = 'Rabbit';
  const body = new Group();
  body.name = 'Body';
  root.add(body);

  const torso = new Mesh(bodyGeometry(), fur);
  torso.name = 'Torso';
  torso.scale.set(1, 1, 1.08);
  body.add(torso);

  // Belly patch: a slightly lighter, flattened sphere on the front.
  const belly = new Mesh(new SphereGeometry(0.024, 20, 14), track(plush(0xfff6ec)));
  belly.name = 'Belly';
  belly.scale.set(1, 1.15, 0.5);
  belly.position.set(0, 0.026, 0.026);
  body.add(belly);

  const feet: Group[] = [];
  for (const side of [-1, 1]) {
    const foot = new Group();
    foot.name = side < 0 ? 'FootLeft' : 'FootRight';
    foot.position.set(side * 0.017, 0.006, 0.006);
    const footMesh = new Mesh(new SphereGeometry(0.011, 16, 10), furShade);
    footMesh.scale.set(0.95, 0.6, 1.7);
    footMesh.position.z = 0.008;
    foot.add(footMesh);
    body.add(foot);
    feet.push(foot);

    const paw = new Mesh(new SphereGeometry(0.0075, 14, 10), fur);
    paw.name = side < 0 ? 'PawLeft' : 'PawRight';
    paw.scale.set(1, 1.2, 1);
    paw.position.set(side * 0.014, 0.03, 0.031);
    body.add(paw);
  }

  const tail = new Group();
  tail.name = 'Tail';
  tail.position.set(0, 0.022, -0.036);
  tail.add(new Mesh(new SphereGeometry(0.012, 16, 12), track(plush(0xffffff))));
  body.add(tail);

  const head = new Group();
  head.name = 'Head';
  head.position.set(0, 0.07, 0.004);
  body.add(head);
  const skull = new Mesh(new SphereGeometry(0.033, 32, 24), fur);
  skull.name = 'Skull';
  skull.scale.set(1.08, 0.94, 1);
  head.add(skull);
  // Muzzle puffs either side of the nose.
  for (const side of [-1, 1]) {
    const puff = new Mesh(new SphereGeometry(0.009, 14, 10), fur);
    puff.position.set(side * 0.0065, -0.009, 0.027);
    head.add(puff);
  }
  const noseMesh = new Mesh(new SphereGeometry(0.0038, 12, 8), nose);
  noseMesh.name = 'Nose';
  noseMesh.scale.set(1.2, 0.85, 1);
  noseMesh.position.set(0, -0.004, 0.0335);
  head.add(noseMesh);

  const eyes = new Group();
  eyes.name = 'Eyes';
  eyes.position.set(0, 0.004, 0);
  head.add(eyes);
  const happyEyes = new Group();
  happyEyes.name = 'HappyEyes';
  happyEyes.visible = false;
  head.add(happyEyes);
  const arc = new TorusGeometry(0.0055, 0.0012, 6, 16, Math.PI);
  for (const side of [-1, 1]) {
    const ball = new Mesh(new SphereGeometry(0.0068, 18, 12), eye);
    ball.scale.set(1, 1.12, 0.6);
    ball.position.set(side * 0.0135, 0, 0.029);
    eyes.add(ball);
    const glint = new Mesh(new SphereGeometry(0.0021, 8, 6), shine);
    glint.position.set(side * 0.0135 + 0.0022, 0.0028, 0.0335);
    eyes.add(glint);

    const closed = new Mesh(arc, eye);
    closed.position.set(side * 0.0135, 0.002, 0.031);
    happyEyes.add(closed);

    const cheek = new Mesh(new CircleGeometry(0.0062, 18), cheeks);
    cheek.position.set(side * 0.021, -0.009, 0.0265);
    cheek.rotation.y = side * 0.55;
    head.add(cheek);
  }

  const ears: Group[] = [];
  for (const side of [-1, 1]) {
    const ear = new Group();
    ear.name = side < 0 ? 'EarLeft' : 'EarRight';
    ear.position.set(side * 0.014, 0.024, -0.004);
    ear.rotation.z = -side * 0.2;
    const outer = new Mesh(earGeometry(), fur);
    outer.scale.set(1, 1, 0.55);
    ear.add(outer);
    const inner = new Mesh(earGeometry(0.78), innerEar);
    inner.scale.set(1, 1, 0.3);
    inner.position.set(0, 0.006, 0.0035);
    ear.add(inner);
    head.add(ear);
    ears.push(ear);
  }

  return {
    kind: 'rabbit',
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
    radius: 0.04,
    height: 0.13,
  };
}
