/* SRP build 1: the sound engine every phone runs (the lead phone too).
   S is a plain object the page keeps up to date:
     S.id      this phone's id
     S.clock   a Clock (or the lead's own clock)
     S.me      this phone's record {delay, level, mute, ...}
     S.layout  every phone {id, pos, online, mute, ...}
     S.focus   spatial focus
   Events carry times in lead-clock milliseconds. They are turned into audio time here. */
(function (root) {
  'use strict';
  const SRP = root.SRP;

  const PRESETS = {
    pad:   { osc: [['sawtooth', 1, -6, .5], ['sawtooth', 1, 6, .5], ['triangle', .5, 0, .6]], lp: 1200, q: .5, a: .35, dec: 2, r: 1.2, lev: .22 },
    pluck: { osc: [['sawtooth', 1, -4, .5], ['square', 1, 5, .35]], lp: 1500, fenv: 4, q: 3, a: .004, dec: .5, r: .3, lev: .28 },
    glass: { osc: [['sine', 1, 0, 1], ['sine', 2.01, 0, .35], ['sine', 3.99, 0, .18]], lp: 9000, q: .1, a: .003, dec: 2.4, r: .6, lev: .32 },
    noise: { noise: true, q: 10, a: .06, dec: 1.2, r: .6, lev: .6 }
  };

  SRP.createEngine = function (S) {
    let ctx = null, master = null, analyser = null, noiseBuf = null, meterBuf = null;
    let played = 0, late = 0, active = 0;
    const voices = new Map();                       // object id -> voice

    function silentWavUrl() {                       // keeps iOS audio playing with the silent switch on
      const n = 4000, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
      const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
      w(36, 'data'); v.setUint32(40, n, true);
      for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
      return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    }

    function init(silentEl) {
      if (ctx) return true;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) {}
      try { if (silentEl) { silentEl.src = silentWavUrl(); silentEl.loop = true; silentEl.play().catch(() => {}); } } catch (_) {}
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
      analyser = ctx.createAnalyser(); analyser.fftSize = 512; meterBuf = new Uint8Array(analyser.fftSize);
      master.connect(comp); comp.connect(ctx.destination); comp.connect(analyser);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      ctx.resume().catch(() => {});
      document.addEventListener('pointerdown', () => { if (ctx.state !== 'running') ctx.resume().catch(() => {}); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) ctx.resume().catch(() => {}); });
      applyTrim();
      return true;
    }

    function applyTrim() {
      if (!master) return;
      master.gain.setTargetAtTime(S.me.mute ? 0 : S.me.level, ctx.currentTime, 0.02);
    }

    /* Lead-clock milliseconds to audio time. The phone's own output latency is subtracted so the sound leaves
       the speaker at the stated moment. The delay trim (set by hand or by calibration) fixes the rest. */
    function renderTime(m, strict, raw) {
      if (!m.at) return ctx.currentTime;
      if (!S.clock.ready) return strict ? null : ctx.currentTime;
      const dt = (S.clock.toLocal(m.at) - performance.now()) / 1000;
      const t = ctx.currentTime + dt - (ctx.outputLatency || 0) + (raw ? 0 : S.me.delay / 1000);
      if (strict && t < ctx.currentTime - 0.04) return null;
      return Math.max(t, ctx.currentTime + 0.002);
    }

    function myGain(pos) { return SRP.gains(pos, S.layout, S.focus)[S.id] || 0; }

    function makeVoice(type, f, t, held, pos) {
      const P = PRESETS[type] || PRESETS.pad;
      const spat = ctx.createGain(); spat.gain.value = 0; spat.connect(master);
      const env = ctx.createGain(); env.gain.value = 0.0001; env.connect(spat);
      const lp = ctx.createBiquadFilter();
      lp.type = P.noise ? 'bandpass' : 'lowpass';
      lp.frequency.value = P.noise ? f : P.lp; lp.Q.value = P.q;
      if (P.fenv) {
        lp.frequency.setValueAtTime(P.lp * P.fenv, t);
        lp.frequency.exponentialRampToValueAtTime(P.lp, t + P.dec * 0.6);
      }
      lp.connect(env);
      const srcs = [];
      if (P.noise) {
        const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        s.connect(lp); s.start(t); srcs.push(s);
      } else {
        for (const [wave, ratio, cents, gain] of P.osc) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = wave; o.frequency.value = f * ratio; o.detune.value = cents; g.gain.value = gain;
          o.connect(g); g.connect(lp); o.start(t); srcs.push(o);
        }
      }
      env.gain.setValueAtTime(0.0001, t);
      if (held) env.gain.setTargetAtTime(P.lev, t, P.a / 3);
      else {
        env.gain.linearRampToValueAtTime(P.lev, t + P.a);
        env.gain.exponentialRampToValueAtTime(0.0001, t + P.a + P.dec);
      }
      const v = { spat, env, srcs, P, pos, held, dead: false };
      if (!held) srcs.forEach(s => s.stop(t + P.a + P.dec + 0.05));
      srcs[0].onended = () => { v.dead = true; active--; try { spat.disconnect(); } catch (_) {} };
      active++;
      return v;
    }
    function setSpatial(v, t, jump) {
      const g = myGain(v.pos);
      if (jump) v.spat.gain.setValueAtTime(g, t);
      else v.spat.gain.setTargetAtTime(g, t, 0.04);
    }
    function releaseVoice(v, t) {
      if (!v || v.dead) return;
      v.env.gain.setTargetAtTime(0.0001, t, v.P.r / 4);
      v.srcs.forEach(s => { try { s.stop(t + v.P.r * 1.6); } catch (_) {} });
    }
    function respatialise() {
      if (!ctx) return;
      const t = ctx.currentTime;
      for (const v of voices.values()) if (!v.dead) setSpatial(v, t, false);
    }

    function chirp(t) {
      const C = SRP.CHIRP, n = 64, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) curve[i] = 0.8 * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(C.f0, t); o.frequency.linearRampToValueAtTime(C.f1, t + C.dur);
      g.gain.value = 0;
      g.gain.setValueCurveAtTime(curve, t, C.dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + C.dur + 0.02);
    }
    function beep(t, hz) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = hz; g.gain.value = 0.0001;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.4, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.25);
    }
    function identify() {
      if (ctx) { const t = ctx.currentTime + 0.02; beep(t, 880); beep(t + 0.3, 1320); }
      document.body.classList.add('flash');
      setTimeout(() => document.body.classList.remove('flash'), 700);
    }

    function onEvent(m) {
      if (!ctx) return;
      if (m.to && m.to.indexOf(S.id) < 0) return;
      const k = m.k;
      if (k === 'chirp') {
        const t = renderTime(m, true, m.raw);
        if (t === null) { late++; return; }
        chirp(t); return;
      }
      if (k === 'stopall') {
        const t = ctx.currentTime;
        for (const v of voices.values()) releaseVoice(v, t);
        voices.clear(); return;
      }
      if (k === 'off') {
        const v = voices.get(m.obj); if (!v) return;
        releaseVoice(v, renderTime(m, false)); voices.delete(m.obj); return;
      }
      if (k === 'move') {
        const v = voices.get(m.obj); if (!v) return;
        v.pos = m.pos; setSpatial(v, renderTime(m, false), false); return;
      }
      if (k === 'on' || k === 'hit') {
        const held = k === 'on';
        const t = renderTime(m, !held);
        if (t === null) { late++; return; }
        if (active > 40) return;
        const pos = m.pos || [0, 0];
        if (!held && myGain(pos) < 0.01) return;               // not audible here, skip the work
        const old = voices.get(m.obj);
        if (held && old) releaseVoice(old, t);
        const v = makeVoice(m.s, m.f || 220, t, held, pos);
        setSpatial(v, t, true);
        if (held) voices.set(m.obj, v);
        played++;
      }
    }

    return {
      init: init, applyTrim: applyTrim, respatialise: respatialise, onEvent: onEvent, identify: identify,
      get ctx() { return ctx; },
      stats: function () { return { played: played, late: late, lat: ctx ? (ctx.outputLatency || 0) : 0 }; },
      meter: function () {
        if (!analyser) return 0;
        analyser.getByteTimeDomainData(meterBuf);
        let peak = 0; for (let i = 0; i < meterBuf.length; i++) peak = Math.max(peak, Math.abs(meterBuf[i] - 128));
        return Math.min(1, peak / 128 * 1.4);
      }
    };
  };
})(window);
