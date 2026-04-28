# 🔧 Koreksi Analisis & Rencana Perbaikan Final

> Dikoreksi berdasarkan klarifikasi desain dari developer. Beberapa temuan sebelumnya **bukan** design flaw — melainkan desain yang belum selesai diimplementasi.

---

## Koreksi dari Analisis Sebelumnya

### ~~DF-S1~~ `isWithinCheckinDeadline` — ✅ BUKAN BUG

Setelah klarifikasi, logika ini **benar**:

```
Sesi 10:00 → deadline check-in = 09:45
Warga tiba 09:30 → ✅ Boleh check-in (belum lewat deadline)
Warga tiba 09:50 → ❌ Ditolak (sudah lewat deadline)
```

Ini sesuai desain: warga **harus sudah check-in 15 menit sebelum dilayani**, sebagai konfirmasi kehadiran. Setelah deadline, booking otomatis expired.

### ~~DF-P1~~ & ~~DF-P2~~ — ✅ BUKAN INKONSISTENSI, TAPI DESAIN BELUM LENGKAP

User mengklarifikasi bahwa `nik` ≠ `citizen_id` dan `officer_id` ≠ `id_pegawai` memang **intentionally berbeda**:

| Konsep | External ID (Nomor Induk) | Internal System ID |
|--------|--------------------------|-------------------|
| **Warga** | `nik` — NIK KTP 16 digit | `citizen_id` — ID unik per registrasi |
| **Petugas** | `officer_id` — NIP/Nomor Induk Karyawan | `id_pegawai` — ID unik di-set sistem |

**Masalah:** Server **belum mengimplementasi** pemisahan ini:

| Entitas | Seharusnya | Saat Ini di Server |
|---------|-----------|-------------------|
| Warga | `nik` ≠ `citizen_id` (generate saat register) | `citizen_id = nik` (sama) |
| Petugas | `officer_id` ≠ `id_pegawai` (generate saat register) | Hanya ada `id_pegawai`, `officer_id` = `id_pegawai` |

---

## Daftar Fix yang Benar

### Kategori A: Identity System (Desain Belum Lengkap)

#### FIX-A1: Generate `citizen_id` saat Register Warga

**Saat ini:**
```javascript
// citizenStore hanya simpan nik sebagai key
citizenStore.set(nik, { nik, nama_lengkap, no_hp, alamat });
// Tidak ada citizen_id yang di-generate
```

**Seharusnya:**
```javascript
// RegisterCitizen menghasilkan citizen_id unik
const citizen_id = `WRG-${generateShortId()}`; // e.g. "WRG-A3F7"
citizenStore.set(nik, { nik, citizen_id, nama_lengkap, no_hp, alamat });
```

**Perubahan yang diperlukan:**

| File | Perubahan |
|------|-----------|
| `service_info.proto` | `RegisterCitizenResponse` tambah field `citizen_id` |
| `service_info.proto` | `LoginCitizenResponse` tambah field `citizen_id` |
| `citizenStore.js` | Simpan `citizen_id` di profil |
| `serviceInfoService.js` | Generate `citizen_id` di `RegisterCitizen`, return di `LoginCitizen` |

**Proto changes:**
```protobuf
message RegisterCitizenResponse {
  bool   success    = 1;
  string nik        = 2;
  string citizen_id = 3;  // NEW: system-generated ID
  string message    = 4;
}

message LoginCitizenResponse {
  bool   success      = 1;
  string nik          = 2;
  string citizen_id   = 3;  // NEW: returned on login
  string nama_lengkap = 4;  // renumber: was 3
  string no_hp        = 5;  // renumber: was 4
  string alamat       = 6;  // renumber: was 5
  string message      = 7;  // renumber: was 6
}
```

> [!WARNING]
> **Renumbering proto fields adalah breaking change!** Karena server belum punya consumer lain, ini aman. Tapi harus update `LoginCitizenResponse` field numbers. Alternatif yang lebih aman: tambah `citizen_id` di field number 7 (tanpa renumber).

**Alternatif aman tanpa renumber:**
```protobuf
message LoginCitizenResponse {
  bool   success      = 1;
  string nik          = 2;
  string nama_lengkap = 3;  // tetap
  string no_hp        = 4;  // tetap
  string alamat       = 5;  // tetap
  string message      = 6;  // tetap
  string citizen_id   = 7;  // NEW: tambah di akhir
}
```

#### FIX-A2: Pisahkan `officer_id` dan `id_pegawai` untuk Petugas

**Saat ini:** `id_pegawai` diketik manual oleh admin (e.g., "P001") dan dipakai sebagai satu-satunya identifier.

**Seharusnya:**
- `officer_id` = NIP (Nomor Induk Pegawai), diinput saat registrasi — ini ID resmi/external
- `id_pegawai` = ID sistem yang di-generate otomatis

**Tapi ini raise pertanyaan arsitektur:**

| Pertanyaan | Opsi A | Opsi B |
|-----------|--------|--------|
| Login pakai apa? | `officer_id` (NIP) + PIN | `id_pegawai` (system ID) + PIN |
| Siapa yang input `officer_id`? | Admin saat registrasi | — |
| Siapa yang generate `id_pegawai`? | Sistem otomatis | Admin manual (saat ini) |

**Rekomendasi untuk project ini:** Karena scope tugas adalah WebSocket (bukan user management), **cukup tambahkan komentar di proto** bahwa kedua field ini konseptual berbeda, tapi nilainya saat ini sama. Full separation bisa dilakukan nanti.

**Quick fix realistis:**
```protobuf
// admin.proto — tambah komentar untuk kejelasan
message LoginOfficerRequest {
  string id_pegawai = 1;  // System-assigned officer ID (e.g., "P001")
  string pin        = 2;
}

message AdminCommand {
  string command_type = 1;
  string service_id   = 2;
  string officer_id   = 3;  // = id_pegawai (same value, different context name)
  string payload      = 4;
}
```

---

### Kategori B: Server Bugs (Harus Fix)

#### FIX-B1: `isOfficer` — Case Sensitivity

**Bug:** Officer terdaftar `"P001"` (uppercase), tapi `isOfficer("p001")` return `false`.

```diff
  // server/helpers/utils.js
  function isOfficer(nip) {
    const { officerStore } = require('../state');
-   return officerStore.isRegistered(nip);
+   return officerStore.isRegistered((nip || '').toUpperCase());
  }
```

#### FIX-B2: `AdminSession` ANNOUNCE — Payload Format

**Bug:** FINAL guide mengirim `message` langsung sebagai field `AdminCommand`, tapi proto hanya punya `payload` (string). Server meng-expect JSON di `payload`.

Ini **bukan fix server** — ini fix di **gateway code** saat implementasi nanti:

```javascript
// ❌ SALAH (apa yang ditulis di FINAL guide)
sendAdminCommand({
  command_type: 'ANNOUNCE',
  service_id: payload.service_id,
  message: payload.message,  // Field ini TIDAK ADA di proto AdminCommand!
});

// ✅ BENAR
sendAdminCommand({
  command_type: 'ANNOUNCE',
  service_id: payload.service_id,
  officer_id: state.officerId,
  payload: JSON.stringify({ message: payload.message }),  // Wrap dalam payload string
});
```

---

### Kategori C: Proto Field Mapping (Gateway)

Ini adalah fix yang diterapkan saat **coding gateway**, bukan perubahan proto/server:

| # | Issue | Fix |
|---|-------|-----|
| **C1** | `WatchQueueRequest.queue_number` → `my_queue_number` | Gateway kirim field yang benar |
| **C2** | `QueueUpdate.waiting_count` → `total_waiting` | Gateway baca field yang benar |
| **C3** | YOUR_TURN targeted delivery | Opsi B: client-side filter `current_number == myBooking.queue_number` |
| **C4** | `Announcement` hanya `message` + `timestamp` | Gateway handle sesuai proto |
| **C5** | `ServiceSummary` tidak punya `waiting_count` | Data dari `STATS_PUSH` (ServiceStats) |
| **C6** | `CancelBooking` pakai `booking_id` bukan `booking_code` | Gateway simpan mapping |

---

### Kategori D: Kualitas Kode (Nice to Have)

#### FIX-D1: `CancelBookingRequest` — Terima `booking_code`

Lebih user-friendly jika warga cancel pakai kode yang mereka lihat ("PKB-A3F7"), bukan UUID internal.

```protobuf
// booking.proto — ubah field
message CancelBookingRequest {
  string booking_code = 1;  // Ganti dari booking_id ke booking_code
  string citizen_id   = 2;
  string reason       = 3;
}
```

```javascript
// bookingService.js — ubah lookup
function CancelBooking(call, callback) {
  const { booking_code, citizen_id } = call.request;
  const booking = bookingStore.getByCode(booking_code.trim().toUpperCase());
  // ... rest sama
}
```

Sama untuk `RescheduleBookingRequest`:
```protobuf
message RescheduleBookingRequest {
  string booking_code = 1;  // Ganti dari booking_id
  string citizen_id   = 2;
  string new_slot_id  = 3;
}
```

#### FIX-D2: Perkaya `Announcement` Proto (Opsional)

```protobuf
message Announcement {
  string id         = 1;  // NEW: untuk deteksi duplikat
  string message    = 2;  // renumber dari 1
  string service_id = 3;  // NEW: announcement per layanan
  string timestamp  = 4;  // renumber dari 2
}
```

> [!NOTE]
> Ini opsional karena gateway sudah bisa handle announcement simpel (`message` + `timestamp` saja). Fix ini hanya untuk UX yang lebih kaya (misalnya filter announcement per layanan).

---

## 3 Opsi Scope Perbaikan

### Opsi 1: Full Fix (~2 jam)
> Semua fix A + B + C + D. Sistem paling bersih dan best practice.

| Area | Fix | Effort |
|------|-----|--------|
| Proto | FIX-A1: `citizen_id` generation | 20 min |
| Proto | FIX-D1: `CancelBooking` pakai `booking_code` | 15 min |
| Proto | FIX-D2: Perkaya `Announcement` | 10 min |
| Server | FIX-A1: Generate `citizen_id` di Register/Login | 20 min |
| Server | FIX-B1: `isOfficer` case fix | 2 min |
| Server | FIX-D1: `CancelBooking` lookup by code | 10 min |
| Docs | Update FINAL guide untuk semua fix | 20 min |
| Gateway | FIX-B2, C1-C6 | Saat coding |

### Opsi 2: Medium Fix (~45 menit) ⭐ Rekomendasi
> Fix bug nyata + citizen_id generation. Skip announcement perkaya.

| Area | Fix | Effort |
|------|-----|--------|
| Proto | FIX-A1: `citizen_id` di Register/Login response | 15 min |
| Proto | FIX-D1: `CancelBooking` pakai `booking_code` | 10 min |
| Server | FIX-A1: Generate `citizen_id` | 15 min |
| Server | FIX-B1: `isOfficer` case fix | 2 min |
| Server | FIX-D1: `CancelBooking` lookup by code | 5 min |
| Gateway | FIX-B2, C1-C6 | Saat coding |

### Opsi 3: Minimal Fix (~10 menit)
> Hanya fix bug server. Semua lainnya di-handle gateway saat coding.

| Area | Fix | Effort |
|------|-----|--------|
| Server | FIX-B1: `isOfficer` case fix | 2 min |
| Docs | Komentar di proto untuk kejelasan naming | 5 min |
| Gateway | FIX-B2, C1-C6, mapping `citizen_id=nik` | Saat coding |

---

## Rekomendasi: Opsi 2 (Medium Fix)

Alasan:
1. **`citizen_id` generation** — Ini konsep yang kamu inginkan, dan saat ini server belum implement. Tanpa ini, frontend harus kirim `nik` sebagai `citizen_id` (yang bukan desain yang kamu mau).
2. **`CancelBooking` pakai `booking_code`** — Lebih user-friendly. Warga lihat "PKB-A3F7", bukan UUID.
3. **`isOfficer` case fix** — Ini bug kecil tapi bisa bikin frustasi saat demo.
4. **Skip `officer_id`/`id_pegawai` full separation** — Terlalu besar untuk scope WebSocket. Cukup komentar.
5. **Skip `Announcement` enrichment** — Gateway sudah bisa handle versi simpel.

**Mau proceed dengan Opsi 2?** Jika ya, saya akan langsung:
1. Update proto files (3 file)
2. Update server code (3 file)
3. Finalisasi IMPLEMENTATION_GUIDE_FINAL.md
4. Mulai coding gateway + frontend
