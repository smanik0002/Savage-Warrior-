// Procedural audio (Web Audio API): no audio files needed. Includes 3D positional sound + generative music.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, music: 0.5 };
    this.musicOn = false;
    this.musicTimer = null;
    this.beat = 0;
  }

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVol();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  applyVol() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.sfx.gain.value = 1;
    this.music.gain.value = this.vol.music * 0.45;
  }

  setVolumes(master, music) { this.vol.master = master; this.vol.music = music; this.applyVol(); }

  setListener(camera) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const p = camera.position;
    const e = camera.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
      L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
    } else if (L.setPosition) {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  _dest(pos) {
    if (!pos) return this.sfx;
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 6;
    p.rolloffFactor = 1.1;
    p.maxDistance = 120;
    const y = pos.y === undefined ? 1 : pos.y;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, y, pos.z);
    p.connect(this.sfx);
    return p;
  }

  _tone(dest, t0, freq, dur, type = 'sine', vol = 0.3, to = null) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  _noise(dest, t0, dur, vol = 0.3, f0 = 1000, f1 = null, type = 'lowpass') {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t0);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  play(name, pos) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const d = this._dest(pos);
    switch (name) {
      case 'swing': this._noise(d, t, 0.14, 0.18, 800, 2600, 'bandpass'); break;
      case 'swoosh': this._noise(d, t, 0.35, 0.28, 300, 1800, 'bandpass'); break;
      case 'hit':
        this._tone(d, t, 200, 0.12, 'square', 0.22, 70);
        this._noise(d, t, 0.08, 0.35, 1400, 300);
        break;
      case 'crit':
        this._tone(d, t, 220, 0.16, 'square', 0.28, 60);
        this._tone(d, t, 900, 0.18, 'sawtooth', 0.14, 1800);
        this._noise(d, t, 0.12, 0.45, 2000, 300);
        break;
      case 'block':
        this._tone(d, t, 900, 0.1, 'triangle', 0.25, 600);
        this._tone(d, t, 1350, 0.07, 'triangle', 0.15);
        this._noise(d, t, 0.05, 0.2, 4000, 2000, 'highpass');
        break;
      case 'shock':
        this._tone(d, t, 90, 0.8, 'sine', 0.7, 30);
        this._noise(d, t, 0.5, 0.5, 500, 80);
        break;
      case 'dodge': this._noise(d, t, 0.22, 0.2, 500, 3000, 'bandpass'); break;
      case 'step': this._noise(d, t, 0.05, 0.1, 500, 200); break;
      case 'kill':
        [523, 659, 784].forEach((f, i) => this._tone(d, t + i * 0.07, f, 0.18, 'triangle', 0.18));
        break;
      case 'pickup': [660, 880, 1175].forEach((f, i) => this._tone(this.sfx, t + i * 0.07, f, 0.16, 'triangle', 0.16)); break;
      case 'zone': this._tone(this.sfx, t, 520, 0.12, 'sine', 0.14); this._tone(this.sfx, t + 0.1, 780, 0.2, 'sine', 0.14); break;
      case 'gun0': this._noise(d, t, 0.1, 0.5, 3200, 400); this._tone(d, t, 170, 0.1, 'square', 0.22, 60); break;
      case 'gun1': this._noise(d, t, 0.08, 0.45, 3800, 500); this._tone(d, t, 140, 0.08, 'sawtooth', 0.2, 55); break;
      case 'gun3': this._noise(d, t, 0.06, 0.38, 4200, 700); this._tone(d, t, 190, 0.06, 'sawtooth', 0.16, 70); break;
      case 'gun4': this._noise(d, t, 0.55, 0.95, 2200, 90); this._tone(d, t, 70, 0.4, 'square', 0.5, 28); this._noise(d, t + 0.18, 0.7, 0.25, 900, 120); break;   // loud crack + echo
      case 'headshot': this._tone(d, t, 1400, 0.09, 'square', 0.18, 700); this._noise(d, t, 0.08, 0.3, 3000, 600); break;
      case 'gun2': this._noise(d, t, 0.28, 0.8, 2600, 120); this._tone(d, t, 90, 0.25, 'square', 0.35, 35); break;
      case 'reload0': this._tone(d, t, 380, 0.04, 'square', 0.1); this._noise(d, t + 0.35, 0.05, 0.12, 1800, 900); this._tone(d, t + 0.75, 520, 0.05, 'square', 0.12); break;                       // pistol: mag out / in / slide
      case 'reload1': case 'reload3': this._noise(d, t, 0.06, 0.14, 900, 300); this._tone(d, t + 0.6, 300, 0.05, 'square', 0.12); this._noise(d, t + 1.1, 0.06, 0.16, 1500, 600); this._tone(d, t + 1.55, 560, 0.06, 'square', 0.14); break;   // rifle / SMG
      case 'reload2': for (let i = 0; i < 4; i++) { this._tone(d, t + i * 0.5, 260 + i * 25, 0.05, 'square', 0.12); this._noise(d, t + i * 0.5, 0.04, 0.08, 1200, 500); } this._tone(d, t + 2.3, 180, 0.08, 'square', 0.16); break;   // shotgun: shells one by one
      case 'reload4': this._tone(d, t, 240, 0.07, 'square', 0.14); this._noise(d, t + 0.7, 0.05, 0.14, 1300, 600); this._tone(d, t + 1.4, 300, 0.05, 'square', 0.12); this._tone(d, t + 2.3, 200, 0.09, 'square', 0.18); break;   // sniper: bolt work
      case 'cycle2': this._tone(d, t, 180, 0.06, 'square', 0.16); this._tone(d, t + 0.18, 140, 0.07, 'square', 0.18); break;       // pump
      case 'cycle4': this._tone(d, t, 210, 0.05, 'square', 0.16); this._noise(d, t + 0.25, 0.06, 0.14, 1400, 500); this._tone(d, t + 0.45, 150, 0.07, 'square', 0.18); break;   // bolt
      case 'reload': this._tone(d, t, 420, 0.05, 'square', 0.1); this._tone(d, t + 0.18, 300, 0.07, 'square', 0.12); this._tone(d, t + 0.4, 520, 0.05, 'square', 0.1); break;
      case 'empty': this._tone(d, t, 240, 0.04, 'square', 0.1); break;
      case 'throw': this._noise(d, t, 0.18, 0.18, 600, 1800, 'bandpass'); break;
      case 'boom': this._tone(d, t, 70, 0.9, 'sine', 0.9, 25); this._noise(d, t, 0.7, 0.9, 1800, 100); break;
      case 'storm': [330, 262, 196].forEach((f, i) => this._tone(this.sfx, t + i * 0.18, f, 0.3, 'sawtooth', 0.14)); break;
      case 'click': this._tone(this.sfx, t, 620, 0.05, 'square', 0.08); break;
      case 'beep': this._tone(this.sfx, t, 660, 0.12, 'square', 0.12); break;
      case 'go': this._tone(this.sfx, t, 990, 0.35, 'square', 0.16); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this._tone(this.sfx, t + i * 0.14, f, 0.4, 'triangle', 0.22)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this._tone(this.sfx, t + i * 0.18, f, 0.5, 'sawtooth', 0.12)); break;
      default: break;
    }
  }

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.beat = 0;
    this.musicTimer = setInterval(() => this._beat(), 420);
  }

  // city ambience: traffic rumble, passing cars, far-away police sirens
  startAmbience(kind) {
    this.stopAmbience();
    if (!this.ctx || kind !== 'city') return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 210;
    const g = ctx.createGain(); g.gain.value = 0.13;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start();
    const amb = { src, g, timers: [] };
    this.amb = amb;
    const later = (fn, lo, hi) => { const id = setTimeout(() => { if (this.amb !== amb) return; fn(); later(fn, lo, hi); }, (lo + Math.random() * (hi - lo)) * 1000); amb.timers.push(id); };
    later(() => {                       // siren wail (distant, filtered)
      if (ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.05, f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sawtooth'; og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.035, t + 0.8); og.gain.setValueAtTime(0.035, t + 4.2); og.gain.linearRampToValueAtTime(0.0001, t + 5.4);
      for (let k = 0; k < 6; k++) { o.frequency.linearRampToValueAtTime(k % 2 ? 640 : 1020, t + 0.45 + k * 0.85); }
      o.connect(f); f.connect(og); og.connect(this.master); o.start(t); o.stop(t + 5.6);
    }, 14, 30);
    later(() => { if (ctx.state === 'running') this._noise(this.master, ctx.currentTime + 0.05, 2.6, 0.07, 350, 1100, 'bandpass'); }, 5, 12);   // car passing by
    later(() => { if (ctx.state === 'running') { const t = ctx.currentTime + 0.05; this._tone(this.master, t, 520, 0.12, 'square', 0.03); this._tone(this.master, t + 0.18, 520, 0.12, 'square', 0.03); } }, 20, 45);    // distant horn
  }

  stopAmbience() {
    const a = this.amb;
    this.amb = null;
    if (!a) return;
    a.timers.forEach(clearTimeout);
    try { a.src.stop(); } catch { /* already stopped */ }
  }

  stopMusic() {
    this.stopAmbience();
    this.musicOn = false;
    clearInterval(this.musicTimer);
  }

  _beat() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.05;
    const b = this.beat++;
    const m = this.music;
    if (b % 2 === 0) this._tone(m, t, 120, 0.25, 'sine', 0.7, 45);
    if (b % 2 === 1) this._noise(m, t, 0.05, 0.08, 6000, null, 'highpass');
    if (b % 4 === 0) {
      const bass = [73.4, 73.4, 87.3, 65.4][(b / 4) % 4];
      this._tone(m, t, bass, 1.5, 'triangle', 0.35);
    }
    if (Math.random() < 0.6) {
      const scale = [293.7, 349.2, 392, 440, 523.3, 587.3, 698.5];
      this._tone(m, t, scale[Math.floor(Math.random() * scale.length)], 0.5, 'triangle', 0.1);
    }
  }
}
