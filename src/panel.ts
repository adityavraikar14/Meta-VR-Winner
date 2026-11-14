/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { preloadCalls } from './audio.js';
import { createSystem, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { loadProgress, play, totalStars } from './progress.js';
import { stage } from './stage-state.js';
import { DAILY_INDEX, DUEL, DUEL_INDEX, PUZZLES, WORKSHOP_INDEX, WORLDS } from './world/puzzles.js';
import { TROPHIES, trophiesEarned } from './trophies.js';
import { sfx } from './yash/sfx.js';

/**
 * The browser start screen (index.html #sp-splash): shows while the page is
 * flat, hands over to the headset on Play, and comes back after exiting.
 * It also lists every level, so any one can be started directly (Yash's
 * level picker), and opens the Arsenal's boss fights straight away.
 */
export class PanelSystem extends createSystem({}) {
  init(): void {
    // The HTML splash replaces the template's floating welcome panel.
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    if (panel) panel.visible = false;

    const splash = document.getElementById('sp-splash');
    const button = document.getElementById('sp-play') as HTMLButtonElement | null;
    const arena = document.getElementById('sp-arena') as HTMLButtonElement | null;
    const levels = document.getElementById('sp-levels');
    const list = document.getElementById('sp-level-list');
    const bar = document.getElementById('sp-bar');
    const note = document.getElementById('sp-note');
    if (!splash || !button) return;
    if (bar) bar.hidden = true;

    if (!this.world.xrEnabled) {
      if (levels) levels.hidden = true;
      button.textContent = 'Open on Meta Quest';
      button.disabled = false;
      const say = () => {
        if (note) note.textContent = 'This browser cannot open VR. Open this same link in the Meta Quest browser.';
        note?.classList.add('warn');
      };
      say();
      button.addEventListener('click', say);
      return;
    }

    loadProgress();
    const returning = play.puzzleIndex !== 0 || totalStars() > 0;
    button.disabled = false;
    button.textContent = returning ? 'Continue in VR' : 'Play in VR';
    if (returning && note) note.textContent = `${totalStars()} ★ collected so far  ·  ${trophiesEarned()} of ${TROPHIES.length} 🏆 trophies`;

    const label = button.textContent ?? 'Play in VR';
    const tell = (text: string, warn: boolean) => {
      if (!note) return;
      note.textContent = text;
      note.classList.toggle('warn', warn);
    };
    // Does this device do VR at all? (A laptop browser does not; the Quest does.)
    let canVR: boolean | null = null;
    const checking = navigator.xr?.isSessionSupported?.('immersive-ar').catch(() => false) ?? Promise.resolve(false);
    void checking.then((ok) => {
      canVR = ok;
      if (!ok) {
        button.textContent = 'Open on Meta Quest';
        tell('VR does not run in this browser. Open this same link in the Meta Quest browser and push Play there.', true);
      }
    });
    let starting = false;
    // Every push answers at once: VR starts, or it says plainly why not.
    const launch = () => {
      if (starting) return;
      if (canVR === false) {
        tell('VR does not run in this browser. Put on your Meta Quest, open this same link in its browser, and push Play there.', true);
        note?.animate?.([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 350 });
        return;
      }
      // The Arsenal's sounds (bosses, weapons) and the recorded animal calls start on this click too.
      sfx.unlock();
      preloadCalls();
      starting = true;
      button.textContent = 'Starting VR…';
      tell('Starting VR… if the headset asks, allow it', false);
      this.world.launchXR();
      // Watch the request: in VR, or refused (no device, a denied prompt), then say so and allow another try.
      const began = performance.now();
      const watch = window.setInterval(() => {
        const inVR = this.world.session != null || this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
        const settled = !this.world.sessionRequestPending && performance.now() - began > 300;
        if (!inVR && !settled && performance.now() - began < 20000) return;
        window.clearInterval(watch);
        starting = false;
        button.textContent = label;
        if (inVR) tell('Best on Meta Quest with hand tracking on.', false);
        else tell('VR did not start. Check hand tracking is on (Settings → Movement tracking), allow the VR prompt, then push Play again.', true);
      }, 150);
    };
    button.addEventListener('click', launch);
    const toArena = () => {
      stage.startArena = true;
      launch();
    };
    if (arena) {
      arena.disabled = false;
      arena.addEventListener('click', toArena);
    }
    if (list) {
      this.fillLevels(list, (index) => {
        stage.startAt = index;
        launch();
      });
    }
    this.cleanupFuncs.push(
      () => button.removeEventListener('click', launch),
      () => arena?.removeEventListener('click', toArena),
      this.world.visibilityState.subscribe((state) => {
        if (state === VisibilityState.NonImmersive) splash.removeAttribute('data-hidden');
        else splash.setAttribute('data-hidden', '');
      }),
    );
  }

  /** One button per level, grouped by chapter, then the Ink Duel. */
  private fillLevels(list: HTMLElement, pick: (index: number) => void): void {
    const group = (title: string, levels: Array<{ index: number; id: string; title: string }>) => {
      const heading = document.createElement('h3');
      heading.textContent = title;
      const row = document.createElement('div');
      row.className = 'row';
      for (const level of levels) {
        const b = document.createElement('button');
        const stars = play.stars[level.id] ?? 0;
        b.textContent = stars > 0 ? `${level.title} ${'★'.repeat(stars)}` : level.title;
        b.addEventListener('click', () => pick(level.index));
        row.appendChild(b);
      }
      list.append(heading, row);
    };
    WORLDS.forEach((world, w) => {
      const levels = PUZZLES.map((p, index) => ({ index, id: p.id, title: p.title, world: p.world }));
      group(`Chapter ${w + 1} · ${world.name}`, levels.filter((l) => l.world === w));
    });
    group('Side games', [
      { index: DAILY_INDEX, id: 'daily', title: 'Daily Light (today’s course)' },
      { index: WORKSHOP_INDEX, id: 'workshop', title: 'The Workshop (build your own)' },
      { index: DUEL_INDEX, id: DUEL.id, title: DUEL.title },
    ]);
  }
}
