/* Browser audio: decodes the embedded clips (assets/audio.js) with Web Audio, loops the music while
 * asked to and plays the sounds the simulation reports in g.sounds. */
(function () {
  'use strict';

  // Versus Boss is 0.58 s of silence, a short intro, a 43.88 s body played twice, then a fade: start just
  // before the first note and loop the body seamlessly.
  const MUSIC_START = 0.56, MUSIC_LOOP = [1.0, 44.8827];
  // The music is mastered about 10 dB hotter than the move sounds.
  const VOLUME = { music: 0.35, flame: 0.9, burn: 1, cursor: 1, confirm: 0.8 };

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioContext ? new AudioContext() : null;
  const buffers = {};
  let master = null, music = null, musicWanted = false; // music: the playing source and its gain

  if (ctx) {
    master = ctx.createGain();
    master.connect(ctx.destination);
    for (const [name, b64] of Object.entries(window.AUDIO_DATA || {})) {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      ctx.decodeAudioData(bytes.buffer).then((buf) => {
        buffers[name] = buf;
        if (name === 'music') startMusic();
      }, () => {});
    }
  }

  function startMusic() {
    if (!musicWanted || music || !buffers.music || ctx.state !== 'running') return;
    const src = ctx.createBufferSource();
    src.buffer = buffers.music;
    src.loop = true;
    [src.loopStart, src.loopEnd] = MUSIC_LOOP;
    const gain = ctx.createGain();
    gain.gain.value = VOLUME.music;
    src.connect(gain).connect(master);
    src.start(0, MUSIC_START);
    music = { src, gain };
  }

  // Music on starts the track from the top; off fades it out quickly.
  function setMusic(on) {
    if (!ctx || on === musicWanted) return;
    musicWanted = on;
    if (on) {
      startMusic();
    } else if (music) {
      music.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      music.src.stop(ctx.currentTime + 1);
      music = null;
    }
  }

  // Browsers keep audio suspended until the first key press or click.
  function unlock() {
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().then(startMusic, () => {});
    else startMusic();
  }

  function play(name, volume) {
    if (!ctx || !buffers[name] || ctx.state !== 'running') return;
    const src = ctx.createBufferSource();
    src.buffer = buffers[name];
    const gain = ctx.createGain();
    gain.gain.value = VOLUME[name] * (volume === undefined ? 1 : volume);
    src.connect(gain).connect(master);
    src.start();
  }

  function toggleMute() {
    if (master) master.gain.value = master.gain.value > 0 ? 0 : 1;
  }

  window.GameAudio = { unlock, play, setMusic, toggleMute };
})();
