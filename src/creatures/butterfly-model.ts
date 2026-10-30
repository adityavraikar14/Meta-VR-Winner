import { CylinderGeometry, DoubleSide, Group, Mesh, MeshPhysicalMaterial, SphereGeometry } from '@iwsdk/core';
import { buildFace, plush, softShade, tintTracker, type CreatureRig } from './rig.js';

const BODY = 0x5b3f7a;
const UPPER_WING = 0xff9fc6;
const LOWER_WING = 0xffc27a;
const SPOT = 0x7fd3ff;
const ANTENNA_TIP = 0xffd85c;

/** Wing membranes: softly translucent with a satin sheen, visible from both sides. */
function wingMaterial(color: number): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color,
    roughness: 0.55,
    sheen: 0.8,
    sheenColor: 0xffffff,
    side: DoubleSide,
    transparent: true,
    opacity: 0.93,
  });
  material.userData.softShade = true;
  return material;
}

/** A plump little butterfly. Origin under the body, facing +Z. */
export function createButterfly(): CreatureRig {
  const tints: CreatureRig['tints'] = [];
  const track = tintTracker(tints);
  const fuzz = track(plush(BODY));
  const upper = track(wingMaterial(UPPER_WING));
  const lower = track(wingMaterial(LOWER_WING));
  const spot = track(wingMaterial(SPOT));
  const tipMaterial = track(plush(ANTENNA_TIP));

  const root = new Group();
  root.name = 'Butterfly';
  const body = new Group();
  body.name = 'Body';
  root.add(body);

  const thorax = new Mesh(new SphereGeometry(0.011, 18, 14), fuzz);
  thorax.scale.set(1, 1, 1.3);
  thorax.position.set(0, 0.022, 0);
  body.add(thorax);

  // Abdomen trails behind; it doubles as the "tail" that wiggles when happy.
  const tail = new Group();
  tail.name = 'Tail';
  tail.position.set(0, 0.02, -0.01);
  const abdomen = new Mesh(new SphereGeometry(0.009, 16, 12), fuzz);
  abdomen.scale.set(0.9, 0.9, 2.2);
  abdomen.position.z = -0.014;
  tail.add(abdomen);
  body.add(tail);

  // Wings: an upper and lower lobe on each side, hinged at the body.
  const wings: Group[] = [];
  for (const side of [-1, 1]) {
    const wing = new Group();
    wing.name = side < 0 ? 'WingLeft' : 'WingRight';
    wing.position.set(side * 0.006, 0.028, 0);
    const top = new Mesh(new SphereGeometry(0.028, 24, 16), upper);
    top.scale.set(1, 0.08, 0.85);
    top.position.set(side * 0.026, 0.004, 0.01);
    top.rotation.y = side * 0.35;
    wing.add(top);
    const bottom = new Mesh(new SphereGeometry(0.02, 20, 14), lower);
    bottom.scale.set(1, 0.08, 0.9);
    bottom.position.set(side * 0.019, -0.001, -0.016);
    bottom.rotation.y = -side * 0.5;
    wing.add(bottom);
    for (const [x, z, r] of [[0.034, 0.016, 0.006], [0.022, 0.004, 0.004], [0.022, -0.02, 0.005]]) {
      const dot = new Mesh(new SphereGeometry(r, 12, 8), spot);
      dot.scale.set(1, 0.12, 1);
      dot.position.set(side * x, 0.0045, z);
      wing.add(dot);
    }
    body.add(wing);
    wings.push(wing);
  }

  const head = new Group();
  head.name = 'Head';
  head.position.set(0, 0.03, 0.014);
  body.add(head);
  const skull = new Mesh(new SphereGeometry(0.012, 22, 16), fuzz);
  head.add(skull);

  // Curly antennae with glowing tips act as "ears".
  const ears: Group[] = [];
  const stem = new CylinderGeometry(0.0009, 0.0011, 0.02, 6);
  stem.translate(0, 0.01, 0);
  for (const side of [-1, 1]) {
    const antenna = new Group();
    antenna.name = side < 0 ? 'AntennaLeft' : 'AntennaRight';
    antenna.position.set(side * 0.004, 0.009, 0.004);
    antenna.rotation.set(0.45, 0, -side * 0.35);
    antenna.add(new Mesh(stem, fuzz));
    const ball = new Mesh(new SphereGeometry(0.0028, 10, 8), tipMaterial);
    ball.position.y = 0.021;
    antenna.add(ball);
    head.add(antenna);
    ears.push(antenna);
  }

  const { eyes, happyEyes, cheeks } = buildFace(head, track, {
    spacing: 0.0055,
    y: 0.001,
    z: 0.0095,
    size: 0.0042,
    iris: 0x3a2a6b,
    cheek: { x: 0.0085, y: -0.004, z: 0.008, turn: 0.7, size: 0.0028 },
  });
  softShade(root);

  return {
    kind: 'butterfly',
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
    feet: [],
    tints,
    radius: 0.03,
    height: 0.05,
  };
}
