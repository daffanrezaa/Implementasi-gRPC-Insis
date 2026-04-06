// client/warga.js
// CLI interaktif untuk warga — alur realistis dengan NIK, registrasi, dan login.

'use strict';

const grpc        = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const readline    = require('readline');
const path        = require('path');

let chalk;
async function loadChalk() { chalk = (await import('chalk')).default; }

const PROTO_DIR   = path.join(__dirname, '../proto');
const SERVER_ADDR = process.env.SERVER || 'localhost:50051';
const LOADER_OPTS = { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true };

function loadProto(file) {
  return grpc.loadPackageDefinition(
    protoLoader.loadSync(path.join(PROTO_DIR, file), LOADER_OPTS)
  ).siantre;
}

function ask(rl, prompt) { return new Promise(r => rl.question(prompt, r)); }

// ── Session state ─────────────────────────────────────────────────────────────
let session = { nik: '', nama: '', no_hp: '', alamat: '' };

// ── Display helpers ───────────────────────────────────────────────────────────

function div()   { console.log(chalk.gray('  ' + '─'.repeat(55))); }
function blank() { console.log(''); }

function banner() {
  blank();
  console.log(chalk.cyan('  ╔════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('  ║') + chalk.bold.white('   SiAntre — Sistem Antrian Layanan Publik Digital  ') + chalk.cyan('║'));
  console.log(chalk.cyan('  ║') + chalk.gray('         Pemerintah Kota — Layanan Satu Pintu        ') + chalk.cyan('║'));
  console.log(chalk.cyan('  ╚════════════════════════════════════════════════════╝'));
  blank();
}

async function userBanner(stubs, announcements = null) {
  blank();
  console.log(chalk.cyan('  ╔════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('  ║') + chalk.bold.white('   SiAntre — Sistem Antrian Layanan Publik Digital  ') + chalk.cyan('║'));
  console.log(chalk.cyan('  ╚════════════════════════════════════════════════════╝'));
  
  try {
    let anns = announcements;
    if (!anns) {
      const res = await new Promise((resolve, reject) => {
        stubs.svc.GetAnnouncements({}, (err, data) => err ? reject(err) : resolve(data));
      });
      anns = res ? res.announcements : [];
    }
    
    if (anns && anns.length > 0) {
      console.log(chalk.bgYellow.black.bold('\n  📢 PENGUMUMAN TERBARU: '));
      anns.forEach(a => {
        const time = new Date(a.timestamp).toLocaleTimeString('id-ID');
        console.log(chalk.yellow(`  [${time}] ${a.message}`));
      });
      blank();
    }
  } catch (e) {
    // silently ignore errors to not break dashboard
  }

  console.log(chalk.gray(`  Warga : ${chalk.white.bold(session.nama)}`));
  console.log(chalk.gray(`  NIK   : ${chalk.white(session.nik)}`));
  console.log(chalk.gray(`  Server: ${chalk.white(SERVER_ADDR)}`));
  blank();
}

function handleError(err) {
  if (!err) return false;
  const G = grpc.status;
  if      (err.code === G.NOT_FOUND)          console.log(chalk.yellow(`\n  ✗ ${err.message}`));
  else if (err.code === G.RESOURCE_EXHAUSTED) console.log(chalk.red(`\n  ✗ ${err.message}`));
  else if (err.code === G.FAILED_PRECONDITION)console.log(chalk.yellow(`\n  ⚠ ${err.message}`));
  else if (err.code === G.PERMISSION_DENIED)  console.log(chalk.red(`\n  ✗ ${err.message}`));
  else if (err.code === G.INVALID_ARGUMENT)   console.log(chalk.yellow(`\n  ✗ ${err.message}`));
  else                                         console.log(chalk.red(`\n  ✗ Error: ${err.message}`));
  return true;
}

// ── Data fetchers (promise wrappers) ──────────────────────────────────────────

function rpcListServices(stubs) {
  return new Promise((res, rej) => stubs.svc.ListServices({}, (e, r) => e ? rej(e) : res(r.services)));
}
function rpcGetSlots(stubs, sid, date) {
  return new Promise((res, rej) => stubs.svc.GetAvailableSlots({ service_id: sid, date }, (e, r) => e ? rej(e) : res(r)));
}
function rpcGetBookings(stubs) {
  return new Promise((res, rej) => stubs.booking.GetMyBooking({ citizen_id: session.nik }, (e, r) => e ? rej(e) : res(r.bookings || [])));
}

// ── Pickers (numbered selection) ──────────────────────────────────────────────

async function pickService(stubs, rl, label) {
  let svcs;
  try { svcs = await rpcListServices(stubs); } catch (e) { handleError(e); return null; }
  blank();
  console.log(chalk.bold(`  ${label}:`));
  div();
  svcs.forEach((s, i) => {
    const st = s.is_open ? chalk.green('BUKA') : chalk.red('TUTUP');
    console.log(`  [${chalk.bold.white(i + 1)}] ${chalk.bold(s.short_code)} — ${s.name}`);
    console.log(`      ${st} | Kuota: ${chalk.cyan(s.quota_remaining)}/${s.daily_quota} | ${s.open_hour}–${s.close_hour}`);
  });
  div();
  const n = parseInt(await ask(rl, chalk.gray(`  Ketik nomor [1-${svcs.length}]: `))) - 1;
  if (isNaN(n) || n < 0 || n >= svcs.length) { console.log(chalk.yellow('  Pilihan tidak valid.')); return null; }
  return svcs[n];
}

async function pickSlot(stubs, rl, sid) {
  const date = (await ask(rl, chalk.gray('  Tanggal (YYYY-MM-DD, Enter=hari ini): '))).trim();
  let r;
  try { r = await rpcGetSlots(stubs, sid, date); } catch (e) { handleError(e); return null; }
  if (!r.slots || r.slots.length === 0) { console.log(chalk.yellow(`\n  Tidak ada sesi tersedia untuk tanggal tersebut.`)); return null; }
  blank();
  console.log(chalk.bold(`  Pilih Sesi Kunjungan (${r.date}):`));
  div();
  r.slots.forEach((s, i) => {
    const avail = s.available !== undefined ? s.available : (s.capacity - s.booked_count);
    const bar   = chalk.cyan('█'.repeat(4 - avail)) + chalk.gray('░'.repeat(avail));
    console.log(`  [${chalk.bold.white(String(i+1).padStart(2))}] ${chalk.cyan(s.time)}  [${bar}] ${avail}/${s.capacity || 4} slot tersisa`);
  });
  div();
  const n = parseInt(await ask(rl, chalk.gray(`  Ketik nomor [1-${r.slots.length}]: `))) - 1;
  if (isNaN(n) || n < 0 || n >= r.slots.length) { console.log(chalk.yellow('  Pilihan tidak valid.')); return null; }
  return r.slots[n];
}

async function pickBooking(stubs, rl, statuses, label) {
  let bks;
  try { bks = await rpcGetBookings(stubs); } catch (e) { handleError(e); return null; }
  if (statuses) bks = bks.filter(b => statuses.includes(b.status));
  if (bks.length === 0) { console.log(chalk.yellow(`\n  Tidak ada booking dengan status ${(statuses||['semua']).join('/')}.`)); return null; }
  blank();
  console.log(chalk.bold(`  ${label || 'Pilih Booking'}:`));
  div();
  bks.forEach((b, i) => {
    const sc = { BOOKED: chalk.yellow, ARRIVED: chalk.cyan, CANCELLED: chalk.red, DONE: chalk.green }[b.status] || chalk.white;
    console.log(`  [${chalk.bold.white(i+1)}] ${chalk.bold(b.booking_code)} — ${b.service_name}`);
    console.log(`      ${chalk.cyan(b.slot_time)} (${b.slot_date}) | ${sc(b.status)} | Antrian: ${b.queue_number || '-'}`);
  });
  div();
  const n = parseInt(await ask(rl, chalk.gray(`  Ketik nomor [1-${bks.length}]: `))) - 1;
  if (isNaN(n) || n < 0 || n >= bks.length) { console.log(chalk.yellow('  Pilihan tidak valid.')); return null; }
  return bks[n];
}

// ══════════════════════════════════════════════════════════════════════════════
//   AUTH — cukup masukkan NIK
// ══════════════════════════════════════════════════════════════════════════════

async function authScreen(stubs, rl) {
  while (true) {
    banner();
    console.log(chalk.gray('  Masukkan NIK 16 digit Anda untuk melanjutkan.'));
    console.log(chalk.gray('  Demo: 3201234567890001 (Budi) · 3201234567890002 (Siti)'));
    blank();

    const nik = (await ask(rl, chalk.cyan('  NIK (16 digit): '))).trim();

    if (nik === '0' || nik.toLowerCase() === 'keluar') {
      return false;
    }

    if (!/^\d{16}$/.test(nik)) {
      console.log(chalk.yellow('  NIK harus tepat 16 digit angka.'));
      await ask(rl, chalk.gray('  Tekan Enter...'));
      continue;
    }

    // Try login first
    const loginResult = await new Promise(resolve => {
      stubs.svc.LoginCitizen({ nik }, (err, res) => {
        if (err && err.code === grpc.status.NOT_FOUND) return resolve({ found: false });
        if (err) { handleError(err); return resolve({ found: false, error: true }); }
        resolve({ found: true, res });
      });
    });

    if (loginResult.error) {
      await ask(rl, chalk.gray('  Tekan Enter...'));
      continue;
    }

    if (loginResult.found) {
      const { res } = loginResult;
      session = { nik: res.nik, nama: res.nama_lengkap, no_hp: res.no_hp, alamat: res.alamat };
      console.log(chalk.green(`\n  ✓ Selamat datang kembali, ${res.nama_lengkap}!`));
      await new Promise(r => setTimeout(r, 500));
      return true;
    }

    // NIK not found — offer registration
    blank();
    console.log(chalk.yellow(`  NIK ${nik} belum terdaftar.`));
    const daftar = (await ask(rl, chalk.cyan('  Daftar sekarang? (ya/tidak): '))).trim().toLowerCase();
    if (daftar !== 'ya' && daftar !== 'y') {
      await ask(rl, chalk.gray('  Tekan Enter...'));
      continue;
    }

    // Register flow
    blank();
    console.log(chalk.bold('  ── Pendaftaran Warga Baru ──'));
    div();
    const nama   = (await ask(rl, chalk.cyan('  Nama Lengkap : '))).trim();
    const hp     = (await ask(rl, chalk.cyan('  No. HP       : '))).trim();
    const alamat = (await ask(rl, chalk.cyan('  Alamat       : '))).trim();

    const regOk = await new Promise(resolve => {
      stubs.svc.RegisterCitizen({ nik, nama_lengkap: nama, no_hp: hp, alamat }, (err, res) => {
        if (err) { handleError(err); return resolve(false); }
        session = { nik, nama, no_hp: hp, alamat };
        console.log(chalk.green(`\n  ✓ ${res.message}`));
        resolve(true);
      });
    });

    if (regOk) {
      await new Promise(r => setTimeout(r, 500));
      return true;
    }
    await ask(rl, chalk.gray('  Tekan Enter...'));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//   MAIN MENU HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

async function menuBooking(stubs, rl) {
  console.log(chalk.bold('\n  ── Booking Layanan Baru ──'));
  const svc = await pickService(stubs, rl, 'Pilih layanan yang ingin dikunjungi');
  if (!svc) return;

  // Show requirements
  await new Promise((resolve) => {
    stubs.svc.GetServiceDetail({ service_id: svc.service_id }, (err, res) => {
      if (!err && res) {
        blank();
        console.log(chalk.bold(`  📋 Persyaratan ${res.name}:`));
        res.requirements.forEach((r, i) => console.log(chalk.white(`     ${i+1}. ${r}`)));
        console.log(chalk.yellow('\n  Pastikan dokumen di atas sudah lengkap sebelum datang.'));
      }
      resolve();
    });
  });

  const slot = await pickSlot(stubs, rl, svc.service_id);
  if (!slot) return;

  blank();
  console.log(chalk.white(`  Ringkasan Booking:`));
  console.log(chalk.white(`    Layanan  : ${svc.name}`));
  console.log(chalk.white(`    Jam      : ${chalk.cyan(slot.time)} — ${slot.date}`));
  console.log(chalk.white(`    Atas nama: ${session.nama} (${session.nik})`));
  const ok = (await ask(rl, chalk.yellow('\n  Konfirmasi booking? (ya/tidak): '))).trim().toLowerCase();
  if (ok !== 'ya' && ok !== 'y') { console.log(chalk.gray('  Dibatalkan.')); return; }

  return new Promise(resolve => {
    stubs.booking.CreateBooking({
      citizen_id: session.nik, citizen_name: session.nama,
      service_id: svc.service_id, slot_id: slot.slot_id,
    }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      blank();
      console.log(chalk.green.bold('  ✓ BOOKING BERHASIL'));
      div();
      console.log(`  Kode Booking  : ${chalk.bold.yellow(res.booking_code)}`);
      console.log(`  Layanan       : ${chalk.white(svc.name)}`);
      console.log(`  Jadwal        : ${chalk.cyan(res.slot_time)}, ${res.slot_date}`);
      div();
      console.log(chalk.bold.yellow('  ⚠ PENTING: Hadir & tunjukkan kode ini ke petugas SAMSAT'));
      console.log(chalk.gray(`  maksimal 15 menit SEBELUM sesi ${res.slot_time} dimulai!`));
      console.log(chalk.red(`  Booking akan OTOMATIS EXPIRED jika melewati batas waktu.`));
      resolve();
    });
  });
}

async function menuMyBookings(stubs) {
  let bks;
  try { bks = await rpcGetBookings(stubs); } catch (e) { handleError(e); return; }
  blank();
  console.log(chalk.bold(`  Riwayat Booking — ${session.nama}`));
  div();
  if (bks.length === 0) { console.log(chalk.gray('  Belum ada booking.')); return; }
  bks.forEach(b => {
    const sc = { BOOKED: chalk.yellow, ARRIVED: chalk.cyan, CANCELLED: chalk.red, DONE: chalk.green, CALLED: chalk.magenta, EXPIRED: chalk.gray }[b.status] || chalk.white;
    console.log(`  ${chalk.bold(b.booking_code)} — ${b.service_name}`);
    console.log(`    Jadwal : ${chalk.cyan(b.slot_time)} (${b.slot_date})`);
    console.log(`    Status : ${sc(b.status)}${b.queue_number ? ` | Nomor Antrian: ${chalk.bold(String(b.queue_number))}` : ''}`);
    if (b.status === 'BOOKED') {
      console.log(chalk.yellow(`    → Tunjukkan kode ${b.booking_code} ke petugas SAMSAT saat tiba (maks. 15 mnt sebelum sesi).`));
    }
    blank();
  });
}

async function menuCancel(stubs, rl) {
  console.log(chalk.bold('\n  ── Batalkan Booking ──'));
  const bk = await pickBooking(stubs, rl, ['BOOKED', 'ARRIVED'], 'Booking yang bisa dibatalkan');
  if (!bk) return;
  const ok = (await ask(rl, chalk.red(`  ⚠ Yakin batalkan ${bk.booking_code}? (ya/tidak): `))).trim().toLowerCase();
  if (ok !== 'ya' && ok !== 'y') { console.log(chalk.gray('  Dibatalkan.')); return; }

  return new Promise(resolve => {
    stubs.booking.CancelBooking({ booking_id: bk.booking_id, citizen_id: session.nik, reason: '' }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      console.log(chalk.green(`\n  ✓ ${res.message}`));
      resolve();
    });
  });
}

async function menuReschedule(stubs, rl) {
  console.log(chalk.bold('\n  ── Ubah Jadwal Kunjungan ──'));
  const bk = await pickBooking(stubs, rl, ['BOOKED'], 'Booking yang bisa diubah jadwalnya');
  if (!bk) return;
  console.log(chalk.gray(`\n  Jadwal saat ini: ${bk.slot_time} (${bk.slot_date})`));
  console.log(chalk.bold('  Pilih jadwal baru:'));
  const slot = await pickSlot(stubs, rl, bk.service_id);
  if (!slot) return;

  return new Promise(resolve => {
    stubs.booking.RescheduleBooking({ booking_id: bk.booking_id, citizen_id: session.nik, new_slot_id: slot.slot_id }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      console.log(chalk.green(`\n  ✓ Jadwal berhasil diubah ke ${chalk.cyan(res.new_slot_time)} (${res.new_slot_date}).`));
      resolve();
    });
  });
}

async function menuWatchQueue(stubs, rl) {
  const svc = await pickService(stubs, rl, 'Pilih layanan untuk dipantau');
  if (!svc) return;

  let myNum = 0;
  try {
    const bks = await rpcGetBookings(stubs);
    const arrived = bks.find(b => b.service_id === svc.service_id && (b.status === 'ARRIVED' || b.status === 'CALLED'));
    if (arrived) { myNum = arrived.queue_number; console.log(chalk.gray(`  Nomor antrian Anda: ${chalk.bold.white(myNum)}`)); }
    else console.log(chalk.gray('  Anda belum punya nomor antrian — memantau sebagai pengamat.'));
  } catch {}

  blank();
  console.log(chalk.cyan.bold(`  📡 Memantau Antrian — ${svc.name}`));
  console.log(chalk.gray('     Tekan Ctrl+C untuk kembali'));
  div();

  const stream = stubs.queue.WatchQueue({ service_id: svc.service_id, citizen_id: session.nik, my_queue_number: myNum });

  stream.on('data', (u) => {
    const t = u.timestamp ? new Date(u.timestamp).toLocaleTimeString('id-ID') : '--:--';
    switch (u.event_type) {
      case 'YOUR_TURN':
        blank();
        console.log(chalk.bgRed.bold.white('  ╔═══════════════════════════════════════════╗ '));
        console.log(chalk.bgRed.bold.white(`  ║  🔔  GILIRAN ANDA!  Nomor: ${String(u.your_number).padEnd(14)}║ `));
        console.log(chalk.bgRed.bold.white('  ║     Segera menuju loket pelayanan!        ║ '));
        console.log(chalk.bgRed.bold.white('  ╚═══════════════════════════════════════════╝ '));
        blank();
        break;
      case 'QUEUE_MOVED':
        console.log(chalk.gray(`  [${t}]`) + ` Dilayani: ${chalk.bold.white(u.current_number)} | Di depan Anda: ${chalk.cyan(u.people_ahead)} | ${chalk.yellow(u.estimated_wait)} | Total antrian: ${u.total_waiting}`);
        break;
      case 'QUOTA_EXHAUSTED':
        console.log(chalk.red(`  [${t}] ⚠ KUOTA HABIS — ${u.message}`)); break;
      case 'QUOTA_OPENED':
        console.log(chalk.green(`  [${t}] ✓ KUOTA DIBUKA — ${u.message}`)); break;
      case 'SERVICE_CLOSED':
        console.log(chalk.red(`  [${t}] 🚫 LAYANAN DITUTUP — ${u.message}`)); break;
      case 'SERVICE_RESUMED':
        console.log(chalk.green(`  [${t}] ✅ LAYANAN DIBUKA — ${u.message}`)); break;
      case 'ANNOUNCEMENT':
        console.log(chalk.yellow(`  [${t}] 📢 PENGUMUMAN: ${u.message}`)); break;
      default:
        console.log(chalk.gray(`  [${t}] ${u.event_type}: ${u.message}`));
    }
  });

  stream.on('error', (e) => { if (e.code !== grpc.status.CANCELLED) console.log(chalk.red(`\n  ${e.message}`)); });
  stream.on('end', () => console.log(chalk.gray('\n  Stream berakhir.')));

  await new Promise(() => {});
}

async function menuServiceInfo(stubs, rl) {
  let svcs;
  try { svcs = await rpcListServices(stubs); } catch (e) { handleError(e); return; }
  blank();
  console.log(chalk.bold('  📋 Informasi Layanan Tersedia'));
  div();
  svcs.forEach(s => {
    const st = s.is_open ? chalk.green('BUKA') : chalk.red('TUTUP');
    console.log(`  ${chalk.bold.white(s.short_code.padEnd(5))} ${s.name}`);
    console.log(`         ${st} | Kuota: ${chalk.cyan(s.quota_remaining)}/${s.daily_quota} | Jam: ${s.open_hour}–${s.close_hour}`);
    console.log(`         Lokasi: ${chalk.gray(s.location)}`);
    blank();
  });

  const detail = (await ask(rl, chalk.gray('  Lihat detail layanan? Ketik nomor (atau Enter untuk skip): '))).trim();
  if (detail) {
    const idx = parseInt(detail) - 1;
    if (idx >= 0 && idx < svcs.length) {
      await new Promise(resolve => {
        stubs.svc.GetServiceDetail({ service_id: svcs[idx].service_id }, (err, res) => {
          if (err) { handleError(err); return resolve(); }
          blank();
          console.log(chalk.bold(`  📋 ${res.name} (${res.short_code})`));
          div();
          console.log(`  Jam Operasional : ${res.open_hour} – ${res.close_hour}`);
          console.log(`  Kuota Hari Ini  : ${chalk.cyan(res.quota_remaining)}/${res.daily_quota}`);
          console.log(`  Lokasi          : ${res.location}`);
          console.log(`  Status          : ${res.is_open ? chalk.green('BUKA') : chalk.red('TUTUP')}`);
          console.log(`  Persyaratan     :`);
          res.requirements.forEach((r, i) => console.log(`     ${i+1}. ${r}`));
          resolve();
        });
      });
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//   MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  await loadChalk();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const creds = grpc.credentials.createInsecure();
  const stubs = {
    svc:     new (loadProto('service_info.proto')).ServiceInfoService(SERVER_ADDR, creds),
    booking: new (loadProto('booking.proto')).BookingService(SERVER_ADDR, creds),
    queue:   new (loadProto('queue.proto')).QueueService(SERVER_ADDR, creds),
  };

  // Auth screen
  const loggedIn = await authScreen(stubs, rl);
  if (!loggedIn) { console.log(chalk.cyan('\n  Sampai jumpa!\n')); process.exit(0); }

  let inMainMenu = true;
  let lastAnnouncementsStr = '';
  
  rl.setPrompt(chalk.bold('  Pilih menu: '));

  async function renderMainMenu(anns = null) {
    console.clear();
    await userBanner(stubs, anns);
    console.log(chalk.bold.white('  SAMSAT — Sistem Pelayanan Terpadu Kendaraan Bermotor'));
    div();
    console.log(chalk.yellow('  [1] Booking sesi kunjungan'));
    console.log(chalk.yellow('  [2] Lihat booking saya'));
    console.log(chalk.yellow('  [3] Ubah jadwal booking'));
    console.log(chalk.yellow('  [4] Batalkan booking'));
    console.log(chalk.yellow('  [5] Pantau antrian real-time'));
    console.log(chalk.yellow('  [6] Informasi layanan'));
    console.log(chalk.yellow('  [0] Keluar'));
    blank();
    if (inMainMenu) rl.prompt(true);
  }

  const pollInterval = setInterval(async () => {
    if (!inMainMenu) return;
    try {
      const res = await new Promise((resolve, reject) => {
        stubs.svc.GetAnnouncements({}, (err, d) => err ? reject(err) : resolve(d));
      });
      const newAnnStr = JSON.stringify(res.announcements || []);
      if (newAnnStr !== lastAnnouncementsStr) {
        lastAnnouncementsStr = newAnnStr;
        await renderMainMenu(res.announcements);
      }
    } catch(e) {}
  }, 2000);

  // Initial draw
  try {
    const res = await new Promise((resolve, reject) => {
      stubs.svc.GetAnnouncements({}, (err, d) => err ? reject(err) : resolve(d));
    });
    lastAnnouncementsStr = JSON.stringify(res.announcements || []);
    await renderMainMenu(res.announcements);
  } catch(e) {
    await renderMainMenu();
  }

  // Main loop
  while (true) {
    inMainMenu = true;
    const input = (await new Promise(resolve => rl.question('', resolve))).trim();
    if (!input) {
      if (inMainMenu) rl.prompt(true);
      continue;
    }
    
    inMainMenu = false; // Disables polling redraw while user is inside a menu
    
    switch (input) {
      case '1': await menuBooking(stubs, rl);        break;
      case '2': await menuMyBookings(stubs);          break;
      case '3': await menuReschedule(stubs, rl);      break;
      case '4': await menuCancel(stubs, rl);          break;
      case '5': await menuWatchQueue(stubs, rl);      break;
      case '6': await menuServiceInfo(stubs, rl);     break;
      case '0':
        console.log(chalk.cyan(`\n  Terima kasih, ${session.nama}. Sampai jumpa!\n`));
        clearInterval(pollInterval);
        rl.close(); process.exit(0);
      default: console.log(chalk.yellow('  Ketik angka 0–6.'));
    }
    await ask(rl, chalk.gray('\n  Tekan Enter untuk kembali ke menu Utama...'));
    
    // Force a redraw of main menu explicitly after coming back
    inMainMenu = true;
    try {
      const res = await new Promise((resolve, reject) => {
        stubs.svc.GetAnnouncements({}, (err, d) => err ? reject(err) : resolve(d));
      });
      lastAnnouncementsStr = JSON.stringify(res.announcements || []);
      await renderMainMenu(res.announcements);
    } catch(e) {
      await renderMainMenu();
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
