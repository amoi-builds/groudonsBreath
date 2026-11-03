// Run full rounds headless with every runner computer-controlled and print how they did.
// usage: node tools/simulate.js [rounds=20] [firstSeed=1] [even] [survival]
//   even:     every computer player gets the same skill, so only character stats differ
//   survival: play Survival (20 runners, last one standing) instead of Time Trial
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console, Math, Date, Uint8Array };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'game.js'), 'utf8'), ctx);
const { CFG, CHARACTERS, SURVIVAL_ROSTER, createGame, update } = ctx.DragonGame;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => isNaN(Number(a))));
const [rounds = 20, firstSeed = 1] = args.filter((a) => !isNaN(Number(a))).map(Number);
const evenAi = flags.has('even');
const mode = flags.has('survival') ? 'survival' : 'trial';
const roster = mode === 'survival' ? SURVIVAL_ROSTER : CHARACTERS;
const idle = { left: false, right: false, up: false, down: false, jumpPressed: false };
const totals = Object.fromEntries(roster.map((c) => [c, { score: 0, deaths: 0, lava: 0, fire: 0, place: 0, wins: 0 }]));
let ties = 0, length = 0;

for (let s = firstSeed; s < firstSeed + rounds; s++) {
  const g = createGame({ auto: true, seed: s, evenAi, mode });
  let steps = 0;
  while (g.phase !== 'results' && steps < 60 * 60 * 20) {
    update(g, 1 / 60, idle);
    steps++;
    for (const r of g.runners) {
      if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) throw new Error(`seed ${s}: ${r.char} has non-finite position`);
    }
  }
  if (g.phase !== 'results') throw new Error(`seed ${s}: round never finished`);
  length += g.time;
  const ranks = g.results.map((r) => r.rank);
  if (new Set(ranks).size < ranks.length) ties++;
  for (const r of g.runners) {
    const t = totals[r.char];
    t.score += r.score;
    t.deaths += r.deaths;
    t.lava += r.causes.lava;
    t.fire += r.causes.fire;
    if (mode === 'survival') {
      t.place += r.place;
      if (r.place === 1) t.wins++;
    }
  }
}

if (mode === 'survival') {
  console.log(`${rounds} Survival rounds, all computer-controlled; average round ${(length / rounds).toFixed(0)}s`);
  console.log('char        avg place  avg survived  wins  (lava / fire deaths)');
  const rows = roster.map((c) => [c, totals[c]]).sort((a, b) => a[1].place - b[1].place);
  for (const [c, t] of rows) {
    console.log(
      c.padEnd(11),
      (t.place / rounds).toFixed(1).padStart(9),
      ((t.score / rounds).toFixed(0) + 's').padStart(13),
      String(t.wins).padStart(5),
      `   (${(t.lava / rounds).toFixed(2)} / ${(t.fire / rounds).toFixed(2)})`,
    );
  }
} else {
  console.log(`${rounds} rounds of ${CFG.ROUND_TIME}s, all computer-controlled`);
  console.log('char        avg score  avg deaths  (lava / fire)');
  for (const c of roster) {
    const t = totals[c];
    console.log(
      c.padEnd(11),
      (t.score / rounds).toFixed(1).padStart(9),
      (t.deaths / rounds).toFixed(1).padStart(11),
      `   (${(t.lava / rounds).toFixed(1)} / ${(t.fire / rounds).toFixed(1)})`,
    );
  }
}
console.log(`rounds with a tie: ${ties}`);
