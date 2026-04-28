# Evaluasi & Audit Frontend SiAntre — Laporan Mendalam

> **Scope:** Seluruh kode frontend (`ws-client.js`, `admin.js`, `warga.js`, `chart.js`, `notification.js`, `activity-log.js`, `status-indicator.js`, `queue-animation.js`, `index.html`, `warga.html`, `admin.html`, `css/style.css`)
>
> **Metode:** Static code analysis, cross-file dependency tracing, security audit, logic flow verification terhadap spesifikasi di `FRONTEND_IMPLEMENTATION_PLAN.md`

---

## Ringkasan Eksekutif

Dari audit menyeluruh, ditemukan **4 bug kritis** yang menyebabkan fitur utama tidak berfungsi sama sekali, **5 celah keamanan XSS**, **5 bug tingkat tinggi**, dan **belasan masalah menengah/rendah**. Fitur YOUR_TURN (notifikasi giliran warga) sepenuhnya broken. Role ADMIN terkunci dari hampir semua fitur operasional. ApexCharts tidak dapat merender warna karena penggunaan CSS functions yang tidak didukung.

---

## BAGIAN 1: Bug Kritis (Severity: CRITICAL)

Bug pada kategori ini menyebabkan fitur utama sistem antrian tidak dapat digunakan.

---

### KRIT-1 — `AppState.myBooking` Tidak Pernah Diisi → YOUR_TURN Detection Sepenuhnya Mati

**File:** `ws-client.js` (baris ~44) + `warga.js`

**Masalah:** Di dalam `routeMessage()` di `ws-client.js`, logika deteksi giliran warga bergantung pada `AppState.myBooking`:

```javascript
// ws-client.js
if (AppState.myBooking
    && msg.payload.current_number === AppState.myBooking.queue_number
    && msg.service_id === AppState.myBooking.service_id) {
  EventBus.emit('yourTurn', msg);
}
```

Namun di `AppState` (deklarasi awal `ws-client.js`), property ini diinisialisasi sebagai `null`:

```javascript
const AppState = {
  myBooking: null, // ← selalu null
  allBookings: [], // ← yang sebenarnya dipakai
  ...
};
```

Dan di `warga.js`, ketika response booking diterima, hanya `AppState.allBookings` yang diupdate:

```javascript
EventBus.on('myBookingLoaded', (msg) => {
  const bookings = msg.payload?.bookings || [];
  AppState.allBookings = bookings; // ← hanya ini yang diset
  // AppState.myBooking TIDAK PERNAH DIISI
  ...
});
```

Kondisi `AppState.myBooking && ...` akan selalu `false`. Event `yourTurn` tidak akan pernah dikirim ke warga. Banner "GILIRAN ANDA!" dan `playChime('turn')` tidak akan pernah muncul selama masa pakai aplikasi.

**Perbaikan:**
```javascript
// Di warga.js, dalam EventBus.on('myBookingLoaded', ...)
AppState.allBookings = bookings;
// Set myBooking ke booking yang sedang aktif (ARRIVED atau CALLED)
AppState.myBooking = bookings.find(b =>
  b.status === 'ARRIVED' || b.status === 'CALLED'
) || null;
```

---

### KRIT-2 — Role ADMIN Terkunci Hanya di View "Manajemen Petugas"

**File:** `admin.js` (baris ~73–81) + `admin.html`

**Masalah:** Setelah login berhasil, logika toggle menu berbasis role adalah:

```javascript
const isAdmin = AppState.currentAdmin.role === 'ADMIN';
document.getElementById('admin-only-menu').classList.toggle('hidden', !isAdmin);
document.getElementById('petugas-menu').classList.toggle('hidden', isAdmin); // ← BUG

if (isAdmin) {
  showAdminView('petugas');
} else {
  sendCommand('LIST_SERVICES');
  showAdminView('dashboard');
}
```

Ketika role adalah `ADMIN`:
- `petugas-menu` (berisi tombol Dashboard, Kedatangan, Pengumuman, Reset Quota, Statistik) → **DISEMBUNYIKAN**
- `admin-only-menu` (berisi hanya Manajemen Petugas) → **DITAMPILKAN**

Artinya, seorang ADMIN hanya bisa mengakses view "Manajemen Petugas" dan tidak bisa mengakses Dashboard Live, Kedatangan, Pengumuman, Reset Quota, maupun Statistik. Namun menurut `FRONTEND_IMPLEMENTATION_PLAN.md` checklist:

> `[ ] Sidebar nav semua 6 view (ADMIN) / 5 view (PETUGAS)`

ADMIN seharusnya melihat **semua 6 view** (5 view petugas + 1 view tambahan manajemen petugas), bukan hanya 1 view.

**Perbaikan:** Hapus toggle hiding pada `petugas-menu` untuk ADMIN. Hanya tambahkan `admin-only-menu`:

```javascript
const isAdmin = AppState.currentAdmin.role === 'ADMIN';
// petugas-menu selalu tampil untuk semua yang sudah login
document.getElementById('admin-only-menu').classList.toggle('hidden', !isAdmin);
// Redirect ke view yang sesuai
sendCommand('LIST_SERVICES');
showAdminView('dashboard');
```

---

### KRIT-3 — `LIST_SERVICES` Tidak Dipanggil Setelah Login sebagai ADMIN → Semua Dropdown Kosong

**File:** `admin.js` (baris ~77–80)

**Masalah:** Perhatikan blok kondisional setelah login:

```javascript
if (isAdmin) {
  showAdminView('petugas'); // ← tidak ada sendCommand('LIST_SERVICES')
} else {
  sendCommand('LIST_SERVICES'); // ← hanya untuk PETUGAS
  showAdminView('dashboard');
}
```

Ketika seseorang login sebagai ADMIN, `LIST_SERVICES` tidak pernah dipanggil. Akibatnya, `AppState.services` tetap `[]` dan semua dropdown yang bergantung pada data layanan (dipopulasi oleh `populateDropdowns()`) akan tetap kosong:

- `#adm-walkin-service` → kosong
- `#adm-announce-service` → kosong
- `#adm-reset-service` → kosong

Ini menjadi tambah parah karena `showAdminView('petugas')` juga tidak memicu `sendCommand('LIST_SERVICES')`. Satu-satunya cara services ter-load untuk ADMIN adalah melalui event `wsConnected` yang diset dengan kondisi `if (AppState.currentAdmin)` — tetapi itu hanya aktif saat **reconnect**, bukan login pertama.

**Perbaikan:** Tambahkan `sendCommand('LIST_SERVICES')` untuk kedua cabang:

```javascript
sendCommand('LIST_SERVICES'); // Selalu panggil ini
if (isAdmin) {
  showAdminView('petugas');
} else {
  showAdminView('dashboard');
}
```

---

### KRIT-4 — `adminEvent` ACK Handler Menangkap Semua Event, Bukan Hanya Pengumuman

**File:** `admin.js` (baris ~136–141)

**Masalah:**

```javascript
EventBus.on('adminEvent', (ev) => {
  if (ev.event_type === 'ACK') {
    setLoading('btn-announce', false); // ← dipanggil untuk SEMUA ACK
    showNotification('Terkirim', 'Pengumuman telah disebarkan.', 'success');
    document.getElementById('adm-announce-msg').value = '';
  }
});
```

Event `ADMIN_EVENT` dengan `event_type === 'ACK'` kemungkinan besar dikirim untuk berbagai operasi admin (bukan hanya ANNOUNCE). Akibatnya, setiap kali server mengirim ACK untuk operasi apapun (misalnya setelah check-in, atau operasi lain), tombol `btn-announce` akan direset loading-nya, dan notifikasi "Pengumuman telah disebarkan" akan muncul secara tidak tepat — bahkan meskipun user tidak sedang di view Pengumuman.

**Perbaikan:** Gunakan flag state untuk melacak apakah user baru saja mengirim pengumuman:

```javascript
let _pendingAnnounce = false;
document.getElementById('btn-announce')?.addEventListener('click', () => {
  _pendingAnnounce = true;
  // ...
});

EventBus.on('adminEvent', (ev) => {
  if (ev.event_type === 'ACK' && _pendingAnnounce) {
    _pendingAnnounce = false;
    setLoading('btn-announce', false);
    showNotification('Terkirim', 'Pengumuman telah disebarkan.', 'success');
    document.getElementById('adm-announce-msg').value = '';
  }
});
```

---

## BAGIAN 2: Kerentanan Keamanan — XSS (Severity: HIGH)

Semua file menggunakan `innerHTML` dengan data dari server tanpa sanitasi yang konsisten. Jika ada data yang dikontrol oleh penyerang (misalnya nama warga yang didaftarkan dengan karakter HTML), ini bisa menginjeksi skrip ke browser pengguna lain.

---

### SEC-1 — XSS di `showNotification` (notification.js)

```javascript
// notification.js
toast.innerHTML = `
  <div>
    <p class="font-bold text-sm">${title}</p>      ← tidak di-escape
    <p class="text-xs opacity-90">${message}</p>   ← tidak di-escape
  </div>
`;
```

`title` dan `message` bisa berasal dari data server (nama layanan, pesan error, nama warga). Jika server mengirimkan `<img src=x onerror=alert(1)>` sebagai nama layanan, ini akan dieksekusi.

---

### SEC-2 — XSS di `showYourTurnBanner` (notification.js)

```javascript
banner.innerHTML = `
  ...
  <p class="...">${serviceName}</p>  ← tidak di-escape
  <div class="...">${number}</div>   ← tidak di-escape
`;
```

`serviceName` berasal dari `msg.payload.service_name`, data dari server yang tidak bisa dipercaya sepenuhnya.

---

### SEC-3 — XSS di Stats Table (chart.js)

```javascript
tableBody.innerHTML = stats.per_service.map(s => `
  <tr>
    <td class="font-bold text-xs">${s.service_name}</td>  ← tidak di-escape
    <td>${s.quota_total}</td>
    ...
  </tr>
`).join('');
```

Tidak ada `esc()` helper yang diaplikasikan di sini, berbeda dengan bagian lain (`admin.js` yang sudah menggunakan `esc()`).

---

### SEC-4 — XSS di Announcement List (warga.js)

```javascript
list.innerHTML = [...anns].reverse().map(a => `
  <div class="ann-entry">
    <p class="...">${new Date(a.timestamp).toLocaleString()}</p>
    <p class="text-sm font-medium">${a.message}</p>  ← tidak di-escape
  </div>
`).join('');
```

`a.message` dari server dimasukkan langsung ke innerHTML.

---

### SEC-5 — XSS di `NEW_ANNOUNCEMENT` Handler (warga.js via ws-client.js)

```javascript
// ws-client.js
case 'NEW_ANNOUNCEMENT':
  if(typeof showNotification === 'function')
    showNotification('Pengumuman', msg.payload.message, 'info'); // ← ke SEC-1
  break;
```

Dan di `warga.js`:
```javascript
EventBus.on('newAnnouncement', (msg) => {
  const bText = document.getElementById('ann-banner-text');
  if (bText) bText.textContent = msg.message; // ← textContent = AMAN
  // ...
});
```

Bagian `ann-banner-text` menggunakan `textContent` (aman), tetapi melewati `showNotification` yang menggunakan `innerHTML` (tidak aman — lihat SEC-1).

**Perbaikan Umum untuk semua XSS:** Buat helper `esc()` global di `ws-client.js` dan gunakan secara konsisten di semua `innerHTML`:

```javascript
// ws-client.js — tambahkan sebagai global helper
window.esc = function(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#x27;');
};
```

---

## BAGIAN 3: Bug Tingkat Tinggi (Severity: HIGH)

---

### HIGH-1 — `btn-refresh-officers` Tidak Menggunakan `AppState._reqPin`

**File:** `admin.js` (baris ~211–216)

```javascript
document.getElementById('btn-refresh-officers')?.addEventListener('click', () => {
  const pin = document.getElementById('officer-req-pin')?.value || ''; // ← mengabaikan AppState._reqPin
  sendCommand('LIST_OFFICERS', { ... });
});
```

Semua handler lain sudah diperbaiki untuk menggunakan `AppState._reqPin || form.value`, tetapi tombol Refresh Officers terlewat. Setelah PIN di-clear dari form (sesuai BUG-H1 FIX yang sudah ada), tombol Refresh tidak akan bisa mengirim PIN yang valid.

**Perbaikan:**
```javascript
const pin = AppState._reqPin || document.getElementById('officer-req-pin')?.value || '';
```

---

### HIGH-2 — ApexCharts Tidak Mendukung `oklch()` CSS Functions

**File:** `chart.js` (baris ~30–31)

```javascript
colors: ['oklch(var(--p))', 'oklch(var(--s)/0.3)'],
```

ApexCharts merender warna menggunakan SVG attributes dan Canvas API, **bukan** melalui CSS cascade. Oleh karena itu, `oklch(var(--p))` tidak akan pernah di-resolve dan chart akan menggunakan warna default ApexCharts (biru generik) atau gagal merender warna sama sekali.

**Perbaikan:** Gunakan warna hex/rgb statis yang sesuai dengan tema DaisyUI, atau resolve CSS variable secara programatik:

```javascript
function getCSSColor(variable) {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(variable).trim();
  return `oklch(${raw})`;
}
// Atau lebih mudah: gunakan warna hardcoded yang sesuai tema
colors: ['#570df8', '#c084fc'], // primary dan secondary DaisyUI light theme
```

---

### HIGH-3 — EventBus Tidak Memiliki Method `off()` → Listener Accumulation

**File:** `ws-client.js`

```javascript
const EventBus = {
  listeners: {},
  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  },
  emit(event, data) { ... },
  // ← tidak ada off()
};
```

Meski saat ini listener didaftarkan sekali via IIFE dan halaman tidak di-render ulang tanpa reload penuh, tidak adanya `off()` berarti tidak ada mekanisme cleanup. Ini akan menjadi masalah jika di masa depan ada komponen yang dibuat/dihancurkan secara dinamis. Selain itu, karena `activity-log.js` mendaftarkan listener untuk `wsConnected` dan `wsDisconnected`, setiap reconnect akan mengirim log entry baru dengan benar — namun tidak ada cara untuk membersihkan listener lama jika arsitektur berubah.

**Perbaikan:**
```javascript
off(event, cb) {
  if (!this.listeners[event]) return;
  this.listeners[event] = this.listeners[event].filter(fn => fn !== cb);
},
```

---

### HIGH-4 — Pesan WebSocket Diam-diam Dibuang Saat Buffer Penuh

**File:** `ws-client.js` (baris ~54–58)

```javascript
function sendCommand(cmd, payload = {}) {
  ...
  if (AppState.ws.bufferedAmount > 16 * 1024) {
    console.warn('[WsClient] Buffer penuh, pesan ditunda:', cmd);
    return; // ← pesan dibuang, tidak ada retry, tidak ada notifikasi user
  }
  AppState.ws.send(JSON.stringify({ cmd, payload }));
}
```

Ketika buffer penuh, pesan dibuang tanpa pemberitahuan ke user dan tanpa mekanisme retry. Misalnya jika admin menekan "Panggil Berikutnya" saat jaringan lambat, command akan hilang tanpa feedback apapun ke user. Loading state (`setLoading`) akan terpasang tapi tidak pernah dilepas karena response tidak pernah datang.

**Perbaikan:** Minimal tampilkan notifikasi ke user agar mereka tahu perlu mencoba lagi:
```javascript
if (AppState.ws.bufferedAmount > 16 * 1024) {
  if(typeof showNotification === 'function')
    showNotification('Jaringan Sibuk', 'Coba lagi dalam beberapa detik.', 'warning');
  return;
}
```

---

### HIGH-5 — Reconnect WebSocket Tidak Me-restore Admin Session di Server

**File:** `ws-client.js` + `admin.js`

Ketika WebSocket terputus dan reconnect, handler `wsConnected` di `admin.js` memanggil:

```javascript
EventBus.on('wsConnected', () => {
  sendCommand('CHECK_SYSTEM_INITIALIZED');
  if (AppState.currentAdmin) {
    sendCommand('LIST_SERVICES');
  }
});
```

Namun tidak ada mekanisme untuk **re-authenticate** admin session ke server. Jika server mengelola session per WebSocket connection (yang umum dalam arsitektur WS berbasis state), maka setelah reconnect, server tidak mengenali siapa yang mengirim command tersebut, dan operasi admin (CALL_NEXT, ANNOUNCE, dll.) akan ditolak dengan error session.

Warga mengalami masalah serupa: `LIST_SERVICES` dan `GET_MY_BOOKING` dipanggil ulang saat reconnect, tetapi tanpa `citizen_id` yang di-re-register ke server (jika server memakai per-connection session).

**Perbaikan:** Setelah reconnect, kirim command re-login menggunakan data dari `AppState.currentAdmin` / `AppState.currentUser`:

```javascript
// Di ws-client.js, setelah CONNECTED message dari server
if (AppState.currentAdmin) {
  sendCommand('ADMIN_LOGIN', {
    id_pegawai: AppState.currentAdmin.id_pegawai,
    pin: AppState._reqPin, // harus masih tersimpan
  });
}
```

---

## BAGIAN 4: Bug Menengah (Severity: MEDIUM)

---

### MED-1 — Monitor View Tidak Refresh Queue Status Saat Service Select Dipopulasi Ulang

**File:** `warga.js` — fungsi `initMonitorView()`

```javascript
function initMonitorView() {
  const sel = document.getElementById('monitor-service-select');
  const currentVal = sel.value; // simpan nilai sebelumnya
  sel.innerHTML = '<option value="">-- Pilih layanan --</option>';
  AppState.services.forEach(s => { ... sel.add(opt); });
  if (currentVal) sel.value = currentVal; // restore nilai
  // ← TIDAK memanggil sendCommand('GET_QUEUE_STATUS') meski nilai ter-restore
  sel.onchange = (e) => { ... };
}
```

Jika user sudah memilih layanan di monitor, kemudian berpindah ke view lain lalu kembali, `initMonitorView()` dipanggil ulang. Nilai select ter-restore, tapi `GET_QUEUE_STATUS` tidak dipanggil, sehingga nomor antrian yang ditampilkan menjadi stale atau tetap pada nilai terakhir.

**Perbaikan:** Setelah restore value, panggil `GET_QUEUE_STATUS` secara manual:

```javascript
if (currentVal) {
  sel.value = currentVal;
  sendCommand('GET_QUEUE_STATUS', { service_id: currentVal });
}
```

---

### MED-2 — `renderMiniStatus` di `status-indicator.js` Mengakses Field yang Mungkin Undefined

**File:** `status-indicator.js`

```javascript
<p class="text-[10px] opacity-50">${svc.open_hour} - ${svc.close_hour}</p>
```

Jika response server tidak menyertakan `open_hour` dan `close_hour`, ini akan render sebagai `undefined - undefined` di UI. Tidak ada fallback atau guard.

**Perbaikan:**
```javascript
<p class="...">${svc.open_hour ?? '—'} - ${svc.close_hour ?? '—'}</p>
```

---

### MED-3 — `activity-log.js` Clear Button Gagal Sebelum Log Pertama Muncul

**File:** `activity-log.js`

```javascript
let logEl = null;
// logEl diinisialisasi lazy, hanya saat appendLog() pertama dipanggil

const clearBtn = document.getElementById('btn-clear-log');
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    if (!logEl) return; // ← jika belum ada log, clear tidak melakukan apapun
    logEl.innerHTML = '...';
  });
}
```

Jika user mengklik "Bersihkan" sebelum ada event log pertama masuk, `logEl` masih `null` dan fungsi keluar diam-diam. Secara teknis ini acceptable karena tidak ada yang perlu di-clear, namun idealnya inisialisasi `logEl` dilakukan saat DOMContentLoaded:

```javascript
document.addEventListener('DOMContentLoaded', () => {
  logEl = document.getElementById('activity-log') || document.getElementById('monitor-event-log');
});
```

---

### MED-4 — `animateNumberFlip` Didefinisikan Dua Kali dengan Implementasi Berbeda

**File:** `admin.js` (lokal, baris ~238) + `queue-animation.js` (global `window.animateNumberFlip`)

Versi di `admin.js` menggunakan `translateY` untuk animasi flip:
```javascript
// admin.js versi lokal
anime({ targets: el, translateY: [0, -10], opacity: [1, 0], ... });
```

Versi di `queue-animation.js` menggunakan `rotateX` untuk efek flip kartu:
```javascript
// queue-animation.js versi global
anime({ targets: element, rotateX: [0, -90], opacity: [1, 0], ... });
```

Keduanya terdaftar dengan nama berbeda di scope berbeda, tetapi karena `admin.html` tidak memuat `queue-animation.js`, global `window.animateNumberFlip` tidak tersedia di admin page. Versi lokal `admin.js` digunakan — ini benar secara fungsional, namun menimbulkan duplikasi dan inkonsistensi visual antara admin dan monitor view di warga.

**Perbaikan:** Pindahkan satu versi canonical ke `ws-client.js` atau buat file `utils.js` tersendiri, hapus duplikat.

---

### MED-5 — Mobile Sidebar Cloning Berpotensi Duplikasi Event Listener

**File:** `warga.js` (baris ~288–305)

```javascript
document.getElementById('btn-sidebar-toggle')?.addEventListener('click', () => {
  const overlay = document.getElementById('mobile-sidebar-overlay');
  const sidebar = document.getElementById('mobile-sidebar');
  overlay.classList.remove('hidden');
  if (!sidebar.innerHTML) { // ← hanya clone jika kosong
    sidebar.innerHTML = desktopContent.innerHTML;
    sidebar.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => showView(btn.dataset.view));
    });
  }
  ...
});
```

Guard `if (!sidebar.innerHTML)` mencegah cloning ulang, namun jika sidebar desktop diupdate (misalnya badge count berubah), mobile sidebar tidak akan ter-update karena sudah punya konten. Selain itu, jika `sidebar.innerHTML` pernah di-set menjadi string kosong secara programatik, cloning akan terjadi ulang dan listener akan terduplikasi.

---

### MED-6 — `chart.js` dan `activity-log.js` Dimuat di `index.html` Tanpa Container yang Sesuai

**File:** `index.html` (baris ~155–162)

```html
<script src="js/activity-log.js"></script>
<script src="js/chart.js"></script>
```

`index.html` tidak memiliki elemen `#activity-log`, `#monitor-event-log`, `#admin-queue-chart`, atau `#stat-detail-chart`. Script tetap dimuat, menggunakan bandwidth dan waktu parsing, dan mendaftarkan EventBus listener yang tidak akan pernah bereaksi terhadap DOM apapun. `activity-log.js` secara khusus mencoba `document.getElementById('activity-log')` yang akan return null, namun ini ditangani dengan guard — tidak crash, tapi sia-sia.

---

## BAGIAN 5: Bug Rendah & Code Quality (Severity: LOW)

---

### LOW-1 — File `frontend/style.css` (Root) Masih Ada

**File:** `frontend/style.css`

File ini sudah berisi komentar "moved to css/style.css, please delete this file" namun masih ada di repository. Tidak ada HTML yang mereferensikannya, namun keberadaannya membingungkan.

---

### LOW-2 — `queue-animation.js` Tidak Dimuat di `admin.html`

**File:** `admin.html` (script loading order)

```html
<script src="js/ws-client.js"></script>
<script src="js/notification.js"></script>
<!-- queue-animation.js TIDAK ADA di sini -->
<script src="js/activity-log.js"></script>
<script src="js/chart.js"></script>
<script src="js/status-indicator.js"></script>
<script src="js/admin.js"></script>
```

Sedangkan `queue-animation.js` mendaftarkan listener ke `EventBus.on('queueNumberCalled', ...)` yang mencari `#monitor-current-number`. Elemen tersebut tidak ada di `admin.html`, jadi secara fungsional tidak ada dampak. Namun `queue-animation.js` juga mengekspos `window.animateNumberFlip` yang seharusnya tersedia secara global, namun tidak tersedia di admin page — `admin.js` menggunakan versi lokalnya sendiri (lihat MED-4).

---

### LOW-3 — Validasi NIK di `warga.js` Tidak Konsisten dengan `index.html`

**File:** `warga.js` (btn-login handler)

```javascript
document.getElementById('btn-login')?.addEventListener('click', () => {
  const nik = document.getElementById('login-nik').value;
  if (nik.length !== 16) return showNotification('NIK Tidak Valid', 'NIK harus 16 digit.', 'warning');
  // ← tidak ada validasi bahwa nik hanya digit angka
  sendCommand('LOGIN_CITIZEN', { nik });
});
```

Berbeda dengan handler register yang sudah memvalidasi:
```javascript
if (data.nik.length !== 16 || !/^\d+$/.test(data.nik)) { ... }
```

Login tidak memvalidasi bahwa NIK hanya berisi digit, sehingga input seperti `"aaaaaaaaaaaaaaaa"` (16 huruf) akan lolos validasi frontend dan dikirim ke server.

---

### LOW-4 — `setLoading` Tidak Pernah Direset Jika WebSocket Terputus Saat Operasi Berlangsung

**File:** `ws-client.js` + semua handler

Jika user mengklik tombol (misalnya "Konfirmasi Check-In"), `setLoading('btn-checkin', true)` dipanggil. Jika WebSocket terputus sebelum response diterima, `setLoading('btn-checkin', false)` tidak pernah dipanggil. Tombol akan terkunci selamanya dalam state loading.

**Perbaikan:** Di handler `wsDisconnected`, reset semua button yang sedang loading:
```javascript
EventBus.on('wsDisconnected', () => {
  document.querySelectorAll('button[disabled]').forEach(btn => {
    if (btn.dataset.originalText) {
      setLoading(btn, false);
    }
  });
});
```

---

### LOW-5 — `'use strict'` Tidak Konsisten

**File:** Semua `.js` files

`FRONTEND_IMPLEMENTATION_PLAN.md` mendefinisikan konvensi:
```javascript
(function() {
  'use strict'; // ← konvensi yang direncanakan
  ...
})();
```

Namun tidak satupun file yang mengimplementasikan `'use strict'` di dalam IIFE mereka. Tanpa strict mode, kesalahan seperti variabel yang tidak dideklarasikan tidak akan menyebabkan error langsung, membuat debugging lebih sulit.

---

### LOW-6 — `initMonitorView` Membuat Handler `sel.onchange` Baru Setiap Kali Dipanggil

**File:** `warga.js`

```javascript
function initMonitorView() {
  ...
  sel.onchange = (e) => { ... }; // ← assign langsung, menimpa handler lama
}
```

Menggunakan `.onchange = ...` (bukan `addEventListener`) sebenarnya aman karena assignment menimpa handler lama, tidak menyebabkan duplikasi. Ini bukan bug namun perlu dicatat sebagai pola yang tidak konsisten dengan gaya `addEventListener` yang digunakan di tempat lain.

---

### LOW-7 — Response `QUEUE_STATUS` Tidak Update `AppState.queueData`

**File:** `ws-client.js`

```javascript
case 'QUEUE_STATUS': EventBus.emit('queueStatus', msg); break;
```

`AppState.queueData` dideklarasikan di AppState namun tidak pernah diisi oleh routeMessage. Data queue hanya hidup di closure EventBus listener tanpa disimpan ke state terpusat. Ini mempersulit debugging dan akses silang antar komponen.

---

## BAGIAN 6: Ketidaksesuaian dengan Implementation Plan

Beberapa item dari checklist `FRONTEND_IMPLEMENTATION_PLAN.md` yang belum terimplementasi atau berbeda:

| Checklist Item | Status |
|---|---|
| `Role ADMIN → tampilkan semua 6 view` | ❌ ADMIN hanya dapat 1 view (lihat KRIT-2) |
| `YOUR_TURN banner + suara` | ❌ Tidak berfungsi (lihat KRIT-1) |
| `WS reconnect → re-fetch data` | ⚠️ Partial — data di-fetch ulang tapi session tidak di-restore |
| `View Monitor: log event max 20 baris` | ⚠️ `activity-log.js` membatasi 100, bukan 20 untuk monitor |
| `Service cards live quota` | ✅ Berfungsi via `servicesUpdate` |
| `Flip animasi nomor antrian` | ⚠️ Berfungsi tapi implementasi berbeda antara admin dan warga |
| `Modal konfirmasi dua langkah untuk Reset Quota` | ⚠️ Hanya satu langkah konfirmasi (modal confirm biasa), plan menyebut "dua langkah" |
| `Announcement badge counter` | ✅ Berfungsi |
| `NIK realtime validasi (only digits, counter, error)` | ⚠️ Counter ada, digit validation tidak di login tab |

---

## BAGIAN 7: Ringkasan Prioritas Perbaikan

### Prioritas 1 — Segera (Blocking Core Features)

1. **KRIT-1** — Set `AppState.myBooking` saat `myBookingLoaded`
2. **KRIT-2** — Perbaiki toggle `petugas-menu` untuk role ADMIN
3. **KRIT-3** — Tambahkan `sendCommand('LIST_SERVICES')` untuk login ADMIN
4. **KRIT-4** — Scope ACK handler hanya untuk operasi pengumuman

### Prioritas 2 — Segera (Security)

5. **SEC-1 s/d SEC-5** — Tambahkan global `esc()` dan aplikasikan ke semua `innerHTML` yang menerima data server

### Prioritas 3 — Sprint Berikutnya (Fungsionalitas)

6. **HIGH-1** — Fix `btn-refresh-officers` pakai `AppState._reqPin`
7. **HIGH-2** — Ganti oklch CSS vars dengan warna yang compatible ApexCharts
8. **HIGH-4** — Tambahkan notifikasi user saat buffer penuh
9. **HIGH-5** — Implementasi re-auth saat reconnect

### Prioritas 4 — Backlog (Polish & Maintainability)

10. **MED-1** — Trigger `GET_QUEUE_STATUS` saat monitor select di-restore
11. **MED-2** — Fallback untuk `open_hour`/`close_hour` undefined
12. **MED-4** — Konsolidasi `animateNumberFlip` ke satu file
13. **LOW-2** — Tambahkan `queue-animation.js` ke admin.html atau hapus dependency
14. **LOW-3** — Tambahkan regex digit validation ke login NIK
15. **LOW-4** — Reset loading buttons saat disconnect
16. **LOW-5** — Tambahkan `'use strict'` ke semua IIFE
17. Hapus `frontend/style.css` (root) yang tidak terpakai

---

## Appendix: Peta Dependency Antar File

```
ws-client.js          ← FOUNDATION (AppState, EventBus, sendCommand, setLoading)
    ↓ dimuat pertama di semua HTML
notification.js       ← depends on: AppState (indirect via events)
    ↓
queue-animation.js    ← depends on: EventBus, anime.js [HANYA warga.html]
    ↓
activity-log.js       ← depends on: EventBus
    ↓
chart.js              ← depends on: EventBus, ApexCharts
    ↓
status-indicator.js   ← depends on: EventBus
    ↓
warga.js / admin.js   ← depends on: semua di atas + AppState + sendCommand
```

**Catatan kritis:** `admin.html` tidak memuat `queue-animation.js`. Jika `admin.js` atau file lain di admin page memanggil `window.animateNumberFlip` (versi global dari `queue-animation.js`), itu akan throw `ReferenceError`. Saat ini `admin.js` mendefinisikan versi lokalnya sendiri dan tidak memanggil global, sehingga tidak crash — namun ini adalah dependency implisit yang rapuh.
