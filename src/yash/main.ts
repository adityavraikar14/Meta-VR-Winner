/**
 * Entry point for the Arsenal level page (yash.html). Registers only this
 * level's system, so the shadow levels never run here.
 */
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ArsenalLevelSystem } from './level.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(ArsenalLevelSystem);
});
