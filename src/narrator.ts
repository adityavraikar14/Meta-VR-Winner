import { isMuted } from './audio.js';

/**
 * The storyteller's voice. Every line has an id; if a recorded file for it
 * is listed in RECORDED (public/audio/voice/<id>.mp3), that plays. Otherwise
 * the device's own speech voice reads the text (the Quest browser and
 * desktop Chrome both have one), choosing a warm English voice if it can.
 * Captions always show the same words, so nothing depends on sound.
 */

/** Line ids that have a recorded file in public/audio/voice/. */
const RECORDED = new Set<string>([]);

let audio: HTMLAudioElement | null = null;
let speaking = false;
let until = 0;
let chosen: SpeechSynthesisVoice | null = null;

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

/** The best English voice on this device: a British or natural-sounding one first. */
function voice(): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  if (chosen) return chosen;
  const voices = s.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
  if (!voices.length) return null;
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online/i.test(v.name) ? 4 : 0) +
    (/en-gb/i.test(v.lang) ? 3 : 0) +
    (/google uk english female|libby|sonia|serena|female/i.test(v.name) ? 2 : 0) +
    (/google/i.test(v.name) ? 1 : 0);
  chosen = voices.sort((a, b) => score(b) - score(a))[0];
  return chosen;
}

if (typeof window !== 'undefined') synth()?.addEventListener?.('voiceschanged', () => (chosen = null));

/** Roughly how long a line takes to say, in seconds (for pacing scenes). */
export function lineSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return 0.8 + words * 0.4;
}

/** Say a line, cutting off whatever was being said. */
export function narrate(id: string, text: string): void {
  stopNarration();
  until = performance.now() / 1000 + lineSeconds(text);
  if (isMuted()) return;
  if (RECORDED.has(id)) {
    audio = new Audio(`${import.meta.env.BASE_URL}audio/voice/${id}.mp3`);
    audio.volume = 0.95;
    speaking = true;
    audio.onended = () => (speaking = false);
    audio.onerror = () => {
      speaking = false;
      speak(text);
    };
    void audio.play().catch(() => speak(text));
    return;
  }
  speak(text);
}

function speak(text: string): void {
  const s = synth();
  if (!s) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const v = voice();
  if (v) {
    utterance.voice = v;
    utterance.lang = v.lang;
  } else {
    utterance.lang = 'en-GB';
  }
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.onend = () => (speaking = false);
  utterance.onerror = () => (speaking = false);
  speaking = true;
  s.speak(utterance);
}

export function stopNarration(): void {
  speaking = false;
  until = 0;
  if (audio) {
    audio.pause();
    audio = null;
  }
  synth()?.cancel();
}

/** True while a line is still being said (or, with no voice, for the time it would take). */
export function narrating(): boolean {
  return speaking || performance.now() / 1000 < until;
}
