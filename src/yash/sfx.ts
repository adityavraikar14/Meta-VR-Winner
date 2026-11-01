/**
 * Synthesized sound effects for the Arsenal level, so it ships no audio files.
 * Every call is fire-and-forget and silently does nothing without Web Audio.
 */
import type { Item } from './gestures.js';

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audio(): AudioContext | null {
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

export const sfx = {
  /** Unlocks audio; call from a click. */
  unlock(): void {
    audio();
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
    }
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
