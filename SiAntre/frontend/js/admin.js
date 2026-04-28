(function() {
  const ADMIN_PAGE_TITLES = {
    dashboard:  'Dashboard Live',
    kedatangan: 'Manajemen Kedatangan',
    pengumuman: 'Kirim Pengumuman',
    reset:      'Reset Quota Harian',
    statistik:  'Statistik Sistem',
    petugas:    'Manajemen Petugas',
  };

  function showAdminView(name) {
    const views = document.querySelectorAll('.admin-view');
    views.forEach(v => v.classList.add('hidden'));
    const target = document.getElementById(`admin-view-${name}`);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('[data-admin-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.adminView === name);
    });

    const titleEl = document.getElementById('admin-page-title');
    if (titleEl) titleEl.textContent = ADMIN_PAGE_TITLES[name] || 'Admin';

    // Side effects
    if (name === 'dashboard') {
      sendCommand('LIST_SERVICES');
      sendCommand('GET_SYSTEM_STATS');
    }
    if (name === 'statistik') sendCommand('GET_SYSTEM_STATS');
    if (name === 'petugas') {
      // BUG-H1 FIX: Use in-memory PIN, fallback to form field
      const pin = AppState._reqPin || document.getElementById('officer-req-pin')?.value || '';
      sendCommand('LIST_OFFICERS', { requester_id: AppState.currentAdmin?.id_pegawai, requester_pin: pin });
    }
    if (name === 'pengumuman') sendCommand('GET_ANNOUNCEMENTS');
  }

  document.querySelectorAll('[data-admin-view]').forEach(btn => {
    btn.addEventListener('click', () => showAdminView(btn.dataset.adminView));
  });

  // ── ADMIN AUTH ──────────────────────────────────────────────────────
  // BUG-H4 FIX: Merged into one wsConnected handler (removed duplicate from line 45)
  // wsConnected at line 45 handles CHECK_SYSTEM_INITIALIZED
  // On reconnect after login, re-fetch services and stats
  EventBus.on('wsConnected', () => {
    sendCommand('CHECK_SYSTEM_INITIALIZED');
    if (AppState.currentAdmin) {
      sendCommand('LIST_SERVICES');
    }
  });

  EventBus.on('systemInitStatus', (msg) => {
    if (msg.payload?.initialized === false) {
      document.getElementById('admin-setup-panel').classList.remove('hidden');
      document.getElementById('admin-login-panel').classList.add('hidden');
    }
  });

  document.getElementById('btn-setup-admin')?.addEventListener('click', () => {
    const data = {
      id_pegawai: document.getElementById('setup-id').value,
      nama:       document.getElementById('setup-nama').value,
      pin:        document.getElementById('setup-pin').value,
      jabatan:    'Administrator Utama',
      role:       'ADMIN'
    };
    if (data.pin.length < 6) return showNotification('PIN Terlalu Pendek', 'Minimal 6 digit.', 'warning');
    setLoading('btn-setup-admin', true);
    sendCommand('REGISTER_OFFICER', data);
  });

  document.getElementById('btn-admin-login')?.addEventListener('click', () => {
    const data = {
      id_pegawai: document.getElementById('admin-id').value.toUpperCase().trim(),
      pin:        document.getElementById('admin-pin').value.trim()
    };
    if (!data.id_pegawai || !data.pin) return showNotification('Data Kurang', 'Masukkan ID dan PIN.', 'warning');
    setLoading('btn-admin-login', true);
    sendCommand('ADMIN_LOGIN', data);
  });

  EventBus.on('adminLoginResult', (msg) => {
    setLoading('btn-admin-login', false);
    if (msg.error) {
      const panel = document.getElementById('admin-login-panel');
      anime({ targets: panel, translateX: [0, -10, 10, -10, 10, 0], duration: 400, easing: 'easeInOutSine' });
      return showNotification('Login Gagal', msg.error, 'error');
    }
    
    AppState.currentAdmin = msg.payload;
    // BUG-H1 FIX: Store PIN in memory, not in a visible form field
    AppState._reqPin = document.getElementById('admin-pin').value;
    document.getElementById('admin-pin').value = ''; // Clear PIN from form immediately

    document.getElementById('admin-login-wrapper').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    
    document.getElementById('admin-sidebar-name').textContent = AppState.currentAdmin.nama;
    document.getElementById('admin-sidebar-role').textContent = AppState.currentAdmin.role;
    document.getElementById('admin-sidebar-id').textContent   = AppState.currentAdmin.id_pegawai;

    const isAdmin = AppState.currentAdmin.role === 'ADMIN';
    document.getElementById('admin-only-menu').classList.toggle('hidden', !isAdmin);
    document.getElementById('petugas-menu').classList.toggle('hidden', isAdmin);

    if (isAdmin) {
      showAdminView('petugas');
    } else {
      sendCommand('LIST_SERVICES');
      showAdminView('dashboard');
    }
  });

  document.getElementById('btn-admin-logout')?.addEventListener('click', () => {
    AppState.currentAdmin = null;
    window.location.reload();
  });

  // ── DASHBOARD ACTIONS ────────────────────────────────────────────────
  function renderAdminQueueCards(services) {
    const grid = document.getElementById('admin-queue-cards');
    if (!grid) return;
    grid.innerHTML = services.map(s => `
      <div class="service-queue-card" id="qcard-${s.service_id}">
        <div class="flex justify-between items-start mb-2">
          <div>
            <p class="font-black text-primary text-lg">${s.short_code}</p>
            <p class="text-xs font-bold">${s.name}</p>
          </div>
          <span class="badge badge-xs">${s.is_open ? 'BUKA' : 'TUTUP'}</span>
        </div>
        <div class="text-center py-4">
          <p class="text-[10px] opacity-40 uppercase font-bold">Dilayani</p>
          <div class="queue-num-display text-4xl font-black text-primary" id="qnum-${s.service_id}">${s.current_number || '—'}</div>
        </div>
        <div class="flex justify-between text-[10px] font-bold opacity-60 mb-4">
          <span>Menunggu: <span class="text-warning" id="qwait-${s.service_id}">${s.waiting_count || 0}</span></span>
          <span>Sisa: <span id="qquota-${s.service_id}">${s.quota_remaining}</span></span>
        </div>
        <div class="flex flex-col gap-2">
          <button class="btn btn-primary btn-sm btn-next" data-id="${s.service_id}">Panggil Berikutnya</button>
          <div class="flex gap-2">
            <button class="btn btn-xs flex-1 ${s.is_open ? 'btn-warning' : 'btn-success'} btn-toggle-svc" data-id="${s.service_id}" data-open="${s.is_open}">
              ${s.is_open ? 'Jeda' : 'Buka'}
            </button>
          </div>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.btn-next').forEach(btn => {
      btn.addEventListener('click', () => sendCommand('CALL_NEXT', { service_id: btn.dataset.id }));
    });

    grid.querySelectorAll('.btn-toggle-svc').forEach(btn => {
      btn.addEventListener('click', () => {
        const isOpen = btn.dataset.open === 'true';
        sendCommand(isOpen ? 'PAUSE' : 'RESUME', { service_id: btn.dataset.id });
      });
    });
  }

  EventBus.on('servicesLoaded', s => {
    renderAdminQueueCards(s);
    populateDropdowns(s);
  });

  // BUG-C3 FIX: Removed sendCommand('GET_SYSTEM_STATS') — pushScheduler already pushes every 5s
  EventBus.on('servicesUpdate', s => {
    renderAdminQueueCards(s);
  });

  EventBus.on('queueUpdate', (msg) => {
    const p = msg.payload;
    const qnum  = document.getElementById(`qnum-${msg.service_id}`);
    const qwait = document.getElementById(`qwait-${msg.service_id}`);
    if (qnum  && p.called_number)      animateNumberFlip(qnum, p.called_number);
    if (qwait && p.total_waiting !== undefined) qwait.textContent = p.total_waiting;
    // BUG-C3 FIX: Do NOT call GET_SYSTEM_STATS here — pushScheduler handles it
  });

  function populateDropdowns(services) {
    const ids = ['adm-walkin-service', 'adm-announce-service', 'adm-reset-service'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = id.includes('walkin') ? '' : '<option value="">── Semua Layanan ──</option>';
      services.forEach(s => el.add(new Option(`${s.short_code} - ${s.name}`, s.service_id)));
    });
  }

  // ── KEDATANGAN & WALK-IN ─────────────────────────────────────────────
  document.querySelectorAll('[data-kedatangan-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-kedatangan-tab]').forEach(b => b.classList.remove('tab-active'));
      btn.classList.add('tab-active');
      document.querySelectorAll('.kedatangan-tab').forEach(c => c.classList.add('hidden'));
      document.getElementById(`kedatangan-tab-${btn.dataset.kedatanganTab}`).classList.remove('hidden');
    });
  });

  document.getElementById('btn-checkin')?.addEventListener('click', () => {
    const code = document.getElementById('adm-booking-code').value;
    setLoading('btn-checkin', true);
    sendCommand('CHECKIN_CITIZEN', { booking_code: code });
  });

  EventBus.on('checkinResult', msg => {
    setLoading('btn-checkin', false);
    if (msg.error) return showNotification('Gagal', msg.error, 'error');
    const p = msg.payload;
    document.getElementById('checkin-result').classList.remove('hidden');
    document.getElementById('checkin-result-name').textContent = p.citizen_name;
    document.getElementById('checkin-result-number').textContent = p.queue_number;
    document.getElementById('checkin-result-detail').textContent = p.service_name;
    showNotification('Check-In Berhasil', `Nomor: ${p.queue_number}`, 'success');
  });

  document.getElementById('btn-walkin')?.addEventListener('click', () => {
    const data = {
      service_id:   document.getElementById('adm-walkin-service').value,
      citizen_name: document.getElementById('adm-walkin-name').value
    };
    setLoading('btn-walkin', true);
    sendCommand('WALK_IN_CITIZEN', data);
  });

  EventBus.on('walkInResult', msg => {
    setLoading('btn-walkin', false);
    if (msg.error) return showNotification('Gagal', msg.error, 'error');
    document.getElementById('walkin-result').classList.remove('hidden');
    document.getElementById('walkin-result-code').textContent = msg.payload.booking_code;
    document.getElementById('walkin-result-number').textContent = msg.payload.queue_number;
    showNotification('Walk-In Berhasil', `Nomor: ${msg.payload.queue_number}`, 'success');
  });

  // ── ANNOUNCE & RESET ────────────────────────────────────────────────
  document.getElementById('btn-announce')?.addEventListener('click', () => {
    const data = {
      service_id: document.getElementById('adm-announce-service').value || null,
      message:    document.getElementById('adm-announce-msg').value
    };
    setLoading('btn-announce', true);
    sendCommand('ANNOUNCE', data);
  });

  EventBus.on('adminEvent', (ev) => {
    if (ev.event_type === 'ACK') {
      setLoading('btn-announce', false);
      showNotification('Terkirim', 'Pengumuman telah disebarkan.', 'success');
      document.getElementById('adm-announce-msg').value = '';
    }
  });

  document.getElementById('btn-reset-quota')?.addEventListener('click', () => {
    showConfirm('Reset Quota', 'RESET SEMUA DATA ANTRIAN? Tindakan ini tidak bisa dibatalkan.', () => {
      setLoading('btn-reset-quota', true);
      sendCommand('RESET_DAILY_QUOTA', { service_id: document.getElementById('adm-reset-service').value || null });
    });
  });

  EventBus.on('resetQuotaResult', msg => {
    setLoading('btn-reset-quota', false);
    if (msg.error) return showNotification('Gagal', msg.error, 'error');
    showNotification('Berhasil', 'Kuota telah di-reset.', 'success');
    sendCommand('LIST_SERVICES');
  });

  // OPT-4 FIX: XSS-safe officer table rendering
  EventBus.on('officersList', (msg) => {
    const tbody = document.getElementById('officers-table-body');
    if (!tbody) return;
    const os  = msg.payload?.officers || [];
    const esc = (s) => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';

    if (!os.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-base-content/40 py-12">Belum ada petugas terdaftar.</td></tr>';
      return;
    }

    tbody.innerHTML = os.map(o => `
      <tr>
        <td class="font-mono text-xs">${esc(o.id_pegawai)}</td>
        <td>
          <span class="font-bold">${esc(o.nama)}</span>
          ${o.id_pegawai === AppState.currentAdmin.id_pegawai ? '<span class="text-[10px] text-primary ml-1 font-bold">(Anda)</span>' : ''}
        </td>
        <td class="text-xs opacity-60">${esc(o.jabatan)}</td>
        <td><span class="badge badge-xs">${esc(o.role)}</span></td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-info btn-xs btn-edit-officer"
              data-id="${esc(o.id_pegawai)}"
              data-nama="${esc(o.nama)}"
              data-jabatan="${esc(o.jabatan)}"
              data-role="${esc(o.role)}">Edit</button>
            ${o.id_pegawai !== AppState.currentAdmin.id_pegawai ?
              `<button class="btn btn-error btn-xs btn-del-officer" data-id="${esc(o.id_pegawai)}">Hapus</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-edit-officer').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = btn.dataset;
        document.getElementById('edit-officer-id').value = d.id;
        document.getElementById('edit-officer-nama').value = d.nama;
        document.getElementById('edit-officer-jabatan').value = d.jabatan;
        document.getElementById('edit-officer-role').value = d.role;
        document.getElementById('edit-officer-pin').value = '';
        document.getElementById('modal-edit-officer').showModal();
      });
    });

    tbody.querySelectorAll('.btn-del-officer').forEach(btn => {
      btn.addEventListener('click', () => {
        // BUG-H1 FIX: Read from AppState._reqPin, fallback to form
        const pin = AppState._reqPin || document.getElementById('officer-req-pin').value;
        if (!pin) return showNotification('Butuh PIN', 'PIN admin diperlukan untuk tindakan ini.', 'warning');
        showConfirm('Hapus Petugas', `Apakah Anda yakin ingin menghapus petugas ${btn.dataset.id}?`, () => {
          sendCommand('DELETE_OFFICER', { id_pegawai: btn.dataset.id, requester_id: AppState.currentAdmin.id_pegawai, requester_pin: pin });
        });
      });
    });
  });

  document.getElementById('btn-add-officer')?.addEventListener('click', () => {
    const data = {
      requester_id:  AppState.currentAdmin.id_pegawai,
      requester_pin: document.getElementById('officer-req-pin').value.trim(),
      id_pegawai:    document.getElementById('new-officer-id').value.toUpperCase().trim(),
      nama:          document.getElementById('new-officer-nama').value.trim(),
      jabatan:       document.getElementById('new-officer-jabatan').value.trim(),
      role:          document.getElementById('new-officer-role').value,
      pin:           document.getElementById('new-officer-pin').value.trim()
    };
    
    // VALIDATION FIX: Officer management
    if (!data.requester_pin) return showNotification('Konfirmasi PIN', 'Masukkan PIN Anda untuk konfirmasi.', 'warning');
    if (data.id_pegawai.length < 2) return showNotification('ID Tidak Valid', 'ID minimal 2 karakter.', 'warning');
    if (data.nama.length < 3) return showNotification('Nama Terlalu Pendek', 'Nama minimal 3 karakter.', 'warning');
    if (data.pin.length < 6) return showNotification('PIN Terlalu Pendek', 'PIN petugas baru minimal 6 digit.', 'warning');

    setLoading('btn-add-officer', true);
    sendCommand('REGISTER_OFFICER', data);
  });

  document.getElementById('btn-save-officer')?.addEventListener('click', () => {
    // BUG-H1 FIX: Use in-memory PIN with fallback to form
    const pinConfirm = AppState._reqPin || document.getElementById('officer-req-pin').value;
    if (!pinConfirm) return showNotification('Butuh PIN', 'PIN admin diperlukan untuk konfirmasi.', 'warning');
    
    const data = {
      requester_id:  AppState.currentAdmin.id_pegawai,
      requester_pin: pinConfirm,
      id_pegawai:    document.getElementById('edit-officer-id').value,
      new_nama:      document.getElementById('edit-officer-nama').value.trim(),
      new_jabatan:   document.getElementById('edit-officer-jabatan').value.trim(),
      new_role:      document.getElementById('edit-officer-role').value,
      new_pin:       document.getElementById('edit-officer-pin').value || undefined
    };
    setLoading('btn-save-officer', true);
    sendCommand('UPDATE_OFFICER', data);
  });

  EventBus.on('registerOfficerResult', msg => {
    setLoading('btn-add-officer', false);
    setLoading('btn-setup-admin', false);
    
    if (msg.error) return showNotification('Gagal', msg.error, 'error');

    // Cek jika ini adalah pendaftaran admin pertama (panel setup sedang tampil)
    const setupPanel = document.getElementById('admin-setup-panel');
    if (setupPanel && !setupPanel.classList.contains('hidden')) {
      showNotification('Berhasil', 'Admin pertama terdaftar. Silakan login.', 'success');
      setupPanel.classList.add('hidden');
      document.getElementById('admin-login-panel').classList.remove('hidden');
      // Auto-fill ID pegawai agar user tidak perlu mengetik ulang
      document.getElementById('admin-id').value = document.getElementById('setup-id').value;
      return;
    }

    showNotification('Berhasil', 'Petugas ditambahkan.', 'success');
    const formIds = ['new-officer-id', 'new-officer-nama', 'new-officer-jabatan', 'new-officer-pin'];
    formIds.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    // BUG-H1 FIX: Use in-memory PIN for list refresh
    const pin = AppState._reqPin || document.getElementById('officer-req-pin')?.value || '';
    sendCommand('LIST_OFFICERS', { requester_id: AppState.currentAdmin?.id_pegawai, requester_pin: pin });
  });

  EventBus.on('deleteOfficerResult', msg => {
    if (msg.error) return showNotification('Gagal', msg.error, 'error');
    showNotification('Dihapus', 'Petugas telah dihapus.', 'success');
    // BUG-H1 FIX: Use in-memory PIN
    const pin = AppState._reqPin || document.getElementById('officer-req-pin')?.value || '';
    sendCommand('LIST_OFFICERS', { requester_id: AppState.currentAdmin?.id_pegawai, requester_pin: pin });
  });

  EventBus.on('updateOfficerResult', msg => {
    setLoading('btn-save-officer', false);
    if (msg.error) return showNotification('Gagal', msg.error, 'error');
    showNotification('Berhasil', 'Data petugas diperbarui.', 'success');
    document.getElementById('modal-edit-officer').close();
    const pin = AppState._reqPin || document.getElementById('officer-req-pin')?.value || '';
    sendCommand('LIST_OFFICERS', { requester_id: AppState.currentAdmin?.id_pegawai, requester_pin: pin });
  });

  // ── MISC UTILS ──────────────────────────────────────────────────────
  
  // BUG-M1 FIX: Use [...anns].reverse() to avoid mutating the original array
  // OPT-4 FIX: XSS-safe rendering with escaping
  EventBus.on('announcements', (msg) => {
    const list = document.getElementById('admin-announcement-history');
    if (!list) return;
    const anns = msg.payload?.announcements || [];
    const esc = (s) => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
    if (!anns.length) return list.innerHTML = '<p class="text-base-content/40 text-sm italic text-center py-4">Belum ada pengumuman.</p>';
    
    list.innerHTML = [...anns].reverse().map(a => `
      <div class="bg-base-200/50 p-2 rounded text-xs border-l-2 border-primary">
        <div class="flex justify-between opacity-40 font-bold mb-1">
          <span>${esc(a.service_id || 'SEMUA')}</span>
          <span>${new Date(a.timestamp).toLocaleTimeString()}</span>
        </div>
        <p>${esc(a.message)}</p>
      </div>
    `).slice(0, 5).join('');
  });

  // Sidebar Toggle (Mobile) — BUG-H5 FIX: properly clean up classes on close
  document.getElementById('btn-admin-sidebar-toggle')?.addEventListener('click', () => {
    const sidebar = document.getElementById('admin-sidebar');
    if (sidebar.classList.contains('hidden')) {
      sidebar.classList.remove('hidden');
      sidebar.classList.add('fixed', 'inset-y-0', 'left-0', 'z-50', 'w-64', 'shadow-2xl', 'bg-neutral', 'text-neutral-content');
      anime({ targets: sidebar, translateX: ['-100%', '0%'], duration: 300, easing: 'easeOutQuart' });

      const overlay = document.createElement('div');
      overlay.id = 'admin-sidebar-overlay';
      overlay.className = 'fixed inset-0 bg-black/40 z-40';
      overlay.onclick = closeSidebar;
      document.body.appendChild(overlay);
    }
  });

  function closeSidebar() {
    const sidebar  = document.getElementById('admin-sidebar');
    const overlay  = document.getElementById('admin-sidebar-overlay');
    anime({
      targets: sidebar,
      translateX: ['0%', '-100%'],
      duration: 250,
      easing: 'easeInQuart',
      complete: () => {
        // BUG-H5 FIX: Remove all mobile-only classes so desktop layout is restored
        sidebar.classList.add('hidden');
        sidebar.classList.remove('fixed', 'inset-y-0', 'left-0', 'z-50', 'w-64', 'shadow-2xl');
        if (overlay) overlay.remove();
      }
    });
  }

  // Refresh Buttons
  document.getElementById('btn-refresh-officers')?.addEventListener('click', () => {
    const pin = document.getElementById('officer-req-pin')?.value || '';
    sendCommand('LIST_OFFICERS', { 
      requester_id: AppState.currentAdmin?.id_pegawai, 
      requester_pin: pin 
    });
  });

  function showConfirm(title, body, onConfirm) {
    const modal = document.getElementById('modal-confirm');
    if (!modal) return;
    document.getElementById('modal-confirm-title').textContent = title;
    document.getElementById('modal-confirm-body').textContent  = body;
    const btn = document.getElementById('modal-confirm-btn');
    btn.onclick = () => {
      onConfirm();
      modal.close();
    };
    modal.showModal();
  }

  function animateNumberFlip(el, newVal) {
    if (el.textContent === String(newVal)) return;
    anime({
      targets: el,
      translateY: [0, -10],
      opacity: [1, 0],
      duration: 200,
      easing: 'easeInQuad',
      complete: () => {
        el.textContent = newVal;
        anime({
          targets: el,
          translateY: [10, 0],
          opacity: [0, 1],
          duration: 300,
          easing: 'easeOutBack'
        });
      }
    });
  }

  // AUTO-FOCUS & ENTER KEY
  window.addEventListener('DOMContentLoaded', () => {
    const adminId = document.getElementById('admin-id');
    if (adminId) {
      adminId.focus();
      adminId.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-admin-login').click();
      });
      document.getElementById('admin-pin')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-admin-login').click();
      });
    }
  });

})();
