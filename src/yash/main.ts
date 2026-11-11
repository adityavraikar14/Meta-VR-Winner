/**
 * Entry point for the Arsenal page (yash.html). It runs one of two modes:
 * the Arsenal (the hand-sign boss fights), or, at yash.html?mode=story, Story
 * mode, a copy of Shadowplay that lives in src/yash/story. Each mode loads
 * only its own systems, and switching reloads the page.
 */
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ArsenalLevelSystem } from './level.js';

const STORY = new URLSearchParams(location.search).get('mode') === 'story';

if (STORY) {
  // The Arsenal's splash makes way for the story's own start page.
  document.getElementById('splash')?.remove();
  const page = document.getElementById('story-page') as HTMLTemplateElement;
  document.body.prepend(page.content.cloneNode(true));
  document.body.style.background = '#120b06';
  document.title = 'Shadowplay · Story mode';
  void import('./story/main.js').then((story) => story.startStory());
} else {
  document.getElementById('splash-story')?.addEventListener('click', () => {
    location.search = '?mode=story';
  });
  document.getElementById('splash-demo')?.addEventListener('click', () => {
    location.search = '?mode=story&demo=1';
  });
  World.create(
    document.getElementById('scene-container') as HTMLDivElement,
    projectOptions,
  ).then((world) => {
    world.registerSystem(ArsenalLevelSystem);
  });
}
