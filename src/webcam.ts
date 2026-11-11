import { WebcamHands } from './yash/webcam-hands.js';
import { stage } from './stage-state.js';

/**
 * Development only: webcam hands for Story mode's fights (the Shadow Dragon
 * and the Ink Duel), the same MediaPipe tracking the Arsenal uses. While on,
 * and while a fight is up, the camera's hands replace the headset's (or the
 * emulator's) in stage.joints; every other level keeps its usual hands,
 * since a single camera can't judge the depth those puzzles need.
 */
export const webcam = new WebcamHands();

const STYLE = `
#story-webcam { position: fixed; left: 12px; top: 12px; z-index: 2147483000; width: 250px;
  padding: 10px; border-radius: 12px; background: rgba(30, 18, 10, 0.92); color: #f3e6c8;
  font: 12px/1.4 system-ui, sans-serif; border: 1px solid #6b4424; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5); }
#story-webcam h2 { margin: 0 0 6px; font-size: 13px; color: #ffd27a; }
#story-webcam .row { display: flex; gap: 6px; }
#story-webcam button { flex: 1; padding: 6px; border-radius: 8px; border: 1px solid #8a5a2c;
  background: #4a2c16; color: #ffe9c4; font: 600 12px system-ui, sans-serif; cursor: pointer; }
#story-webcam button[data-on] { background: #a8641f; border-color: #ffd27a; }
#story-webcam .cam { display: none; margin-top: 6px; }
#story-webcam .cam[data-on] { display: block; }
#story-webcam video { width: 100%; border-radius: 6px; transform: scaleX(-1); background: #000; }
#story-webcam select { width: 100%; margin-top: 4px; background: #2e1a0c; color: #ffe9c4; border: 1px solid #8a5a2c; border-radius: 6px; padding: 4px; }
#story-webcam .status { margin-top: 6px; color: #d9c3a0; }
`;

/** Mounts the webcam panel (dev builds only). */
export function installWebcamPanel(): void {
  if (!import.meta.env.DEV) return;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'story-webcam';
  const title = document.createElement('h2');
  title.textContent = '📷 Webcam hands · Dragon & Ink Duel';
  const row = document.createElement('div');
  row.className = 'row';
  const power = document.createElement('button');
  power.textContent = 'Webcam on/off';
  power.addEventListener('click', () => {
    if (webcam.on) webcam.stop();
    else void webcam.start();
  });
  const swap = document.createElement('button');
  swap.textContent = '⇄ Swap L/R';
  swap.addEventListener('click', () => {
    webcam.swap = !webcam.swap;
  });
  row.append(power, swap);

  const cam = document.createElement('div');
  cam.className = 'cam';
  const picker = document.createElement('select');
  picker.title = 'Camera (a phone used as a webcam shows up here too)';
  picker.addEventListener('change', () => void webcam.start(picker.value));
  cam.append(webcam.video, picker);
  const status = document.createElement('div');
  status.className = 'status';
  panel.append(title, row, cam, status);
  document.body.appendChild(panel);

  let listed = false;
  const refreshCameras = async () => {
    const cameras = await webcam.cameras();
    picker.replaceChildren(
      ...cameras.map((c) => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.label;
        return option;
      }),
    );
  };
  setInterval(() => {
    power.toggleAttribute('data-on', webcam.on);
    cam.toggleAttribute('data-on', webcam.on);
    if (webcam.active && !listed) {
      listed = true;
      void refreshCameras();
    }
    if (webcam.status === 'off') {
      status.textContent = 'Drives your hands in the two fights. Loads Google MediaPipe from the internet the first time.';
    } else if (!webcam.active) {
      status.textContent = `Camera: ${webcam.status}`;
    } else {
      const where = stage.fight ? 'driving the fight' : 'waiting: start the Shadow Dragon or the Ink Duel';
      status.textContent = `Hands seen ${webcam.visible()} · ${where}`;
    }
  }, 250);
}
