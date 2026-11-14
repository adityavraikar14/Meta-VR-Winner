import { audioContext, playAnimalCall, playHorseCall, playNicker, playSnort } from './audio.js';

/**
 * Each pet's voice for each feeling, so it sounds like it feels: a happy
 * fox yips, a hurt one yelps, a scared one whimpers, a cross one growls; a
 * horse nickers, squeals, snorts; a bird chirps, screeches, scolds. Real
 * recordings where the game has them (fox, horse, stag), shaped synthesis
 * for the rest, and every call a little different in pitch.
 */

export type Feeling = 'happy' | 'excited' | 'hurt' | 'scared' | 'annoyed' | 'sad' | 'content';

interface Tone {
  type?: OscillatorType;
  /** Pitch at the start, peak (a quarter of the way in) and end, Hz. */
  pitch: [number, number, number];
  seconds: number;
  volume: number;
  /** A resonance that gives the call its body: [type, frequency, Q]. */
  filter?: [BiquadFilterType, number, number];
  /** Pitch wobble [rate Hz, depth as a fraction]. */
  vibrato?: [number, number];
  /** Loudness pulses [rate Hz, depth 0–1]: a purr, a nicker, a chatter. */
  pulse?: [number, number];
  delay?: number;
}

function voiced(ctx: AudioContext, tone: Tone): void {
  const start = ctx.currentTime + 0.01 + (tone.delay ?? 0);
  const end = start + tone.seconds;
  const k = 0.93 + Math.random() * 0.14;
  const osc = ctx.createOscillator();
  osc.type = tone.type ?? 'sawtooth';
  osc.frequency.setValueAtTime(tone.pitch[0] * k, start);
  osc.frequency.linearRampToValueAtTime(tone.pitch[1] * k, start + tone.seconds * 0.25);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, tone.pitch[2] * k), end);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(tone.volume, start + Math.min(0.03, tone.seconds * 0.2));
  gain.gain.setValueAtTime(tone.volume, start + tone.seconds * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  let node: AudioNode = osc;
  if (tone.filter) {
    const f = ctx.createBiquadFilter();
    f.type = tone.filter[0];
    f.frequency.value = tone.filter[1];
    f.Q.value = tone.filter[2];
    node = node.connect(f);
  }
  if (tone.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = tone.vibrato[0];
    const depth = ctx.createGain();
    depth.gain.value = tone.pitch[1] * k * tone.vibrato[1];
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(start);
    lfo.stop(end + 0.05);
  }
  if (tone.pulse) {
    const am = ctx.createGain();
    am.gain.value = 1 - tone.pulse[1] / 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = tone.pulse[0];
    const depth = ctx.createGain();
    depth.gain.value = tone.pulse[1] / 2;
    lfo.connect(depth).connect(am.gain);
    lfo.start(start);
    lfo.stop(end + 0.05);
    node = node.connect(am);
  }
  node.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(end + 0.05);
}

let noise: AudioBuffer | null = null;
function hiss(ctx: AudioContext, seconds: number, type: BiquadFilterType, frequency: number, q: number, volume: number, delay = 0): void {
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const start = ctx.currentTime + 0.01 + delay;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(volume, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(start, Math.random() * 0.5);
  src.stop(start + seconds + 0.05);
}

// The calls, as small recipes.
const yelp = (ctx: AudioContext, f: number, v = 0.06) => {
  voiced(ctx, { pitch: [f * 1.2, f * 1.5, f * 0.7], seconds: 0.16, volume: v, filter: ['bandpass', f * 1.6, 2.5] });
  voiced(ctx, { pitch: [f * 1.1, f * 1.3, f * 0.6], seconds: 0.2, volume: v * 0.7, filter: ['bandpass', f * 1.5, 2.5], delay: 0.2 });
};
const whimper = (ctx: AudioContext, f: number, v = 0.04) =>
  voiced(ctx, { type: 'triangle', pitch: [f, f * 1.25, f * 0.8], seconds: 0.7, volume: v, vibrato: [7, 0.05], filter: ['bandpass', f * 2, 3] });
const growl = (ctx: AudioContext, f: number, v = 0.07) => {
  voiced(ctx, { pitch: [f, f * 1.1, f * 0.9], seconds: 0.8, volume: v, filter: ['lowpass', f * 6, 1], pulse: [26, 0.8] });
  hiss(ctx, 0.7, 'bandpass', f * 8, 1.2, v * 0.3);
};
const purr = (ctx: AudioContext, f: number, v = 0.06) =>
  voiced(ctx, { pitch: [f, f, f * 0.95], seconds: 1.0, volume: v, filter: ['lowpass', 400, 0.8], pulse: [22, 0.9] });
const squeal = (ctx: AudioContext, f: number, v = 0.05) =>
  voiced(ctx, { pitch: [f, f * 1.3, f * 0.85], seconds: 0.35, volume: v, filter: ['bandpass', f * 1.4, 2], vibrato: [18, 0.04] });
const chatter = (ctx: AudioContext, f: number, n: number, v = 0.04) => {
  for (let i = 0; i < n; i++) voiced(ctx, { type: 'square', pitch: [f, f * 1.15, f * 0.9], seconds: 0.05, volume: v, filter: ['bandpass', f * 1.3, 3], delay: i * 0.075 });
};
const trill = (ctx: AudioContext, f: number, v = 0.045) =>
  voiced(ctx, { type: 'sine', pitch: [f, f * 1.4, f * 1.1], seconds: 0.45, volume: v, vibrato: [24, 0.08] });
const chirps = (ctx: AudioContext, f: number, n: number, v = 0.05) => {
  for (let i = 0; i < n; i++) voiced(ctx, { type: 'sine', pitch: [f, f * 1.5, f * 1.3], seconds: 0.08, volume: v, delay: i * 0.12 });
};

type Calls = Record<Feeling, (ctx: AudioContext) => void>;

const CALLS: Record<string, Calls> = {
  fox: {
    happy: (c) => (playAnimalCall('fox', false, 0.35) ? undefined : chirps(c, 900, 2)),
    excited: (c) => (playAnimalCall('fox', false, 0.5) ? undefined : yelp(c, 800)),
    hurt: (c) => yelp(c, 950, 0.07),
    scared: (c) => whimper(c, 700),
    annoyed: (c) => {
      growl(c, 95);
      playAnimalCall('fox', true, 0.35);
    },
    sad: (c) => whimper(c, 560, 0.035),
    content: (c) => purr(c, 60, 0.04),
  },
  horse: {
    happy: () => playNicker(1, 1),
    excited: () => {
      if (!playHorseCall(0.4)) playNicker(1.2, 1.2);
    },
    hurt: (c) => squeal(c, 620, 0.06),
    scared: (c) => {
      playSnort(0.07);
      squeal(c, 700, 0.04);
    },
    annoyed: () => {
      playSnort(0.08);
      window.setTimeout(() => playSnort(0.06), 260);
    },
    sad: () => playNicker(0.7, 0.6),
    content: () => playSnort(0.03),
  },
  stag: {
    happy: (c) => voiced(c, { pitch: [520, 600, 420], seconds: 0.35, volume: 0.04, filter: ['bandpass', 900, 2], vibrato: [9, 0.03] }),
    excited: (c) => (playAnimalCall('stag', false, 0.45) ? undefined : squeal(c, 500)),
    hurt: (c) => squeal(c, 760, 0.06),
    scared: (c) => voiced(c, { pitch: [700, 650, 300], seconds: 0.15, volume: 0.07, filter: ['bandpass', 1200, 1.5] }),
    annoyed: (c) => (playAnimalCall('stag', true, 0.45) ? undefined : growl(c, 80)),
    sad: (c) => whimper(c, 420, 0.03),
    content: () => playSnort(0.025),
  },
  rabbit: {
    happy: (c) => chatter(c, 1600, 5, 0.02),
    excited: (c) => chirps(c, 1800, 3, 0.035),
    hurt: (c) => squeal(c, 1700, 0.06),
    scared: (c) => {
      voiced(c, { type: 'sine', pitch: [140, 120, 60], seconds: 0.12, volume: 0.12 });
      squeal(c, 1500, 0.03);
    },
    annoyed: (c) => hiss(c, 0.4, 'highpass', 2500, 0.7, 0.05),
    sad: (c) => whimper(c, 1200, 0.025),
    content: (c) => chatter(c, 1400, 8, 0.015),
  },
  bird: {
    happy: (c) => chirps(c, 2400, 2),
    excited: (c) => trill(c, 2600),
    hurt: (c) => voiced(c, { type: 'square', pitch: [3200, 3600, 2200], seconds: 0.3, volume: 0.04, filter: ['bandpass', 3000, 2] }),
    scared: (c) => chatter(c, 3000, 6, 0.035),
    annoyed: (c) => chatter(c, 2200, 8, 0.04),
    sad: (c) => voiced(c, { type: 'sine', pitch: [1800, 1700, 1300], seconds: 0.5, volume: 0.03 }),
    content: (c) => trill(c, 2000, 0.025),
  },
  dragon: {
    happy: (c) => purr(c, 45, 0.07),
    excited: (c) => voiced(c, { pitch: [160, 420, 300], seconds: 0.45, volume: 0.06, filter: ['lowpass', 1400, 1], pulse: [30, 0.5] }),
    hurt: (c) => voiced(c, { pitch: [420, 520, 180], seconds: 0.5, volume: 0.07, filter: ['lowpass', 1800, 1], pulse: [34, 0.5] }),
    scared: (c) => whimper(c, 380, 0.05),
    annoyed: (c) => {
      hiss(c, 0.6, 'highpass', 1800, 0.6, 0.07);
      growl(c, 70, 0.06);
    },
    sad: (c) => voiced(c, { type: 'triangle', pitch: [220, 240, 140], seconds: 0.9, volume: 0.04, vibrato: [5, 0.04] }),
    content: (c) => purr(c, 40, 0.05),
  },
};
// The others borrow the nearest voice: the snail and butterfly are quiet things.
CALLS.snail = { ...CALLS.rabbit, happy: (c) => chirps(c, 1300, 1, 0.02), excited: (c) => chirps(c, 1500, 2, 0.025) };
CALLS.butterfly = { ...CALLS.bird, happy: (c) => trill(c, 3200, 0.02), excited: (c) => trill(c, 3400, 0.03) };

const last: Record<string, number> = {};

/** A pet of this kind voices a feeling (no more than one call every half second per kind). */
export function petVoice(kind: string, feeling: Feeling): void {
  const ctx = audioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const key = kind;
  const urgent = feeling === 'hurt' || feeling === 'scared';
  if (!urgent && (last[key] ?? 0) > now) return;
  last[key] = now + 0.5;
  (CALLS[kind] ?? CALLS.fox)[feeling](ctx);
}
