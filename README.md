# Groudon's Breath

A fan-made browser remake of the Dragon's Breath minigame from Shrek Super Party, using Pokémon Mystery
Dungeon: Red Rescue Team sprites. Run up the scrolling field, dodge lava and walls, and stay out of the
way of Groudon's fireballs.

The game renders at 240×320 native pixels and scales up by whole numbers only, so every sprite keeps
its original pixel size.

## Play locally

No install, server, or build step is needed. It's plain HTML and JavaScript.

1. Download the repo: **Code → Download ZIP** on GitHub (then unzip it), or
   `git clone` it.
2. Open `index.html` in any modern browser (double-click it).

That's it. All sprites and audio are bundled into JS files, so it works straight from `file://`.

### Controls

| Key | Action |
| --- | --- |
| ← / → | move across the field |
| ↑ / ↓ | move forward / back within your band (moving forward is slow) |
| Space | jump (you can still steer in the air, just less nimbly); also confirms menus |
| M | mute / unmute |

### Modes

- **Time Trial**: you and 4 CPUs (Pikachu, Chikorita, Eevee, Poliwhirl, Torchic) run for 90 seconds
  with unlimited respawns. Your score is the seconds you spend on the field, rounded up.
- **Survival**: 20 Pokémon from gens 1–3, one life each, no time limit. Last one standing wins.
  If you're knocked out, press Space to skip to the end.

Each Pokémon has a size (hitbox and weight), a speed and a jump type; see `CHARACTER_STATS` in
`src/game.js`.

Groudon fires either one fireball straight up or a diagonal pair. After 60 seconds every shot is a
three-way spread. His barrages (at 40s and 75s, and every 35s after that in Survival) always fire
straight.

CPUs: a few random ones each round are smarter than the rest. Poliwhirl bumps anyone near him. Pikachu
and Chikorita do the same now and then, but only to smaller Pokémon. Bullies hit and run: one bump,
then they back off for a couple of seconds. Anyone 2 seconds ahead of the field becomes a target, and
bullies bigger than them hunt more often and will cross the field to get at them.

## Development

Requirements: just a browser to play. For the optional tools, Node.js (simulator) and Python 3 with
Pillow (asset rebuilds).

- `src/game.js`: simulation and rendering. All tuning values live in `CFG` at the top.
- `src/main.js`: browser shell (input, scaling, 60 fps loop).
- `src/audio.js`: plays the music (looping its middle section seamlessly) and the sounds the simulation
  reports in `g.sounds`.
- `assets/source/`: the original ripped sprite sheets, and the ripped audio in `assets/source/audio/`.
- `tools/build_assets.py`: cuts the sheets into `assets/sprites.png`, `assets/tiles.png` and
  `assets/data.js`. Rerun with `python3 tools/build_assets.py` after changing frame choices.
- `tools/survival_frames.json`: which sheet boxes make up each Survival Pokémon's run, hurt and icon
  frames.
- `tools/build_audio.py`: embeds the audio clips in `assets/audio.js` so they load from `file://` too.
  Rerun with `python3 tools/build_audio.py` after swapping a clip.
- `tools/simulate.js`: plays whole rounds with every runner computer-controlled and prints how each
  character did: `node tools/simulate.js 30`. Add `even` to give every CPU the same skill (so only
  character stats differ) and `survival` to simulate Survival instead.

Debug URL params (append to the `index.html` URL): `?mode=trial|survival` skips the mode menu,
`?auto=1` (the computer drives your runner), `?seed=N`, `?char=eevee`, `?ff=SECONDS` (fast-forward),
`&freeze=1` (hold the fast-forwarded frame).

## Credits

This is an unofficial, non-commercial fan project. Pokémon is © Nintendo, Creatures Inc. and GAME FREAK
Inc.; Shrek Super Party is © its respective owners. This project is not affiliated with or endorsed by
any of them.

Sprite rips: Mighty Jetters (Chikorita, Torchic, shadow), Mr. C (Eevee), Jackster (Pikachu, Poliwhirl),
angry cabbage (Groudon), redblueyellow (fire moves), SilverDeoxys563 (Magma Cavern tiles), and the
Spriters Resource sheets in `assets/source/survival/` for the rest of the Survival roster.

Audio rips: SassyFlow's PMD Red sound effects on The Sounds Resource (song674 Flamethrower, song671 burn,
song301/302 menu cursor and confirm), and "Versus Boss" by Arata Iiyoshi from the KHInsider gamerip of
the soundtrack.
