# BursaGRPC — Virtual Stock Exchange Simulator
### Paper Trading Platform Berbasis Komunikasi gRPC
> Simulasi transaksi saham berbasis gRPC untuk edukasi investor dan pengujian strategi trading tanpa risiko finansial

---

## Daftar Isi
1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Tujuan & Scope](#2-tujuan--scope)
3. [Arsitektur Sistem](#3-arsitektur-sistem)
4. [Desain Services & Protocol Buffers](#4-desain-services--protocol-buffers)
5. [Algoritma Inti](#5-algoritma-inti)
6. [Error Handling](#6-error-handling)
7. [Struktur Direktori](#7-struktur-direktori)
8. [Rencana Implementasi](#8-rencana-implementasi)
9. [Pembagian Tugas Kelompok](#9-pembagian-tugas-kelompok)
10. [Skenario Demo & Testing](#10-skenario-demo--testing)
11. [Tech Stack & Dependencies](#11-tech-stack--dependencies)
12. [Data Seed — Harga Awal Saham](#12-data-seed--harga-awal-saham)
13. [Pemetaan Requirement Tugas](#13-pemetaan-requirement-tugas)

---

## 1. Ringkasan Eksekutif

BursaGRPC adalah platform **paper trading** berbasis gRPC yang mensimulasikan mekanisme bursa saham nyata. Platform ini memungkinkan beberapa trader (client) untuk bertransaksi saham secara real-time tanpa risiko finansial. Server berperan sebagai **matching engine** yang memproses order, mempertemukan buyer-seller, dan menyiarkan perubahan harga ke seluruh client yang terhubung.

Proyek ini dipilih karena relevansi industrinya — paper trading adalah kategori produk nyata yang dipakai Stockbit, TradingView, dan Investopedia — sekaligus mampu mendemonstrasikan **seluruh spektrum komunikasi gRPC** (Unary, Server-side Streaming, Client-side Streaming, dan Bi-directional Streaming) dalam satu sistem yang koheren.

### Poin Kunci Diferensiasi
- ✅ Mengimplementasikan **keempat** pola komunikasi gRPC (melampaui requirement minimum 1 streaming)
- ✅ **Order Matching Engine** otomatis dengan logika Price-Time Priority
- ✅ Harga saham bergerak **dinamis** berdasarkan supply & demand nyata dari transaksi
- ✅ **Market Maker Bot** bawaan agar pasar tetap likuid dan aktif
- ✅ Ticker saham IDX nyata: **BBCA, TLKM, GOTO, ASII, BMRI**
- ✅ Leaderboard real-time dan performance analytics per trader

---

## 2. Tujuan & Scope

### 2.1 Tujuan Akademik
- Mengimplementasikan komunikasi antar-layanan menggunakan protokol gRPC dengan Node.js
- Mendemonstrasikan keempat pola komunikasi gRPC dalam satu sistem terintegrasi
- Mensimulasikan mekanisme order matching yang digunakan di bursa saham nyata
- Mengelola state multi-client secara concurrent di sisi server menggunakan in-memory data structures
- Mengimplementasikan error handling yang robust dengan gRPC status codes standar

### 2.2 Scope Implementasi

| Kode | Fitur | Prioritas |
|------|-------|-----------|
| F-01 | Register & manajemen akun trader | 🔴 Wajib |
| F-02 | PlaceOrder & CancelOrder (Unary gRPC) | 🔴 Wajib |
| F-03 | WatchMarket — Server-side Streaming harga real-time | 🔴 Wajib |
| F-04 | Order Matching Engine otomatis | 🔴 Wajib |
| F-05 | Portfolio & saldo management per client | 🔴 Wajib |
| F-06 | Error handling dengan gRPC status codes | 🔴 Wajib |
| F-07 | BatchPlaceOrders — Client-side Streaming | 🟡 Bonus |
| F-08 | StreamTrade — Bi-directional Streaming | 🟡 Bonus |
| F-09 | Market Maker Bot otomatis | 🟡 Bonus |
| F-10 | WatchLeaderboard — Leaderboard real-time | 🟡 Bonus |
| F-11 | GetPerformance — analytics return rate & win rate | 🟡 Bonus |
| F-12 | Terminal UI dengan chalk + cli-table3 | 🟡 Bonus |

---

## 3. Arsitektur Sistem

### 3.1 Gambaran Arsitektur

BursaGRPC menggunakan arsitektur client-server di mana server berperan sebagai central exchange engine. Tiga service gRPC — AccountService, TradingService, dan MarketService — diekspos oleh satu server Node.js dan dikonsumsi oleh satu atau lebih client CLI secara concurrent. Seluruh state (order book, portfolio, harga) disimpan **in-memory** di server menggunakan native JavaScript `Map` dan `Array`.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           BURSAGRPC SERVER                               │
│                                                                          │
│  ┌────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ AccountService │  │  TradingService  │  │     MarketService        │  │
│  │                │  │                  │  │                          │  │
│  │ Register       │  │ PlaceOrder       │  │ GetStockInfo             │  │
│  │ GetBalance     │  │ CancelOrder      │  │ WatchMarket ──► stream   │  │
│  │ GetTradeHistory│  │ GetPortfolio     │  │ WatchLeaderboard ► stream│  │
│  │ GetPerformance │  │ GetOrderBook     │  │ StreamTrade ◄──► bidi    │  │
│  └────────┬───────┘  │ BatchPlaceOrders │  └───────────┬──────────────┘  │
│           │          └────────┬─────────┘              │                 │
│  ─────────┴──────────────────┴────────────────────────┴───────────────  │
│                         IN-MEMORY STATE ENGINE                           │
│   users: Map<id,User>    orderBook: Map<ticker,{bids[],asks[]}>         │
│   portfolios: Map         trades: []    prices: Map    subscribers: Set  │
│                      ▲ Order Matching Engine ▲                           │
│                      │  Market Maker Bot (setInterval)                   │
└──────────────────────┼───────────────────────────────────────────────── ┘
       ▲ Unary          │ Server Streaming           ▲ Bidi / Client Stream
  ┌────┴────┐      ┌────┴────┐                  ┌────┴────┐
  │Client A │      │Client B │                  │Client C │
  │(Trader) │      │(Trader) │                  │(Algo    │
  └─────────┘      └─────────┘                  │ Trader) │
                                                └─────────┘
```

### 3.2 Pola Komunikasi gRPC yang Digunakan

| Pola | Method | Deskripsi | Kapan Dipakai |
|------|--------|-----------|---------------|
| **Unary** | Register, PlaceOrder, GetPortfolio, dll | Request satu kali, response satu kali | Semua transaksi point-in-time |
| **Server-side Streaming** | WatchMarket, WatchLeaderboard | Client subscribe, server push data terus-menerus | Live feed harga & ranking |
| **Client-side Streaming** | BatchPlaceOrders | Client kirim banyak pesan, server jawab sekali di akhir | Algorithmic trader kirim banyak order |
| **Bi-directional Streaming** | StreamTrade | Kedua pihak kirim-terima pesan secara bebas | Live trading session interaktif |

### 3.3 Alur Request — PlaceOrder sampai Broadcast

```
Client (Trader A)         Server                    Client (Trader B)
       │                     │                             │
       │  PlaceOrder(BUY)    │                             │
       │────────────────────>│                             │
       │                     │ 1. Validasi trader & saldo  │
       │                     │ 2. Jalankan matching engine │
       │                     │ 3. Cek order book SELL side │
       │                     │ 4. Match! Update portfolio  │
       │  OrderResponse       │    kedua trader             │
       │<────────────────────│ 5. Update harga saham       │
       │  (FILLED/OPEN)      │ 6. Broadcast ke subscribers │
       │                     │─────────────────────────── >│
       │                     │   MarketUpdate (stream)     │
       │                     │ (semua client WatchMarket)  │
```

### 3.4 State Machine Order

```
                    ┌──────────────────┐
                    │     PENDING      │  ← PlaceOrder masuk, validasi lulus
                    └────────┬─────────┘
              ┌──────────────┼────────────────────┐
         ada match      tidak ada match        CancelOrder
              │                │                   │
              ▼                ▼                   ▼
       ┌──────────┐     ┌──────────────┐    ┌──────────────┐
       │ PARTIALLY│     │     OPEN     │    │  CANCELLED   │
       │  FILLED  │     │ (di orderbook│    └──────────────┘
       └────┬─────┘     │  menunggu)   │
            │           └──────┬───────┘
       semua lot filled        │ match penuh / cancel
            │                  │
            └──────────────────▼
                         ┌──────────┐
                         │  FILLED  │  ← selesai, portfolio diupdate
                         └──────────┘
```

---

## 4. Desain Services & Protocol Buffers

### 4.1 AccountService

Menangani semua operasi identitas dan finansial trader. Client **harus Register dahulu** sebelum bisa melakukan transaksi apapun.

| Method | Type | Input | Output & Deskripsi |
|--------|------|-------|-------------------|
| `Register` | Unary | name, starting_balance | trader_id, saldo awal. Gagal jika nama sudah ada. |
| `GetBalance` | Unary | trader_id | cash_balance, portfolio_value, total_equity |
| `GetTradeHistory` | Unary | trader_id, limit, offset | List transaksi: ticker, side, qty, price, timestamp |
| `GetPerformance` | Unary | trader_id | return_rate_pct, win_rate_pct, total_trades, best_trade_pnl |

```protobuf
// proto/account.proto
syntax = "proto3";

message RegisterRequest  { string name = 1; double starting_balance = 2; }
message RegisterResponse { string trader_id = 1; double balance = 2; string message = 3; }

message BalanceRequest  { string trader_id = 1; }
message BalanceResponse {
  double cash_balance     = 1;
  double portfolio_value  = 2;
  double total_equity     = 3;
}

message PerformanceRequest  { string trader_id = 1; }
message PerformanceResponse {
  double return_rate_pct  = 1;
  double win_rate_pct     = 2;
  int32  total_trades     = 3;
  double best_trade_pnl   = 4;
}

message TradeHistoryRequest  { string trader_id = 1; int32 limit = 2; int32 offset = 3; }
message TradeRecord {
  string ticker    = 1; string side  = 2;
  int32  quantity  = 3; double price = 4; int64 timestamp = 5;
}
message TradeHistoryResponse { repeated TradeRecord trades = 1; }

service AccountService {
  rpc Register        (RegisterRequest)     returns (RegisterResponse);
  rpc GetBalance      (BalanceRequest)      returns (BalanceResponse);
  rpc GetTradeHistory (TradeHistoryRequest) returns (TradeHistoryResponse);
  rpc GetPerformance  (PerformanceRequest)  returns (PerformanceResponse);
}
```

---

### 4.2 TradingService

Jantung sistem — semua transaksi jual-beli saham diproses di sini. `PlaceOrder` memicu matching engine secara sinkron; hasilnya dikirim ke client sekaligus di-broadcast ke semua subscriber `WatchMarket`.

| Method | Type | Input | Output & Deskripsi |
|--------|------|-------|-------------------|
| `PlaceOrder` | Unary | trader_id, ticker, side, qty, price, type | order_id, status (FILLED/OPEN/PARTIAL), avg_fill_price |
| `CancelOrder` | Unary | trader_id, order_id | success, refunded_amount |
| `GetPortfolio` | Unary | trader_id | List holding: ticker, qty, avg_cost, current_price, pnl_pct |
| `GetOrderBook` | Unary | ticker, depth | Top N bid/ask: price, qty, order_count |
| `BatchPlaceOrders` | **Client Streaming** | stream OrderRequest | Summary: total submitted, filled, rejected |

```protobuf
// proto/trading.proto
syntax = "proto3";

enum OrderSide   { BUY = 0; SELL = 1; }
enum OrderType   { LIMIT = 0; MARKET = 1; }
enum OrderStatus { PENDING = 0; OPEN = 1; PARTIALLY_FILLED = 2; FILLED = 3; CANCELLED = 4; }

message OrderRequest {
  string    trader_id = 1;
  string    ticker    = 2;  // BBCA | TLKM | GOTO | ASII | BMRI
  OrderSide side      = 3;
  int32     quantity  = 4;
  double    price     = 5;  // diabaikan jika type = MARKET
  OrderType type      = 6;
}

message OrderResponse {
  string      order_id        = 1;
  OrderStatus status          = 2;
  int32       filled_qty      = 3;
  double      avg_fill_price  = 4;
  string      message         = 5;
}

message CancelRequest  { string trader_id = 1; string order_id = 2; }
message CancelResponse { bool success = 1; double refunded_amount = 2; string message = 3; }

message PortfolioRequest { string trader_id = 1; }
message Holding {
  string ticker        = 1; int32 quantity     = 2;
  double avg_cost      = 3; double current_price = 4;
  double pnl_pct       = 5; double pnl_amount  = 6;
}
message PortfolioResponse { repeated Holding holdings = 1; double total_value = 2; }

message OrderBookRequest  { string ticker = 1; int32 depth = 2; }
message OrderBookLevel    { double price = 1; int32 quantity = 2; int32 order_count = 3; }
message OrderBookResponse { repeated OrderBookLevel bids = 1; repeated OrderBookLevel asks = 2; }

message BatchResponse { int32 total = 1; int32 filled = 2; int32 open = 3; int32 rejected = 4; }

service TradingService {
  rpc PlaceOrder       (OrderRequest)  returns (OrderResponse);
  rpc CancelOrder      (CancelRequest) returns (CancelResponse);
  rpc GetPortfolio     (PortfolioRequest)  returns (PortfolioResponse);
  rpc GetOrderBook     (OrderBookRequest)  returns (OrderBookResponse);
  rpc BatchPlaceOrders (stream OrderRequest) returns (BatchResponse); // Client-side Streaming
}
```

---

### 4.3 MarketService

Menyediakan akses ke data pasar dan mengelola streaming koneksi real-time. `WatchMarket` adalah tulang punggung pengalaman trading — semua subscriber menerima update harga setiap kali transaksi terjadi.

| Method | Type | Input | Output & Deskripsi |
|--------|------|-------|-------------------|
| `GetStockInfo` | Unary | ticker | price, open, high, low, volume, change_pct |
| `WatchMarket` | **Server Streaming** | tickers[] (filter opsional) | stream MarketUpdate: ticker, price, bid, ask, volume, timestamp |
| `WatchLeaderboard` | **Server Streaming** | top_n | stream ranking: trader_name, total_equity, return_pct |
| `StreamTrade` | **Bidi Streaming** | stream TradeAction | stream TradeEvent: konfirmasi, fill notif, price alert |

```protobuf
// proto/market.proto
syntax = "proto3";

message StockRequest  { string ticker = 1; }
message StockResponse {
  string ticker      = 1; double price  = 2; double open   = 3;
  double high        = 4; double low    = 5; int64  volume  = 6;
  double change_pct  = 7;
}

message WatchRequest  { repeated string tickers = 1; } // kosong = subscribe semua
message MarketUpdate  {
  string ticker     = 1; double price      = 2;
  double bid        = 3; double ask        = 4;
  int64  volume     = 5; double change_pct = 6;
  int64  timestamp  = 7;
}

message LeaderboardRequest { int32 top_n = 1; }
message LeaderboardEntry   { int32 rank = 1; string trader_name = 2; double total_equity = 3; double return_pct = 4; }
message LeaderboardUpdate  { repeated LeaderboardEntry entries = 1; int64 timestamp = 2; }

message TradeAction {
  string action_type = 1; // PLACE_ORDER | CANCEL_ORDER | PRICE_ALERT | PING
  OrderRequest order = 2; // diisi jika PLACE_ORDER
  string order_id    = 3; // diisi jika CANCEL_ORDER
  double alert_price = 4; // diisi jika PRICE_ALERT
}
message TradeEvent {
  string event_type = 1; // ORDER_CONFIRMED | ORDER_FILLED | PRICE_HIT | PONG | ERROR
  string order_id   = 2;
  double fill_price = 3;
  string message    = 4;
}

service MarketService {
  rpc GetStockInfo      (StockRequest)       returns (StockResponse);
  rpc WatchMarket       (WatchRequest)       returns (stream MarketUpdate);    // Server-side Streaming
  rpc WatchLeaderboard  (LeaderboardRequest) returns (stream LeaderboardUpdate); // Server-side Streaming
  rpc StreamTrade       (stream TradeAction) returns (stream TradeEvent);      // Bi-directional Streaming
}
```

---

## 5. Algoritma Inti

### 5.1 Order Matching Engine

Menggunakan algoritma **Price-Time Priority (FIFO)** — standar yang dipakai bursa saham nyata. Order dengan harga terbaik diprioritaskan; jika harga sama, order yang masuk lebih awal dieksekusi duluan.

```javascript
// server/engine/matcher.js

function matchOrder(newOrder, state) {
  const book     = state.orderBook[newOrder.ticker];
  const opposite = newOrder.side === 'BUY' ? book.asks : book.bids;

  // asks diurutkan ASC (terendah dulu), bids diurutkan DESC (tertinggi dulu)
  const canMatch = (restingOrder) =>
    newOrder.side === 'BUY'
      ? restingOrder.price <= newOrder.price  // buyer mau bayar >= ask
      : restingOrder.price >= newOrder.price; // seller mau terima <= bid

  let filledQty  = 0;
  let totalValue = 0;
  const fills    = [];

  while (newOrder.remainingQty > 0 && opposite.length > 0 && canMatch(opposite[0])) {
    const resting  = opposite[0];
    const execQty  = Math.min(newOrder.remainingQty, resting.remainingQty);
    const execPrice = resting.price; // harga dari resting order (price improvement)

    // update sisa qty
    newOrder.remainingQty  -= execQty;
    resting.remainingQty   -= execQty;
    filledQty  += execQty;
    totalValue += execQty * execPrice;

    fills.push({ qty: execQty, price: execPrice, counterpartyId: resting.traderId });

    // update portfolio & saldo kedua trader
    updatePortfolio(newOrder.traderId,  newOrder.side,                    execQty, execPrice, newOrder.ticker, state);
    updatePortfolio(resting.traderId,   newOrder.side === 'BUY' ? 'SELL' : 'BUY', execQty, execPrice, newOrder.ticker, state);

    // hapus resting order jika fully filled
    if (resting.remainingQty === 0) opposite.shift();
  }

  // hitung harga eksekusi rata-rata dan update market price
  if (filledQty > 0) {
    const avgPrice = totalValue / filledQty;
    updateMarketPrice(newOrder.ticker, avgPrice, filledQty, state);
    broadcastMarketUpdate(newOrder.ticker, state); // push ke semua WatchMarket subscribers
  }

  // sisa order masuk ke order book jika bukan MARKET order
  if (newOrder.remainingQty > 0 && newOrder.type !== 'MARKET') {
    insertToOrderBook(newOrder, state);
  }

  // tentukan status akhir
  const status = filledQty === 0           ? 'OPEN'
               : newOrder.remainingQty > 0 ? 'PARTIALLY_FILLED'
               : 'FILLED';

  return { status, filledQty, avgFillPrice: filledQty > 0 ? totalValue / filledQty : 0, fills };
}
```

### 5.2 Update Portfolio

```javascript
// server/state/portfolio.js

function updatePortfolio(traderId, side, qty, price, ticker, state) {
  const trader    = state.users.get(traderId);
  const portfolio = state.portfolios.get(traderId);

  if (side === 'BUY') {
    const cost = qty * price;
    trader.cash -= cost; // kurangi saldo

    // update holding: average cost menggunakan weighted average
    const holding = portfolio.get(ticker) || { qty: 0, avgCost: 0 };
    const totalQty   = holding.qty + qty;
    const totalCost  = holding.qty * holding.avgCost + cost;
    portfolio.set(ticker, { qty: totalQty, avgCost: totalCost / totalQty });

  } else { // SELL
    const proceeds = qty * price;
    trader.cash += proceeds; // tambah saldo

    const holding = portfolio.get(ticker);
    holding.qty  -= qty;
    if (holding.qty === 0) portfolio.delete(ticker);
    else portfolio.set(ticker, holding);
  }

  // catat ke trade history
  state.tradeHistory.get(traderId).push({ ticker, side, qty, price, timestamp: Date.now() });
}
```

### 5.3 Market Maker Bot

Secara periodik memasang bid & ask di sekitar harga saat ini agar pasar selalu likuid.

```javascript
// server/bot/marketMaker.js

const TICKERS  = ['BBCA', 'TLKM', 'GOTO', 'ASII', 'BMRI'];
const SPREAD   = 0.002; // 0.2% spread dari harga tengah
const LOT_SIZE = 100;   // 1 lot = 100 lembar saham
const BOT_ID   = 'MARKET_MAKER_BOT';

function startMarketMaker(state) {
  setInterval(() => {
    TICKERS.forEach(ticker => {
      const price    = state.prices.get(ticker).current;
      const bidPrice = Math.round(price * (1 - SPREAD));
      const askPrice = Math.round(price * (1 + SPREAD));

      // pasang order beli dari bot (menjaga ada yang mau beli)
      const buyOrder  = { traderId: BOT_ID, ticker, side: 'BUY',  price: bidPrice, quantity: LOT_SIZE, type: 'LIMIT', remainingQty: LOT_SIZE };
      // pasang order jual dari bot (menjaga ada yang mau jual)
      const sellOrder = { traderId: BOT_ID, ticker, side: 'SELL', price: askPrice, quantity: LOT_SIZE, type: 'LIMIT', remainingQty: LOT_SIZE };

      insertToOrderBook(buyOrder, state);
      insertToOrderBook(sellOrder, state);
    });
  }, 3000); // refresh tiap 3 detik
}
```

### 5.4 In-Memory State Design

```javascript
// server/state/store.js — struktur lengkap seluruh state server

const state = {

  // ── AKUN ──────────────────────────────────────────────────────
  users: new Map(),
  // Map<trader_id: string, { name: string, cash: number, createdAt: number }>

  portfolios: new Map(),
  // Map<trader_id, Map<ticker, { qty: number, avgCost: number }>>

  tradeHistory: new Map(),
  // Map<trader_id, Array<{ ticker, side, qty, price, timestamp }>>

  // ── ORDER BOOK ─────────────────────────────────────────────────
  orderBook: {
    BBCA: { bids: [], asks: [] }, // bids: DESC by price, asks: ASC by price
    TLKM: { bids: [], asks: [] },
    GOTO: { bids: [], asks: [] },
    ASII: { bids: [], asks: [] },
    BMRI: { bids: [], asks: [] },
  },

  orders: new Map(),
  // Map<order_id, { traderId, ticker, side, type, quantity, price, remainingQty, status, createdAt }>

  // ── PASAR ──────────────────────────────────────────────────────
  prices: new Map(),
  // Map<ticker, { current, open, high, low, volume, lastUpdated }>

  // ── STREAMING SUBSCRIBERS ──────────────────────────────────────
  marketSubscribers:      new Set(), // Set<grpc.ServerWritableStream>
  leaderboardSubscribers: new Set(), // Set<grpc.ServerWritableStream>
  bidiSessions:           new Map(), // Map<trader_id, grpc.ServerDuplexStream>
};
```

---

## 6. Error Handling

Semua error dikomunikasikan menggunakan gRPC status codes standar.

| Skenario Error | Service | gRPC Status Code |
|----------------|---------|-----------------|
| Client belum Register mencoba transaksi | TradingService | `UNAUTHENTICATED` |
| Saldo tidak cukup untuk order beli | TradingService | `FAILED_PRECONDITION` |
| Jumlah saham tidak cukup untuk order jual | TradingService | `FAILED_PRECONDITION` |
| Harga order ≤ 0 atau negatif | TradingService | `INVALID_ARGUMENT` |
| Quantity order ≤ 0 | TradingService | `INVALID_ARGUMENT` |
| Order ID tidak ditemukan saat cancel | TradingService | `NOT_FOUND` |
| Ticker saham tidak dikenal | MarketService | `NOT_FOUND` |
| Cancel order milik trader lain | TradingService | `PERMISSION_DENIED` |
| Nama trader sudah terdaftar saat Register | AccountService | `ALREADY_EXISTS` |
| Internal error di matching engine | All | `INTERNAL` |

```javascript
// Contoh implementasi error handling di TradingService
function placeOrder(call, callback) {
  const { trader_id, ticker, quantity, price, side } = call.request;

  // 1. Cek autentikasi
  if (!state.users.has(trader_id))
    return callback({
      code: grpc.status.UNAUTHENTICATED,
      message: 'Trader belum terdaftar. Silakan Register terlebih dahulu.'
    });

  // 2. Cek ticker valid
  if (!state.orderBook[ticker])
    return callback({
      code: grpc.status.NOT_FOUND,
      message: `Ticker '${ticker}' tidak ditemukan. Pilih: BBCA, TLKM, GOTO, ASII, BMRI.`
    });

  // 3. Validasi argumen
  if (price <= 0 || quantity <= 0)
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Harga dan quantity harus lebih besar dari 0.'
    });

  // 4. Cek saldo/saham cukup
  const trader = state.users.get(trader_id);
  if (side === 'BUY' && trader.cash < price * quantity)
    return callback({
      code: grpc.status.FAILED_PRECONDITION,
      message: `Saldo tidak cukup. Dibutuhkan: ${price * quantity}, Tersedia: ${trader.cash}`
    });

  if (side === 'SELL') {
    const holding = state.portfolios.get(trader_id)?.get(ticker);
    if (!holding || holding.qty < quantity)
      return callback({
        code: grpc.status.FAILED_PRECONDITION,
        message: `Saham tidak cukup. Dibutuhkan: ${quantity}, Dimiliki: ${holding?.qty ?? 0}`
      });
  }

  // 5. Proses order — aman untuk dijalankan
  try {
    const result = matchOrder({ trader_id, ticker, side, quantity, price, ... }, state);
    callback(null, result);
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: 'Terjadi kesalahan internal server.' });
  }
}
```

---

## 7. Struktur Direktori

```
bursagrpc/
├── proto/                           ← Definisi .proto (source of truth)
│   ├── account.proto
│   ├── trading.proto
│   └── market.proto
│
├── server/
│   ├── index.js                     ← Entry point, bind semua service ke grpc.Server
│   ├── config.js                    ← PORT, ticker list, starting balance
│   │
│   ├── state/                       ← In-memory state management
│   │   ├── store.js                 ← Central state object + initializer
│   │   ├── orderBook.js             ← insertBid, insertAsk, bestBid, bestAsk, removeOrder
│   │   └── portfolio.js             ← updatePortfolio, calculatePnL, getEquity
│   │
│   ├── engine/                      ← Core business logic
│   │   ├── matcher.js               ← Price-Time Priority matching engine
│   │   ├── priceEngine.js           ← updateMarketPrice, calculateChangePercent
│   │   └── broadcaster.js           ← broadcastMarketUpdate, pushToLeaderboardSubs
│   │
│   ├── bot/
│   │   └── marketMaker.js           ← Market maker bot (setInterval)
│   │
│   └── services/                    ← gRPC service handler implementations
│       ├── accountService.js        ← Register, GetBalance, GetTradeHistory, GetPerformance
│       ├── tradingService.js        ← PlaceOrder, CancelOrder, GetPortfolio, GetOrderBook, BatchPlaceOrders
│       └── marketService.js         ← GetStockInfo, WatchMarket, WatchLeaderboard, StreamTrade
│
├── client/
│   ├── index.js                     ← Entry point CLI, main menu loop
│   ├── config.js                    ← Server address (localhost:50051)
│   │
│   ├── stubs/                       ← gRPC client stubs (satu per service)
│   │   ├── accountStub.js
│   │   ├── tradingStub.js
│   │   └── marketStub.js
│   │
│   ├── menus/                       ← CLI navigation & user interaction
│   │   ├── mainMenu.js              ← Login / Register
│   │   ├── tradingMenu.js           ← PlaceOrder, CancelOrder, Portfolio
│   │   ├── marketMenu.js            ← WatchMarket, GetOrderBook, GetStockInfo
│   │   └── accountMenu.js           ← Balance, History, Performance
│   │
│   └── utils/
│       ├── display.js               ← Table formatter, currency format (Rupiah), color
│       └── streamHandler.js         ← Handle streaming response dari server
│
├── seeds/
│   └── prices.json                  ← Harga awal BBCA, TLKM, GOTO, ASII, BMRI
│
├── package.json
└── README.md
```

---

## 8. Rencana Implementasi

### 8.1 Fase Pengembangan

| Fase | Nama | Deliverable | Estimasi |
|------|------|-------------|----------|
| **1** | Foundation | Setup project, proto files, AccountService lengkap, server & client boilerplate | Hari 1–2 |
| **2** | Core Trading | TradingService + matching engine + order book | Hari 3–5 |
| **3** | Streaming | WatchMarket, WatchLeaderboard, BatchPlaceOrders, StreamTrade | Hari 6–8 |
| **4** | Enhancement | Market maker bot, GetPerformance, seed data | Hari 9–10 |
| **5** | Polish & Testing | CLI UI, error handling lengkap, multi-client demo, bug fix | Hari 11–14 |

---

### 8.2 Checklist Implementasi Per Fase

#### ✅ Fase 1 — Foundation
- [ ] `npm init`, install `@grpc/grpc-js`, `@grpc/proto-loader`, `chalk`, `cli-table3`
- [ ] Buat `proto/account.proto`, `proto/trading.proto`, `proto/market.proto`
- [ ] Setup `server/index.js`: inisialisasi `grpc.Server`, `addService` untuk ketiga service
- [ ] Implementasi `server/state/store.js` dengan seed data dari `seeds/prices.json`
- [ ] Implementasi `AccountService`: `Register`, `GetBalance`, `GetTradeHistory`, `GetPerformance`
- [ ] Buat `client/index.js` dengan main menu dan AccountService stubs
- [ ] **Test**: Register 2 client berbeda, `GetBalance`, `GetTradeHistory`

#### ✅ Fase 2 — Core Trading
- [ ] Implementasi `server/state/orderBook.js`: `insertBid`, `insertAsk`, `bestBid`, `bestAsk`, `removeOrder`
- [ ] Implementasi `server/engine/matcher.js`: `matchOrder` dengan Price-Time Priority
- [ ] Implementasi `server/state/portfolio.js`: `updateHolding`, `calculatePnL`, `getEquity`
- [ ] Implementasi `TradingService.PlaceOrder`: validasi → match → update state → response
- [ ] Implementasi `TradingService.CancelOrder`: cek kepemilikan → hapus dari order book → refund
- [ ] Implementasi `TradingService.GetPortfolio`: aggregate holdings dengan harga terkini
- [ ] Implementasi `TradingService.GetOrderBook`: ambil top N bid/ask dari order book
- [ ] **Test**: 2 terminal berbeda, PlaceOrder BUY & SELL yang cocok → lihat portfolio update

#### ✅ Fase 3 — Streaming
- [ ] Implementasi `server/engine/broadcaster.js`: simpan Set subscriber, push ke semua stream aktif
- [ ] Implementasi `MarketService.WatchMarket` (Server Streaming): subscribe, clean up saat client disconnect
- [ ] Integrate `broadcaster.js` ke `matcher.js`: setiap match → `broadcastMarketUpdate()`
- [ ] Implementasi `MarketService.WatchLeaderboard` (Server Streaming): sort by equity, push tiap 5 detik
- [ ] Implementasi `TradingService.BatchPlaceOrders` (Client Streaming): terima stream, proses satu per satu, balas summary di akhir
- [ ] Implementasi `MarketService.StreamTrade` (Bi-directional): terima `TradeAction`, balas `TradeEvent` per action
- [ ] **Test**: 3 terminal — satu `WatchMarket`, dua trader transaksi → lihat harga update real-time

#### ✅ Fase 4 — Enhancement
- [ ] Implementasi `server/bot/marketMaker.js` dengan `setInterval` setiap 3 detik
- [ ] Tambahkan seed prices di `seeds/prices.json` (BBCA: 9250, TLKM: 3940, GOTO: 68, ASII: 4550, BMRI: 5200)
- [ ] Implementasi `GetPerformance`: hitung `return_rate_pct` dan `win_rate_pct` dari trade history
- [ ] Tambahkan `priceEngine.js`: update high/low/volume setiap kali ada transaksi

#### ✅ Fase 5 — Polish & Testing
- [ ] Polish CLI: warna merah/hijau untuk P&L, tabel portofolio, animasi loading stream
- [ ] Pastikan semua error case mengembalikan gRPC status code yang tepat
- [ ] Test client disconnect saat streaming aktif → server tidak crash
- [ ] Demo multi-client: buka 4 terminal bersamaan (server + watcher + 2 trader)
- [ ] Finalisasi README dengan cara menjalankan project

---

## 9. Pembagian Tugas Kelompok

> Pembagian ini dirancang agar setiap anggota memiliki tanggung jawab **end-to-end** (proto + server service + client menu) sehingga semua anggota memahami seluruh stack, bukan hanya satu lapisan.

| Anggota | Area Utama | Tanggung Jawab |
|---------|------------|----------------|
| **Anggota 1** | AccountService + State | `proto/account.proto`, `accountService.js`, `store.js`, `portfolio.js`, `client/menus/accountMenu.js` |
| **Anggota 2** | TradingService + Engine | `proto/trading.proto`, `tradingService.js`, `matcher.js`, `orderBook.js`, `client/menus/tradingMenu.js` |
| **Anggota 3** | MarketService + Streaming | `proto/market.proto`, `marketService.js`, `broadcaster.js`, `marketMaker.js`, `client/menus/marketMenu.js` |
| **Semua** | CLI Client + Integration | `client/index.js`, `utils/display.js`, integration testing, demo script, README final |

### Catatan Koordinasi
- **`server/state/store.js` adalah shared file** — sepakati strukturnya di Fase 1 sebelum anggota lain mulai coding
- Gunakan Git branching: satu branch per service, merge ke `main` hanya setelah unit test lulus
- **Definisi `.proto` adalah kontrak** — jangan ubah field yang sudah ada tanpa diskusi semua anggota
- Integration test dilakukan bersama di Fase 5 dengan minimal 4 terminal terbuka bersamaan

---

## 10. Skenario Demo & Testing

### 10.1 Setup Demo (4 Terminal)

Siapkan 4 terminal bersamaan untuk mendemonstrasikan multi-client dan semua tipe streaming:

| Terminal | Role | Aksi |
|----------|------|------|
| **Terminal 1** | Server | `node server/index.js` — tampilkan log setiap transaksi & matching |
| **Terminal 2** | Market Watcher | `WatchMarket` aktif — harga update real-time setiap ada transaksi |
| **Terminal 3** | Trader A (Budi) | Register → GetBalance → PlaceOrder → GetPortfolio |
| **Terminal 4** | Trader B (Sari) | Register → PlaceOrder yang cocok → match terjadi → harga update di T2 |

### 10.2 Urutan Demo yang Direkomendasikan

1. Jalankan server, tunjukkan log startup dan seed prices
2. Buka Terminal 2, subscribe `WatchMarket` — tunjukkan stream menunggu
3. Terminal 3: Register Trader A (Budi), `GetBalance` — dapat Rp 100.000.000 virtual
4. Terminal 4: Register Trader B (Sari), `GetBalance`
5. Terminal 3: `PlaceOrder BUY BBCA 100 lot @ 9.300` → order masuk order book (status: OPEN)
6. Terminal 4: `PlaceOrder SELL BBCA 100 lot @ 9.300` → **MATCH!** Terminal 2 langsung update harga
7. Terminal 3 & 4: `GetPortfolio` — tunjukkan kepemilikan saham berubah, saldo update
8. Terminal 3: `BatchPlaceOrders` — kirim 5 order sekaligus, demonstrasikan client-side streaming
9. Terminal 3: `StreamTrade` — masuk sesi bidi, order & konfirmasi secara interaktif
10. Tunjukkan `WatchLeaderboard` — ranking update real-time setelah transaksi

### 10.3 Test Case Penting

| Test Case | Expected Behavior | Status Code |
|-----------|------------------|-------------|
| PlaceOrder tanpa Register | Ditolak | `UNAUTHENTICATED` |
| PlaceOrder BUY saldo tidak cukup | Ditolak dengan info saldo | `FAILED_PRECONDITION` |
| PlaceOrder SELL saham lebih dari dimiliki | Ditolak | `FAILED_PRECONDITION` |
| PlaceOrder harga negatif | Ditolak | `INVALID_ARGUMENT` |
| CancelOrder milik trader lain | Ditolak | `PERMISSION_DENIED` |
| Register nama yang sama dua kali | Ditolak | `ALREADY_EXISTS` |
| 2 order match persis → keduanya FILLED | Portfolio update, harga update, broadcast | OK |
| 5 client subscribe WatchMarket bersamaan | Semua terima update bersamaan | OK |
| BatchPlaceOrders 10 order sekaligus | Server proses satu per satu, saldo konsisten | OK |
| Client disconnect saat WatchMarket aktif | Server hapus dari subscriber, tidak crash | OK |

---

## 11. Tech Stack & Dependencies

| Komponen | Teknologi | Kegunaan |
|----------|-----------|----------|
| Language | Node.js v18+ | Runtime server & client |
| gRPC Runtime | `@grpc/grpc-js ^1.10` | Implementasi gRPC tanpa native bindings |
| Proto Loader | `@grpc/proto-loader ^0.7` | Load `.proto` file secara dinamis |
| CLI Styling | `chalk ^5.x` | Warna terminal (merah loss, hijau profit) |
| CLI Table | `cli-table3 ^0.6` | Tampilkan portfolio, order book, leaderboard |
| CLI Input | `readline` (built-in Node) | Input menu interaktif di terminal |
| ID Generation | `crypto.randomUUID()` (built-in) | Generate `trader_id` dan `order_id` unik |
| State | Native JS `Map` & `Array` | In-memory — tidak perlu database eksternal |
| Bot | `setInterval()` (built-in) | Market maker bot, leaderboard update periodik |

```json
// package.json
{
  "name": "bursagrpc",
  "version": "1.0.0",
  "scripts": {
    "server": "node server/index.js",
    "client": "node client/index.js"
  },
  "dependencies": {
    "@grpc/grpc-js": "^1.10.0",
    "@grpc/proto-loader": "^0.7.10",
    "chalk": "^5.3.0",
    "cli-table3": "^0.6.3"
  }
}
```

---

## 12. Data Seed — Harga Awal Saham

Harga awal berdasarkan kisaran historis pasar saham Indonesia:

```json
// seeds/prices.json
{
  "BBCA": { "name": "Bank Central Asia",     "current": 9250, "open": 9200, "high": 9300, "low": 9150, "volume": 0 },
  "TLKM": { "name": "Telkom Indonesia",      "current": 3940, "open": 3900, "high": 3970, "low": 3880, "volume": 0 },
  "GOTO": { "name": "GoTo Gojek Tokopedia",  "current": 68,   "open": 66,   "high": 70,   "low": 64,   "volume": 0 },
  "ASII": { "name": "Astra International",   "current": 4550, "open": 4500, "high": 4600, "low": 4480, "volume": 0 },
  "BMRI": { "name": "Bank Mandiri",          "current": 5200, "open": 5150, "high": 5250, "low": 5100, "volume": 0 }
}
```

**Saldo awal trader yang direkomendasikan: Rp 100.000.000 virtual** — cukup untuk membeli beberapa lot saham mahal seperti BBCA, sekaligus cukup kecil agar keputusan trading terasa bermakna.

---

## 13. Pemetaan Requirement Tugas

| # | Requirement Tugas | Implementasi BursaGRPC | Status |
|---|-------------------|------------------------|--------|
| 1 | Request-response (Unary) gRPC | `Register`, `PlaceOrder`, `CancelOrder`, `GetPortfolio`, `GetBalance`, `GetOrderBook`, `GetStockInfo`, `GetTradeHistory`, `GetPerformance` — **9 Unary methods** | ✅ Terpenuhi |
| 2a | Streaming gRPC (wajib min. 1) | `WatchMarket` — Server-side Streaming harga ke semua subscriber | ✅ Terpenuhi |
| 2b | *(bonus)* Client-side Streaming | `BatchPlaceOrders` — algorithmic trader kirim banyak order | ✅ Bonus |
| 2c | *(bonus)* Bi-directional Streaming | `StreamTrade` — live session interaktif, server balas tiap action | ✅ Bonus |
| 2d | *(bonus)* Server-side Streaming ke-2 | `WatchLeaderboard` — ranking real-time | ✅ Bonus |
| 3 | Error Handling | 10 skenario dengan gRPC status codes: `UNAUTHENTICATED`, `FAILED_PRECONDITION`, `INVALID_ARGUMENT`, `NOT_FOUND`, `PERMISSION_DENIED`, `ALREADY_EXISTS`, `INTERNAL` | ✅ Terpenuhi |
| 4 | State Management In-Memory | Native JS `Map` & `Array`: users, portfolios, orderBook, orders, prices, subscribers — semua in-memory | ✅ Terpenuhi |
| 5 | Multi Client | Banyak trader connect bersamaan, masing-masing punya state independen | ✅ Terpenuhi |
| 6 | Minimal 3 Services | `AccountService` + `TradingService` + `MarketService` = 3 service, 16 RPC methods total | ✅ Terpenuhi |

---

> **Kesimpulan:** BursaGRPC bukan hanya memenuhi semua requirement wajib, tapi melampaui semua poin bonus dengan sistem yang koheren dan relevan industri. Seluruh 4 pola komunikasi gRPC didemonstrasikan secara natural dalam satu domain yang sama.
