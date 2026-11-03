/* Dragon's Breath remake (PMD Red Rescue Team assets): state, simulation and rendering.
 * No DOM access in here so the simulation can also run headless (see tools/simulate.js). */
(function (root) {
  'use strict';

  // All tuning lives here. Distances are native GBA pixels, times are seconds.
  const CFG = {
    W: 240, H: 320, TILE: 24, COLS: 10,
    HUD_H: 30,
    ROUND_TIME: 90,
    COUNTDOWN: 1.6,
    GO_TIME: 0.5,               // GO! shows for the end of the countdown; the music starts with it
    TIME_UP_PAUSE: 1.4,

    SCROLL_SPEED: 72,           // how fast the field moves down the screen
    SAFE_ROWS: 15,              // obstacle-free rows at the start of a round
    GAP_MIN: 1, GAP_MAX: 2,     // empty rows between obstacle groups
    LAVA_WEIGHT: 0.65, COLUMN_WEIGHT: 0.2, // remainder = lava pit + column combo
    PIT_WIDTHS: [[1, 3], [2, 4], [3, 3], [4, 1]], // [tiles wide, weight]
    LONG_PIT_CHANCE: 0.3,       // pit is 2 tiles long instead of 1
    SECOND_COLUMN_CHANCE: 0.3,

    BAND_TOP: 172, BAND_BOTTOM: 246, START_Y: 214, // feet y range of the runner band
    FLOOR_LEFT: 31, FLOOR_RIGHT: 209,

    ACCEL_GROUND: 900, ACCEL_AIR: 240, FRICTION_GROUND: 1000, FRICTION_AIR: 90,
    CLIMB_SPEED: 18, DROP_SPEED: 32,

    JUMP_HEIGHT: 14, JUMP_BUFFER: 0.1,
    CLEAR_HEIGHT: 3,            // above this height a jump clears columns
    FIREBALL_CLEAR: 6,          // above this height a jump clears fireballs
    LAVA_INSET: 3,              // forgiving edge on lava tiles

    // Character stats. Size sets the hitbox [half width, depth] used for columns, bumps and fireballs,
    // and weight: heavier runners shove others harder, get shoved less and recover from knocks sooner.
    SIZES: {
      small: { hitbox: [5, 7], weight: 0.8 },
      medium: { hitbox: [6, 8], weight: 1 },
      big: { hitbox: [8, 10], weight: 1.35 },
    },
    // Top side speed. Regular is the original game speed; fast and slow are only slightly off it.
    SPEEDS: { slow: 80, regular: 85, fast: 90 },
    // Jump: air time sets distance (same height for everyone); landLag is the wait before you can jump again.
    JUMPS: {
      regular: { time: 0.8, landLag: 0.12 },
      far: { time: 0.92, landLag: 0.12 },
      agile: { time: 0.8, landLag: 0 },
      heavy: { time: 0.8, landLag: 0.35 },
    },
    CHARACTER_STATS: {
      pikachu: { size: 'medium', speed: 'regular', jump: 'agile' },
      chikorita: { size: 'medium', speed: 'regular', jump: 'regular' },
      eevee: { size: 'small', speed: 'fast', jump: 'regular' },
      poliwhirl: { size: 'big', speed: 'slow', jump: 'heavy' },
      torchic: { size: 'small', speed: 'regular', jump: 'far' },
      // Survival-only roster. Size follows each sprite's body width (small <= 12px, big >= 16px);
      // heavy big ones get slower legs or jumps, light small ones get quicker ones.
      skitty: { size: 'small', speed: 'fast', jump: 'far' },
      quilava: { size: 'small', speed: 'fast', jump: 'agile' },
      meowth: { size: 'small', speed: 'regular', jump: 'agile' },
      togepi: { size: 'small', speed: 'regular', jump: 'agile' },
      aron: { size: 'small', speed: 'regular', jump: 'far' },
      charmeleon: { size: 'medium', speed: 'fast', jump: 'regular' },
      sneasel: { size: 'medium', speed: 'fast', jump: 'regular' },
      totodile: { size: 'medium', speed: 'regular', jump: 'agile' },
      marill: { size: 'medium', speed: 'regular', jump: 'far' },
      squirtle: { size: 'medium', speed: 'regular', jump: 'regular' },
      mudkip: { size: 'medium', speed: 'regular', jump: 'regular' },
      machop: { size: 'medium', speed: 'regular', jump: 'regular' },
      bulbasaur: { size: 'big', speed: 'slow', jump: 'heavy' },
      grovyle: { size: 'big', speed: 'regular', jump: 'heavy' },
      makuhita: { size: 'big', speed: 'slow', jump: 'heavy' },
    },
    COLUMN_INSET: 3,
    COLUMN_KNOCK: 95, COLUMN_STUN: 0.22,
    BUMP_SPEED: 70, BUMP_STUN: 0.15,

    // Groudon sweeps wall to wall (his range matches where runners can stand) and pauses at each end.
    GROUDON_FEET: 318, GROUDON_MIN_X: 31, GROUDON_MAX_X: 209, GROUDON_SPEED: 44,
    GROUDON_END_PAUSE: 0.4,
    ATTACK_MIN: 0.5, ATTACK_MAX: 1.3, WINDUP: 0.3, FIRE_HOLD: 0.35,
    // Barrage: at these round times, once Groudon next reaches a wall he sweeps to the other wall
    // frozen in his attack pose, firing every BARRAGE_INTERVAL seconds.
    BARRAGE_TIMES: [40, 75], BARRAGE_INTERVAL: 0.3,
    FIREBALL_SPEED: 130, FIREBALL_R: 7, FIREBALL_MOUTH: 50,
    // Normal shots are a straight fireball or a diagonal pair, picked at random. From TRIPLE_TIME on, every
    // one is a three-way spread (straight plus both diagonals). Barrage shots are always straight.
    // Diagonals rise at the normal speed while drifting DIAGONAL px sideways per px up.
    FIREBALL_DIAGONAL: 0.6, PAIR_CHANCE: 0.5, TRIPLE_TIME: 60,

    DEATH_TIME: 1.0, RESPAWN_DELAY: 0.4, FALL_TIME: 0.9, FALL_HEIGHT: 230,

    RUN_FRAME_TIME: 0.12, GROUDON_FRAME_TIME: 0.16, FIREBALL_FRAME_TIME: 0.05,

    // Computer players: reaction time (s), jump timing error (px), chance to not notice a hazard at all,
    // and how far ahead they look (px). Each round AI_SMART_COUNT random CPUs get the smart ranges.
    AI_SKILLS: {
      normal: { reaction: [0.12, 0.28], jumpError: [3, 9], miss: [0.04, 0.1], lookAhead: [100, 135] },
      smart: { reaction: [0.09, 0.16], jumpError: [2, 5], miss: [0.015, 0.04], lookAhead: [125, 150] },
    },
    AI_SMART_COUNT: 2,
    AI_JUMP_PREFERENCE: 0.15,   // chance to jump a hazard even when it could be dodged
    // CPUs that go after nearby smaller runners to shove them (hazards still come first): the chance they
    // hunt during each wander stretch instead of just wandering, and how close a victim has to be.
    AI_BULLIES: {
      poliwhirl: { chance: 0.6, range: 80 },
      pikachu: { chance: 0.1, range: 50 },
      chikorita: { chance: 0.1, range: 50 },
    },
    // A runner this many seconds ahead of everyone else is the leader. Bullies bigger than the leader
    // hunt more often and go after the leader from anywhere on the field.
    AI_LEADER_LEAD: 2, AI_LEADER_CHANCE_BONUS: 0.3,
    // Hunting is hit and run: one bump, then the bully backs off for a random AI_BUMP_COOLDOWN seconds
    // (it also gives up on a victim it hasn't reached within AI_CHARGE_TIME).
    AI_BUMP_COOLDOWN: [1.5, 3.5], AI_CHARGE_TIME: 2,

    // Survival: 20 runners, no respawns, no time limit, last one standing wins.
    SURVIVAL_SMART_COUNT: 5,
    SURVIVAL_BARRAGE_EVERY: 35, // after BARRAGE_TIMES, another barrage every this many seconds
    SURVIVAL_SKIP_STEPS: 30,    // simulation steps per frame while skipping to the end after you're out
    FINISH_PAUSE: 1.6,
  };

  const CHARACTERS = ['pikachu', 'chikorita', 'eevee', 'poliwhirl', 'torchic'];
  // Survival select grid, 5 per row, roughly by generation.
  const SURVIVAL_ROSTER = [
    'pikachu', 'bulbasaur', 'charmeleon', 'squirtle', 'eevee',
    'meowth', 'poliwhirl', 'machop', 'chikorita', 'quilava',
    'totodile', 'marill', 'togepi', 'sneasel', 'torchic',
    'grovyle', 'mudkip', 'skitty', 'makuhita', 'aron',
  ];
  const NAMES = {
    pikachu: 'PIKACHU', chikorita: 'CHIKORITA', eevee: 'EEVEE', poliwhirl: 'POLIWHIRL', torchic: 'TORCHIC',
    bulbasaur: 'BULBASAUR', charmeleon: 'CHARMELEON', squirtle: 'SQUIRTLE', meowth: 'MEOWTH', machop: 'MACHOP',
    quilava: 'QUILAVA', totodile: 'TOTODILE', marill: 'MARILL', togepi: 'TOGEPI', sneasel: 'SNEASEL',
    grovyle: 'GROVYLE', mudkip: 'MUDKIP', skitty: 'SKITTY', makuhita: 'MAKUHITA', aron: 'ARON',
  };
  const IDLE_INPUT = { left: false, right: false, up: false, down: false, jumpPressed: false };
  const GROUND = 0, WALL = 1, LAVA = 2;
  const T = CFG.TILE;

  // ------------------------------------------------------------------ helpers

  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const between = (g, range) => lerp(range[0], range[1], g.rng());
  const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

  function weighted(g, pairs) {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let r = g.rng() * total;
    for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
    return pairs[pairs.length - 1][0];
  }

  // ------------------------------------------------------------------ field

  // World y grows upward from the bottom of the screen; row i spans world y [i*T, (i+1)*T).
  const worldY = (g, sy) => g.scroll + (CFG.H - sy);
  const rowTop = (g, i) => CFG.H + g.scroll - (i + 1) * T;

  function kindAt(g, c, i) {
    if (c < 0 || c >= CFG.COLS) return WALL;
    const row = g.rows[i];
    if (!row) return c === 0 || c === CFG.COLS - 1 ? WALL : GROUND;
    return row.cells[c];
  }

  // Obstacle kind under a screen point (only inside the floor), or GROUND.
  function hazardAt(g, x, sy) {
    const c = Math.floor(x / T);
    if (c < 1 || c > CFG.COLS - 2) return GROUND;
    return kindAt(g, c, Math.floor(worldY(g, sy) / T));
  }

  function lavaUnderFeet(g, x, y) {
    const d = CFG.LAVA_INSET, fy = y - 2;
    return hazardAt(g, x, fy) === LAVA && hazardAt(g, x - d, fy) === LAVA && hazardAt(g, x + d, fy) === LAVA &&
      hazardAt(g, x, fy - d) === LAVA && hazardAt(g, x, fy + d) === LAVA;
  }

  function resetField(g) {
    g.scroll = 0;
    g.rows = [];
    g.pending = {};
    g.nextGroupRow = CFG.SAFE_ROWS;
    ensureRows(g);
  }

  function ensureRows(g) {
    const top = Math.floor((g.scroll + CFG.H) / T) + 2;
    while (g.rows.length <= top) generateRow(g);
  }

  function generateRow(g) {
    const i = g.rows.length;
    const cells = new Uint8Array(CFG.COLS);
    const alt = new Uint8Array(CFG.COLS);
    cells[0] = cells[CFG.COLS - 1] = WALL;
    for (let c = 1; c < CFG.COLS - 1; c++) alt[c] = g.rng() < 0.06 ? 1 + (g.rng() < 0.5 ? 0 : 1) : 0;
    for (const [c, k] of g.pending[i] || []) cells[c] = k;
    delete g.pending[i];
    if (i >= g.nextGroupRow) placeGroup(g, i, cells);
    g.rows.push({ cells, alt, tiles: null });
  }

  function placeGroup(g, i, cells) {
    const r = g.rng();
    let len = 1;
    if (r < CFG.LAVA_WEIGHT) len = addPit(g, i, cells);
    else if (r < CFG.LAVA_WEIGHT + CFG.COLUMN_WEIGHT) addColumns(g, cells, g.rng() < CFG.SECOND_COLUMN_CHANCE ? 2 : 1);
    else { len = addPit(g, i, cells); addColumns(g, cells, 1); }
    g.nextGroupRow = i + len + CFG.GAP_MIN + Math.floor(g.rng() * (CFG.GAP_MAX - CFG.GAP_MIN + 1));
  }

  function addPit(g, i, cells) {
    const w = weighted(g, CFG.PIT_WIDTHS);
    const len = g.rng() < CFG.LONG_PIT_CHANCE ? 2 : 1;
    const c0 = 1 + Math.floor(g.rng() * (CFG.COLS - 2 - w + 1));
    for (let c = c0; c < c0 + w; c++) {
      cells[c] = LAVA;
      if (len === 2) (g.pending[i + 1] = g.pending[i + 1] || []).push([c, LAVA]);
    }
    return len;
  }

  function addColumns(g, cells, count) {
    for (let n = 0; n < count; n++) {
      for (let tries = 0; tries < 12; tries++) {
        const c = 2 + Math.floor(g.rng() * (CFG.COLS - 4));
        if (cells[c] === GROUND && cells[c - 1] !== WALL && cells[c + 1] !== WALL) { cells[c] = WALL; break; }
      }
    }
  }

  // N, NE, E, SE, S, SW, W, NW as (dc, di, bit); "north" is the next row up.
  const NEIGHBOURS = [[0, 1, 1], [1, 1, 2], [1, 0, 4], [1, -1, 8], [0, -1, 16], [-1, -1, 32], [-1, 0, 64], [-1, 1, 128]];

  function sameKind(kind, other) {
    if (kind === GROUND) return other !== WALL; // the tileset treats lava as ground for ground tiles
    return kind === other;
  }

  function rowTiles(g, i, maskToPattern) {
    const row = g.rows[i];
    if (row.tiles) return row.tiles;
    const tiles = new Uint8Array(CFG.COLS);
    for (let c = 0; c < CFG.COLS; c++) {
      const kind = row.cells[c];
      let mask = 0;
      for (const [dc, di, bit] of NEIGHBOURS) if (sameKind(kind, kindAt(g, c + dc, i + di))) mask |= bit;
      tiles[c] = maskToPattern[mask];
    }
    if (g.rows[i + 1]) row.tiles = tiles; // only cache once the row above exists
    return tiles;
  }

  // ------------------------------------------------------------------ entities

  function makeRunner(g, char, isPlayer, x, smart) {
    const stats = CFG.CHARACTER_STATS[char], size = CFG.SIZES[stats.size];
    return {
      char, isPlayer, x, y: CFG.START_Y + Math.round(g.rng() * 16 - 8),
      hw: size.hitbox[0], hd: size.hitbox[1], weight: size.weight,
      speed: CFG.SPEEDS[stats.speed], jump: CFG.JUMPS[stats.jump],
      vx: 0, h: 0, jumpT: -1, landLag: 0, stun: 0, jumpBuffer: 0,
      state: 'run', stateT: 0, fallT: 0, animT: g.rng(),
      score: 0, deaths: 0, causes: { lava: 0, fire: 0 },
      ai: isPlayer && !g.auto ? null : makeAi(g, char, smart),
    };
  }

  function makeAi(g, char, smart) {
    const ranges = CFG.AI_SKILLS[smart ? 'smart' : 'normal'];
    const skill = (range) => (g.evenAi ? lerp(range[0], range[1], 0.5) : between(g, range));
    return {
      smart: !!smart, bully: CFG.AI_BULLIES[char] || null,
      reaction: skill(ranges.reaction),
      jumpError: skill(ranges.jumpError),
      miss: skill(ranges.miss),
      lookAhead: skill(ranges.lookAhead),
      targetX: null, targetY: CFG.START_Y, wanderIn: 0, careless: false,
      hunting: false, chargeT: 0, bumpCooldown: 0,
      seen: {}, landingChecked: false,
    };
  }

  function makeGroudon(g) {
    return {
      x: 120, dir: g.rng() < 0.5 ? -1 : 1, pause: 0, state: 'walk', t: 0, attackIn: 1.2, animT: 0, attacks: 0,
      barrages: 0, fireIn: 0, volley: [0],
    };
  }

  // Score is whole seconds on the field, rounded up.
  const points = (r) => Math.ceil(r.score - 1e-6);

  function kill(g, r, cause) {
    g.sounds.push({ name: 'burn', cpu: !r.isPlayer });
    r.state = 'dying';
    r.stateT = 0;
    r.deaths++;
    r.causes[cause]++;
    r.jumpT = -1;
    r.h = 0;
    r.vx = 0;
  }

  function startFall(g, r) {
    r.state = 'falling';
    r.fallT = 0;
    r.stateT = 0;
    r.x = lerp(CFG.FLOOR_LEFT, CFG.FLOOR_RIGHT, g.rng());
    r.y = CFG.START_Y + Math.round(g.rng() * 20 - 10);
    r.h = CFG.FALL_HEIGHT;
    r.vx = 0;
    r.stun = 0;
    r.jumpT = -1;
    if (r.ai) { r.ai.targetX = r.x; r.ai.landingChecked = false; }
  }

  // ------------------------------------------------------------------ game

  function createGame(opts) {
    opts = opts || {};
    const g = {
      rng: makeRng(opts.seed !== undefined ? opts.seed : (Date.now() & 0x7fffffff)),
      auto: !!opts.auto,
      evenAi: !!opts.evenAi, // every CPU gets the same middle normal skill, no smart ones (for balance testing)
      mode: opts.mode || 'trial', menu: opts.mode === 'survival' ? 1 : 0,
      phase: opts.mode === 'survival' ? 'sselect' : opts.mode === 'trial' ? 'select' : 'mode',
      phaseT: 0, tick: 0, time: 0,
      selected: Math.max(0, CHARACTERS.indexOf(opts.char)),
      sSelected: Math.max(0, SURVIVAL_ROSTER.indexOf(opts.char)),
      skipping: false,
      runners: [], fireballs: [], fireballId: 0,
      groudon: null, leader: null,
      sounds: [], // sounds started during the latest update(), for the browser shell to play
      timeLeft: CFG.ROUND_TIME,
      results: null,
    };
    g.groudon = makeGroudon(g);
    resetField(g);
    if (g.auto) (g.mode === 'survival' ? startSurvival(g) : startRound(g));
    return g;
  }

  function startRound(g) {
    resetField(g);
    g.fireballs = [];
    g.leader = null;
    g.groudon = makeGroudon(g);
    g.time = 0;
    g.timeLeft = CFG.ROUND_TIME;
    const player = CHARACTERS[g.selected];
    const order = CHARACTERS.slice();
    for (let i = order.length - 1; i > 0; i--) { // shuffle starting lanes
      const j = Math.floor(g.rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // order is already shuffled, so its first CPUs are a random pick for the smart ones
    const smart = g.evenAi ? [] : order.filter((char) => char !== player).slice(0, CFG.AI_SMART_COUNT);
    const span = CFG.FLOOR_RIGHT - CFG.FLOOR_LEFT;
    g.runners = CHARACTERS.map((char) => makeRunner(g, char, char === player,
      Math.round(CFG.FLOOR_LEFT + span * (order.indexOf(char) + 0.5) / order.length), smart.includes(char)));
    g.phase = 'countdown';
    g.phaseT = 0;
  }

  function startSurvival(g) {
    resetField(g);
    g.fireballs = [];
    g.groudon = makeGroudon(g);
    g.time = 0;
    g.leader = null;
    g.skipping = false;
    g.winner = null;
    const player = SURVIVAL_ROSTER[g.sSelected];
    const order = SURVIVAL_ROSTER.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(g.rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const smart = g.evenAi ? [] : order.filter((char) => char !== player).slice(0, CFG.SURVIVAL_SMART_COUNT);
    // Starting slots: 7 lanes by 3 staggered rows.
    const span = CFG.FLOOR_RIGHT - CFG.FLOOR_LEFT - 12;
    g.runners = order.map((char, k) => {
      const col = k % 7, row = Math.floor(k / 7);
      const x = CFG.FLOOR_LEFT + 6 + span * (col + (row % 2 ? 0.75 : 0.25)) / 7;
      const r = makeRunner(g, char, char === player, Math.round(x), smart.includes(char));
      r.y = CFG.BAND_TOP + 10 + row * 28;
      r.place = 0; // finishing place, set when knocked out (or 1 for the last one standing)
      return r;
    });
    g.phase = 'countdown';
    g.phaseT = 0;
  }

  function finishSurvival(g) {
    g.results = g.runners.slice().sort((a, b) => a.place - b.place)
      .map((r) => ({ char: r.char, isPlayer: r.isPlayer, rank: r.place, time: r.score }));
    g.phase = 'results';
    g.phaseT = 0;
  }

  // Menu backdrop: the field drifts by while Groudon paces.
  function idleStep(g, dt) {
    g.scroll += 16 * dt;
    ensureRows(g);
    updateGroudon(g, dt, false);
  }

  function finishRound(g) {
    const sorted = g.runners.slice().sort((a, b) => points(b) - points(a));
    let rank = 0;
    g.results = sorted.map((r, k) => {
      if (k === 0 || points(sorted[k - 1]) !== points(r)) rank = k + 1;
      return { char: r.char, isPlayer: r.isPlayer, points: points(r), deaths: r.deaths, rank };
    });
    g.phase = 'results';
    g.phaseT = 0;
  }

  // input: { left, right, up, down, jumpPressed, leftPressed, rightPressed, upPressed, downPressed }
  function update(g, dt, input) {
    g.sounds.length = 0;
    g.tick++;
    g.phaseT += dt;

    if (g.phase === 'mode') {
      if (input.upPressed || input.downPressed || input.leftPressed || input.rightPressed) {
        g.menu = 1 - g.menu;
        g.sounds.push({ name: 'cursor' });
      }
      idleStep(g, dt);
      if (input.jumpPressed) {
        g.sounds.push({ name: 'confirm' });
        g.mode = g.menu === 0 ? 'trial' : 'survival';
        g.phase = g.mode === 'trial' ? 'select' : 'sselect';
        g.phaseT = 0;
      }
      return;
    }
    if (g.phase === 'sselect') {
      const n = SURVIVAL_ROSTER.length;
      if (input.leftPressed) g.sSelected = (g.sSelected + n - 1) % n;
      if (input.rightPressed) g.sSelected = (g.sSelected + 1) % n;
      if (input.upPressed) g.sSelected = (g.sSelected + n - 5) % n;
      if (input.downPressed) g.sSelected = (g.sSelected + 5) % n;
      if (input.leftPressed || input.rightPressed || input.upPressed || input.downPressed) g.sounds.push({ name: 'cursor' });
      idleStep(g, dt);
      if (input.jumpPressed) { g.sounds.push({ name: 'confirm' }); startSurvival(g); }
      return;
    }
    if (g.phase === 'select') {
      if (input.leftPressed) g.selected = (g.selected + CHARACTERS.length - 1) % CHARACTERS.length;
      if (input.rightPressed) g.selected = (g.selected + 1) % CHARACTERS.length;
      if (input.leftPressed || input.rightPressed) g.sounds.push({ name: 'cursor' });
      idleStep(g, dt);
      if (input.jumpPressed) { g.sounds.push({ name: 'confirm' }); startRound(g); }
      return;
    }
    if (g.phase === 'results') {
      if (input.jumpPressed && g.phaseT > 0.8) {
        g.sounds.push({ name: 'confirm' });
        g.phase = 'mode';
        g.phaseT = 0;
        resetField(g);
      }
      return;
    }
    if (g.phase === 'countdown') {
      for (const r of g.runners) r.animT += dt;
      if (g.phaseT >= CFG.COUNTDOWN) { g.phase = 'play'; g.phaseT = 0; }
      return;
    }
    if (g.phase === 'timeup') {
      if (g.phaseT >= CFG.TIME_UP_PAUSE) finishRound(g);
      return;
    }
    if (g.phase === 'finish') {
      if (g.phaseT >= CFG.FINISH_PAUSE) finishSurvival(g);
      return;
    }

    if (g.skipping) {
      for (let k = 0; k < CFG.SURVIVAL_SKIP_STEPS && g.phase === 'play'; k++) playStep(g, dt, IDLE_INPUT);
      g.sounds.length = 0; // fast-forwarding: 30 steps' worth of sounds would just be noise
    } else {
      playStep(g, dt, input);
    }
  }

  function playStep(g, dt, input) {
    g.time += dt;
    g.scroll += CFG.SCROLL_SPEED * dt;
    ensureRows(g);
    updateGroudon(g, dt, true);
    g.leader = findLeader(g);

    for (const r of g.runners) updateRunner(g, r, r.ai ? aiThink(g, r, dt) : input, dt);
    for (const r of g.runners) {
      if (r.state === 'run' && r.h <= CFG.CLEAR_HEIGHT) collideColumns(g, r);
    }
    collideRunners(g);
    for (const r of g.runners) {
      if (r.state !== 'run') continue;
      r.x = clamp(r.x, CFG.FLOOR_LEFT, CFG.FLOOR_RIGHT);
      r.y = clamp(r.y, CFG.BAND_TOP, CFG.BAND_BOTTOM);
      if (r.jumpT < 0 && lavaUnderFeet(g, r.x, r.y)) kill(g, r, 'lava');
    }
    updateFireballs(g, dt);
    for (const r of g.runners) if (r.state === 'run') r.score += dt;

    if (g.mode === 'survival') {
      survivalCheck(g, input);
      return;
    }
    g.timeLeft = Math.max(0, CFG.ROUND_TIME - g.time);
    if (g.time >= CFG.ROUND_TIME - 1e-6) { g.timeLeft = 0; g.phase = 'timeup'; g.phaseT = 0; }
  }

  // Give anyone knocked out this step their place, end the round at one (or zero) left,
  // and let a knocked-out player skip ahead.
  function survivalCheck(g, input) {
    const alive = g.runners.filter((r) => r.state === 'run');
    for (const r of g.runners) if (r.state === 'dying' && !r.place) r.place = alive.length + 1;
    if (alive.length <= 1) {
      if (alive.length === 1) alive[0].place = 1;
      g.winner = alive[0] || null;
      g.skipping = false;
      g.phase = 'finish';
      g.phaseT = 0;
      return;
    }
    const player = g.runners.find((r) => r.isPlayer);
    if (player && player.place && input.jumpPressed) g.skipping = true;
  }

  function updateRunner(g, r, input, dt) {
    r.animT += dt;
    if (r.state === 'dying') {
      r.stateT += dt;
      if (r.stateT >= CFG.DEATH_TIME) { r.state = g.mode === 'survival' ? 'out' : 'dead'; r.stateT = 0; }
      return;
    }
    if (r.state === 'out') return;
    if (r.state === 'dead') {
      r.stateT += dt;
      if (r.stateT >= CFG.RESPAWN_DELAY) startFall(g, r);
      return;
    }

    const airborne = r.state === 'falling' || r.jumpT >= 0;
    let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let vdir = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (r.stun > 0) { r.stun -= dt; dir = 0; vdir = 0; }
    if (dir) r.vx += dir * (airborne ? CFG.ACCEL_AIR : CFG.ACCEL_GROUND) * dt;
    else r.vx = approach(r.vx, 0, (airborne || r.stun > 0 ? CFG.FRICTION_AIR : CFG.FRICTION_GROUND) * dt);
    if (r.stun <= 0) r.vx = clamp(r.vx, -r.speed, r.speed);
    r.x += r.vx * dt;
    if (r.x < CFG.FLOOR_LEFT || r.x > CFG.FLOOR_RIGHT) { r.x = clamp(r.x, CFG.FLOOR_LEFT, CFG.FLOOR_RIGHT); r.vx = 0; }
    if (vdir) r.y += (vdir < 0 ? -CFG.CLIMB_SPEED : CFG.DROP_SPEED) * dt;
    r.y = clamp(r.y, CFG.BAND_TOP, CFG.BAND_BOTTOM);

    r.jumpBuffer = input.jumpPressed ? CFG.JUMP_BUFFER : Math.max(0, r.jumpBuffer - dt);

    if (r.state === 'falling') {
      r.fallT += dt;
      const t = Math.min(1, r.fallT / CFG.FALL_TIME);
      r.h = CFG.FALL_HEIGHT * (1 - t * t);
      if (t >= 1) { r.state = 'run'; r.h = 0; r.landLag = r.jump.landLag; r.jumpBuffer = 0; }
      return;
    }
    if (r.jumpT >= 0) {
      r.jumpT += dt;
      const t = r.jumpT / r.jump.time;
      if (t >= 1) { r.jumpT = -1; r.h = 0; r.landLag = r.jump.landLag; }
      else r.h = 4 * CFG.JUMP_HEIGHT * t * (1 - t);
    } else {
      r.landLag = Math.max(0, r.landLag - dt);
      if (r.jumpBuffer > 0 && r.landLag <= 0 && r.stun <= 0) { r.jumpT = 0; r.jumpBuffer = 0; }
    }
  }

  // Broken columns: they scroll into you, shove you back down the band and off to the side.
  function collideColumns(g, r) {
    const hw = r.hw, inset = CFG.COLUMN_INSET;
    const fx0 = r.x - hw, fx1 = r.x + hw;
    const c0 = Math.max(1, Math.floor(fx0 / T)), c1 = Math.min(CFG.COLS - 2, Math.floor(fx1 / T));
    const i0 = Math.floor(worldY(g, r.y) / T), i1 = Math.floor(worldY(g, r.y - r.hd) / T);
    for (let i = i0; i <= i1; i++) {
      for (let c = c0; c <= c1; c++) {
        if (kindAt(g, c, i) !== WALL) continue;
        const x0 = c * T + inset, x1 = (c + 1) * T - inset;
        const top = rowTop(g, i) + inset, bottom = rowTop(g, i) + T - inset;
        const ry0 = r.y - r.hd;
        const penX = Math.min(r.x + hw - x0, x1 - (r.x - hw));
        const penY = Math.min(r.y - top, bottom - ry0);
        if (penX <= 0 || penY <= 0) continue;
        const away = r.x < (x0 + x1) / 2 ? -1 : 1;
        if (penX < penY) {
          r.x += away * penX;
          r.vx = 0;
        } else if (r.y - r.hd / 2 < (top + bottom) / 2) {
          r.y = top; // landed on its far side: stop at its edge
        } else {
          r.y = bottom + r.hd;
          r.vx = (away * CFG.COLUMN_KNOCK) / r.weight;
          r.stun = CFG.COLUMN_STUN / r.weight;
          if (r.y > CFG.BAND_BOTTOM) { // pinned against the back of the band: knocked sideways instead
            r.y = CFG.BAND_BOTTOM;
            r.x = away < 0 ? x0 - hw : x1 + hw;
            r.vx = (away * CFG.COLUMN_KNOCK * 1.5) / r.weight;
          }
        }
      }
    }
  }

  // The runner at least AI_LEADER_LEAD seconds ahead of everyone else, if any.
  function findLeader(g) {
    let first = null, second = -Infinity;
    for (const r of g.runners) {
      if (!first || r.score > first.score) {
        if (first) second = first.score;
        first = r;
      } else {
        second = Math.max(second, r.score);
      }
    }
    return first && first.score - second >= CFG.AI_LEADER_LEAD ? first : null;
  }

  // Side contact bounces both runners apart; front-to-back contact pushes the runner behind back.
  function collideRunners(g) {
    const active = g.runners.filter((r) => r.state === 'run');
    for (let pass = 0; pass < 3; pass++) {
      for (let m = 0; m < active.length; m++) {
        for (let n = m + 1; n < active.length; n++) {
          const a = active[m], b = active[n];
          const w = a.hw + b.hw, h = (a.hd + b.hd) / 2;
          const dx = b.x - a.x, dy = b.y - a.y;
          const ox = w - Math.abs(dx), oy = h - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          if (ox / w < oy / h) {
            const s = dx === 0 ? (g.rng() < 0.5 ? -1 : 1) : Math.sign(dx);
            const total = a.weight + b.weight; // the lighter runner gives way more
            a.x -= (s * ox * b.weight) / total;
            b.x += (s * ox * a.weight) / total;
            if (pass === 0) {
              a.vx = (-s * CFG.BUMP_SPEED * 2 * b.weight) / total;
              b.vx = (s * CFG.BUMP_SPEED * 2 * a.weight) / total;
              a.stun = CFG.BUMP_STUN / a.weight;
              b.stun = CFG.BUMP_STUN / b.weight;
            }
          } else {
            const rear = dy > 0 ? b : a, front = rear === a ? b : a;
            rear.y += oy;
            if (rear.y > CFG.BAND_BOTTOM) {
              rear.y = CFG.BAND_BOTTOM;
              const s = rear.x === front.x ? (g.rng() < 0.5 ? -1 : 1) : Math.sign(rear.x - front.x);
              rear.x += s * 2;
              rear.vx = (s * CFG.BUMP_SPEED) / rear.weight;
              rear.stun = CFG.BUMP_STUN / rear.weight;
            }
          }
        }
      }
    }
  }

  // dirs: -1 / 0 / 1 for diagonal left / straight / diagonal right, one fireball each.
  function shoot(g, d, dirs) {
    g.sounds.push({ name: 'flame' });
    for (const k of dirs) {
      g.fireballs.push({
        id: ++g.fireballId, x: d.x, y: CFG.GROUDON_FEET - CFG.FIREBALL_MOUTH, t: 0,
        vx: k * CFG.FIREBALL_DIAGONAL * CFG.FIREBALL_SPEED,
      });
    }
  }

  function pickVolley(g) {
    if (g.time >= CFG.TRIPLE_TIME) return [-1, 0, 1];
    return g.rng() < CFG.PAIR_CHANCE ? [-1, 1] : [0];
  }

  function updateGroudon(g, dt, attacking) {
    const d = g.groudon;
    const atWall = d.x <= CFG.GROUDON_MIN_X || d.x >= CFG.GROUDON_MAX_X;
    d.t += dt;
    const times = CFG.BARRAGE_TIMES;
    const nextBarrage = d.barrages < times.length ? times[d.barrages]
      : g.mode === 'survival' ? times[times.length - 1] + CFG.SURVIVAL_BARRAGE_EVERY * (d.barrages - times.length + 1)
        : Infinity;
    if (d.state === 'walk' && attacking && atWall && g.time >= nextBarrage) {
      d.state = 'barrage';
      d.barrages++;
      d.dir = d.x <= CFG.GROUDON_MIN_X ? 1 : -1;
      d.pause = 0;
      d.fireIn = 0;
    }
    if (d.state === 'barrage') {
      d.fireIn -= dt;
      if (d.fireIn <= 0) { shoot(g, d, [0]); d.fireIn += CFG.BARRAGE_INTERVAL; }
      d.x += d.dir * CFG.GROUDON_SPEED * dt;
      if (d.x <= CFG.GROUDON_MIN_X || d.x >= CFG.GROUDON_MAX_X) { // reached the other wall: back to normal
        d.x = clamp(d.x, CFG.GROUDON_MIN_X, CFG.GROUDON_MAX_X);
        d.dir = -d.dir;
        d.pause = CFG.GROUDON_END_PAUSE;
        d.state = 'walk';
        d.attackIn = lerp(CFG.ATTACK_MIN, CFG.ATTACK_MAX, g.rng());
      }
    } else if (d.state === 'walk') {
      if (d.pause > 0) {
        d.pause -= dt;
      } else {
        d.x += d.dir * CFG.GROUDON_SPEED * dt;
        d.animT += dt;
        if (d.x <= CFG.GROUDON_MIN_X || d.x >= CFG.GROUDON_MAX_X) {
          d.x = clamp(d.x, CFG.GROUDON_MIN_X, CFG.GROUDON_MAX_X);
          d.dir = d.x <= CFG.GROUDON_MIN_X ? 1 : -1;
          d.pause = CFG.GROUDON_END_PAUSE;
        }
      }
      d.attackIn -= dt;
      if (attacking && d.attackIn <= 0) { d.state = 'windup'; d.t = 0; d.attacks++; d.volley = pickVolley(g); }
    } else if (d.state === 'windup') {
      if (d.t >= CFG.WINDUP) {
        shoot(g, d, d.volley);
        d.state = 'fire';
        d.t = 0;
      }
    } else if (d.t >= CFG.FIRE_HOLD) {
      d.state = 'walk';
      d.t = 0;
      d.attackIn = lerp(CFG.ATTACK_MIN, CFG.ATTACK_MAX, g.rng());
    }
  }

  function updateFireballs(g, dt) {
    g.fireballs = g.fireballs.filter((fb) => {
      fb.t += dt;
      fb.y -= CFG.FIREBALL_SPEED * dt;
      fb.x += fb.vx * dt;
      for (const r of g.runners) {
        if (r.state !== 'run' || r.h > CFG.FIREBALL_CLEAR) continue;
        const dx = r.x - fb.x, dy = r.y - r.hd * 0.75 - fb.y, reach = CFG.FIREBALL_R + r.hw;
        if (dx * dx + dy * dy < reach * reach) { kill(g, r, 'fire'); return false; }
      }
      return fb.y > -20 && fb.x > -20 && fb.x < CFG.W + 20;
    });
  }

  // ------------------------------------------------------------------ computer players

  // First obstacle straight ahead of a lane, as distance from the feet and how long it runs.
  function laneScan(g, x, y, dist, halfWidth) {
    const hw = halfWidth || 5;
    const blocked = (sy) => hazardAt(g, x - hw, sy) || hazardAt(g, x, sy) || hazardAt(g, x + hw, sy);
    for (let d = 0; d <= dist; d += 3) {
      const kind = blocked(y - d);
      if (!kind) continue;
      let len = 0;
      while (len < 90 && blocked(y - d - len)) len += 3;
      return { d, len, kind, id: Math.floor(worldY(g, y - d) / T) }; // obstacle groups never share a row
    }
    return null;
  }

  function findDodgeX(g, r, scan) {
    const time = scan.d / CFG.SCROLL_SPEED - 0.05;
    const side = g.rng() < 0.5 ? -1 : 1;
    for (let k = 1; k <= 24; k++) {
      for (const s of [side, -side]) {
        const x = r.x + s * k * 6;
        if (x < CFG.FLOOR_LEFT + 2 || x > CFG.FLOOR_RIGHT - 2) continue;
        if (Math.abs(x - r.x) / (r.speed * 0.85) > time) return null;
        if (!laneScan(g, x, r.y, scan.d + scan.len + 20, r.hw + 1)) return x;
      }
    }
    return null;
  }

  // A bully's victim: the leader if they're smaller than the bully, otherwise the nearest smaller runner in range.
  function pickVictim(g, r) {
    const leader = g.leader;
    if (leader && leader.state === 'run' && leader.weight < r.weight) return leader;
    let victim = null, best = r.ai.bully.range;
    for (const o of g.runners) {
      if (o === r || o.state !== 'run' || o.weight >= r.weight) continue;
      const dist = Math.hypot(o.x - r.x, o.y - r.y);
      if (dist < best) { best = dist; victim = o; }
    }
    return victim;
  }

  function steer(g, inp, r, tx) {
    const dx = tx - r.x;
    if (Math.abs(dx) <= 2 || Math.abs(dx) < Math.abs(r.vx) * 0.06) return;
    const dir = Math.sign(dx);
    // Don't sidestep into lava that's right beside you (unless being careless).
    if (r.state === 'run' && !r.ai.careless) {
      for (let k = 4; k <= 12; k += 4) {
        if (hazardAt(g, r.x + dir * k, r.y - 2) === LAVA || hazardAt(g, r.x + dir * k, r.y - 8) === LAVA) return;
      }
    }
    if (dir > 0) inp.right = true; else inp.left = true;
  }

  function aiThink(g, r, dt) {
    const ai = r.ai;
    const inp = { left: false, right: false, up: false, down: false, jumpPressed: false };
    if (r.state === 'dying' || r.state === 'dead' || r.state === 'out') return inp;

    if (r.state === 'falling') {
      if (!ai.landingChecked && r.fallT >= ai.reaction) {
        ai.landingChecked = true;
        // The ground that will be under the shadow on landing is currently further up the screen.
        const sy = r.y - CFG.SCROLL_SPEED * (CFG.FALL_TIME - r.fallT);
        if (g.rng() > ai.miss * 2 && laneScan(g, r.x, sy, 18, r.hw)) {
          for (let k = 1; k <= 12; k++) {
            const x = r.x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 10;
            if (x > CFG.FLOOR_LEFT && x < CFG.FLOOR_RIGHT && !laneScan(g, x, sy, 18, r.hw)) { ai.targetX = x; break; }
          }
        }
      }
      steer(g, inp, r, ai.targetX);
      return inp;
    }

    ai.wanderIn -= dt;
    if (ai.wanderIn <= 0 || ai.targetX === null) {
      ai.wanderIn = lerp(1.2, 3.5, g.rng());
      ai.targetX = lerp(CFG.FLOOR_LEFT + 6, CFG.FLOOR_RIGHT - 6, g.rng());
      ai.targetY = lerp(CFG.BAND_TOP + 6, CFG.BAND_BOTTOM - 20, g.rng());
      ai.careless = g.rng() < ai.miss;
      const chasesLeader = g.leader && g.leader.weight < r.weight;
      ai.hunting = !!ai.bully && g.rng() < ai.bully.chance + (chasesLeader ? CFG.AI_LEADER_CHANCE_BONUS : 0);
    }

    // Hunting bullies charge their victim for one bump, then step away and leave everyone alone until
    // the cooldown runs out. The hazard and fireball dodging below overrides this whenever something is
    // in the way.
    ai.bumpCooldown -= dt;
    const victim = ai.hunting && ai.bumpCooldown <= 0 ? pickVictim(g, r) : null;
    if (!victim) {
      ai.chargeT = 0;
    } else {
      const side = Math.sign(victim.x - r.x || 1);
      const touching = Math.abs(victim.x - r.x) <= r.hw + victim.hw + 2 && Math.abs(victim.y - r.y) <= (r.hd + victim.hd) / 2 + 2;
      ai.chargeT += dt;
      if (touching || ai.chargeT > CFG.AI_CHARGE_TIME) {
        ai.bumpCooldown = between(g, CFG.AI_BUMP_COOLDOWN);
        ai.chargeT = 0;
        ai.targetX = clamp(r.x - side * 24, CFG.FLOOR_LEFT + 6, CFG.FLOOR_RIGHT - 6);
      } else {
        ai.targetX = victim.x + side * 6; // aim a little past them to ram through
        ai.targetY = victim.y;
      }
    }

    const notice = (id) => {
      let s = ai.seen[id];
      if (!s) s = ai.seen[id] = { at: g.time, ignore: g.rng() < ai.miss, offset: (g.rng() * 2 - 1) * ai.jumpError, plan: null };
      return s.ignore || g.time - s.at < ai.reaction ? null : s;
    };

    const scan = laneScan(g, r.x, r.y, ai.lookAhead, r.hw - 1);
    if (scan) {
      const s = notice('h' + scan.id);
      if (s) {
        if (!s.plan) {
          s.dodgeX = g.rng() < CFG.AI_JUMP_PREFERENCE ? null : findDodgeX(g, r, scan);
          s.plan = s.dodgeX === null ? 'jump' : 'dodge';
        }
        const ideal = Math.max(2, (r.jump.time * CFG.SCROLL_SPEED - scan.len) / 2);
        if (s.plan === 'dodge' && scan.d < ideal + 4) s.plan = 'jump'; // dodge didn't work out, jump instead
        if (s.plan === 'dodge') {
          ai.targetX = s.dodgeX;
          ai.wanderIn = Math.max(ai.wanderIn, 0.6);
        } else if (r.jumpT < 0 && scan.d <= ideal + s.offset) {
          inp.jumpPressed = true;
        }
      }
    }

    // Fireballs coming up from behind, and Groudon winding up right underneath; x is where each one
    // will be when it reaches this runner's row.
    const aim = r.y - r.hd * 0.75;
    const threats = g.fireballs.map((fb) => {
      const dy = fb.y - aim;
      return { id: 'f' + fb.id, x: fb.x + (fb.vx * dy) / CFG.FIREBALL_SPEED, dy };
    });
    if (g.groudon.state === 'windup') {
      const dy = CFG.GROUDON_FEET - CFG.FIREBALL_MOUTH - aim;
      for (const k of g.groudon.volley) {
        threats.push({ id: 'w' + g.groudon.attacks + ':' + k, x: g.groudon.x + k * CFG.FIREBALL_DIAGONAL * dy, dy: dy + 40 });
      }
    }
    for (const th of threats) {
      const reach = CFG.FIREBALL_R + r.hw;
      if (th.dy <= 0 || th.dy > 140 || Math.abs(th.x - r.x) > reach + 2) continue;
      const s = notice(th.id);
      if (!s) continue;
      const tHit = th.dy / CFG.FIREBALL_SPEED;
      const need = reach + 3 - Math.abs(th.x - r.x);
      if (need / r.speed < tHit - 0.06) {
        let side = r.x < th.x ? -1 : 1;
        if (r.x + side * (need + 6) < CFG.FLOOR_LEFT || r.x + side * (need + 6) > CFG.FLOOR_RIGHT) side = -side;
        ai.targetX = r.x + side * (need + 6);
        ai.wanderIn = Math.max(ai.wanderIn, 0.5);
      } else if (r.jumpT < 0 && tHit < 0.35 + s.offset / 40) {
        inp.jumpPressed = true;
      }
    }

    if (r.y > ai.targetY + 3) inp.up = true;
    else if (r.y < ai.targetY - 3) inp.down = true;
    steer(g, inp, r, ai.targetX);
    return inp;
  }

  // ------------------------------------------------------------------ rendering

  // 3x5 pixel font, rows top to bottom.
  const GLYPHS = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001011001111',
    '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001010010',
    '8': '111101111101111', '9': '111101111001111',
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
    E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
    I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
    Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111',
    '.': '000000000000010', ':': '000010000010000', '!': '010010010000010', "'": '010010000000000',
    '-': '000000111000000', '<': '001010100010001', '>': '100010001010100', '/': '001001010100100', '(': '010100100100010', ')': '010001001001010',
    '?': '111001010000010', ' ': '000000000000000',
  };

  function textWidth(str, scale) { return str.length * 4 * (scale || 1) - (scale || 1); }

  function drawText(ctx, str, x, y, color, scale, shadow) {
    scale = scale || 1;
    if (shadow !== null) drawGlyphs(ctx, str, x + scale, y + scale, shadow || '#101020', scale);
    drawGlyphs(ctx, str, x, y, color, scale);
  }

  function drawGlyphs(ctx, str, x, y, color, scale) {
    ctx.fillStyle = color;
    for (let k = 0; k < str.length; k++) {
      const glyph = GLYPHS[str[k].toUpperCase()] || GLYPHS['?'];
      for (let p = 0; p < 15; p++) {
        if (glyph[p] === '1') ctx.fillRect(x + k * 4 * scale + (p % 3) * scale, y + Math.floor(p / 3) * scale, scale, scale);
      }
    }
  }

  function drawTextCentered(ctx, str, cx, y, color, scale, shadow) {
    drawText(ctx, str, Math.round(cx - textWidth(str, scale) / 2), y, color, scale, shadow);
  }

  // PMD-style menu window.
  function drawWindow(ctx, x, y, w, h) {
    ctx.fillStyle = '#080818'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#e8f0f8'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#6880c0'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = '#182878'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  }

  function frameOf(name, k) {
    const list = root.ASSET_DATA.sprites[name];
    return list[((k % list.length) + list.length) % list.length];
  }

  // Bottom-center anchored sprite.
  function drawFrame(ctx, img, f, x, y, alpha) {
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(img, f[0], f[1], f[2], f[3], Math.round(x - f[2] / 2), Math.round(y - f[3]), f[2], f[3]);
    ctx.globalAlpha = 1;
  }

  const SMALL_SHADOWS = [[6, 10, 12, 10, 6], [6, 10, 10, 6]];

  function drawShadow(ctx, img, x, y, size) {
    ctx.globalAlpha = 0.55;
    if (size === 0) {
      const f = frameOf('shadow', 0);
      ctx.drawImage(img, f[0], f[1], f[2], f[3], Math.round(x - f[2] / 2), Math.round(y - 3), f[2], f[3]);
    } else {
      const rows = SMALL_SHADOWS[size - 1];
      ctx.fillStyle = '#000';
      rows.forEach((w, k) => ctx.fillRect(Math.round(x - w / 2), Math.round(y - 2) + k, w, 1));
    }
    ctx.globalAlpha = 1;
  }

  function drawField(g, ctx, tilesImg) {
    const tiles = root.ASSET_DATA.tiles;
    const s = Math.floor(g.scroll);
    const lavaFrame = Math.floor(g.tick / tiles.lavaFrameTicks) % tiles.lava.frames;
    const groundFrame = Math.floor(g.tick / tiles.lavaFrameTicks) % tiles.ground.frames;
    const wallFrame = Math.floor(g.tick / tiles.wallFrameTicks) % tiles.wall.frames;
    const altRows = tiles.groundAlt['4'] || [];
    const i0 = Math.floor(s / T), i1 = Math.floor((s + CFG.H) / T);
    for (let i = i0; i <= i1; i++) {
      const row = g.rows[i];
      if (!row) continue;
      const pats = rowTiles(g, i, tiles.maskToPattern);
      const sy = CFG.H + s - (i + 1) * T;
      for (let c = 0; c < CFG.COLS; c++) {
        const kind = row.cells[c], p = pats[c];
        let srcRow;
        if (kind === WALL) srcRow = tiles.wall.row + wallFrame;
        else if (kind === LAVA) srcRow = tiles.lava.row + lavaFrame;
        else if (row.alt[c] && p === 4 && altRows.length) srcRow = altRows[(row.alt[c] - 1) % altRows.length];
        else srcRow = tiles.ground.row + groundFrame;
        ctx.drawImage(tilesImg, p * T, srcRow * T, T, T, c * T, sy, T, T);
      }
    }
  }

  function runnerFrame(r) {
    if (r.state === 'falling') return frameOf(r.char + '.run', 0);
    const frames = root.ASSET_DATA.sprites[r.char + '.run'];
    return frames[Math.floor(r.animT / CFG.RUN_FRAME_TIME) % frames.length];
  }

  function drawWorld(g, ctx, img) {
    // shadows
    for (const r of g.runners) {
      if (r.state === 'run' || r.state === 'falling') {
        const size = r.h > 80 ? 2 : r.h > 6 ? 1 : 0;
        drawShadow(ctx, img.sprites, r.x, r.y, size);
      }
    }
    const items = [];
    for (const r of g.runners) items.push({ y: r.y, draw: () => drawRunner(g, ctx, img.sprites, r) });
    for (const fb of g.fireballs) {
      items.push({
        y: fb.y + 8,
        draw: () => {
          const f = frameOf('fireball', Math.floor(fb.t / CFG.FIREBALL_FRAME_TIME));
          ctx.drawImage(img.sprites, f[0], f[1], f[2], f[3], Math.round(fb.x - 16), Math.round(fb.y - 16), f[2], f[3]);
        },
      });
    }
    items.push({ y: CFG.GROUDON_FEET, draw: () => drawGroudon(g, ctx, img.sprites) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
  }

  function drawRunner(g, ctx, img, r) {
    const feet = r.y + 1;
    if (r.state === 'run' || r.state === 'falling') {
      const f = runnerFrame(r);
      drawFrame(ctx, img, f, r.x, feet - Math.round(r.h));
      if (r.isPlayer) {
        const top = Math.round(feet - r.h - f[3] - 3);
        ctx.fillStyle = '#f8e048';
        for (let k = 0; k < 3; k++) ctx.fillRect(Math.round(r.x) - 2 + k, top - 3 + k, 5 - k * 2, 1);
      }
    } else if (r.state === 'dying') {
      const t = r.stateT / CFG.DEATH_TIME;
      drawFrame(ctx, img, frameOf(r.char + '.hurt', 0), r.x, feet, Math.max(0, 1 - t));
      const embers = root.ASSET_DATA.sprites.ember;
      drawFrame(ctx, img, embers[Math.min(embers.length - 1, Math.floor(t * embers.length))], r.x, feet);
    }
  }

  function drawGroudon(g, ctx, img) {
    const d = g.groudon;
    let f;
    if (d.state === 'windup') f = frameOf('groudon.attack', 0);
    else if (d.state === 'fire' || d.state === 'barrage') f = frameOf('groudon.attack', 1);
    else f = frameOf('groudon.walk', Math.floor(d.animT / CFG.GROUDON_FRAME_TIME));
    drawFrame(ctx, img, f, d.x, CFG.GROUDON_FEET);
  }

  function drawHud(g, ctx, img) {
    drawWindow(ctx, 0, 0, CFG.W, CFG.HUD_H);
    const secs = Math.ceil(g.timeLeft);
    drawTextCentered(ctx, String(secs), 16, 8, secs <= 10 ? '#f8a050' : '#f8f8f8', 2);
    ctx.fillStyle = '#6880c0';
    ctx.fillRect(31, 4, 1, CFG.HUD_H - 8);
    g.runners.forEach((r, k) => {
      const x = 33 + k * 41;
      const onField = r.state === 'run';
      drawFrame(ctx, img.sprites, frameOf(r.char + '.icon', 0), x + 10, CFG.HUD_H - 4, onField ? 1 : 0.35);
      const color = r.isPlayer ? '#f8e048' : '#f8f8f8';
      drawText(ctx, String(points(r)), x + 21, 7, color);
      if (r.isPlayer) drawText(ctx, 'YOU', x + 21, 16, color);
    });
  }

  function drawSelect(g, ctx, img) {
    drawWindow(ctx, 12, 52, 216, 36);
    drawTextCentered(ctx, "GROUDON'S BREATH", 120, 65, '#f8e048', 2);

    drawWindow(ctx, 12, 128, 216, 106);
    drawTextCentered(ctx, 'CHOOSE YOUR POKEMON', 120, 138, '#f8f8f8');
    CHARACTERS.forEach((char, k) => {
      const cx = 40 + k * 40;
      const chosen = k === g.selected;
      const bob = chosen && Math.floor(g.phaseT * 4) % 2 ? 1 : 0;
      if (chosen) {
        ctx.fillStyle = '#304098';
        ctx.fillRect(cx - 16, 152, 32, 34);
      }
      drawFrame(ctx, img.sprites, frameOf(char + '.icon', 0), cx, 182 - bob);
      if (chosen) {
        ctx.fillStyle = '#f8e048';
        for (let k2 = 0; k2 < 3; k2++) ctx.fillRect(cx - k2, 189 + k2, 1 + k2 * 2, 1);
      }
    });
    drawTextCentered(ctx, NAMES[CHARACTERS[g.selected]], 120, 198, '#f8e048');
    drawTextCentered(ctx, 'PRESS SPACE', 120, 216, '#f8f8f8');
  }

  function drawModeSelect(g, ctx) {
    drawWindow(ctx, 12, 52, 216, 36);
    drawTextCentered(ctx, "GROUDON'S BREATH", 120, 65, '#f8e048', 2);
    drawWindow(ctx, 12, 128, 216, 92);
    ['TIME TRIAL', 'SURVIVAL'].forEach((label, k) => {
      const y = 144 + k * 26;
      const chosen = k === g.menu;
      drawTextCentered(ctx, label, 120, y, chosen ? '#f8e048' : '#f8f8f8', 2);
      if (chosen) {
        const x = Math.round(120 - textWidth(label, 2) / 2) - 12;
        ctx.fillStyle = '#f8e048';
        for (let k2 = 0; k2 < 4; k2++) ctx.fillRect(x + k2, y + 2 + k2, 1, 7 - k2 * 2);
      }
    });
    drawTextCentered(ctx, 'PRESS SPACE', 120, 202, '#f8f8f8');
  }

  const SPEED_WORDS = { slow: 'SLOW', regular: 'REG', fast: 'FAST' };
  const JUMP_WORDS = { regular: 'REG', far: 'FAR', agile: 'AGILE', heavy: 'HEAVY' };

  function drawSurvivalSelect(g, ctx, img) {
    drawWindow(ctx, 8, 34, 224, 244);
    drawTextCentered(ctx, 'SURVIVAL', 120, 44, '#f8e048', 2);
    drawTextCentered(ctx, 'CHOOSE YOUR POKEMON', 120, 62, '#f8f8f8');
    SURVIVAL_ROSTER.forEach((char, k) => {
      const cx = 40 + (k % 5) * 40, bottom = 102 + Math.floor(k / 5) * 34;
      const chosen = k === g.sSelected;
      if (chosen) {
        ctx.fillStyle = '#304098';
        ctx.fillRect(cx - 18, bottom - 30, 36, 33);
      }
      const bob = chosen && Math.floor(g.phaseT * 4) % 2 ? 1 : 0;
      drawFrame(ctx, img.sprites, frameOf(char + '.icon', 0), cx, bottom - bob);
    });
    const char = SURVIVAL_ROSTER[g.sSelected], st = CFG.CHARACTER_STATS[char];
    drawTextCentered(ctx, NAMES[char], 120, 214, '#f8e048', 2);
    drawTextCentered(ctx, st.size.toUpperCase() + '  ' + SPEED_WORDS[st.speed] + ' SPEED  ' + JUMP_WORDS[st.jump] + ' JUMP',
      120, 232, '#a0b0e0');
    drawTextCentered(ctx, 'PRESS SPACE', 120, 256, '#f8f8f8');
  }

  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');
  const clock = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

  function drawSurvivalHud(g, ctx, img) {
    drawWindow(ctx, 0, 0, CFG.W, CFG.HUD_H);
    drawText(ctx, clock(g.time), 8, 9, '#f8f8f8', 2);
    ctx.fillStyle = '#6880c0';
    ctx.fillRect(48, 4, 1, CFG.HUD_H - 8);
    const alive = g.runners.filter((r) => r.state === 'run').length;
    drawText(ctx, 'LEFT', 56, 7, '#a0b0e0');
    drawText(ctx, alive + '/' + g.runners.length, 56, 15, '#f8f8f8', 1);
    const me = g.runners.find((r) => r.isPlayer);
    if (!me) return;
    drawFrame(ctx, img.sprites, frameOf(me.char + '.icon', 0), 222, CFG.HUD_H - 4, me.place ? 0.35 : 1);
    drawText(ctx, me.place ? ordinal(me.place) : 'YOU', 190, 11, me.place ? '#f8a050' : '#f8e048');
  }

  function drawSurvivalOverlay(g, ctx) {
    const me = g.runners.find((r) => r.isPlayer);
    if (g.phase === 'finish') {
      const text = g.winner ? (g.winner.isPlayer ? 'YOU WIN!' : NAMES[g.winner.char] + ' WINS!') : 'NO ONE WINS!';
      drawTextCentered(ctx, text, 120, 110, '#f8e048', 2);
    } else if (g.skipping) {
      drawTextCentered(ctx, 'FAST FORWARD >>', 120, 36, '#f8e048');
    } else if (me && me.place && g.phase === 'play') {
      drawWindow(ctx, 36, 100, 168, 44);
      drawTextCentered(ctx, "YOU'RE OUT! " + ordinal(me.place), 120, 110, '#f8e048', 2);
      drawTextCentered(ctx, 'SPACE  SKIP TO THE END', 120, 130, '#f8f8f8');
    }
  }

  function drawSurvivalResults(g, ctx, img) {
    drawWindow(ctx, 16, 44, 208, 212);
    drawTextCentered(ctx, 'RESULTS', 120, 54, '#f8e048', 2);
    const meIndex = g.results.findIndex((res) => res.isPlayer);
    const rows = g.results.slice(0, 6);
    if (meIndex >= 6) rows[5] = g.results[meIndex]; // always show where you placed
    rows.forEach((res, k) => {
      const y = 72 + k * 27;
      const color = res.isPlayer ? '#f8e048' : '#f8f8f8';
      if (res.isPlayer) {
        ctx.fillStyle = color;
        for (let k2 = 0; k2 < 4; k2++) ctx.fillRect(22 + k2, y + 10 + k2, 1, 7 - k2 * 2);
      }
      drawText(ctx, String(res.rank), 30, y + 8, color, 2);
      drawFrame(ctx, img.sprites, frameOf(res.char + '.icon', 0), 66, y + 24);
      drawText(ctx, NAMES[res.char], 84, y + 6, color);
      drawText(ctx, clock(res.time), 84, y + 14, '#a0b0e0');
    });
    if (g.phaseT > 0.8) drawTextCentered(ctx, 'SPACE  PLAY AGAIN', 120, 240, '#f8f8f8');
  }

  function drawResults(g, ctx, img) {
    drawWindow(ctx, 16, 52, 208, 196);
    drawTextCentered(ctx, 'RESULTS', 120, 64, '#f8e048', 2);
    g.results.forEach((res, k) => {
      const y = 86 + k * 28;
      const color = res.isPlayer ? '#f8e048' : '#f8f8f8';
      if (res.isPlayer) { // the same yellow arrow that marks your runner, pointing at your rank
        ctx.fillStyle = color;
        for (let k2 = 0; k2 < 4; k2++) ctx.fillRect(22 + k2, y + 10 + k2, 1, 7 - k2 * 2);
      }
      drawText(ctx, String(res.rank), 30, y + 8, color, 2);
      drawFrame(ctx, img.sprites, frameOf(res.char + '.icon', 0), 58, y + 24);
      drawText(ctx, NAMES[res.char], 74, y + 6, color);
      drawText(ctx, String(res.points), 170, y + 14, color);
    });
    if (g.phaseT > 0.8) drawTextCentered(ctx, 'SPACE  PLAY AGAIN', 120, 234, '#f8f8f8');
  }

  function render(g, ctx, img) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CFG.W, CFG.H);
    drawField(g, ctx, img.tiles);
    if (g.phase === 'mode' || g.phase === 'select' || g.phase === 'sselect') {
      drawGroudon(g, ctx, img.sprites);
      if (g.phase === 'mode') drawModeSelect(g, ctx);
      else if (g.phase === 'select') drawSelect(g, ctx, img);
      else drawSurvivalSelect(g, ctx, img);
      return;
    }
    drawWorld(g, ctx, img);
    if (g.mode === 'survival') drawSurvivalHud(g, ctx, img);
    else drawHud(g, ctx, img);
    if (g.phase === 'countdown') {
      const word = g.phaseT < CFG.COUNTDOWN - CFG.GO_TIME ? 'READY' : 'GO!';
      drawTextCentered(ctx, word, 120, 110, '#f8e048', 3);
    } else if (g.phase === 'timeup') {
      drawTextCentered(ctx, 'TIME UP!', 120, 110, '#f8e048', 3);
    } else if (g.phase === 'results') {
      if (g.mode === 'survival') drawSurvivalResults(g, ctx, img);
      else drawResults(g, ctx, img);
    } else if (g.mode === 'survival') {
      drawSurvivalOverlay(g, ctx);
    }
  }

  root.DragonGame = { CFG, CHARACTERS, SURVIVAL_ROSTER, createGame, update, render };
})(typeof window !== 'undefined' ? window : globalThis);
