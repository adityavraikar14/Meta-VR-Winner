import { Group, Mesh, MeshStandardMaterial, SphereGeometry, CylinderGeometry, Vector3 } from '@iwsdk/core';
import { playMunch, playPop } from '../audio.js';
import type { HandState } from './hand-input.js';

/**
 * Looking after a pet in Shadow Pets, beyond stroking and tossing it:
 *
 *   Feed it: a bowl of berries sits on the stage. Pinch a berry and hold it
 *   to your pet's mouth: it eats from your fingers. Let a berry go anywhere
 *   else and it rolls back into the bowl.
 *
 *   Put it to bed: hold your hand flat over its back, palm down, like a
 *   blanket, for a moment: it curls up and sleeps.
 */

/** What a pet offers to being looked after. */
export interface Caring {
  readonly emerged: boolean;
  /** Its mouth (world), where a berry is eaten. */
  mouth(out: Vector3): Vector3;
  /** The top of its back (world), where a palm tucks it in. */
  back(out: Vector3): Vector3;
  /** How wide it is, so a palm over a horse counts from further out than over a bunny. */
  readonly reach: number;
  feed(): void;
  tuckIn(): void;
  /** Turns to look at a berry held out to it. */
  notice?(at: Vector3): void;
  /** Takes the bite: head down, chewing. */
  chew?(): void;
  readonly asleep: boolean;
}

const BERRIES = 5;
/** A pinch this close to a berry takes it; held this close to a mouth, it is eaten. */
const TAKE = 0.035;
const EAT = 0.045;
/** Held within this of its mouth, it looks and stretches for the berry. */
const NOTICE = 0.2;
/** The berry slides from your fingers into its mouth, then it chews. */
const BITE_TIME = 0.22;
const CHEW_TIME = 1.0;
/** Seconds a palm must rest over a pet's back to tuck it in. */
const TUCK_TIME = 1.4;

interface Berry {
  mesh: Mesh;
  home: Vector3;
  hand: number;
  /** Seconds until an eaten berry grows back in the bowl. */
  regrow: number;
  /** Being eaten by this pet, and for how long so far. */
  eater: Caring | null;
  eaten: number;
  /** Where it left the fingers (local), as it slides into the mouth. */
  from: Vector3;
}

export class PetCare {
  readonly group = new Group();
  private readonly berries: Berry[] = [];
  private readonly tuck = new Map<Caring, number>();
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly mouth = new Vector3();

  constructor() {
    this.group.name = 'PetBowl';
    // A little wooden bowl.
    const wood = new MeshStandardMaterial({ color: 0x9a6a3c, roughness: 0.8 });
    const bowl = new Mesh(new CylinderGeometry(0.045, 0.032, 0.022, 20, 1, true), wood);
    bowl.position.y = 0.011;
    const floor = new Mesh(new CylinderGeometry(0.032, 0.032, 0.004, 20), wood);
    floor.position.y = 0.002;
    this.group.add(bowl, floor);
    const red = new MeshStandardMaterial({ color: 0xe0283c, roughness: 0.35, emissive: 0x500810, emissiveIntensity: 0.3 });
    const shape = new SphereGeometry(0.0095, 14, 10);
    for (let i = 0; i < BERRIES; i++) {
      const a = (i / BERRIES) * Math.PI * 2;
      const home = new Vector3(Math.cos(a) * 0.018, 0.017 + (i % 2) * 0.006, Math.sin(a) * 0.018);
      if (i === BERRIES - 1) home.set(0, 0.028, 0);
      const mesh = new Mesh(shape, red);
      mesh.position.copy(home);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.berries.push({ mesh, home, hand: -1, regrow: 0, eater: null, eaten: 0, from: new Vector3() });
    }
  }

  update(dt: number, hands: readonly HandState[], pets: readonly Caring[]): void {
    if (!this.group.visible) return;
    for (const berry of this.berries) {
      if (berry.eater) {
        this.eat(berry, dt);
        continue;
      }
      if (berry.regrow > 0) {
        berry.regrow -= dt;
        if (berry.regrow <= 0) {
          berry.mesh.visible = true;
          berry.mesh.position.copy(berry.home);
          berry.mesh.scale.setScalar(1);
        }
        continue;
      }
      if (berry.hand < 0) {
        // In the bowl: a pinch takes it.
        hands.forEach((hand, h) => {
          if (berry.hand >= 0 || !hand.tracked || !hand.pinchStarted) return;
          if (this.berries.some((b) => b.hand === h)) return;
          berry.mesh.getWorldPosition(this.v);
          if (this.v.distanceTo(hand.pinch) < TAKE) {
            berry.hand = h;
            playPop(0.03);
          }
        });
        continue;
      }
      const hand = hands[berry.hand];
      if (!hand || !hand.tracked || !hand.pinching) {
        // Let go away from a mouth: it rolls back into the bowl.
        berry.hand = -1;
        berry.mesh.position.copy(berry.home);
        continue;
      }
      // Carried between the fingers.
      berry.mesh.position.copy(this.group.worldToLocal(this.v.copy(hand.hold)));
      for (const pet of pets) {
        if (!pet.emerged || pet.asleep) continue;
        const d = pet.mouth(this.mouth).distanceTo(hand.hold);
        if (d < NOTICE) pet.notice?.(hand.hold);
        if (d > EAT + pet.reach * 0.15) continue;
        // It takes the berry from your fingers with its mouth.
        berry.hand = -1;
        berry.eater = pet;
        berry.eaten = 0;
        berry.from.copy(berry.mesh.position);
        pet.chew?.();
        playPop(0.02);
        break;
      }
    }
    // A palm held flat over a pet's back, facing down, tucks it in.
    this.tuckIns(dt, hands, pets);
  }

  /** In its mouth: the berry slides in, is chewed smaller and smaller, and is gone; then the pet is happy. */
  private eat(berry: Berry, dt: number): void {
    const pet = berry.eater!;
    berry.eaten += dt;
    const mouth = this.group.worldToLocal(pet.mouth(this.mouth));
    if (berry.eaten < BITE_TIME) {
      const k = berry.eaten / BITE_TIME;
      berry.mesh.position.lerpVectors(berry.from, mouth, k * k * (3 - 2 * k));
      return;
    }
    const chew = (berry.eaten - BITE_TIME) / CHEW_TIME;
    berry.mesh.position.copy(mouth);
    berry.mesh.scale.setScalar(Math.max(0.05, 0.85 * (1 - chew)));
    // A crunch on each bite.
    const bites = Math.floor(chew * 3);
    if (bites !== Math.floor((chew - dt / CHEW_TIME) * 3) && bites < 3) playMunch(0.045);
    if (chew < 1) return;
    berry.eater = null;
    berry.mesh.visible = false;
    berry.regrow = 4;
    pet.feed();
  }

  private tuckIns(dt: number, hands: readonly HandState[], pets: readonly Caring[]): void {
    for (const pet of pets) {
      if (!pet.emerged || pet.asleep) {
        this.tuck.delete(pet);
        continue;
      }
      pet.back(this.w);
      let covered = false;
      for (const hand of hands) {
        if (!hand.tracked || hand.palmNormal.y > -0.45) continue;
        const above = hand.palm.y - this.w.y;
        const across = Math.hypot(hand.palm.x - this.w.x, hand.palm.z - this.w.z);
        if (above > -0.01 && above < 0.12 && across < Math.max(0.06, pet.reach)) covered = true;
      }
      const t = covered ? (this.tuck.get(pet) ?? 0) + dt : 0;
      this.tuck.set(pet, t);
      if (t >= TUCK_TIME) {
        this.tuck.delete(pet);
        pet.tuckIn();
      }
    }
  }
}
