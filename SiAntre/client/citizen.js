// client/citizen.js
// Interactive CLI for citizens (warga). Connects to SiAntre gRPC server.

'use strict';

const grpc        = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const readline    = require('readline');
const path        = require('path');

// ── chalk v5 is ESM-only; dynamic import workaround for CJS ──────────────────
let chalk;
async function loadChalk() {
  const m = await import('chalk');
  chalk   = m.default;
}

const PROTO_DIR     = path.join(__dirname, '../proto');
const SERVER_ADDR   = process.env.SERVER || 'localhost:50051';
const LOADER_OPTS   = { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true };

function loadProto(file) {
  const def = protoLoader.loadSync(path.join(PROTO_DIR, file), LOADER_OPTS);
  return grpc.loadPackageDefinition(def).siantre;
}

// ── State ─────────────────────────────────────────────────────────────────────
let citizenId   = '';
let citizenName = '';

// ── Helpers ───────────────────────────────────────────────────────────────────
function question(rl, prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

function printHeader() {
  console.log('');
  console.log(chalk.cyan('╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.bold.white('        SiAntre — Antrian Digital         ') + chalk.cyan('║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════╝'));
  console.log(chalk.gray(`  Warga  : ${chalk.white(citizenName)} (${citizenId})`));
  console.log(chalk.gray(`  Server : ${chalk.white(SERVER_ADDR)}`));
  console.log('');
}

function printMenu() {
  const m = [
    '[1] Lihat semua layanan',
    '[2] Detail layanan',
    '[3] Cek slot tersedia',
    '[4] Booking slot',
    '[5] Lihat booking saya',
    '[6] Konfirmasi kedatangan',
    '[7] Batalkan booking',
    '[8] Reschedule booking',
    '[9] Pantau antrian real-time',
    '[0] Keluar',
  ];
  m.forEach(l => console.log(chalk.yellow('  ' + l)));
  console.log('');
}

function handleError(err) {
  if (!err) return;
  const code = err.code;
  const G = grpc.status;
  if (code === G.NOT_FOUND)            console.log(chalk.yellow(`  ✗ ${err.message}`));
  else if (code === G.RESOURCE_EXHAUSTED) console.log(chalk.red(`  ✗ ${err.message}`));
  else if (code === G.FAILED_PRECONDITION) console.log(chalk.yellow(`  ⚠ ${err.message}`));
  else if (code === G.PERMISSION_DENIED)   console.log(chalk.red(`  ✗ Akses ditolak: ${err.message}`));
  else if (code === G.INVALID_ARGUMENT)    console.log(chalk.yellow(`  ✗ Input tidak valid: ${err.message}`));
  else                                     console.log(chalk.red(`  ✗ Error: ${err.message}`));
}

// ── Menu handlers ─────────────────────────────────────────────────────────────

async function listServices(stubs, rl) {
  return new Promise(resolve => {
    stubs.svc.ListServices({}, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      console.log('');
      console.log(chalk.bold('  Daftar Layanan Tersedia:'));
      console.log(chalk.gray('  ' + '─'.repeat(60)));
      for (const s of res.services) {
        const status = s.is_open ? chalk.green('BUKA') : chalk.red('TUTUP');
        console.log(`  ${chalk.bold.white(s.short_code.padEnd(5))} ${s.name}`);
        console.log(`         Status: ${status} | Sisa Kuota: ${chalk.cyan(s.quota_remaining)}/${s.daily_quota} | ${s.open_hour}–${s.close_hour}`);
        console.log(`         Lokasi: ${chalk.gray(s.location)}`);
        console.log('');
      }
      resolve();
    });
  });
}

async function getServiceDetail(stubs, rl) {
  const sid = await question(rl, chalk.gray('  ID Layanan (SIM_BARU / KTP_BARU / PASPOR_BARU): '));
  return new Promise(resolve => {
    stubs.svc.GetServiceDetail({ service_id: sid.trim() }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      console.log('');
      console.log(chalk.bold(`  ${res.name} (${res.short_code})`));
      console.log(`  Jam: ${res.open_hour} – ${res.close_hour}`);
      console.log(`  Kuota: ${chalk.cyan(res.quota_remaining)}/${res.daily_quota} tersisa`);
      console.log(`  Lokasi: ${res.location}`);
      console.log(`  Status: ${res.is_open ? chalk.green('BUKA') : chalk.red('TUTUP')}`);
      console.log(`  Dokumen: ${res.requirements.join(', ')}`);
      resolve();
    });
  });
}

async function getAvailableSlots(stubs, rl) {
  const sid  = await question(rl, chalk.gray('  ID Layanan: '));
  const date = await question(rl, chalk.gray('  Tanggal (YYYY-MM-DD, kosong=hari ini): '));
  return new Promise(resolve => {
    stubs.svc.GetAvailableSlots({ service_id: sid.trim(), date: date.trim() }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      console.log('');
      console.log(chalk.bold(`  Slot Tersedia — ${res.service_id} (${res.date}):`));
      if (res.slots.length === 0) {
        console.log(chalk.yellow('  Tidak ada slot tersedia untuk tanggal ini.'));
      } else {
        res.slots.forEach((s, i) => {
          console.log(`  [${i + 1}] Slot ID: ${chalk.gray(s.slot_id)} | Jam: ${chalk.cyan(s.time)}`);
        });
      }
      resolve();
    });
  });
}

async function createBooking(stubs, rl) {
  const sid    = await question(rl, chalk.gray('  ID Layanan: '));
  const slotId = await question(rl, chalk.gray('  Slot ID: '));
  return new Promise(resolve => {
    stubs.booking.CreateBooking({ citizen_id: citizenId, citizen_name: citizenName, service_id: sid.trim(), slot_id: slotId.trim() }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      console.log('');
      console.log(chalk.green('  ✓ Booking berhasil!'));
      console.log(`  Kode Booking : ${chalk.bold.white(res.booking_code)}`);
      console.log(`  Booking ID   : ${chalk.gray(res.booking_id)}`);
      console.log(`  Jadwal       : ${chalk.cyan(res.slot_time)} — ${res.slot_date}`);
      console.log(`  Status       : ${chalk.yellow(res.status)}`);
      console.log(chalk.gray(`  ${res.message}`));
      resolve();
    });
  });
}

async function getMyBooking(stubs, rl) {
  return new Promise(resolve => {
    stubs.booking.GetMyBooking({ citizen_id: citizenId }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      console.log('');
      console.log(chalk.bold('  Booking Anda:'));
      if (res.bookings.length === 0) {
        console.log(chalk.yellow('  Belum ada booking.'));
      } else {
        res.bookings.forEach(b => {
          const statusColor = b.status === 'BOOKED' ? chalk.yellow : b.status === 'DONE' ? chalk.green : b.status === 'CANCELLED' ? chalk.red : chalk.cyan;
          console.log(`  ${chalk.bold(b.booking_code)} — ${b.service_name}`);
          console.log(`    ${b.slot_time} (${b.slot_date}) | Status: ${statusColor(b.status)} | No. Antrian: ${b.queue_number || '-'}`);
          console.log(chalk.gray(`    ID: ${b.booking_id}`));
          console.log('');
        });
      }
      resolve();
    });
  });
}

async function confirmArrival(stubs, rl) {
  const bid = await question(rl, chalk.gray('  Booking ID: '));
  return new Promise(resolve => {
    stubs.booking.ConfirmArrival({ booking_id: bid.trim(), citizen_id: citizenId }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      console.log('');
      console.log(chalk.green('  ✓ Kedatangan dikonfirmasi!'));
      console.log(`  Nomor Antrian : ${chalk.bold.cyan(res.queue_number)}`);
      console.log(`  Di depan Anda : ${res.people_ahead} orang`);
      console.log(`  Estimasi Tunggu: ${chalk.yellow(res.estimated_wait)}`);
      console.log(chalk.gray(`  ${res.message}`));
      resolve();
    });
  });
}

async function cancelBooking(stubs, rl) {
  const bid    = await question(rl, chalk.gray('  Booking ID: '));
  const reason = await question(rl, chalk.gray('  Alasan (opsional): '));
  return new Promise(resolve => {
    stubs.booking.CancelBooking({ booking_id: bid.trim(), citizen_id: citizenId, reason: reason.trim() }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      console.log(chalk.green(`\n  ✓ ${res.message}`));
      resolve();
    });
  });
}

async function rescheduleBooking(stubs, rl) {
  const bid    = await question(rl, chalk.gray('  Booking ID: '));
  const slotId = await question(rl, chalk.gray('  Slot ID baru: '));
  return new Promise(resolve => {
    stubs.booking.RescheduleBooking({ booking_id: bid.trim(), citizen_id: citizenId, new_slot_id: slotId.trim() }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      console.log('');
      console.log(chalk.green('  ✓ Jadwal berhasil diubah!'));
      console.log(`  Jadwal baru: ${chalk.cyan(res.new_slot_time)} — ${res.new_slot_date}`);
      resolve();
    });
  });
}

async function watchQueue(stubs, rl) {
  const sid      = await question(rl, chalk.gray('  ID Layanan: '));
  const numStr   = await question(rl, chalk.gray('  Nomor antrian Anda (0 jika belum): '));
  const myNumber = parseInt(numStr) || 0;

  console.log('');
  console.log(chalk.cyan(`  📡 Memantau antrian ${sid.trim()}...`));
  console.log(chalk.gray('     Tekan Ctrl+C untuk berhenti'));
  console.log(chalk.gray('  ' + '─'.repeat(50)));

  const stream = stubs.queue.WatchQueue({ service_id: sid.trim(), citizen_id: citizenId, my_queue_number: myNumber });

  stream.on('data', (update) => {
    const time = new Date(update.timestamp).toLocaleTimeString('id-ID');
    switch (update.event_type) {
      case 'YOUR_TURN':
        console.log('');
        console.log(chalk.bgRed.bold.white(' ══════════════════════════════════ '));
        console.log(chalk.bgRed.bold.white(` 🔔  GILIRAN ANDA! Nomor: ${update.your_number}          `));
        console.log(chalk.bgRed.bold.white('     Segera menuju loket!           '));
        console.log(chalk.bgRed.bold.white(' ══════════════════════════════════ '));
        console.log('');
        break;
      case 'QUEUE_MOVED':
        console.log(chalk.gray(`  [${time}]`) + ` Nomor dilayani: ${chalk.bold.white(update.current_number)} | Di depan: ${chalk.cyan(update.people_ahead)} | ${chalk.yellow(update.estimated_wait)}`);
        break;
      case 'QUOTA_EXHAUSTED':
        console.log(chalk.red(`  [${time}] ⚠ KUOTA HABIS — ${update.message}`));
        break;
      case 'QUOTA_OPENED':
        console.log(chalk.green(`  [${time}] ✓ KUOTA BARU DIBUKA — ${update.message}`));
        break;
      case 'SERVICE_CLOSED':
        console.log(chalk.red(`  [${time}] 🚫 LAYANAN DITUTUP — ${update.message}`));
        break;
      case 'SERVICE_RESUMED':
        console.log(chalk.green(`  [${time}] ✅ LAYANAN DIBUKA KEMBALI — ${update.message}`));
        break;
      case 'ANNOUNCEMENT':
        console.log(chalk.yellow(`  [${time}] 📢 PENGUMUMAN: ${update.message}`));
        break;
      default:
        console.log(chalk.gray(`  [${time}] ${update.event_type}: ${update.message}`));
    }
  });

  stream.on('error', (err) => {
    if (err.code === grpc.status.CANCELLED) return;
    console.log(chalk.red(`\n  Stream error: ${err.message}`));
  });

  stream.on('end', () => {
    console.log(chalk.gray('\n  Stream selesai.'));
  });

  // Keep alive until user kills it
  await new Promise(() => {});
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main() {
  await loadChalk();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('');
  citizenId   = await question(rl, chalk.cyan('  ID Warga (misal: WARGA_01): '));
  citizenName = await question(rl, chalk.cyan('  Nama Anda: '));
  citizenId   = citizenId.trim() || 'WARGA_01';
  citizenName = citizenName.trim() || 'Warga';

  // Build stubs
  const creds   = grpc.credentials.createInsecure();
  const svcProto     = (() => { const d = protoLoader.loadSync(path.join(PROTO_DIR,'service_info.proto'), LOADER_OPTS); return grpc.loadPackageDefinition(d).siantre; })();
  const bookingProto = (() => { const d = protoLoader.loadSync(path.join(PROTO_DIR,'booking.proto'), LOADER_OPTS); return grpc.loadPackageDefinition(d).siantre; })();
  const queueProto   = (() => { const d = protoLoader.loadSync(path.join(PROTO_DIR,'queue.proto'), LOADER_OPTS); return grpc.loadPackageDefinition(d).siantre; })();

  const stubs = {
    svc:     new svcProto.ServiceInfoService(SERVER_ADDR, creds),
    booking: new bookingProto.BookingService(SERVER_ADDR, creds),
    queue:   new queueProto.QueueService(SERVER_ADDR, creds),
  };

  while (true) {
    printHeader();
    printMenu();
    const choice = await question(rl, chalk.bold('  Pilih menu: '));

    switch (choice.trim()) {
      case '1': await listServices(stubs, rl);      break;
      case '2': await getServiceDetail(stubs, rl);  break;
      case '3': await getAvailableSlots(stubs, rl); break;
      case '4': await createBooking(stubs, rl);     break;
      case '5': await getMyBooking(stubs, rl);      break;
      case '6': await confirmArrival(stubs, rl);    break;
      case '7': await cancelBooking(stubs, rl);     break;
      case '8': await rescheduleBooking(stubs, rl); break;
      case '9': await watchQueue(stubs, rl);        break;
      case '0': console.log(chalk.cyan('\n  Sampai jumpa!\n')); rl.close(); process.exit(0);
      default:  console.log(chalk.yellow('  Pilihan tidak valid.'));
    }

    await question(rl, chalk.gray('\n  Tekan Enter untuk kembali ke menu...'));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
