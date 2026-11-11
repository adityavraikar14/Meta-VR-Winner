/**
 * Entry point for the Arsenal page (yash.html): the hand-sign boss fights.
 * Its Story button opens Shadowplay itself (index.html), the one game both
 * of us build; the Arsenal also lives inside it as the Arena, and the
 * Shadow Dragon can be fought with Arsenal weapons there.
 */
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ArsenalLevelSystem } from './level.js';

document.getElementById('splash-story')?.addEventListener('click', () => {
  location.href = './index.html';
});
World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(ArsenalLevelSystem);
});
