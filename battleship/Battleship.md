# Battleship Multiplayer — gRPC System Draft

---

## 1. Judul

**BattleGrid: Multiplayer Battleship via gRPC**
*Sistem permainan tebak kapal dua pemain berbasis komunikasi client-server real-time menggunakan protokol gRPC*

---

## 2. Deskripsi & Tujuan

### Deskripsi
BattleGrid adalah implementasi permainan klasik *Battleship* (Tebak Kapal) untuk dua pemain yang dibangun di atas protokol gRPC. Setiap pemain memiliki grid 10×10 milik sendiri tempat kapal-kapal ditempatkan secara rahasia. Kedua pemain bergiliran menembak koordinat di grid lawan, dan server bertindak sebagai wasit yang mengelola seluruh state permainan secara terpusat.

Proyek ini mendemonstrasikan bagaimana gRPC dapat digunakan untuk membangun sistem komunikasi antar-layanan yang melibatkan **state isolation per client** (setiap pemain tidak boleh melihat data grid lawan), **multi-client coordination** (dua client terhubung ke server yang sama dan saling berinteraksi), serta **real-time game state synchronization** menggunakan streaming.

### Tujuan
- Mengimplementasikan komunikasi **Unary gRPC** untuk aksi diskret seperti join game, penempatan kapal, dan pengiriman tembakan.
- Mengimplementasikan **Server-side Streaming** agar server dapat mem-broadcast perubahan state permainan ke seluruh pemain yang terhubung secara real-time tanpa pemain perlu polling.
- Menerapkan **error handling** yang bermakna dan sesuai konteks domain permainan.
- Mengelola **in-memory state** server yang memisahkan data privat per pemain (grid kapal masing-masing) dari data publik bersama (log tembakan, status permainan).
- Mendukung **multi-client** — minimal dua pemain aktif dalam satu sesi permainan.

---

## 3. Design Sistem

### 3.1 Arsitektur Umum

```
┌─────────────┐                          ┌─────────────┐
│  Client A   │◄────── gRPC Stream ─────►│             │
│  (Player 1) │                          │   SERVER    │
└─────────────┘                          │             │
                                         │  ┌────────┐ │
┌─────────────┐                          │  │ State  │ │
│  Client B   │◄────── gRPC Stream ─────►│  │(memory)│ │
│  (Player 2) │                          │  └────────┘ │
└─────────────┘                          └─────────────┘
```

Server adalah **sumber kebenaran tunggal (single source of truth)**. Tidak ada komunikasi langsung antar client — semua aksi melewati server.

### 3.2 Services

Sistem terdiri dari **3 gRPC Services**:

#### `LobbyService`
Menangani manajemen sesi sebelum permainan dimulai.

| RPC | Tipe | Deskripsi |
|-----|------|-----------|
| `CreateRoom` | Unary | Membuat room permainan baru, mengembalikan `room_id` |
| `JoinRoom` | Unary | Pemain bergabung ke room dengan `room_id` |
| `GetRoomInfo` | Unary | Cek status room (menunggu lawan / siap mulai) |

#### `GameService`
Menangani seluruh logika permainan.

| RPC | Tipe | Deskripsi |
|-----|------|-----------|
| `PlaceShips` | Unary | Pemain submit penempatan kapal di gridnya sendiri |
| `Fire` | Unary | Pemain tembak koordinat di grid lawan |
| `WatchGame` | Server-side Streaming | Pemain subscribe update state permainan secara real-time |

#### `StatsService`
Menangani data permainan yang sudah selesai.

| RPC | Tipe | Deskripsi |
|-----|------|-----------|
| `GetMatchHistory` | Unary | Riwayat pertandingan yang pernah dimainkan |
| `GetLeaderboard` | Unary | Peringkat pemain berdasarkan win rate |

### 3.3 In-Memory State

```
Server State
├── rooms: Map<room_id, Room>
│   ├── room_id: string
│   ├── status: WAITING | PLACING | PLAYING | FINISHED
│   ├── player_1: PlayerSession
│   │   ├── username: string
│   │   ├── own_grid: Grid (10×10) ← PRIVAT, tidak dikirim ke lawan
│   │   ├── attack_grid: Grid (10×10) ← rekaman tembakan ke lawan
│   │   ├── ships: []Ship
│   │   └── is_ready: bool
│   └── player_2: PlayerSession (struktur sama)
│
├── matches: []MatchRecord (riwayat game selesai)
└── leaderboard: Map<username, Stats>
```

**State isolation:** Server hanya mengirim `own_grid` dan `attack_grid` milik pemain yang meminta. Grid milik lawan tidak pernah dikirim ke client manapun sampai permainan selesai.

### 3.4 Alur Permainan

```
1. Player 1 → CreateRoom()              [Unary - LobbyService]
   Server → kembalikan room_id

2. Player 2 → JoinRoom(room_id)         [Unary - LobbyService]
   Server → notify room sudah penuh

3. Keduanya → WatchGame(room_id)        [Stream - GameService]
   Server → mulai kirim GameState secara real-time

4. Keduanya → PlaceShips(koordinat)     [Unary - GameService]
   Server → tunggu keduanya ready

5. Game mulai — giliran bergantian:
   Player A → Fire(x, y)               [Unary - GameService]
   Server → update state, broadcast lewat stream ke semua

6. Saat semua kapal salah satu pemain tenggelam:
   Server → broadcast GameState { status: FINISHED, winner: "..." }

7. Keduanya bisa → GetLeaderboard()     [Unary - StatsService]
```

### 3.5 Proto Sketch

```proto
syntax = "proto3";

// ── LobbyService ──────────────────────────────────────────
service LobbyService {
  rpc CreateRoom(CreateRoomRequest) returns (CreateRoomResponse);
  rpc JoinRoom(JoinRoomRequest)     returns (JoinRoomResponse);
  rpc GetRoomInfo(RoomInfoRequest)  returns (RoomInfoResponse);
}

// ── GameService ───────────────────────────────────────────
service GameService {
  rpc PlaceShips(PlaceShipsRequest) returns (PlaceShipsResponse);
  rpc Fire(FireRequest)             returns (FireResponse);
  rpc WatchGame(WatchRequest)       returns (stream GameState);
}

// ── StatsService ──────────────────────────────────────────
service StatsService {
  rpc GetLeaderboard(LeaderboardRequest) returns (LeaderboardResponse);
  rpc GetMatchHistory(HistoryRequest)    returns (HistoryResponse);
}

// ── Core Messages ─────────────────────────────────────────
message FireRequest {
  string room_id   = 1;
  string player_id = 2;
  int32  x         = 3;  // kolom 0-9
  int32  y         = 4;  // baris 0-9
}

message FireResponse {
  enum Result { HIT = 0; MISS = 1; SUNK = 2; }
  Result result    = 1;
  string ship_name = 2;  // diisi jika SUNK
}

message GameState {
  enum Status { WAITING = 0; PLACING = 1; PLAYING = 2; FINISHED = 3; }
  Status status         = 1;
  string current_turn   = 2;  // username siapa yang giliran
  string winner         = 3;  // diisi jika FINISHED
  repeated AttackLog log = 4; // riwayat tembakan (publik)
}
```

---

## 4. Fitur-fitur

### 4.1 Fitur Wajib (Memenuhi Syarat Tugas)

| No | Fitur | Implementasi |
|----|-------|-------------|
| 1 | **Unary gRPC** | `CreateRoom`, `JoinRoom`, `PlaceShips`, `Fire`, `GetLeaderboard` |
| 2 | **Server-side Streaming** | `WatchGame` — semua pemain menerima update state secara push dari server |
| 3 | **Error Handling** | Lihat bagian 4.3 |
| 4 | **In-memory State** | Map room, grid per pemain, leaderboard |
| 5 | **Multi-client** | Minimal 2 pemain aktif per room, bisa banyak room paralel |
| 6 | **Minimal 3 Services** | `LobbyService`, `GameService`, `StatsService` |

### 4.2 Fitur Gameplay

- **Penempatan kapal bebas** — pemain bebas menentukan posisi dan orientasi (horizontal/vertikal) setiap kapal sebelum pertandingan dimulai.
- **5 jenis kapal** dengan ukuran berbeda: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).
- **Turn-based system** — server memvalidasi giliran; tembakan di luar giliran langsung ditolak.
- **Live attack log** — setiap tembakan (HIT/MISS/SUNK) langsung di-broadcast ke kedua pemain via stream.
- **Auto-detect winner** — server mendeteksi otomatis saat semua kapal salah satu pemain tenggelam dan mengakhiri permainan.
- **Multi-room** — banyak pasang pemain bisa bermain secara paralel di room yang berbeda.

### 4.3 Error Handling

| Error Code | Kondisi Pemicu |
|------------|----------------|
| `INVALID_COORDINATE` | Koordinat tembakan di luar rentang 0–9 |
| `ALREADY_ATTACKED` | Koordinat yang sama ditembak dua kali |
| `NOT_YOUR_TURN` | Pemain menembak saat bukan gilirannya |
| `SHIPS_NOT_PLACED` | Pemain mencoba mulai game sebelum menempatkan kapal |
| `SHIP_OVERLAP` | Penempatan kapal menimpa kapal lain |
| `ROOM_NOT_FOUND` | `room_id` tidak ditemukan di server |
| `ROOM_FULL` | Ada pemain ketiga yang mencoba join room |
| `GAME_ALREADY_OVER` | Aksi dikirim setelah permainan selesai |

### 4.4 Fitur Tambahan (Opsional, Nilai Lebih)

- **Reconnect support** — jika client terputus dan reconnect dalam waktu tertentu, server masih menjaga state game dan pemain bisa lanjut bermain.
- **Spectator mode** — client ketiga bisa `WatchGame` sebagai penonton tanpa bisa mengirim aksi.
- **Ship reveal on finish** — saat permainan berakhir, server mengirim full grid kedua pemain (termasuk posisi kapal yang sebelumnya tersembunyi) sebagai recap.
- **Rematch request** — setelah game selesai, pemain bisa request rematch tanpa perlu buat room baru.