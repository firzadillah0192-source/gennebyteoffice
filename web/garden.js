import * as THREE from "three";
import { box } from "./rooms.js";

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9, ...o });
function add(g, geo, m, x, y, z, shadow = true) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; g.add(o); return o; }
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;     // acak yang selalu sama

function tree(g, x, z) {
  const s = 0.8 + rnd() * 0.9, pine = rnd() > 0.5;
  add(g, new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 1.4 * s, 6), mat(0x7a5230), x, 0.7 * s, z);
  if (pine) { add(g, new THREE.ConeGeometry(1.1 * s, 2.2 * s, 8), mat(0x2f7d4a), x, 2.2 * s, z); add(g, new THREE.ConeGeometry(0.8 * s, 1.7 * s, 8), mat(0x3a9157), x, 3.3 * s, z); }
  else add(g, new THREE.SphereGeometry(1.3 * s, 10, 8), mat(0x4aa564), x, 2.3 * s, z);
}
function bush(g, x, z, c = 0x58b368) { add(g, new THREE.SphereGeometry(0.55, 8, 6), mat(c), x, 0.4, z); }
function lamp(g, x, z) {
  add(g, new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), mat(0x3b3f48), x, 1.2, z);
  add(g, new THREE.SphereGeometry(0.22, 8, 6), mat(0xfff0b8, { emissive: 0xffe08a, emissiveIntensity: 0.9 }), x, 2.5, z, false);
}
function bench(g, x, z, rotY = 0) {
  const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = rotY; g.add(b);
  box(b, 1.8, 0.1, 0.5, 0x8a5a30, 0, 0.45, 0); box(b, 1.8, 0.5, 0.08, 0x8a5a30, 0, 0.7, -0.22);
  box(b, 0.08, 0.45, 0.4, 0x333333, -0.8, 0, 0); box(b, 0.08, 0.45, 0.4, 0x333333, 0.8, 0, 0);
}
function car(g, x, z, c) {
  const a = new THREE.Group(); a.position.set(x, 0, z); g.add(a);
  box(a, 2.0, 0.6, 4.0, c, 0, 0.25, 0); box(a, 1.7, 0.55, 2.0, 0xbfd9ea, 0, 0.85, -0.2);
  for (const [dx, dz] of [[-1, -1.2], [1, -1.2], [-1, 1.2], [1, 1.2]]) { const w = add(a, new THREE.CylinderGeometry(0.33, 0.33, 0.25, 10), mat(0x1b1b1b), dx, 0.33, dz); w.rotation.z = Math.PI / 2; }
}

// Gedung: fondasi, dinding depan (selatan) dengan pintu masuk, lalu seluruh halaman & taman di luarnya.
export function buildSurroundings(BUILDING) {
  const g = new THREE.Group(), W = BUILDING.w, D = BUILDING.d, hx = W / 2, hz = D / 2;

  // rumput + pelataran beton di sekeliling gedung
  add(g, new THREE.PlaneGeometry(260, 200), mat(0x8cc084), 0, -0.3, 0, false).rotation.x = -Math.PI / 2;
  g.children[0].receiveShadow = true;
  box(g, W + 4, 0.25, D + 4, 0xc4c9d2, 0, -0.45, 0);                               // pelataran
  box(g, W + 0.8, 0.2, D + 0.8, 0xa9aeb8, 0, -0.3, 0);                              // fondasi gedung

  // dinding selatan (depan) setinggi dada, celah pintu di tengah (x -2.2..2.2)
  const segW = hx - 2.2;
  box(g, segW, 1.1, 0.4, 0xcbb99d, -(2.2 + segW / 2), 0, hz + 0.1); box(g, segW, 1.1, 0.4, 0xcbb99d, 2.2 + segW / 2, 0, hz + 0.1);
  box(g, 0.4, 2.8, 0.5, 0x8a6a3a, -2.4, 0, hz + 0.1); box(g, 0.4, 2.8, 0.5, 0x8a6a3a, 2.4, 0, hz + 0.1);   // kusen pintu
  box(g, 5.2, 0.4, 0.5, 0x8a6a3a, 0, 2.8, hz + 0.1);
  box(g, 7.5, 0.18, 2.6, 0x6e4f35, 0, 3.0, hz + 1.4);                                // kanopi pintu masuk
  for (const s of [-1, 1]) box(g, 0.18, 3.0, 0.18, 0x6e4f35, s * 3.5, 0, hz + 2.5);
  // jendela kaca di dinding barat & timur (strip biru muda)
  for (const s of [-1, 1]) for (const z of [-8, -3, 3, 8]) box(g, 0.1, 1.0, 2.2, 0xaed9f0, s * (hx + 0.12), 1.2, z, { emissive: 0x6fb7e0, emissiveIntensity: 0.25 });

  // jalan setapak dari pintu ke jalan raya + garis tengah
  box(g, 5, 0.06, 40, 0xd4cdbd, 0, -0.18, hz + 22);
  box(g, 90, 0.08, 9, 0x4a4e57, 0, -0.17, hz + 40);                                  // jalan raya di depan
  for (let x = -40; x <= 40; x += 8) box(g, 3.5, 0.02, 0.3, 0xf5e18b, x, -0.12, hz + 40);
  for (const s of [-1, 1]) for (let z = hz + 6; z < hz + 34; z += 6) lamp(g, s * 3.6, z);
  for (const s of [-1, 1]) for (let z = hz + 5; z < hz + 30; z += 3) bush(g, s * 5.2, z, z % 6 < 3 ? 0x58b368 : 0x6cc07a);
  for (const x of [-9, -6, 6, 9]) for (let i = 0; i < 4; i++) add(g, new THREE.SphereGeometry(0.2, 8, 6), mat([0xff6fa8, 0xffd23f, 0xff8a3d, 0xffffff][i]), x + i * 0.4, 0.25, hz + 4.5);   // bunga
  bench(g, -4.5, hz + 12, Math.PI / 2); bench(g, 4.5, hz + 12, -Math.PI / 2);

  // taman: kolam, pohon, semak
  const pond = add(g, new THREE.CylinderGeometry(6, 6, 0.1, 28), mat(0x5cb8e6, { emissive: 0x2a6f99, emissiveIntensity: 0.25, roughness: 0.2 }), -hx - 14, -0.2, hz + 10, false);
  add(g, new THREE.TorusGeometry(6, 0.35, 6, 28), mat(0x9a9a9a), -hx - 14, -0.15, hz + 10).rotation.x = Math.PI / 2;
  bench(g, -hx - 14, hz + 18, 0);
  const free = (x, z) => !(Math.abs(x) < hx + 3.5 && Math.abs(z) < hz + 3.5)            // tidak di atas gedung/pelataran
    && !(Math.abs(x) < 4 && z > hz) && Math.hypot(x + hx + 14, z - hz - 10) > 8        // tidak di jalan setapak & kolam
    && !(x > hx + 6 && x < hx + 26 && z > -14 && z < 14) && z < hz + 34;               // tidak di parkiran & jalan raya
  let n = 0; while (n < 70) { const x = (rnd() - .5) * 120, z = (rnd() - .5) * 90; if (free(x, z)) { tree(g, x, z); n++; } }
  for (let i = 0; i < 24; i++) { const x = (rnd() - .5) * 100, z = (rnd() - .5) * 70; if (free(x, z)) bush(g, x, z); }
  for (let x = -hx; x <= hx; x += 5) bush(g, x, -hz - 2.2, 0x4f9d5f);                    // semak di belakang gedung

  // parkiran di sisi timur
  box(g, 18, 0.06, 26, 0x555a63, hx + 16, -0.2, 0);
  for (let z = -10; z <= 10; z += 5) box(g, 0.2, 0.02, 4.2, 0xffffff, hx + 16, -0.16, z);
  car(g, hx + 13.5, -8, 0xe5484d); car(g, hx + 13.5, 2, 0x2d84f5); car(g, hx + 18.5, -3, 0xf5f5f5); car(g, hx + 18.5, 7.5, 0x2db36a);
  return g;
}
