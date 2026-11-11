import * as THREE from 'three';

// Pooled hit sparks, dust and shockwave rings.
export class Effects {
  constructor(scene, density = 1) {
    this.scene = scene;
    this.density = density;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    this.matCache = new Map();
    this.pool = [];
    const n = Math.max(20, Math.round(140 * density));
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mat(0xffffff));
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, max: 1, grav: 12 });
    }
    // bullet tracers + grenade explosions (Mini Royale weapons)
    this.tracGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    this.tracers = [];
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(this.tracGeo, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, depthWrite: false }));
      mesh.visible = false;
      this.group.add(mesh);
      this.tracers.push({ mesh, life: 0 });
    }
    this.boomGeo = new THREE.SphereGeometry(1, 12, 8);
    this.booms = [];
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(this.boomGeo, new THREE.MeshBasicMaterial({ color: 0xff9a1f, transparent: true, opacity: 0, depthWrite: false }));
      mesh.visible = false;
      this.group.add(mesh);
      this.booms.push({ mesh, life: 0, max: 0.4, r: 7 });
    }
    this.ringGeo = new THREE.RingGeometry(0.92, 1, 40);
    this.rings = [];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(this.ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ mesh, life: 0, max: 0.6, r: 6 });
    }
  }

  mat(c) {
    let m = this.matCache.get(c);
    if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); this.matCache.set(c, m); }
    return m;
  }

  spark(x, y, z, color, n = 8, speed = 5, grav = 12) {
    n = Math.max(1, Math.round(n * this.density));
    for (let i = 0; i < n; i++) {
      const p = this.pool.find((q) => q.life <= 0);
      if (!p) return;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      p.vx = Math.cos(a) * speed * (0.4 + Math.random() * 0.6);
      p.vz = Math.sin(a) * speed * (0.4 + Math.random() * 0.6);
      p.vy = 1 + e * speed * 0.6;
      p.life = p.max = 0.35 + Math.random() * 0.3;
      p.grav = grav;
      p.mesh.material = this.mat(color);
      p.mesh.position.set(x, y, z);
      p.mesh.scale.setScalar(1);
      p.mesh.visible = true;
    }
  }

  tracer(x, y, z, ex, ey, ez, color = 0xffe08a) {
    const t = this.tracers.find((q) => q.life <= 0) || this.tracers[0];
    const dx = ex - x, dy = ey - y, dz = ez - z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.2) return;
    t.life = 0.09;
    t.mesh.material.color.setHex(color);
    t.mesh.position.set(x + dx / 2, y + dy / 2, z + dz / 2);
    t.mesh.lookAt(ex, ey, ez);
    t.mesh.scale.set(1, 1, len);
    t.mesh.visible = true;
  }

  boom(x, y, z, r) {
    const b = this.booms.find((q) => q.life <= 0) || this.booms[0];
    b.life = b.max = 0.4;
    b.r = r;
    b.mesh.position.set(x, Math.max(0.3, y), z);
    b.mesh.visible = true;
    this.spark(x, Math.max(0.3, y), z, 0xffa000, 30, 9, 8);
    this.spark(x, Math.max(0.3, y), z, 0x555555, 12, 4, 3);
    this.ring(x, z, 0xff9a1f, r);
  }

  dust(x, z) { this.spark(x, 0.15, z, 0xcdbf9a, 6, 2.5, 4); }

  ring(x, z, color, radius) {
    const r = this.rings.find((q) => q.life <= 0) || this.rings[0];
    r.life = r.max = 0.6;
    r.r = radius;
    r.mesh.material.color.setHex(color);
    r.mesh.position.set(x, 0.12, z);
    r.mesh.visible = true;
  }

  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vy -= p.grav * dt;
      const m = p.mesh;
      m.position.x += p.vx * dt; m.position.y = Math.max(0.05, m.position.y + p.vy * dt); m.position.z += p.vz * dt;
      m.scale.setScalar(Math.max(0.05, p.life / p.max));
    }
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      t.mesh.material.opacity = Math.min(1, t.life / 0.09) * 0.9;
    }
    for (const b of this.booms) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) { b.mesh.visible = false; continue; }
      const k = 1 - b.life / b.max;
      b.mesh.scale.setScalar(Math.max(0.2, b.r * 0.55 * Math.sqrt(k)));
      b.mesh.material.opacity = 0.55 * (1 - k);
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(Math.max(0.1, r.r * k));
      r.mesh.material.opacity = 0.8 * (1 - k);
    }
  }

  dispose() {
    this.geo.dispose();
    this.ringGeo.dispose();
    this.tracGeo.dispose(); this.boomGeo.dispose();
    for (const t of this.tracers) t.mesh.material.dispose();
    for (const b of this.booms) b.mesh.material.dispose();
    for (const m of this.matCache.values()) m.dispose();
    for (const r of this.rings) r.mesh.material.dispose();
    this.scene.remove(this.group);
  }
}
