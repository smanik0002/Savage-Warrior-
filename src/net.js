// Thin Socket.IO client wrapper.
import { io } from 'socket.io-client';

export class Net {
  constructor() { this.sock = null; this.h = {}; this.rtt = 60; this.timer = null; }

  on(name, fn) { this.h[name] = fn; }
  emitLocal(name, data) { if (this.h[name]) this.h[name](data); }

  connect(url, timeout = 4000) {
    this.close();
    return new Promise((resolve, reject) => {
      const s = io(url, { transports: ['websocket', 'polling'], reconnection: false, timeout });
      this.sock = s;
      const guard = setTimeout(() => { s.close(); reject(new Error('timeout')); }, timeout + 500);
      s.on('connect', () => { clearTimeout(guard); resolve(); });
      s.on('connect_error', (e) => { clearTimeout(guard); reject(e); });
      for (const ev of ['lobby', 'start', 'snap', 'end']) s.on(ev, (d) => this.emitLocal(ev, d));
      s.on('disconnect', () => { clearInterval(this.timer); this.emitLocal('disconnect'); });
      this.timer = setInterval(() => {
        if (!s.connected) return;
        const t = performance.now();
        s.emit('rtt', () => { this.rtt = performance.now() - t; });
      }, 2000);
    });
  }

  join(p) { if (this.sock) this.sock.emit('join', p); }
  sendInput(i) { if (this.sock && this.sock.connected) this.sock.volatile.emit('input', i); }
  leave() { if (this.sock && this.sock.connected) this.sock.emit('leave'); }
  close() {
    clearInterval(this.timer);
    if (this.sock) { this.sock.removeAllListeners(); this.sock.close(); this.sock = null; }
  }
}
