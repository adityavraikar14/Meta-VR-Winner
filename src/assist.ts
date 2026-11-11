/**
 * Relaxed spark (Settings): the spark's physics runs at 60% speed, so there is
 * more time to read its path and place a shadow. Everything else stays the
 * same, and best times are measured in the spark's own time, so they still
 * compare fairly.
 */

const KEY = 'shadowplay.relaxed';
export const RELAXED_PACE = 0.6;

let relaxed = (() => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();

export function isRelaxed(): boolean {
  return relaxed;
}

export function setRelaxed(value: boolean): void {
  relaxed = value;
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    // Not remembered; it still applies now.
  }
}

/** How fast the spark's time runs against real time. */
export function sparkPace(): number {
  return relaxed ? RELAXED_PACE : 1;
}
