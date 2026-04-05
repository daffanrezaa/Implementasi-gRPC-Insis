# BursaGRPC — Virtual Stock Exchange Simulator
### Paper Trading Platform Berbasis Komunikasi gRPC

> Simulasi transaksi saham berbasis gRPC untuk edukasi investor dan pengujian strategi trading tanpa risiko finansial

---

## Deskripsi

BursaGRPC adalah platform **paper trading** yang mensimulasikan mekanisme bursa saham nyata menggunakan gRPC sebagai protokol komunikasi antar-layanan. Server berperan sebagai **matching engine** yang memproses order buy/sell, mempertemukan buyer-seller, dan menyiarkan perubahan harga ke seluruh client yang terhubung secara real-time.

Seluruh saham menggunakan ticker nyata bursa Indonesia (**BBCA, TLKM, GOTO, ASII, BMRI**) dengan harga awal berbasis data historis, namun bergerak dinamis berdasarkan supply-demand internal sistem.

---

## Pemetaan Requirement Tugas

| # | Requirement | Implementasi |
|---|-------------|--------------|
| 1 | **Unary gRPC** | `Register`, `GetLogin`, `GetBalance`, `GetTradeHistory`, `GetPerformance`, `PlaceOrder`, `CancelOrder`, `GetPortfolio`, `GetOrderBook`, `GetStockInfo` — **10 Unary RPCs** |
| 2 | **Streaming** (min. 1) | `WatchMarket` (Server-side) + `WatchLeaderboard` (Server-side) + `BatchPlaceOrders` (Client-side) + `StreamTrade` (Bi-directional) |
| 3 | **Error Handling** | 9 skenario: `UNAUTHENTICATED`, `FAILED_PRECONDITION`, `INVALID_ARGUMENT`, `NOT_FOUND`, `PERMISSION_DENIED`, `ALREADY_EXISTS`, `INTERNAL` |
| 4 | **State Management** | Native JS `Map` & `Array` in-memory, tanpa database eksternal |
| 5 | **Multi Client** | Banyak trader concurrent, subscriber stream independen per client |
| 6 | **Min. 3 Services** | `AccountService` + `TradingService` + `MarketService` |

---

## Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Language | Node.js v18+ |
| gRPC Runtime | `@grpc/grpc-js ^1.10` |
| Proto Loader | `@grpc/proto-loader ^0.7` |
| CLI Styling | `chalk ^4` |
| CLI Table | `cli-table3 ^0.6` |

---

## Struktur Proyek

```
bursagrpc/
├── proto/
│   ├── account.proto         # AccountService contract
│   ├── trading.proto         # TradingService contract
│   └── market.proto          # MarketService contract
│
├── server/
│   ├── index.js              # Entry point — bind semua service
│   ├── config.js             # Konstanta (PORT, ticker, saldo awal)
│   ├── state/
│   │   ├── store.js          # Central in-memory state (SHARED)
│   │   ├── orderBook.js      # Insert/remove/aggregate order book
│   │   └── portfolio.js      # Update holding, hitung equity & P&L
│   ├── engine/
│   │   ├── matcher.js        # Price-Time Priority matching engine
│   │   ├── priceEngine.js    # Update harga + volatility noise
│   │   └── broadcaster.js    # Push ke WatchMarket & WatchLeaderboard subs
│   ├── bot/
│   │   └── marketMaker.js    # Bot pasang bid/ask setiap 3 detik
│   └── services/
│       ├── accountService.js # Register, GetLogin, GetBalance, GetTradeHistory, GetPerformance
│       ├── tradingService.js # PlaceOrder, CancelOrder, GetPortfolio, GetOrderBook, BatchPlaceOrders
│       └── marketService.js  # GetStockInfo, WatchMarket, WatchLeaderboard, StreamTrade
│
├── client/
│   ├── index.js              # CLI entry point + session management
│   ├── config.js             # Server address
│   ├── stubs/                # gRPC client stubs per service
│   ├── menus/                # Interactive CLI menus per service
│   └── utils/
│       ├── display.js        # Table renderers, formatRupiah, warna P&L
│       └── streamHandler.js  # Stream lifecycle helpers
│
├── seeds/
│   └── prices.json           # Harga awal 5 ticker IDX
├── test_quick.js             # Automated test suite (23 tests)
└── package.json
```

---

## Cara Menjalankan

### Prerequisites
- Node.js v18+
- `npm install` (di folder `bursagrpc/`)

### 1. Start Server
```bash
npm run server
# atau: node server/index.js
```

Output startup:
```
═══════════════════════════════════════════════════
  🏛️  BursaGRPC — Virtual Stock Exchange Server
═══════════════════════════════════════════════════
  Port:     50051
  Services: AccountService, TradingService, MarketService

📈 Market Prices (Seed):
   BBCA   Rp    9.250  (Bank Central Asia)
   TLKM   Rp    3.940  (Telkom Indonesia)
   ...

✅ Server ready. Waiting for connections...
```

### 2. Start Client (terminal baru)
```bash
npm run client
# atau: node client/index.js
```

### 3. Demo Multi-Client (4 Terminal)

| Terminal | Perintah | Role |
|----------|----------|------|
| T1 | `npm run server` | Exchange Server |
| T2 | `npm run client` | Market Watcher (WatchMarket) |
| T3 | `npm run client` | Trader A |
| T4 | `npm run client` | Trader B |

**Skenario Demo:**
1. T3: Register → Trader A (Rp 100.000.000 virtual)
2. T4: Register → Trader B
3. T2: Market → Watch Market (stream harga real-time)
4. T3: Trading → Place Order BUY BBCA 100 lot LIMIT @ 9.100
5. T4: Trading → Place Order SELL BBCA 100 lot LIMIT @ 9.100 → **MATCH!**
6. T2: Harga BBCA langsung update di stream
7. T3: Trading → Batch Place Orders (demo client-side streaming)
8. T3: Market → Stream Trade → ketik `ping` → `PONG` (demo bidi streaming)
9. T4: Market → Watch Leaderboard (lihat ranking real-time)

### 4. Run Automated Tests
```bash
node test_quick.js
# Expected: 23 passed, 0 failed
```

---

## gRPC Services

### AccountService
| Method | Type | Deskripsi |
|--------|------|-----------|
| `Register` | Unary | Daftar trader baru, dapat Rp 100.000.000 virtual |
| `GetLogin` | Unary | Resume session dengan nama (tanpa register ulang) |
| `GetBalance` | Unary | Cash + portfolio value + total equity |
| `GetTradeHistory` | Unary | Riwayat transaksi dengan pagination |
| `GetPerformance` | Unary | Return rate %, win rate, best & worst trade P&L |

### TradingService
| Method | Type | Deskripsi |
|--------|------|-----------|
| `PlaceOrder` | Unary | Submit order LIMIT atau MARKET (BUY/SELL) |
| `CancelOrder` | Unary | Batalkan order OPEN, refund saldo BUY |
| `GetPortfolio` | Unary | Daftar saham dimiliki + unrealized P&L |
| `GetOrderBook` | Unary | Top bid/ask per ticker + spread |
| `BatchPlaceOrders` | **Client Streaming** | Algorithmic trader kirim banyak order sekaligus |

### MarketService
| Method | Type | Deskripsi |
|--------|------|-----------|
| `GetStockInfo` | Unary | Harga, OHLCV, bid/ask satu ticker |
| `WatchMarket` | **Server Streaming** | Harga real-time push ke semua subscriber |
| `WatchLeaderboard` | **Server Streaming** | Ranking trader update setiap 5 detik |
| `StreamTrade` | **Bi-directional Streaming** | Live trading session: order, cancel, ping |

---

## Error Handling

| Skenario | gRPC Status Code |
|----------|-----------------|
| Trader belum Register mencoba transaksi | `UNAUTHENTICATED` |
| Saldo tidak cukup untuk BUY | `FAILED_PRECONDITION` |
| Saham tidak cukup untuk SELL | `FAILED_PRECONDITION` |
| Harga LIMIT ≤ 0 atau quantity ≤ 0 | `INVALID_ARGUMENT` |
| Order ID tidak ditemukan saat cancel | `NOT_FOUND` |
| Cancel order milik trader lain | `PERMISSION_DENIED` |
| Ticker tidak dikenal | `NOT_FOUND` |
| Nama trader sudah terdaftar | `ALREADY_EXISTS` |
| Internal error matching engine | `INTERNAL` |

---

## Fitur Tambahan (Diferensiasi)

- **Order Matching Engine** — Price-Time Priority (FIFO), standar bursa saham nyata
- **LIMIT + MARKET Order** — Dua mekanisme order yang berbeda
- **Volatility Noise** — Harga bergerak halus dengan random noise ±0.1%
- **Market Maker Bot** — Server pasang bid/ask otomatis setiap 3 detik agar pasar selalu likuid
- **Cross-service notifications** — PlaceOrder Unary otomatis kirim fill notification ke StreamTrade bidi session aktif
- **GetLogin** — Resume session tanpa register ulang
- **Performance Analytics** — Return rate, win rate, best & worst trade P&L per trader
