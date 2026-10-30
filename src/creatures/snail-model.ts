import { CylinderGeometry, Group, Mesh, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { buildFace, glossy, plush, softShade, tintTracker, type CreatureRig } from './rig.js';

const SKIN = 0xffd9a8;
const BELLY = 0xffe9c9;
const SHELL = 0xc79be0;
const SHELL_STRIPE = 0x9a6fc0;
const STALK_TIP = 0xffc28a;

/** A round little snail with a glossy swirl shell. Origin at the base, facing +Z. */
export function createSnail(): CreatureRig {
  const tints: CreatureRig['tints'] = [];
  const track = tintTracker(tints);
  const skin = track(plush(SKIN));
  const belly = track(plush(BELLY));
  const shellMaterial = track(glossy(SHELL, 0.25));
  const stripe = track(glossy(SHELL_STRIPE, 0.3));
  const tip = track(plush(STALK_TIP));

  const root = new Group();
  root.name = 'Snail';
  const body = new Group();
  body.name = 'Body';
  root.add(body);

  // The foot: a long soft slug shape hugging the ground.
  const foot = new Mesh(new SphereGeometry(0.03, 28, 16), skin);
  foot.name = 'Foot';
  foot.scale.set(0.78, 0.38, 1.65);
  foot.position.set(0, 0.011, 0.004);
  body.add(foot);
  const sole = new Mesh(new SphereGeometry(0.028, 24, 12), belly);
  sole.scale.set(0.72, 0.2, 1.6);
  sole.position.set(0, 0.006, 0.004);
  body.add(sole);

  // Shell: a glossy dome with a spiral of rings on each side.
  const shell = new Group();
  shell.name = 'Shell';
  shell.position.set(0, 0.034, -0.014);
  shell.rotation.x = -0.15;
  const dome = new Mesh(new SphereGeometry(0.03, 32, 22), shellMaterial);
  dome.scale.set(0.82, 1, 1);
  shell.add(dome);
  for (const side of [-1, 1]) {
    [0.022, 0.015, 0.008].forEach((r, i) => {
      const ring = new Mesh(new TorusGeometry(r, 0.0025, 8, 32), stripe);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(side * (0.0225 + i * 0.0018), 0.002 * i, -0.002 * i);
      shell.add(ring);
    });
  }
  body.add(shell);

  const tail = new Group();
  tail.name = 'Tail';
  tail.position.set(0, 0.008, -0.045);
  const tailTip = new Mesh(new SphereGeometry(0.009, 14, 10), skin);
  tailTip.scale.set(0.8, 0.6, 1.4);
  tail.add(tailTip);
  body.add(tail);

  const head = new Group();
  head.name = 'Head';
  head.position.set(0, 0.024, 0.04);
  body.add(head);
  const skull = new Mesh(new SphereGeometry(0.019, 26, 18), skin);
  skull.name = 'Skull';
  skull.scale.set(1.05, 1, 0.95);
  head.add(skull);

  // Eye stalks act as "ears": they wobble, droop when petted, flatten asleep.
  const ears: Group[] = [];
  const stalkGeometry = new CylinderGeometry(0.0022, 0.003, 0.022, 10);
  stalkGeometry.translate(0, 0.011, 0);
  for (const side of [-1, 1]) {
    const stalk = new Group();
    stalk.name = side < 0 ? 'StalkLeft' : 'StalkRight';
    stalk.position.set(side * 0.007, 0.014, -0.002);
    stalk.rotation.z = -side * 0.3;
    stalk.add(new Mesh(stalkGeometry, skin));
    const ball = new Mesh(new SphereGeometry(0.0042, 12, 10), tip);
    ball.position.y = 0.023;
    stalk.add(ball);
    head.add(stalk);
    ears.push(stalk);
  }

  const { eyes, happyEyes, cheeks } = buildFace(head, track, {
    spacing: 0.0085,
    y: 0.002,
    z: 0.0165,
    size: 0.0058,
    iris: 0x5b3a8a,
    cheek: { x: 0.013, y: -0.006, z: 0.014, turn: 0.6, size: 0.0045 },
  });
  softShade(root);

  return {
    kind: 'snail',
    locomotion: 'crawler',
    root,
    body,
    head,
    ears,
    wings: [],
    eyes,
    happyEyes,
    cheeks,
    tail,
    feet: [],
    tints,
    radius: 0.035,
    height: 0.075,
    extras: { shell },
  };
}
