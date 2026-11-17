/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Texture, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { CreatureSystem } from './creatures/creature-system.js';
import { ShadowGameSystem } from './game.js';
import { HandMenuSystem } from './hand-menu.js';
import { PanelSystem } from './panel.js';
import { ShadowStageSystem } from './stage.js';
import { ArenaSystem } from './arena.js';
import { checkBlobStore } from './blob-fallback.js';

// Text on panels and buttons stays crisp when seen at an angle (set before any texture is made).
Texture.DEFAULT_ANISOTROPY = 4;

// A browser that can't read Blobs gets its model textures another way (before anything loads).
void checkBlobStore().then(() =>
  World.create(
    document.getElementById('scene-container') as HTMLDivElement,
    projectOptions,
  ).then((world) => {
    // three.js defaults to the strongest fixed foveation, which blurs every caption and button
    // away from the centre of view. A lighter setting keeps text sharp across the view.
    world.renderer.xr.setFoveation(0.4);
    // The stage builds the paper the game draws on, so it must come first.
    world.registerSystem(ShadowStageSystem);
    world.registerSystem(ShadowGameSystem);
    world.registerSystem(CreatureSystem);
    world.registerSystem(HandMenuSystem);
    world.registerSystem(PanelSystem);
    // Yash's Arsenal, as he wrote it, opened from the menu's Arena button.
    world.registerSystem(ArenaSystem);
  }),
);
