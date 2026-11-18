const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
// ===== 1. DATA & PENYIMPANAN (nanti ganti ke Supabase di bagian ini) =====
const LEGACY_LOC = "Damkar",
  NEW_LOC = "Kampus Untirta",
  LOCS = ["Perumahan Arga", NEW_LOC],
  LS = "bp_rows";
let rows = [],
  role = null,
  filt = "Semua",
  col = null,
  foto = "",
  pick = "";
try {
  role = sessionStorage.getItem("bp_role");
} catch (e) {}
function setRole(r) {
  role = r;
  try {
    r
      ? sessionStorage.setItem("bp_role", r)
      : sessionStorage.removeItem("bp_role");
  } catch (e) {}
}
function lsGet() {
  try {
    return JSON.parse(localStorage.getItem(LS) || "[]");
  } catch (e) {
    return [];
  }
}
function lsSet(a) {
  try {
    localStorage.setItem(LS, JSON.stringify(a));
  } catch (e) {
    toast("Penyimpanan penuh");
  }
}
function migrateRows(a) {
  return a.map((r) =>
    r.lokasi === LEGACY_LOC ? { ...r, lokasi: NEW_LOC } : r,
  );
}
function setRows(a) {
  rows = a.slice().sort((x, y) => y.t - x.t);
  render();
}
const SUPABASE_URL = "https://pconlqyyrjsazxgyxknq.supabase.co";
const SUPABASE_KEY = "sb_publishable_lw99KGZbsiVnm41S5aHm3Q_6NwFTkBY";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function muat() {
  const { data, error } = await sb
    .from("setoran")
    .select("*")
    .order("t", { ascending: false });
  if (error) {
    console.error(error);
    toast("Gagal memuat: " + error.message);
    return setRows([]); // tetap tampilkan halaman walau data gagal dimuat
  }
  setRows(data);
}
async function init() {
  await muat();
  sb.channel("setoran-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "setoran" }, muat)
    .subscribe();
}
async function save(r) {
  const { error } = await sb.from("setoran").insert(r);
  if (error) throw error;
  await muat();
}
async function del(id) {
  const { error } = await sb.from("setoran").delete().eq("id", id);
  if (error) return toast("Gagal menghapus. Login admin dulu.");
  await muat();
}
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function toast(m) {
  const t = $("#toast");
  t.textContent = m;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}
function go(h) {
  location.hash = h;
  render();
}
function rank(list) {
  const m = {};
  list.forEach((r) => {
    (m[r.hp] = m[r.hp] || { nama: r.nama, n: 0 }).n++;
  });
  return Object.values(m).sort(
    (a, b) => b.n - a.n || a.nama.localeCompare(b.nama),
  );
}
const tier = (n) =>
  n >= 10 ? ["Emas", "t3"] : n >= 5 ? ["Perak", "t2"] : ["Perunggu", "t1"];
const rp = (n) => n.toLocaleString("id-ID");

// ===== 2. TAMPILAN: pindah halaman, dashboard, form, admin =====
function render() {
  let v = (location.hash || "#beranda").slice(1);
  if (!["beranda", "dashboard", "setor", "admin"].includes(v)) v = "beranda";
  if (v !== "beranda" && !role) v = "beranda";
  if (v === "admin" && role !== "admin") v = role ? "dashboard" : "beranda";
  document
    .querySelectorAll(".sec")
    .forEach((s) => s.classList.toggle("show", s.id === "v-" + v));
  const nv = $("#nv");
  nv.innerHTML = "";
  if (role) {
    [
      ["dashboard", "Dashboard"],
      ["setor", "Setor sampah"],
    ]
      .concat(role === "admin" ? [["admin", "Admin"]] : [])
      .forEach(([h, t]) => {
        const b = document.createElement("button");
        b.textContent = t;
        b.className = v === h ? "on" : "";
        b.onclick = () => go(h);
        nv.appendChild(b);
      });
    const k = document.createElement("button");
    k.textContent = "Keluar";
    k.onclick = () => {
      setRole(null);
      go("beranda");
    };
    nv.appendChild(k);
  }
  if (v === "dashboard") dash();
  if (v === "admin") admin();
  if (v === "setor") lcs();
}

function dash() {
  $("#chips").innerHTML = ["Semua", ...LOCS]
    .map(
      (l) =>
        `<button class="${l === filt ? "on" : ""}" data-l="${l}">${l}</button>`,
    )
    .join("");
  $("#chips")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          filt = b.dataset.l;
          dash();
        }),
    );
  const L = filt === "Semua" ? rows : rows.filter((r) => r.lokasi === filt),
    R = rank(L);
  $("#stats").innerHTML =
    `<div class="stat"><b data-n="${L.length}">${rp(L.length)}</b><span>setoran</span></div><div class="stat"><b data-n="${R.length}">${rp(R.length)}</b><span>warga aktif</span></div><div class="stat"><b>${R[0] ? esc(R[0].nama.split(" ")[0]) : "-"}</b><span>di puncak</span></div>`;
  if (!R.length) {
    $("#dash").innerHTML =
      '<div class="empty"><h3>Belum ada setoran di sini</h3><p>Jadi yang pertama naik ke puncak tier list.</p><button class="pri" id="e1">Setor sampah</button></div>';
    $("#e1").onclick = () => go("setor");
    return;
  }
  const mx = R[0].n,
    top = R.slice(0, 3),
    ord = [1, 0, 2].filter((i) => top[i]);
  $("#dash").innerHTML =
    '<div class="pod">' +
    ord
      .map((i) => {
        const p = top[i];
        return `<div class="pi r${i}${i === 0 ? " f" : ""}"><div class="nm">${esc(p.nama)}</div><div class="ct">${p.n} kali setor</div>${i === 0 ? '<div class="tp"><svg viewBox="0 0 40 34" width="40" height="34" aria-hidden="true"><path d="M20 34V14" style="stroke:var(--b);stroke-width:3;fill:none"/><path d="M20 18C8 18 6 8 8 3c10 0 14 6 12 15Z" style="fill:var(--y);stroke:var(--ink);stroke-width:1.5"/><path d="M20 14C30 14 34 8 33 2c-9 0-14 4-13 12Z" style="fill:var(--b);stroke:var(--ink);stroke-width:1.5"/></svg></div>' : ""}<div class="blk" data-h="${50 + Math.round((p.n / mx) * 130)}">${i + 1}</div></div>`;
      })
      .join("") +
    "</div>" +
    R.slice(3)
      .map((p, i) => {
        const t = tier(p.n);
        return `<div class="rw"><div class="no">${i + 4}</div><div><b>${esc(p.nama)}</b></div><div class="bar"><i class="${t[1]}" data-w="${Math.round((p.n / mx) * 100)}"></i></div><div><span class="tg ${t[1]}">${t[0]} · ${p.n}</span></div></div>`;
      })
      .join("");
  document.querySelectorAll(".pi").forEach(
    (p) =>
      (p.onclick = (e) => {
        p.classList.remove("bn");
        void p.offsetWidth;
        p.classList.add("bn");
        burst(e.clientX, e.clientY, 8);
      }),
  );
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document
        .querySelectorAll(".blk")
        .forEach((e) => (e.style.height = e.dataset.h + "px"));
      document
        .querySelectorAll(".bar i")
        .forEach((e) => (e.style.width = e.dataset.w + "%"));
    }),
  );
}

function lcs() {
  $("#lc").innerHTML = LOCS.map(
    (l) =>
      `<button type="button" class="loc ${l === pick ? "on" : ""}" data-l="${l}"><b>${l}</b></button>`,
  ).join("");
  $("#lc")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          pick = b.dataset.l;
          lcs();
        }),
    );
}
$("#foto").onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  foto = "";
  $("#submitSetoran").disabled = true;
  $("#prev").hidden = true;
  $("#dz").classList.remove("has");
  const im = new Image(),
    u = URL.createObjectURL(f);
  im.onload = () => {
    const s = Math.min(1, 480 / Math.max(im.width, im.height)),
      c = document.createElement("canvas");
    c.width = Math.round(im.width * s);
    c.height = Math.round(im.height * s);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    foto = c.toDataURL("image/jpeg", 0.6);
    URL.revokeObjectURL(u);
    $("#prev").src = foto;
    $("#prev").hidden = false;
    $("#dz").classList.add("has");
    $("#dzt").textContent = "Ganti foto";
    $("#fe").textContent = "";
    $("#submitSetoran").disabled = false;
  };
  im.onerror = () => {
    $("#fe").textContent = "File itu bukan gambar. Pilih foto lain.";
  };
  im.src = u;
};
$("#fm").onsubmit = async (e) => {
  e.preventDefault();
  const n = $("#nm").value.trim(),
    h = $("#hp").value.replace(/\D/g, ""),
    f = $("#fe");
  if (n.length < 2) return (f.textContent = "Isi nama kamu.");
  if (h.length < 9 || h.length > 14)
    return (f.textContent = "No HP harus 9 sampai 14 angka.");
  if (!pick) return (f.textContent = "Pilih tempat pembuangan.");
  if (!foto) return (f.textContent = "Unggah foto bukti dulu.");
  f.textContent = "";
  try {
    await save({
      id: uid(),
      nama: n,
      hp: h,
      lokasi: pick,
      foto,
      t: Date.now(),
    });
   } catch (x) {
    console.error(x);
    return (f.textContent = "Gagal menyimpan: " + (x.message || x));
  }
  $("#fm").reset();
  foto = "";
  pick = "";
  $("#submitSetoran").disabled = true;
  $("#prev").hidden = true;
  $("#dz").classList.remove("has");
  $("#dzt").textContent = "Ketuk untuk pilih atau ambil foto";
  toast("Setoran tercatat");
  burst(innerWidth / 2, innerHeight / 2, 18);
  filt = "Semua";
  go("dashboard");
};

function admin() {
  const R = rank(rows);
  $("#astats").innerHTML =
    `<div class="stat"><b data-n="${rows.length}">${rp(rows.length)}</b><span>total setoran</span></div><div class="stat"><b data-n="${R.length}">${rp(R.length)}</b><span>warga unik</span></div><div class="stat"><b>${R[0] ? esc(R[0].nama.split(" ")[0]) : "-"}</b><span>kandidat saldo</span></div>`;
  const c = LOCS.map((l) => rows.filter((r) => r.lokasi === l).length),
    mx = Math.max(1, ...c);
  $("#alocs").innerHTML = LOCS.map(
    (l, i) =>
      `<div class="rw" style="grid-template-columns:150px 1fr 40px"><b>${l}</b><div class="bar"><i class="${i ? "dk" : "ag"}" data-w="${Math.round((c[i] / mx) * 100)}"></i></div><div>${c[i]}</div></div>`,
  ).join("");
  $("#tb").innerHTML = rows.length
    ? rows
        .map(
          (r) =>
            `<tr><td>${new Date(r.t).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td>${esc(r.nama)}</td><td>${esc(r.hp)}</td><td><span class="pill ${r.lokasi === NEW_LOC ? "dk" : "ag"}">${esc(r.lokasi)}</span></td><td>${r.foto ? `<img src="${r.foto}" alt="Bukti ${esc(r.nama)}" data-s="${r.id}">` : "-"}</td><td><button data-d="${r.id}" aria-label="Hapus">Hapus</button></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="6" class="empty">Belum ada data. Klik Isi data contoh untuk mencoba.</td></tr>';
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
  $("#tb")
    .querySelectorAll("img")
    .forEach(
      (i) =>
        (i.onclick = () => {
          $("#lbi").src = i.src;
          $("#lb").classList.add("show");
        }),
    );
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      document
        .querySelectorAll("#alocs .bar i")
        .forEach((e) => (e.style.width = e.dataset.w + "%")),
    ),
  );
}
$("#lb").onclick = () => $("#lb").classList.remove("show");
$("#seed").onclick = async () => {
  const N = [
      "Budi Santoso",
      "Sari Dewi",
      "Rangga Putra",
      "Maya Lestari",
      "Dimas Pratama",
      "Putri Ayu",
      "Fajar Nugroho",
      "Nadia Rahma",
    ],
    C = [12, 9, 7, 5, 4, 3, 2, 1];
  for (let i = 0; i < N.length; i++)
    for (let k = 0; k < C[i]; k++)
      await save({
        id: uid(),
        nama: N[i],
        hp: "0812000000" + i,
        lokasi: LOCS[(i + k) % 2],
        foto: "",
        t: Date.now() - (i * 7 + k) * 3600000,
      });
  toast("Data contoh ditambahkan");
};
$("#csv").onclick = async () => {
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"',
    d = window.claude ? await claude.use("downloads") : null,
    data =
      "waktu,nama,hp,lokasi\n" +
      rows
        .map((r) =>
          [new Date(r.t).toISOString(), r.nama, r.hp, r.lokasi]
            .map(q)
            .join(","),
        )
        .join("\n");
  if (d) d.save({ filename: "data-sampah.csv", data }).catch(() => {});
  else toast("Unduh belum tersedia di sini");
};

$("#goUser").onclick = () => {
  setRole("user");
  go("dashboard");
};
$("#goAdm").onclick = () => {
  $("#adm").classList.toggle("show");
$("#csv").onclick = () => {
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const data =
    "waktu,nama,hp,lokasi\n" +
    rows
      .map((r) => [new Date(r.t).toISOString(), r.nama, r.hp, r.lokasi].map(q).join(","))
      .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
  a.download = "data-sampah.csv";
  a.click();
};
      a = Math.random() * 6.28,
      d = 40 + Math.random() * 70;
    l.className = "lf";
    l.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d - 30)}px;--r:${Math.round(Math.random() * 360)}deg;background:${["var(--y)", "var(--pink)", "var(--yel)", "var(--blue)", "var(--orange)"][i % 5]}`;
    document.body.appendChild(l);
    setTimeout(() => l.remove(), 900);
  }
document.addEventListener("pointerdown", (e) => {
$("#aok").onclick = async () => {
  const { error } = await sb.auth.signInWithPassword({
    email: $("#au").value.trim(),
    password: $("#ap").value,
  });
  if (error) return ($("#ae").textContent = "Email atau sandi salah.");
  setRole("admin");
  $("#ae").textContent = "";
  go("admin");
};
  b.appendChild(s);
  setTimeout(() => s.remove(), 600);
  if (b.matches(".pri,.door,.loc,.chips button"))
    burst(e.clientX, e.clientY, 6);
});
const tips = [
  "Pisahkan sampah organik dan anorganik.",
  "Bilas botol plastik sebelum dibuang.",
  "Satu foto bukti, satu setoran tercatat.",
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
// ===== 3. INTERAKSI & ANIMASI =====
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
["#stats", "#astats"].forEach((s) =>
  new MutationObserver(countUp).observe($(s), { childList: true }),
);
function sun(e) {
  const s = $("#sun");
  s.classList.remove("bn2");
  void s.getBoundingClientRect();
  s.classList.add("bn2");
  burst(e.clientX || innerWidth / 2, e.clientY || 80, 10);
  toast("Cerah! Waktu yang pas untuk setor sampah.");
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
addEventListener("hashchange", render);
init();
