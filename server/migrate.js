import pg from "pg"; import { readFileSync } from "node:fs";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
await c.query(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
const rooms = [
 ["lobby","Lobi","main","ballroom / resepsionis",0],
 ["gennexbyte","Gennexbyte","platform","markas teknologi: server rack, layar kode, neon biru",1],
 ["nxchat","NxChat","platform","lounge / call center modern",2],
 ["nxbooth","NxBooth","platform","studio foto",3],
 ["socialhub","SocialHub","platform","studio siaran",4],
 ["other-apps","Lab Aplikasi","platform","lab pengembangan & brainstorming aplikasi",5],
 ["finance","Finance","department","bank / ruang brankas",6],
 ["marketing","Marketing","department","agensi kreatif",7],
 ["director","Director","department","ruang rapat eksekutif",8]];
// Ganti ID lama -> baru tanpa kehilangan riwayat (tugas, kejadian, persetujuan ikut dipindah)
for (const [o, n] of [["teknisi-bot","engineer-socialhub"],["teknisi-nxbooth","engineer-nxbooth"],["teknisi-nxchat","engineer-nxchat"]]) {
  const old = await c.query("SELECT 1 FROM bots WHERE id=$1",[o]), nw = await c.query("SELECT 1 FROM bots WHERE id=$1",[n]);
  if (!old.rowCount || nw.rowCount) continue;
  await c.query("BEGIN");
  await c.query(`INSERT INTO bots(id,name,role,room_id,backend,look,chat_url,token_hash,status,step,updated_at,remote,last_seen)
    SELECT $2, name||'~', role, room_id, backend, look, chat_url, token_hash, status, step, updated_at, remote, last_seen FROM bots WHERE id=$1`,[o,n]);
  for (const [t, col] of [["tasks","bot_id"],["tasks","from_bot"],["events","bot_id"],["approvals","bot_id"]]) await c.query(`UPDATE ${t} SET ${col}=$2 WHERE ${col}=$1`,[o,n]);
  await c.query("DELETE FROM bots WHERE id=$1",[o]); await c.query("COMMIT"); console.log("ganti ID:",o,"->",n);
}
for (const r of rooms) await c.query(
 "INSERT INTO rooms VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET name=$2,kind=$3,theme=$4,ord=$5", r);
const bots = [
 ["clipper-bot","Clipper","Editor video: link → subtitle → upload","socialhub","#2D84F5","pill"],
 ["social-bot","Posty","Social media manager: jadwal & balas komentar","marketing","#F5842D","star4"],
 ["ledger-bot","Ledger","Akuntan: catat pemasukan/pengeluaran","finance","#2DB36A","rounded_cube"],
 ["engineer-socialhub","SocialHub Engineer","Engineer platform SocialHub: diagnosis & perbaikan (Claude Code, perubahan lewat persetujuan)","socialhub","#F5842D","triangle","glasses"],
 ["engineer-nxbooth","NxBooth Engineer","Engineer platform NxBooth: diagnosis & perbaikan (butuh worker di VM NxBooth)","nxbooth","#F5842D","triangle","glasses"],
 ["engineer-nxchat","NxChat Engineer","Engineer platform NxChat: diagnosis & perbaikan (butuh worker di VM NxChat)","nxchat","#F5842D","triangle","glasses"],
 ["engineer-gennexbyte","Gennexbyte Engineer","Engineer platform Gennexbyte: diagnosis & perbaikan (butuh worker di VM-nya)","gennexbyte","#F5842D","triangle","glasses"],
 ["receptionist-bot","Resepsionis","Resepsionis: menjawab pertanyaan tentang seluruh Gennexbyte","lobby","#FF6FA8","rounded_square","bow"],
 ["ideator-bot","Ideator","Peneliti produk: brainstorming & memvalidasi ide aplikasi baru","other-apps","#FFC145","star6"],
 ["ops-bot","Ops","Pemantau platform: patroli uptime tiap 3 jam, menyelidiki bila ada yang bermasalah","gennexbyte","#8A5CF5","hexagon"]];
for (const [id,name,role,room,color,shape,acc] of bots) await c.query(
 `INSERT INTO bots(id,name,role,room_id,look) VALUES ($1,$2,$3,$4,$5)
  ON CONFLICT (id) DO UPDATE SET name=$2,role=$3,room_id=$4`, [id,name,role,room,JSON.stringify({color,shape,accessory:acc||"none"})]);
await c.query("UPDATE bots SET remote=true WHERE id IN ('engineer-nxbooth','engineer-nxchat','engineer-gennexbyte')");
await c.query("UPDATE bots SET step='menunggu worker di VM-nya' WHERE remote AND last_seen IS NULL");
// Contoh rutinitas (NONAKTIF): pemilik yang menyalakan. Hanya ditambahkan bila belum ada rutinitas dengan nama itu.
const seeds = [
 ["ideator-bot","Ide mingguan","Usulkan 3 ide fitur atau aplikasi baru yang paling masuk akal untuk ekosistem Gennexbyte (SocialHub, NxBooth, NxChat). Utamakan ide yang bisa dibuat tim kecil dalam 2 minggu, dan nilai risikonya dengan jujur.",10080],
 ["social-bot","Draf konten harian","Buat 2 draf caption X (maksimal 280 karakter) untuk mengenalkan SocialHub kepada YouTuber pemula. Variasikan sudut pandang (masalah, fitur, tips). Jangan menjanjikan fitur yang belum teruji.",1440],
 ["ledger-bot","Ringkasan keuangan mingguan","Buat ringkasan keuangan bulan ini memakai tool ringkasan: total masuk, keluar, selisih, per kategori, dan catatan yang masih menunggu persetujuan. Sebutkan bila ada catatan yang menunggu lama.",10080],
 ["receptionist-bot","Rangkuman kantor harian","Rangkum aktivitas kantor 24 jam terakhir per ruangan: tugas yang selesai, yang gagal, dan yang menunggu keputusan manusia. Pakai tool office_overview dan recent_work. Singkat dan jujur; jangan mengarang.",1440]];
for (const [bot,name,ins,every] of seeds) await c.query("INSERT INTO routines(bot_id,name,instruction,every_minutes) SELECT $1::text,$2::text,$3::text,$4::int WHERE NOT EXISTS (SELECT 1 FROM routines WHERE bot_id=$1::text AND name=$2::text)",[bot,name,ins,every]);
// Contoh rutinitas (NONAKTIF; pemilik yang menyalakannya). Tidak menimpa yang sudah ada.
const routines = [
 ["social-bot","Draf konten harian","Buat 2 draf caption X (maks 280 karakter) yang mengenalkan SocialHub ke YouTuber/influencer, dengan sudut pandang berbeda dari draf sebelumnya. Jangan menjanjikan fitur yang belum teruji.",1440],
 ["ledger-bot","Ringkasan keuangan mingguan","Ringkas keuangan bulan berjalan: total pemasukan, pengeluaran, selisih, kategori terbesar, dan sebutkan bila ada catatan yang menunggu persetujuan. Gunakan hanya angka dari buku.",10080],
 ["receptionist-bot","Rangkuman kantor harian","Rangkum aktivitas kantor 24 jam terakhir: apa yang selesai, yang gagal, dan yang menunggu keputusan pemilik. Singkat dan jujur; sebut karyawan yang bermasalah.",1440]];
for (const [bot,name,ins,every] of routines) await c.query(
 "INSERT INTO routines(bot_id,name,instruction,every_minutes,enabled) SELECT $1,$2,$3,$4,false WHERE NOT EXISTS (SELECT 1 FROM routines WHERE bot_id=$1 AND name=$2)",[bot,name,ins,every]);
console.log("migrate ok"); await c.end();
