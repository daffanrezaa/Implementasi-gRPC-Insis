# BursaGRPC — Virtual Stock Exchange Simulator
### Paper Trading Platform Berbasis Komunikasi gRPC

> *Simulasi transaksi saham berbasis gRPC untuk edukasi investor dan pengujian strategi trading tanpa risiko finansial*

---

## 1. Deskripsi & Tujuan

### Deskripsi
BursaGRPC adalah platform paper trading yang memungkinkan beberapa client (trader) untuk melakukan transaksi jual-beli saham simulasi secara real-time. Server bertindak sebagai matching engine yang memproses order, mempertemukan buyer dan seller, serta menyiarkan perubahan harga ke seluruh client yang terhubung.

Seluruh saham menggunakan ticker nyata bursa Indonesia (BBCA, TLKM, GOTO, ASII, BMRI) dengan harga awal yang di-seed dari data historis, namun bergerak berdasarkan supply-demand internal sistem.

> **Framing:** Paper trading adalah kategori produk nyata yang dipakai industri. Stockbit, Investopedia, dan TradingView semua punya fitur ini. BursaGRPC adalah implementasi backend-nya menggunakan gRPC sebagai protokol komunikasi antar layanan.

### Tujuan
- Mengimplementasikan komunikasi antar-layanan menggunakan protokol gRPC dengan Node.js
- Mendemonstrasikan ketiga pola komunikasi gRPC: Unary, Server-side Streaming, dan Bi-directional Streaming
- Mensimulasikan mekanisme order matching yang dipakai di bursa saham nyata
- Mengelola state multi-client secara concurrent di sisi server

---

## 2. Desain Sistem

### Arsitektur
Gambaran besar bagaimana client, services, dan server state saling berhubungan:

![Arsitektur gRPC](assets/bursa_grpc_architecture.svg)

### Alur Request Inti
Ketika trader menempatkan order sampai harga ter-broadcast ke semua client:

![Alur Request](assets/place_order_sequence.svg)

### State Machine Order
Dari masuk sampai selesai atau dibatalkan:

![State Machine](assets/order_state_machine.svg)

### Alur Utama
1. Client register → dapat saldo awal (virtual money)
2. Client subscribe ke `WatchMarket` → terima stream harga real-time
3. Client kirim `PlaceOrder` → server jalankan matching engine
4. Jika order match → portfolio kedua pihak diupdate otomatis
5. Harga saham baru di-broadcast ke semua subscriber

---

## 3. Services (Proto Design)

### AccountService — Manajemen Akun
| Method | Type | Deskripsi |
|--------|------|-----------|
| `Register` | Unary | Daftarkan client baru, dapat saldo awal |
| `GetBalance` | Unary | Cek saldo |
| `GetTradeHistory` | Unary | Riwayat transaksi |
| `GetPerformance` | Unary | Return rate %, win rate per trader |

### TradingService — Transaksi Inti
| Method | Type | Deskripsi |
|--------|------|-----------|
| `PlaceOrder` | Unary | Submit order beli/jual |
| `CancelOrder` | Unary | Batalkan order yang pending |
| `GetPortfolio` | Unary | Lihat saldo & kepemilikan saham |
| `GetOrderBook` | Unary | Lihat daftar order pending di pasar |
| `BatchPlaceOrders` | Client-side Streaming | Algorithmic trader kirim banyak order sekaligus |

### MarketService — Data Pasar
| Method | Type | Deskripsi |
|--------|------|-----------|
| `GetStockInfo` | Unary | Info harga saham saat ini |
| `WatchMarket` | Server-side Streaming | Stream harga saham real-time ke semua client |
| `WatchLeaderboard` | Server-side Streaming | Update leaderboard secara real-time |
| `StreamTrade` | Bi-directional Streaming | Live session trading interaktif |

---

## 4. Fitur

### Mapping ke Requirements

| # | Requirement | Implementasi |
|---|-------------|--------------|
| 1 | Unary gRPC | `Register`, `PlaceOrder`, `GetPortfolio`, `GetStockInfo`, dll |
| 2a | Server-side Streaming | `WatchMarket` — harga real-time, `WatchLeaderboard` |
| 2b | Client-side Streaming | `BatchPlaceOrders` — algorithmic trader kirim banyak order |
| 2c | Bi-directional Streaming | `StreamTrade` — live session trading interaktif |
| 3 | Error Handling | gRPC status codes: `UNAUTHENTICATED`, `FAILED_PRECONDITION`, `INVALID_ARGUMENT`, `NOT_FOUND` |
| 4 | In-memory State | `Map` / `Array` di Node.js server: order book, portfolio, price history |
| 5 | Multi-client | Banyak trader konek bersamaan, tiap subscribe `WatchMarket` dapat stream independen |
| 6 | Min 3 Services | `AccountService`, `TradingService`, `MarketService` |

### Fitur Tambahan (Diferensiasi/Opsional)
- **Ticker Saham IDX** — BBCA, TLKM, GOTO, ASII, BMRI dengan harga awal berbasis data historis
- **Order Matching Engine** — otomatis cocokkan order beli & jual berdasarkan harga terbaik
- **Price Movement** — harga saham bergerak berdasarkan supply & demand dari transaksi nyata
- **Market Maker Bot** — server pasang order otomatis agar pasar selalu aktif
- **Portfolio Tracker** — tiap client bisa pantau profit/loss secara real-time
- **Performance Analytics** — return rate % dan win rate per trader via `GetPerformance`
- **Leaderboard** — ranking trader berdasarkan total nilai portofolio, update real-time

### Error Handling

| Error Case | gRPC Status Code |
|------------|-----------------|
| Client belum register mencoba transaksi | `UNAUTHENTICATED` |
| Saldo tidak cukup untuk order beli | `FAILED_PRECONDITION` |
| Saham tidak cukup untuk order jual | `FAILED_PRECONDITION` |
| Harga order ≤ 0 atau negatif | `INVALID_ARGUMENT` |
| Order ID tidak ditemukan saat cancel | `NOT_FOUND` |
| Ticker saham tidak dikenal | `NOT_FOUND` |

---

## 5. Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Language | Node.js (JavaScript) |
| gRPC Framework | `@grpc/grpc-js` + `@grpc/proto-loader` |
| Terminal UI | `blessed` atau `chalk` + `cli-table3` |
| In-memory State | Native JS `Map`, `Array` |
| Market Maker Bot | `setInterval` loop di server |
| Testing Multi-client | Jalankan beberapa instance CLI di terminal berbeda |

<!---

## Proto Design (gRPC Services)

Berikut definisi lengkap ketiga service dalam format `.proto`, sudah disesuaikan ke JavaScript/Node.js dan framing paper trading:

```protobuf
// account_service.proto
service AccountService {
  rpc Register (RegisterRequest) returns (RegisterResponse);        // Unary
  rpc GetBalance (BalanceRequest) returns (BalanceResponse);        // Unary
  rpc GetTradeHistory (HistoryRequest) returns (HistoryResponse);   // Unary
  rpc GetPerformance (PerformanceRequest) returns (PerformanceResponse); // Unary — return rate %, win rate
}

// trading_service.proto
service TradingService {
  rpc PlaceOrder (OrderRequest) returns (OrderResponse);            // Unary
  rpc CancelOrder (CancelRequest) returns (CancelResponse);         // Unary
  rpc GetPortfolio (PortfolioRequest) returns (PortfolioResponse);  // Unary
  rpc GetOrderBook (OrderBookRequest) returns (OrderBookResponse);  // Unary
  rpc BatchPlaceOrders (stream OrderRequest) returns (BatchResponse); // Client-side streaming (bonus!)
}

// market_service.proto
service MarketService {
  rpc GetStockInfo (StockRequest) returns (StockResponse);          // Unary
  rpc WatchMarket (WatchRequest) returns (stream MarketUpdate);     // Server-side streaming
  rpc WatchLeaderboard (LeaderboardRequest) returns (stream LeaderboardUpdate); // Server-side streaming
  rpc StreamTrade (stream TradeAction) returns (stream TradeEvent); // Bi-directional streaming
}
```

Perhatikan `BatchPlaceOrders` — ini client-side streaming yang menjadi bonus. Dengan ini, kalian cover **ketiga jenis streaming sekaligus**, yang hampir pasti membedakan proyek kalian dari kelompok lain.

---

-->