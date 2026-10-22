import '@fontsource/orbitron/latin-500.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/press-start-2p/latin-400.css';
import './ui/styles.css';
import { webglAvailable } from './render/renderer';
import { Game } from './game/game';

const host = document.getElementById('game')!;
const uiRoot = document.getElementById('ui')!;

function fatal(title: string, body: string): void {
  uiRoot.innerHTML = `<div class="screen center"><div class="panel fatal"><h2>${title}</h2>${body}</div></div>`;
}

if (!webglAvailable()) {
  fatal(
    'WEBGL UNAVAILABLE',
    `<p>NEON ROADRUNNER needs WebGL to draw its 3D world, and this browser or device doesn't provide it.</p>
     <p>Try a current version of Chrome, Edge, Firefox or Safari, make sure hardware acceleration is enabled in the browser settings, and update your graphics drivers.</p>`,
  );
} else {
  try {
    const game = new Game(host, uiRoot);
    (window as unknown as { __game?: Game }).__game = game;
  } catch (err) {
    console.error(err);
    fatal('SOMETHING WENT WRONG', `<p>The game failed to start: ${(err as Error).message}</p><p>Reloading the page usually fixes this.</p>`);
  }
}
