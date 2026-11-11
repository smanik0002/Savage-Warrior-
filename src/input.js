// Keyboard + mouse (pointer lock) + touch controls (joystick, look zone, buttons).
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Input {
  constructor(canvas, settings, cb) {
    this.canvas = canvas;
    this.settings = settings;
    this.cb = cb;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;            // look-up positive
    this.edge = { jump: false, punch: false, kick: false, shock: false, dodge: false, fireEdge: false, reload: false, nade: false, fmode: false, interact: false, heal: false };
    this.nadeAim = false;      // G held: show the throwing arc, release to throw
    this.zoomMul = 1;          // lower mouse sensitivity while zoomed / scoped
    this.wsel = -2;            // weapon select edge: -1 fists, 0..2 guns, -2 = none
    this.mouseBlock = false;
    this.touchBlock = false;
    this.mouseFire = false; this.mouseAds = false;
    this.touchFire = false; this.touchAds = false;
    this.crouch = false; this.runT = false;
    this.gunMode = false;      // set by Game each frame: a gun is equipped (LMB fires, RMB aims)
    this.joy = { x: 0, y: 0 };
    this.locked = false;
    this.wasLocked = false;
    this.fallback = false;     // pointer lock unavailable -> arrow keys rotate camera
    this.enabled = false;
    this.isTouch = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
    this.lockFails = 0;

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseBlock = false; this.mouseFire = false; this.mouseAds = false; this.nadeAim = false; });
    window.addEventListener('wheel', (e) => { if (this.enabled && this.locked && this.gunMode && this.cb.onZoom) this.cb.onZoom(e.deltaY < 0 ? 1 : -1, false); }, { passive: true });
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => { if (e.button === 2) { this.mouseBlock = false; this.mouseAds = false; } if (e.button === 0) this.mouseFire = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.lockFails = 0;
      if (!this.locked && this.wasLocked && this.enabled) this.cb.onUnlock();
      this.wasLocked = this.locked;
    });
    document.addEventListener('pointerlockerror', () => this.lockFailed());
    if (this.isTouch) this.setupTouch();
  }

  clearHeld() { this.keys.clear(); this.mouseBlock = false; this.touchBlock = false; this.mouseFire = false; this.mouseAds = false; this.touchFire = false; this.touchAds = false; this.crouch = false; this.runT = false; this.wsel = -2; this.nadeAim = false; }

  get active() { return this.enabled && (this.isTouch || this.locked || this.fallback); }
  get needsClick() { return this.enabled && !this.isTouch && !this.locked && !this.fallback; }

  lock() {
    if (this.isTouch) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => this.lockFailed());
    } catch { this.lockFailed(); }
  }

  lockFailed() {
    this.lockFails++;
    if (this.lockFails >= 3 && !this.fallback) { this.fallback = true; this.cb.onLockFail(); }
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  onKey(e, down) {
    if (!down) this.keys.delete(e.code);
    if (!down && e.code === 'KeyG' && this.nadeAim) { this.nadeAim = false; if (this.enabled) this.edge.nade = true; }
    if (!this.enabled) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    const c = e.code;
    if (down) {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(c)) e.preventDefault();
      if (!e.repeat) {
        if (c === 'Space') this.edge.jump = true;
        else if (c === 'KeyE' || c === 'KeyK') this.edge.kick = true;
        else if (c === 'KeyQ' || c === 'KeyL') this.edge.shock = true;
        else if (c === 'KeyV') this.edge.dodge = true;
        else if (c === 'KeyJ') this.edge.punch = true;
        else if (c === 'KeyT') this.cb.onToggleView();
        else if (c === 'KeyR') this.edge.reload = true;
        else if (c === 'KeyG') this.nadeAim = true;
        else if (c === 'KeyB') this.edge.fmode = true;
        else if (c === 'KeyX') this.edge.interact = true;
        else if (c === 'KeyH') this.edge.heal = true;
        else if (c === 'Tab' || c === 'KeyI') { if (this.cb.onToggleBag) this.cb.onToggleBag(); }
        else if (c === 'KeyZ') { if (this.cb.onZoom) this.cb.onZoom(1, true); }
        else if (c === 'F3') { if (this.cb.onToggleFps) this.cb.onToggleFps(); }
        else if (c === 'KeyC') this.crouch = !this.crouch;
        else if (c === 'KeyM') { if (this.cb.onToggleMap) this.cb.onToggleMap(); }
        else if (c === 'Digit1') this.wsel = 0;
        else if (c === 'Digit2') this.wsel = 1;
        else if (c === 'Digit3') this.wsel = 2;
        else if (c === 'Digit4') this.wsel = -1;
        else if (c === 'Digit5') this.wsel = 3;
        else if (c === 'Digit6') this.wsel = 4;
        else if (c === 'Enter') this.cb.onSkip();
      }
      this.keys.add(c);
    }
  }

  onMouseDown(e) {
    if (!this.enabled) return;
    if (this.needsClick) { this.lock(); return; }
    if (e.button === 0) {
      if (this.gunMode) { this.mouseFire = true; this.edge.fireEdge = true; } else this.edge.punch = true;
    } else if (e.button === 2) {
      if (this.gunMode) this.mouseAds = true; else this.mouseBlock = true;
    }
  }

  onMouseMove(e) {
    if (!this.enabled || !this.locked) return;
    const k = 0.0022 * this.settings.sens * this.zoomMul;
    this.yaw -= e.movementX * k;
    this.pitch = clamp(this.pitch - e.movementY * k, -0.9, 0.9);
  }

  setupTouch() {
    const zone = $('joyZone'), knob = $('joyKnob'), look = $('lookZone');
    let joyId = null, cx = 0, cy = 0;
    const joyMove = (t) => {
      let x = (t.clientX - cx) / 50, y = (t.clientY - cy) / 50;
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      this.joy.x = x; this.joy.y = y;
      knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
    };
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyId = t.identifier;
      const r = zone.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      joyMove(t);
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === joyId) joyMove(t);
    }, { passive: false });
    const joyEnd = (e) => {
      for (const t of e.changedTouches) if (t.identifier === joyId) {
        joyId = null; this.joy.x = 0; this.joy.y = 0; knob.style.transform = 'translate(0,0)';
      }
    };
    zone.addEventListener('touchend', joyEnd);
    zone.addEventListener('touchcancel', joyEnd);

    let lookId = null, lx = 0, ly = 0;
    look.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      lookId = t.identifier; lx = t.clientX; ly = t.clientY;
    }, { passive: false });
    look.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === lookId) {
        const k = 0.006 * this.settings.sens * this.zoomMul;
        this.yaw -= (t.clientX - lx) * k;
        this.pitch = clamp(this.pitch - (t.clientY - ly) * k, -0.9, 0.9);
        lx = t.clientX; ly = t.clientY;
      }
    }, { passive: false });
    const lookEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
    look.addEventListener('touchend', lookEnd);
    look.addEventListener('touchcancel', lookEnd);

    const editing = () => $('touchUI').classList.contains('editing');
    document.querySelectorAll('.tbtn').forEach((b) => {
      const act = b.dataset.act;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (editing()) return;
        if (act === 'block') this.touchBlock = true;
        else if (act === 'fire') { if (this.gunMode) { this.touchFire = true; this.edge.fireEdge = true; } else this.edge.punch = true; }
        else if (act === 'ads') { this.touchAds = !this.touchAds; b.classList.toggle('on', this.touchAds); }
        else if (act === 'nade') this.nadeAim = true;
        else if (act === 'bag') { if (this.cb.onToggleBag) this.cb.onToggleBag(); }
        else if (act === 'zoom') { if (this.cb.onZoom) this.cb.onZoom(1, true); }
        else if (act === 'crouch') { this.crouch = !this.crouch; b.classList.toggle('on', this.crouch); }
        else if (act === 'run') { this.runT = !this.runT; b.classList.toggle('on', this.runT); }
        else this.edge[act] = true;
      }, { passive: false });
      const end = () => { if (act === 'block') this.touchBlock = false; if (act === 'fire') this.touchFire = false; if (act === 'nade' && this.nadeAim) { this.nadeAim = false; this.edge.nade = true; } };
      b.addEventListener('touchend', end);
      b.addEventListener('touchcancel', end);
    });
    document.querySelectorAll('.wsb').forEach((b) => {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); if (!editing()) this.wsel = Number(b.dataset.wep); }, { passive: false });
    });
  }

  // Called once per rendered frame. Returns a sim input; world-space move vector is built from camera yaw.
  sample(dt = 0.016) {
    const out = { dx: 0, dz: 0, yaw: this.yaw, sprint: false, block: false, jump: false, punch: false, kick: false, shock: false, dodge: false,
      pitch: this.pitch, tps: false, crouch: false, ads: false, fire: false, fireEdge: false, reload: false, nade: false, wsel: -2 };
    if (!this.active) { for (const k in this.edge) this.edge[k] = false; this.wsel = -2; return out; }
    const k = this.keys;
    let f = 0, r = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD')) r += 1;
    if (k.has('KeyA')) r -= 1;
    if (this.isTouch) { f += -this.joy.y; r += this.joy.x; }
    if (k.has('ArrowLeft')) this.yaw += 1.8 * dt;
    if (k.has('ArrowRight')) this.yaw -= 1.8 * dt;
    const l = Math.hypot(f, r);
    if (l > 1) { f /= l; r /= l; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    out.yaw = this.yaw;
    out.dx = sy * f - cy * r;
    out.dz = cy * f + sy * r;
    out.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || (this.isTouch && l > 0.95) || (this.runT && l > 0.05);
    out.block = k.has('KeyF') || this.mouseBlock || this.touchBlock;
    out.pitch = this.pitch;
    out.tps = this.cb.getView ? this.cb.getView() === 'tps' : false;
    out.crouch = this.crouch;
    out.ads = (this.mouseAds || this.touchAds) && this.gunMode;
    out.fire = (this.mouseFire || this.touchFire) && this.gunMode;
    out.wsel = this.wsel; this.wsel = -2;
    for (const key in this.edge) { out[key] = this.edge[key]; this.edge[key] = false; }
    return out;
  }
}
