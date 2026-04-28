# SiAntre — Implementation Addendum (Errata & Fixes)

> **Dokumen ini SUPERSEDES bagian-bagian yang bermasalah di `IMPLEMENTATION_GUIDE_FINAL.md`.**
> Baca FINAL guide sebagai basis, lalu terapkan semua koreksi di bawah ini.

---

## Pola Identitas (Desain yang Benar)

| Entitas | External ID (Nomor Induk) | Internal System ID |
|---------|--------------------------|-------------------|
| **Warga** | `nik` — NIK KTP 16 digit | `citizen_id` — di-generate server saat register |
| **Petugas** | `id_pegawai` — NIP/Nomor Induk Pegawai | `officer_id` — di-generate server saat register |

---

## BAGIAN 1: Perubahan Proto

### 1A. `service_info.proto` — Tambah `citizen_id`

```protobuf
message RegisterCitizenResponse {
  bool   success    = 1;
  string nik        = 2;
  string citizen_id = 3;  // NEW: system-generated
  string message    = 4;  // renumber dari 3
}

message LoginCitizenResponse {
  bool   success      = 1;
  string nik          = 2;
  string nama_lengkap = 3;
  string no_hp        = 4;
  string alamat       = 5;
  string message      = 6;
  string citizen_id   = 7;  // NEW: tambah di akhir (aman, tanpa renumber)
}
```

### 1B. `admin.proto` — Tambah `officer_id` generation

```protobuf
message RegisterOfficerResponse {
  bool   success    = 1;
  string id_pegawai = 2;
  string officer_id = 3;  // NEW: system-generated (renumber message dari 3)
  string message    = 4;
}

message LoginOfficerResponse {
  bool   success    = 1;
  string id_pegawai = 2;
  string nama       = 3;
  string jabatan    = 4;
  string role       = 5;
  string message    = 6;
  string officer_id = 7;  // NEW: tambah di akhir
}
```

### 1C. `booking.proto` — `CancelBooking` & `Reschedule` pakai `booking_code`

```protobuf
message CancelBookingRequest {
  string booking_code = 1;  // CHANGED: dari booking_id ke booking_code
  string citizen_id   = 2;
  string reason       = 3;
}

message RescheduleBookingRequest {
  string booking_code = 1;  // CHANGED: dari booking_id ke booking_code
  string citizen_id   = 2;
  string new_slot_id  = 3;
}
```

### 1D. `service_info.proto` — Perkaya `Announcement`

```protobuf
message Announcement {
  string id         = 1;  // NEW: unique ID untuk deteksi duplikat
  string message    = 2;  // renumber dari 1
  string service_id = 3;  // NEW: per-layanan
  string timestamp  = 4;  // renumber dari 2
}
```

---

## BAGIAN 2: Perubahan Server

### 2A. `server/helpers/utils.js` — Fix `isOfficer` case sensitivity

```diff
  function isOfficer(nip) {
    const { officerStore } = require('../state');
-   return officerStore.isRegistered(nip);
+   return officerStore.isRegistered((nip || '').toUpperCase());
  }
```

### 2B. `server/state/citizenStore.js` — Simpan `citizen_id`

```javascript
'use strict';
const citizens = new Map();
let citizenCounter = 0;

function generateCitizenId() {
  citizenCounter++;
  return `CIT-${String(citizenCounter).padStart(4, '0')}`;
}

module.exports = {
  get:    (nik)        => citizens.get(nik),
  set:    (nik, data)  => citizens.set(nik, data),
  has:    (nik)        => citizens.has(nik),
  getAll: ()           => Array.from(citizens.values()),
  generateCitizenId,
};
```

### 2C. `server/services/serviceInfoService.js` — Generate `citizen_id`

```diff
  // RegisterCitizen
+ const citizen_id = citizenStore.generateCitizenId();
  citizenStore.set(nik, {
    nik,
+   citizen_id,
    nama_lengkap: nama_lengkap.trim(),
    no_hp:        (no_hp || '').trim(),
    alamat:       (alamat || '').trim(),
    registered_at: new Date().toISOString(),
  });
  callback(null, {
    success: true,
    nik,
+   citizen_id,
    message: `Pendaftaran berhasil! Selamat datang, ${nama_lengkap.trim()}.`,
  });

  // LoginCitizen — tambah citizen_id di response
  callback(null, {
    success:      true,
    nik:          citizen.nik,
    nama_lengkap: citizen.nama_lengkap,
    no_hp:        citizen.no_hp,
    alamat:       citizen.alamat,
    message:      `Selamat datang kembali, ${citizen.nama_lengkap}!`,
+   citizen_id:   citizen.citizen_id,
  });
```

### 2D. `server/state/officerStore.js` — Generate `officer_id`

```javascript
let officerCounter = 0;
function generateOfficerId() {
  officerCounter++;
  return `OFC-${String(officerCounter).padStart(4, '0')}`;
}

register(data) {
  const officer_id = generateOfficerId();
  officers.set(data.id_pegawai, {
    id_pegawai:    data.id_pegawai,
    officer_id,                      // NEW
    nama:          data.nama,
    jabatan:       data.jabatan,
    role:          data.role,
    pin_hash:      hashPin(data.pin),
    registered_at: new Date().toISOString(),
  });
  return officer_id;  // Return generated ID
},
```

### 2E. `server/services/adminService.js` — Return `officer_id`

```diff
  // RegisterOfficer
- officerStore.register({ ... });
+ const officer_id = officerStore.register({ ... });
  callback(null, {
    success:    true,
    id_pegawai: idUp,
+   officer_id,
    message:    `Akun '${idUp}' berhasil didaftarkan.`,
  });

  // LoginOfficer
  callback(null, {
    success:    true,
    id_pegawai: officer.id_pegawai,
    nama:       officer.nama,
    jabatan:    officer.jabatan,
    role:       officer.role,
    message:    `Selamat datang, ${officer.nama}.`,
+   officer_id: officer.officer_id,
  });
```

### 2F. `server/services/bookingService.js` — Cancel/Reschedule by `booking_code`

```diff
  // CancelBooking
- const { booking_id, citizen_id } = call.request;
- const booking = bookingStore.get(booking_id);
+ const { booking_code, citizen_id } = call.request;
+ const booking = bookingStore.getByCode(booking_code.trim().toUpperCase());

  // RescheduleBooking
- const { booking_id, citizen_id, new_slot_id } = call.request;
- const booking = bookingStore.get(booking_id);
+ const { booking_code, citizen_id, new_slot_id } = call.request;
+ const booking = bookingStore.getByCode(booking_code.trim().toUpperCase());
```

### 2G. `server/state/announcementStore.js` — Perkaya dengan ID

```javascript
'use strict';
const { v4: uuidv4 } = require('uuid');
const announcements = [];

module.exports = {
  add: (message, service_id = null) => {
    announcements.push({
      id: uuidv4(),
      message,
      service_id,
      timestamp: new Date().toISOString(),
    });
    if (announcements.length > 10) announcements.shift();
  },
  getAll: () => [...announcements],
};
```

Update `adminService.js` ANNOUNCE handler:
```diff
- announcementStore.add(`(Layanan ${service_id}) ${message}`);
+ announcementStore.add(message, service_id);
```

### 2H. Seed demo citizens — tambah `citizen_id`

```diff
  // seed.js
  for (const c of CITIZENS) {
-   citizenStore.set(c.nik, { ...c, registered_at: new Date().toISOString() });
+   const citizen_id = citizenStore.generateCitizenId();
+   citizenStore.set(c.nik, { ...c, citizen_id, registered_at: new Date().toISOString() });
  }
```

---

## BAGIAN 3: Koreksi Gateway Code di FINAL Guide

### 3A. `streamBridge.js` — Fix 3 field errors

**FINAL guide line 382-401 → ganti dengan:**

```javascript
const stream = clients.queue.WatchQueue({
  service_id:      serviceId,
  my_queue_number: queueNumber,   // FIX: was queue_number
});

stream.on('data', (update) => {
  const payload = {
    type:       'QUEUE_UPDATE',
    service_id: serviceId,
    payload: {
      event_type:     update.event_type,
      current_number: update.current_number,
      your_number:    update.your_number,
      total_waiting:  update.total_waiting,   // FIX: was waiting_count
      people_ahead:   update.people_ahead,
      estimated_wait: update.estimated_wait,
      quota_remaining:update.quota_remaining,
      message:        update.message,
      timestamp:      update.timestamp || new Date().toISOString(),
    },
  };

  // Gateway subscribe sebagai observer (queue_number=0)
  // Server TIDAK akan kirim YOUR_TURN ke observer
  // YOUR_TURN dideteksi di client-side (lihat ws-client.js)
  broadcast(payload);
});
```

### 3B. `pushScheduler.js` — Fix Announcement pusher

**FINAL guide line 934-960 → ganti dengan:**

```javascript
function startAnnouncementPusher(clients, intervalMs = 12000) {
  console.log(`[PushScheduler] Announcement pusher aktif (${intervalMs}ms)`);
  let lastSeenId = null;

  const handle = setInterval(() => {
    clients.serviceInfo.GetAnnouncements({}, (err, response) => {
      if (err || !response?.announcements?.length) return;

      const latest = response.announcements[response.announcements.length - 1];
      if (!latest.id || latest.id === lastSeenId) return;
      lastSeenId = latest.id;

      broadcast({
        type:    'NEW_ANNOUNCEMENT',
        payload: {
          id:         latest.id,
          title:      'Pengumuman',
          message:    latest.message || '',
          service_id: latest.service_id || null,
          timestamp:  latest.timestamp || new Date().toISOString(),
        },
      });
    });
  }, intervalMs);
  intervals.push(handle);
}
```

### 3C. `commandHandler.js` — Fix ANNOUNCE payload

**FINAL guide line 771-777 → ganti dengan:**

```javascript
case 'ANNOUNCE':
  sendAdminCommand(ws, {
    command_type: 'ANNOUNCE',
    service_id:   payload.service_id || '',
    officer_id:   getClientState(ws)?.officerId || '',
    payload:      JSON.stringify({ message: payload.message }),  // FIX: wrap in JSON
  });
  break;
```

### 3D. `commandHandler.js` — Fix ADMIN_LOGIN state

**FINAL guide line 698-702 → ganti dengan:**

```javascript
const state = getClientState(ws);
if (state) {
  state.officerId  = res.officer_id;   // FIX: gunakan system-generated officer_id
  state.idPegawai  = res.id_pegawai;   // Simpan juga NIP
  state.role       = res.role;
  setClientState(ws, state);
}
```

### 3E. `commandHandler.js` — Fix CALL_NEXT officer_id

**FINAL guide line 764-769 → ganti dengan:**

```javascript
case 'CALL_NEXT':
  sendAdminCommand(ws, {
    command_type: 'CALL_NEXT',
    service_id:   payload.service_id,
    officer_id:   getClientState(ws)?.officerId || '',  // Inject dari state
  });
  break;
```

### 3F. `ws-client.js` — Client-side YOUR_TURN detection

**FINAL guide line 1611-1621 (formatQueueEvent) → ganti:**

```javascript
function formatQueueEvent(payload) {
  const labels = {
    QUEUE_MOVED:     `Antrian bergerak — nomor ${payload.current_number} | menunggu: ${payload.total_waiting}`,
    YOUR_TURN:       `🎉 GILIRAN ANDA! Segera menuju loket.`,
    SERVICE_CLOSED:  `⚠️ Layanan ditutup sementara.`,
    SERVICE_RESUMED: `✅ Layanan dibuka kembali.`,
    ANNOUNCEMENT:    `📢 ${payload.message}`,
    QUOTA_OPENED:    `Slot baru tersedia.`,
  };
  return labels[payload.event_type] || `Event: ${payload.event_type}`;
}
```

**Tambahkan di routeMessage case QUEUE_UPDATE:**

```javascript
case 'QUEUE_UPDATE':
  EventBus.emit('queueUpdate', msg);
  EventBus.emit('activityLog', { type: 'queue', message: formatQueueEvent(msg.payload) });

  // CLIENT-SIDE YOUR_TURN DETECTION
  if (AppState.myBooking
      && msg.payload.current_number === AppState.myBooking.queue_number
      && msg.service_id === AppState.myBooking.service_id) {
    EventBus.emit('yourTurn', msg);
  }
  break;
```

### 3G. `pushScheduler.js` — Fix ServiceSummary field

**FINAL guide line 854-856 → update komentar:**

```javascript
// ServiceSummary proto TIDAK punya waiting_count
// Data ini diisi dari STATS_PUSH → ServiceStats.waiting_count
waiting_count: null,
```

---

## BAGIAN 4: Ringkasan Semua Perubahan

### Files yang Diubah

| Layer | File | Perubahan |
|-------|------|-----------|
| **Proto** | `service_info.proto` | +`citizen_id` di response, perkaya `Announcement` |
| **Proto** | `admin.proto` | +`officer_id` di response |
| **Proto** | `booking.proto` | Cancel/Reschedule pakai `booking_code` |
| **Server** | `helpers/utils.js` | `isOfficer` case fix |
| **Server** | `state/citizenStore.js` | Generate `citizen_id` |
| **Server** | `state/officerStore.js` | Generate `officer_id` |
| **Server** | `state/announcementStore.js` | Tambah `id`, `service_id` |
| **Server** | `services/serviceInfoService.js` | Return `citizen_id` |
| **Server** | `services/adminService.js` | Return `officer_id`, fix ANNOUNCE |
| **Server** | `services/bookingService.js` | Cancel/Reschedule by code |
| **Server** | `helpers/seed.js` | Seed demo citizens with `citizen_id` |
| **Gateway** | `streamBridge.js` | Fix 3 field names |
| **Gateway** | `pushScheduler.js` | Fix Announcement + ServiceSummary |
| **Gateway** | `commandHandler.js` | Fix ANNOUNCE payload, officer_id state |
| **Frontend** | `ws-client.js` | Client-side YOUR_TURN, fix field names |
