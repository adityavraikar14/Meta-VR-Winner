/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, UIKitMLAsset, VisibilityState } from '@iwsdk/core';
import { loadProgress, play, totalStars } from './progress.js';

/**
 * The browser start screen (index.html #splash): shows while the page is
 * flat, hands over to the headset on Play, and comes back after exiting.
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
    if (!splash || !button) return;
    if (bar) bar.hidden = true;

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

    const launch = () => this.world.launchXR();
    button.addEventListener('click', launch);
    this.cleanupFuncs.push(
      () => button.removeEventListener('click', launch),
      this.world.visibilityState.subscribe((state) => {
        if (state === VisibilityState.NonImmersive) splash.removeAttribute('data-hidden');
        else splash.setAttribute('data-hidden', '');
      }),
    );
  }
}
