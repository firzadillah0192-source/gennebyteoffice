import * as THREE from "three";

// Denah satu lantai. x,z = pusat ruangan; w,d = lebar & kedalaman. Dinding belakang di z - d/2.
export const LAYOUT = {
  lobby:      { x: 0,   z: 0,  w: 50, d: 10, floor: 0xe9dfd0, wall: 0xcbb99d, wallH: 3, desk: { x: -4.6, z: -2.6 }, label: "Lobi" },
  gennexbyte: { x: -20, z: -9, w: 10, d: 8, floor: 0x1d2a44, wall: 0x2a3b5f, wallH: 4, desk: { x: 3.4, z: 0.0 }, label: "Gennexbyte" },
  nxchat:     { x: -10, z: -9, w: 10, d: 8, floor: 0xf0c9d6, wall: 0xd98fa8, wallH: 4, desk: { x: 3.7, z: -1.2 }, label: "NxChat" },
  nxbooth:    { x: 0,   z: -9, w: 10, d: 8, floor: 0xdcdcdc, wall: 0x9a9a9a, wallH: 4, desk: { x: 3.7, z: 2.0 }, label: "NxBooth" },
  socialhub:  { x: 10,  z: -9, w: 10, d: 8, floor: 0x3a2a4a, wall: 0x5a3f73, wallH: 4, desk: { x: 3.7, z: -1.4 }, label: "SocialHub" },
  "other-apps": { x: 20, z: -9, w: 10, d: 8, floor: 0xcfd8c3, wall: 0x8da07a, wallH: 4, desk: { x: -3.7, z: -1.0 }, label: "Lab Aplikasi" },
  finance:    { x: -20, z: 9,  w: 10, d: 8, floor: 0xd9cfa6, wall: 0x8a7a3b, wallH: 1.2, desk: { x: 0.8, z: -0.5 }, label: "Finance" },
  marketing:  { x: -10, z: 9,  w: 10, d: 8, floor: 0xf6dcc0, wall: 0xe58a3a, wallH: 1.2, desk: { x: 1.9, z: 0.0 }, label: "Marketing" },
  director:   { x: 15,  z: 9,  w: 20, d: 8, floor: 0x6b5a48, wall: 0x3d3228, wallH: 1.2, desk: { x: -6.2, z: 0.8 }, label: "Director" },
};
export const BUILDING = { w: 50, d: 26 };

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.8, ...o });
export function box(g, w, h, d, c, x, y, z, o) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o));
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}
function cyl(g, r, h, c, x, y, z, seg = 16, o) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(c, o));
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}
function ball(g, r, c, x, y, z, o) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(c, o));
  m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
}
const glow = (c) => ({ emissive: c, emissiveIntensity: 0.9 });

// Properti bertema per ruangan (koordinat lokal terhadap pusat ruangan).
const PROPS = {
  lobby(g) {                                              // ballroom + resepsionis + foyer ke pintu depan
    for (let x = -24; x <= 24; x += 2) for (let z = -4; z <= 4; z += 2)
      if (((x + z) / 2) % 2 === 0) box(g, 2, 0.02, 2, 0xf5efe4, x, 0, z);
    const foyer = box(g, 10, 0.2, 8, 0xe9dfd0, 0, -0.2, 9); foyer.userData.roomId = "lobby";   // lorong masuk (z 5..13)
    box(g, 2.6, 0.03, 12.4, 0xb0303a, 0, 0, 6.8);                                              // karpet merah ke pintu
    box(g, 6, 1.1, 1.4, 0x7a5a3a, -9, 0, -2.6); box(g, 6.2, 0.1, 1.6, 0xd8c39a, -9, 1.1, -2.6);   // meja resepsionis
    ball(g, 0.18, 0x2d84f5, -10.5, 1.45, -2.6, glow(0x2d84f5));
    cyl(g, 0.6, 0.1, 0xffd77a, 0, 3.0, -0.5, 24, glow(0xffd77a)); cyl(g, 0.03, 0.8, 0x555555, 0, 3.1, -0.5, 6);
    for (const x of [-22, 22, -14, 14]) { cyl(g, 0.5, 1.6, 0x6b8e5a, x, 0, 3.6); ball(g, 0.85, 0x4f7a43, x, 2.4, 3.6); }
    for (const x of [-4, 4]) { box(g, 2.6, 0.6, 1.0, 0x5a8ac0, x + 14, 0, 2.6); }
  },
  gennexbyte(g) {                                         // markas teknologi: rak server
    for (let i = -3; i <= 3; i++) {
      box(g, 0.9, 3, 1.1, 0x10151f, i * 1.15, 0, -3.2);
      for (let k = 0; k < 4; k++) box(g, 0.7, 0.08, 0.05, 0x39a0ff, i * 1.15, 0.6 + k * 0.6, -2.62, glow(0x39a0ff));
    }
    box(g, 4, 0.1, 1.4, 0x2a3b5f, 0, 0.75, 1.2); box(g, 1.4, 0.9, 0.08, 0x0b1020, 0, 0.95, 0.75, glow(0x1d6bff));
  },
  nxchat(g) {                                             // lounge: sofa & bubble
    box(g, 3.2, 0.7, 1.2, 0xc0587a, -1.8, 0, 0.5); box(g, 3.2, 0.9, 0.3, 0xa9456a, -1.8, 0.4, -0.05);
    box(g, 3.2, 0.7, 1.2, 0x5a8ac0, 1.8, 0, 2.2);
    cyl(g, 0.7, 0.45, 0xffffff, 0, 0, 1.2, 20);
    ball(g, 0.5, 0xffffff, -3, 2.8, -3.2, glow(0xffffff)); ball(g, 0.35, 0xffe0ec, -2.3, 2.3, -3.2, glow(0xffe0ec)); ball(g, 0.22, 0xffffff, -1.8, 1.9, -3.2);
    box(g, 2.2, 1.2, 0.12, 0x2a2a35, 2.6, 1.6, -3.7, glow(0x6f6f90));
  },
  nxbooth(g) {                                            // studio foto
    box(g, 6, 3.4, 0.1, 0xf4f1ea, 0, 0, -3.5);          // backdrop kertas
    cyl(g, 3, 0.06, 0xb1b1b1, 0, 0, -1.2, 32);
    for (const s of [-1, 1]) {
      cyl(g, 0.05, 2.4, 0x333333, s * 3.4, 0, 0.5, 6);
      box(g, 1.1, 1.1, 0.1, 0xffffff, s * 3.4, 2.0, 0.5, glow(0xfff6d6));
    }
    cyl(g, 0.04, 1.4, 0x222222, 0, 0, 2.4, 6); box(g, 0.6, 0.4, 0.4, 0x1a1a1a, 0, 1.4, 2.4); ball(g, 0.14, 0x4aa3ff, 0, 1.6, 2.2);
  },
  socialhub(g) {                                          // studio siaran
    box(g, 2.2, 0.9, 0.12, 0xd7263d, 0, 2.7, -3.7, glow(0xff3050));   // ON AIR
    for (let i = 0; i < 3; i++) box(g, 1.6, 1.1, 0.1, 0x101020, -3 + i * 1.8 + (i > 1 ? 2.8 : 0), 1.0, -3.7, glow([0x2d84f5, 0xf5842d, 0x2db36a][i]));
    box(g, 4, 0.9, 1.2, 0x2b2038, 0, 0, 1.0); cyl(g, 0.05, 0.6, 0x999999, -0.6, 0.9, 1.0, 8); ball(g, 0.14, 0x222222, -0.6, 1.55, 1.0);
  },
  "other-apps"(g) {                                       // lab pengembangan: dinding ide, meja cetak biru, rak prototipe
    box(g, 6.4, 2.2, 0.1, 0xf7f7f2, -0.5, 0.9, -3.7);                                          // dinding ide (papan besar)
    const notes = [0xffe066, 0xff9bb3, 0x8fd3ff, 0xb6f0a8, 0xffc48a, 0xd6b8ff, 0xffe066, 0x8fd3ff];
    notes.forEach((c, i) => box(g, 0.55, 0.55, 0.03, c, -3.0 + (i % 4) * 1.4, 1.1 + Math.floor(i / 4) * 0.9, -3.62));   // sticky notes
    box(g, 3.2, 0.9, 1.6, 0x6e5a3a, -0.5, 0, 0.6); box(g, 3.0, 0.03, 1.4, 0x2d6fd6, -0.5, 0.9, 0.6);                    // meja + cetak biru
    box(g, 0.5, 0.05, 0.4, 0xffffff, -1.2, 0.93, 0.5); cyl(g, 0.03, 0.4, 0xe5484d, 0.2, 0.93, 0.7, 6);
    cyl(g, 0.02, 0.9, 0x555555, -0.5, 2.9, 0.6, 6);                                              // bohlam ide menggantung
    ball(g, 0.3, 0xfff2a8, -0.5, 2.7, 0.6, glow(0xffe066));
    for (let r = 0; r < 2; r++) box(g, 2.2, 0.1, 0.8, 0x6e5a3a, 3.4, 0.6 + r * 0.9, -2.9);       // rak prototipe
    [0xe85d75, 0x4aa3ff, 0xffc145].forEach((c, i) => box(g, 0.45, 0.4, 0.45, c, 2.7 + i * 0.7, 0.72 + (i % 2) * 0.9, -2.9));
  },
  finance(g) {                                            // bank / brankas
    cyl(g, 1.5, 0.5, 0x8d98a6, 0, 0.0, -2.6, 32).rotation.x = Math.PI / 2;
    const door = g.children[g.children.length - 1]; door.position.set(0, 1.7, -3.2);
    cyl(g, 0.3, 0.2, 0xd7b24a, 0, 0, 0, 12).position.set(0, 1.7, -2.9);
    g.children[g.children.length - 1].rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) cyl(g, 0.42, 0.14, 0xffc933, 3 + (i % 2) * 0.1, i * 0.14, 1.0, 20, glow(0x6b4f00));
    for (let i = 0; i < 3; i++) cyl(g, 0.42, 0.14, 0xffc933, 3.9, i * 0.14, 1.9, 20, glow(0x6b4f00));
    box(g, 3.4, 0.9, 1.0, 0x6d5a2a, -2.2, 0, 1.4); box(g, 0.6, 0.12, 0.45, 0x222222, -3.0, 0.95, 1.4);
    [0.5, 0.9, 0.7, 1.3].forEach((h, i) => box(g, 0.28, h, 0.28, 0x2db36a, -1.5 + i * 0.45, 0.9, 1.4));
  },
  marketing(g) {                                          // agensi kreatif
    box(g, 4.4, 2.2, 0.15, 0xffffff, 0, 0.9, -3.5);
    [0xe5484d, 0x2d84f5, 0xffc145, 0x2db36a, 0x9b5de5, 0xff7ab8].forEach((c, i) => box(g, 0.9, 0.9, 0.05, c, -1.6 + (i % 3) * 1.1, 1.0 + Math.floor(i / 3) * 1.0, -3.4));
    cyl(g, 0.05, 1.6, 0x444444, 3.2, 0, -2.4, 6); cyl(g, 0.35, 0.6, 0xf5842d, 3.2, 1.6, -2.4, 12).rotation.z = Math.PI / 2;
    box(g, 3, 0.8, 1.2, 0xffe6cc, -1.5, 0, 1.4);
  },
  director(g) {                                           // ruang rapat eksekutif
    box(g, 5.6, 0.2, 1.8, 0x2b2118, 0, 0.9, 0.4); box(g, 5.0, 0.9, 0.5, 0x2b2118, 0, 0, 0.4);
    for (const x of [-2, -0.7, 0.7, 2]) { box(g, 0.7, 0.6, 0.7, 0x151515, x, 0, -0.9); box(g, 0.7, 0.6, 0.7, 0x151515, x, 0, 1.7); }
    box(g, 4.6, 2.2, 0.12, 0x0b0f1a, 0, 1.0, -3.7, glow(0x274a8a));
    cyl(g, 0.12, 0.3, 0xd7b24a, 0, 1.1, 0.4, 12);
    box(g, 3.2, 0.7, 1.2, 0x5c4a3a, 6.4, 0, 1.6); box(g, 3.2, 0.9, 0.3, 0x4a3a2c, 6.4, 0.4, 1.05);             // sudut santai: sofa & meja kopi
    box(g, 3.2, 0.7, 1.2, 0x5c4a3a, 6.4, 0, -1.4); cyl(g, 0.7, 0.4, 0x2b2118, 6.4, 0, 0.1, 20);
    for (const x of [-8.6, 8.6]) { cyl(g, 0.4, 1.4, 0x6b8e5a, x, 0, -2.8); ball(g, 0.75, 0x4f7a43, x, 2.0, -2.8); }
    box(g, 3.4, 2.0, 0.12, 0x0b0f1a, -6.4, 1.0, -3.7, glow(0x1d3d78));
  },
};

function wallGap(g, width, h, color, z, gap) {         // dinding sejajar sumbu x dengan celah pintu di tengah
  const seg = (width - gap) / 2;
  box(g, seg, h, 0.2, color, -(gap / 2 + seg / 2), 0, z); box(g, seg, h, 0.2, color, gap / 2 + seg / 2, 0, z);
  box(g, gap, 0.04, 0.5, 0x8a6a3a, 0, 0, z);                                          // ambang pintu
}

// Meja kerja + laptop + kursi. Karyawan "working" duduk di kursi (sisi selatan meja) menghadap utara; layar laptop menghadap selatan (ke kamera) dan menyala saat dipakai.
function workstation(g, d) {
  const wood = 0x8a6a45, dark = 0x2a2f3a;
  box(g, 1.7, 0.08, 0.85, wood, d.x, 0.68, d.z);
  for (const sx of [-0.78, 0.78]) for (const sz of [-0.36, 0.36]) box(g, 0.06, 0.68, 0.06, 0x5b4630, d.x + sx, 0, d.z + sz);
  box(g, 0.54, 0.03, 0.36, 0x9aa3b2, d.x, 0.76, d.z + 0.02);                                    // badan laptop
  box(g, 0.34, 0.012, 0.1, 0x6b7385, d.x, 0.79, d.z + 0.1);                                      // papan ketik
  const lid = new THREE.Group(); lid.position.set(d.x, 0.79, d.z - 0.15); lid.rotation.x = -0.24; g.add(lid);   // tutup laptop, miring ke belakang
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.36, 0.02), mat(0x9aa3b2)); shell.position.set(0, 0.18, 0); shell.castShadow = true; lid.add(shell);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x0b1020, emissive: 0x4aa3ff, emissiveIntensity: 0.12 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.3), screenMat); screen.position.set(0, 0.18, 0.012); lid.add(screen);
  g.userData.screen = screenMat;
  cyl(g, 0.05, 0.1, 0xe8e2d6, d.x + 0.62, 0.76, d.z + 0.1, 10);                                  // cangkir kopi
  box(g, 0.5, 0.06, 0.5, dark, d.x, 0.44, d.z + 1.05);                                           // dudukan kursi
  box(g, 0.5, 0.5, 0.06, dark, d.x, 0.5, d.z + 1.3);                                             // sandaran (sisi selatan, di belakang yang duduk)
  cyl(g, 0.04, 0.44, 0x555b66, d.x, 0, d.z + 1.05, 8); cyl(g, 0.22, 0.04, 0x555b66, d.x, 0, d.z + 1.05, 12);   // tiang & kaki kursi
}
export function buildRoom(id) {
  const L = LAYOUT[id], g = new THREE.Group(); g.position.set(L.x, 0, L.z);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(L.w, 0.2, L.d), mat(L.floor));
  floor.position.y = -0.1; floor.receiveShadow = true; floor.userData.roomId = id; g.add(floor);
  const sideH = id === "lobby" ? 3 : 2.6;
  box(g, 0.2, sideH, L.d, L.wall, -L.w / 2 + 0.1, 0, 0); box(g, 0.2, sideH, L.d, L.wall, L.w / 2 - 0.1, 0, 0);   // sekat samping
  if (id !== "lobby") {
    const isTop = L.z < 0;
    if (isTop) { box(g, L.w, L.wallH, 0.2, L.wall, 0, 0, -L.d / 2 + 0.1);                          // dinding luar utara
                 wallGap(g, L.w, 1.0, L.wall, L.d / 2 - 0.1, 3.4); }                              // sisi lobi, ada pintu
    else wallGap(g, L.w, 1.0, L.wall, -L.d / 2 + 0.1, 3.4);                                         // sisi lobi, ada pintu
  }
  PROPS[id]?.(g);
  if (L.desk) workstation(g, L.desk);
  g.userData.roomId = id;
  return g;
}

export const shortRole = (role) => String(role || "").split(/[:·—]/)[0].trim().slice(0, 30);   // "Pemantau platform: patroli..." -> "Pemantau platform"
export function labelSprite(text, { size = 64, color = "#fff", bg = "rgba(20,24,34,.75)", scale = 0.02, sub = "" } = {}) {
  const c = document.createElement("canvas"), x = c.getContext("2d"), subSize = Math.round(size * 0.58);
  x.font = `700 ${size}px system-ui, sans-serif`; let w = Math.ceil(x.measureText(text).width);
  if (sub) { x.font = `500 ${subSize}px system-ui, sans-serif`; w = Math.max(w, Math.ceil(x.measureText(sub).width)); }
  c.width = w + 40; c.height = size + 28 + (sub ? subSize + 6 : 0);
  x.fillStyle = bg; x.beginPath(); x.roundRect(0, 0, c.width, c.height, 24); x.fill();
  x.fillStyle = color; x.textBaseline = "middle"; x.font = `700 ${size}px system-ui, sans-serif`; x.fillText(text, 20, 14 + size / 2 + 2);
  if (sub) { x.fillStyle = "#b9c3d9"; x.font = `500 ${subSize}px system-ui, sans-serif`; x.fillText(sub, 20, 14 + size + subSize / 2 + 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(c.width * scale, c.height * scale, 1); s.userData.base = s.scale.clone(); s.renderOrder = 10; return s;
}
