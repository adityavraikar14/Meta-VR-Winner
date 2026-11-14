import { FONT, layout, lines } from './ui-theme.js';
import { canCraft, count, items, RECIPES, RESOURCE_ORDER, RESOURCES, type Resource } from './bag.js';
import { play } from './progress.js';

/**
 * The bag drawn like a game inventory: a dark stone panel, square slots
 * with bevelled edges, a painted icon in each, big counts in the corner,
 * and the recipes as "ingredients → item" rows.
 */

type Icon = Resource | 'potion' | 'ward' | 'shard' | 'axe';

function slot(g: CanvasRenderingContext2D, x: number, y: number, s: number, lit = false): void {
  g.fillStyle = lit ? '#4a4f58' : '#3a3e46';
  g.beginPath();
  g.roundRect(x, y, s, s, 12);
  g.fill();
  // Bevel: dark top-left inside, light bottom-right, like a sunken slot.
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  g.beginPath();
  g.moveTo(x + 6, y + s - 8);
  g.lineTo(x + 6, y + 6);
  g.lineTo(x + s - 8, y + 6);
  g.stroke();
  g.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  g.beginPath();
  g.moveTo(x + s - 6, y + 8);
  g.lineTo(x + s - 6, y + s - 6);
  g.lineTo(x + 8, y + s - 6);
  g.stroke();
}

export function drawIcon(g: CanvasRenderingContext2D, icon: Icon, cx: number, cy: number, r: number): void {
  g.save();
  g.translate(cx, cy);
  g.lineJoin = 'round';
  const shade = (c0: string, c1: string, x0 = -r, y0 = -r, x1 = r, y1 = r) => {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    return grad;
  };
  switch (icon) {
    case 'wood':
      g.rotate(-0.5);
      g.fillStyle = shade('#8a5530', '#4e2c14', 0, -r, 0, r);
      g.fillRect(-r * 0.9, -r * 0.42, r * 1.5, r * 0.84);
      g.fillStyle = '#d8a96a';
      g.beginPath();
      g.ellipse(r * 0.6, 0, r * 0.3, r * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#a0703a';
      g.lineWidth = r * 0.05;
      for (const k of [0.2, 0.12]) {
        g.beginPath();
        g.ellipse(r * 0.6, 0, r * k * 1.3, r * k * 1.8, 0, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    case 'stone':
      g.fillStyle = shade('#c9c4bb', '#6f6a64');
      g.beginPath();
      g.moveTo(-r * 0.8, r * 0.3);
      g.lineTo(-r * 0.5, -r * 0.5);
      g.lineTo(r * 0.3, -r * 0.7);
      g.lineTo(r * 0.85, -r * 0.1);
      g.lineTo(r * 0.6, r * 0.6);
      g.lineTo(-r * 0.3, r * 0.7);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.ellipse(-r * 0.15, -r * 0.3, r * 0.3, r * 0.12, -0.4, 0, Math.PI * 2);
      g.fill();
      break;
    case 'iron':
      g.fillStyle = shade('#8c939e', '#3c4048');
      g.beginPath();
      g.moveTo(-r * 0.7, r * 0.2);
      g.lineTo(-r * 0.3, -r * 0.6);
      g.lineTo(r * 0.5, -r * 0.5);
      g.lineTo(r * 0.75, r * 0.3);
      g.lineTo(0, r * 0.7);
      g.closePath();
      g.fill();
      g.fillStyle = '#d9822b';
      for (const [x, y] of [[-0.2, -0.1], [0.3, 0.1], [0.05, 0.4], [-0.35, 0.25]]) {
        g.beginPath();
        g.arc(x * r, y * r, r * 0.1, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'herb':
      g.strokeStyle = '#3d6a1e';
      g.lineWidth = r * 0.08;
      g.beginPath();
      g.moveTo(0, r * 0.85);
      g.lineTo(0, -r * 0.2);
      g.stroke();
      for (const [a, s] of [[-0.9, 1], [0.9, 1], [0, 1.15]]) {
        g.save();
        g.rotate(a);
        g.fillStyle = shade('#9ad65a', '#3f7a22', 0, -r, 0, 0);
        g.beginPath();
        g.ellipse(0, -r * 0.45 * s, r * 0.24, r * 0.48 * s, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      break;
    case 'crystal':
      for (const [x, h, a] of [[-0.35, 0.75, -0.25], [0.3, 0.7, 0.3], [0, 1, 0]]) {
        g.save();
        g.translate(x * r, r * 0.6);
        g.rotate(a);
        g.fillStyle = shade('#e6dbff', '#6b46d8', -r * 0.2, 0, r * 0.2, 0);
        g.beginPath();
        g.moveTo(-r * 0.18, 0);
        g.lineTo(-r * 0.18, -h * r * 1.1);
        g.lineTo(0, -h * r * 1.35);
        g.lineTo(r * 0.18, -h * r * 1.1);
        g.lineTo(r * 0.18, 0);
        g.closePath();
        g.fill();
        g.restore();
      }
      break;
    case 'ember': {
      const glow = g.createRadialGradient(0, 0, 0, 0, 0, r);
      glow.addColorStop(0, 'rgba(255, 220, 120, 1)');
      glow.addColorStop(0.45, 'rgba(255, 120, 30, 0.9)');
      glow.addColorStop(1, 'rgba(255, 60, 0, 0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffdf8a';
      g.beginPath();
      g.moveTo(0, -r * 0.7);
      g.quadraticCurveTo(r * 0.45, -r * 0.1, r * 0.2, r * 0.45);
      g.quadraticCurveTo(0, r * 0.25, -r * 0.2, r * 0.45);
      g.quadraticCurveTo(-r * 0.45, -r * 0.1, 0, -r * 0.7);
      g.fill();
      break;
    }
    case 'potion':
      g.fillStyle = 'rgba(220, 240, 255, 0.35)';
      g.beginPath();
      g.arc(0, r * 0.25, r * 0.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = shade('#b8f07a', '#3f8a24', 0, 0, 0, r);
      g.beginPath();
      g.arc(0, r * 0.25, r * 0.5, 0.15, Math.PI - 0.15);
      g.fill();
      g.fillStyle = 'rgba(220, 240, 255, 0.5)';
      g.fillRect(-r * 0.16, -r * 0.65, r * 0.32, r * 0.42);
      g.fillStyle = '#a07a50';
      g.fillRect(-r * 0.2, -r * 0.82, r * 0.4, r * 0.2);
      break;
    case 'ward':
      g.fillStyle = shade('#c6ccd6', '#5a606a');
      g.beginPath();
      g.moveTo(0, -r * 0.8);
      g.lineTo(r * 0.7, -r * 0.5);
      g.quadraticCurveTo(r * 0.65, r * 0.4, 0, r * 0.85);
      g.quadraticCurveTo(-r * 0.65, r * 0.4, -r * 0.7, -r * 0.5);
      g.closePath();
      g.fill();
      g.strokeStyle = '#e8c070';
      g.lineWidth = r * 0.08;
      g.stroke();
      g.fillStyle = '#e8c070';
      for (const [x, y] of [[0, -0.45], [-0.35, -0.2], [0.35, -0.2], [0, 0.35]]) {
        g.beginPath();
        g.arc(x * r, y * r, r * 0.07, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'shard': {
      const glow = g.createRadialGradient(0, 0, 0, 0, 0, r);
      glow.addColorStop(0, 'rgba(255, 245, 190, 0.9)');
      glow.addColorStop(1, 'rgba(255, 200, 60, 0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = shade('#fff4b0', '#e89a20');
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r * 0.75 : r * 0.3;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      break;
    }
    case 'axe':
      g.rotate(0.6);
      g.fillStyle = '#9a6a3a';
      g.fillRect(-r * 0.07, -r * 0.8, r * 0.14, r * 1.6);
      g.fillStyle = shade('#e0e4ea', '#7a808a');
      g.beginPath();
      g.moveTo(r * 0.05, -r * 0.75);
      g.lineTo(r * 0.65, -r * 0.85);
      g.quadraticCurveTo(r * 0.8, -r * 0.4, r * 0.6, -r * 0.05);
      g.lineTo(r * 0.05, -r * 0.3);
      g.closePath();
      g.fill();
      break;
  }
  g.restore();
}

function countLabel(g: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  g.font = `900 34px ${FONT}`;
  g.textAlign = 'right';
  g.textBaseline = 'alphabetic';
  g.lineWidth = 6;
  g.strokeStyle = '#111';
  g.strokeText(text, x, y);
  g.fillStyle = '#fff';
  g.fillText(text, x, y);
}

/** Paint the whole inventory onto a 2048 × 1024 canvas (laid out at 1024 × 512). */
export function drawInventory(canvas: HTMLCanvasElement, message: string): void {
  const { g, w, h } = layout(canvas);
  g.clearRect(0, 0, w, h);
  // The panel: deep navy with a bright yellow rim, like the rest of the interface.
  const panel = g.createLinearGradient(0, 0, 0, h);
  panel.addColorStop(0, '#22304f');
  panel.addColorStop(1, '#14213d');
  g.fillStyle = panel;
  g.beginPath();
  g.roundRect(8, 8, w - 16, h - 16, 30);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#ffc928';
  g.stroke();

  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffc928';
  g.font = `800 40px ${FONT}`;
  g.fillText('Your Bag', 40, 50);
  g.fillStyle = message ? '#7dffb0' : '#e8eef8';
  g.font = `700 25px ${FONT}`;
  g.textAlign = 'right';
  g.fillText(message || 'Mix things that help you win the boss fights', w - 40, 50, 680);

  // How it works, in three steps.
  const steps: Array<[string, string, string]> = [
    ['1  GATHER', 'Touch the glowing herbs, stones and crystals beside each level'],
    ['2  MIX', 'Push a recipe’s button below when it says READY'],
    ['3  USE', 'In a fight, turn a palm to your face and push Drink. Wards and shards work by themselves'],
  ].map(([a, b]) => [a, b, ''] as [string, string, string]);
  steps.forEach(([head, text], i) => {
    const x = 32 + i * 324;
    g.fillStyle = 'rgba(255, 201, 40, 0.13)';
    g.beginPath();
    g.roundRect(x, 84, 312, 84, 14);
    g.fill();
    g.fillStyle = '#ffc928';
    g.font = `900 21px ${FONT}`;
    g.textAlign = 'left';
    g.fillText(head, x + 14, 104);
    g.fillStyle = '#ffffff';
    g.font = `600 17px ${FONT}`;
    lines(g, text, 286).slice(0, 2).forEach((line, j) => g.fillText(line, x + 14, 130 + j * 21));
    if (i < 2) {
      g.fillStyle = '#ffc928';
      g.font = `900 26px ${FONT}`;
      g.textAlign = 'center';
      g.fillText('›', x + 318, 126);
    }
  });

  // Gathered resources: two rows of three slots.
  g.textAlign = 'left';
  g.fillStyle = '#9fb3d9';
  g.font = `800 20px ${FONT}`;
  g.fillText('GATHERED', 36, 192);
  const S = 92;
  RESOURCE_ORDER.forEach((r, i) => {
    const x = 34 + (i % 3) * (S + 10);
    const y = 208 + Math.floor(i / 3) * (S + 10);
    const n = count(r);
    slot(g, x, y, S, n > 0);
    g.globalAlpha = n > 0 ? 1 : 0.35;
    drawIcon(g, r, x + S / 2, y + S / 2 + 2, S * 0.3);
    g.globalAlpha = 1;
    countLabel(g, `${n}`, x + S - 10, y + S - 8);
    g.fillStyle = '#e8eef8';
    g.font = `700 17px ${FONT}`;
    g.textAlign = 'left';
    g.fillText(RESOURCES[r].plural, x + 9, y + 16);
  });

  // Crafted things you carry.
  g.fillStyle = '#9fb3d9';
  g.font = `800 20px ${FONT}`;
  g.fillText('CARRYING', 36, 420);
  const carried: Array<[Icon, number, string]> = [
    ['potion', items('potion'), 'Draught'],
    ['ward', items('ward'), 'Ward'],
    ['shard', items('shard'), 'Shard'],
  ];
  carried.forEach(([icon, n], i) => {
    const x = 34 + i * 102;
    const y = 434;
    slot(g, x, y, 56, n > 0);
    g.globalAlpha = n > 0 ? 1 : 0.3;
    drawIcon(g, icon, x + 28, y + 28, 18);
    g.globalAlpha = 1;
    g.fillStyle = '#ffffff';
    g.font = `900 26px ${FONT}`;
    g.textAlign = 'left';
    g.fillText(`×${n}`, x + 62, y + 30);
  });

  // Recipes: big cards, ingredients → item, and READY or what is missing.
  const rx = 362;
  const rw = w - rx - 32;
  RECIPES.forEach((recipe, i) => {
    const y = 184 + i * 104;
    const ready = canCraft(recipe);
    g.fillStyle = ready ? 'rgba(31, 179, 90, 0.2)' : 'rgba(255, 255, 255, 0.06)';
    g.beginPath();
    g.roundRect(rx, y, rw, 94, 16);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = ready ? '#1fb35a' : 'rgba(255, 255, 255, 0.18)';
    g.stroke();
    let x = rx + 18;
    for (const [r, n] of Object.entries(recipe.needs)) {
      drawIcon(g, r as Resource, x + 22, y + 36, 20);
      g.fillStyle = count(r as Resource) >= (n ?? 0) ? '#ffffff' : '#ff8a7a';
      g.font = `900 26px ${FONT}`;
      g.textAlign = 'left';
      g.fillText(`×${n}`, x + 46, y + 38);
      x += 100;
    }
    g.fillStyle = '#ffc928';
    g.font = `900 34px ${FONT}`;
    g.fillText('→', x, y + 36);
    drawIcon(g, recipe.item, x + 64, y + 36, 24);
    // Missing ingredients, said plainly; or READY.
    const missing = Object.entries(recipe.needs)
      .filter(([r, n]) => count(r as Resource) < (n ?? 0))
      .map(([r, n]) => `${(n ?? 0) - count(r as Resource)} ${RESOURCES[r as Resource].plural.toLowerCase()}`);
    const status = ready ? 'READY: push ' + recipe.label.toUpperCase() : 'need ' + missing.join(' + ');
    g.textAlign = 'right';
    g.font = `900 20px ${FONT}`;
    g.fillStyle = ready ? '#7dffb0' : '#ff9a8a';
    g.fillText(status, rx + rw - 18, y + 28, 230);
    const statusW = Math.min(230, g.measureText(status).width);
    g.textAlign = 'left';
    g.fillStyle = '#ffffff';
    g.font = `800 25px ${FONT}`;
    g.fillText(recipe.name, x + 100, y + 28, rx + rw - 30 - statusW - (x + 100));
    g.fillStyle = '#d4def4';
    g.font = `600 20px ${FONT}`;
    g.fillText(recipe.does.charAt(0).toUpperCase() + recipe.does.slice(1), x + 100, y + 64, rx + rw - 18 - (x + 100));
  });
}
