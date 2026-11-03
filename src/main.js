/* Browser shell: input, integer pixel scaling and a fixed 60 fps step. */
(function () {
  'use strict';

  const { CFG, createGame, update, render } = window.DragonGame;
  const audio = window.GameAudio;
  const STEP = 1 / 60;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = CFG.W;
  canvas.height = CFG.H;

  function fit() {
    const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / CFG.W, window.innerHeight / CFG.H)));
    canvas.style.width = CFG.W * scale + 'px';
    canvas.style.height = CFG.H * scale + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  // Debug params: ?auto=1 lets the computer drive your runner, ?seed=N fixes the RNG,
  // ?char=eevee preselects a character, ?mode=trial|survival skips the mode menu,
  // ?ff=SECONDS fast-forwards the simulation (&freeze=1 holds it).
  const params = new URLSearchParams(location.search);
  const game = createGame({
    auto: params.get('auto') === '1',
    seed: params.has('seed') ? Number(params.get('seed')) : undefined,
    char: params.get('char') || undefined,
    mode: params.get('mode') || undefined,
  });

  const held = { left: false, right: false, up: false, down: false };
  const pressed = { jumpPressed: false, leftPressed: false, rightPressed: false, upPressed: false, downPressed: false };
  const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

  window.addEventListener('keydown', (e) => {
    audio.unlock();
    if (KEYS[e.code]) {
      if (!held[KEYS[e.code]]) pressed[KEYS[e.code] + 'Pressed'] = true;
      held[KEYS[e.code]] = true;
      e.preventDefault();
    } else if (e.code === 'Space') {
      if (!e.repeat) pressed.jumpPressed = true;
      e.preventDefault();
    } else if (e.code === 'KeyM' && !e.repeat) {
      audio.toggleMute();
    }
  });
  window.addEventListener('pointerdown', () => audio.unlock());
  window.addEventListener('keyup', (e) => {
    if (KEYS[e.code]) held[KEYS[e.code]] = false;
  });
  window.addEventListener('blur', () => { held.left = held.right = held.up = held.down = false; });

  const idle = { left: false, right: false, up: false, down: false, jumpPressed: false };
  const ff = Number(params.get('ff') || 0);
  for (let n = 0; n < ff * 60; n++) update(game, STEP, idle);
  const frozen = params.get('freeze') === '1'; // with ff: hold that exact frame (for screenshots)

  function load(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  Promise.all([load('assets/sprites.png'), load('assets/tiles.png')]).then(([sprites, tiles]) => {
    const images = { sprites, tiles };
    let last = performance.now();
    let acc = 0;
    function frame(now) {
      acc += Math.min(0.25, (now - last) / 1000);
      last = now;
      while (acc >= STEP && !frozen) {
        update(game, STEP, Object.assign({}, held, pressed));
        for (const s of game.sounds) audio.play(s.name, s.cpu ? 0.5 : 1); // CPU knockouts a bit quieter
        audio.setMusic(game.phase === 'play' || (game.phase === 'countdown' && game.phaseT >= CFG.COUNTDOWN - CFG.GO_TIME));
        for (const k in pressed) pressed[k] = false;
        acc -= STEP;
      }
      render(game, ctx, images);
      requestAnimationFrame(frame);
    }
    render(game, ctx, images);
    requestAnimationFrame(frame);
  });
})();
