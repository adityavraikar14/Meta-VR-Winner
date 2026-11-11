/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { loadProgress, play, totalStars } from './progress.js';
import { sfx } from '../sfx.js';
import { stage } from './stage-state.js';
import { DUEL, DUEL_INDEX, PUZZLES, WORLDS } from './world/puzzles.js';

/**
 * The browser start screen (#sp-splash, cloned in from yash.html's story
 * template): shows while the page is flat, hands over to the headset on Play,
 * and comes back after exiting. In the Arsenal's copy it also lists every
 * level, so any one can be started directly, and leads back to the Arsenal.
 */
export class PanelSystem extends createSystem({}) {
  init(): void {
    // The HTML splash replaces the template's floating welcome panel.
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    if (panel) panel.visible = false;

    const splash = document.getElementById('sp-splash');
    const button = document.getElementById('sp-play') as HTMLButtonElement | null;
    const bar = document.getElementById('sp-bar');
    const note = document.getElementById('sp-note');
    const back = document.getElementById('sp-back');
    const list = document.getElementById('sp-level-list');
    if (!splash || !button) return;
    if (bar) bar.hidden = true;
    back?.addEventListener('click', () => {
      location.href = location.pathname;
    });

    if (!this.world.xrEnabled) {
      button.textContent = 'Open on Meta Quest';
      if (note) note.textContent = 'This browser cannot open VR. Visit this page in the Meta Quest browser.';
      return;
    }

    loadProgress();
    const returning = play.puzzleIndex !== 0 || totalStars() > 0;
    button.disabled = false;
    button.textContent = returning ? 'Continue in VR' : 'Play in VR';
    if (returning && note) note.textContent = `${totalStars()} ★ collected so far`;

    const launch = () => {
      // The Arsenal's own sounds (the dragon fight's weapons) start on this click too.
      sfx.unlock();
      this.world.launchXR();
    };
    // The Judge's Demo: a short cut of the story. Opened from the Arsenal's
    // start page (?demo=1) it is this page's main button.
    const demoButton = document.getElementById('sp-demo') as HTMLButtonElement | null;
    const launchDemo = () => {
      stage.startDemo = true;
      launch();
    };
    if (new URLSearchParams(location.search).get('demo') === '1') {
      button.textContent = '🏆 Start the Judge’s Demo';
      button.addEventListener('click', launchDemo);
      if (demoButton) demoButton.hidden = true;
      if (note) note.textContent = 'Seven levels, about 8 minutes. Hands only, played seated.';
    } else {
      button.addEventListener('click', launch);
      if (demoButton) {
        demoButton.disabled = false;
        demoButton.addEventListener('click', launchDemo);
      }
    }
    if (list) {
      this.fillLevels(list, (index) => {
        stage.startAt = index;
        launch();
      });
    }
    this.cleanupFuncs.push(
      () => button.removeEventListener('click', launch),
      () => button.removeEventListener('click', launchDemo),
      () => demoButton?.removeEventListener('click', launchDemo),
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
    group('Side games', [{ index: DUEL_INDEX, id: DUEL.id, title: DUEL.title }]);
  }
}
