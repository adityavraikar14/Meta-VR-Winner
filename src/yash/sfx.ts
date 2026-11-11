/**
 * Synthesized sound effects for the Arsenal level, so it ships no audio files.
 * Every call is fire-and-forget and silently does nothing without Web Audio.
 */
import { isMuted } from '../audio.js';
import type { Item } from './gestures.js';

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audio(): AudioContext | null {
  // One game, one Mute switch: the menu's Settings silence these too.
  if (isMuted()) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  /** Glide to this frequency over the tone. */
  to?: number;
  delay?: number;
}

function tone(freq: number, seconds: number, options: ToneOptions = {}): void {
  const ac = audio();
  if (!ac) return;
  const start = ac.currentTime + (options.delay ?? 0);
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = options.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, start);
  if (options.to) osc.frequency.exponentialRampToValueAtTime(options.to, start + seconds);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(options.gain ?? 0.2, start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  osc.connect(amp).connect(ac.destination);
  osc.start(start);
  osc.stop(start + seconds + 0.02);
}

/** Filtered noise: whooshes, impacts and crackles. */
function noise(seconds: number, gain: number, from: number, to = from, delay = 0): void {
  const ac = audio();
  if (!ac) return;
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const start = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + seconds);
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  src.connect(filter).connect(amp).connect(ac.destination);
  src.start(start);
  src.stop(start + seconds + 0.02);
}

interface VoiceOptions {
  type: OscillatorType;
  from: number;
  to: number;
  seconds: number;
  gain: number;
  delay?: number;
  /** Vowel-like resonances: [frequency, Q, gain] each, mixed in parallel. */
  formants?: Array<[number, number, number]>;
  /** Cut everything above this, Hz. */
  lowpass?: number;
  /** Pitch wobble: [rate Hz, depth Hz]. */
  vibrato?: [number, number];
  /** Loudness throb for growls: [rate Hz, depth 0–1]. */
  growl?: [number, number];
  /** Attack and release, seconds. */
  attack?: number;
  release?: number;
}

/**
 * A voiced sound: an oscillator shaped by vowel filters, with optional
 * wobble and a throbbing growl. Cackles, shrieks and roars are built from it.
 */
function voice(o: VoiceOptions): void {
  const ac = audio();
  if (!ac) return;
  const start = ac.currentTime + (o.delay ?? 0);
  const end = start + o.seconds;
  const osc = ac.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.from, start);
  osc.frequency.exponentialRampToValueAtTime(o.to, end);
  const nodes: AudioScheduledSourceNode[] = [osc];
  if (o.vibrato) {
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = o.vibrato[0];
    depth.gain.value = o.vibrato[1];
    lfo.connect(depth).connect(osc.frequency);
    nodes.push(lfo);
  }
  const amp = ac.createGain();
  const attack = o.attack ?? 0.02;
  const release = o.release ?? Math.min(0.15, o.seconds * 0.4);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(o.gain, start + attack);
  amp.gain.setValueAtTime(o.gain, Math.max(start + attack, end - release));
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  let out: AudioNode = amp;
  if (o.growl) {
    const throb = ac.createGain();
    throb.gain.value = 1 - o.growl[1];
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = o.growl[0];
    depth.gain.value = o.growl[1];
    lfo.connect(depth).connect(throb.gain);
    amp.connect(throb);
    out = throb;
    nodes.push(lfo);
  }
  if (o.formants) {
    for (const [frequency, q, gain] of o.formants) {
      const band = ac.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = frequency;
      band.Q.value = q;
      const level = ac.createGain();
      level.gain.value = gain;
      osc.connect(band).connect(level).connect(amp);
    }
  } else if (o.lowpass) {
    const low = ac.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = o.lowpass;
    osc.connect(low).connect(amp);
  } else {
    osc.connect(amp);
  }
  out.connect(ac.destination);
  for (const node of nodes) {
    node.start(start);
    node.stop(end + 0.05);
  }
}

/** Seconds since each voice last spoke, so laughs and growls don't pile up. */
const lastSaid: Record<string, number> = {};
function quiet(name: string, gap: number): boolean {
  const now = performance.now() / 1000;
  if (now - (lastSaid[name] ?? -Infinity) < gap) return true;
  lastSaid[name] = now;
  return false;
}

/** Recorded witch laughs (CC0; see public/audio/yash/CREDITS.md), loaded on first use. */
const CLIPS = {
  laughA: 'witch-laugh-a.ogg',
  laughB: 'witch-laugh-b.ogg',
  close: 'witch-laugh-close.ogg',
  ward: 'witch-laugh-ward.ogg',
} as const;
type Clip = keyof typeof CLIPS;
/** Each recording's loudness (RMS) as measured, so they can be evened out. */
const CLIP_RMS: Record<Clip, number> = { laughA: 0.042, laughB: 0.117, close: 0.064, ward: 0.105 };
const clips: Partial<Record<Clip, AudioBuffer>> = {};
let clipsRequested = false;

function loadClips(): void {
  const ac = audio();
  if (!ac || clipsRequested) return;
  clipsRequested = true;
  for (const [name, file] of Object.entries(CLIPS) as Array<[Clip, string]>) {
    void fetch(`${import.meta.env.BASE_URL}audio/yash/${file}`)
      .then((response) => response.arrayBuffer())
      .then((data) => ac.decodeAudioData(data))
      .then((buffer) => {
        clips[name] = buffer;
      })
      .catch((error) => console.warn(`Could not load ${file}`, error));
  }
}

interface ClipOptions {
  /** Target loudness (RMS); the clip is scaled to it. */
  loudness: number;
  /** Below 1 is deeper and slower. */
  rate?: number;
  delay?: number;
  /** Fade out and stop after this long. */
  maxSeconds?: number;
  /** A ghostly echo. */
  echo?: boolean;
}

/** The witch has one voice: a new laugh cuts the last one off. */
let witchVoice: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

/** Plays a recording on the witch's voice; false if it hasn't loaded (the caller falls back to synthesis). */
function playClip(name: Clip, o: ClipOptions): boolean {
  const ac = audio();
  const buffer = clips[name];
  loadClips();
  if (!ac || !buffer) return false;
  const start = ac.currentTime + (o.delay ?? 0);
  if (witchVoice) {
    const old = witchVoice;
    old.gain.gain.setTargetAtTime(0, start, 0.04);
    old.source.stop(start + 0.2);
  }
  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = o.rate ?? 1;
  const gain = ac.createGain();
  gain.gain.value = Math.min(6, o.loudness / CLIP_RMS[name]);
  source.connect(gain).connect(ac.destination);
  if (o.echo) {
    const delay = ac.createDelay(1);
    delay.delayTime.value = 0.21;
    const feedback = ac.createGain();
    feedback.gain.value = 0.38;
    const tone = ac.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    const wet = ac.createGain();
    wet.gain.value = 0.55;
    gain.connect(delay).connect(tone).connect(feedback).connect(delay);
    tone.connect(wet).connect(ac.destination);
  }
  const length = buffer.duration / (o.rate ?? 1);
  const stopAt = start + Math.min(length, o.maxSeconds ?? length);
  if (o.maxSeconds && o.maxSeconds < length) gain.gain.setTargetAtTime(0, stopAt - 0.4, 0.15);
  source.start(start);
  source.stop(stopAt + 0.1);
  witchVoice = { source, gain };
  return true;
}

/** Alternates between the two everyday laughs. */
let nextLaugh: Clip = 'laughA';

/** The "ah" vowel of a cackle, and the "ee" of a shriek. */
const AH: Array<[number, number, number]> = [[800, 7, 1.4], [1150, 8, 1], [2800, 10, 0.35]];
const EE: Array<[number, number, number]> = [[320, 6, 1.2], [2300, 9, 1], [3000, 10, 0.4]];

export const sfx = {
  /** Unlocks audio; call from a click. Also starts loading the recordings. */
  unlock(): void {
    audio();
    loadClips();
  },
  /** Morwen after every throw: one of two cackles in turn, whether the throw hits or not. */
  witchAttackLaugh(delay = 0.15): void {
    const clip = nextLaugh;
    nextLaugh = clip === 'laughA' ? 'laughB' : 'laughA';
    if (!playClip(clip, { loudness: 0.09, rate: 0.97 + Math.random() * 0.06, delay })) sfx.witchLaugh(0.5);
  },
  /** Morwen right in front of the player: a long, maniacal cackle, deeper and louder. */
  witchCloseLaugh(): void {
    if (!playClip('close', { loudness: 0.17, rate: 0.9, maxSeconds: 5 })) sfx.witchLaugh(1);
  },
  /** Morwen rising inside her ward: a ghostly cackle with an echo, deeper and louder. */
  witchWardLaugh(): void {
    if (!playClip('ward', { loudness: 0.16, rate: 0.92, echo: true })) sfx.witchLaugh(1);
  },
  armed(): void {
    tone(523, 0.18, { type: 'triangle', gain: 0.18 });
    tone(784, 0.3, { type: 'triangle', gain: 0.18, delay: 0.09 });
  },
  success(): void {
    tone(660, 0.15, { type: 'triangle', gain: 0.16 });
    tone(990, 0.3, { type: 'triangle', gain: 0.16, delay: 0.1 });
  },
  fizzle(): void {
    tone(400, 0.35, { type: 'sine', gain: 0.1, to: 160 });
  },
  summon(item: Item): void {
    switch (item) {
      case 'sword':
        noise(0.35, 0.25, 6000, 1800);
        tone(1320, 0.4, { type: 'triangle', gain: 0.08, delay: 0.05 });
        break;
      case 'spear':
        noise(0.3, 0.2, 2500, 900);
        tone(220, 0.35, { type: 'sawtooth', gain: 0.06, to: 330 });
        break;
      case 'ball':
        tone(180, 0.6, { type: 'sine', gain: 0.22, to: 520 });
        noise(0.5, 0.1, 800, 3000);
        break;
      case 'wall':
        tone(110, 0.5, { type: 'square', gain: 0.07, to: 220 });
        noise(0.45, 0.25, 400, 1600);
        break;
      case 'gun':
        tone(300, 0.12, { type: 'square', gain: 0.06, to: 900 });
        tone(1200, 0.15, { type: 'triangle', gain: 0.08, delay: 0.1 });
        break;
      case 'shield':
        tone(330, 0.4, { type: 'triangle', gain: 0.12, to: 660 });
        noise(0.3, 0.15, 1500, 4000);
        break;
      case 'sling':
        tone(500, 0.18, { type: 'triangle', gain: 0.08, to: 750 });
        noise(0.15, 0.1, 2000, 2500);
        break;
    }
  },
  /** The dragon's full roar: a deep, throbbing growl with breath behind it. */
  roar(): void {
    sfx.dragonRoar(1);
  },
  /** Morwen's full cackle. */
  cackle(): void {
    sfx.witchLaugh(1);
  },
  /**
   * A witch's cackle: quick "ha" syllables, high and nasal with a wobble,
   * climbing then tumbling down. `intensity` (0–1) sets length and loudness.
   */
  witchLaugh(intensity: number): void {
    if (quiet('witch', 1.4)) return;
    const syllables = 5 + Math.round(intensity * 5);
    const base = 400 + Math.random() * 60;
    for (let i = 0; i < syllables; i++) {
      const k = i / (syllables - 1);
      // Up over the first third, then down: ha-HA-HA-ha-ha-ha.
      const pitch = base * (1 + 0.35 * Math.sin(Math.min(1, k * 1.6) * Math.PI)) * (1 - 0.18 * k);
      const delay = i * (0.105 + k * 0.02);
      voice({
        type: 'sawtooth',
        from: pitch * 1.06,
        to: pitch * 0.94,
        seconds: 0.085 + k * 0.02,
        gain: (0.07 + 0.06 * intensity) * (1 - 0.3 * k),
        delay,
        formants: AH,
        vibrato: [9, 14],
        attack: 0.012,
        release: 0.04,
      });
      noise(0.04, 0.05 * intensity, 2400, 1800, delay);
    }
  },
  /** Morwen beaten: a long, falling shriek. */
  witchShriek(): void {
    voice({ type: 'sawtooth', from: 980, to: 240, seconds: 1.8, gain: 0.13, formants: EE, vibrato: [8, 40], attack: 0.05, release: 0.8 });
    noise(1.4, 0.08, 3000, 900);
  },
  /** A dragon's roar: two growling layers and rushing breath; `size` 0–1. */
  dragonRoar(size: number): void {
    if (quiet('dragon-roar', 0.8)) return;
    const seconds = 0.9 + size * 0.7;
    voice({ type: 'sawtooth', from: 92, to: 48, seconds, gain: 0.2 + size * 0.08, lowpass: 650, growl: [27, 0.6], attack: 0.08, release: 0.5 });
    voice({ type: 'square', from: 140, to: 70, seconds: seconds * 0.9, gain: 0.07, formants: [[420, 3, 1], [900, 4, 0.5]], growl: [31, 0.5], attack: 0.1, release: 0.4 });
    noise(seconds, 0.3 + size * 0.1, 420, 140);
  },
  /** A short snarl before the fire, or when a fireball lands. */
  dragonSnarl(): void {
    if (quiet('dragon-snarl', 0.6)) return;
    voice({ type: 'sawtooth', from: 150, to: 95, seconds: 0.55, gain: 0.16, lowpass: 800, growl: [34, 0.65], attack: 0.04, release: 0.25 });
    noise(0.5, 0.18, 700, 300);
  },
  /** Struck: a grunt. */
  dragonGrunt(): void {
    if (quiet('dragon-grunt', 0.45)) return;
    voice({ type: 'sawtooth', from: 120, to: 70, seconds: 0.28, gain: 0.15, lowpass: 600, growl: [40, 0.5], attack: 0.02, release: 0.15 });
  },
  /** Beaten: a long, failing roar. */
  dragonDeath(): void {
    voice({ type: 'sawtooth', from: 110, to: 32, seconds: 2.6, gain: 0.22, lowpass: 600, growl: [22, 0.7], attack: 0.1, release: 1.4 });
    voice({ type: 'square', from: 170, to: 50, seconds: 2.2, gain: 0.06, formants: [[380, 3, 1]], growl: [18, 0.6], attack: 0.1, release: 1.2 });
    noise(2.4, 0.3, 500, 90);
  },
  inkThrow(): void {
    noise(0.3, 0.25, 600, 1500);
    tone(240, 0.25, { type: 'triangle', gain: 0.07, to: 140 });
  },
  ward(): void {
    tone(440, 0.6, { type: 'sine', gain: 0.1, to: 660 });
    tone(660, 0.6, { type: 'sine', gain: 0.07, to: 990, delay: 0.1 });
  },
  fireball(): void {
    noise(0.5, 0.35, 700, 2200);
    tone(160, 0.4, { type: 'sawtooth', gain: 0.08, to: 320 });
  },
  /** The slingshot's band creaks as it is taken. */
  slingStretch(): void {
    tone(180, 0.25, { type: 'triangle', gain: 0.06, to: 260 });
  },
  /** Let go: the band snaps and the stone whips away; louder for a fuller pull. */
  slingSnap(power: number): void {
    tone(900, 0.08, { type: 'square', gain: 0.05 + 0.05 * power, to: 300 });
    noise(0.22, 0.2 + 0.2 * power, 2500, 900);
  },
  shoot(): void {
    tone(1600, 0.12, { type: 'square', gain: 0.07, to: 260 });
    noise(0.08, 0.2, 4000, 1500);
  },
  throw(): void {
    noise(0.3, 0.3, 900, 3500);
  },
  slice(): void {
    noise(0.15, 0.3, 5000, 2000);
    tone(900, 0.15, { type: 'triangle', gain: 0.08, to: 500 });
  },
  hit(): void {
    noise(0.25, 0.4, 1200, 200);
    tone(150, 0.25, { type: 'sine', gain: 0.25, to: 60 });
  },
  block(): void {
    tone(660, 0.25, { type: 'square', gain: 0.06, to: 990 });
    noise(0.2, 0.2, 3000, 6000);
  },
  wallBreak(): void {
    noise(0.6, 0.45, 2500, 300);
    tone(330, 0.5, { type: 'square', gain: 0.06, to: 90 });
  },
  hurt(): void {
    tone(220, 0.3, { type: 'sawtooth', gain: 0.12, to: 110 });
  },
  telegraph(): void {
    tone(140, 0.8, { type: 'sine', gain: 0.12, to: 280 });
  },
  defeated(): void {
    tone(392, 0.2, { type: 'triangle', gain: 0.18 });
    tone(523, 0.2, { type: 'triangle', gain: 0.18, delay: 0.15 });
    tone(784, 0.45, { type: 'triangle', gain: 0.18, delay: 0.3 });
  },
};
