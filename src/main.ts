import Phaser from 'phaser';
import { BootScene } from './render/BootScene';
import { MenuScene } from './render/MenuScene';
import { GameScene } from './render/GameScene';
import { LANE_WIDTH, LANE_HEIGHT } from './sim/types';
import { initCrazyGames, crazyLoadingStart } from './crazygames';
import './style.css';

async function bootstrap(): Promise<void> {
  await initCrazyGames();
  crazyLoadingStart();

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: LANE_WIDTH,
    height: LANE_HEIGHT,
    parent: 'app',
    backgroundColor: '#0b0918',
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, MenuScene, GameScene],
    dom: { createContainer: false },
  };

  new Phaser.Game(config);
}

void bootstrap();

// Ensure the canvas always sits on a solid dark backdrop even before Phaser
// paints its first frame — prevents the body gradient bleeding through.
window.addEventListener('load', () => {
  const app = document.getElementById('app');
  if (app) app.style.background = '#0b0918';
});

// Show a small rotate hint when the viewport is too narrow to play comfortably.
function updateRotateHint(): void {
  const hint = document.getElementById('rotate-hint');
  if (!hint) return;
  const narrow = window.innerWidth / window.innerHeight < 1.6 && window.innerWidth < 700;
  hint.style.display = narrow ? 'flex' : 'none';
}
window.addEventListener('resize', updateRotateHint);
window.addEventListener('load', () => {
  const h = document.createElement('div');
  h.id = 'rotate-hint';
  // Drawn instruction (no emoji) so the presentation stays consistent with the
  // in-game pixel type.
  h.innerHTML = '<div style="text-align:center;font-family:monospace;letter-spacing:2px;color:#ffe0b0"><div '
    + 'style="width:34px;height:56px;margin:0 auto 10px;border:3px solid #8a5a2c;border-radius:6px;'
    + 'background:#171009"></div>ROTATE FOR BEST VIEW</div>';
  Object.assign(h.style, {
    position: 'fixed', inset: '0', background: 'rgba(11,9,24,0.85)',
    color: '#fff', display: 'none', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'monospace', zIndex: '100', pointerEvents: 'none',
  });
  document.body.appendChild(h);
  updateRotateHint();
});
