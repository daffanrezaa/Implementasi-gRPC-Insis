# **Virtual Stock Exchange Simulator**
### **Implementasi Sistem Komunikasi gRPC**
---

## **1. Judul**
**Virtual Stock Exchange Simulator**  
Simulasi sistem bursa saham real-time berbasis gRPC

---

## **2. Deskripsi & Tujuan**

### **Deskripsi**
Virtual Stock Exchange Simulator adalah sistem simulasi bursa saham yang memungkinkan beberapa client untuk melakukan transaksi jual-beli saham secara real-time. Server bertindak sebagai matching engine yang memproses order, mempertemukan pembeli dan penjual, serta menyiarkan perubahan harga ke seluruh client yang terhubung.

### **Tujuan**
- Mengimplementasikan komunikasi antar-layanan menggunakan protokol gRPC
- Mensimulasikan mekanisme pasar saham sederhana (order matching)
- Mendemonstrasikan penggunaan Unary dan Streaming gRPC dalam satu sistem
- Mengelola state multi-client secara bersamaan di sisi server

---

## **3. Desain Sistem**

### **Arsitektur**
![Arsitektur-gRPC](assets/Arsitektur_gRPC.png)

### **Services (Proto)**

**1. TradingService** — transaksi inti
- `PlaceOrder` (Unary) — submit order beli/jual
- `CancelOrder` (Unary) — batalkan order yang pending
- `GetPortfolio` (Unary) — lihat saldo & kepemilikan saham

**2. MarketService** — data pasar
- `GetStockInfo` (Unary) — info harga saham saat ini
- `WatchMarket` (Server-side Streaming) — stream harga saham secara real-time ke semua client
- `GetOrderBook` (Unary) — lihat daftar order pending di pasar

**3. AccountService** — manajemen akun
- `Register` (Unary) — daftarkan client baru
- `GetBalance` (Unary) — cek saldo
- `GetTradeHistory` (Unary) — riwayat transaksi

### Alur Utama
1. Client register → dapat saldo awal (virtual money)
2. Client subscribe ke `WatchMarket` → terima stream harga real-time
3. Client kirim `PlaceOrder` → server jalankan matching engine
4. Jika order match → portfolio kedua pihak diupdate otomatis
5. Harga saham baru di-broadcast ke semua subscriber

---

## 4. Fitur-Fitur

### Fitur Wajib (sesuai requirement)
| # | Fitur | Implementasi |
|---|-------|-------------|
| 1 | Unary gRPC | `PlaceOrder`, `Register`, `GetPortfolio`, dll |
| 2 | Server-side Streaming | `WatchMarket` — harga saham real-time |
| 3 | Error Handling | Order ditolak jika saldo kurang, saham tidak cukup, dll |
| 4 | State Management In-Memory | Order book, portfolio, price history tersimpan di server |
| 5 | Multi Client | Banyak trader bisa konek dan transaksi bersamaan |
| 6 | Minimal 3 Services | `TradingService`, `MarketService`, `AccountService` |

### Fitur Tambahan
- **Order Matching Engine** — otomatis cocokkan order beli & jual berdasarkan harga terbaik
- **Price Movement** — harga saham bergerak berdasarkan supply & demand dari transaksi nyata
- **Portfolio Tracker** — tiap client bisa pantau profit/loss secara real-time
- **Leaderboard** — ranking trader berdasarkan total nilai portofolio
- **Multiple Stocks** — tersedia beberapa ticker saham simulasi (e.g. GOTO, BBCA, TLKM)

### Error Handling Cases
- Saldo tidak mencukupi untuk order beli
- Jumlah saham tidak cukup untuk order jual
- Order ID tidak ditemukan saat cancel
- Client belum terdaftar mencoba transaksi
- Harga order tidak valid (negatif / nol)

---

## Tech Stack
- **Bahasa**: JavaScript
- **Framework**: gRPC + Protocol Buffers
- **State**: In-memory (dictionary/list di server)
- **Tampilan Client**: Terminal UI dengan library `rich`



# KetokPalu — CLI Auction House
### Sistem Lelang Real-Time Berbasis Komunikasi gRPC

> *Simulasi platform lelang kompetitif berbasis gRPC untuk memahami mekanisme bidding, validasi transaksi, dan komunikasi real-time antar-layanan*

---

## 1. Deskripsi & Tujuan

### Deskripsi
KetokPalu adalah sistem lelang real-time berbasis CLI yang memungkinkan banyak user berpartisipasi secara bersamaan sebagai **auctioneer** (pelelang) maupun **bidder** (peserta lelang). Server bertindak sebagai auction engine yang mengelola sesi lelang, memvalidasi setiap bid, menjalankan countdown timer, dan mengumumkan pemenang secara otomatis ke seluruh peserta yang terhubung.

Setiap sesi lelang memiliki item nyata (misalnya barang elektronik, koleksi, kendaraan) dengan harga awal (*starting price*) dan durasi yang ditentukan auctioneer. Harga naik murni berdasarkan kompetisi antar-bidder secara real-time.

> **Framing:** Mekanisme lelang adalah fondasi dari banyak platform digital modern. Tokopedia Lelang, eBay, NFT marketplace (OpenSea), hingga sistem iklan programatik (Google Ads) semuanya berjalan di atas logika auction engine. KetokPalu adalah implementasi backend-nya menggunakan gRPC sebagai protokol komunikasi antar layanan.

### Tujuan
- Mengimplementasikan komunikasi antar-layanan menggunakan protokol gRPC dengan Node.js
- Mendemonstrasikan ketiga pola komunikasi gRPC: Unary, Server-side Streaming, dan Bi-directional Streaming
- Mensimulasikan mekanisme auction engine lengkap dengan validasi bid, timer management, dan pengumuman pemenang otomatis
- Mengelola state multi-client secara concurrent di sisi server (banyak bidder aktif dalam satu sesi lelang)

---

## 2. Desain Sistem

### Arsitektur
Gambaran besar bagaimana client, services, dan server state saling berhubungan:

```
┌─────────────────────────────────────────────────────────────────┐
│                        KETOKPALU SERVER                         │
│                                                                 │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│   │ UserService  │  │ AuctionService│  │   BidService         │ │
│   │              │  │              │  │                      │ │
│   │ Register     │  │ CreateAuction│  │ PlaceBid (Unary)     │ │
│   │ GetProfile   │  │ GetAuction   │  │ WatchAuction (SS)    │ │
│   │ GetMyHistory │  │ ListAuctions │  │ StreamBidSession(BD) │ │
│   │ GetBalance   │  │ CloseAuction │  │ GetBidHistory        │ │
│   └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘ │
│          │                 │                      │             │
│   ───────┴─────────────────┴──────────────────────┴──────────── │
│                     IN-MEMORY STATE                             │
│   users: Map   auctions: Map   bids: Map   subscribers: Set    │
└─────────────────────────────────────────────────────────────────┘
          ▲                ▲                        ▲
          │ Unary          │ Unary / SS             │ Bidi Stream
     ┌────┴────┐      ┌────┴────┐             ┌────┴────┐
     │ Client  │      │ Client  │             │ Client  │
     │(Bidder) │      │(Auction │             │(Bidder  │
     │         │      │  eer)   │             │ Aktif)  │
     └─────────┘      └─────────┘             └─────────┘
```

### Alur Request Inti
Dari auctioneer membuka sesi lelang hingga pemenang diumumkan ke semua peserta:

```
Auctioneer          Server              Bidder A          Bidder B
    │                  │                    │                 │
    │  CreateAuction   │                    │                 │
    │─────────────────>│                    │                 │
    │  auction_id      │                    │                 │
    │<─────────────────│                    │                 │
    │                  │   WatchAuction(auction_id)           │
    │                  │<───────────────────│                 │
    │                  │   WatchAuction(auction_id)           │
    │                  │<────────────────────────────────────>│
    │                  │                    │                 │
    │                  │  stream: OPEN, 120s, starting 500rb  │
    │                  │───────────────────>│                 │
    │                  │───────────────────────────────────── │
    │                  │                    │                 │
    │                  │     PlaceBid(600rb)│                 │
    │                  │<───────────────────│                 │
    │                  │  BID_ACCEPTED      │                 │
    │                  │───────────────────>│                 │
    │                  │  stream: NEW_BID, A leads 600rb      │
    │                  │───────────────────>│                 │
    │                  │────────────────────────────────────> │
    │                  │                    │  PlaceBid(650rb)│
    │                  │<────────────────────────────────────>│
    │                  │  stream: NEW_BID, B leads 650rb      │
    │                  │───────────────────>│                 │
    │                  │────────────────────────────────────> │
    │                  │                    │ OUTBID notif    │
    │     [timer habis — server auto-close]                   │
    │                  │  stream: AUCTION_CLOSED, B WINS      │
    │                  │───────────────────>│                 │
    │                  │────────────────────────────────────> │
```

### State Machine Sesi Lelang
Dari sesi dibuka auctioneer hingga selesai atau dibatalkan:

```
                    ┌──────────┐
                    │  PENDING │  ← CreateAuction dipanggil
                    └────┬─────┘
                         │ auctioneer konfirmasi start
                         ▼
                    ┌──────────┐
               ┌───│   OPEN   │───────────────────────────┐
               │   └────┬─────┘                           │
               │        │ PlaceBid masuk                  │ CancelAuction
               │        ▼                                 │ (auctioneer only)
               │   ┌──────────┐                           │
  timer habis, │   │  BIDDING │ ← bid terus masuk         │
  0 bid        │   └────┬─────┘                           ▼
               │        │ timer habis, ada bid       ┌──────────┐
               │        ▼                            │CANCELLED │
               │   ┌──────────┐                      └──────────┘
               └──>│  CLOSED  │ ← pemenang diumumkan
                   └──────────┘
                        │
                        ▼
                   ┌──────────┐
                   │ SETTLED  │ ← saldo/item transfer selesai
                   └──────────┘
```

### Alur Utama
1. Client `Register` → dapat saldo awal virtual (Rp 10.000.000)
2. Auctioneer panggil `CreateAuction` → sesi lelang terbuat dengan timer & starting price
3. Bidder panggil `WatchAuction` → terima stream: countdown, current highest bid, event notifikasi
4. Bidder panggil `PlaceBid` atau masuk `StreamBidSession` → server validasi & broadcast bid baru
5. Timer habis → server otomatis close sesi, umumkan pemenang ke semua subscriber
6. Saldo & item ditransfer otomatis di server state

---

## 3. Services (Proto Design)

### UserService — Manajemen Pengguna
| Method | Type | Deskripsi |
|--------|------|-----------|
| `Register` | Unary | Daftarkan user baru, dapat saldo awal virtual |
| `GetProfile` | Unary | Lihat profil & reputasi user |
| `GetBalance` | Unary | Cek saldo virtual saat ini |
| `GetMyHistory` | Unary | Riwayat lelang yang pernah diikuti atau dibuat |

### AuctionService — Manajemen Sesi Lelang
| Method | Type | Deskripsi |
|--------|------|-----------|
| `CreateAuction` | Unary | Buka sesi lelang baru (auctioneer only) |
| `GetAuctionStatus` | Unary | Cek status, harga tertinggi, dan sisa waktu |
| `ListActiveAuctions` | Unary | Daftar semua sesi lelang yang sedang berjalan |
| `CancelAuction` | Unary | Batalkan sesi lelang (auctioneer & belum ada bid) |

### BidService — Transaksi Bidding
| Method | Type | Deskripsi |
|--------|------|-----------|
| `PlaceBid` | Unary | Submit satu bid ke sesi lelang tertentu |
| `GetBidHistory` | Unary | Lihat riwayat bid suatu sesi |
| `WatchAuction` | Server-side Streaming | Terima live update: countdown, bid baru, event close |
| `StreamBidSession` | Bi-directional Streaming | Sesi bidding interaktif — tiap bid dibalas konfirmasi atau notifikasi OUTBID |

---

## 4. Fitur

### Mapping ke Requirements

| # | Requirement | Implementasi |
|---|-------------|--------------|
| 1 | Unary gRPC | `Register`, `CreateAuction`, `PlaceBid`, `GetAuctionStatus`, `ListActiveAuctions`, dll |
| 2a | Server-side Streaming | `WatchAuction` — live countdown + bid terbaru + event close ke semua peserta |
| 2b | Bi-directional Streaming | `StreamBidSession` — sesi interaktif, server balas tiap bid dengan konfirmasi atau OUTBID notification |
| 3 | Error Handling | gRPC status codes: `UNAUTHENTICATED`, `FAILED_PRECONDITION`, `INVALID_ARGUMENT`, `NOT_FOUND`, `PERMISSION_DENIED` |
| 4 | In-memory State | `Map` di Node.js server: users, auctions, bids, subscribers per sesi |
| 5 | Multi-client | Banyak bidder konek bersamaan di satu sesi, tiap `WatchAuction` dapat stream independen |
| 6 | Min 3 Services | `UserService`, `AuctionService`, `BidService` |

### Fitur Tambahan (Diferensiasi)
- **Auto-Close Timer** — server jalankan `setInterval` per sesi; lelang tutup otomatis & pemenang diumumkan saat countdown habis
- **Bid Validation** — bid baru harus lebih tinggi dari current highest bid + minimum increment (configurable)
- **Balance Escrow** — saldo bidder tertinggi dikunci sementara; dikembalikan jika di-outbid
- **Anti-Snipe Extension** — jika ada bid masuk di 10 detik terakhir, timer otomatis diperpanjang 30 detik (mekanisme anti-sniping eBay)
- **Leaderboard Bidder** — ranking berdasarkan total nilai item yang berhasil dimenangkan
- **Auction Categories** — Elektronik, Kendaraan, Koleksi, Properti — bisa filter di `ListActiveAuctions`
- **Winner Notification** — broadcast khusus ke pemenang dan semua peserta saat sesi ditutup

### Error Handling

| Error Case | gRPC Status Code |
|------------|-----------------|
| User belum register mencoba bid | `UNAUTHENTICATED` |
| Saldo tidak cukup untuk bid | `FAILED_PRECONDITION` |
| Bid lebih rendah dari current highest bid | `FAILED_PRECONDITION` |
| Bid masuk ke sesi yang sudah CLOSED | `FAILED_PRECONDITION` |
| Harga bid ≤ 0 atau negatif | `INVALID_ARGUMENT` |
| Auction ID tidak ditemukan | `NOT_FOUND` |
| Auctioneer coba cancel sesi yang sudah ada bid | `FAILED_PRECONDITION` |
| User coba cancel sesi milik orang lain | `PERMISSION_DENIED` |

---

## 5. Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Language | Node.js (JavaScript) |
| gRPC Framework | `@grpc/grpc-js` + `@grpc/proto-loader` |
| Terminal UI | `chalk` + `cli-table3` + `readline` |
| In-memory State | Native JS `Map`, `Array` |
| Timer Management | `setInterval` + `clearInterval` per sesi lelang |
| Testing Multi-client | Jalankan beberapa instance CLI di terminal berbeda |

---

## 6. Struktur Direktori (Rencana)

```
ketokpalu/
├── proto/
│   ├── user.proto
│   ├── auction.proto
│   └── bid.proto
├── server/
│   ├── index.js               ← entry point server
│   ├── state/
│   │   ├── users.js           ← in-memory user store
│   │   ├── auctions.js        ← in-memory auction store
│   │   └── bids.js            ← in-memory bid store
│   └── services/
│       ├── userService.js
│       ├── auctionService.js
│       └── bidService.js
├── client/
│   ├── index.js               ← entry point CLI
│   ├── menus/
│   │   ├── mainMenu.js
│   │   ├── auctioneerMenu.js
│   │   └── bidderMenu.js
│   └── utils/
│       └── display.js         ← formatting output CLI
├── package.json
└── README.md
```