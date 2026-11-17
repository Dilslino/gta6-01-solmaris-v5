// Solmaris sound: pure WebAudio synthesis, no audio files. Every effect is
// a small oscillator/noise recipe; the engine hum and the police siren are
// continuous nodes whose pitch follows the game. Safe to call before any
// user gesture — the context is created lazily and every call is guarded.
export function createSound() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      // Engine: low sawtooth whose frequency follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 400;
      engineOsc.connect(filt);
      filt.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: triangle that wails between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch { /* audio is cosmetic */ }
  }

  function noise(dur, vol, low) {
    if (!ensure() || muted) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = low || 1200;
      const g = ctx.createGain();
      g.gain.value = vol || 0.25;
      src.connect(filt); filt.connect(g); g.connect(master);
      src.start();
    } catch { /* audio is cosmetic */ }
  }

  return {
    unlock() { ensure(); },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.35; return muted; },
    click() { blip(660, 0.07, 'square', 0.12); },
    pickup() { blip(520, 0.1, 'sine', 0.2, 880); },
    cash() { blip(880, 0.12, 'sine', 0.2, 1320); setTimeout(() => blip(1320, 0.18, 'sine', 0.18, 1760), 90); },
    shoot() { noise(0.14, 0.35, 2500); blip(180, 0.1, 'square', 0.2, 60); },
    punch() { noise(0.08, 0.2, 500); },
    crash() { noise(0.3, 0.4, 700); },
    siren(on) {
      if (!ensure() || muted) return;
      try { sirenGain.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.2); } catch { /* noop */ }
    },
    update(dt, speed, wanted) {
      if (!ctx) return;
      try {
        engineGain.gain.setTargetAtTime(speed > 5 ? 0.05 + speed / 430 * 0.06 : 0, ctx.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(45 + speed * 0.45, ctx.currentTime, 0.1);
        if (wanted > 0) {
          sirenTimer += dt;
          sirenOsc.frequency.setTargetAtTime(sirenTimer % 1 < 0.5 ? 720 : 980, ctx.currentTime, 0.05);
        }
      } catch { /* noop */ }
    },
    mission() {
      blip(523, 0.14, 'sine', 0.2); setTimeout(() => blip(659, 0.14, 'sine', 0.2), 130);
      setTimeout(() => blip(784, 0.3, 'sine', 0.22), 260);
    },
    busted() { blip(392, 0.2, 'sawtooth', 0.2, 196); setTimeout(() => blip(196, 0.5, 'sawtooth', 0.2), 200); },
    wasted() { blip(220, 0.3, 'sawtooth', 0.22, 110); setTimeout(() => blip(110, 0.8, 'sawtooth', 0.22), 280); },
  };
}
