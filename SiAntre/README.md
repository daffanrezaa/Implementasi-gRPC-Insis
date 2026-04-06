# SiAntre — Sistem Antrian SAMSAT Digital via gRPC

> Simulasi platform antrian digital khusus untuk layanan SAMSAT (Pajak Tahunan, Perpanjangan STNK, Pembuatan STNK) berbasis komunikasi client-server real-time menggunakan protokol gRPC dengan kapasitas *shared-session*.

---

## Pemenuhan Syarat Tugas

| Syarat | Implementasi |
|--------|-------------|
| **Unary gRPC** | 12+ RPC: `ListServices`, `GetAvailableSlots`, `CreateBooking`, `CheckInCitizen`, `WalkInCitizen`, `GetSystemStats`, `CancelBooking`, dll. |
| **Server-side Streaming** | `QueueService.WatchQueue` — server push real-time ke semua *subscriber* (warga yang memantau antrian). |
| **Bi-directional Streaming** | `AdminService.AdminSession` — petugas mengirim command/operasi, server mengirim *event live update* panel. |
| **Error Handling** | Menggunakan standardized gRPC status codes (`NOT_FOUND`, `RESOURCE_EXHAUSTED`, `INVALID_ARGUMENT`, `PERMISSION_DENIED`) yang ditangkap mulus di UI klien. |
| **In-memory State** | Penggunaan `services`, `slots`, `bookings`, `queues`, `officers` disimpan secara efisien dalam memory menggunakan `Map()`. |
| **Multi-client** | Mendukung *concurrent* N citizen (warga) + N admin (petugas) yang terkoneksi bersamaan ke server lokal. |
| **Minimal 3 Services** | **4 gRPC Services**: `ServiceInfo`, `Booking`, `Queue`, `Admin`. Tersedia **3 Domain Layanan**: PKB (Pajak), Perpanjangan STNK, & Pembuatan STNK. |

---

## Fitur Unggulan Antrian SAMSAT

1. **Shared Capacity Slots**
   Slot booking menggunakan sesi per 30 Menit. SAMSAT memiliki 4 loket/kapasitas yang bersifat *shared* (berbagi pakai) antar layanan. 
2. **Auto-Expired Booking**
   Sistem secara konstan memeriksa jadwal dengan resolusi per 60 detik. Apabila warga telat datang *(melewati batas check-in 15 menit sebelum sesi dimulai)*, status akan diubah menjadi `EXPIRED` dan sisa kapasitas akan dikembalikan ke loket.
3. **Check-In Terpusat oleh Petugas**
   Percepatan loket dengan memutus akses validasi dari Warga, dan menyerahkan kendali Check-In ke sisi panel Admin/Petugas saat men-scan/memasukkan kode booking di lokasi.
4. **Dukungan Walk-In Lengkap**
   Sistem mendukung kehadiran murni spontan *Walk-In* langsung ke petugas selagi slot di sesi saat itu belum terpenuhi kapasitasnya.

---

## Struktur Proyek

```
SiAntre/
├── proto/                        # Protocol Buffer definitions
│   ├── service_info.proto        # Info Layanan & Slot
│   ├── booking.proto             # Booking & CRUD Registrasi
│   ├── queue.proto               # Realtime Queue (Server-Streaming)
│   └── admin.proto               # Admin API & Ops (Bi-Di Streaming)
├── server/
│   ├── index.js                  # Entry point gRPC server
│   ├── state/                    # In-memory MapStores
│   ├── services/                 # Implementasi bisnis logik RPC
│   └── helpers/                  # Utilities, Auto-Cancel Timer, Seeder
├── client/
│   ├── warga.js                  # Client interaktif untuk Warga
│   └── admin.js                  # Client interaktif & Live Dashboard Petugas
└── package.json
```

---

## Cara Menjalankan

### 1. Install Dependencies

```bash
npm install
```

### 2. Jalankan Server (Wajib Pertama)

```bash
npm run server
```

### 3. Jalankan Aplikasi Petugas / Admin (Terminal Baru)

```bash
npm run admin
```

### 4. Jalankan Aplikasi Warga (Terminal Baru)

```bash
npm run warga
```

---

## Data Identitas Valid untuk Testing

| Role | Kredensial |
|------|-----------|
| **Admin Awal** | Saat di-*run* pertama, `admin.js` akan meminta **Setup Awal**. Masukkan misal: ID `A001` dengan PIN bebas (contoh: `123456`). |
| **Petugas** | Dapat dibuat oleh akun Admin dari menu 1, misal: `P001` (Petugas Loket) |
| **Warga** | Memasukkan 16 digit NIK. Tersedia NIK Demo yang langsung terisi namanya: `3201234567890001` (Budi) & `3201234567890002` (Siti) |

---

## Skenario Pengujian Alur Sistem

Buka **Tiga Terminal** secara beriringan: 1 Server, 1 Warga, 1 Admin.

1. **[Petugas]** Buka opsi `2` (Manajemen Kedatangan) / opsi `1` (Dashboard Live).
2. **[Warga]** Lakukan **Booking sesi kunjungan**. Pilih hari ini atau besok. Pilih sesi 30-menitan.
3. **[Warga]** Catat atau copy kode *Booking Code* (Contoh: `PAJAK-XXXX`). Sistem memperingatkan jangan lewat dari batas 15 menit.
4. **[Warga]** Masuk ke Menu ke `5` (Pantau antrean real-time).
5. **[Petugas]** Masuk ke menu `Manajemen Kedatangan`, pilih opsi `[1] Check-In Warga`. Masukkan kode Booking yang dibawa Warga tadi.
6. ✓ **Warga otomatis masuk antrian**. Warga langsung menerima pesan live *“Anda berada di urutan ke-X”*.
7. **[Petugas]** Di menu Manajemen, pilih opsi `[3] Panggil Nomor Berikutnya`.
8. ✓ **Warga terpanggil secara Live**. Layar Terminal warga akan bergetar dan membunyikan _🔔 GILIRAN ANDA!_.

**Skenario Tambahan:**
- Coba diamkan Booking sampai *H-15 menit* dari jadwal sesinya; biarkan server otomatis mengubahnya ke `EXPIRED`.
- Coba datang tanpa pesan via HP, biarkan Petugas klik *`[2] Walk-In Warga`*, warga akan segera terdaftar jika *kuota* 4 orang per-sesi SAMSAT saat itu masih ada.

---

## Penanganan Error / Validasi

Lapis validasi interaktif di terminal dengan Standardized gRPC Error Codes `grpc.status`:

| Kondisi | Status | Keterangan |
|---------|---------|-------------|
| **Booking Bentrok** | `ALREADY_EXISTS` | Warga tidak boleh daftar lebih dari 1 sesi dalam 1 blok waktu per orang |
| **Kapasitas Penuh** | `RESOURCE_EXHAUSTED` | Jika sesi ke-tersebut sudah menampung ke-empat loketnya sekaligus |
| **Batas Waktu Habis** | `FAILED_PRECONDITION` | Tidak bisa *Check-in* jika jarum jam sudah melampaui deadline kedatangan |
| **Salah PIN** | `PERMISSION_DENIED` | Login petugas digagalkan |
| **Tidak Terdaftar** | `NOT_FOUND` | Kode registrasi *booking* (*Check-in*) tidak otentik |
