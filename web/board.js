import * as THREE from "three";
import { box } from "./rooms.js";
import { plain } from "./md.js";

const COL = { queued: "#6b7385", running: "#2d84f5", done: "#2db36a", failed: "#e5484d", cancelled: "#9aa3b2", stopped: "#9aa3b2" };
const LABEL = { queued: "antre", running: "dikerjakan", done: "selesai", failed: "gagal", cancelled: "dibatalkan", stopped: "dihentikan" };

// Papan tulis berdiri di tiap ruangan; isinya (canvas) menampilkan tugas terbaru ruangan itu.
export class Board {
  constructor(roomId, title) {
    this.roomId = roomId; this.title = title; this.key = "";
    this.canvas = document.createElement("canvas"); this.canvas.width = 640; this.canvas.height = 440;
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    const g = this.group = new THREE.Group();
    box(g, 2.3, 1.6, 0.08, 0x6e7280, 0, 0.75, 0);                                                    // bingkai
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.44), new THREE.MeshBasicMaterial({ map: this.tex }));
    face.position.set(0, 1.55, 0.045); g.add(face);
    for (const x of [-0.95, 0.95]) box(g, 0.08, 0.75, 0.08, 0x4a4d57, x, 0, 0);                       // kaki
    box(g, 2.0, 0.06, 0.18, 0x4a4d57, 0, 0.72, 0.1);                                                  // rak spidol
    g.traverse((o) => { o.userData.boardRoom = roomId; });
    this.draw([]);
  }
  fit(c, text, maxW) { if (c.measureText(text).width <= maxW) return text; while (text.length > 1 && c.measureText(text + "…").width > maxW) text = text.slice(0, -1); return text + "…"; }
  draw(tasks) {
    const c = this.canvas.getContext("2d"), W = 640, H = 440;
    c.fillStyle = "#fbfbf8"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#1f3b6e"; c.fillRect(0, 0, W, 64);
    c.fillStyle = "#fff"; c.font = "700 34px system-ui, sans-serif"; c.fillText("Papan Tugas · " + this.title, 20, 44);
    if (!tasks.length) { c.fillStyle = "#98a1b3"; c.font = "26px system-ui, sans-serif"; c.fillText("Belum ada tugas.", 20, 130); }
    tasks.slice(0, 5).forEach((t, i) => {
      const y = 78 + i * 72;
      c.fillStyle = COL[t.state] || COL.queued; c.beginPath(); c.arc(32, y + 22, 10, 0, Math.PI * 2); c.fill();
      c.font = "700 22px system-ui, sans-serif"; c.fillStyle = "#1c2230";
      c.fillText(this.fit(c, `${t.bot} · ${LABEL[t.state] || t.state}`, W - 70), 54, y + 18);
      c.font = "22px system-ui, sans-serif"; c.fillStyle = "#4a5266";
      c.fillText(this.fit(c, plain(t.state === "done" && t.result ? t.result : t.instruction), W - 70), 54, y + 46);
      c.strokeStyle = "#e3e6ec"; c.beginPath(); c.moveTo(20, y + 62); c.lineTo(W - 20, y + 62); c.stroke();
    });
    this.tex.needsUpdate = true;
  }
  update(tasks) {
    const key = JSON.stringify(tasks.map((t) => [t.id, t.state, (t.result || "").length]));
    if (key !== this.key) { this.key = key; this.draw(tasks); }
  }
}
