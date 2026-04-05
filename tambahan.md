# Party Dungeon Crawler — gRPC System Draft

---

## 1. Judul

**GrpcQuest: Party-Based Dungeon Crawler via gRPC**
*Sistem permainan dungeon crawler berbasis party multiplayer dengan eksplorasi real-time dan combat turn-based menggunakan protokol gRPC*

---

## 2. Deskripsi & Tujuan

### Deskripsi
GrpcQuest adalah permainan dungeon crawler multiplayer di mana 1–3 pemain membentuk sebuah **party** untuk menjelajahi dungeon bersama-sama. Dungeon direpresentasikan sebagai **graph of rooms** yang dibangkitkan secara prosedural setiap run — bukan sebagai grid koordinat, melainkan sebagai jaringan ruangan yang saling terhubung lewat pintu atau koridor. Pemain berpindah ruangan dengan memilih arah exit, bukan bergerak per-tile.

Di setiap ruangan, party bisa menemukan monster yang harus dihadapi dalam **combat turn-based** dengan urutan giliran yang ketat. Party juga bisa memilih untuk keluar dungeon kapan saja — progress tersimpan di server dan bisa dilanjutkan kembali di sesi berikutnya.

Seluruh sistem komunikasi dibangun di atas gRPC, mencakup tiga pola komunikasi berbeda: **Unary** untuk aksi diskret, **Bi-directional Streaming** untuk sinkronisasi eksplorasi real-time, dan **Server-side Streaming** untuk broadcast hasil combat dan chat.

### Tujuan
- Mengimplementasikan **Unary gRPC** untuk aksi-aksi diskret: manajemen party di lobby, pemilihan class, pengiriman aksi combat per giliran.
- Mengimplementasikan **Bi-directional Streaming** pada fase eksplorasi — client mengirim aksi navigasi, server mem-broadcast state ruangan saat ini ke seluruh anggota party secara real-time.
- Mengimplementasikan **Server-side Streaming** pada fase combat dan chat — server mendorong hasil setiap ronde combat dan pesan chat ke semua anggota party tanpa client perlu meminta ulang.
- Menerapkan **error handling** kontekstual yang mencerminkan aturan permainan: aksi di luar giliran, flee dari monster yang tidak mengizinkan, pindah ke exit yang tidak ada.
- Mengelola **in-memory state** yang kompleks mencakup dungeon graph prosedural, status per room, HP seluruh karakter, urutan giliran combat, dan progress party yang tersimpan.
- Mendukung **multi-client** secara natural — hingga 3 client dalam satu party, semua menerima update yang konsisten dari satu sumber kebenaran di server.

---

## 3. Design Sistem

### 3.1 Arsitektur Umum

```
┌─────────────┐
│  Player 1   │
│  (Warrior)  │──────┐
└─────────────┘      │
                     │  Bi-dir Stream (Eksplorasi)
┌─────────────┐      │  Server-side Stream (Combat, Chat)     ┌─────────────────────────┐
│  Player 2   │──────┼───────────────────────────────────────►│         SERVER          │
│  (Mage)     │      │                                        │                         │
└─────────────┘      │                                        │  ┌───────────────────┐  │
                     │  Unary (Lobby, SubmitAction)           │  │   In-Memory State │  │
┌─────────────┐      │                                        │  │  Parties, Dungeons│  │
│  Player 3   │──────┘                                        │  │  Combat Sessions  │  │
│  (Cleric)   │                                               │  └───────────────────┘  │
└─────────────┘                                               └─────────────────────────┘
```

Server adalah **sumber kebenaran tunggal**. Tidak ada logika permainan di sisi client — client hanya mengirim intent (aksi yang ingin dilakukan) dan menerima state terbaru dari server.

### 3.2 Services & RPC

Sistem terdiri dari **4 gRPC Services**:

---

#### `LobbyService`
Menangani semua yang terjadi sebelum party masuk dungeon. Semua RPC bertipe Unary karena ini interaksi request-response biasa tanpa kebutuhan streaming.

| RPC | Tipe | Deskripsi |
|-----|------|-----------|
| `CreateParty` | Unary | Buat party baru, dapatkan `party_code` untuk dibagikan ke teman |
| `JoinParty` | Unary | Bergabung ke party yang sudah ada menggunakan `party_code` |
| `SelectClass` | Unary | Pilih class karakter: Warrior, Mage, Rogue, atau Cleric |
| `EnterDungeon` | Unary | Party leader trigger masuk dungeon — generate dungeon baru atau resume jika sudah ada progress |
| `LeaveParty` | Unary | Keluar dari party sebelum dungeon dimulai |

---

#### `DungeonService`
Menangani fase eksplorasi dungeon secara real-time. Hanya ada **satu RPC** bertipe Bi-directional Streaming yang menanggung seluruh beban eksplorasi.

| RPC | Tipe | Deskripsi |
|-----|------|-----------|
| `Explore` | Bi-directional Streaming | Client kirim `ExploreAction`, server broadcast `RoomSnapshot` ke seluruh anggota party |

**Mengapa satu RPC?** Karena semua aksi eksplorasi (pindah room, lihat sekitar, keluar dungeon) cukup dibedakan via field `action_type` dalam satu message `ExploreAction`. Server merespons setiap aksi dengan mengirimkan `RoomSnapshot` terbaru ke **semua anggota party**, bukan hanya ke pemain yang mengirim aksi. Ini adalah showcase utama bi-directional streaming — setiap perubahan state langsung terasa oleh seluruh party.

`ExploreAction` yang bisa dikirim client:
- `MOVE(direction)` — pindah ke room berikutnya lewat exit yang dipilih
- `LOOK` — minta server kirim ulang `RoomSnapshot` room saat ini
- `EXIT_DUNGEON` — keluar dungeon, progress tersimpan, stream ditutup

Saat party masuk room yang ada monster-nya, server otomatis mengubah status party menjadi `IN_COMBAT` dan stream Explore di-pause. Party harus menyelesaikan combat terlebih dahulu lewat `CombatService` sebelum bisa kembali bereksplorasi.

---

#### `CombatService`
Menangani fase combat turn-based. Dipisah dari `DungeonService` karena ritme combat (terstruktur, ada urutan giliran) sangat berbeda dari ritme eksplorasi (fluid, kapan saja bisa bergerak).

| RPC | Tipe | Deskripsi |
|-----|------|-----------|
| `WatchCombat` | Server-side Streaming | Semua anggota party subscribe untuk menerima hasil setiap ronde combat |
| `SubmitAction` | Unary | Pemain yang sedang giliran mengirim aksinya: ATTACK, SKILL, DEFEND, atau FLEE |

**Alur combat per ronde:**
1. Server broadcast `CombatState` via `WatchCombat` — berisi HP semua pihak, giliran siapa, dan log aksi sebelumnya.
2. Pemain yang gilirannya memanggil `SubmitAction`. Pemain lain yang bukan gilirannya hanya menonton via stream.
3. Server eksekusi aksi, hitung damage/effect, lanjut ke giliran berikutnya.
4. Server broadcast `CombatState` terbaru ke semua anggota.
5. Ulangi sampai monster mati atau party memilih flee.

---

#### `ChatService`
Party chat yang bisa digunakan kapan saja — baik saat eksplorasi maupun saat combat berlangsung.

| RPC | Tipe | Deskripsi |
|-----|------|-----------|
| `SendMessage` | Unary | Kirim pesan ke seluruh anggota party |
| `WatchChat` | Server-side Streaming | Terima pesan baru dari anggota party secara real-time |

`WatchChat` dibuka sejak pemain join party dan tetap aktif sepanjang sesi — paralel dengan stream lain yang sedang berjalan.

---

### 3.3 Class System

Setiap pemain wajib memilih satu class sebelum masuk dungeon. Dalam satu party, dua pemain boleh memilih class yang sama.

| Class | HP | ATK | Peran | Skill |
|-------|----|-----|-------|-------|
| **Warrior** | 120 | 18 | Tank, absorb damage | `Shield Bash` — serang + stun monster (skip 1 giliran monster) |
| **Mage** | 60 | 40 | Burst damage | `Arcane Blast` — damage besar, skip giliran Mage berikutnya (cooldown 1 ronde) |
| **Rogue** | 80 | 28 | Consistent damage | `Smoke Bomb` — paksa flee dari combat, berhasil meski monster `is_fleeable = false` **(1x per dungeon)** |
| **Cleric** | 90 | 12 | Healer, support | `Holy Light` — pulihkan HP satu anggota party |

**Catatan desain Rogue:** Skill `Smoke Bomb` adalah satu-satunya cara flee dari boss. Ini membuat pemilihan class Rogue dalam party menjadi keputusan strategis yang bermakna, bukan sekadar estetika.

---

### 3.4 Dungeon Structure

Dungeon tidak menggunakan grid koordinat. Dungeon direpresentasikan sebagai **directed graph of rooms** yang dibangkitkan server saat `EnterDungeon` pertama kali dipanggil (atau diambil dari state tersimpan jika resume).

```
Contoh dungeon graph (dibangkitkan prosedural):

  [Start Room]
       │ north
       ▼
  [Room A] ──east──► [Room B: Monster Goblin]
       │
     south
       │
       ▼
  [Room C: Monster Orc] ──east──► [Room D: Treasure]
       │
     south
       │
       ▼
  [Boss Room: Dragon] ──── (is_fleeable: false)
```

Setiap **Room** memiliki:
- `room_id` dan `room_name` (deskriptif, misal "Ruang Bawah Tanah Berbau Busuk")
- `description` — teks naratif singkat yang dibaca saat pertama kali masuk
- `exits` — map direction ke `room_id` tujuan, misal `{ "north": "room_04", "east": "room_07" }`
- `monsters` — list monster di room ini (kosong jika tidak ada)
- `status` — `UNEXPLORED`, `VISITED`, atau `CLEARED`
- `loot` — item opsional yang bisa ditemukan

Server hanya mengirimkan `exits` yang valid — client tidak perlu tahu struktur dungeon secara keseluruhan, hanya tahu pilihan dari room saat ini. Ini mensimulasikan eksplorasi yang sesungguhnya.

**Procedural generation (simpel):**
Server generate dungeon dengan algoritma sederhana — mulai dari Start Room, rekursif buat child rooms dengan jumlah exit acak (1–3), assign monster dan loot secara random berdasarkan "depth" room dari Start. Boss Room selalu berada di depth terdalam. Total room per dungeon: 8–12 room.

---

### 3.5 In-Memory State

```
Server State
│
├── parties: Map<party_id, Party>
│   ├── party_id: string
│   ├── party_code: string              ("GRPC-4X7")
│   ├── dungeon_id: string | null
│   ├── last_room_id: string            ← titik spawn saat resume
│   ├── status: LOBBY|EXPLORING|IN_COMBAT|EXITED
│   └── members: []PlayerSession
│       ├── player_id / username: string
│       ├── class: WARRIOR|MAGE|ROGUE|CLERIC
│       ├── hp / max_hp: int
│       ├── status: ALIVE | DEAD
│       ├── smoke_bomb_used: bool       ← tracking skill 1x per dungeon
│       └── stream_channel: Channel     ← referensi koneksi aktif
│
├── dungeons: Map<dungeon_id, Dungeon>
│   ├── dungeon_id: string
│   ├── party_id: string
│   ├── status: ACTIVE | COMPLETED | FAILED
│   └── rooms: Map<room_id, Room>
│       ├── room_id / room_name: string
│       ├── description: string
│       ├── exits: Map<direction, room_id>
│       ├── status: UNEXPLORED|VISITED|CLEARED
│       └── monsters: []Monster
│           ├── monster_id: string
│           ├── name: string
│           ├── hp / max_hp: int
│           ├── atk: int
│           ├── is_fleeable: bool
│           └── type: NORMAL | MINIBOSS | BOSS
│
└── combat_sessions: Map<party_id, CombatSession>
    ├── party_id / room_id: string
    ├── turn_order: []string            ← [player_id, player_id, ..., "monster"]
    ├── current_turn_index: int
    ├── round_number: int
    └── monster_snapshot: Monster      ← state monster selama combat
                                          (direset saat flee berhasil)
```

---

### 3.6 Alur Lengkap

```
━━━ LOBBY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Player A → CreateParty()              [Unary - LobbyService]
  Server → { party_code: "GRPC-4X7" }

Player B,C → JoinParty("GRPC-4X7")   [Unary - LobbyService]

Semua → SelectClass(WARRIOR/MAGE/CLERIC) [Unary - LobbyService]

Player A (leader) → EnterDungeon()   [Unary - LobbyService]
  Jika baru    → server generate dungeon baru, spawn di Start Room
  Jika resume  → spawn di last_room_id yang tersimpan

━━━ EKSPLORASI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Semua → DungeonService.Explore()      [Bi-dir Stream — terbuka sepanjang eksplorasi]

Server kirim RoomSnapshot pertama:
  {
    room_name: "Pintu Masuk Dungeon",
    description: "Ruangan lembab dengan bau tanah basah...",
    exits: { "north": "room_02", "east": "room_03" },
    monsters: [],
    status: VISITED
  }

Player A kirim → { action: MOVE, direction: "north" }
Server update last_room_id, broadcast RoomSnapshot room_02 ke semua

... party terus eksplorasi ...

━━━ COMBAT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Party masuk room ada monster → server pause stream Explore
  Server kirim RoomSnapshot dengan flag { entering_combat: true }

Semua → CombatService.WatchCombat()  [Server-side Stream]
  Server kirim CombatState awal:
  {
    round: 1,
    current_turn: "player_a",
    party_hp: { player_a: 120, player_b: 60, player_c: 90 },
    monster: { name: "Goblin", hp: 45, max_hp: 45 },
    log: ["Combat dimulai! Giliran Warrior."]
  }

Player A (gilirannya) → SubmitAction(ATTACK) [Unary]
  Server eksekusi, broadcast CombatState baru:
  {
    round: 1,
    current_turn: "player_b",
    party_hp: { player_a: 120, player_b: 60, player_c: 90 },
    monster: { name: "Goblin", hp: 27, max_hp: 45 },
    log: ["Warrior menyerang Goblin: 18 damage!", "Giliran Mage."]
  }

Player B (gilirannya) → SubmitAction(USE_SKILL, "ARCANE_BLAST") [Unary]
  Server eksekusi, Goblin HP 0 → monster mati

  Server broadcast CombatState final:
  {
    combat_status: VICTORY,
    log: ["Mage menghancurkan Goblin: 40 damage!", "Goblin telah dikalahkan!"]
  }

Server update room.status = CLEARED
Server resume stream Explore, kirim RoomSnapshot terbaru

━━━ FLEE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Player B → SubmitAction(FLEE)         [Unary]

  Jika monster.is_fleeable = true:
    Server reset HP monster ke max_hp
    Server pindah party ke room sebelumnya
    Server resume stream Explore

  Jika monster.is_fleeable = false:
    Server → error FLEE_NOT_ALLOWED
    (kecuali Rogue pakai Smoke Bomb → berhasil)

━━━ EXIT DUNGEON ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Player A → kirim { action: EXIT_DUNGEON } via Explore stream

  Server simpan last_room_id = room saat ini
  Server tutup stream Explore dan WatchCombat dan WatchChat
  Server update party.status = EXITED
  Semua client kembali ke lobby

  Saat resume → EnterDungeon() lagi
  Server spawn party di last_room_id, dungeon graph tetap sama

━━━ GAME OVER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Semua anggota party HP = 0 → PARTY_WIPE
  Server broadcast { combat_status: WIPE }
  Progress dungeon dihapus, party kembali ke lobby
  EnterDungeon berikutnya = dungeon baru dari awal
```

---

### 3.7 Proto Sketch

```proto
syntax = "proto3";

// ── LobbyService ──────────────────────────────────────────
service LobbyService {
  rpc CreateParty(CreatePartyRequest)   returns (CreatePartyResponse);
  rpc JoinParty(JoinPartyRequest)       returns (JoinPartyResponse);
  rpc SelectClass(SelectClassRequest)   returns (SelectClassResponse);
  rpc EnterDungeon(EnterDungeonRequest) returns (EnterDungeonResponse);
  rpc LeaveParty(LeavePartyRequest)     returns (LeavePartyResponse);
}

// ── DungeonService ────────────────────────────────────────
service DungeonService {
  rpc Explore(stream ExploreAction) returns (stream RoomSnapshot);
}

// ── CombatService ─────────────────────────────────────────
service CombatService {
  rpc WatchCombat(WatchCombatRequest) returns (stream CombatState);
  rpc SubmitAction(CombatAction)      returns (SubmitActionResponse);
}

// ── ChatService ───────────────────────────────────────────
service ChatService {
  rpc SendMessage(ChatMessage)      returns (ChatAck);
  rpc WatchChat(WatchChatRequest)   returns (stream ChatMessage);
}

// ── Core Messages ─────────────────────────────────────────

message ExploreAction {
  string player_id  = 1;
  enum Type { MOVE = 0; LOOK = 1; EXIT_DUNGEON = 2; }
  Type   type       = 2;
  string direction  = 3;  // "north" | "south" | "east" | "west" (untuk MOVE)
}

message RoomSnapshot {
  string          room_id       = 1;
  string          room_name     = 2;
  string          description   = 3;
  map<string,string> exits      = 4;  // direction → room_id
  repeated MonsterInfo monsters = 5;
  string          status        = 6;  // UNEXPLORED | VISITED | CLEARED
  bool            entering_combat = 7;
  repeated string event_log     = 8;  // "Player A pindah ke ruang utara"
}

message CombatAction {
  string player_id  = 1;
  enum Type { ATTACK = 0; USE_SKILL = 1; DEFEND = 2; FLEE = 3; }
  Type   type       = 2;
  string target_id  = 3;  // untuk USE_SKILL yang targetable
}

message CombatState {
  int32                    round          = 1;
  string                   current_turn   = 2;  // player_id atau "monster"
  map<string, int32>       party_hp       = 3;  // player_id → hp saat ini
  MonsterInfo              monster        = 4;
  repeated string          log            = 5;
  enum Status { ONGOING=0; VICTORY=1; WIPE=2; FLED=3; }
  Status                   combat_status  = 6;
}

message MonsterInfo {
  string monster_id  = 1;
  string name        = 2;
  int32  hp          = 3;
  int32  max_hp      = 4;
  bool   is_fleeable = 5;
  string type        = 6;  // NORMAL | MINIBOSS | BOSS
}
```

---

## 4. Fitur-fitur

### 4.1 Fitur Wajib (Mapping ke Syarat Tugas)

| No | Syarat | Implementasi |
|----|--------|-------------|
| 1 | **Unary gRPC** | `CreateParty`, `JoinParty`, `SelectClass`, `EnterDungeon`, `SubmitAction`, `SendMessage` |
| 2 | **Bi-directional Streaming** | `DungeonService.Explore` — client kirim navigasi, server push room state ke semua anggota |
| 3 | **Server-side Streaming** | `CombatService.WatchCombat` dan `ChatService.WatchChat` |
| 4 | **Error Handling** | Lihat bagian 4.3 |
| 5 | **In-memory State** | Dungeon graph, party state, combat session, progress tersimpan |
| 6 | **Multi-client** | 3 client per party, semua menerima update konsisten dari server |
| 7 | **Minimal 3 Services** | 4 services: `LobbyService`, `DungeonService`, `CombatService`, `ChatService` |

### 4.2 Fitur Gameplay

**Party & Lobby:**
- Party dibuat dengan party code pendek yang mudah dibagikan (format: `GRPC-XXXX`).
- Maksimal 3 pemain per party. Party bisa masuk dungeon dengan 1–3 anggota.
- Setiap anggota wajib memilih class sebelum leader bisa trigger `EnterDungeon`.

**Eksplorasi:**
- Dungeon dibangkitkan prosedural tiap run baru — struktur, monster, dan loot berbeda setiap kali.
- Pemain pindah room dengan memilih direction dari exit yang tersedia di room saat ini. Server hanya memberi tahu exit yang valid.
- Semua anggota party bergerak bersama — satu pemain MOVE, seluruh party ikut pindah.
- Room punya deskripsi naratif singkat yang muncul pertama kali dimasuki, menciptakan nuansa eksplorasi.
- Status room (`UNEXPLORED` → `VISITED` → `CLEARED`) tersimpan dan dipertahankan saat resume.

**Combat:**
- Urutan giliran: P1 → P2 → P3 → Monster → ulang.
- Pemain yang bukan gilirannya hanya bisa menonton via `WatchCombat` stream — tidak bisa `SubmitAction`.
- Aksi DEFEND mengurangi damage yang diterima di ronde berikutnya sebesar 50%.
- Monster menyerang secara otomatis di gilirannya — server tentukan target berdasarkan HP terendah.
- Jika semua anggota HP = 0 → `PARTY_WIPE`, progress dihapus.

**Flee & Smoke Bomb:**
- FLEE hanya bisa dilakukan saat giliran pemain yang bersangkutan.
- Monster biasa (`is_fleeable: true`) → flee berhasil, HP monster reset, party mundur ke room sebelumnya.
- Boss dan beberapa miniboss (`is_fleeable: false`) → flee gagal dengan error `FLEE_NOT_ALLOWED`.
- Rogue dengan `Smoke Bomb` bisa flee dari monster apapun, termasuk boss. Skill ini hanya bisa dipakai **1 kali per dungeon run**.

**Progress & Resume:**
- Saat `EXIT_DUNGEON`, server simpan `last_room_id` dan seluruh state dungeon (HP party, status tiap room, HP monster yang belum mati).
- Saat `EnterDungeon` ulang, party spawn tepat di room terakhir mereka.
- Dungeon graph tidak di-regenerate — pemain lanjut di struktur yang sama.
- `PARTY_WIPE` menghapus progress — dungeon baru dari awal.

### 4.3 Error Handling

| Error Code | Kondisi Pemicu |
|------------|----------------|
| `PARTY_NOT_FOUND` | `JoinParty` dengan party code yang tidak ada |
| `PARTY_FULL` | `JoinParty` saat party sudah berisi 3 orang |
| `NOT_PARTY_LEADER` | Non-leader memanggil `EnterDungeon` |
| `CLASS_NOT_SELECTED` | `EnterDungeon` sebelum semua anggota pilih class |
| `INVALID_DIRECTION` | `MOVE` ke arah yang tidak ada exit-nya di room saat ini |
| `ROOM_BLOCKED` | Mencoba pindah room saat party sedang `IN_COMBAT` |
| `NOT_YOUR_TURN` | `SubmitAction` dipanggil saat bukan giliran pemain tersebut |
| `FLEE_NOT_ALLOWED` | FLEE terhadap monster dengan `is_fleeable: false` tanpa Smoke Bomb |
| `SMOKE_BOMB_USED` | Rogue mencoba pakai Smoke Bomb untuk kedua kalinya |
| `SKILL_ON_COOLDOWN` | Mage pakai `Arcane Blast` dua ronde berturut-turut |
| `PLAYER_IS_DEAD` | `SubmitAction` dari pemain dengan HP = 0 |
| `NO_ACTIVE_DUNGEON` | `EnterDungeon` dipanggil tapi tidak ada dungeon aktif dan bukan run baru |

### 4.4 Skenario Demo

**Skenario 1 — Eksplorasi & Koordinasi Party:**
Party bertiga masuk dungeon. Player 1 kirim `MOVE north` — semua client langsung menerima `RoomSnapshot` ruangan baru secara bersamaan via stream. Di layar semua pemain muncul deskripsi ruangan dan pilihan exit yang sama. Player 2 chat "ke timur dulu!" via `SendMessage`, semua terima pesannya via `WatchChat`. Player 3 setuju, Player 1 kirim `MOVE east` — demonstrasi koordinasi real-time lewat dua stream paralel.

**Skenario 2 — Turn-based Combat:**
Party masuk room ada Orc. Server trigger combat. Tampilkan `WatchCombat` stream di tiga terminal sekaligus. Player 1 (Warrior) `SubmitAction(ATTACK)` — ketiga terminal update bersamaan. Player 2 (Mage) `SubmitAction(USE_SKILL, ARCANE_BLAST)` — demonstrasi damage besar. Player 3 (Cleric) `SubmitAction(USE_SKILL, HOLY_LIGHT, player_1)` — heal Warrior. Monster giliran — server otomatis serang pemain HP terendah.

**Skenario 3 — Flee & Smoke Bomb:**
Party masuk Boss Room. Player 1 panik, coba `SubmitAction(FLEE)` — server balas error `FLEE_NOT_ALLOWED` secara langsung. Player 2 (Rogue) cast `Smoke Bomb` — satu-satunya cara kabur dari boss. Party mundur ke room sebelumnya. Demonstrasikan bahwa Smoke Bomb tidak bisa dipakai lagi (`SMOKE_BOMB_USED`).

**Skenario 4 — Exit & Resume:**
Saat di tengah dungeon, Player 1 kirim `EXIT_DUNGEON`. Semua stream tertutup, party kembali ke lobby. Server menyimpan `last_room_id`. Jalankan `EnterDungeon` ulang — party muncul di room yang persis sama saat mereka keluar tadi, dengan progress yang utuh.

**Skenario 5 — Error Handling Live:**
Demonstrasikan `NOT_YOUR_TURN` dengan Player 2 mencoba `SubmitAction` di luar gilirannya. Demonstrasikan `INVALID_DIRECTION` dengan mencoba `MOVE west` padahal tidak ada exit ke barat. Demonstrasikan `PLAYER_IS_DEAD` dengan memaksa submit aksi dari pemain yang HP-nya sudah 0.