import {
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  TorusGeometry,
} from '@iwsdk/core';
import { eyeMaterial, lathe, plush, tintTracker, type CreatureRig } from './rig.js';

const FEATHER = 0x86c5ea;
const WING = 0x5b9fd4;
const BELLY = 0xffe6a3;
const BEAK = 0xffa04a;
const CHEEK = 0xff97b2;

/** A chubby round songbird. Origin at the feet, facing +Z. */
export function createBird(): CreatureRig {
  const tints: CreatureRig['tints'] = [];
  const track = tintTracker(tints);
  const feather = track(plush(FEATHER));
  const wingFeather = track(plush(WING));
  const belly = track(plush(BELLY));
  const beak = track(plush(BEAK));
  const eye = track(eyeMaterial());
  const shine = new MeshBasicMaterial({ color: 0xffffff });
  const cheeks = track(
    new MeshBasicMaterial({ color: CHEEK, transparent: true, opacity: 0.45, depthWrite: false }),
  );

  const root = new Group();
  root.name = 'Bird';
  const body = new Group();
  body.name = 'Body';
  root.add(body);

  // Egg-shaped body, widest low down like a fluffed-up bird.
  const torso = new Mesh(
    lathe([
      [0, 0.01], [0.02, 0.012], [0.031, 0.024], [0.034, 0.038],
      [0.031, 0.052], [0.022, 0.062], [0, 0.066],
    ]),
    feather,
  );
  torso.name = 'Torso';
  torso.scale.set(1, 1, 1.12);
  body.add(torso);

  const chest = new Mesh(new SphereGeometry(0.025, 20, 14), belly);
  chest.name = 'Belly';
  chest.scale.set(1, 1.1, 0.55);
  chest.position.set(0, 0.034, 0.022);
  body.add(chest);

  const feet: Group[] = [];
  for (const side of [-1, 1]) {
    const foot = new Group();
    foot.name = side < 0 ? 'FootLeft' : 'FootRight';
    foot.position.set(side * 0.011, 0.004, 0.008);
    for (const toe of [-0.5, 0, 0.5]) {
      const t = new Mesh(new SphereGeometry(0.0028, 8, 6), beak);
      t.scale.set(1, 0.7, 2.4);
      t.position.set(Math.sin(toe) * 0.004, 0, Math.cos(toe) * 0.004);
      t.rotation.y = toe;
      foot.add(t);
    }
    const leg = new Mesh(new SphereGeometry(0.003, 8, 6), beak);
    leg.scale.set(1, 3, 1);
    leg.position.y = 0.007;
    foot.add(leg);
    body.add(foot);
    feet.push(foot);
  }

  // Tail: a small fan of three feathers tipped up behind.
  const tail = new Group();
  tail.name = 'Tail';
  tail.position.set(0, 0.022, -0.034);
  tail.rotation.x = -0.6;
  for (const fan of [-0.35, 0, 0.35]) {
    const f = new Mesh(new SphereGeometry(0.009, 12, 8), wingFeather);
    f.scale.set(0.8, 0.35, 2.2);
    f.position.set(Math.sin(fan) * 0.01, 0, -Math.cos(fan) * 0.012);
    f.rotation.y = fan;
    tail.add(f);
  }
  body.add(tail);

  const wings: Group[] = [];
  for (const side of [-1, 1]) {
    const wing = new Group();
    wing.name = side < 0 ? 'WingLeft' : 'WingRight';
    wing.position.set(side * 0.03, 0.044, -0.002);
    const blade = new Mesh(new SphereGeometry(0.022, 18, 12), wingFeather);
    blade.scale.set(0.32, 0.95, 0.85);
    blade.position.set(side * 0.004, -0.012, -0.006);
    blade.rotation.x = 0.35;
    wing.add(blade);
    body.add(wing);
    wings.push(wing);
  }

  const head = new Group();
  head.name = 'Head';
  head.position.set(0, 0.07, 0.004);
  body.add(head);
  const skull = new Mesh(new SphereGeometry(0.026, 28, 20), feather);
  skull.name = 'Skull';
  head.add(skull);

  const crest = new Group();
  crest.name = 'Crest';
  crest.position.set(0, 0.022, -0.004);
  for (const lean of [-0.35, 0, 0.35]) {
    const plume = new Mesh(new SphereGeometry(0.005, 10, 8), wingFeather);
    plume.scale.set(0.8, 2.2, 0.8);
    plume.position.set(lean * 0.012, 0.006, 0);
    plume.rotation.z = -lean;
    crest.add(plume);
  }
  head.add(crest);

  const beakMesh = new Mesh(
    lathe([[0, 0], [0.0062, 0.0], [0.0045, 0.006], [0, 0.013]], 16),
    beak,
  );
  beakMesh.name = 'Beak';
  beakMesh.rotation.x = Math.PI / 2;
  beakMesh.position.set(0, -0.004, 0.023);
  head.add(beakMesh);

  const eyes = new Group();
  eyes.name = 'Eyes';
  eyes.position.set(0, 0.004, 0);
  head.add(eyes);
  const happyEyes = new Group();
  happyEyes.name = 'HappyEyes';
  happyEyes.visible = false;
  head.add(happyEyes);
  const arc = new TorusGeometry(0.0048, 0.0011, 6, 16, Math.PI);
  for (const side of [-1, 1]) {
    const ball = new Mesh(new SphereGeometry(0.0058, 16, 12), eye);
    ball.scale.set(1, 1.12, 0.6);
    ball.position.set(side * 0.0125, 0, 0.022);
    eyes.add(ball);
    const glint = new Mesh(new SphereGeometry(0.0018, 8, 6), shine);
    glint.position.set(side * 0.0125 + 0.002, 0.0024, 0.0262);
    eyes.add(glint);

    const closed = new Mesh(arc, eye);
    closed.position.set(side * 0.0125, 0.002, 0.024);
    happyEyes.add(closed);

    const cheek = new Mesh(new CircleGeometry(0.0055, 18), cheeks);
    cheek.position.set(side * 0.018, -0.008, 0.0185);
    cheek.rotation.y = side * 0.6;
    head.add(cheek);
  }

  return {
    kind: 'bird',
    locomotion: 'flyer',
    root,
    body,
    head,
    ears: [],
    wings,
    eyes,
    happyEyes,
    cheeks,
    tail,
    feet,
    tints,
    radius: 0.036,
    height: 0.1,
  };
}
