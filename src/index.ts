/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { CreatureSystem } from './creatures/creature-system.js';
import { ShadowGameSystem } from './game.js';
import { PanelSystem } from './panel.js';
import { ShadowStageSystem } from './stage.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // The stage builds the paper the game draws on, so it must come first.
  world.registerSystem(ShadowStageSystem);
  world.registerSystem(ShadowGameSystem);
  world.registerSystem(CreatureSystem);
  world.registerSystem(PanelSystem);
});
