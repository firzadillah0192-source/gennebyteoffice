import * as THREE from "three";
import { LAYOUT, labelSprite, shortRole } from "./rooms.js";

export const STATUS_COLOR = { working: 0x2d84f5, idle: 0x9aa3b2, waiting_user: 0xf5a623, error: 0xe5484d, done: 0x2db36a };
export const SHAPES = ["sphere","rounded_cube","pill","triangle","cone","pentagon","hexagon","star4","star6","clover","rounded_square","trio"];

function starGeo(points, outer = 0.55, inner = 0.26) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer, a = (i / (points * 2)) * Math.PI * 2;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0); return g;
}

function bodyFor(shape, color) {
  const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6 });
  const mk = (geo, y = 0.55) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = true; return o; };
  switch (shape) {
    case "rounded_cube": return mk(new THREE.BoxGeometry(0.85, 0.85, 0.85));
    case "pill": return mk(new THREE.CapsuleGeometry(0.34, 0.6, 4, 12), 0.65);
    case "triangle": return mk(new THREE.CylinderGeometry(0.6, 0.6, 0.75, 3));
    case "cone": return mk(new THREE.ConeGeometry(0.55, 1.0, 16), 0.6);
    case "pentagon": return mk(new THREE.CylinderGeometry(0.55, 0.55, 0.8, 5));
    case "hexagon": return mk(new THREE.CylinderGeometry(0.55, 0.55, 0.8, 6));
    case "star4": return mk(starGeo(4), 0.35);
    case "star6": return mk(starGeo(6), 0.35);
    case "rounded_square": return mk(new THREE.BoxGeometry(0.95, 0.6, 0.95), 0.4);
    case "clover": { const g = new THREE.Group(); for (const [x, z] of [[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]]) { const b = mk(new THREE.SphereGeometry(0.28, 12, 10)); b.position.set(x, 0.5, z); g.add(b); } return g; }
    case "trio": { const g = new THREE.Group(); [[-.3,.0,.4],[.3,.0,.4],[0,.25,.75]].forEach(([x,z,y]) => { const b = mk(new THREE.SphereGeometry(0.28, 12, 10)); b.position.set(x, y, z); g.add(b); }); return g; }
    default: return mk(new THREE.SphereGeometry(0.5, 20, 16));
  }
}

function accessory(kind) {
  const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x20242e });
  if (kind === "glasses") for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 16), dark); t.position.set(s * 0.17, 0.7, 0.5); g.add(t); }
  if (kind === "stem") { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0x3a7d2a })); c.position.y = 1.25; g.add(c);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0x4caf50 })); l.scale.set(1.6, 0.5, 1); l.position.set(0.12, 1.4, 0); g.add(l); }
  if (kind === "antenna") { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), dark); c.position.y = 1.25; g.add(c);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe5484d, emissive: 0xe5484d })); b.position.y = 1.5; g.add(b); }
  if (kind === "bow") { const p = new THREE.MeshStandardMaterial({ color: 0xff6fa8 });
    for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 8), p); c.rotation.z = s * Math.PI / 2; c.position.set(s * 0.16, 1.2, 0.05); g.add(c); }
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), p); k.position.set(0, 1.2, 0.05); g.add(k); }
  return g;
}

export class Bot {
  constructor(data) {
    this.id = data.id; this.data = data; this.root = new THREE.Group();
    const look = data.look || {}, color = new THREE.Color(look.color || "#2D84F5");
    this.body = new THREE.Group(); this.body.add(bodyFor(look.shape, color));
    const eyeM = new THREE.MeshStandardMaterial({ color: 0x14161c });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeM); e.position.set(s * 0.17, 0.62, 0.46); this.body.add(e); }
    this.body.add(accessory(look.accessory));
    this.root.add(this.body);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: STATUS_COLOR.idle }));
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.04; this.root.add(this.ring);
    this.name = labelSprite(data.name, { size: 52, scale: 0.012, sub: shortRole(data.role) }); this.name.position.y = 1.9; this.root.add(this.name);
    this.bang = labelSprite("!", { size: 90, color: "#1c1400", bg: "#f5a623", scale: 0.01 }); this.bang.position.y = 2.5; this.bang.visible = false; this.root.add(this.bang);
    this.root.traverse((o) => { o.userData.botId = this.id; });
    this.target = null; this.nextWander = 0; this.hop = 0; this.status = "idle"; this.facing = 0;
    this.at = data.room; this.dest = data.room; this.seated = false; this.seatY = 0; this.path = []; this.visitRoom = null; this.visitUntil = 0; this.bubbles = {};
    const L = LAYOUT[data.room]; this.root.position.set(L.x + (Math.random() - .5) * (L.w - 3), 0, L.z + (Math.random() - .5) * (L.d - 3));
  }
  setData(d) {
    this.data = d; this.status = d.effective_status; this.ring.material.color.setHex(d.offline ? 0x3a3d46 : (STATUS_COLOR[this.status] ?? STATUS_COLOR.idle)); this.bang.visible = this.status === "waiting_user" && !d.offline;
    this.visitRoom = d.visit_room || null; this.visitUntil = d.visit_room ? Date.now() + (d.visit_ms || 0) : 0;      // kunjungan (serah-terima) berlangsung beberapa detik
  }
  // titik kerja: bot "working" berdiri dekat bagian tengah-belakang ruangannya
  workSpot(index) { const L = LAYOUT[this.data.room];
    if (L.desk) return index === 0 ? new THREE.Vector3(L.x + L.desk.x, 0, L.z + L.desk.z + 1.05)   // kursi di depan meja laptop
      : new THREE.Vector3(L.x + L.desk.x - 1.3 * index, 0, L.z + L.desk.z + 1.6);                      // yang kedua berdiri di samping
    if (this.data.room === "lobby") return new THREE.Vector3(-9 + ((index % 3) - 1) * 1.4, 0, -0.9); return new THREE.Vector3(L.x + ((index % 3) - 1) * 1.6, 0, L.z + 0.4 + Math.floor(index / 3) * 1.2); }
  // pintu tiap ruangan menghadap lobi: baris atas di z=-5, baris bawah di z=+5 (celah di tengah dinding)
  inner(r) { const L = LAYOUT[r]; return new THREE.Vector3(L.x, 0, L.z < 0 ? L.z + L.d / 2 - 0.9 : L.z - L.d / 2 + 0.9); }
  outer(r) { const L = LAYOUT[r]; return new THREE.Vector3(L.x, 0, L.z < 0 ? L.z + L.d / 2 + 0.7 : L.z - L.d / 2 - 0.7); }
  route(from, to) {                                                                  // keluar lewat pintu -> lobi -> masuk lewat pintu tujuan
    const pts = [];
    if (from !== "lobby") pts.push(this.inner(from), this.outer(from));
    if (to !== "lobby") { const L = LAYOUT[to]; pts.push(new THREE.Vector3(L.x, 0, 0), this.outer(to), this.inner(to), new THREE.Vector3(L.x + (Math.random() - .5) * 3, 0, L.z + (Math.random() - .5) * 2)); }
    else pts.push(new THREE.Vector3(-9 + (Math.random() - .5) * 4, 0, -0.9));
    return pts;
  }
  bubble(text) {
    for (const [k, sp] of Object.entries(this.bubbles)) sp.visible = k === text;
    if (text && !this.bubbles[text]) { const sp = labelSprite(text, { size: 40, bg: "rgba(45,132,245,.92)", scale: 0.011 }); sp.position.y = 2.55; this.root.add(sp); this.bubbles[text] = sp; }
  }
  update(dt, t, index, workIdx = 0) {
    const p = this.root.position;
    const visiting = !!this.visitRoom && Date.now() < this.visitUntil, want = visiting ? this.visitRoom : this.data.room;
    if (want !== this.dest) { this.path = this.route(this.at, want); this.dest = want; this.target = null; }
    let speed = 2.2, moving = false;
    this.bubble(visiting ? `Handover → ${LAYOUT[this.visitRoom]?.label ?? ""}` : "");
    if (this.path.length) { this.target = this.path[0]; speed = 4.8; }                                    // berlari antar ruangan
    else {
      this.at = this.dest; const L = LAYOUT[this.at], home = this.at === this.data.room;
      if (home && this.status === "working") this.target = this.workSpot(workIdx);
      else if (home && this.status === "waiting_user") this.target = new THREE.Vector3(L.x + ((index % 3) - 1) * 1.6, 0, L.z + L.d / 2 - 1.2);
      else if (home && (this.status === "error" || this.status === "done")) this.target = null;
      else if (t > this.nextWander || !this.target) {                                                    // idle / sedang berkunjung: jalan-jalan acak
        this.target = this.at === "lobby" ? new THREE.Vector3(-9 + (Math.random() - .5) * 5, 0, -0.9 + (Math.random() - .5) * 1.6)
          : new THREE.Vector3(L.x + (Math.random() - .5) * (L.w - 3), 0, L.z + (Math.random() - .5) * (L.d - 3));
        this.nextWander = t + 3 + Math.random() * 5;
      }
    }
    if (this.target) {
      const dx = this.target.x - p.x, dz = this.target.z - p.z, dist = Math.hypot(dx, dz);
      if (dist > 0.15) { const step = Math.min(dist, speed * dt); p.x += (dx / dist) * step; p.z += (dz / dist) * step; this.facing = Math.atan2(dx, dz); moving = true; }
      else if (this.path.length) { this.path.shift(); if (!this.path.length) this.at = this.dest; }
    }
    const LL = LAYOUT[this.data.room], seat = LL.desk && this.status === "working" && workIdx === 0 && this.at === this.data.room && !this.path.length ? this.workSpot(0) : null;
    this.seated = !!seat && Math.hypot(seat.x - p.x, seat.z - p.z) < 0.2;
    if (this.seated) this.facing = Math.PI;                                                   // menghadap meja (utara)
    this.seatY += ((this.seated ? 0.34 : 0) - this.seatY) * Math.min(1, dt * 8);
    let da = this.facing - this.body.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); this.body.rotation.y += da * Math.min(1, dt * 10);
    const home = this.at === this.data.room && !this.path.length;
    let y = 0, tilt = 0;
    if (moving) y = Math.abs(Math.sin(t * (this.path.length ? 14 : 10))) * 0.18;                         // melangkah / berlari
    else if (home && this.status === "working") { if (this.seated) { y = Math.abs(Math.sin(t * 13)) * 0.025; tilt = Math.sin(t * 11) * 0.045; } else { y = Math.abs(Math.sin(t * 6)) * 0.08; tilt = Math.sin(t * 6) * 0.06; } }   // mengetik / bekerja
    else if (home && this.status === "error") tilt = Math.sin(t * 40) * 0.12;
    else if (home && this.status === "done") y = Math.abs(Math.sin(t * 4)) * 0.5;
    else if (home && this.status === "waiting_user") y = Math.abs(Math.sin(t * 5)) * 0.25;
    else y = Math.sin(t * 2 + index) * 0.03;
    this.body.position.y = y + this.seatY; this.body.rotation.z = tilt;
    this.bang.position.y = 2.5 + Math.sin(t * 6) * 0.1;
  }
}
