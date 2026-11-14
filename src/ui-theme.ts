/**
 * The look of the game's interface: bright, clean and modern, like a well-made
 * toy. Bold sans-serif type, white panels, deep navy text, and a few
 * saturated accents. Every canvas-drawn panel (captions, cards, buttons)
 * takes its colours and type from here.
 */

/** A sans-serif stack every headset browser has (Quest: Roboto; desktop: Segoe UI or Helvetica). */
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const UI = {
  navy: '#14213d',
  ink: '#22304f',
  muted: '#5b6782',
  white: '#ffffff',
  paper: '#fbfcfe',
  yellow: '#ffc928',
  green: '#1fb35a',
  red: '#ff4d42',
  blue: '#2f7dff',
  teal: '#11b5a4',
  orange: '#ff8a1f',
  purple: '#7b5cff',
} as const;

/** Button cap colours (hex numbers for materials). */
export const BUTTON = {
  red: 0xff4d42,
  green: 0x1fb35a,
  blue: 0x2f7dff,
  navy: 0x22304f,
  yellow: 0xffc928,
  teal: 0x11a89a,
  orange: 0xff8a1f,
  purple: 0x7b5cff,
} as const;

/** Each well-known button label has its own colour, so a menu reads at a glance. */
const LABEL_COLORS: Record<string, number> = {
  play: BUTTON.green, continue: BUTTON.green, replay: BUTTON.green, drop: BUTTON.green,
  back: BUTTON.navy, skip: BUTTON.navy, reset: BUTTON.navy, locked: BUTTON.navy,
  next: BUTTON.blue, prev: BUTTON.blue,
  chapters: BUTTON.blue, journal: BUTTON.teal, bag: BUTTON.orange, battles: BUTTON.red, settings: BUTTON.purple,
  daily: BUTTON.orange, workshop: BUTTON.blue, duel: BUTTON.purple, arena: BUTTON.red, trophies: BUTTON.orange,
  mute: BUTTON.blue, 'sound on': BUTTON.blue, table: BUTTON.blue, sky: BUTTON.blue, 'room view': BUTTON.blue, around: BUTTON.blue, ink: BUTTON.purple, random: BUTTON.orange, 'new game': BUTTON.navy,
  relaxed: BUTTON.teal, 'full speed': BUTTON.teal, credits: BUTTON.blue, recenter: BUTTON.blue,
  home: BUTTON.navy, 'leave?': BUTTON.red, hint: BUTTON.yellow, pets: BUTTON.teal,
};

export function labelColor(label: string): number {
  return LABEL_COLORS[label.trim().toLowerCase()] ?? BUTTON.red;
}

/** One accent colour per chapter: Light & Shadow, Structures, Fire & Iron, Hot Air, The Dragon. */
export const CHAPTER_ACCENT = [0xffc928, 0x2f7dff, 0xff6a2c, 0x11b5a4, 0x7b5cff] as const;

export function font(weight: number, px: number): string {
  return `${weight} ${px}px ${FONT}`;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Lighter or darker version of a hex colour (amount −1…1). */
export function shade(hex: number, amount: number): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const f = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

/** Text shrunk to fit a width, at most `max` px. */
export function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, width: number): number {
  let px = max;
  ctx.font = font(weight, px);
  while (px > 12 && ctx.measureText(text).width > width) {
    px -= 2;
    ctx.font = font(weight, px);
  }
  return px;
}

/** Panels are drawn at twice their layout size, so text stays sharp in the headset. */
export const HIDPI = 2;

/**
 * A 2D context for a hi-DPI panel canvas, scaled so drawing code works in
 * its layout size (the canvas's real size ÷ HIDPI). Returns the context and
 * the layout width and height.
 */
export function layout(canvas: HTMLCanvasElement): { g: CanvasRenderingContext2D; w: number; h: number } {
  const g = canvas.getContext('2d')!;
  const k = canvas.width >= 1536 ? HIDPI : 1;
  g.setTransform(k, 0, 0, k, 0, 0);
  return { g, w: canvas.width / k, h: canvas.height / k };
}

/** Breaks text into lines no wider than `width` at the context's current font. */
export function lines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}
