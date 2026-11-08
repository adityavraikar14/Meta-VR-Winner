import { ConeGeometry, Group, Mesh, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { buildFace, glossy, lathe, plush, softShade, tintTracker, type CreatureRig } from './rig.js';

const SCALES = 0x6fcf9a;
const BELLY = 0xfff0c2;
const WING = 0x4fa7a0;
const HORN = 0xfff4dc;
const SPIKE = 0xffb35c;
const NOSTRIL = 0x2f5e48;

/** A chubby baby dragon. Origin at the base, facing +Z. */
export function createDragon(): CreatureRig {
  const tints: CreatureRig['tints'] = [];
  const track = tintTracker(tints);
  const scales = track(plush(SCALES));
  const belly = track(plush(BELLY));
  const membrane = track(plush(WING));
  const horn = track(glossy(HORN, 0.3));
  const spike = track(glossy(SPIKE, 0.35));
  const nostril = track(glossy(NOSTRIL, 0.3));

  const root = new Group();
  root.name = 'Dragon';
  const body = new Group();
  body.name = 'Body';
  root.add(body);

  const torso = new Mesh(
    lathe([[0, 0], [0.03, 0.003], [0.044, 0.018], [0.045, 0.036], [0.038, 0.058], [0.025, 0.074], [0, 0.079]]),
    scales,
  );
  torso.scale.set(1, 1, 1.08);
  body.add(torso);
  // Striped cream belly plates.
  const plate = new Mesh(new SphereGeometry(0.03, 22, 16), belly);
  plate.scale.set(0.95, 1.2, 0.5);
  plate.position.set(0, 0.036, 0.03);
  body.add(plate);
  for (const y of [0.022, 0.036, 0.05]) {
    const stripe = new Mesh(new TorusGeometry(0.02 - Math.abs(y - 0.036) * 0.25, 0.0012, 6, 24, Math.PI), track(plush(0xf0d89a)));
    stripe.rotation.set(0, 0, Math.PI);
    stripe.position.set(0, y, 0.043);
    stripe.scale.set(1, 0.35, 1);
    body.add(stripe);
  }

  const feet: Group[] = [];
  for (const side of [-1, 1]) {
    const foot = new Group();
    foot.name = side < 0 ? 'FootLeft' : 'FootRight';
    foot.position.set(side * 0.024, 0.008, 0.014);
    const paw = new Mesh(new SphereGeometry(0.013, 16, 10), scales);
    paw.scale.set(1, 0.65, 1.5);
    paw.position.z = 0.008;
    foot.add(paw);
    for (const t of [-1, 0, 1]) {
      const claw = new Mesh(new ConeGeometry(0.0022, 0.006, 8), horn);
      claw.rotation.x = Math.PI / 2;
      claw.position.set(t * 0.0045, -0.003, 0.028);
      foot.add(claw);
    }
    body.add(foot);
    feet.push(foot);

    const arm = new Mesh(new SphereGeometry(0.009, 14, 10), scales);
    arm.scale.set(1, 1.5, 1);
    arm.position.set(side * 0.028, 0.04, 0.03);
    body.add(arm);
  }

  // Long tail curling behind, ending in a spade.
  const tail = new Group();
  tail.name = 'Tail';
  tail.position.set(0, 0.014, -0.04);
  let segment = tail as Group;
  for (let i = 0; i < 4; i++) {
    const link = new Group();
    link.position.set(0, i === 0 ? 0 : 0.004, i === 0 ? 0 : -0.016);
    link.rotation.set(-0.25, 0.3, 0);
    const piece = new Mesh(new SphereGeometry(0.011 - i * 0.0018, 14, 10), scales);
    piece.scale.set(1, 1, 1.6);
    link.add(piece);
    segment.add(link);
    segment = link;
  }
  const spade = new Mesh(new ConeGeometry(0.008, 0.014, 4), spike);
  spade.rotation.x = -Math.PI / 2;
  spade.scale.set(1, 1, 0.4);
  spade.position.z = -0.016;
  segment.add(spade);
  body.add(tail);

  // Back spikes down the spine.
  for (let i = 0; i < 4; i++) {
    const s = new Mesh(new ConeGeometry(0.0045 - i * 0.0006, 0.011, 8), spike);
    s.position.set(0, 0.07 - i * 0.016, -0.026 - i * 0.006);
    s.rotation.x = -0.6 - i * 0.2;
    body.add(s);
  }

  // Bat wings on the back.
  const wings: Group[] = [];
  for (const side of [-1, 1]) {
    const wing = new Group();
    wing.name = side < 0 ? 'WingLeft' : 'WingRight';
    wing.position.set(side * 0.022, 0.06, -0.022);
    wing.rotation.y = side * 0.5;
    for (const [x, y, s] of [[0.022, 0.012, 1], [0.03, -0.004, 0.75], [0.016, -0.006, 0.7]]) {
      const lobe = new Mesh(new SphereGeometry(0.016 * s, 16, 10), membrane);
      lobe.scale.set(1.3, 1, 0.18);
      lobe.position.set(side * x, y, 0);
      wing.add(lobe);
    }
    const bone = new Mesh(new SphereGeometry(0.003, 8, 6), spike);
    bone.scale.set(9, 1, 1);
    bone.position.set(side * 0.025, 0.02, 0.001);
    bone.rotation.z = side * 0.35;
    wing.add(bone);
    body.add(wing);
    wings.push(wing);
  }

  const head = new Group();
  head.name = 'Head';
  head.position.set(0, 0.095, 0.006);
  body.add(head);
  const skull = new Mesh(new SphereGeometry(0.033, 30, 22), scales);
  skull.scale.set(1.1, 0.95, 1);
  head.add(skull);
  const snout = new Mesh(new SphereGeometry(0.018, 20, 14), scales);
  snout.scale.set(1.15, 0.78, 1);
  snout.position.set(0, -0.01, 0.026);
  head.add(snout);
  for (const side of [-1, 1]) {
    const n = new Mesh(new SphereGeometry(0.0022, 8, 6), nostril);
    n.position.set(side * 0.0055, -0.004, 0.0425);
    head.add(n);
  }
  // Mouth anchor, where sparkly sneezes come out.
  const mouth = new Group();
  mouth.name = 'Mouth';
  mouth.position.set(0, -0.012, 0.045);
  head.add(mouth);

  // Fin-like ears that perk and flatten.
  const ears: Group[] = [];
  for (const side of [-1, 1]) {
    const ear = new Group();
    ear.name = side < 0 ? 'EarLeft' : 'EarRight';
    ear.position.set(side * 0.03, 0.01, -0.006);
    ear.rotation.z = -side * 1.1;
    const fin = new Mesh(new ConeGeometry(0.008, 0.02, 3), membrane);
    fin.position.y = 0.01;
    fin.scale.set(1, 1, 0.35);
    ear.add(fin);
    head.add(ear);
    ears.push(ear);

    const h = new Mesh(new ConeGeometry(0.0045, 0.018, 10), horn);
    h.position.set(side * 0.013, 0.033, -0.006);
    h.rotation.set(-0.35, 0, -side * 0.25);
    head.add(h);
  }

  const { eyes, happyEyes, cheeks } = buildFace(head, track, {
    spacing: 0.0145,
    y: 0.007,
    z: 0.027,
    size: 0.0082,
    iris: 0xd08a1a,
    cheekColor: 0xff9aa8,
    cheek: { x: 0.023, y: -0.007, z: 0.024, turn: 0.6, size: 0.0065 },
  });
  softShade(root);

  return {
    kind: 'dragon',
    locomotion: 'flyer',
    root,
    body,
    head,
    ears,
    wings,
    eyes,
    happyEyes,
    cheeks,
    tail,
    feet,
    tints,
    radius: 0.05,
    height: 0.16,
    extras: { mouth },
  };
}
