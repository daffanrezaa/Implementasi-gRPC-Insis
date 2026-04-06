// client/admin.js
// Panel Petugas SiAntre — NIP+PIN login, Live Dashboard, clean flow.

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

// ── Session ───────────────────────────────────────────────────────────────────
let officer = { id_pegawai: '', nama: '', jabatan: '', role: '' };

// ── Helpers ───────────────────────────────────────────────────────────────────
function div()   { console.log(chalk.gray('  ' + '─'.repeat(55))); }
function blank() { console.log(''); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function headerBanner() {
  blank();
  console.log(chalk.magenta('  ╔════════════════════════════════════════════════════╗'));
  console.log(chalk.magenta('  ║') + chalk.bold.white('     SiAntre — Panel Petugas & Administrator        ') + chalk.magenta('║'));
  console.log(chalk.magenta('  ╚════════════════════════════════════════════════════╝'));
  console.log(chalk.gray(`  Petugas : ${chalk.white.bold(officer.nama)} — ${chalk.white(officer.jabatan)}`));
  console.log(chalk.gray(`  ID      : ${chalk.white(officer.id_pegawai)} | Role: ${chalk.yellow(officer.role)}`));
  console.log(chalk.gray(`  Server  : ${chalk.white(SERVER_ADDR)}`));
  blank();
}

function handleError(err) {
  if (!err) return;
  const msg = err.details || err.message;
  console.log(chalk.red(`\n  ✗ ${msg}`));
}

// ── Data helpers ──────────────────────────────────────────────────────────────
function rpcListServices(stubs) {
  return new Promise((res, rej) => stubs.svc.ListServices({}, (e, r) => e ? rej(e) : res(r.services)));
}
function rpcGetQueueStatus(stubs, sid) {
  return new Promise((res, rej) => stubs.queue.GetQueueStatus({ service_id: sid }, (e, r) => e ? rej(e) : res(r)));
}

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
  const n = parseInt(await ask(rl, chalk.gray(`  Pilih [1-${svcs.length}]: `))) - 1;
  if (isNaN(n) || n < 0 || n >= svcs.length) { console.log(chalk.yellow('  Pilihan tidak valid.')); return null; }
  return svcs[n];
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOGIN — NIP + PIN via gRPC
// ══════════════════════════════════════════════════════════════════════════════

async function loginScreen(stubs, rl) {
  // Check if system is initialized
  const sysInit = await new Promise(resolve => {
    stubs.admin.IsSystemInitialized({}, (err, res) => {
      if (err) { handleError(err); resolve(true); return; } // assume initialized on error
      resolve(res.initialized);
    });
  });

  if (!sysInit) {
    blank();
    console.log(chalk.red.bold('  ╔════════════════════════════════════════════════════╗'));
    console.log(chalk.red.bold('  ║           SISTEM BELUM DIINISIALISASI              ║'));
    console.log(chalk.red.bold('  ╚════════════════════════════════════════════════════╝'));
    console.log(chalk.gray('  Belum ada akun petugas yang terdaftar di dalam sistem.'));
    console.log(chalk.gray('  Silakan lakukan Setup Awal untuk membuat akun Admin pertama.'));
    blank();

    const id_pegawai = (await ask(rl, chalk.cyan('  ID Pegawai : '))).trim().toUpperCase();
    const nama       = (await ask(rl, chalk.cyan('  Nama Admin : '))).trim();
    const pin        = (await ask(rl, chalk.cyan('  PIN Baru   : '))).trim();

    const ok = await new Promise(resolve => {
      stubs.admin.RegisterOfficer({
        id_pegawai, nama, jabatan: 'Administrator', role: 'ADMIN', pin
      }, (err, res) => {
        if (err) { handleError(err); resolve(false); return; }
        console.log(chalk.green(`\n  ✓ SETUP BERHASIL: ${res.message}`));
        resolve(true);
      });
    });

    if (!ok) return false;
    await ask(rl, chalk.gray('  Tekan Enter untuk melanjutkan ke login...'));
  }

  blank();
  console.log(chalk.magenta('  ╔════════════════════════════════════════════════════╗'));
  console.log(chalk.magenta('  ║') + chalk.bold.white('     SiAntre — Panel Petugas                        ') + chalk.magenta('║'));
  console.log(chalk.magenta('  ╚════════════════════════════════════════════════════╝'));
  blank();
  console.log(chalk.gray('  Silakan masuk menggunakan ID Pegawai dan PIN Anda.'));
  blank();

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) console.log(chalk.gray(`\n  Percobaan ${attempt}/3`));
    const id_pegawai = (await ask(rl, chalk.cyan('  ID Pegawai : '))).trim().toUpperCase();
    const pin        = (await ask(rl, chalk.cyan('  PIN        : '))).trim();

    const ok = await new Promise(resolve => {
      stubs.admin.LoginOfficer({ id_pegawai, pin }, (err, res) => {
        if (err) { handleError(err); resolve(false); return; }
        officer = { id_pegawai: res.id_pegawai, nama: res.nama, jabatan: res.jabatan, role: res.role };
        console.log(chalk.green(`\n  ✓ ${res.message}`));
        resolve(true);
      });
    });
    if (ok) return true;
  }

  console.log(chalk.red('\n  Login gagal. Silakan hubungi admin.'));
  return false;
}

// ══════════════════════════════════════════════════════════════════════════════
//  MENU HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

// ── [1] Live Dashboard ───────────────────────────────────────────────────────

async function menuLiveDashboard(stubs, rl) {
  let svcs;
  try { svcs = await rpcListServices(stubs); } catch (e) { handleError(e); return; }

  const snapshots = {};
  svcs.forEach(s => {
    snapshots[s.service_id] = {
      name: s.name, short_code: s.short_code,
      current: 0, waiting: 0, quota_rem: s.quota_remaining,
      quota_total: s.daily_quota, is_open: s.is_open,
    };
  });

  // Pre-fetch actual queue status
  await Promise.all(svcs.map(s =>
    rpcGetQueueStatus(stubs, s.service_id).then(r => {
      const snap = snapshots[s.service_id];
      snap.current = r.current_number; snap.waiting = r.total_waiting;
      snap.quota_rem = r.quota_remaining; snap.is_open = r.is_open;
    }).catch(() => {})
  ));

  rl.setPrompt(chalk.magenta('\n  > '));

  function renderDashboard() {
    console.clear();
    blank();
    console.log(chalk.magenta.bold('  ╔══════════════════════════════════════════════════════╗'));
    console.log(chalk.magenta.bold('  ║         DASHBOARD LIVE — ANTRIAN HARI INI            ║'));
    console.log(chalk.magenta.bold('  ╚══════════════════════════════════════════════════════╝'));
    console.log(chalk.gray(`  ${officer.nama} — ${officer.jabatan} | ${new Date().toLocaleTimeString('id-ID')}`));
    blank();

    svcs.forEach((s, i) => {
      const snap = snapshots[s.service_id];
      const st   = snap.is_open ? chalk.green('● BUKA') : chalk.red('● TUTUP');
      const pct  = snap.quota_total > 0 ? Math.round((1 - snap.quota_rem / snap.quota_total) * 100) : 0;
      const bar  = Math.round(pct / 5);
      const vis  = chalk.cyan('█'.repeat(bar)) + chalk.gray('░'.repeat(20 - bar));

      console.log(chalk.bold(`  [${i + 1}] ${s.short_code} — ${snap.name}`));
      console.log(`      Status   : ${st}`);
      console.log(`      Dilayani : ${chalk.bold.white(snap.current || '-')}`);
      console.log(`      Menunggu : ${chalk.cyan(snap.waiting)} orang`);
      console.log(`      Kuota    : [${vis}] ${chalk.white(pct + '%')} (${snap.quota_rem} tersisa)`);
      blank();
    });

    div();
    console.log(chalk.yellow('  PANGGIL [1/2/3]              ') + chalk.gray('panggil nomor berikutnya'));
    console.log(chalk.yellow('  UMUMKAN [1/2/3/0] [pesan]    ') + chalk.gray('broadcast (0=semua)'));
    console.log(chalk.yellow('  TUTUP [1/2/3]                ') + chalk.gray('tutup layanan sementara'));
    console.log(chalk.yellow('  BUKA [1/2/3]                 ') + chalk.gray('buka kembali layanan'));
    console.log(chalk.yellow('  KELUAR                       ') + chalk.gray('kembali ke menu utama'));
    div();

    if (!exiting) {
      rl.prompt(true);
    }
  }

  const stream = stubs.admin.AdminSession();
  let exiting  = false;

  // Polling every 3 seconds
  const pollInterval = setInterval(() => {
    if (!exiting) {
      stream.write({ command_type: 'GET_STATS', service_id: '', officer_id: officer.id_pegawai, payload: '' });
    }
  }, 3000);

  stream.on('data', (event) => {
    if (exiting) return;
    let payload = {};
    try { payload = JSON.parse(event.payload || '{}'); } catch {}

    if (event.event_type === 'QUEUE_UPDATE' && event.service_id && snapshots[event.service_id]) {
      const snap = snapshots[event.service_id];
      if (payload.called_number) snap.current = payload.called_number;
      if (payload.total_waiting !== undefined) snap.waiting = payload.total_waiting;
    } else if (event.event_type === 'STATS_SNAPSHOT' && payload.per_service) {
      payload.per_service.forEach(s => {
        if (snapshots[s.service_id]) {
          Object.assign(snapshots[s.service_id], {
            quota_rem: s.quota_remaining, waiting: s.waiting_count,
            current: s.current_number, is_open: s.is_open,
          });
        }
      });
    } else if (event.event_type === 'ACK') {
      // Silently acknowledged — dashboard will refresh on next render
    } else if (event.event_type === 'ERROR') {
      console.log(chalk.red(`\n  ✗ ${payload.message || 'Error'}`));
    }

    if (!exiting) renderDashboard();
  });

  stream.on('error', (e) => {
    if (!exiting && e.code !== grpc.status.CANCELLED) console.log(chalk.red(`  Stream error: ${e.message}`));
  });
  stream.on('end', () => { /* silent */ });

  renderDashboard();

  function resolveIdx(token) {
    const n = parseInt(token) - 1;
    if (!isNaN(n) && n >= 0 && n < svcs.length) return svcs[n].service_id;
    return null;
  }

  while (true) {
    const input = (await new Promise(resolve => rl.question('', resolve))).trim();
    if (!input) {
      rl.prompt(true);
      continue;
    }
    const parts = input.split(/\s+/);
    const cmd   = parts[0].toUpperCase();

    if (cmd === 'KELUAR' || cmd === 'EXIT') {
      exiting = true;
      clearInterval(pollInterval);
      stream.end();
      await sleep(300);
      break;
    }

    switch (cmd) {
      case 'PANGGIL': {
        const sid = resolveIdx(parts[1]);
        if (!sid) { console.log(chalk.yellow('  → PANGGIL [1/2/3]')); break; }
        stream.write({ command_type: 'CALL_NEXT', service_id: sid, officer_id: officer.id_pegawai, payload: '' });
        await sleep(500);
        // Refresh stats
        stream.write({ command_type: 'GET_STATS', service_id: '', officer_id: officer.id_pegawai, payload: '' });
        await sleep(300);
        break;
      }
      case 'UMUMKAN': {
        let sid = '';
        if (parts[1] !== '0') {
          sid = resolveIdx(parts[1]);
          if (sid === null) { console.log(chalk.yellow('  → UMUMKAN [1/2/3/0] [pesan]')); break; }
        }
        const msg = parts.slice(2).join(' ');
        if (!msg) { console.log(chalk.yellow('  → UMUMKAN [1/2/3/0] [pesan]')); break; }
        stream.write({ command_type: 'ANNOUNCE', service_id: sid || '', officer_id: officer.id_pegawai, payload: JSON.stringify({ message: msg }) });
        await sleep(400);
        break;
      }
      case 'TUTUP': {
        const sid = resolveIdx(parts[1]);
        if (!sid) { console.log(chalk.yellow('  → TUTUP [1/2/3]')); break; }
        stream.write({ command_type: 'PAUSE', service_id: sid, officer_id: officer.id_pegawai, payload: '' });
        if (snapshots[sid]) snapshots[sid].is_open = false;
        await sleep(400);
        renderDashboard();
        break;
      }
      case 'BUKA': {
        const sid = resolveIdx(parts[1]);
        if (!sid) { console.log(chalk.yellow('  → BUKA [1/2/3]')); break; }
        stream.write({ command_type: 'RESUME', service_id: sid, officer_id: officer.id_pegawai, payload: '' });
        if (snapshots[sid]) snapshots[sid].is_open = true;
        await sleep(400);
        renderDashboard();
        break;
      }
      default:
        console.log(chalk.yellow('  Command: PANGGIL | UMUMKAN | TUTUP | BUKA | KELUAR'));
    }
  }
}

// ── [2] Panggil Nomor ────────────────────────────────────────────────────────

async function menuCallNext(stubs, rl) {
  const svc = await pickService(stubs, rl, 'Pilih layanan — Panggil Nomor Berikutnya');
  if (!svc) return;
  return new Promise(resolve => {
    stubs.queue.CallNext({ service_id: svc.service_id, officer_id: officer.id_pegawai }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      blank();
      console.log(chalk.green.bold('  ✓ NOMOR DIPANGGIL'));
      div();
      console.log(`  Layanan          : ${svc.name}`);
      console.log(`  Nomor dipanggil  : ${chalk.bold.white(res.called_number)}`);
      console.log(`  Sisa antrian     : ${chalk.cyan(res.total_waiting)} orang`);
      console.log(`  Warga diberitahu : ${chalk.cyan(res.broadcast_count)} warga terhubung`);
      div();
      resolve();
    });
  });
}

// ── [3] Status Antrian ───────────────────────────────────────────────────────

async function menuQueueStatus(stubs, rl) {
  const svc = await pickService(stubs, rl, 'Pilih layanan');
  if (!svc) return;
  return new Promise(resolve => {
    stubs.queue.GetQueueStatus({ service_id: svc.service_id }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      blank();
      console.log(chalk.bold(`  📊 Status Antrian — ${res.service_name}`));
      div();
      console.log(`  Status          : ${res.is_open ? chalk.green('BUKA') : chalk.red('TUTUP')}`);
      console.log(`  Nomor dilayani  : ${chalk.bold.white(res.current_number || '-')}`);
      console.log(`  Total menunggu  : ${chalk.cyan(res.total_waiting)} orang`);
      console.log(`  Kuota tersisa   : ${chalk.cyan(res.quota_remaining)}`);
      if (res.waiting_numbers && res.waiting_numbers.length > 0) {
        console.log(`  Daftar antrian  : ${chalk.gray('[' + res.waiting_numbers.join(', ') + ']')}`);
      }
      div();
      resolve();
    });
  });
}

// ── [4] Reset Kuota ──────────────────────────────────────────────────────────

async function menuResetQuota(stubs, rl) {
  let svcs;
  try { svcs = await rpcListServices(stubs); } catch (e) { handleError(e); return; }
  blank();
  console.log(chalk.bold('  Reset Kuota Harian:'));
  div();
  console.log(`  [${chalk.bold.white(0)}] Semua layanan sekaligus`);
  svcs.forEach((s, i) => console.log(`  [${chalk.bold.white(i + 1)}] ${s.short_code} — ${s.name}`));
  div();

  const n   = parseInt(await ask(rl, chalk.gray(`  Pilih [0-${svcs.length}]: `)));
  if (isNaN(n) || n < 0 || n > svcs.length) { console.log(chalk.yellow('  Pilihan tidak valid.')); return; }
  const sid   = n === 0 ? '' : svcs[n - 1].service_id;
  const label = n === 0 ? 'SEMUA layanan' : svcs[n - 1].name;

  const ok = (await ask(rl, chalk.red(`\n  ⚠ Reset kuota ${label}? Antrian aktif akan dihapus. (ya/tidak): `))).trim().toLowerCase();
  if (ok !== 'ya' && ok !== 'y') { console.log(chalk.gray('  Dibatalkan.')); return; }

  return new Promise(resolve => {
    stubs.admin.ResetDailyQuota({ service_id: sid }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      console.log(chalk.green(`\n  ✓ ${res.message}`));
      resolve();
    });
  });
}

// ── [5] Broadcast ────────────────────────────────────────────────────────────

async function menuBroadcast(stubs, rl) {
  let svcs;
  try { svcs = await rpcListServices(stubs); } catch (e) { handleError(e); return; }
  blank();
  console.log(chalk.bold('  Broadcast Pengumuman:'));
  console.log(chalk.gray('  Pengumuman dikirim ke warga yang sedang memantau antrian (streaming).'));
  div();
  console.log(`  [${chalk.bold.white(0)}] Semua layanan`);
  svcs.forEach((s, i) => console.log(`  [${chalk.bold.white(i + 1)}] ${s.short_code} — ${s.name}`));
  div();

  const n   = parseInt(await ask(rl, chalk.gray(`  Pilih [0-${svcs.length}]: `)));
  if (isNaN(n) || n < 0 || n > svcs.length) { console.log(chalk.yellow('  Pilihan tidak valid.')); return; }
  const sid = n === 0 ? '' : svcs[n - 1].service_id;

  const msg = (await ask(rl, chalk.magenta('  Pesan: '))).trim();
  if (!msg) { console.log(chalk.yellow('  Pesan tidak boleh kosong.')); return; }

  return new Promise(resolve => {
    const stream = stubs.admin.AdminSession();
    stream.on('data', (event) => {
      let d = {};
      try { d = JSON.parse(event.payload); } catch {}
      if (event.event_type === 'ACK') {
        const count = d.recipients_count || 0;
        if (count > 0) {
          console.log(chalk.green(`\n  ✓ Pengumuman tersimpan dan ditarik live ke ${count} warga.`));
        } else {
          console.log(chalk.green(`\n  ✓ Pengumuman berhasil disimpan di papan pengumuman warga.`));
        }
        stream.end(); resolve();
      } else if (event.event_type === 'ERROR') {
        console.log(chalk.red(`\n  ✗ ${d.message}`));
        stream.end(); resolve();
      }
    });
    stream.on('error', e => { if (e.code !== grpc.status.CANCELLED) { handleError(e); resolve(); } });
    stream.write({ command_type: 'ANNOUNCE', service_id: sid, officer_id: officer.id_pegawai, payload: JSON.stringify({ message: msg }) });
  });
}

// ── [6] Statistik ────────────────────────────────────────────────────────────

async function menuStats(stubs) {
  return new Promise(resolve => {
    stubs.admin.GetSystemStats({}, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      blank();
      console.log(chalk.bold('  📈 Statistik Sistem Hari Ini'));
      div();
      console.log(`  Total Booking      : ${chalk.cyan(res.total_bookings_today)}`);
      console.log(`  Sudah Dilayani     : ${chalk.green(res.total_served_today)}`);
      console.log(`  Dibatalkan         : ${chalk.red(res.total_cancelled_today)}`);
      console.log(`  Warga Terhubung    : ${chalk.cyan(res.active_subscribers)} subscriber aktif`);
      blank();
      console.log(chalk.bold('  Per Layanan:'));
      div();
      res.per_service.forEach(s => {
        const pct = s.quota_total > 0 ? Math.round((s.quota_used / s.quota_total) * 100) : 0;
        const bar = chalk.cyan('█'.repeat(Math.round(pct / 5))) + chalk.gray('░'.repeat(20 - Math.round(pct / 5)));
        console.log(`  ${chalk.bold(s.service_name)} ${s.is_open ? chalk.green('BUKA') : chalk.red('TUTUP')}`);
        console.log(`  [${bar}] ${pct}% — ${s.quota_used}/${s.quota_total} terpakai`);
        console.log(`  Menunggu: ${chalk.cyan(s.waiting_count)} | Dilayani: ${chalk.white(s.current_number || '-')}`);
        blank();
      });
      resolve();
    });
  });
}

// ── [7] Kelola Akun (Admin) ───────────────────────────────────────────────────

async function menuRegisterOfficer(stubs, rl) {
  if (officer.role !== 'ADMIN') {
    console.log(chalk.red('\n  ✗ Akses ditolak. Hanya Admin yang dapat mendaftarkan petugas.'));
    return;
  }
  
  blank();
  console.log(chalk.bold('  Tambah Akun Petugas Baru'));
  div();
  const id_pegawai = (await ask(rl, chalk.cyan('  ID Pegawai : '))).trim().toUpperCase();
  const nama       = (await ask(rl, chalk.cyan('  Nama Lengkap: '))).trim();
  const role       = (await ask(rl, chalk.cyan('  Role (PETUGAS/ADMIN): '))).trim().toUpperCase();
  const pin        = (await ask(rl, chalk.cyan('  PIN (6 digit): '))).trim();

  // Re-auth admin pin for security
  const adminPin   = (await ask(rl, chalk.gray('  Masukkan PIN Anda untuk konfirmasi: '))).trim();

  return new Promise(resolve => {
    stubs.admin.RegisterOfficer({
      requester_id: officer.id_pegawai, requester_pin: adminPin,
      id_pegawai, nama, role, pin
    }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      console.log(chalk.green(`\n  ✓ ${res.message}`));
      resolve();
    });
  });
}

// ── [8] Lihat Daftar Petugas (Admin) ──────────────────────────────────────────

async function menuListOfficers(stubs, rl) {
  if (officer.role !== 'ADMIN') return;
  const adminPin = (await ask(rl, chalk.gray('  Masukkan PIN Anda untuk lanjut: '))).trim();
  
  return new Promise(resolve => {
    stubs.admin.ListOfficers({ requester_id: officer.id_pegawai, requester_pin: adminPin }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      blank();
      console.log(chalk.bold('  Daftar Petugas Terdaftar'));
      div();
      res.officers.forEach(o => {
        const rColor = o.role === 'ADMIN' ? chalk.yellow : chalk.cyan;
        console.log(`  ${chalk.bold(o.id_pegawai)} — ${o.nama}`);
        console.log(`         Jabatan: ${o.jabatan} | Role: ${rColor(o.role)}`);
      });
      div();
      resolve();
    });
  });
}

// ── [9] Ubah Data Petugas (Admin) ──────────────────────────────────────────

async function menuUpdateOfficer(stubs, rl) {
  if (officer.role !== 'ADMIN') return;
  
  const id_pegawai = (await ask(rl, chalk.cyan('  ID Pegawai yang akan diubah: '))).trim().toUpperCase();
  if (!id_pegawai) return;

  console.log(chalk.gray('  (Kosongkan kolom jika tidak ingin mengubah data tersebut)'));
  const new_nama    = (await ask(rl, chalk.cyan('  Nama Baru    : '))).trim();
  const new_role    = (await ask(rl, chalk.cyan('  Role Baru (PETUGAS/ADMIN): '))).trim().toUpperCase();
  const new_pin     = (await ask(rl, chalk.cyan('  PIN Baru     : '))).trim();

  const adminPin    = (await ask(rl, chalk.gray('\n  Masukkan PIN Anda untuk konfirmasi: '))).trim();

  return new Promise(resolve => {
    stubs.admin.UpdateOfficer({
      requester_id: officer.id_pegawai, requester_pin: adminPin,
      id_pegawai, new_nama, new_role, new_pin
    }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      console.log(chalk.green(`\n  ✓ ${res.message}`));
      resolve();
    });
  });
}

// ── [10] Hapus Petugas (Admin) ─────────────────────────────────────────────

async function menuDeleteOfficer(stubs, rl) {
  if (officer.role !== 'ADMIN') return;
  
  const id_pegawai = (await ask(rl, chalk.cyan('  ID Pegawai yang akan dihapus: '))).trim().toUpperCase();
  if (!id_pegawai) return;

  const ok = (await ask(rl, chalk.red(`  ⚠ Yakin ingin MENGHAPUS petugas '${id_pegawai}'? (ya/tidak): `))).trim().toLowerCase();
  if (ok !== 'ya' && ok !== 'y') { console.log(chalk.gray('  Dibatalkan.')); return; }

  const adminPin = (await ask(rl, chalk.gray('  Masukkan PIN Anda untuk konfirmasi: '))).trim();

  return new Promise(resolve => {
    stubs.admin.DeleteOfficer({
      requester_id: officer.id_pegawai, requester_pin: adminPin, id_pegawai
    }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      console.log(chalk.green(`\n  ✓ ${res.message}`));
      resolve();
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  CHECK-IN & WALK-IN
// ══════════════════════════════════════════════════════════════════════════════

// ── Check-In Warga ────────────────────────────────────────────────────────────

async function menuCheckIn(stubs, rl) {
  console.log(chalk.bold('\n  ── Check-In Warga ──'));
  console.log(chalk.gray('  Masukkan kode booking yang ditunjukkan warga.'));
  div();
  const booking_code = (await ask(rl, chalk.cyan('  Kode Booking : '))).trim().toUpperCase();
  if (!booking_code) { console.log(chalk.yellow('  Kode booking tidak boleh kosong.')); return; }

  return new Promise(resolve => {
    stubs.admin.CheckInCitizen({
      officer_id: officer.id_pegawai, booking_code
    }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      blank();
      console.log(chalk.green.bold('  ✓ CHECK-IN BERHASIL'));
      div();
      console.log(`  Nama Warga     : ${chalk.bold.white(res.citizen_name)}`);
      console.log(`  Layanan        : ${chalk.white(res.service_name)}`);
      console.log(`  Nomor Antrian  : ${chalk.bold.cyan(res.queue_number)}`);
      console.log(`  Di Depan       : ${res.people_ahead} orang`);
      console.log(`  Estimasi Tunggu: ${chalk.yellow(res.estimated_wait)}`);
      div();
      console.log(chalk.gray(res.message));
      resolve();
    });
  });
}

// ── Walk-In Warga ─────────────────────────────────────────────────────────────

async function menuWalkIn(stubs, rl) {
  console.log(chalk.bold('\n  ── Walk-In Warga ──'));
  console.log(chalk.gray('  Daftarkan warga yang datang tanpa booking online.'));
  div();
  const svc = await pickService(stubs, rl, 'Pilih layanan untuk warga walk-in');
  if (!svc) return;

  const citizen_name = (await ask(rl, chalk.cyan('  Nama Warga   : '))).trim();
  if (!citizen_name) { console.log(chalk.yellow('  Nama tidak boleh kosong.')); return; }
  
  blank();
  console.log(chalk.white(`  Ringkasan Walk-In:`));
  console.log(chalk.white(`    Layanan   : ${svc.name}`));
  console.log(chalk.white(`    Nama      : ${citizen_name}`));
  const ok = (await ask(rl, chalk.yellow('\n  Konfirmasi? (ya/tidak): '))).trim().toLowerCase();
  if (ok !== 'ya' && ok !== 'y') { console.log(chalk.gray('  Dibatalkan.')); return; }

  return new Promise(resolve => {
    stubs.admin.WalkInCitizen({
      officer_id: officer.id_pegawai,
      citizen_name,
      service_id: svc.service_id,
    }, (err, res) => {
      if (err) { handleError(err); return resolve(); }
      blank();
      console.log(chalk.green.bold('  ✓ WALK-IN BERHASIL'));
      div();
      console.log(`  Kode Booking   : ${chalk.bold.yellow(res.booking_code)}`);
      console.log(`  Nomor Antrian  : ${chalk.bold.cyan(res.queue_number)}`);
      console.log(`  Di Depan       : ${res.people_ahead} orang`);
      resolve();
    });
  });
}

// ── Manajemen Kedatangan & Panggilan ──────────────────────────────────────────

async function menuArrivalManagement(stubs, rl) {
  console.log(chalk.bold('\n  ── Manajemen Kedatangan & Panggilan ──'));
  div();
  console.log(chalk.yellow('  [1] Check-In Warga              ') + chalk.gray('konfirmasi kedatangan warga dari booking online'));
  console.log(chalk.yellow('  [2] Walk-In Warga               ') + chalk.gray('daftarkan warga tanpa rsvp / walk-in'));
  console.log(chalk.yellow('  [3] Panggil Nomor Berikutnya    ') + chalk.gray('panggil tiket dari antrian untuk dilayani'));
  console.log(chalk.yellow('  [0] Batal / Kembali'));
  blank();

  const c = (await ask(rl, chalk.bold('  Pilih opsi [0-3]: '))).trim();
  switch (c) {
    case '1': await menuCheckIn(stubs, rl); break;
    case '2': await menuWalkIn(stubs, rl); break;
    case '3': await menuCallNext(stubs, rl); break;
    case '0': console.log(chalk.gray('  Dibatalkan.')); return;
    default: console.log(chalk.yellow('  Pilihan tidak valid.'));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  await loadChalk();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const creds = grpc.credentials.createInsecure();
  const stubs = {
    svc:   new (loadProto('service_info.proto')).ServiceInfoService(SERVER_ADDR, creds),
    queue: new (loadProto('queue.proto')).QueueService(SERVER_ADDR, creds),
    admin: new (loadProto('admin.proto')).AdminService(SERVER_ADDR, creds),
  };

  // Login
  const ok = await loginScreen(stubs, rl);
  if (!ok) {
    console.log(chalk.magenta('\n  Keluar.\n'));
    rl.close(); process.exit(0);
  }

  await sleep(500);

  // Main loop
  while (true) {
    headerBanner();
    
    if (officer.role === 'ADMIN') {
      // ─── ADMIN MENU ───
      console.log(chalk.bold('  Menu Manajemen Sistem (Administrator)'));
      div();
      console.log(chalk.yellow('  [1] Daftar Petugas Baru         ') + chalk.gray('buat akun petugas baru'));
      console.log(chalk.yellow('  [2] Lihat Daftar Petugas        ') + chalk.gray('lihat seluruh akun di sistem'));
      console.log(chalk.yellow('  [3] Ubah Data Petugas           ') + chalk.gray('ganti role/PIN/nama'));
      console.log(chalk.yellow('  [4] Hapus Petugas               ') + chalk.gray('hapus hak akses.'));
      console.log(chalk.yellow('  [0] Keluar'));
      blank();

      const c = (await ask(rl, chalk.bold('  Pilih menu: '))).trim();
      switch (c) {
        case '1': await menuRegisterOfficer(stubs, rl); break;
        case '2': await menuListOfficers(stubs, rl);    break;
        case '3': await menuUpdateOfficer(stubs, rl);   break;
        case '4': await menuDeleteOfficer(stubs, rl);   break;
        case '0':
          console.log(chalk.magenta(`\n  Sampai jumpa, ${officer.nama}!\n`));
          rl.close(); process.exit(0);
        default: console.log(chalk.yellow('  Ketik angka 0–4.'));
      }
      await ask(rl, chalk.gray('\n  Tekan Enter untuk kembali ke menu...'));
      
    } else {
      // ─── OFFICER MENU ───
      console.log(chalk.bold('  Menu Operasional (Petugas Loket)'));
      div();
      console.log(chalk.yellow('  [1] Dashboard Live              ') + chalk.gray('lihat & kelola antrian real-time'));
      console.log(chalk.yellow('  [2] Manajemen Kedatangan        ') + chalk.gray('check-in, walk-in, panggil antrian'));
      console.log(chalk.yellow('  [3] Status Antrian              ') + chalk.gray('snapshot antrian layanan'));
      console.log(chalk.yellow('  [4] Reset Kuota Harian          ') + chalk.gray('buka kuota baru'));
      console.log(chalk.yellow('  [5] Broadcast Pengumuman        ') + chalk.gray('kirim pesan ke warga'));
      console.log(chalk.yellow('  [6] Statistik Sistem            ') + chalk.gray('data hari ini'));
      console.log(chalk.yellow('  [0] Keluar'));
      blank();

      const c = (await ask(rl, chalk.bold('  Pilih menu: '))).trim();
      switch (c) {
        case '1': await menuLiveDashboard(stubs, rl); break;
        case '2': await menuArrivalManagement(stubs, rl); break;
        case '3': await menuQueueStatus(stubs, rl);     break;
        case '4': await menuResetQuota(stubs, rl);      break;
        case '5': await menuBroadcast(stubs, rl);       break;
        case '6': await menuStats(stubs);               break;
        case '0':
          console.log(chalk.magenta(`\n  Sampai jumpa, ${officer.nama}!\n`));
          rl.close(); process.exit(0);
        default: console.log(chalk.yellow('  Ketik angka 0–6.'));
      }
      if (c !== '1') await ask(rl, chalk.gray('\n  Tekan Enter untuk kembali ke menu...'));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
