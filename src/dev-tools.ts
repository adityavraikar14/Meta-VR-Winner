/**
 * Dev-server-only keyboard shortcuts for testing hand shapes in the IWER
 * emulator without a headset. Results are printed to the browser console.
 *
 *   P / O  cycle right / left emulated hand pose
 *   1-9, 0 set right hand pose: default peace fist point ok call rock three open flat
 *          (hold Shift for the left hand)
 *   X      toggle the left emulated hand on or off
 *   C      capture the current shadow as a level target (hex)
 *   N      next level
 *   R      reset story progress to the first level
 *   I      print game state and score
 *   K      print game state now, without waiting for new shadows
 *   A      call every creature in turn (only the last one stays)
 *   H / J  call the horse / the stag
 */

import { stage } from './stage-state.js';

/** Extra debug readouts other systems add to the `I` info dump. */
export const devInfo: Record<string, () => unknown> = {};
/** Extra keys a scene can claim while it is on stage (dev builds only). */
export const devActions: Record<string, () => void> = {};

export interface DevApi {
  capture(): string;
  maskVersion(): number;
  next(): void;
  reset(): void;
  spawnAll(): void;
  spawn(kind: string): void;
  /** Bring a friend to life as if its shadow had just matched, at this body size (null: the level's own friend). */
  summon(kind: string | null, size: number): void;
  /** Jump to the first level of the next chapter. */
  nextChapter(): void;
  info(): unknown;
}

const POSES = [
  'default', 'peace', 'fist', 'point', 'ok', 'call', 'rock', 'three', 'four',
  'flat', 'open', 'claw', 'cup', 'hook', 'tripod', 'grip', 'pinch',
];

interface EmulatedHand {
  poseId: string;
  connected: boolean;
  /** Present on the injected emulator build, which does not rebuild joints on its own. */
  updateHandPose?: () => void;
}

function setPose(hand: EmulatedHand, poseId: string): void {
  // The injected emulator shows a newly set pose one update late; apply twice.
  for (let i = 0; i < 2; i++) {
    hand.poseId = poseId;
    hand.updateHandPose?.();
  }
}

/**
 * The emulator injected by the dev server ships only a few hand poses. Copy
 * in the full pose library from the newer iwer package so shapes like peace
 * or fist can be tested. Poses live in the hand's private state object.
 */
async function addLibraryPoses(hand: EmulatedHand): Promise<string[]> {
  const record = hand as unknown as Record<symbol, { poses?: object }>;
  const key = Object.getOwnPropertySymbols(hand).find((s) => record[s]?.poses);
  if (!key) return [];
  const { libraryHandPoses } = await import('iwer/lib/device/configs/hand/library.js');
  Object.assign(record[key].poses!, libraryHandPoses);
  return Object.keys(record[key].poses!);
}

/** IWER keeps its device on navigator.xr under a private symbol. */
function emulatedHands(): { left: EmulatedHand; right: EmulatedHand } | null {
  const xr = navigator.xr as unknown as Record<symbol, { device?: { hands: never } }>;
  if (!xr) return null;
  const key = Object.getOwnPropertySymbols(xr).find(
    (s) => s.description === '@iwer/xr-system',
  );
  return key ? (xr[key].device?.hands ?? null) : null;
}

const DIGIT_POSES = [
  'flat', 'default', 'peace', 'fist', 'point', 'ok', 'call', 'rock', 'three', 'open',
];

function cyclePose(hand: EmulatedHand): void {
  setPose(hand, POSES[(POSES.indexOf(hand.poseId) + 1) % POSES.length]);
}

function waitForMasks(api: DevApi, count: number): Promise<void> {
  const target = api.maskVersion() + count;
  const deadline = performance.now() + 15000;
  return new Promise((resolve) => {
    const poll = () => {
      if (api.maskVersion() >= target || performance.now() > deadline) resolve();
      else setTimeout(poll, 50);
    };
    poll();
  });
}

export function installDevTools(api: DevApi): void {
  if (!import.meta.env.DEV) return;
  let posesAdded = false;
  window.addEventListener('keydown', async (event) => {
    // In the Arena, Yash's test panel owns the keyboard (its R recenters; ours would reset the story).
    if (stage.arena) return;
    const hands = emulatedHands();
    if (hands && !posesAdded) {
      posesAdded = true;
      await addLibraryPoses(hands.left);
      const ids = await addLibraryPoses(hands.right);
      console.log(`SHADOWPLAY poses available=${ids.join(',')}`);
    }
    const digit = /^Digit(\d)$/.exec(event.code);
    if (hands && digit) {
      const hand = event.shiftKey ? hands.left : hands.right;
      setPose(hand, DIGIT_POSES[Number(digit[1])]);
      console.log(`SHADOWPLAY pose ${event.shiftKey ? 'left' : 'right'}=${hand.poseId}`);
      return;
    }
    // Shift+L and Shift+V belong to the Level Tester (panel, view).
    if (event.shiftKey && /^[lv]$/i.test(event.key)) return;
    const action = devActions[event.key.toLowerCase()];
    if (action) {
      action();
      return;
    }
    switch (event.key.toLowerCase()) {
      case 'p':
        if (hands) {
          cyclePose(hands.right);
          console.log(`SHADOWPLAY pose right=${hands.right.poseId}`);
        }
        break;
      case 'o':
        if (hands) {
          cyclePose(hands.left);
          console.log(`SHADOWPLAY pose left=${hands.left.poseId}`);
        }
        break;
      case 'x':
        if (hands) {
          hands.left.connected = !hands.left.connected;
          console.log(`SHADOWPLAY left connected=${hands.left.connected}`);
        }
        break;
      case 'c': {
        // A background emulator window renders slowly; wait for fresh masks
        // so the capture reflects the current pose.
        const pose = hands?.right.poseId ?? '?';
        await waitForMasks(api, 3);
        console.log(`SHADOWPLAY capture ${pose} ${api.capture() || '(no shadow)'}`);
        break;
      }
      case 'n':
        api.next();
        break;
      case 'r':
        api.reset();
        break;
      case 'a':
        api.spawnAll();
        break;
      case 'h':
        api.spawn('horse');
        break;
      case 'j':
        api.spawn('stag');
        break;
      case 'b':
        api.summon(null, 1.35);
        break;
      case 'v':
        api.summon(null, 0.8);
        break;
      case 'g':
        api.nextChapter();
        break;
      case 'i':
      case 'k': {
        const pose = hands?.right.poseId ?? '?';
        // K reports straight away; I first waits for the shadow to catch up.
        if (event.key.toLowerCase() === 'i') await waitForMasks(api, 3);
        const extra = Object.fromEntries(Object.entries(devInfo).map(([k, f]) => [k, f()]));
        console.log(`SHADOWPLAY info ${pose} ${JSON.stringify({ ...(api.info() as object), ...extra })}`);
        break;
      }
    }
  });
}
