const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

// ===== 1. KONFIGURASI & DATA (Supabase) =====
const SUPABASE_URL = "https://pconlqyyrjsazxgyxknq.supabase.co";
const SUPABASE_KEY = "sb_publishable_lw99KGZbsiVnm41S5aHm3Q_6NwFTkBY";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const LOKASI = "Kampus Untirta"; // monitoring khusus Kampus Untirta
let rows = [], // kejadian dari sensor (terbaru di atas)
  logged = false, // true kalau admin sudah login
  filt = "Semua", // Semua | Salah buang | Benar
  firstLoad = true,
  channel = null,
  poll = null;
const knownIds = new Set();

const rp = (n) => n.toLocaleString("id-ID");
const fmt = (t) =>
  new Date(t).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function toast(m) {
  const t = $("#toast");
  t.textContent = m;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3200);
}

// ganti isi elemen hanya kalau berubah (supaya tidak berkedip saat polling)
function setHTML(sel, html) {
  const el = $(sel);
  if (el._h === html) return false;
  el._h = html;
  el.innerHTML = html;
  return true;
}

async function muat() {
  if (!logged) return;
  const { data, error } = await sb
    .from("kejadian")
    .select("*")
    .order("waktu", { ascending: false })
    .limit(500);
  if (error) {
    console.error(error);
    toast("Gagal memuat: " + error.message);
    return;
  }
  const baru = firstLoad ? [] : data.filter((r) => !knownIds.has(r.id));
  data.forEach((r) => knownIds.add(r.id));
  firstLoad = false;
  rows = data;
  const s = baru.find((r) => r.salah);
  if (s)
    toast(
      `Salah buang di ${s.tong_id}: sampah ${s.kategori_terdeteksi} masuk tong ${s.kategori_tong}`,
    );
  $("#upd").textContent = "Diperbarui " + new Date().toLocaleTimeString("id-ID");
  monitor();
}

function mulaiLive() {
  stopLive();
  channel = sb
    .channel("kejadian-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "kejadian" },
      muat,
    )
    .subscribe();
  poll = setInterval(muat, 10000); // cadangan kalau realtime belum aktif
}
function stopLive() {
  if (channel) {
    sb.removeChannel(channel);
    channel = null;
  }
  if (poll) {
    clearInterval(poll);
    poll = null;
  }
}

async function del(id) {
  const { error } = await sb.from("kejadian").delete().eq("id", id);
  if (error) return toast("Gagal menghapus: " + error.message);
  await muat();
}

// ===== 2. LOGIN ADMIN (Supabase Auth) =====
$("#fl").onsubmit = async (e) => {
  e.preventDefault();
  const btn = $("#aok");
  btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({
    email: $("#au").value.trim(),
    password: $("#ap").value,
  });
  btn.disabled = false;
  if (error) return ($("#ae").textContent = "Email atau sandi salah.");
  $("#ae").textContent = "";
  $("#ap").value = "";
};
async function logout() {
  await sb.auth.signOut();
}
function setSesi(session) {
  const masuk = !!session;
  if (masuk === logged) return;
  logged = masuk;
  if (masuk) {
    firstLoad = true;
    knownIds.clear();
    mulaiLive();
    setTimeout(muat, 0);
  } else {
    stopLive();
    rows = [];
  }
  render();
}
sb.auth.onAuthStateChange((_ev, session) => setSesi(session));

// ===== 3. TAMPILAN =====
function render() {
  const v = logged ? "admin" : "beranda";
  document
    .querySelectorAll(".sec")
    .forEach((s) => s.classList.toggle("show", s.id === "v-" + v));
  const nv = $("#nv");
  nv.innerHTML = "";
  if (logged) {
    const k = document.createElement("button");
    k.textContent = "Keluar";
    k.onclick = logout;
    nv.appendChild(k);
    monitor();
  }
  window.scrollTo(0, 0);
}

function monitor() {
  const salah = rows.filter((r) => r.salah).length,
    pct = rows.length
      ? Math.round(((rows.length - salah) / rows.length) * 100) + "%"
      : "-";
  setHTML(
    "#astats",
    `<div class="stat"><b data-n="${rows.length}">${rp(rows.length)}</b><span>total kejadian</span></div><div class="stat"><b data-n="${salah}">${rp(salah)}</b><span>salah buang</span></div><div class="stat"><b>${pct}</b><span>dibuang dengan benar</span></div>`,
  );

  // ringkasan per tong
  const G = {};
  rows.forEach((r) => {
    const g = (G[r.tong_id] = G[r.tong_id] || {
      kat: r.kategori_tong,
      n: 0,
      s: 0,
    });
    g.n++;
    if (r.salah) g.s++;
  });
  const T = Object.entries(G).sort(
    (a, b) => b[1].s - a[1].s || b[1].n - a[1].n,
  );
  if (
    setHTML(
      "#pertong",
      T.map(
        ([id, g]) =>
          `<div class="rw" style="grid-template-columns:minmax(120px,170px) 1fr auto"><b>${esc(id)}<small>tong ${esc(g.kat)}</small></b><div class="bar"><i class="bd" data-w="${Math.round((g.s / g.n) * 100)}"></i></div><div>${g.s} salah / ${g.n}</div></div>`,
      ).join(""),
    )
  )
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .querySelectorAll("#pertong .bar i")
          .forEach((e) => (e.style.width = e.dataset.w + "%")),
      ),
    );

  // filter
  if (
    setHTML(
      "#chips",
      ["Semua", "Salah buang", "Benar"]
        .map(
          (l) =>
            `<button class="${l === filt ? "on" : ""}" data-l="${l}">${l}</button>`,
        )
        .join(""),
    )
  )
    $("#chips")
      .querySelectorAll("button")
      .forEach(
        (b) =>
          (b.onclick = () => {
            filt = b.dataset.l;
            monitor();
          }),
      );

  // tabel
  const L = rows.filter((r) =>
    filt === "Semua" ? true : filt === "Salah buang" ? r.salah : !r.salah,
  );
  const html = L.length
    ? L.map(
        (r) =>
          `<tr class="${r.salah ? "bad" : ""}"><td>${fmt(r.waktu)}</td><td>${esc(r.tong_id)}</td><td>${esc(r.kategori_tong)}</td><td>${esc(r.kategori_terdeteksi)}</td><td><span class="pill ${r.salah ? "no" : "ok"}">${r.salah ? "Salah tong" : "Benar"}</span></td><td>${r.pembuang ? esc(r.pembuang) : "Anonim"}</td><td><button data-d="${r.id}" aria-label="Hapus">Hapus</button></td></tr>`,
      ).join("")
    : '<tr><td colspan="7" class="empty">Belum ada kejadian. Jalankan simulasi Wokwi untuk mengirim data sensor.</td></tr>';
  if (setHTML("#tb", html))
    $("#tb")
      .querySelectorAll("[data-d]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            if (b.dataset.c) {
              del(b.dataset.d);
            } else {
              b.dataset.c = 1;
              b.textContent = "Yakin?";
              setTimeout(() => {
                b.dataset.c = "";
                b.textContent = "Hapus";
              }, 2500);
            }
          }),
      );
}

$("#csv").onclick = () => {
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const data =
    "waktu,tong_id,kategori_tong,kategori_terdeteksi,status,pembuang\n" +
    rows
      .map((r) =>
        [
          new Date(r.waktu).toISOString(),
          r.tong_id,
          r.kategori_tong,
          r.kategori_terdeteksi,
          r.salah ? "salah" : "benar",
          r.pembuang || "anonim",
        ]
          .map(q)
          .join(","),
      )
      .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
  a.download = "data-kejadian-sensor.csv";
  a.click();
};

// ===== 4. INTERAKSI & ANIMASI (halaman depan) =====
function burst(x, y, n) {
  for (let i = 0; i < n; i++) {
    const l = document.createElement("span"),
      a = Math.random() * 6.28,
      d = 40 + Math.random() * 70;
    l.className = "lf";
    l.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d - 30)}px;--r:${Math.round(Math.random() * 360)}deg;background:${["var(--y)", "var(--pink)", "var(--yel)", "var(--blue)", "var(--orange)"][i % 5]}`;
    document.body.appendChild(l);
    setTimeout(() => l.remove(), 900);
  }
}
document.addEventListener("pointerdown", (e) => {
  if (!(e.target instanceof Element)) return;
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(),
    s = document.createElement("span"),
    size = Math.max(r.width, r.height) * 2;
  s.className = "rp";
  s.style.width = size + "px";
  s.style.height = size + "px";
  s.style.left = e.clientX - r.left - size / 2 + "px";
  s.style.top = e.clientY - r.top - size / 2 + "px";
  b.appendChild(s);
  setTimeout(() => s.remove(), 600);
});

const tips = [
  "Sampah organik masuk tong organik, sisanya ke non-organik.",
  "Sensor akan berbunyi kalau sampah salah tong.",
  "Bilas botol plastik sebelum dibuang.",
  "Kardus bekas bisa didaur ulang.",
];
let ti = 0;
function bin() {
  const b = $("#bin"),
    r = b.getBoundingClientRect(),
    ball = $("#ball");
  b.classList.add("open");
  ball.classList.remove("drop");
  void ball.getBoundingClientRect();
  ball.classList.add("drop");
  setTimeout(() => {
    b.classList.remove("open");
    burst(r.left + r.width / 2, r.top + 10, 10);
    toast(tips[ti++ % tips.length]);
  }, 900);
}
$("#bin").onclick = bin;
$("#bin").onkeydown = (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    bin();
  }
};
document.querySelectorAll(".tree").forEach(
  (t) =>
    (t.onclick = () => {
      t.classList.remove("sway");
      void t.getBoundingClientRect();
      t.classList.add("sway");
    }),
);
function countUp() {
  document.querySelectorAll("[data-n]").forEach((el) => {
    const n = +el.dataset.n,
      t0 = performance.now();
    (function f(t) {
      const p = Math.min(1, (t - t0) / 700);
      el.textContent = rp(Math.round(n * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(f);
    })(t0);
  });
}
new MutationObserver(countUp).observe($("#astats"), { childList: true });
function sun(e) {
  const s = $("#sun");
  s.classList.remove("bn2");
  void s.getBoundingClientRect();
  s.classList.add("bn2");
  burst(e.clientX || innerWidth / 2, e.clientY || 80, 10);
  toast("Cerah! Waktu yang pas untuk memantau tong sampah.");
}
$("#sun").onclick = sun;
$("#sun").onkeydown = (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    sun(e);
  }
};
document.querySelectorAll(".fl").forEach(
  (f) =>
    (f.onclick = (e) => {
      f.classList.remove("bl");
      void f.getBoundingClientRect();
      f.classList.add("bl");
      burst(e.clientX, e.clientY, 6);
    }),
);

// ===== 5. UJI COBA SETOR SAMPAH (simulasi kamera tong) =====
// Khusus uji coba. Saat dipasang di tong asli, ESP32 + sensor/kamera mengirim data
// langsung ke tabel "kejadian" di Supabase, dan dashboard di atas tinggal memantau.

// (1) Link model Teachable Machine (Export Model > TensorFlow.js > Upload).
//     Contoh: "https://teachablemachine.withgoogle.com/models/AbCdEf123/"
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/86qGaCsNK/";

// (2) Daftar tong. "id" HARUS sama dengan TONG_ID di sketch Wokwi.
const TONG = [
  { id: "sampah_organik", kategori: "organik" },
  { id: "sampah_nonorganik", kategori: "non-organik" },
];
const BATAS_YAKIN = 0.7; // di bawah 70% dianggap tidak yakin

// (3) Jalur alarm ke Wokwi lewat broker MQTT publik.
//     MQTT_BASE HARUS sama persis dengan MQTT_BASE di sketch Wokwi.
//     Kalau jaringanmu memblokir broker ini, ganti ke "wss://broker.emqx.io:8084/mqtt"
//     dan ubah MQTT_SERVER di sketch Wokwi jadi "broker.emqx.io".
const MQTT_URL = "wss://broker.hivemq.com:8884/mqtt";
const MQTT_BASE = "cbbu-7f3a9c21";
const MQTT_TOPIC = MQTT_BASE + "/alarm"; // web -> Wokwi (alarm)
// Wokwi -> web: MQTT_BASE + "/status" (online/offline) dan MQTT_BASE + "/ack" (alarm diterima)

// Client terpisah: selalu bertindak sebagai "perangkat" (anon), bukan sesi admin
const sbUji = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "sb-uji-perangkat",
  },
});

let ujiTong = 0,
  ujiHasil = null,
  ujiModel = null,
  mq = null;

const muatScript = (src) =>
  new Promise((ok, gagal) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = ok;
    s.onerror = () => gagal(new Error("gagal memuat " + src));
    document.head.appendChild(s);
  });

function ujiStatus(t, bad) {
  const e = $("#ujiStatus");
  e.textContent = t;
  e.style.color = bad ? "var(--bad)" : "";
}
function wokwiStatus(online, info) {
  const e = $("#ujiWokwi");
  e.textContent = online
    ? "Wokwi: online, siap menerima alarm." + (info ? " " + info : "")
    : "Wokwi: offline. Jalankan simulasi di Wokwi (pakai sketch.ino terbaru).";
  e.style.color = online ? "var(--ok)" : "var(--bad)";
}
function mqStatus(ok) {
  const e = $("#ujiMq");
  e.textContent = ok
    ? "Jalur alarm ke Wokwi: tersambung ke broker."
    : "Jalur alarm ke Wokwi: belum tersambung ke broker.";
  e.style.color = ok ? "var(--ok)" : "var(--bad)";
}

// "Organik" -> organik, "Non-organik"/"Anorganik" -> non-organik, lainnya -> bukan
// Mengenali nama kelas dalam bahasa Indonesia maupun Inggris:
// "Organik" / "organic" -> organik; "Non-organik" / "non organic" / "Anorganik" / "inorganic" -> non-organik
// "Bukan sampah" -> bukan; selain itu -> tidak-dikenal
function kategoriDariLabel(label) {
  const l = String(label).toLowerCase().replace(/[^a-z]/g, "");
  if (l.includes("bukan") || l.includes("background")) return "bukan";
  if (/^(non|an|in)org/.test(l)) return "non-organik";
  if (/^org|organi[ck]/.test(l)) return "organik";
  return "tidak-dikenal";
}

function renderUjiTong() {
  $("#ujiTong").innerHTML = TONG.map(
    (t, i) =>
      `<button type="button" class="tg ${i === ujiTong ? "on" : ""}" data-i="${i}">Tong ${esc(t.kategori)}<small>${esc(t.id)}</small></button>`,
  ).join("");
  $("#ujiTong")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          ujiTong = +b.dataset.i;
          renderUjiTong();
          $("#ujiNotif").hidden = true;
        }),
    );
}

async function mqttSambung() {
  if (mq) return;
  try {
    await muatScript("https://cdn.jsdelivr.net/npm/mqtt@5/dist/mqtt.min.js");
    mq = mqtt.connect(MQTT_URL, {
      clientId: "web-" + Math.random().toString(16).slice(2, 10),
      reconnectPeriod: 3000,
    });
    mq.on("connect", () => {
      mqStatus(true);
      mq.subscribe([MQTT_BASE + "/status", MQTT_BASE + "/ack"]);
    });
    mq.on("message", (topic, msg) => {
      const t = msg.toString();
      if (topic === MQTT_BASE + "/status") wokwiStatus(t === "online");
      else if (topic === MQTT_BASE + "/ack")
        wokwiStatus(true, "Alarm terakhir diterima " + new Date().toLocaleTimeString("id-ID") + ".");
    });
    mq.on("close", () => mqStatus(false));
    mq.on("error", (e) => console.error(e));
  } catch (e) {
    console.error(e);
    mqStatus(false);
  }
}

async function ujiSiap() {
  renderUjiTong();
  mqttSambung();
  if (MODEL_URL.includes("TEMPEL")) {
    return ujiStatus(
      "Model AI belum dipasang. Isi MODEL_URL di app.js dengan link model Teachable Machine.",
      true,
    );
  }
  ujiStatus("Memuat model AI...");
  try {
    await muatScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js");
    await muatScript(
      "https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8/dist/teachablemachine-image.min.js",
    );
    const base = MODEL_URL.endsWith("/") ? MODEL_URL : MODEL_URL + "/";
    ujiModel = await tmImage.load(base + "model.json", base + "metadata.json");
    ujiStatus("Model AI siap. Pilih tong, lalu foto sampahnya.");
  } catch (e) {
    console.error(e);
    ujiStatus("Gagal memuat model AI. Cek MODEL_URL (harus link hasil Upload dari Teachable Machine).", true);
  }
}
$("#uji").addEventListener("toggle", function sekali() {
  if ($("#uji").open) {
    $("#uji").removeEventListener("toggle", sekali);
    ujiSiap();
  }
});

$("#ujiFoto").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  $("#ujiNotif").hidden = true;
  const img = $("#ujiPrev");
  img.src = URL.createObjectURL(f);
  img.hidden = false;
  $("#ujiDz").classList.add("has");
  try {
    await img.decode();
  } catch (_) {}
  if (!ujiModel) {
    ujiHasil = null;
    $("#ujiKirim").disabled = true;
    return ujiStatus("Model AI belum siap. Tunggu sebentar, atau cek MODEL_URL di app.js.", true);
  }
  ujiStatus("Mengklasifikasi...");
  const preds = (await ujiModel.predict(img)).sort((a, b) => b.probability - a.probability);
  const top = preds[0];
  ujiHasil = { kategori: kategoriDariLabel(top.className), prob: top.probability };
  const pct = Math.round(top.probability * 100);
  const sampah = ujiHasil.kategori === "organik" || ujiHasil.kategori === "non-organik";
  const valid = sampah && ujiHasil.prob >= BATAS_YAKIN;
  const pesanGagal =
    ujiHasil.kategori === "tidak-dikenal"
      ? `Label model "${top.className}" tidak dikenali. Ganti nama kelas di Teachable Machine jadi Organik / Non-organik.`
      : ujiHasil.kategori === "bukan"
        ? `Terdeteksi bukan sampah (${pct}%). Coba foto ulang.`
        : `Tidak yakin (${pct}%, minimal ${Math.round(BATAS_YAKIN * 100)}%). Coba foto ulang dengan pencahayaan lebih jelas.`;
  $("#ujiHasil").innerHTML =
    `<div class="uji-judul">${
      valid ? "Terdeteksi: " + esc(ujiHasil.kategori.toUpperCase()) + " (" + pct + "%)" : esc(pesanGagal)
    }</div>` +
    preds
      .map(
        (p) =>
          `<div class="uji-bar"><span>${esc(p.className)}</span><div><i style="width:${Math.round(p.probability * 100)}%"></i></div><span>${Math.round(p.probability * 100)}%</span></div>`,
      )
      .join("");
  $("#ujiHasil").hidden = false;
  if (!valid) ujiHasil = null;
  $("#ujiKirim").disabled = !valid;
  ujiStatus("Model AI siap.");
};

function ujiAlarm(payload) {
  return new Promise((ok, gagal) => {
    if (!mq || !mq.connected) return gagal(new Error("broker MQTT belum tersambung"));
    mq.publish(MQTT_TOPIC, JSON.stringify(payload), { qos: 0 }, (err) => (err ? gagal(err) : ok()));
  });
}

$("#ujiKirim").onclick = async () => {
  if (!ujiHasil) return;
  const n = $("#ujiNotif"),
    tampil = (cls, teks) => {
      n.className = "uji-notif " + cls;
      n.textContent = teks;
      n.hidden = false;
    },
    idp = $("#ujiId").value.trim();
  if (idp && !/^\d{4,8}$/.test(idp))
    return tampil("bad", "ID pembuang harus 4-8 digit angka, atau kosongkan.");

  const t = TONG[ujiTong],
    salah = ujiHasil.kategori !== t.kategori;
  $("#ujiKirim").disabled = true;

  // 1) simpan ke Supabase (sama seperti yang nanti dilakukan sensor IoT asli)
  const { error } = await sbUji.from("kejadian").insert({
    tong_id: t.id,
    lokasi: LOKASI,
    kategori_tong: t.kategori,
    kategori_terdeteksi: ujiHasil.kategori,
    salah,
    pembuang: idp || null,
  });
  if (error) console.error(error);

  // 2) kirim alarm ke Wokwi (buzzer bunyi kalau salah tong)
  let wokwi = "alarm ke Wokwi terkirim";
  try {
    await ujiAlarm({ tong: t.id, kategori_tong: t.kategori, jenis: ujiHasil.kategori, salah });
  } catch (e) {
    wokwi = "alarm ke Wokwi GAGAL (" + e.message + ")";
  }

  const hasil = salah
    ? `SALAH TONG: sampah ${ujiHasil.kategori} masuk tong ${t.kategori}.`
    : `Benar: sampah ${ujiHasil.kategori} masuk tong ${t.kategori}.`;
  tampil(
    error || wokwi.includes("GAGAL") ? "bad" : salah ? "bad" : "ok",
    `${hasil} ${error ? "Gagal menyimpan ke Supabase: " + error.message + "." : "Tersimpan ke Supabase."} ${wokwi[0].toUpperCase() + wokwi.slice(1)}.`,
  );

  // siap untuk uji berikutnya
  ujiHasil = null;
  $("#ujiPrev").hidden = true;
  $("#ujiHasil").hidden = true;
  $("#ujiDz").classList.remove("has");
  $("#ujiFoto").value = "";
  await muat();
};

// ===== 6. MULAI =====
(async function init() {
  const { data } = await sb.auth.getSession(); // pulihkan sesi admin setelah refresh
  setSesi(data.session);
  render();
})();
