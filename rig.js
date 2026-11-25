/* SRP build 1: pieces shared by the lead page and the join page. */
(function (root) {
  'use strict';
  const SRP = {};

  /* The link people are sent to from the join page. Replace when the app has a home. */
  SRP.INSTALL_URL = '#tbd';           // TBD: link to install Dactyl
  SRP.ROOM_PREFIX = 'dsrp-';          // room code 'ABCD' becomes the signalling id 'dsrp-ABCD'

  /* ---------- clock ----------
     The lead phone owns the clock (its performance.now(), in milliseconds). A joining phone keeps the last few
     ping/pong exchanges and trusts the one with the lowest round trip. */
  function Clock() { this.samples = []; this.offset = 0; this.rtt = null; this.ready = false; }
  Clock.prototype.reset = function () { this.samples = []; this.ready = false; };
  Clock.prototype.add = function (t0, s, t3) {
    const rtt = t3 - t0;
    this.samples.push({ rtt: rtt, off: s + rtt / 2 - t3 });
    if (this.samples.length > 12) this.samples.shift();
    let best = this.samples[0];
    for (const x of this.samples) if (x.rtt < best.rtt) best = x;
    this.offset = best.off; this.rtt = best.rtt; this.ready = true;
  };
  Clock.prototype.now = function () { return performance.now() + this.offset; };            // lead clock, ms
  Clock.prototype.toLocal = function (leadMs) { return leadMs - this.offset; };             // this phone's performance.now() ms
  SRP.Clock = Clock;
  /* The lead phone's own clock is the reference, so its offset is zero. */
  SRP.leadClock = function () {
    return { ready: true, rtt: 0, offset: 0, now: () => performance.now(), toLocal: ms => ms };
  };

  /* ---------- signalling options ----------
     By default PeerJS Cloud is used for the handshake. For testing or self-hosting, add ?sig=host:port (and &secure=1). */
  SRP.sigParam = function () { return new URLSearchParams(location.search).get('sig'); };
  SRP.peerOptions = function () {
    const q = new URLSearchParams(location.search), sig = q.get('sig');
    if (sig) {
      const parts = sig.split(':');
      return { host: parts[0], port: +(parts[1] || 9000), path: '/', secure: q.get('secure') === '1', debug: 1 };
    }
    return { debug: 1 };
  };
  SRP.newCode = function () {
    const a = 'ABCDEFGHJKMNPQRSTUVWXYZ', n = '23456789';        // no letters or digits that look alike
    let s = ''; for (let i = 0; i < 3; i++) s += a[Math.floor(Math.random() * a.length)];
    return s + n[Math.floor(Math.random() * n.length)];
  };

  /* ---------- spatial gains ----------
     Every online, unmuted phone gets a weight of 1 / max(distance, 0.5 m)^focus, power-normalised so the total
     loudness stays constant wherever the sound sits. A higher focus makes the nearest phone dominate. */
  SRP.gains = function (pos, nodes, focus) {
    const p = focus || 2.5, out = {};
    let sum = 0;
    for (const n of nodes) {
      if (!n.online || n.mute) continue;
      const d = Math.hypot(n.pos[0] - pos[0], n.pos[1] - pos[1]);
      const w = 1 / Math.pow(Math.max(d, 0.5), p);
      out[n.id] = w; sum += w * w;
    }
    const norm = sum > 0 ? 1 / Math.sqrt(sum) : 0;
    for (const k in out) out[k] *= norm;
    return out;
  };

  /* ---------- notes ---------- */
  SRP.SCALES = {
    'Minor pentatonic': [0, 3, 5, 7, 10],
    'Major pentatonic': [0, 2, 4, 7, 9],
    'Dorian': [0, 2, 3, 5, 7, 9, 10],
    'Whole tone': [0, 2, 4, 6, 8, 10],
    'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  };
  SRP.NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  SRP.midiToHz = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  SRP.degreeMidi = function (scaleName, rootNote, octave, degree) {
    const sc = SRP.SCALES[scaleName], len = sc.length;
    const oct = Math.floor(degree / len), idx = ((degree % len) + len) % len;
    return 12 * (octave + 1) + rootNote + sc[idx] + 12 * oct;
  };

  /* The calibration chirp. Both pages build it from these numbers. */
  SRP.CHIRP = { f0: 1500, f1: 6000, dur: 0.04 };

  /* Keep the screen on where the browser allows it (needs https, which GitHub Pages has). */
  SRP.keepAwake = function () {
    let lock = null;
    async function take() {
      try { if (navigator.wakeLock && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen'); } catch (_) {}
    }
    take();
    document.addEventListener('visibilitychange', take);
  };

  root.SRP = SRP;
})(window);
