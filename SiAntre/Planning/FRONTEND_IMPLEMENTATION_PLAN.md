# SiAntre — Rencana Implementasi Frontend Komprehensif

> **Tech Stack:** DaisyUI 4.12.10 + Tailwind CDN · ApexCharts 3.54.0 · anime.js 3.2.2 · Vanilla JS (IIFE modules) · WebSocket (ws-client.js + EventBus)
>
> **Referensi Desain:** Windster · DaisyUI Admin Dashboard · DashUI · TailAdmin

---

## 0. Pra-Implementasi: Audit & Setup

### 0.1 Verifikasi Struktur File (Sudah Ada)

```
frontend/
├── index.html          ← AKAN DIREFACTOR: Auth gateway
├── admin.html          ← AKAN DIREFACTOR: Sidebar layout baru
├── css/
│   └── style.css       ← AKAN DIPERLUAS: +sidebar, +cards, +animations
└── js/
    ├── ws-client.js    ← AKAN DIPERLUAS: AppState baru
    ├── notification.js ← TETAP
    ├── queue-animation.js ← TETAP
    ├── activity-log.js ← TETAP
    ├── chart.js        ← AKAN DIPERLUAS: chart warga
    ├── status-indicator.js ← AKAN DIPERLUAS: card render baru
    ├── warga.js        ← MAJOR REFACTOR
    └── admin.js        ← MAJOR REFACTOR
```

**File Baru yang Perlu Dibuat:**
- `frontend/warga.html` — Dashboard warga (halaman baru)

### 0.2 Routing Sederhana

```
GET /              → index.html   (auth gateway: login/register warga)
GET /warga.html    → warga.html   (dashboard warga, cek sessionStorage)
GET /admin.html    → admin.html   (login + dashboard admin/petugas)
```

**Session Guard (warga.html harus ditambahkan di top `<script>`):**
```javascript
// Cek session sebelum halaman render
(function() {
  const user = sessionStorage.getItem('siantre_user');
  if (!user) { window.location.href = '/'; }
})();
```

---

## PHASE 1: Foundation (Hari 1–2)

### 1.1 Refactor `index.html` — Auth Gateway Warga

#### 1.1.1 Struktur HTML Lengkap

**`<head>` — Tambahkan font sistem:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

**Layout Grid 2 Kolom (lg:):**
```html
<body class="bg-base-200 min-h-screen font-[Plus_Jakarta_Sans]">

  <!-- NAVBAR -->
  <nav class="navbar bg-neutral text-neutral-content sticky top-0 z-50 shadow-lg px-4">
    <!-- Kiri: Logo + judul -->
    <div class="navbar-start gap-3">
      <div class="avatar placeholder">
        <div class="bg-primary text-primary-content rounded-xl w-10">
          <span class="text-xl font-black">S</span>
        </div>
      </div>
      <div>
        <p class="font-bold text-lg leading-tight tracking-tight">SiAntre</p>
        <p class="text-xs text-neutral-content/50">Antrian Digital SAMSAT</p>
      </div>
    </div>
    <!-- Kanan: WS badge + link admin -->
    <div class="navbar-end gap-3">
      <a href="/admin.html" class="btn btn-ghost btn-xs text-neutral-content/60">Panel Petugas →</a>
      <span id="ws-status-badge" class="badge badge-warning gap-1">
        <span class="loading loading-ring loading-xs"></span>
        Menghubungkan...
      </span>
    </div>
  </nav>

  <!-- Toast container -->
  <div id="toast-container" class="toast toast-top toast-end z-[999]"></div>

  <!-- Main layout -->
  <div class="min-h-[calc(100vh-64px)] grid grid-cols-1 lg:grid-cols-2">

    <!-- KIRI: Hero + Informasi Layanan -->
    <div class="bg-gradient-to-br from-primary/10 via-base-100 to-secondary/5 p-8 lg:p-12 flex flex-col justify-between">
      <!-- Hero text -->
      <div>
        <div class="badge badge-primary badge-outline mb-4">SAMSAT Digital</div>
        <h1 class="text-4xl lg:text-5xl font-black text-base-content leading-tight mb-4">
          Antri Cerdas,<br>
          <span class="text-primary">Layani Lebih</span><br>
          Cepat.
        </h1>
        <p class="text-base-content/60 text-lg mb-8 max-w-md">
          Sistem antrian digital untuk Pembayaran Pajak Kendaraan,
          Perpanjangan STNK, dan Pembuatan STNK baru.
        </p>
        <!-- Service Status Mini Cards -->
        <div id="service-status-mini" class="flex flex-col gap-2">
          <!-- Diisi oleh status-indicator.js -->
          <div class="skeleton h-14 rounded-xl w-full max-w-sm"></div>
          <div class="skeleton h-14 rounded-xl w-full max-w-sm"></div>
          <div class="skeleton h-14 rounded-xl w-full max-w-sm"></div>
        </div>
      </div>
      <!-- Announcement Banner (hidden by default) -->
      <div id="ann-banner" class="hidden mt-6">
        <div class="alert alert-warning shadow-md">
          <span>📢</span>
          <div>
            <p class="font-semibold text-sm" id="ann-banner-title">Pengumuman</p>
            <p class="text-xs" id="ann-banner-text"></p>
          </div>
        </div>
      </div>
    </div>

    <!-- KANAN: Form Auth -->
    <div class="flex items-center justify-center p-8 lg:p-12">
      <div class="w-full max-w-md">

        <!-- Auth Card -->
        <div class="card bg-base-100 shadow-xl" id="auth-card">
          <div class="card-body">
            <!-- Tab switcher -->
            <div role="tablist" class="tabs tabs-boxed mb-4" id="auth-tabs">
              <button role="tab" class="tab tab-active" data-auth-tab="login">
                Masuk
              </button>
              <button role="tab" class="tab" data-auth-tab="register">
                Daftar
              </button>
            </div>

            <!-- Tab: Login -->
            <div id="auth-tab-login" class="auth-tab-content">
              <p class="text-sm text-base-content/60 mb-4">
                Masukkan NIK 16 digit untuk mengakses sistem antrian.
              </p>
              <label class="form-control w-full mb-4">
                <div class="label">
                  <span class="label-text font-semibold text-xs uppercase tracking-wide">
                    NIK (16 digit)
                  </span>
                </div>
                <input
                  type="text"
                  id="login-nik"
                  inputmode="numeric"
                  maxlength="16"
                  placeholder="3201xxxxxxxxxx"
                  class="input input-bordered w-full font-mono text-lg tracking-widest"
                  autocomplete="off"
                />
                <div class="label">
                  <span class="label-text-alt text-error hidden" id="login-nik-error"></span>
                  <span class="label-text-alt text-base-content/40" id="login-nik-counter">0/16</span>
                </div>
              </label>
              <button
                class="btn btn-primary w-full"
                id="btn-login"
                data-original-text="Masuk ke SiAntre"
              >
                Masuk ke SiAntre
              </button>
            </div>

            <!-- Tab: Register -->
            <div id="auth-tab-register" class="auth-tab-content hidden">
              <p class="text-sm text-base-content/60 mb-4">
                Daftarkan NIK Anda untuk mendapat akses sistem antrian.
              </p>
              <div class="flex flex-col gap-3">
                <label class="form-control w-full">
                  <div class="label">
                    <span class="label-text font-semibold text-xs uppercase">NIK</span>
                  </div>
                  <input
                    type="text"
                    id="reg-nik"
                    inputmode="numeric"
                    maxlength="16"
                    placeholder="3201xxxxxxxxxx"
                    class="input input-bordered w-full font-mono tracking-widest"
                  />
                </label>
                <label class="form-control w-full">
                  <div class="label">
                    <span class="label-text font-semibold text-xs uppercase">Nama Lengkap</span>
                  </div>
                  <input
                    type="text"
                    id="reg-name"
                    placeholder="Sesuai KTP"
                    class="input input-bordered w-full"
                  />
                </label>
                <label class="form-control w-full">
                  <div class="label">
                    <span class="label-text font-semibold text-xs uppercase">Nomor HP</span>
                  </div>
                  <input
                    type="tel"
                    id="reg-phone"
                    placeholder="08xxxxxxxxxx"
                    class="input input-bordered w-full"
                  />
                </label>
                <label class="form-control w-full">
                  <div class="label">
                    <span class="label-text font-semibold text-xs uppercase">Alamat</span>
                  </div>
                  <input
                    type="text"
                    id="reg-address"
                    placeholder="Alamat sesuai KTP"
                    class="input input-bordered w-full"
                  />
                </label>
                <button
                  class="btn btn-primary w-full mt-1"
                  id="btn-register"
                  data-original-text="Daftar Akun"
                >
                  Daftar Akun
                </button>
              </div>
            </div>

          </div>
        </div>

        <!-- Info singkat -->
        <div class="mt-4 text-center text-xs text-base-content/40">
          Data Anda aman dan hanya digunakan untuk keperluan antrian.
        </div>

      </div>
    </div>

  </div>

  <!-- Script loading -->
  <script src="js/ws-client.js"></script>
  <script src="js/notification.js"></script>
  <script src="js/activity-log.js"></script>
  <script src="js/chart.js"></script>
  <script src="js/status-indicator.js"></script>
  <script src="js/warga.js"></script>
</body>
```

#### 1.1.2 Logika index.html di `warga.js` (Bagian Auth)

```javascript
// === AUTH TAB SWITCHING ===
// Gunakan data-auth-tab attribute
document.querySelectorAll('[data-auth-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    // Deactivate semua
    document.querySelectorAll('[data-auth-tab]').forEach(b => b.classList.remove('tab-active'));
    document.querySelectorAll('.auth-tab-content').forEach(c => c.classList.add('hidden'));
    // Activate yang diklik
    btn.classList.add('tab-active');
    document.getElementById(`auth-tab-${btn.dataset.authTab}`)?.classList.remove('hidden');
  });
});

// === NIK INPUT: REALTIME VALIDASI ===
const loginNikEl = document.getElementById('login-nik');
const loginCounter = document.getElementById('login-nik-counter');
const loginError = document.getElementById('login-nik-error');

loginNikEl?.addEventListener('input', (e) => {
  // Hanya izinkan digit
  e.target.value = e.target.value.replace(/\D/g, '');
  const len = e.target.value.length;
  loginCounter.textContent = `${len}/16`;
  loginCounter.classList.toggle('text-success', len === 16);
  loginCounter.classList.toggle('text-base-content/40', len !== 16);

  if (len > 0 && len < 16) {
    loginError.textContent = `NIK kurang ${16 - len} digit lagi`;
    loginError.classList.remove('hidden');
  } else {
    loginError.classList.add('hidden');
  }
});

// Enter key support
loginNikEl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-login')?.click();
});

// === ANNOUNCEMENT BANNER ===
EventBus.on('newAnnouncement', (ann) => {
  const banner = document.getElementById('ann-banner');
  const title  = document.getElementById('ann-banner-title');
  const text   = document.getElementById('ann-banner-text');
  if (!banner) return;
  title.textContent = ann.title || 'Pengumuman';
  text.textContent  = ann.message;
  banner.classList.remove('hidden');
  anime({ targets: banner, opacity: [0,1], translateY: [10,0], duration: 400, easing: 'easeOutQuart' });
});

// === SERVICE STATUS MINI (index.html hero) ===
// Dirender oleh status-indicator.js ke #service-status-mini
```

#### 1.1.3 `status-indicator.js` — Fungsi `renderMiniServices` (Baru)

```javascript
// Tambahkan fungsi baru ini di status-indicator.js
function renderMiniServices(services) {
  const mini = document.getElementById('service-status-mini');
  if (!mini) return;

  mini.innerHTML = services.map(svc => {
    const isOpen = svc.status === 'OPEN' || svc.is_open;
    const statusDot = isOpen ? 'bg-success' : 'bg-error';
    const statusText = isOpen ? 'Buka' : 'Tutup';
    const quotaText  = svc.quota_remaining != null ? `${svc.quota_remaining} kuota tersisa` : '';
    return `
      <div class="flex items-center gap-3 bg-base-100 rounded-xl px-4 py-3 shadow-sm max-w-sm">
        <span class="w-2.5 h-2.5 rounded-full ${statusDot} flex-shrink-0"></span>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-sm truncate">${esc(svc.name)}</p>
          <p class="text-xs text-base-content/50">${quotaText}</p>
        </div>
        <span class="badge badge-sm ${isOpen ? 'badge-success' : 'badge-error'} badge-outline">${statusText}</span>
      </div>
    `;
  }).join('');
}

// Pastikan EventBus listener memanggil renderMiniServices juga
EventBus.on('servicesLoaded', (s) => { renderServices(s); renderMiniServices(s); });
EventBus.on('servicesUpdate', (s) => { renderServices(s); renderMiniServices(s); });
```

#### 1.1.4 Login Flow — warga.js

```javascript
// === LOGIN ===
document.getElementById('btn-login')?.addEventListener('click', () => {
  const nik = document.getElementById('login-nik')?.value.trim();
  if (!nik || nik.length !== 16 || !/^\d{16}$/.test(nik)) {
    showNotification('NIK Tidak Valid', 'Masukkan NIK 16 digit angka.', 'warning');
    return;
  }
  setLoading('btn-login', true);
  sendCommand('LOGIN_CITIZEN', { nik });
});

EventBus.on('loginResult', (msg) => {
  setLoading('btn-login', false);
  if (msg.error) {
    showNotification('Login Gagal', msg.error, 'error');
    return;
  }
  const user = msg.payload;
  // Simpan ke sessionStorage
  sessionStorage.setItem('siantre_user', JSON.stringify({
    nik:        user.nik,
    nama:       user.nama_lengkap,
    citizen_id: user.citizen_id,
    no_hp:      user.no_hp,
    alamat:     user.alamat,
  }));
  // Animasi transisi sebelum redirect
  anime({
    targets: '#auth-card',
    scale: [1, 0.95],
    opacity: [1, 0],
    duration: 300,
    easing: 'easeInQuart',
    complete: () => { window.location.href = '/warga.html'; },
  });
});

// === REGISTER ===
document.getElementById('btn-register')?.addEventListener('click', () => {
  const nik    = document.getElementById('reg-nik')?.value.trim();
  const nama   = document.getElementById('reg-name')?.value.trim();
  const no_hp  = document.getElementById('reg-phone')?.value.trim();
  const alamat = document.getElementById('reg-address')?.value.trim();

  if (!nik || nik.length !== 16) {
    showNotification('NIK Tidak Valid', 'NIK harus 16 digit angka.', 'warning'); return;
  }
  if (!nama || nama.length < 2) {
    showNotification('Nama Kosong', 'Masukkan nama lengkap sesuai KTP.', 'warning'); return;
  }
  setLoading('btn-register', true);
  sendCommand('REGISTER_CITIZEN', { nik, nama_lengkap: nama, no_hp, alamat });
});

EventBus.on('registerResult', (msg) => {
  setLoading('btn-register', false);
  if (msg.error) {
    showNotification('Registrasi Gagal', msg.error, 'error');
  } else {
    showNotification('Registrasi Berhasil!', 'Silakan masuk dengan NIK Anda.', 'success');
    // Switch ke tab login + isi NIK
    document.querySelector('[data-auth-tab="login"]')?.click();
    const nikField = document.getElementById('login-nik');
    if (nikField) {
      nikField.value = document.getElementById('reg-nik')?.value;
      nikField.dispatchEvent(new Event('input'));
    }
  }
});
```

---

### 1.2 Buat `warga.html` — Skeleton Sidebar

#### 1.2.1 Struktur HTML Lengkap

```html
<!DOCTYPE html>
<html lang="id" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SiAntre — Dashboard Warga</title>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/apexcharts@3.54.0/dist/apexcharts.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js"
          integrity="sha512-..." crossorigin="anonymous"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css" />
</head>
<body class="bg-base-200 min-h-screen font-[Plus_Jakarta_Sans]">

  <!-- Session guard -->
  <script>
    (function() {
      if (!sessionStorage.getItem('siantre_user')) {
        window.location.href = '/';
      }
    })();
  </script>

  <!-- Toast container -->
  <div id="toast-container" class="toast toast-top toast-end z-[999]"></div>

  <!-- YOUR TURN banner akan di-inject oleh notification.js -->

  <!-- LAYOUT WRAPPER -->
  <div class="flex h-screen overflow-hidden">

    <!-- ── SIDEBAR (Desktop: fixed, Mobile: drawer) ──────────────── -->
    <aside id="sidebar"
      class="hidden lg:flex flex-col w-64 bg-base-100 border-r border-base-200 flex-shrink-0 h-full overflow-y-auto"
    >
      <!-- Logo -->
      <div class="p-5 border-b border-base-200">
        <div class="flex items-center gap-3">
          <div class="avatar placeholder">
            <div class="bg-primary text-primary-content rounded-xl w-9">
              <span class="text-lg font-black">S</span>
            </div>
          </div>
          <div>
            <p class="font-bold text-base leading-tight">SiAntre</p>
            <p class="text-xs text-base-content/40">SAMSAT Digital</p>
          </div>
        </div>
      </div>

      <!-- User info -->
      <div class="px-4 py-3 border-b border-base-200">
        <p class="text-xs text-base-content/40 mb-0.5">Masuk sebagai</p>
        <p class="font-semibold text-sm truncate" id="sidebar-user-name">—</p>
        <p class="text-xs text-base-content/40 font-mono" id="sidebar-user-nik">NIK: —</p>
      </div>

      <!-- Nav menu -->
      <nav class="flex-1 px-3 py-4 flex flex-col gap-1">
        <button class="sidebar-menu-item active" data-view="booking">
          <span class="text-lg">📋</span>
          <span>Booking Baru</span>
        </button>
        <button class="sidebar-menu-item" data-view="riwayat">
          <span class="text-lg">📁</span>
          <span>Riwayat Booking</span>
        </button>
        <button class="sidebar-menu-item" data-view="monitor">
          <span class="text-lg">📡</span>
          <span>Monitor Antrian</span>
        </button>
        <button class="sidebar-menu-item" data-view="pengumuman">
          <span class="text-lg">📢</span>
          <span>Pengumuman</span>
          <span class="ann-badge hidden ml-auto" id="ann-badge-count"></span>
        </button>
      </nav>

      <!-- Status Layanan Sidebar -->
      <div class="px-4 py-3 border-t border-base-200">
        <p class="text-xs font-semibold text-base-content/40 uppercase tracking-wide mb-2">Status Layanan</p>
        <div id="sidebar-service-status" class="flex flex-col gap-1.5">
          <!-- Diisi oleh status-indicator.js -->
          <div class="skeleton h-5 rounded"></div>
          <div class="skeleton h-5 rounded"></div>
          <div class="skeleton h-5 rounded"></div>
        </div>
      </div>

      <!-- Logout -->
      <div class="p-4 border-t border-base-200">
        <button class="btn btn-ghost btn-sm w-full text-base-content/50" id="btn-logout-warga">
          ← Keluar
        </button>
      </div>
    </aside>

    <!-- ── MAIN AREA ──────────────────────────────────────────────── -->
    <div class="flex-1 flex flex-col overflow-hidden">

      <!-- Topbar (mobile + desktop) -->
      <header class="bg-base-100 border-b border-base-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <!-- Mobile: hamburger -->
        <button class="btn btn-ghost btn-sm lg:hidden" id="btn-sidebar-toggle">☰</button>
        <!-- Page title -->
        <h1 class="font-bold text-base" id="page-title">Booking Baru</h1>
        <!-- Right: WS badge -->
        <div class="flex items-center gap-3">
          <span id="ws-status-badge" class="badge badge-warning gap-1 badge-sm">
            <span class="loading loading-ring loading-xs"></span>
            Menghubungkan...
          </span>
        </div>
      </header>

      <!-- Mobile Sidebar Drawer (overlay) -->
      <div id="mobile-sidebar-overlay"
        class="hidden fixed inset-0 bg-black/40 z-40 lg:hidden"
      >
        <aside id="mobile-sidebar"
          class="absolute left-0 top-0 bottom-0 w-72 bg-base-100 flex flex-col shadow-xl"
          style="transform: translateX(-100%)"
        >
          <!-- Clone struktur sidebar desktop di sini via JS -->
        </aside>
      </div>

      <!-- Scrollable content area -->
      <main class="flex-1 overflow-y-auto p-4 lg:p-6">

        <!-- ════════════════════════════════════════════ -->
        <!--   VIEW 1: BOOKING                           -->
        <!-- ════════════════════════════════════════════ -->
        <div id="view-booking" class="warga-view max-w-2xl mx-auto">

          <!-- Step indicator -->
          <div class="flex items-center gap-2 mb-6">
            <div class="booking-step active" data-step="1" id="step-bar-1"></div>
            <div class="booking-step" data-step="2" id="step-bar-2"></div>
            <div class="booking-step" data-step="3" id="step-bar-3"></div>
          </div>
          <div class="flex justify-between text-xs text-base-content/50 mb-6 px-0.5">
            <span id="step-label-1" class="font-semibold text-primary">1. Pilih Layanan</span>
            <span id="step-label-2">2. Pilih Slot</span>
            <span id="step-label-3">3. Konfirmasi</span>
          </div>

          <!-- STEP 1: Pilih Layanan -->
          <div id="booking-step-1">
            <h2 class="text-lg font-bold mb-4">Pilih Layanan</h2>
            <div id="booking-service-cards" class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <!-- Diisi JS -->
              <div class="skeleton h-28 rounded-xl"></div>
              <div class="skeleton h-28 rounded-xl"></div>
              <div class="skeleton h-28 rounded-xl"></div>
            </div>
            <!-- Requirements panel (hidden until service selected) -->
            <div id="booking-requirements" class="hidden alert alert-info mb-4">
              <div>
                <p class="font-semibold text-sm mb-1">📋 Persyaratan Dokumen:</p>
                <ul id="booking-requirements-list" class="text-sm list-disc ml-4"></ul>
              </div>
            </div>
            <button
              class="btn btn-primary w-full mt-2 hidden"
              id="btn-booking-next-1"
            >Lanjut ke Pilih Slot →</button>
          </div>

          <!-- STEP 2: Pilih Slot (hidden by default) -->
          <div id="booking-step-2" class="hidden">
            <div class="flex items-center gap-3 mb-4">
              <button class="btn btn-ghost btn-sm" id="btn-booking-back-2">← Kembali</button>
              <h2 class="text-lg font-bold">Pilih Slot Waktu</h2>
            </div>
            <!-- Date selector -->
            <div class="mb-4">
              <label class="form-control w-full max-w-xs">
                <div class="label">
                  <span class="label-text text-xs font-semibold uppercase">Tanggal Kunjungan</span>
                </div>
                <input
                  type="date"
                  id="booking-date-picker"
                  class="input input-bordered input-sm"
                />
              </label>
            </div>
            <!-- Slot grid -->
            <div id="booking-slot-grid" class="flex flex-wrap gap-2 mb-6">
              <!-- Diisi JS -->
            </div>
            <button
              class="btn btn-primary w-full hidden"
              id="btn-booking-next-2"
            >Lanjut ke Konfirmasi →</button>
          </div>

          <!-- STEP 3: Konfirmasi (hidden by default) -->
          <div id="booking-step-3" class="hidden">
            <div class="flex items-center gap-3 mb-4">
              <button class="btn btn-ghost btn-sm" id="btn-booking-back-3">← Kembali</button>
              <h2 class="text-lg font-bold">Konfirmasi Booking</h2>
            </div>
            <div class="card bg-base-100 border border-base-300 mb-4">
              <div class="card-body p-4 space-y-2">
                <div class="flex justify-between text-sm">
                  <span class="text-base-content/60">Layanan</span>
                  <span class="font-semibold" id="confirm-service-name">—</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-base-content/60">Tanggal</span>
                  <span class="font-semibold" id="confirm-slot-date">—</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-base-content/60">Jam</span>
                  <span class="font-semibold" id="confirm-slot-time">—</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-base-content/60">Atas Nama</span>
                  <span class="font-semibold" id="confirm-citizen-name">—</span>
                </div>
              </div>
            </div>
            <div class="alert alert-warning text-sm mb-4">
              <span>⚠️</span>
              <span>Hadir <strong>minimal 15 menit sebelum</strong> sesi dimulai. Booking expired jika melewati batas.</span>
            </div>
            <div class="flex gap-3">
              <button class="btn btn-ghost flex-1" id="btn-booking-cancel-confirm">Batal</button>
              <button
                class="btn btn-primary flex-1"
                id="btn-booking-confirm"
                data-original-text="Konfirmasi Booking ✓"
              >Konfirmasi Booking ✓</button>
            </div>
            <!-- Booking success result (hidden until success) -->
            <div id="booking-success-result" class="hidden mt-4">
              <div class="alert alert-success">
                <span>✅</span>
                <div>
                  <p class="font-bold">Booking Berhasil!</p>
                  <p class="text-sm">Kode: <span class="font-mono font-bold" id="booking-result-code">—</span></p>
                  <p class="text-xs opacity-70">Tunjukkan kode ini ke petugas SAMSAT saat tiba.</p>
                </div>
              </div>
            </div>
          </div>

        </div><!-- /view-booking -->

        <!-- ════════════════════════════════════════════ -->
        <!--   VIEW 2: RIWAYAT                          -->
        <!-- ════════════════════════════════════════════ -->
        <div id="view-riwayat" class="warga-view hidden max-w-2xl mx-auto">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold">Riwayat Booking</h2>
            <button class="btn btn-ghost btn-xs" id="btn-refresh-bookings">↻ Refresh</button>
          </div>
          <div id="booking-list-container">
            <div class="flex flex-col gap-3" id="booking-list">
              <!-- Diisi JS -->
              <div class="skeleton h-24 rounded-xl"></div>
              <div class="skeleton h-24 rounded-xl"></div>
            </div>
          </div>
          <!-- Reschedule Modal -->
          <dialog id="modal-reschedule" class="modal">
            <div class="modal-box max-w-md">
              <h3 class="font-bold text-lg mb-4">Ubah Jadwal</h3>
              <p class="text-sm text-base-content/60 mb-1">Kode: <span id="reschedule-code" class="font-mono font-bold"></span></p>
              <p class="text-sm text-base-content/60 mb-3">Jadwal saat ini: <span id="reschedule-current"></span></p>
              <div class="mb-3">
                <label class="form-control w-full">
                  <div class="label"><span class="label-text text-xs font-semibold uppercase">Tanggal Baru</span></div>
                  <input type="date" id="reschedule-date" class="input input-bordered input-sm" />
                </label>
              </div>
              <div id="reschedule-slot-grid" class="flex flex-wrap gap-2 mb-4"></div>
              <div class="modal-action">
                <button class="btn btn-ghost" onclick="document.getElementById('modal-reschedule').close()">Batal</button>
                <button class="btn btn-primary" id="btn-confirm-reschedule" data-original-text="Simpan Jadwal Baru">Simpan Jadwal Baru</button>
              </div>
            </div>
            <form method="dialog" class="modal-backdrop"><button>close</button></form>
          </dialog>
        </div><!-- /view-riwayat -->

        <!-- ════════════════════════════════════════════ -->
        <!--   VIEW 3: MONITOR                           -->
        <!-- ════════════════════════════════════════════ -->
        <div id="view-monitor" class="warga-view hidden max-w-2xl mx-auto">
          <h2 class="text-lg font-bold mb-4">📡 Monitor Antrian Live</h2>
          <!-- Service selector -->
          <div class="mb-4">
            <label class="form-control w-full max-w-xs">
              <div class="label"><span class="label-text text-xs font-semibold uppercase">Pilih Layanan</span></div>
              <select id="monitor-service-select" class="select select-bordered select-sm w-full">
                <option value="">-- Pilih layanan --</option>
              </select>
            </label>
          </div>
          <!-- Queue display card -->
          <div class="card bg-base-100 shadow-sm mb-4">
            <div class="card-body text-center py-8">
              <p class="text-xs font-semibold uppercase tracking-widest text-base-content/40 mb-2">
                Nomor Sedang Dilayani
              </p>
              <div
                id="monitor-current-number"
                class="queue-number-big text-7xl"
              >—</div>
              <p class="text-sm text-base-content/50 mt-3" id="monitor-service-label">Pilih layanan untuk memulai</p>

              <!-- Stats row -->
              <div class="stats stats-horizontal shadow-none bg-base-200 rounded-xl mt-4 w-full text-sm">
                <div class="stat place-items-center py-2">
                  <div class="stat-title text-xs">Menunggu</div>
                  <div class="stat-value text-xl text-warning" id="monitor-total-waiting">—</div>
                </div>
                <div class="stat place-items-center py-2">
                  <div class="stat-title text-xs">Nomor Anda</div>
                  <div class="stat-value text-xl text-primary" id="monitor-my-number">—</div>
                </div>
                <div class="stat place-items-center py-2">
                  <div class="stat-title text-xs">Di Depan</div>
                  <div class="stat-value text-xl" id="monitor-people-ahead">—</div>
                </div>
                <div class="stat place-items-center py-2">
                  <div class="stat-title text-xs">Estimasi</div>
                  <div class="stat-value text-base text-success" id="monitor-est-wait">—</div>
                </div>
              </div>
            </div>
          </div>
          <!-- Event log -->
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <div class="flex items-center justify-between mb-2">
                <h3 class="font-semibold text-sm">Log Event Antrian</h3>
                <span class="badge badge-success animate-pulse badge-sm">● LIVE</span>
              </div>
              <div
                id="monitor-event-log"
                class="flex flex-col gap-1 max-h-52 overflow-y-auto text-sm"
                role="log"
              >
                <p class="text-base-content/40 italic text-center py-4">Pilih layanan untuk memantau.</p>
              </div>
            </div>
          </div>
        </div><!-- /view-monitor -->

        <!-- ════════════════════════════════════════════ -->
        <!--   VIEW 4: PENGUMUMAN                        -->
        <!-- ════════════════════════════════════════════ -->
        <div id="view-pengumuman" class="warga-view hidden max-w-2xl mx-auto">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold">📢 Papan Pengumuman</h2>
            <button class="btn btn-ghost btn-xs" id="btn-refresh-announcements">↻ Refresh</button>
          </div>
          <div id="announcement-list" class="flex flex-col gap-3">
            <p class="text-base-content/40 italic text-center py-8">Memuat pengumuman...</p>
          </div>
        </div><!-- /view-pengumuman -->

      </main>
    </div><!-- /main area -->
  </div><!-- /layout wrapper -->

  <!-- Bottom nav (Mobile only) -->
  <nav class="btm-nav lg:hidden z-30 bg-base-100 border-t border-base-200">
    <button data-view="booking" class="btm-nav-item text-xs active">
      <span class="text-lg">📋</span>
      <span class="btm-nav-label">Booking</span>
    </button>
    <button data-view="riwayat" class="btm-nav-item text-xs">
      <span class="text-lg">📁</span>
      <span class="btm-nav-label">Riwayat</span>
    </button>
    <button data-view="monitor" class="btm-nav-item text-xs">
      <span class="text-lg">📡</span>
      <span class="btm-nav-label">Monitor</span>
    </button>
    <button data-view="pengumuman" class="btm-nav-item text-xs">
      <span class="text-lg relative">📢
        <span class="ann-badge hidden absolute -top-1 -right-1" id="btm-ann-badge"></span>
      </span>
      <span class="btm-nav-label">Pengumuman</span>
    </button>
  </nav>

  <script src="js/ws-client.js"></script>
  <script src="js/notification.js"></script>
  <script src="js/queue-animation.js"></script>
  <script src="js/activity-log.js"></script>
  <script src="js/chart.js"></script>
  <script src="js/status-indicator.js"></script>
  <script src="js/warga.js"></script>
</body>
```

---

### 1.3 Extend `ws-client.js` — AppState Baru

```javascript
// Tambahkan ke AppState object yang ada:
const AppState = {
  // === EXISTING ===
  ws: null, isConnected: false,
  currentUser: null, currentAdmin: null,
  services: [], myBooking: null,
  queueData: {},
  reconnectAttempts: 0, maxReconnectAttempts: 10, pauseReconnect: false,

  // === WARGA — NEW ===
  allBookings: [],            // semua booking warga dari GET_MY_BOOKING
  selectedService: null,      // { service_id, name, short_code, ... }
  selectedSlot: null,         // { slot_id, time, date, ... }
  monitorServiceId: null,     // service yang sedang dipantau di view monitor
  monitorSubscribed: false,   // apakah sudah subscribe WatchQueue
  unreadAnnouncements: 0,     // badge counter sidebar

  // === ADMIN — NEW ===
  queueSnapshots: {},         // { service_id: { current, waiting, is_open } }
  statsSnapshot: null,        // last stats dari STATS_PUSH
};
```

**Tambahkan ke `routeMessage()` — case GET_AVAILABLE_SLOTS sudah ada, pastikan event name konsisten:**
```javascript
// Pastikan case ini ada di routeMessage
case 'SLOTS_LIST':
  EventBus.emit('slotsLoaded', msg);
  break;
```

**Tambahkan helper `setLoading` global (dipakai semua page):**
```javascript
// Di ws-client.js bagian bawah (global helper)
window.setLoading = function(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.dataset.originalText || btn.innerHTML;
    btn.disabled  = true;
    btn.innerHTML = `<span class="loading loading-spinner loading-xs"></span> Memproses...`;
  } else {
    btn.disabled  = false;
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
  }
};
```

---

### 1.4 CSS Additions — `css/style.css`

Tambahkan seluruh blok ini di akhir file (setelah kode yang sudah ada):

```css
/* ── Font global ──────────────────────────────────────────────────── */
body { font-family: 'Plus Jakarta Sans', sans-serif; }

/* ── Sidebar Navigation ────────────────────────────────────────────── */
.sidebar-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  color: oklch(var(--bc)/0.65);
  font-size: 14px;
  font-weight: 500;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
}
.sidebar-menu-item:hover {
  background: oklch(var(--b2));
  color: oklch(var(--bc));
}
.sidebar-menu-item.active {
  background: oklch(var(--p)/0.1);
  color: oklch(var(--p));
  font-weight: 600;
  border-left: 3px solid oklch(var(--p));
  padding-left: 9px;
}

/* ── Warga View (show/hide) ─────────────────────────────────────────── */
.warga-view { animation: view-enter 0.25s ease; }
@keyframes view-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Queue Number Display ───────────────────────────────────────────── */
.queue-number-big {
  font-size: 5rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  letter-spacing: -4px;
  color: oklch(var(--p));
  display: inline-block;
  transform-origin: center bottom;
  line-height: 1;
}

/* ── Service Card (Booking step 1) ─────────────────────────────────── */
.service-booking-card {
  background: oklch(var(--b1));
  border: 2px solid oklch(var(--b3));
  border-radius: 12px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}
.service-booking-card:hover:not(.is-closed) {
  border-color: oklch(var(--p)/0.5);
  background: oklch(var(--p)/0.03);
}
.service-booking-card.selected {
  border-color: oklch(var(--p));
  background: oklch(var(--p)/0.07);
}
.service-booking-card.is-closed {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Slot Time Button ───────────────────────────────────────────────── */
.slot-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1.5px solid oklch(var(--b3));
  cursor: pointer;
  transition: all 0.12s;
  min-width: 72px;
  background: oklch(var(--b1));
}
.slot-btn:hover:not([disabled]) { border-color: oklch(var(--p)); }
.slot-btn.selected {
  border-color: oklch(var(--p));
  background: oklch(var(--p)/0.1);
  color: oklch(var(--p));
}
.slot-btn[disabled] { opacity: 0.38; cursor: not-allowed; }
.slot-btn .slot-time { font-size: 13px; font-weight: 700; }
.slot-btn .slot-avail { font-size: 11px; color: oklch(var(--bc)/0.5); }

/* ── Booking Step Progress ───────────────────────────────────────────── */
.booking-step {
  flex: 1;
  height: 4px;
  background: oklch(var(--b3));
  border-radius: 99px;
  transition: background 0.3s;
}
.booking-step.active { background: oklch(var(--p)); }
.booking-step.done   { background: oklch(var(--su)); }

/* ── Booking Card (Riwayat) ─────────────────────────────────────────── */
.booking-card {
  background: oklch(var(--b1));
  border: 1px solid oklch(var(--b3));
  border-radius: 12px;
  padding: 1rem;
  transition: box-shadow 0.15s;
}
.booking-card:hover { box-shadow: 0 2px 8px oklch(var(--bc)/0.08); }

/* ── Announcement Entry ─────────────────────────────────────────────── */
.ann-entry {
  background: oklch(var(--b1));
  border: 1px solid oklch(var(--b3));
  border-left: 4px solid oklch(var(--wa));
  border-radius: 10px;
  padding: 12px 14px;
  animation: slide-in 0.2s ease;
}
.ann-entry.service-specific { border-left-color: oklch(var(--p)); }

/* ── Announcement Badge (sidebar) ────────────────────────────────────── */
.ann-badge {
  background: oklch(var(--er));
  color: white;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
}

/* ── Admin Service Queue Card ───────────────────────────────────────── */
.service-queue-card {
  background: oklch(var(--b1));
  border: 1px solid oklch(var(--b3));
  border-left: 4px solid oklch(var(--b3));
  border-radius: 12px;
  padding: 1rem;
  transition: border-color 0.2s;
}
.service-queue-card.is-open   { border-left-color: oklch(var(--su)); }
.service-queue-card.is-paused { border-left-color: oklch(var(--wa)); }
.service-queue-card.is-closed { border-left-color: oklch(var(--er)); }

/* ── Stat Card ──────────────────────────────────────────────────────── */
.stat-card {
  background: oklch(var(--b1));
  border: 1px solid oklch(var(--b3));
  border-radius: 12px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-card .stat-label {
  font-size: 11px;
  color: oklch(var(--bc)/0.5);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.stat-card .stat-value {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
  color: oklch(var(--bc));
}
.stat-card .stat-delta {
  font-size: 11px;
  color: oklch(var(--su));
}

/* ── Sidebar service status badges ──────────────────────────────────── */
.sidebar-svc-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.sidebar-svc-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
```

---

## PHASE 2: Warga Views (Hari 3–4)

### 2.1 Sidebar View Router — `warga.js`

```javascript
// ── INIT: Load user dari sessionStorage ───────────────────────────────
const _rawUser = sessionStorage.getItem('siantre_user');
if (_rawUser) {
  AppState.currentUser = JSON.parse(_rawUser);
  document.getElementById('sidebar-user-name').textContent = AppState.currentUser.nama || '—';
  document.getElementById('sidebar-user-nik').textContent  = `NIK: ${AppState.currentUser.nik}`;
}

// ── VIEW MANAGEMENT ───────────────────────────────────────────────────
const PAGE_TITLES = {
  booking:     'Booking Baru',
  riwayat:     'Riwayat Booking',
  monitor:     'Monitor Antrian',
  pengumuman:  'Papan Pengumuman',
};

function showView(name) {
  // Sembunyikan semua view
  document.querySelectorAll('.warga-view').forEach(v => v.classList.add('hidden'));
  // Aktifkan view yang dipilih
  const target = document.getElementById(`view-${name}`);
  if (target) { target.classList.remove('hidden'); }
  // Update sidebar active state
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  // Update page title
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = PAGE_TITLES[name] || '';

  // Side effects per view
  switch (name) {
    case 'riwayat':
      loadMyBookings();
      break;
    case 'monitor':
      initMonitorView();
      break;
    case 'pengumuman':
      loadAnnouncements();
      clearAnnouncementBadge();
      break;
  }
}

// Pasang event listener di semua tombol data-view
document.querySelectorAll('[data-view]').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// ── LOGOUT ────────────────────────────────────────────────────────────
document.getElementById('btn-logout-warga')?.addEventListener('click', () => {
  sessionStorage.removeItem('siantre_user');
  AppState.currentUser = null;
  window.location.href = '/';
});

// Mulai dari view booking
showView('booking');
```

---

### 2.2 View Booking — 3 Langkah

#### 2.2.1 Step 1: Pilih Layanan

```javascript
// ── BOOKING STATE ─────────────────────────────────────────────────────
const BookingState = {
  step: 1,
  selectedService: null,   // { service_id, name, short_code, ... }
  selectedSlot: null,      // { slot_id, time, date, available }
};

// ── RENDER: Step 1 — Service Cards ────────────────────────────────────
function renderBookingServiceCards(services) {
  const grid = document.getElementById('booking-service-cards');
  if (!grid) return;

  if (!services.length) {
    grid.innerHTML = '<p class="text-base-content/40 col-span-full text-sm">Belum ada layanan.</p>';
    return;
  }

  grid.innerHTML = services.map(svc => {
    const isOpen  = svc.status === 'OPEN' || svc.is_open;
    const closedClass = !isOpen ? 'is-closed' : '';
    const statusBadge = isOpen
      ? `<span class="badge badge-success badge-xs">Buka</span>`
      : `<span class="badge badge-error badge-xs">Tutup</span>`;
    return `
      <button
        class="service-booking-card ${closedClass}"
        data-service-id="${svc.service_id}"
        ${!isOpen ? 'disabled' : ''}
      >
        <div class="flex items-start justify-between mb-2">
          <span class="font-black text-xl text-primary">${svc.short_code || '?'}</span>
          ${statusBadge}
        </div>
        <p class="font-semibold text-sm mb-1 leading-tight">${svc.name}</p>
        <p class="text-xs text-base-content/50">
          Sisa: ${svc.quota_remaining ?? '—'} kuota
        </p>
        <p class="text-xs text-base-content/40 mt-1">${svc.open_hour}–${svc.close_hour}</p>
      </button>
    `;
  }).join('');

  // Attach click listeners
  grid.querySelectorAll('.service-booking-card:not([disabled])').forEach(card => {
    card.addEventListener('click', () => selectBookingService(card.dataset.serviceId));
  });
}

function selectBookingService(serviceId) {
  const svc = AppState.services.find(s => s.service_id === serviceId);
  if (!svc) return;
  BookingState.selectedService = svc;

  // Visual feedback
  document.querySelectorAll('.service-booking-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.serviceId === serviceId);
  });

  // Fetch requirements
  sendCommand('GET_SERVICE_DETAIL', { service_id: serviceId });

  // Show next button
  document.getElementById('btn-booking-next-1')?.classList.remove('hidden');
}

// Service detail response → tampilkan requirements
EventBus.on('serviceDetail', (msg) => {
  if (msg.error || !msg.payload) return;
  const reqs = msg.payload.requirements || [];
  const panel = document.getElementById('booking-requirements');
  const list  = document.getElementById('booking-requirements-list');
  if (reqs.length && panel && list) {
    list.innerHTML = reqs.map(r => `<li>${r}</li>`).join('');
    panel.classList.remove('hidden');
  }
});

// Step 1 → Step 2
document.getElementById('btn-booking-next-1')?.addEventListener('click', () => {
  if (!BookingState.selectedService) return;
  goToBookingStep(2);
  // Set default date ke hari ini
  const dateInput = document.getElementById('booking-date-picker');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    dateInput.min   = today;
    loadSlotsForDate(today);
  }
});
```

#### 2.2.2 Step 2: Pilih Slot

```javascript
// ── Slot Loader ────────────────────────────────────────────────────────
function loadSlotsForDate(date) {
  if (!BookingState.selectedService) return;
  sendCommand('GET_AVAILABLE_SLOTS', {
    service_id: BookingState.selectedService.service_id,
    date,
  });
  // Show loading state
  const grid = document.getElementById('booking-slot-grid');
  if (grid) grid.innerHTML = '<span class="loading loading-dots loading-sm text-primary"></span>';
}

document.getElementById('booking-date-picker')?.addEventListener('change', (e) => {
  loadSlotsForDate(e.target.value);
  BookingState.selectedSlot = null;
  document.getElementById('btn-booking-next-2')?.classList.add('hidden');
});

// Slots loaded response
EventBus.on('slotsLoaded', (msg) => {
  // Hanya proses kalau sedang di step 2
  const step2 = document.getElementById('booking-step-2');
  if (!step2 || step2.classList.contains('hidden')) return;

  renderSlotGrid(msg, 'booking-slot-grid', (slot) => {
    BookingState.selectedSlot = slot;
    document.getElementById('btn-booking-next-2')?.classList.remove('hidden');
  });
});

// Juga gunakan untuk reschedule
function renderSlotGrid(msg, containerId, onSelect) {
  const grid = document.getElementById(containerId);
  if (!grid) return;

  if (msg.error || !msg.payload?.slots?.length) {
    grid.innerHTML = `<p class="text-sm text-base-content/40 py-4">Tidak ada slot tersedia.</p>`;
    return;
  }

  grid.innerHTML = msg.payload.slots.map(s => {
    const avail   = s.available ?? (s.capacity - s.booked_count);
    const isFull  = avail <= 0 || s.status === 'FULL';
    const barW    = isFull ? 4 : Math.max(0, 4 - avail);
    return `
      <button
        class="slot-btn"
        data-slot-id="${s.slot_id}"
        data-slot-time="${s.time}"
        data-slot-date="${s.date}"
        data-slot-avail="${avail}"
        ${isFull ? 'disabled' : ''}
      >
        <span class="slot-time">${s.time}</span>
        <span class="slot-avail">${isFull ? 'PENUH' : `${avail}/${s.capacity}`}</span>
      </button>
    `;
  }).join('');

  grid.querySelectorAll('.slot-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      onSelect({
        slot_id:   btn.dataset.slotId,
        time:      btn.dataset.slotTime,
        date:      btn.dataset.slotDate,
        available: parseInt(btn.dataset.slotAvail),
      });
    });
  });
}

// Step 2 → Step 3
document.getElementById('btn-booking-next-2')?.addEventListener('click', () => {
  if (!BookingState.selectedSlot) return;
  // Populate konfirmasi
  document.getElementById('confirm-service-name').textContent =
    BookingState.selectedService?.name || '—';
  document.getElementById('confirm-slot-date').textContent =
    formatDate(BookingState.selectedSlot.date);
  document.getElementById('confirm-slot-time').textContent =
    BookingState.selectedSlot.time;
  document.getElementById('confirm-citizen-name').textContent =
    AppState.currentUser?.nama || '—';
  goToBookingStep(3);
});

// Step back buttons
document.getElementById('btn-booking-back-2')?.addEventListener('click', () => goToBookingStep(1));
document.getElementById('btn-booking-back-3')?.addEventListener('click', () => goToBookingStep(2));
document.getElementById('btn-booking-cancel-confirm')?.addEventListener('click', () => goToBookingStep(1));
```

#### 2.2.3 Step 3: Konfirmasi & Submit

```javascript
// ── STEP SWITCHER ─────────────────────────────────────────────────────
function goToBookingStep(step) {
  BookingState.step = step;
  for (let i = 1; i <= 3; i++) {
    const stepEl  = document.getElementById(`booking-step-${i}`);
    const barEl   = document.getElementById(`step-bar-${i}`);
    const labelEl = document.getElementById(`step-label-${i}`);
    if (!stepEl) continue;
    stepEl.classList.toggle('hidden', i !== step);
    if (barEl) {
      barEl.classList.toggle('active', i === step);
      barEl.classList.toggle('done',   i < step);
      barEl.classList.remove(i > step ? 'active' : '');
    }
    if (labelEl) {
      labelEl.classList.toggle('text-primary', i === step);
      labelEl.classList.toggle('font-semibold', i === step);
      labelEl.classList.toggle('text-base-content/50', i !== step);
    }
  }
}

// ── KONFIRMASI BOOKING ────────────────────────────────────────────────
document.getElementById('btn-booking-confirm')?.addEventListener('click', () => {
  if (!AppState.currentUser || !BookingState.selectedService || !BookingState.selectedSlot) return;
  setLoading('btn-booking-confirm', true);
  sendCommand('CREATE_BOOKING', {
    citizen_id:   AppState.currentUser.citizen_id,
    citizen_name: AppState.currentUser.nama,
    service_id:   BookingState.selectedService.service_id,
    slot_id:      BookingState.selectedSlot.slot_id,
  });
});

EventBus.on('bookingResult', (msg) => {
  setLoading('btn-booking-confirm', false);
  if (msg.error) {
    showNotification('Booking Gagal', msg.error, 'error');
    return;
  }
  const result = msg.payload;
  // Tampilkan success result
  document.getElementById('booking-success-result')?.classList.remove('hidden');
  document.getElementById('booking-result-code').textContent = result.booking_code;
  document.getElementById('btn-booking-confirm').disabled = true;
  document.getElementById('btn-booking-cancel-confirm').textContent = 'Lihat Riwayat';
  document.getElementById('btn-booking-cancel-confirm').onclick = () => showView('riwayat');

  // Reset state
  BookingState.selectedService = null;
  BookingState.selectedSlot    = null;

  showNotification('Booking Berhasil!', `Kode: ${result.booking_code}`, 'success');
  // Refresh my bookings di background
  sendCommand('GET_MY_BOOKING', { citizen_id: AppState.currentUser.citizen_id });
});

// Helper format tanggal
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return dateStr; }
}
```

---

### 2.3 View Riwayat — List Booking

```javascript
// ── LOAD BOOKINGS ─────────────────────────────────────────────────────
function loadMyBookings() {
  if (!AppState.currentUser) return;
  sendCommand('GET_MY_BOOKING', { citizen_id: AppState.currentUser.citizen_id });
}

EventBus.on('myBookingLoaded', (msg) => {
  if (msg.error) {
    renderBookingList([]);
    return;
  }
  const bookings = msg.payload?.bookings || [];
  AppState.allBookings = bookings;
  renderBookingList(bookings);
});

// ── RENDER BOOKING LIST ───────────────────────────────────────────────
function renderBookingList(bookings) {
  const container = document.getElementById('booking-list');
  if (!container) return;

  if (!bookings.length) {
    container.innerHTML = `
      <div class="text-center py-12">
        <p class="text-4xl mb-3">📭</p>
        <p class="font-semibold text-base-content/60">Belum ada booking</p>
        <button class="btn btn-primary btn-sm mt-3" onclick="showView('booking')">
          Buat Booking Sekarang
        </button>
      </div>
    `;
    return;
  }

  // Sort: BOOKED & ARRIVED dulu, sisanya di bawah
  const sorted = [...bookings].sort((a, b) => {
    const ORDER = { ARRIVED: 0, CALLED: 1, BOOKED: 2, DONE: 3, EXPIRED: 4, CANCELLED: 5 };
    return (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9);
  });

  container.innerHTML = sorted.map(b => bookingCardHTML(b)).join('');
  attachBookingActions(sorted);
}

function bookingCardHTML(b) {
  const statusConfig = {
    BOOKED:    { badge: 'badge-warning',  icon: '🟡', label: 'Menunggu' },
    ARRIVED:   { badge: 'badge-info',     icon: '🟢', label: 'Sudah Check-in' },
    CALLED:    { badge: 'badge-primary',  icon: '🔔', label: 'Dipanggil' },
    DONE:      { badge: 'badge-success',  icon: '✅', label: 'Selesai' },
    CANCELLED: { badge: 'badge-error',    icon: '❌', label: 'Dibatalkan' },
    EXPIRED:   { badge: 'badge-neutral',  icon: '⏰', label: 'Kadaluarsa' },
  };
  const cfg = statusConfig[b.status] || { badge: 'badge-ghost', icon: '•', label: b.status };
  const canCancel     = ['BOOKED'].includes(b.status);
  const canReschedule = ['BOOKED'].includes(b.status);

  return `
    <div class="booking-card" data-booking-id="${b.booking_id}" data-booking-code="${b.booking_code}">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div>
          <p class="font-mono font-bold text-sm">${b.booking_code}</p>
          <p class="font-semibold">${b.service_name || b.service_id}</p>
        </div>
        <span class="badge ${cfg.badge} badge-sm whitespace-nowrap">${cfg.icon} ${cfg.label}</span>
      </div>
      <p class="text-sm text-base-content/60">
        ${formatDate(b.slot_date)} · ${b.slot_time}
        ${b.queue_number ? `· <strong>Nomor Antrian: ${b.queue_number}</strong>` : ''}
      </p>
      ${canCancel || canReschedule ? `
        <div class="flex gap-2 mt-3">
          ${canReschedule ? `<button class="btn btn-outline btn-xs btn-reschedule" data-code="${b.booking_code}" data-service="${b.service_id}" data-current="${b.slot_time} ${b.slot_date}">Ubah Jadwal</button>` : ''}
          ${canCancel     ? `<button class="btn btn-error btn-xs btn-cancel-booking" data-code="${b.booking_code}">Batalkan</button>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function attachBookingActions(bookings) {
  // Cancel
  document.querySelectorAll('.btn-cancel-booking').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm(`Batalkan booking ${btn.dataset.code}?`)) return;
      setLoading(null, true); // No specific btn to disable here
      sendCommand('CANCEL_BOOKING', {
        booking_code: btn.dataset.code,
        citizen_id:   AppState.currentUser?.citizen_id,
      });
    });
  });

  // Reschedule
  document.querySelectorAll('.btn-reschedule').forEach(btn => {
    btn.addEventListener('click', () => {
      openRescheduleModal(btn.dataset.code, btn.dataset.service, btn.dataset.current);
    });
  });
}

// Cancel result
EventBus.on('cancelResult', (msg) => {
  if (msg.error) { showNotification('Gagal Batalkan', msg.error, 'error'); }
  else {
    showNotification('Booking Dibatalkan', '', 'info');
    loadMyBookings();
  }
});

// Reschedule result
EventBus.on('rescheduleResult', (msg) => {
  if (msg.error) { showNotification('Gagal Reschedule', msg.error, 'error'); }
  else {
    showNotification('Jadwal Diperbarui', `Jam baru: ${msg.payload?.new_slot_time}`, 'success');
    document.getElementById('modal-reschedule')?.close();
    loadMyBookings();
  }
});
```

#### 2.3.1 Reschedule Modal Logic

```javascript
// ── RESCHEDULE MODAL ──────────────────────────────────────────────────
let rescheduleBookingCode = null;
let rescheduleNewSlot     = null;

function openRescheduleModal(bookingCode, serviceId, currentSchedule) {
  rescheduleBookingCode = bookingCode;
  rescheduleNewSlot     = null;
  document.getElementById('reschedule-code').textContent    = bookingCode;
  document.getElementById('reschedule-current').textContent = currentSchedule;
  document.getElementById('reschedule-slot-grid').innerHTML  = '';
  document.getElementById('btn-confirm-reschedule').disabled = true;

  // Set date input
  const dateInput = document.getElementById('reschedule-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    dateInput.min   = today;
    // Load slots for today
    sendCommand('GET_AVAILABLE_SLOTS', { service_id: serviceId, date: today });
    dateInput.onchange = (e) => {
      sendCommand('GET_AVAILABLE_SLOTS', { service_id: serviceId, date: e.target.value });
    };
  }

  document.getElementById('modal-reschedule')?.showModal();
}

// Re-use slotsLoaded untuk reschedule modal juga
EventBus.on('slotsLoaded', (msg) => {
  const rescheduleGrid = document.getElementById('reschedule-slot-grid');
  if (!rescheduleGrid || !document.getElementById('modal-reschedule')?.open) return;

  renderSlotGrid(msg, 'reschedule-slot-grid', (slot) => {
    rescheduleNewSlot = slot;
    document.getElementById('btn-confirm-reschedule').disabled = false;
  });
});

document.getElementById('btn-confirm-reschedule')?.addEventListener('click', () => {
  if (!rescheduleBookingCode || !rescheduleNewSlot) return;
  setLoading('btn-confirm-reschedule', true);
  sendCommand('RESCHEDULE_BOOKING', {
    booking_code: rescheduleBookingCode,
    citizen_id:   AppState.currentUser?.citizen_id,
    new_slot_id:  rescheduleNewSlot.slot_id,
  });
});
```

---

### 2.4 View Monitor — Queue Real-Time

```javascript
// ── MONITOR STATE ─────────────────────────────────────────────────────
let monitorCurrentServiceId   = null;
let monitorCurrentNumberValue = null;

function initMonitorView() {
  // Populate service selector
  const select = document.getElementById('monitor-service-select');
  if (!select) return;
  select.innerHTML = '<option value="">-- Pilih layanan --</option>';
  AppState.services.forEach(svc => {
    const opt = document.createElement('option');
    opt.value       = svc.service_id;
    opt.textContent = `${svc.short_code} — ${svc.name}`;
    select.appendChild(opt);
  });

  // Restore previous selection jika ada
  if (monitorCurrentServiceId) {
    select.value = monitorCurrentServiceId;
    updateMonitorDisplay(monitorCurrentServiceId);
  }
}

document.getElementById('monitor-service-select')?.addEventListener('change', (e) => {
  monitorCurrentServiceId = e.target.value || null;
  if (!monitorCurrentServiceId) {
    resetMonitorDisplay();
    return;
  }
  // Ambil data antrian saat ini
  sendCommand('GET_QUEUE_STATUS', { service_id: monitorCurrentServiceId });
  updateMonitorServiceLabel(monitorCurrentServiceId);
  clearMonitorLog();
});

function updateMonitorDisplay(serviceId) {
  const snapshot = AppState.queueSnapshots?.[serviceId];
  if (!snapshot) return;

  const numEl = document.getElementById('monitor-current-number');
  if (numEl && snapshot.current !== monitorCurrentNumberValue) {
    animateMonitorNumber(numEl, snapshot.current || '—');
    monitorCurrentNumberValue = snapshot.current;
  }

  document.getElementById('monitor-total-waiting').textContent =
    snapshot.waiting ?? '—';
}

function animateMonitorNumber(el, newVal) {
  anime({
    targets: el, rotateX: [0, -90], opacity: [1, 0],
    duration: 200, easing: 'easeInQuart',
    complete: () => {
      el.textContent = newVal;
      anime({ targets: el, rotateX: [90, 0], opacity: [0, 1], duration: 200, easing: 'easeOutQuart' });
    },
  });
}

function resetMonitorDisplay() {
  document.getElementById('monitor-current-number').textContent = '—';
  document.getElementById('monitor-total-waiting').textContent  = '—';
  document.getElementById('monitor-my-number').textContent      = '—';
  document.getElementById('monitor-people-ahead').textContent   = '—';
  document.getElementById('monitor-est-wait').textContent       = '—';
  document.getElementById('monitor-service-label').textContent  = 'Pilih layanan untuk memulai';
}

function updateMonitorServiceLabel(serviceId) {
  const svc = AppState.services.find(s => s.service_id === serviceId);
  const el  = document.getElementById('monitor-service-label');
  if (el) el.textContent = svc?.name || serviceId;
}

// Listen QUEUE_UPDATE — update monitor jika service cocok
EventBus.on('queueUpdate', (msg) => {
  if (msg.service_id !== monitorCurrentServiceId) return;

  const p = msg.payload;
  // Update nomor yang dilayani
  const numEl = document.getElementById('monitor-current-number');
  if (numEl && p.current_number && p.current_number !== monitorCurrentNumberValue) {
    animateMonitorNumber(numEl, p.current_number);
    monitorCurrentNumberValue = p.current_number;
  }

  document.getElementById('monitor-total-waiting').textContent = p.total_waiting ?? '—';
  document.getElementById('monitor-est-wait').textContent      = p.estimated_wait || '—';

  // My number dari booking aktif
  const activeBooking = AppState.allBookings?.find(
    b => b.service_id === monitorCurrentServiceId && ['ARRIVED','CALLED'].includes(b.status)
  );
  if (activeBooking?.queue_number) {
    document.getElementById('monitor-my-number').textContent = activeBooking.queue_number;
    // People ahead = posisi dalam antrian dikurangi nomor saat ini
    const ahead = Math.max(0, activeBooking.queue_number - (p.current_number || 0) - 1);
    document.getElementById('monitor-people-ahead').textContent = ahead;
  }

  // Append log
  appendMonitorLog(p);
});

// Listen QUEUE_STATUS (dari GET_QUEUE_STATUS)
EventBus.on('queueStatus', (msg) => {
  if (msg.error || !msg.payload) return;
  const p = msg.payload;
  if (p.service_id !== monitorCurrentServiceId) return;

  const numEl = document.getElementById('monitor-current-number');
  if (numEl) { numEl.textContent = p.current_number || '—'; }
  document.getElementById('monitor-total-waiting').textContent = p.total_waiting ?? '—';
});

// ── Monitor Event Log ──────────────────────────────────────────────────
const MAX_MONITOR_LOG = 20;

function appendMonitorLog(payload) {
  const log = document.getElementById('monitor-event-log');
  if (!log) return;

  log.querySelector('.italic')?.remove();  // Remove empty state

  const time = new Date(payload.timestamp || Date.now()).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const icons = {
    QUEUE_MOVED:     '🔢',
    YOUR_TURN:       '🔔',
    SERVICE_CLOSED:  '🚫',
    SERVICE_RESUMED: '✅',
    ANNOUNCEMENT:    '📢',
    QUOTA_EXHAUSTED: '⚠️',
    QUOTA_OPENED:    '🎉',
  };

  const entry = document.createElement('div');
  entry.className = 'log-entry type-queue text-xs';
  entry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-text">${icons[payload.event_type] || '•'} ${payload.message || payload.event_type}</span>
  `;
  log.insertBefore(entry, log.firstChild);

  // Max items
  while (log.children.length > MAX_MONITOR_LOG) log.removeChild(log.lastChild);

  // Auto-scroll to top
  log.scrollTop = 0;
}

function clearMonitorLog() {
  const log = document.getElementById('monitor-event-log');
  if (log) log.innerHTML = '<p class="text-base-content/40 italic text-center py-4 text-xs">Memantau antrian...</p>';
}
```

---

### 2.5 View Pengumuman

```javascript
// ── LOAD & RENDER ANNOUNCEMENTS ───────────────────────────────────────
function loadAnnouncements() {
  sendCommand('GET_ANNOUNCEMENTS');
}

EventBus.on('announcements', (msg) => {
  const list = msg.payload?.announcements || [];
  renderAnnouncementList(list);
});

function renderAnnouncementList(anns) {
  const container = document.getElementById('announcement-list');
  if (!container) return;

  if (!anns.length) {
    container.innerHTML = `
      <div class="text-center py-12">
        <p class="text-4xl mb-3">📭</p>
        <p class="font-semibold text-base-content/60 text-sm">Belum ada pengumuman.</p>
      </div>
    `;
    return;
  }

  // Tampilkan dari terbaru ke terlama
  const reversed = [...anns].reverse();
  container.innerHTML = reversed.map(a => {
    const time       = new Date(a.timestamp || Date.now()).toLocaleString('id-ID', {
      hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
    });
    const serviceTag = a.service_id
      ? `<span class="badge badge-primary badge-xs">${a.service_id}</span>`
      : `<span class="badge badge-neutral badge-xs">Semua Layanan</span>`;
    return `
      <div class="ann-entry ${a.service_id ? 'service-specific' : ''}">
        <div class="flex items-center gap-2 mb-1">
          ${serviceTag}
          <span class="text-xs text-base-content/40">${time}</span>
        </div>
        <p class="text-sm font-medium">${a.message}</p>
      </div>
    `;
  }).join('');
}

// Pengumuman baru masuk → prepend + badge
EventBus.on('newAnnouncement', (ann) => {
  // Increment badge
  AppState.unreadAnnouncements++;
  updateAnnouncementBadge();

  // Prepend ke list jika view aktif
  const container = document.getElementById('announcement-list');
  const currentView = document.querySelector('.warga-view:not(.hidden)')?.id;
  if (container && currentView === 'view-pengumuman') {
    const time = new Date(ann.timestamp || Date.now()).toLocaleTimeString('id-ID', {
      hour: '2-digit', minute: '2-digit',
    });
    const entry = document.createElement('div');
    entry.className = 'ann-entry';
    entry.innerHTML = `
      <div class="flex items-center gap-2 mb-1">
        <span class="badge badge-neutral badge-xs">Baru</span>
        <span class="text-xs text-base-content/40">${time}</span>
      </div>
      <p class="text-sm font-medium">${ann.message}</p>
    `;
    container.insertBefore(entry, container.firstChild);
    container.querySelector('.text-center')?.remove();
  }
});

function updateAnnouncementBadge() {
  const n = AppState.unreadAnnouncements;
  ['ann-badge-count', 'btm-ann-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (n > 0) {
      el.textContent = n > 9 ? '9+' : n;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}

function clearAnnouncementBadge() {
  AppState.unreadAnnouncements = 0;
  updateAnnouncementBadge();
}

document.getElementById('btn-refresh-announcements')?.addEventListener('click', loadAnnouncements);
```

---

### 2.6 Sidebar Service Status (warga.html)

```javascript
// Tambahkan ke status-indicator.js — render ke sidebar warga
function renderSidebarServiceStatus(services) {
  const container = document.getElementById('sidebar-service-status');
  if (!container) return;
  container.innerHTML = services.map(svc => {
    const isOpen = svc.status === 'OPEN' || svc.is_open;
    return `
      <div class="sidebar-svc-row">
        <span class="sidebar-svc-dot ${isOpen ? 'bg-success' : 'bg-error'}"></span>
        <span class="flex-1 truncate text-xs">${svc.short_code || svc.service_id}</span>
        <span class="text-xs text-base-content/40">${svc.quota_remaining ?? ''}</span>
      </div>
    `;
  }).join('');
}

EventBus.on('servicesLoaded', (s) => { renderSidebarServiceStatus(s); /* ... existing */ });
EventBus.on('servicesUpdate', (s) => { renderSidebarServiceStatus(s); /* ... existing */ });
```

---

## PHASE 3: Admin Dashboard (Hari 5–6)

### 3.1 Refactor `admin.html` — Full Sidebar Layout

#### 3.1.1 Struktur HTML Admin

```html
<!DOCTYPE html>
<html lang="id" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SiAntre — Panel Admin</title>
  <!-- Semua CDN sama dengan warga.html -->
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/apexcharts@3.54.0/dist/apexcharts.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js"
          integrity="sha512-..." crossorigin="anonymous"></script>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body class="bg-base-200 min-h-screen">
  <div id="toast-container" class="toast toast-top toast-end z-[999]"></div>

  <!-- ══════════════════════════════════════════════ -->
  <!--   PANEL LOGIN (default visible)               -->
  <!-- ══════════════════════════════════════════════ -->
  <div id="admin-login-wrapper" class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md">

      <!-- System belum diinisialisasi (hidden by default) -->
      <div id="admin-setup-panel" class="hidden card bg-base-100 shadow-xl mb-4">
        <div class="card-body">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-2xl">⚙️</span>
            <h2 class="font-bold text-lg">Setup Admin Pertama</h2>
          </div>
          <p class="text-sm text-base-content/60 mb-4">
            Belum ada akun terdaftar. Buat akun Administrator pertama untuk memulai.
          </p>
          <div class="flex flex-col gap-3">
            <label class="form-control">
              <div class="label"><span class="label-text text-xs font-semibold uppercase">ID Pegawai</span></div>
              <input type="text" id="setup-id" placeholder="Contoh: P001" class="input input-bordered input-sm" />
            </label>
            <label class="form-control">
              <div class="label"><span class="label-text text-xs font-semibold uppercase">Nama Lengkap</span></div>
              <input type="text" id="setup-nama" class="input input-bordered input-sm" />
            </label>
            <label class="form-control">
              <div class="label"><span class="label-text text-xs font-semibold uppercase">PIN (min 6 digit)</span></div>
              <input type="password" id="setup-pin" class="input input-bordered input-sm" />
            </label>
            <button class="btn btn-warning w-full" id="btn-setup-admin">
              Daftarkan Admin Pertama
            </button>
          </div>
        </div>
      </div>

      <!-- Form Login Biasa -->
      <div id="admin-login-panel" class="card bg-base-100 shadow-xl">
        <div class="card-body">
          <div class="flex items-center gap-3 mb-4">
            <div class="avatar placeholder">
              <div class="bg-neutral text-neutral-content rounded-xl w-10">
                <span class="text-lg font-black">S</span>
              </div>
            </div>
            <div>
              <h1 class="font-bold text-lg leading-tight">SiAntre</h1>
              <p class="text-xs text-base-content/50">Panel Petugas & Administrator</p>
            </div>
          </div>
          <label class="form-control w-full mb-3">
            <div class="label"><span class="label-text text-xs font-semibold uppercase">ID Pegawai</span></div>
            <input type="text" id="admin-id" placeholder="P001"
                   class="input input-bordered w-full font-mono" autocomplete="off" />
          </label>
          <label class="form-control w-full mb-4">
            <div class="label"><span class="label-text text-xs font-semibold uppercase">PIN</span></div>
            <input type="password" id="admin-pin" placeholder="••••••"
                   class="input input-bordered w-full" />
          </label>
          <button class="btn btn-primary w-full" id="btn-admin-login" data-original-text="Masuk ke Panel">
            Masuk ke Panel
          </button>
        </div>
      </div>

      <!-- WS Badge -->
      <div class="mt-3 flex justify-center">
        <span id="ws-status-badge" class="badge badge-warning gap-1 badge-sm">
          <span class="loading loading-ring loading-xs"></span>
          Menghubungkan...
        </span>
      </div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════════ -->
  <!--   DASHBOARD (hidden by default)               -->
  <!-- ══════════════════════════════════════════════ -->
  <div id="admin-dashboard" class="hidden flex h-screen overflow-hidden">

    <!-- SIDEBAR -->
    <aside id="admin-sidebar"
      class="hidden lg:flex flex-col w-64 bg-neutral text-neutral-content flex-shrink-0 h-full overflow-y-auto"
    >
      <!-- Logo -->
      <div class="p-5 border-b border-neutral-content/10">
        <div class="flex items-center gap-3">
          <div class="avatar placeholder">
            <div class="bg-primary text-primary-content rounded-xl w-9">
              <span class="text-lg font-black">S</span>
            </div>
          </div>
          <div>
            <p class="font-bold text-base">SiAntre Admin</p>
            <p class="text-xs text-neutral-content/40">Panel Petugas</p>
          </div>
        </div>
      </div>

      <!-- Officer info -->
      <div class="px-4 py-3 border-b border-neutral-content/10">
        <p class="text-xs text-neutral-content/40 mb-0.5">Masuk sebagai</p>
        <p class="font-semibold text-sm" id="admin-sidebar-name">—</p>
        <div class="flex items-center gap-1 mt-0.5">
          <span class="badge badge-primary badge-xs" id="admin-sidebar-role">—</span>
          <span class="text-xs text-neutral-content/40" id="admin-sidebar-id"></span>
        </div>
      </div>

      <!-- Nav -->
      <nav class="flex-1 px-3 py-4 flex flex-col gap-1" id="admin-nav">
        <button class="admin-sidebar-item active" data-admin-view="dashboard">
          <span>📊</span><span>Dashboard</span>
        </button>
        <button class="admin-sidebar-item" data-admin-view="kedatangan">
          <span>✓</span><span>Manajemen Kedatangan</span>
        </button>
        <button class="admin-sidebar-item" data-admin-view="pengumuman">
          <span>📢</span><span>Kirim Pengumuman</span>
        </button>
        <button class="admin-sidebar-item" data-admin-view="reset">
          <span>🔄</span><span>Reset Quota</span>
        </button>
        <button class="admin-sidebar-item" data-admin-view="statistik">
          <span>📈</span><span>Statistik</span>
        </button>
        <!-- ADMIN only: ditampilkan setelah login jika role=ADMIN -->
        <div id="admin-only-menu" class="hidden">
          <div class="divider my-1 text-xs text-neutral-content/30">Administrator</div>
          <button class="admin-sidebar-item" data-admin-view="petugas">
            <span>👥</span><span>Manajemen Petugas</span>
          </button>
        </div>
      </nav>

      <!-- Service status sidebar -->
      <div class="px-4 py-3 border-t border-neutral-content/10">
        <p class="text-xs font-semibold text-neutral-content/40 uppercase tracking-wide mb-2">
          Status Layanan
        </p>
        <div id="admin-sidebar-svc" class="flex flex-col gap-1.5"></div>
      </div>

      <!-- WS badge + logout -->
      <div class="p-4 border-t border-neutral-content/10 flex items-center justify-between">
        <span id="ws-status-badge-sidebar" class="badge badge-warning gap-1 badge-xs">● WS</span>
        <button class="btn btn-ghost btn-xs text-neutral-content/50" id="btn-admin-logout">
          Keluar
        </button>
      </div>
    </aside>

    <!-- MAIN CONTENT ADMIN -->
    <div class="flex-1 flex flex-col overflow-hidden">

      <!-- Header -->
      <header class="bg-base-100 border-b border-base-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button class="btn btn-ghost btn-sm lg:hidden" id="btn-admin-sidebar-toggle">☰</button>
        <h1 class="font-bold text-base" id="admin-page-title">Dashboard</h1>
        <span class="badge badge-success animate-pulse badge-sm">● LIVE</span>
      </header>

      <!-- Scrollable content -->
      <main class="flex-1 overflow-y-auto p-4 lg:p-6">

        <!-- ════════════════════════════════════════════ -->
        <!--   ADMIN VIEW 1: DASHBOARD                  -->
        <!-- ════════════════════════════════════════════ -->
        <div id="admin-view-dashboard" class="admin-view">

          <!-- Stat Cards Row -->
          <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
            <div class="stat-card">
              <span class="stat-label">Total Booking</span>
              <span class="stat-value" id="adm-stat-bookings">—</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Dilayani</span>
              <span class="stat-value text-success" id="adm-stat-served">—</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Dibatalkan</span>
              <span class="stat-value text-error" id="adm-stat-cancelled">—</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Live Subscriber</span>
              <span class="stat-value text-info" id="adm-stat-subs">—</span>
            </div>
          </div>

          <!-- Queue Cards Per Layanan -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6" id="admin-queue-cards">
            <!-- Diisi JS -->
            <div class="skeleton h-48 rounded-xl"></div>
            <div class="skeleton h-48 rounded-xl"></div>
            <div class="skeleton h-48 rounded-xl"></div>
          </div>

          <!-- Chart -->
          <div class="card bg-base-100 shadow-sm mb-4">
            <div class="card-body">
              <div class="flex items-center justify-between mb-1">
                <h3 class="font-semibold text-sm">Antrian vs Quota Tersisa</h3>
                <span class="badge badge-success animate-pulse badge-sm">● LIVE</span>
              </div>
              <div id="admin-queue-chart" style="min-height: 220px;"></div>
            </div>
          </div>

          <!-- Activity Log -->
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <div class="flex items-center justify-between mb-2">
                <h3 class="font-semibold text-sm">Log Aktivitas Admin</h3>
                <button class="btn btn-ghost btn-xs" id="btn-clear-log">Bersihkan</button>
              </div>
              <div id="activity-log"
                   class="flex flex-col gap-1 max-h-64 overflow-y-auto"
                   role="log" aria-live="polite">
                <p class="log-empty text-base-content/40 italic text-center py-4 text-sm">Menunggu event...</p>
              </div>
            </div>
          </div>

        </div><!-- /admin-view-dashboard -->

        <!-- ════════════════════════════════════════════ -->
        <!--   ADMIN VIEW 2: KEDATANGAN                 -->
        <!-- ════════════════════════════════════════════ -->
        <div id="admin-view-kedatangan" class="admin-view hidden">
          <!-- Tab: Check-In / Walk-In -->
          <div role="tablist" class="tabs tabs-boxed mb-4">
            <button role="tab" class="tab tab-active" data-kedatangan-tab="checkin">Check-In Warga</button>
            <button role="tab" class="tab" data-kedatangan-tab="walkin">Walk-In (Tanpa Booking)</button>
          </div>

          <!-- Check-In Tab -->
          <div id="kedatangan-tab-checkin" class="kedatangan-tab max-w-lg">
            <div class="card bg-base-100 shadow-sm">
              <div class="card-body">
                <h3 class="font-semibold mb-1">Konfirmasi Kedatangan Warga</h3>
                <p class="text-sm text-base-content/60 mb-4">
                  Masukkan kode booking dari warga (tertera di struk atau konfirmasi SMS).
                </p>
                <label class="form-control w-full mb-3">
                  <div class="label"><span class="label-text text-xs font-semibold uppercase">Kode Booking</span></div>
                  <input
                    type="text"
                    id="adm-booking-code"
                    placeholder="PKB-XXXX"
                    class="input input-bordered w-full font-mono font-bold tracking-widest uppercase"
                    maxlength="10"
                  />
                </label>
                <button class="btn btn-primary w-full" id="btn-checkin" data-original-text="✓ Konfirmasi Check-In">
                  ✓ Konfirmasi Check-In
                </button>
                <!-- Result panel -->
                <div id="checkin-result" class="hidden mt-4">
                  <div class="alert alert-success">
                    <span>✅</span>
                    <div>
                      <p class="font-bold" id="checkin-result-name">—</p>
                      <p class="text-sm">Nomor Antrian: <strong id="checkin-result-number">—</strong></p>
                      <p class="text-xs opacity-75" id="checkin-result-detail">—</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Walk-In Tab (hidden) -->
          <div id="kedatangan-tab-walkin" class="kedatangan-tab hidden max-w-lg">
            <div class="card bg-base-100 shadow-sm">
              <div class="card-body">
                <h3 class="font-semibold mb-1">Daftarkan Warga Walk-In</h3>
                <p class="text-sm text-base-content/60 mb-4">
                  Untuk warga yang datang langsung tanpa booking online.
                </p>
                <label class="form-control w-full mb-3">
                  <div class="label"><span class="label-text text-xs font-semibold uppercase">Layanan</span></div>
                  <select id="adm-walkin-service" class="select select-bordered select-sm w-full">
                    <option value="">-- Pilih layanan --</option>
                  </select>
                </label>
                <label class="form-control w-full mb-3">
                  <div class="label"><span class="label-text text-xs font-semibold uppercase">Nama Warga</span></div>
                  <input type="text" id="adm-walkin-name" placeholder="Nama warga" class="input input-bordered w-full" />
                </label>
                <button class="btn btn-primary w-full" id="btn-walkin" data-original-text="➕ Daftarkan Walk-In">
                  ➕ Daftarkan Walk-In
                </button>
                <!-- Result panel -->
                <div id="walkin-result" class="hidden mt-4">
                  <div class="alert alert-success">
                    <span>✅</span>
                    <div>
                      <p class="font-bold">Walk-In Berhasil</p>
                      <p class="text-sm">Kode: <span class="font-mono font-bold" id="walkin-result-code">—</span></p>
                      <p class="text-sm">Nomor Antrian: <strong id="walkin-result-number">—</strong></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div><!-- /admin-view-kedatangan -->

        <!-- ════════════════════════════════════════════ -->
        <!--   ADMIN VIEW 3: PENGUMUMAN ADMIN           -->
        <!-- ════════════════════════════════════════════ -->
        <div id="admin-view-pengumuman" class="admin-view hidden max-w-2xl">
          <div class="card bg-base-100 shadow-sm mb-4">
            <div class="card-body">
              <h3 class="font-semibold mb-3">Broadcast Pengumuman ke Warga</h3>
              <label class="form-control w-full mb-2">
                <div class="label"><span class="label-text text-xs font-semibold uppercase">Layanan Tujuan</span></div>
                <select id="adm-announce-service" class="select select-bordered select-sm w-full">
                  <option value="">── Semua Layanan ──</option>
                </select>
              </label>
              <label class="form-control w-full mb-3">
                <div class="label"><span class="label-text text-xs font-semibold uppercase">Isi Pengumuman</span></div>
                <input
                  type="text"
                  id="adm-announce-msg"
                  placeholder="Ketik pesan pengumuman..."
                  class="input input-bordered w-full"
                  maxlength="200"
                />
              </label>
              <button class="btn btn-primary w-full" id="btn-announce" data-original-text="📢 Kirim Pengumuman">
                📢 Kirim Pengumuman
              </button>
            </div>
          </div>
          <!-- Riwayat Pengumuman -->
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <h3 class="font-semibold text-sm mb-3">Riwayat Pengumuman Hari Ini</h3>
              <div id="admin-announcement-history" class="flex flex-col gap-2">
                <p class="text-base-content/40 text-sm italic text-center py-4">Belum ada pengumuman.</p>
              </div>
            </div>
          </div>
        </div><!-- /admin-view-pengumuman -->

        <!-- ════════════════════════════════════════════ -->
        <!--   ADMIN VIEW 4: RESET QUOTA               -->
        <!-- ════════════════════════════════════════════ -->
        <div id="admin-view-reset" class="admin-view hidden max-w-lg">
          <div class="card bg-base-100 border border-error/20 shadow-sm">
            <div class="card-body">
              <h3 class="font-semibold text-error mb-1">⚠️ Reset Quota Harian</h3>
              <p class="text-sm text-base-content/60 mb-4">
                Reset akan menghapus semua antrian aktif dan membuka kembali slot kuota untuk layanan yang dipilih.
                <strong class="text-error">Tindakan ini tidak bisa dibatalkan.</strong>
              </p>
              <label class="form-control w-full mb-4">
                <div class="label"><span class="label-text text-xs font-semibold uppercase">Layanan</span></div>
                <select id="adm-reset-service" class="select select-bordered select-sm w-full">
                  <option value="">── Semua Layanan ──</option>
                </select>
              </label>
              <div class="alert alert-warning text-sm mb-4">
                <div>
                  <p class="font-semibold">Dampak reset:</p>
                  <ul class="list-disc ml-4 mt-1 text-xs">
                    <li>Semua antrian aktif (ARRIVED/CALLED) dihapus</li>
                    <li>Slot waktu dibuka kembali dari awal</li>
                    <li>Nomor antrian di-reset ke 1</li>
                    <li>Warga yang sedang menunggu akan menerima notifikasi</li>
                  </ul>
                </div>
              </div>
              <button
                class="btn btn-error w-full"
                id="btn-reset-quota"
                data-original-text="🔄 Reset Quota Sekarang"
              >
                🔄 Reset Quota Sekarang
              </button>
            </div>
          </div>
        </div><!-- /admin-view-reset -->

        <!-- ════════════════════════════════════════════ -->
        <!--   ADMIN VIEW 5: STATISTIK                  -->
        <!-- ════════════════════════════════════════════ -->
        <div id="admin-view-statistik" class="admin-view hidden">
          <!-- Stat Cards (sama dengan dashboard) -->
          <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
            <div class="stat-card">
              <span class="stat-label">Total Booking</span>
              <span class="stat-value" id="stat-total-bookings">—</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Dilayani</span>
              <span class="stat-value text-success" id="stat-total-served">—</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Dibatalkan</span>
              <span class="stat-value text-error" id="stat-total-cancelled">—</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Subscriber Live</span>
              <span class="stat-value text-info" id="stat-subs">—</span>
            </div>
          </div>

          <!-- Chart detail -->
          <div class="card bg-base-100 shadow-sm mb-4">
            <div class="card-body">
              <h3 class="font-semibold text-sm mb-3">Quota Terpakai vs Menunggu per Layanan</h3>
              <div id="stat-detail-chart" style="min-height: 250px;"></div>
            </div>
          </div>

          <!-- Tabel per layanan -->
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body">
              <h3 class="font-semibold text-sm mb-3">Detail Per Layanan</h3>
              <div class="overflow-x-auto">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Layanan</th>
                      <th>Quota</th>
                      <th>Terpakai</th>
                      <th>Menunggu</th>
                      <th>Nomor Saat Ini</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody id="stat-table-body">
                    <tr><td colspan="6" class="text-center text-base-content/40 py-4">Memuat data...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div><!-- /admin-view-statistik -->

        <!-- ════════════════════════════════════════════ -->
        <!--   ADMIN VIEW 6: MANAJEMEN PETUGAS (ADMIN)  -->
        <!-- ════════════════════════════════════════════ -->
        <div id="admin-view-petugas" class="admin-view hidden">
          <div class="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">

            <!-- Tabel petugas -->
            <div class="card bg-base-100 shadow-sm">
              <div class="card-body">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold">Daftar Petugas Terdaftar</h3>
                  <button class="btn btn-ghost btn-xs" id="btn-refresh-officers">↻ Refresh</button>
                </div>
                <div class="overflow-x-auto">
                  <table class="table table-sm">
                    <thead>
                      <tr><th>ID</th><th>Nama</th><th>Jabatan</th><th>Role</th><th>Aksi</th></tr>
                    </thead>
                    <tbody id="officers-table-body">
                      <tr><td colspan="5" class="text-center text-base-content/40 py-6">Memuat...</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Form tambah -->
            <div class="card bg-base-100 shadow-sm">
              <div class="card-body">
                <h3 class="font-semibold mb-1">Tambah Petugas Baru</h3>
                <p class="text-xs text-base-content/50 mb-3">Memerlukan PIN Anda untuk konfirmasi.</p>
                <div class="flex flex-col gap-2">
                  <label class="form-control">
                    <div class="label"><span class="label-text text-xs font-semibold uppercase">PIN Anda (konfirmasi)</span></div>
                    <input type="password" id="officer-req-pin" class="input input-bordered input-sm" />
                  </label>
                  <label class="form-control">
                    <div class="label"><span class="label-text text-xs font-semibold uppercase">ID Pegawai Baru</span></div>
                    <input type="text" id="new-officer-id" placeholder="P002" class="input input-bordered input-sm" />
                  </label>
                  <label class="form-control">
                    <div class="label"><span class="label-text text-xs font-semibold uppercase">Nama Lengkap</span></div>
                    <input type="text" id="new-officer-nama" class="input input-bordered input-sm" />
                  </label>
                  <label class="form-control">
                    <div class="label"><span class="label-text text-xs font-semibold uppercase">Jabatan</span></div>
                    <input type="text" id="new-officer-jabatan" placeholder="Petugas Loket" class="input input-bordered input-sm" />
                  </label>
                  <label class="form-control">
                    <div class="label"><span class="label-text text-xs font-semibold uppercase">Role</span></div>
                    <select id="new-officer-role" class="select select-bordered select-sm">
                      <option value="PETUGAS">PETUGAS</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </label>
                  <label class="form-control">
                    <div class="label"><span class="label-text text-xs font-semibold uppercase">PIN Baru (min 6 digit)</span></div>
                    <input type="password" id="new-officer-pin" class="input input-bordered input-sm" />
                  </label>
                  <button class="btn btn-primary btn-sm w-full mt-1" id="btn-add-officer" data-original-text="➕ Tambah Petugas">
                    ➕ Tambah Petugas
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div><!-- /admin-view-petugas -->

      </main>
    </div><!-- /main content admin -->
  </div><!-- /admin-dashboard -->

  <script src="js/ws-client.js"></script>
  <script src="js/notification.js"></script>
  <script src="js/activity-log.js"></script>
  <script src="js/chart.js"></script>
  <script src="js/status-indicator.js"></script>
  <script src="js/admin.js"></script>
</body>
```

---

### 3.2 CSS Tambahan untuk Admin

```css
/* Di css/style.css — tambahkan setelah blok warga */

/* ── Admin Sidebar Item ──────────────────────────────────────────────── */
.admin-sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  color: oklch(var(--nc)/0.6);
  font-size: 14px;
  font-weight: 500;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
}
.admin-sidebar-item:hover {
  background: oklch(var(--nc)/0.1);
  color: oklch(var(--nc));
}
.admin-sidebar-item.active {
  background: oklch(var(--p)/0.2);
  color: oklch(var(--p));
  font-weight: 600;
}

/* ── Admin View ─────────────────────────────────────────────────────── */
.admin-view { animation: view-enter 0.2s ease; }

/* ── Queue Card large number ─────────────────────────────────────────── */
.queue-num-display {
  font-size: 3.5rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  letter-spacing: -2px;
  color: oklch(var(--p));
  display: inline-block;
  transform-origin: center bottom;
  line-height: 1;
}
```

---

### 3.3 Admin View Logic — `admin.js` Major Refactor

#### 3.3.1 View Router Admin

```javascript
// Tambahkan di admin.js
const ADMIN_PAGE_TITLES = {
  dashboard:  'Dashboard Live',
  kedatangan: 'Manajemen Kedatangan',
  pengumuman: 'Kirim Pengumuman',
  reset:      'Reset Quota Harian',
  statistik:  'Statistik Sistem',
  petugas:    'Manajemen Petugas',
};

function showAdminView(name) {
  document.querySelectorAll('.admin-view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`admin-view-${name}`)?.classList.remove('hidden');
  document.querySelectorAll('[data-admin-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.adminView === name);
  });
  const titleEl = document.getElementById('admin-page-title');
  if (titleEl) titleEl.textContent = ADMIN_PAGE_TITLES[name] || '';

  // Side effects
  if (name === 'statistik') {
    sendCommand('GET_SYSTEM_STATS');
  } else if (name === 'petugas') {
    sendCommand('LIST_OFFICERS');
  }
}

document.querySelectorAll('[data-admin-view]').forEach(btn => {
  btn.addEventListener('click', () => showAdminView(btn.dataset.adminView));
});
```

#### 3.3.2 Admin Login Flow

```javascript
// Check system initialization on WS connect
EventBus.on('wsConnected', () => {
  sendCommand('CHECK_SYSTEM_INITIALIZED');
});

EventBus.on('systemInitStatus', (msg) => {
  if (msg.error) return;
  const initialized = msg.payload?.initialized;
  document.getElementById('admin-setup-panel')?.classList.toggle('hidden', initialized !== false);
});

// Setup Admin Pertama
document.getElementById('btn-setup-admin')?.addEventListener('click', () => {
  const id_pegawai = document.getElementById('setup-id')?.value.trim().toUpperCase();
  const nama       = document.getElementById('setup-nama')?.value.trim();
  const pin        = document.getElementById('setup-pin')?.value.trim();
  if (!id_pegawai || !nama || !pin || pin.length < 6) {
    showNotification('Data Tidak Lengkap', 'Isi semua field. PIN minimal 6 digit.', 'warning');
    return;
  }
  setLoading('btn-setup-admin', true);
  sendCommand('REGISTER_OFFICER', { id_pegawai, nama, jabatan: 'Administrator', role: 'ADMIN', pin });
});

EventBus.on('registerOfficerResult', (msg) => {
  setLoading('btn-setup-admin', false);
  setLoading('btn-add-officer', false);
  if (msg.error) {
    showNotification('Gagal', msg.error, 'error');
  } else {
    showNotification('Berhasil', msg.payload?.message || 'Petugas berhasil didaftarkan.', 'success');
    document.getElementById('admin-setup-panel')?.classList.add('hidden');
    if (AppState.currentAdmin) {
      sendCommand('LIST_OFFICERS');
    }
  }
});

// Admin Login
document.getElementById('btn-admin-login')?.addEventListener('click', () => {
  const id_pegawai = document.getElementById('admin-id')?.value.trim().toUpperCase();
  const pin        = document.getElementById('admin-pin')?.value.trim();
  if (!id_pegawai || !pin) {
    showNotification('Data Kosong', 'Isi ID Pegawai dan PIN.', 'warning'); return;
  }
  setLoading('btn-admin-login', true);
  sendCommand('ADMIN_LOGIN', { id_pegawai, pin });
});

// Admin login enter key
document.getElementById('admin-pin')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-admin-login')?.click();
});

EventBus.on('adminLoginResult', (msg) => {
  setLoading('btn-admin-login', false);
  if (msg.error) { showNotification('Login Gagal', msg.error, 'error'); return; }

  const admin = msg.payload;
  AppState.currentAdmin = admin;

  // Sembunyikan login, tampilkan dashboard
  document.getElementById('admin-login-wrapper')?.classList.add('hidden');
  const dash = document.getElementById('admin-dashboard');
  if (dash) {
    dash.classList.remove('hidden');
    dash.classList.add('flex');
  }

  // Isi info sidebar
  document.getElementById('admin-sidebar-name').textContent = admin.nama || '—';
  document.getElementById('admin-sidebar-role').textContent = admin.role || '—';
  document.getElementById('admin-sidebar-id').textContent   = admin.id_pegawai || '';

  // Tampilkan menu admin-only
  if (admin.role === 'ADMIN') {
    document.getElementById('admin-only-menu')?.classList.remove('hidden');
  }

  showNotification('Login Berhasil', `Selamat datang, ${admin.nama}!`, 'success');
  sendCommand('LIST_SERVICES');
  showAdminView('dashboard');
});

// Logout admin
document.getElementById('btn-admin-logout')?.addEventListener('click', () => {
  AppState.currentAdmin = null;
  const dash = document.getElementById('admin-dashboard');
  if (dash) { dash.classList.add('hidden'); dash.classList.remove('flex'); }
  document.getElementById('admin-login-wrapper')?.classList.remove('hidden');
});
```

---

## PHASE 3 (Lanjutan): Admin Dashboard Views

### 3.4 View Dashboard — Queue Cards per Layanan

```javascript
// ── RENDER QUEUE CARDS ────────────────────────────────────────────────
function renderAdminQueueCards(services) {
  const grid = document.getElementById('admin-queue-cards');
  if (!grid) return;

  if (!services.length) {
    grid.innerHTML = '<p class="text-base-content/40 text-sm">Belum ada layanan.</p>';
    return;
  }

  grid.innerHTML = services.map((svc, idx) => {
    const snap    = AppState.queueSnapshots?.[svc.service_id] || {};
    const isOpen  = snap.is_open ?? (svc.status === 'OPEN' || svc.is_open);
    const current = snap.current ?? 0;
    const waiting = snap.waiting ?? 0;
    const stateClass = isOpen ? 'is-open' : 'is-closed';
    const stateLabel = isOpen ? '● BUKA' : '■ TUTUP';
    const stateBadge = isOpen ? 'badge-success' : 'badge-error';

    return `
      <div class="service-queue-card ${stateClass}" data-service-id="${svc.service_id}" id="qcard-${svc.service_id}">
        <div class="flex items-start justify-between mb-3">
          <div>
            <p class="font-black text-lg text-primary">${svc.short_code}</p>
            <p class="text-sm font-semibold leading-tight">${svc.name}</p>
          </div>
          <span class="badge ${stateBadge} badge-sm">${stateLabel}</span>
        </div>
        <div class="text-center my-3">
          <p class="text-xs text-base-content/40 uppercase tracking-wider mb-1">Dilayani</p>
          <div class="queue-num-display" id="qnum-${svc.service_id}">${current || '—'}</div>
        </div>
        <div class="flex justify-between text-xs text-base-content/60 mb-4">
          <span>Menunggu: <strong class="text-warning" id="qwait-${svc.service_id}">${waiting}</strong></span>
          <span>Quota: <strong id="qquota-${svc.service_id}">${svc.quota_remaining ?? '—'}</strong></span>
        </div>
        <div class="flex flex-col gap-2">
          <button
            class="btn btn-primary btn-sm w-full"
            onclick="adminCallNext('${svc.service_id}')"
            ${!isOpen ? 'disabled' : ''}
          >▶ Panggil Berikutnya</button>
          <div class="flex gap-1">
            <button class="btn btn-warning btn-sm flex-1"
                    onclick="adminPauseService('${svc.service_id}')"
                    ${!isOpen ? 'disabled' : ''}>⏸ Jeda</button>
            <button class="btn btn-success btn-sm flex-1"
                    onclick="adminResumeService('${svc.service_id}')"
                    ${isOpen ? 'disabled' : ''}>▶ Buka</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Queue card action handlers (global functions)
window.adminCallNext = function(serviceId) {
  sendCommand('CALL_NEXT', { service_id: serviceId });
};
window.adminPauseService = function(serviceId) {
  sendCommand('PAUSE_SERVICE', { service_id: serviceId });
};
window.adminResumeService = function(serviceId) {
  sendCommand('RESUME_SERVICE', { service_id: serviceId });
};

// Stats Update
EventBus.on('statsUpdate', (stats) => {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };
  set('adm-stat-bookings',  stats.total_bookings_today);
  set('adm-stat-served',    stats.total_served_today);
  set('adm-stat-cancelled', stats.total_cancelled_today);
  set('adm-stat-subs',      stats.active_subscribers);
  // Statistik view
  set('stat-total-bookings',  stats.total_bookings_today);
  set('stat-total-served',    stats.total_served_today);
  set('stat-total-cancelled', stats.total_cancelled_today);
  set('stat-subs',            stats.active_subscribers);

  // Update queue snapshots
  if (stats.per_service) {
    stats.per_service.forEach(s => {
      AppState.queueSnapshots[s.service_id] = {
        current: s.current_number,
        waiting: s.waiting_count,
        is_open: s.is_open,
        quota:   s.quota_remaining,
      };
    });
    updateQueueCardNumbers();
    updateStatTable(stats.per_service);
  }
});

function updateQueueCardNumbers() {
  Object.entries(AppState.queueSnapshots).forEach(([sid, snap]) => {
    const numEl   = document.getElementById(`qnum-${sid}`);
    const waitEl  = document.getElementById(`qwait-${sid}`);
    const quotaEl = document.getElementById(`qquota-${sid}`);
    if (numEl && snap.current !== undefined) {
      const newVal = snap.current || '—';
      if (numEl.textContent !== String(newVal)) {
        // Flip animasi
        anime({
          targets: numEl, rotateX: [0,-90], opacity: [1,0], duration: 180, easing: 'easeInQuart',
          complete: () => {
            numEl.textContent = newVal;
            anime({ targets: numEl, rotateX: [90,0], opacity: [0,1], duration: 180, easing: 'easeOutQuart' });
          },
        });
      }
    }
    if (waitEl  && snap.waiting !== undefined) waitEl.textContent  = snap.waiting;
    if (quotaEl && snap.quota   !== undefined) quotaEl.textContent = snap.quota;
  });
}

// Listen QUEUE_UPDATE untuk update card secara real-time
EventBus.on('queueUpdate', (msg) => {
  const sid = msg.service_id;
  const p   = msg.payload;
  if (!AppState.queueSnapshots[sid]) AppState.queueSnapshots[sid] = {};
  if (p.current_number !== undefined) AppState.queueSnapshots[sid].current = p.current_number;
  if (p.total_waiting  !== undefined) AppState.queueSnapshots[sid].waiting = p.total_waiting;
  updateQueueCardNumbers();
});

// Services loaded → render queue cards
EventBus.on('servicesLoaded', (svcs) => {
  renderAdminQueueCards(svcs);
  populateServiceDropdowns(svcs);
});
EventBus.on('servicesUpdate', (svcs) => {
  renderAdminQueueCards(svcs);
  populateServiceDropdowns(svcs);
});
```

---

### 3.5 View Kedatangan — Check-In & Walk-In

```javascript
// ── KEDATANGAN TABS ───────────────────────────────────────────────────
document.querySelectorAll('[data-kedatangan-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-kedatangan-tab]').forEach(b => b.classList.remove('tab-active'));
    document.querySelectorAll('.kedatangan-tab').forEach(c => c.classList.add('hidden'));
    btn.classList.add('tab-active');
    document.getElementById(`kedatangan-tab-${btn.dataset.kedataanganTab}`)?.classList.remove('hidden');
  });
});

// ── CHECK-IN ──────────────────────────────────────────────────────────
document.getElementById('btn-checkin')?.addEventListener('click', () => {
  const code = document.getElementById('adm-booking-code')?.value.trim().toUpperCase();
  if (!code || code.length < 4) {
    showNotification('Kode Kosong', 'Masukkan kode booking.', 'warning'); return;
  }
  setLoading('btn-checkin', true);
  document.getElementById('checkin-result')?.classList.add('hidden');
  sendCommand('CHECKIN_CITIZEN', { booking_code: code });
});

// Auto-uppercase input
document.getElementById('adm-booking-code')?.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

EventBus.on('checkinResult', (msg) => {
  setLoading('btn-checkin', false);
  const resultPanel = document.getElementById('checkin-result');
  if (msg.error) {
    showNotification('Check-In Gagal', msg.error, 'error');
    resultPanel?.classList.add('hidden');
    return;
  }
  const r = msg.payload;
  document.getElementById('checkin-result-name').textContent =
    `${r.citizen_name} — ${r.service_name}`;
  document.getElementById('checkin-result-number').textContent = r.queue_number;
  document.getElementById('checkin-result-detail').textContent =
    `${r.people_ahead} orang di depan · Estimasi: ${r.estimated_wait}`;
  resultPanel?.classList.remove('hidden');
  document.getElementById('adm-booking-code').value = '';
  showNotification('Check-In Berhasil', `Nomor antrian: ${r.queue_number}`, 'success');
});

// ── WALK-IN ───────────────────────────────────────────────────────────
document.getElementById('btn-walkin')?.addEventListener('click', () => {
  const serviceId   = document.getElementById('adm-walkin-service')?.value;
  const citizenName = document.getElementById('adm-walkin-name')?.value.trim();
  if (!serviceId) { showNotification('Pilih Layanan', '', 'warning'); return; }
  if (!citizenName) { showNotification('Nama Kosong', 'Masukkan nama warga.', 'warning'); return; }
  setLoading('btn-walkin', true);
  document.getElementById('walkin-result')?.classList.add('hidden');
  sendCommand('WALK_IN_CITIZEN', { service_id: serviceId, citizen_name: citizenName });
});

EventBus.on('walkInResult', (msg) => {
  setLoading('btn-walkin', false);
  const resultPanel = document.getElementById('walkin-result');
  if (msg.error) {
    showNotification('Walk-In Gagal', msg.error, 'error');
    resultPanel?.classList.add('hidden');
    return;
  }
  const r = msg.payload;
  document.getElementById('walkin-result-code').textContent   = r.booking_code;
  document.getElementById('walkin-result-number').textContent = r.queue_number;
  resultPanel?.classList.remove('hidden');
  document.getElementById('adm-walkin-name').value = '';
  showNotification('Walk-In Berhasil', `Nomor: ${r.queue_number}, Kode: ${r.booking_code}`, 'success');
});
```

---

### 3.6 View Pengumuman Admin

```javascript
// ── KIRIM PENGUMUMAN ──────────────────────────────────────────────────
document.getElementById('btn-announce')?.addEventListener('click', () => {
  const serviceId = document.getElementById('adm-announce-service')?.value || null;
  const message   = document.getElementById('adm-announce-msg')?.value.trim();
  if (!message) { showNotification('Pesan Kosong', 'Isi teks pengumuman.', 'warning'); return; }
  setLoading('btn-announce', true);
  sendCommand('ANNOUNCE', { service_id: serviceId, message });
});

EventBus.on('adminEvent', (event) => {
  setLoading('btn-announce', false);
  if (event.event_type === 'ACK') {
    const data = typeof event.data?.payload === 'string'
      ? JSON.parse(event.data.payload || '{}')
      : (event.data || {});
    if (data.message) {
      showNotification('Pengumuman Terkirim',
        `${data.recipients_count || 0} warga menerima notifikasi live.`, 'success');
      document.getElementById('adm-announce-msg').value = '';
      // Tambah ke history
      addAnnouncementToHistory(data.message);
    }
  }
  // Log ke activity log
  const labels = {
    CALLED:    `📣 Nomor ${event.data?.called_number || '—'} dipanggil`,
    PAUSED:    `⏸ Layanan dijeda`,
    RESUMED:   `▶ Layanan dibuka kembali`,
    ANNOUNCED: `📢 Pengumuman terkirim`,
    STATS:     `📊 Statistik diperbarui`,
  };
  EventBus.emit('activityLog', {
    type:      'admin',
    message:   labels[event.event_type] || `Admin event: ${event.event_type}`,
    timestamp: event.timestamp,
  });
});

function addAnnouncementToHistory(message) {
  const container = document.getElementById('admin-announcement-history');
  if (!container) return;
  container.querySelector('.italic')?.remove();
  const time  = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const entry = document.createElement('div');
  entry.className = 'ann-entry text-sm';
  entry.innerHTML = `
    <span class="text-xs text-base-content/40">${time}</span>
    <p class="mt-0.5">${message}</p>
  `;
  container.insertBefore(entry, container.firstChild);
}
```

---

## PHASE 4: Admin Lanjutan (Hari 7)

### 4.1 View Reset Quota

```javascript
// ── RESET QUOTA ───────────────────────────────────────────────────────
document.getElementById('btn-reset-quota')?.addEventListener('click', () => {
  const serviceId = document.getElementById('adm-reset-service')?.value;
  const label     = serviceId
    ? `layanan ${serviceId}`
    : 'SEMUA layanan';

  // Custom confirm dialog
  const modal = document.createElement('dialog');
  modal.className = 'modal modal-open';
  modal.innerHTML = `
    <div class="modal-box max-w-sm">
      <h3 class="font-bold text-error">⚠️ Konfirmasi Reset</h3>
      <p class="text-sm mt-2">Anda akan mereset quota harian untuk <strong>${label}</strong>.</p>
      <p class="text-sm text-error mt-1">Tindakan ini <strong>tidak bisa dibatalkan</strong>.</p>
      <div class="modal-action">
        <button class="btn btn-ghost btn-sm" id="reset-cancel-btn">Batalkan</button>
        <button class="btn btn-error btn-sm" id="reset-confirm-btn">Ya, Reset Sekarang</button>
      </div>
    </div>
    <div class="modal-backdrop"><button></button></div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#reset-cancel-btn').onclick  = () => { modal.remove(); };
  modal.querySelector('#reset-confirm-btn').onclick = () => {
    modal.remove();
    setLoading('btn-reset-quota', true);
    sendCommand('RESET_DAILY_QUOTA', { service_id: serviceId || null });
  };
});

EventBus.on('resetQuotaResult', (msg) => {
  setLoading('btn-reset-quota', false);
  if (msg.error) {
    showNotification('Reset Gagal', msg.error, 'error');
  } else {
    showNotification('Reset Berhasil',
      `${msg.payload?.services_reset || '?'} layanan berhasil direset.`, 'success');
    sendCommand('LIST_SERVICES');
  }
});
```

---

### 4.2 View Statistik — Tabel + Chart

```javascript
// ── UPDATE STAT TABLE ─────────────────────────────────────────────────
function updateStatTable(perService) {
  const tbody = document.getElementById('stat-table-body');
  if (!tbody || !perService) return;
  tbody.innerHTML = perService.map(s => `
    <tr>
      <td><span class="font-semibold">${s.service_name}</span></td>
      <td>${s.quota_total}</td>
      <td>${s.quota_used}</td>
      <td><span class="font-semibold text-warning">${s.waiting_count}</span></td>
      <td>${s.current_number || '—'}</td>
      <td>
        <span class="badge badge-sm ${s.is_open ? 'badge-success' : 'badge-error'}">
          ${s.is_open ? 'Buka' : 'Tutup'}
        </span>
      </td>
    </tr>
  `).join('');
}

// Statistik view dipanggil saat showAdminView('statistik') → GET_SYSTEM_STATS
EventBus.on('statsUpdate', (stats) => {
  if (stats.per_service) updateStatTable(stats.per_service);
});
```

---

### 4.3 View Manajemen Petugas

```javascript
// ── LIST OFFICERS ─────────────────────────────────────────────────────
EventBus.on('officersList', (msg) => {
  const tbody = document.getElementById('officers-table-body');
  if (!tbody) return;
  if (msg.error || !msg.payload?.officers?.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-base-content/40 py-6">
      ${msg.error || 'Belum ada petugas.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = msg.payload.officers.map(o => `
    <tr>
      <td class="font-mono text-xs">${o.id_pegawai}</td>
      <td>${o.nama}</td>
      <td class="text-xs text-base-content/60">${o.jabatan}</td>
      <td>
        <span class="badge badge-sm ${o.role === 'ADMIN' ? 'badge-primary' : 'badge-info'}">
          ${o.role}
        </span>
      </td>
      <td>
        ${o.id_pegawai !== AppState.currentAdmin?.id_pegawai ? `
          <button
            class="btn btn-ghost btn-xs text-error"
            onclick="deleteOfficer('${o.id_pegawai}')"
            title="Hapus petugas"
          >🗑</button>
        ` : '<span class="text-xs text-base-content/30">(Anda)</span>'}
      </td>
    </tr>
  `).join('');
});

window.deleteOfficer = function(targetId) {
  const reqPin = document.getElementById('officer-req-pin')?.value.trim();
  if (!reqPin) {
    showNotification('PIN Diperlukan', 'Masukkan PIN Anda di form untuk konfirmasi.', 'warning');
    return;
  }
  if (!confirm(`Hapus petugas ${targetId}? Tindakan ini permanen.`)) return;
  sendCommand('DELETE_OFFICER', {
    requester_id:  AppState.currentAdmin?.id_pegawai,
    requester_pin: reqPin,
    id_pegawai:    targetId,
  });
};

document.getElementById('btn-refresh-officers')?.addEventListener('click', () => {
  sendCommand('LIST_OFFICERS');
});

document.getElementById('btn-add-officer')?.addEventListener('click', () => {
  const reqPin     = document.getElementById('officer-req-pin')?.value.trim();
  const id_pegawai = document.getElementById('new-officer-id')?.value.trim().toUpperCase();
  const nama       = document.getElementById('new-officer-nama')?.value.trim();
  const jabatan    = document.getElementById('new-officer-jabatan')?.value.trim();
  const role       = document.getElementById('new-officer-role')?.value;
  const pin        = document.getElementById('new-officer-pin')?.value.trim();
  if (!reqPin || !id_pegawai || !nama || !pin || pin.length < 6) {
    showNotification('Data Tidak Lengkap', 'Isi semua field. PIN minimal 6 digit.', 'warning');
    return;
  }
  setLoading('btn-add-officer', true);
  sendCommand('REGISTER_OFFICER', {
    requester_id:  AppState.currentAdmin?.id_pegawai,
    requester_pin: reqPin,
    id_pegawai, nama, jabatan: jabatan || 'Petugas Loket', role, pin,
  });
});

EventBus.on('deleteOfficerResult', (msg) => {
  if (msg.error) { showNotification('Gagal', msg.error, 'error'); }
  else { showNotification('Petugas Dihapus', '', 'success'); sendCommand('LIST_OFFICERS'); }
});
```

---

### 4.4 Populate Service Dropdowns (Admin)

```javascript
// Semua dropdown layanan di admin
function populateServiceDropdowns(services) {
  const IDS = [
    'adm-select-service-call',
    'adm-announce-service',
    'adm-walkin-service',
    'adm-reset-service',
  ];
  IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const firstOpt = el.options[0];
    el.innerHTML = '';
    if (firstOpt) el.appendChild(firstOpt);
    services.forEach(svc => {
      const opt = document.createElement('option');
      opt.value       = svc.service_id;
      opt.textContent = `${svc.short_code} — ${svc.name}`;
      el.appendChild(opt);
    });
  });
}
```

---

## PHASE 5: Polish (Hari 8)

### 5.1 Animasi Transisi View (anime.js)

```javascript
// Modifikasi showView() dan showAdminView() untuk gunakan anime.js
function showView(name) {
  const current = document.querySelector('.warga-view:not(.hidden)');
  const target  = document.getElementById(`view-${name}`);
  if (!target || target === current) return;

  // Fade keluar view saat ini
  if (current) {
    anime({ targets: current, opacity: [1,0], duration: 150, easing: 'easeInQuart',
      complete: () => { current.classList.add('hidden'); showViewInner(name, target); },
    });
  } else {
    showViewInner(name, target);
  }
}

function showViewInner(name, target) {
  target.classList.remove('hidden');
  // Fade masuk view baru
  anime({ targets: target, opacity: [0,1], translateY: [8,0], duration: 250, easing: 'easeOutQuart' });
  // Update sidebar, title, side effects...
}
```

### 5.2 Mobile Sidebar Drawer

```javascript
// Mobile sidebar toggle
const overlay    = document.getElementById('mobile-sidebar-overlay');
const mobileSide = document.getElementById('mobile-sidebar');

function openMobileSidebar() {
  overlay?.classList.remove('hidden');
  anime({ targets: mobileSide, translateX: ['-100%', '0%'], duration: 280, easing: 'easeOutQuart' });
}

function closeMobileSidebar() {
  anime({ targets: mobileSide, translateX: ['0%', '-100%'], duration: 200, easing: 'easeInQuart',
    complete: () => overlay?.classList.add('hidden'),
  });
}

document.getElementById('btn-sidebar-toggle')?.addEventListener('click', openMobileSidebar);
overlay?.addEventListener('click', (e) => {
  if (e.target === overlay) closeMobileSidebar();
});

// Clone sidebar items ke mobile sidebar
function cloneSidebarToMobile() {
  const desktopContent = document.getElementById('sidebar');
  const mobileTarget   = document.getElementById('mobile-sidebar');
  if (!desktopContent || !mobileTarget) return;
  mobileTarget.innerHTML = desktopContent.innerHTML;
  // Re-attach event listeners
  mobileTarget.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      showView(btn.dataset.view);
      closeMobileSidebar();
    });
  });
}
document.addEventListener('DOMContentLoaded', cloneSidebarToMobile);
```

### 5.3 Empty States & Error States

```javascript
// Utility untuk render empty state
function renderEmptyState(containerId, { emoji, title, subtitle, actionLabel, actionFn }) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="text-center py-12">
      <p class="text-5xl mb-3">${emoji}</p>
      <p class="font-semibold text-base-content/70">${title}</p>
      ${subtitle ? `<p class="text-sm text-base-content/40 mt-1">${subtitle}</p>` : ''}
      ${actionLabel ? `
        <button class="btn btn-primary btn-sm mt-4" onclick="${actionFn}">
          ${actionLabel}
        </button>
      ` : ''}
    </div>
  `;
}

// Error state helper
function renderErrorState(containerId, errorMsg) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="alert alert-error text-sm">
      <span>❌</span>
      <span>${errorMsg || 'Terjadi kesalahan. Coba lagi.'}</span>
    </div>
  `;
}
```

### 5.4 WebSocket Reconnect Toast

```javascript
// Tambahkan di ws-client.js — event wsDisconnected
EventBus.on('wsDisconnected', () => {
  if (typeof showNotification === 'function') {
    showNotification('Koneksi Terputus', 'Mencoba menghubungkan kembali...', 'warning', 0);
  }
});

// Event wsConnected — jika bukan koneksi pertama, tampilkan "Terhubung kembali"
let _wsFirstConnect = true;
EventBus.on('wsConnected', () => {
  if (!_wsFirstConnect) {
    if (typeof showNotification === 'function') {
      showNotification('Terhubung Kembali', 'Koneksi berhasil dipulihkan.', 'success');
    }
    // Re-fetch data yang mungkin stale
    if (AppState.currentUser) {
      sendCommand('LIST_SERVICES');
      sendCommand('GET_MY_BOOKING', { citizen_id: AppState.currentUser.citizen_id });
    }
    if (AppState.currentAdmin) {
      sendCommand('LIST_SERVICES');
    }
  }
  _wsFirstConnect = false;
});
```

### 5.5 YOUR_TURN Banner — Polish Lengkap

```javascript
// notification.js — YOUR_TURN handler sudah ada, pastikan:
// 1. Suara dibunyikan (playTone dipanggil)
// 2. Banner muncul dengan spring animation
// 3. Auto-dismiss setelah 15 detik

// Di warga.js — listen yourTurn
EventBus.on('yourTurn', (msg) => {
  const serviceId    = msg.service_id;
  const serviceLabel = AppState.services?.find(s => s.service_id === serviceId)?.name || serviceId;
  showYourTurnAlert(serviceLabel);   // dari notification.js
  // Scroll ke atas agar banner terlihat
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
```

---

## Ringkasan Konvensi Implementasi

### Urutan Loading Script

```
1. ws-client.js      — AppState, EventBus, WebSocket, sendCommand, setLoading
2. notification.js   — showNotification, showYourTurnAlert, playTone
3. queue-animation.js — animateNumberFlip
4. activity-log.js   — add log entry
5. chart.js          — ApexCharts init + update
6. status-indicator.js — renderServices, renderMiniServices, renderSidebarServiceStatus
7. warga.js / admin.js — business logic per halaman
```

### Module Pattern

```javascript
// Setiap file:
(function() {
  'use strict';
  // ... kode modul
})();
```

### Event Contract (ws-client.js → EventBus)

| Server Message | EventBus Emit | Listener di |
|---|---|---|
| `CONNECTED` | `wsConnected` | semua JS |
| `QUEUE_UPDATE` | `queueUpdate`, `queueNumberCalled`, `yourTurn` | warga.js, admin.js, queue-animation.js |
| `STATS_PUSH` | `statsUpdate` | chart.js, admin.js |
| `SERVICES_STATUS_UPDATE` | `servicesUpdate` | status-indicator.js, warga.js, admin.js |
| `NEW_ANNOUNCEMENT` | `newAnnouncement` | warga.js, notification.js |
| `LOGIN_RESULT` | `loginResult` | warga.js |
| `REGISTER_RESULT` | `registerResult` | warga.js |
| `SERVICES_LIST` | `servicesLoaded` | status-indicator.js, warga.js, admin.js |
| `SLOTS_LIST` | `slotsLoaded` | warga.js |
| `BOOKING_RESULT` | `bookingResult` | warga.js |
| `MY_BOOKING` | `myBookingLoaded` | warga.js |
| `CANCEL_RESULT` | `cancelResult` | warga.js |
| `RESCHEDULE_RESULT` | `rescheduleResult` | warga.js |
| `ADMIN_LOGIN_RESULT` | `adminLoginResult` | admin.js |
| `SYSTEM_INIT_STATUS` | `systemInitStatus` | admin.js |
| `ADMIN_EVENT` | `adminEvent`, `activityLog` | admin.js, activity-log.js |
| `CHECKIN_RESULT` | `checkinResult` | admin.js |
| `WALK_IN_RESULT` | `walkInResult` | admin.js |
| `RESET_QUOTA_RESULT` | `resetQuotaResult` | admin.js |
| `OFFICERS_LIST` | `officersList` | admin.js |
| `REGISTER_OFFICER_RESULT` | `registerOfficerResult` | admin.js |
| `DELETE_OFFICER_RESULT` | `deleteOfficerResult` | admin.js |
| `ANNOUNCEMENTS` | `announcements` | warga.js |
| `SERVICE_DETAIL` | `serviceDetail` | warga.js |

### Checklist Final Sebelum Deploy

```
index.html
 [ ] Auth tabs berfungsi (login/register)
 [ ] NIK realtime validasi (only digits, counter, error)
 [ ] Enter key submit form login
 [ ] Service status mini cards live update
 [ ] Announcement banner muncul saat NEW_ANNOUNCEMENT
 [ ] Login sukses → redirect ke warga.html
 [ ] Register sukses → switch ke tab login
 [ ] WS badge update (connected/disconnected/connecting)

warga.html
 [ ] Session guard (redirect jika tidak ada session)
 [ ] User info tampil di sidebar
 [ ] Sidebar navigation berfungsi semua 4 view
 [ ] Bottom nav (mobile) berfungsi
 [ ] View Booking: step 1/2/3 lengkap
 [ ] View Booking: service cards live quota
 [ ] View Booking: slot grid dengan FULL disabled
 [ ] View Booking: konfirmasi + submit + success result
 [ ] View Riwayat: list booking load & refresh
 [ ] View Riwayat: cancel booking + konfirmasi
 [ ] View Riwayat: reschedule modal + slot picker
 [ ] View Monitor: service selector
 [ ] View Monitor: nomor flip animasi saat QUEUE_UPDATE
 [ ] View Monitor: log event max 20 baris
 [ ] View Monitor: nomor saya + di depan (dari allBookings)
 [ ] View Pengumuman: load awal + badge counter
 [ ] View Pengumuman: prepend saat NEW_ANNOUNCEMENT
 [ ] YOUR_TURN banner + suara
 [ ] WS reconnect → re-fetch data

admin.html
 [ ] Cek sistem initialized → tampilkan setup/login
 [ ] Setup admin pertama berfungsi
 [ ] Login admin → dashboard
 [ ] Role ADMIN → tampilkan menu Manajemen Petugas
 [ ] Sidebar nav semua 6 view (ADMIN) / 5 view (PETUGAS)
 [ ] View Dashboard: stat cards live (STATS_PUSH)
 [ ] View Dashboard: queue cards per layanan
 [ ] View Dashboard: flip animasi nomor antrian
 [ ] View Dashboard: tombol Panggil/Jeda/Buka berfungsi
 [ ] View Dashboard: ApexCharts bar chart live
 [ ] View Dashboard: activity log live
 [ ] View Kedatangan: check-in by booking_code
 [ ] View Kedatangan: walk-in by nama + service
 [ ] View Pengumuman: kirim broadcast
 [ ] View Pengumuman: tampil di riwayat
 [ ] View Reset Quota: modal konfirmasi dua langkah
 [ ] View Statistik: tabel per layanan
 [ ] View Statistik: ApexCharts detail
 [ ] View Petugas: tabel officers
 [ ] View Petugas: tambah petugas baru
 [ ] View Petugas: hapus petugas + PIN konfirmasi
 [ ] WS badge sidebar update
```
