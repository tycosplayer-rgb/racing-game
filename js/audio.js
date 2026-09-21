/* Web Audio synthesized SFX — no external audio files */
(function (global) {
  "use strict";

  const MUTE_KEY = "neon-racing-muted";

  const AudioFX = {
    ctx: null,
    master: null,
    muted: localStorage.getItem(MUTE_KEY) === "1",
    unlocked: false,
    engine: null,
    _steerCooldown: 0,
  };

  function ensureCtx() {
    if (AudioFX.ctx) return AudioFX.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = AudioFX.muted ? 0 : 0.55;
    master.connect(ctx.destination);
    AudioFX.ctx = ctx;
    AudioFX.master = master;
    return ctx;
  }

  function unlock() {
    const ctx = ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    AudioFX.unlocked = true;
    applyMuteGain();
  }

  function applyMuteGain() {
    if (!AudioFX.master || !AudioFX.ctx) return;
    const g = AudioFX.master.gain;
    const now = AudioFX.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(AudioFX.muted ? 0 : 0.55, now + 0.05);
  }

  function setMuted(muted) {
    AudioFX.muted = !!muted;
    localStorage.setItem(MUTE_KEY, AudioFX.muted ? "1" : "0");
    applyMuteGain();
    if (AudioFX.muted) stopEngine();
  }

  function toggleMute() {
    unlock();
    setMuted(!AudioFX.muted);
    return AudioFX.muted;
  }

  function isMuted() {
    return AudioFX.muted;
  }

  function envGain(ctx, start, peak, attack, hold, release) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.setValueAtTime(peak, start + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, start + attack + hold + release);
    return g;
  }

  function tone(freq, dur, type, peak, slideTo) {
    const ctx = ensureCtx();
    if (!ctx || AudioFX.muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    }
    const g = envGain(ctx, t, peak || 0.12, 0.01, Math.max(0.01, dur * 0.35), dur * 0.55);
    osc.connect(g);
    g.connect(AudioFX.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noiseBurst(dur, peak, filterFreq) {
    const ctx = ensureCtx();
    if (!ctx || AudioFX.muted) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq || 800;
    filter.Q.value = 0.6;
    const g = envGain(ctx, t, peak || 0.25, 0.005, dur * 0.15, dur * 0.8);
    src.connect(filter);
    filter.connect(g);
    g.connect(AudioFX.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function click() {
    unlock();
    tone(880, 0.05, "square", 0.08);
    tone(1320, 0.04, "triangle", 0.05);
  }

  function start() {
    unlock();
    tone(440, 0.1, "square", 0.1);
    setTimeout(() => tone(554, 0.1, "square", 0.1), 80);
    setTimeout(() => tone(659, 0.16, "square", 0.12), 160);
  }

  function crash() {
    unlock();
    noiseBurst(0.35, 0.35, 400);
    tone(180, 0.4, "sawtooth", 0.18, 50);
    tone(90, 0.5, "square", 0.12, 40);
    stopEngine();
  }

  function gameOver() {
    unlock();
    tone(392, 0.18, "triangle", 0.1);
    setTimeout(() => tone(311, 0.2, "triangle", 0.1), 140);
    setTimeout(() => tone(233, 0.35, "triangle", 0.12, 160), 280);
  }

  function milestone() {
    unlock();
    tone(523, 0.08, "sine", 0.1);
    setTimeout(() => tone(784, 0.12, "sine", 0.12), 70);
    setTimeout(() => tone(1046, 0.18, "triangle", 0.1), 150);
  }

  function steer() {
    unlock();
    const now = performance.now();
    if (now - AudioFX._steerCooldown < 120) return;
    AudioFX._steerCooldown = now;
    tone(240, 0.04, "triangle", 0.035);
  }

  function startEngine() {
    const ctx = ensureCtx();
    if (!ctx || AudioFX.muted || AudioFX.engine) return;
    unlock();

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 70;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 8;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 4;

    const g = ctx.createGain();
    g.gain.value = 0.0001;

    osc.connect(filter);
    filter.connect(g);
    g.connect(AudioFX.master);

    const t = ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.15);
    osc.start();
    lfo.start();

    AudioFX.engine = { osc, lfo, filter, gain: g };
  }

  function updateEngine(speedNorm, accelerating) {
    if (AudioFX.muted) {
      stopEngine();
      return;
    }
    if (!AudioFX.engine) startEngine();
    if (!AudioFX.engine || !AudioFX.ctx) return;
    const { osc, filter, gain } = AudioFX.engine;
    const t = AudioFX.ctx.currentTime;
    const base = 65 + speedNorm * 90;
    const boost = accelerating ? 35 : 0;
    osc.frequency.setTargetAtTime(base + boost, t, 0.08);
    filter.frequency.setTargetAtTime(380 + speedNorm * 500 + (accelerating ? 220 : 0), t, 0.1);
    const vol = 0.04 + speedNorm * 0.05 + (accelerating ? 0.035 : 0);
    gain.gain.setTargetAtTime(vol, t, 0.08);
  }

  function stopEngine() {
    if (!AudioFX.engine || !AudioFX.ctx) {
      AudioFX.engine = null;
      return;
    }
    const { osc, lfo, gain } = AudioFX.engine;
    const t = AudioFX.ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.stop(t + 0.15);
      lfo.stop(t + 0.15);
    } catch (_) {}
    AudioFX.engine = null;
  }

  // Unlock on first gesture globally
  function onFirstGesture() {
    unlock();
  }
  ["touchstart", "mousedown", "keydown"].forEach((ev) => {
    window.addEventListener(ev, onFirstGesture, { once: true, capture: true });
  });

  global.AudioFX = {
    unlock,
    setMuted,
    toggleMute,
    isMuted,
    click,
    start,
    crash,
    gameOver,
    milestone,
    steer,
    startEngine,
    updateEngine,
    stopEngine,
  };
})(window);
