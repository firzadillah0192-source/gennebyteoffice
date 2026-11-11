// Skrip biasa (bukan modul): login & pesan error, tetap jalan walau kantor 3D gagal dimuat.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function banner(msg) {
    var b = $("errbar");
    if (!b) { b = document.createElement("div"); b.id = "errbar"; document.body.appendChild(b); }
    b.textContent = "Masalah: " + msg; b.hidden = false;
  }
  window.officeFail = banner;
  window.addEventListener("error", function (e) { banner((e.message || "error") + (e.filename ? " (" + e.filename.split("/").pop() + ":" + e.lineno + ")" : "")); });
  window.addEventListener("unhandledrejection", function (e) { banner(String(e.reason && e.reason.message || e.reason)); });
  var token = null; try { token = localStorage.getItem("office.token"); } catch (e) {}
  var guest = !token;                                                  // tanpa token = mode tamu
  $("login").hidden = true; $("btn-logout").hidden = guest; $("btn-ledger").hidden = guest; $("btn-auto").hidden = guest; $("btn-chat").hidden = guest; $("btn-login").hidden = !guest; $("guest-badge").hidden = !guest;
  $("btn-login").addEventListener("click", function () { $("login-err").textContent = ""; $("login").hidden = false; $("token").focus(); });
  $("login-cancel").addEventListener("click", function () { $("login").hidden = true; });
  $("login-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var t = $("token").value.trim(); $("login-err").textContent = "Memeriksa…";
    fetch("/api/state?since=-1", { headers: { Authorization: "Bearer " + t } }).then(function (r) {
      if (!r.ok) { $("login-err").textContent = r.status === 401 ? "Token salah" : "Server menjawab " + r.status; return; }
      try { localStorage.setItem("office.token", t); } catch (e) { banner("browser menolak menyimpan token (mode privat?)"); return; }
      location.reload();
    }).catch(function () { $("login-err").textContent = "Tidak bisa menghubungi server"; });
  });
})();
