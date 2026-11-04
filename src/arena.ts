import type { Group } from '@iwsdk/core';
import { stage } from './stage-state.js';
import { ArsenalLevelSystem } from './yash/level.js';
import { Tutorial } from './yash/tutorial.js';

/**
 * Yash's Arsenal level, hosted inside Shadowplay as the Arena. His code is
 * used exactly as he wrote it; this wrapper only decides when it runs: it
 * sleeps (hidden, not updated) until the menu's Arena button sets
 * `stage.arena`, and starts his tutorial until the player has finished or
 * ended it once; later visits go straight to the fight.
 */

/** The parts of his system this wrapper touches from outside. */
interface ArsenalInternals {
  root: Group;
  startTutorial(): void;
  startFight(): void;
}

export class ArenaSystem extends ArsenalLevelSystem {
  private awake = false;

  override update(delta: number, time: number): void {
    const self = this as unknown as ArsenalInternals;
    self.root.visible = stage.arena;
    // His dev test panel (dev builds only) shows only while in the Arena.
    const panel = document.getElementById('arsenal-debug');
    if (panel) panel.style.display = stage.arena ? '' : 'none';
    if (!stage.arena) {
      this.awake = false;
      return;
    }
    if (!this.awake) {
      // Entering from the menu: his own clean start, sentinel in front.
      this.awake = true;
      if (Tutorial.seen()) self.startFight();
      else self.startTutorial();
    }
    super.update(delta, time);
  }
}
