(function() {
  'use strict';
  // ── VIEW ROUTING ───────────────────────────────────────────────────
  const PAGE_TITLES = {
    booking:     'Booking Baru',
    riwayat:     'Riwayat Booking',
    monitor:     'Monitor Antrian',
    pengumuman:  'Papan Pengumuman',
  };

  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) showViewInner(e.state.view, document.getElementById(`view-${e.state.view}`), false);
  });

  function showView(name, push = true) {
    const current = document.querySelector('.warga-view:not(.hidden)');
    const target  = document.getElementById(`view-${name}`);
    if (!target || target === current) return;

    if (push) history.pushState({ view: name }, '', `#${name}`);

    // Fade out current
    if (current) {
      anime({ targets: current, opacity: [1,0], duration: 150, easing: 'easeInQuart',
        complete: () => {
          current.classList.add('hidden');
          showViewInner(name, target);
        }
      });
    } else {
      showViewInner(name, target);
    }
  }

  function showViewInner(name, target) {
    target.classList.remove('hidden');
    anime({ targets: target, opacity: [0,1], translateY: [8,0], duration: 250, easing: 'easeOutQuart' });
    
    // Update active states
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === name);
      if (btn.classList.contains('btm-nav-item')) {
        btn.classList.toggle('active', btn.dataset.view === name);
      }
    });

    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = PAGE_TITLES[name] || '';

    // Sidebar close on mobile
    const overlay = document.getElementById('mobile-sidebar-overlay');
    if (overlay && !overlay.classList.contains('hidden')) {
      const sidebar = document.getElementById('mobile-sidebar');
      anime({ targets: sidebar, translateX: ['0%', '-100%'], duration: 200, easing: 'easeInQuart',
        complete: () => overlay.classList.add('hidden')
      });
    }
    
    // Side effects
    if (name === 'riwayat') loadMyBookings();
    if (name === 'monitor') initMonitorView();
    if (name === 'pengumuman') {
      sendCommand('GET_ANNOUNCEMENTS');
      AppState.unreadAnnouncements = 0;
      updateAnnBadge();
    }
  }

  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // AUTO-FOCUS & ENTER KEY
  window.addEventListener('DOMContentLoaded', () => {
    const loginNik = document.getElementById('login-nik');
    if (loginNik) {
      loginNik.focus();
      loginNik.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-login').click();
      });
    }
    // Handle initial hash
    const hash = window.location.hash.substring(1);
    if (hash && PAGE_TITLES[hash]) showView(hash, false);
  });

  // ── AUTH (Index page) ────────────────────────────────────────────────
  const authTabs = document.getElementById('auth-tabs');
  if (authTabs) {
    authTabs.querySelectorAll('[data-auth-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        authTabs.querySelectorAll('.tab').forEach(t => t.classList.remove('tab-active'));
        btn.classList.add('tab-active');
        document.querySelectorAll('.auth-tab-content').forEach(c => c.classList.add('hidden'));
        document.getElementById(`auth-tab-${btn.dataset.authTab}`).classList.remove('hidden');
      });
    });
  }

  // NIK character counter & Digit validation
  document.getElementById('login-nik')?.addEventListener('input', (e) => {
    // LOW-3 FIX: Only allow digits
    e.target.value = e.target.value.replace(/\D/g, '');
    const counter = document.getElementById('login-nik-counter');
    if (counter) counter.textContent = `${e.target.value.length}/16`;
  });

  document.getElementById('btn-login')?.addEventListener('click', () => {
    const nik = document.getElementById('login-nik').value;
    // LOW-3 FIX: Consistently validate digit regex
    if (nik.length !== 16 || !/^\d+$/.test(nik)) {
      return showNotification('NIK Tidak Valid', 'NIK harus 16 digit angka.', 'warning');
    }
    setLoading('btn-login', true);
    sendCommand('LOGIN_CITIZEN', { nik });
  });

  EventBus.on('loginResult', (msg) => {
    setLoading('btn-login', false);
    if (msg.error) return showNotification('Login Gagal', msg.error, 'error');
    sessionStorage.setItem('siantre_user', JSON.stringify(msg.payload));
    
    // Fix redirect loop: only redirect if not on warga.html
    if (!window.location.pathname.endsWith('warga.html')) {
      window.location.href = 'warga.html';
    }
  });

  // BUG-C1 FIX: Restore missing event listener wrapper
  document.getElementById('btn-register')?.addEventListener('click', () => {
    const data = {
      nik:          document.getElementById('reg-nik').value.trim(),
      nama_lengkap: document.getElementById('reg-name').value.trim(),
      no_hp:        document.getElementById('reg-phone').value.trim(),
      alamat:       document.getElementById('reg-address').value.trim(),
    };
    if (data.nik.length !== 16 || !/^\d+$/.test(data.nik)) {
      return showNotification('NIK Tidak Valid', 'NIK harus berupa 16 digit angka.', 'warning');
    }
    if (data.nama_lengkap.length < 3) {
      return showNotification('Nama Terlalu Pendek', 'Nama lengkap minimal 3 karakter.', 'warning');
    }
    if (data.no_hp.length < 10 || !/^\d+$/.test(data.no_hp)) {
      return showNotification('No. HP Tidak Valid', 'Masukkan nomor HP yang valid (min. 10 digit).', 'warning');
    }
    setLoading('btn-register', true);
    sendCommand('REGISTER_CITIZEN', data);
  });

  EventBus.on('registerResult', (msg) => {
    setLoading('btn-register', false);
    if (msg.error) return showNotification('Pendaftaran Gagal', msg.error, 'error');
    showNotification('Berhasil', 'Akun terdaftar. Silakan login.', 'success');
    authTabs.querySelector('[data-auth-tab="login"]').click();
  });

  // ── DASHBOARD INIT ──────────────────────────────────────────────────
  if (window.location.pathname.endsWith('warga.html')) {
    const user = JSON.parse(sessionStorage.getItem('siantre_user') || '{}');
    AppState.currentUser = user;
    if (user.nama_lengkap) {
      document.getElementById('sidebar-user-name').textContent = user.nama_lengkap;
      document.getElementById('sidebar-user-nik').textContent  = `NIK: ${user.nik}`;
    }

    EventBus.on('wsConnected', () => {
      sendCommand('LIST_SERVICES');
      loadMyBookings();
    });
  }

  document.getElementById('btn-logout-warga')?.addEventListener('click', () => {
    sessionStorage.removeItem('siantre_user');
    window.location.href = '/';
  });

  // ── BOOKING LOGIC ────────────────────────────────────────────────────
  function goToStep(s) {
    for (let i = 1; i <= 3; i++) {
      document.getElementById(`booking-step-${i}`).classList.toggle('hidden', i !== s);
      const bar = document.getElementById(`step-bar-${i}`);
      const lbl = document.getElementById(`step-label-${i}`);
      if (bar) {
        bar.classList.toggle('active', i === s);
        bar.classList.toggle('done', i < s);
      }
      if (lbl) {
        lbl.classList.toggle('text-primary', i === s);
        lbl.classList.toggle('font-semibold', i === s);
      }
    }
  }

  function renderServiceCards(services) {
    const container = document.getElementById('booking-service-cards');
    if (!container) return;
    container.innerHTML = services.map(s => {
      const isOpen = s.status === 'OPEN' || s.is_open;
      return `
        <button class="service-booking-card ${!isOpen ? 'is-closed' : ''}" data-id="${s.service_id}" ${!isOpen ? 'disabled' : ''}>
          <p class="text-xs opacity-50 font-bold mb-1">${s.short_code}</p>
          <p class="font-bold text-sm leading-tight">${s.name}</p>
          <p class="text-[10px] opacity-40 mt-2">Sisa: ${s.quota_remaining} kuota</p>
        </button>
      `;
    }).join('');

    container.querySelectorAll('.service-booking-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.id;
        const svc = AppState.services.find(s => s.service_id === sid);
        AppState.selectedService = svc;
        container.querySelectorAll('.service-booking-card').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('btn-booking-next-1').classList.remove('hidden');

        // IMP-1 FIX: Show requirements
        const reqDiv = document.getElementById('booking-requirements');
        const reqList = document.getElementById('booking-requirements-list');
        if (reqDiv && reqList) {
          if (svc.requirements && svc.requirements.length > 0) {
            reqList.innerHTML = svc.requirements.map(r => `<li>${r}</li>`).join('');
            reqDiv.classList.remove('hidden');
          } else {
            reqDiv.classList.add('hidden');
          }
        }
      });
    });
  }

  EventBus.on('servicesLoaded', s => renderServiceCards(s));

  // BUG-1 FIX: Back buttons for booking wizard
  document.getElementById('btn-booking-back-2')?.addEventListener('click', () => goToStep(1));
  document.getElementById('btn-booking-back-3')?.addEventListener('click', () => goToStep(2));
  document.getElementById('btn-booking-cancel-confirm')?.addEventListener('click', () => {
    resetBookingWizard();
  });

  document.getElementById('btn-booking-next-1')?.addEventListener('click', () => {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    const todayStr = today.toISOString().split('T')[0];
    
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 6);
    maxDate.setMinutes(maxDate.getMinutes() - maxDate.getTimezoneOffset());
    const maxStr = maxDate.toISOString().split('T')[0];

    const picker = document.getElementById('booking-date-picker');
    if (picker) {
      picker.value = todayStr;
      picker.min   = todayStr;
      picker.max   = maxStr;
    }
    loadSlots(todayStr);
    goToStep(2);
  });

  function loadSlots(date) {
    const grid = document.getElementById('booking-slot-grid');
    grid.innerHTML = '<span class="loading loading-dots loading-sm"></span>';
    sendCommand('GET_AVAILABLE_SLOTS', { service_id: AppState.selectedService.service_id, date });
  }

  document.getElementById('booking-date-picker')?.addEventListener('change', (e) => loadSlots(e.target.value));

  EventBus.on('slotsLoaded', (msg) => {
    // Determine which grid to fill based on visibility
    const bookingView = document.getElementById('view-booking');
    const reschedModal = document.getElementById('modal-reschedule');
    
    let grid = null;
    let isResched = false;

    if (reschedModal?.open) {
      grid = document.getElementById('reschedule-slot-grid');
      isResched = true;
    } else {
      grid = document.getElementById('booking-slot-grid');
    }

    if (!grid) return;
    const slots = msg.payload?.slots || [];
    if (!slots.length) return grid.innerHTML = '<p class="text-xs opacity-50">Tidak ada slot tersedia.</p>';

    grid.innerHTML = slots.map(s => `
      <button class="slot-btn ${s.booked_count >= s.capacity ? 'opacity-30 cursor-not-allowed' : ''}" 
              data-id="${s.slot_id}" data-time="${s.time}" ${s.booked_count >= s.capacity ? 'disabled' : ''}>
        <span class="slot-time">${s.time}</span>
        <span class="slot-avail">${s.capacity - s.booked_count}</span>
      </button>
    `).join('');

    grid.querySelectorAll('.slot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        
        const datePickerId = isResched ? 'reschedule-date' : 'booking-date-picker';
        AppState.selectedSlot = { 
          slot_id: btn.dataset.id, 
          time: btn.dataset.time, 
          date: document.getElementById(datePickerId)?.value 
        };
        
        const nextBtn = isResched ? document.getElementById('btn-confirm-reschedule') : document.getElementById('btn-booking-next-2');
        if (nextBtn) nextBtn.classList.remove('hidden'), nextBtn.disabled = false;
      });
    });
  });

  document.getElementById('btn-booking-next-2')?.addEventListener('click', () => {
    document.getElementById('confirm-service-name').textContent = AppState.selectedService.name;
    document.getElementById('confirm-slot-date').textContent = AppState.selectedSlot.date;
    document.getElementById('confirm-slot-time').textContent = AppState.selectedSlot.time;
    document.getElementById('confirm-citizen-name').textContent = AppState.currentUser.nama_lengkap || AppState.currentUser.nama || '—';
    goToStep(3);
  });

  document.getElementById('btn-booking-confirm')?.addEventListener('click', () => {
    setLoading('btn-booking-confirm', true);
    const payload = {
      citizen_id:   AppState.currentUser.citizen_id,
      service_id:   AppState.selectedService?.service_id,
      slot_id:      AppState.selectedSlot?.slot_id,
      citizen_name: AppState.currentUser.nama_lengkap || AppState.currentUser.nama
    };

    if (!payload.citizen_id || !payload.service_id || !payload.slot_id || !payload.citizen_name) {
      setLoading('btn-booking-confirm', false);
      return showNotification('Data Tidak Lengkap', 'Silakan pilih layanan dan jadwal kembali.', 'warning');
    }

    sendCommand('CREATE_BOOKING', payload);
  });

  EventBus.on('bookingResult', (msg) => {
    setLoading('btn-booking-confirm', false);
    if (msg.error) return showNotification('Gagal', msg.error, 'error');
    document.getElementById('booking-success-result').classList.remove('hidden');
    document.getElementById('booking-actions').classList.add('hidden');
    document.getElementById('booking-result-code').textContent = msg.payload.booking_code;
    showNotification('Berhasil!', 'Booking Anda telah tercatat.', 'success');
    
    // Start progress bar animation
    const progressBar = document.getElementById('booking-success-progress');
    const anim = anime({
      targets: progressBar,
      scaleX: [1, 0],
      duration: 8000,
      easing: 'linear'
    });

    const autoRedirect = setTimeout(() => {
      if (!document.getElementById('booking-success-result').classList.contains('hidden')) {
        resetBookingWizard();
        showView('riwayat');
      }
    }, 8000);

    const clearActions = () => {
      clearTimeout(autoRedirect);
      anim.pause();
      progressBar.style.display = 'none';
    };

    // BUG-6 FIX: Use onclick assignment to prevent duplicate listeners
    document.getElementById('btn-view-history-after-success').onclick = () => {
      clearActions();
      resetBookingWizard();
      showView('riwayat');
    };

    document.getElementById('btn-book-again').onclick = () => {
      clearActions();
      resetBookingWizard();
    };
  });

  function resetBookingWizard() {
    document.getElementById('booking-success-result').classList.add('hidden');
    document.getElementById('booking-actions').classList.remove('hidden');
    // BUG-H2 FIX: Safely restore button text with fallback
    const confirmBtn = document.getElementById('btn-booking-confirm');
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = confirmBtn.dataset.originalText || 'Konfirmasi Booking ✓';
    document.getElementById('booking-service-cards').querySelectorAll('.service-booking-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('btn-booking-next-1').classList.add('hidden');
    // Hide requirements panel
    const reqDiv = document.getElementById('booking-requirements');
    if (reqDiv) reqDiv.classList.add('hidden');
    AppState.selectedService = null;
    AppState.selectedSlot = null;
    goToStep(1);
  }

  // ── RIWAYAT & ACTIONS ────────────────────────────────────────────────
  function loadMyBookings() {
    if (!AppState.currentUser?.citizen_id) return;
    sendCommand('GET_MY_BOOKING', { citizen_id: AppState.currentUser.citizen_id });
  }

  EventBus.on('myBookingLoaded', (msg) => {
    const container = document.getElementById('booking-list');
    if (!container) return;
    const bookings = msg.payload?.bookings || [];
    AppState.allBookings = bookings; 
    
    // KRIT-1 FIX: Set myBooking to active one for YOUR_TURN detection
    AppState.myBooking = bookings.find(b => b.status === 'ARRIVED' || b.status === 'CALLED') || null;
    
    if (!bookings.length) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 opacity-30">
          <span class="text-6xl mb-4">📭</span>
          <p class="font-bold">Belum ada riwayat booking.</p>
          <p class="text-xs">Booking baru Anda akan muncul di sini.</p>
        </div>`;
      return;
    }

    // BUG-7 + IMP-3 FIX: fallback service_name + colored status badges
    const statusBadge = (s) => {
      const map = { BOOKED:'badge-primary', ARRIVED:'badge-info', CALLED:'badge-warning', DONE:'badge-success', CANCELLED:'badge-error', EXPIRED:'badge-ghost' };
      return map[s] || '';
    };

    // OPT-4: escape helper to prevent XSS
    const esc = (s) => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
    // BUG-M3 FIX: parse YYYY-MM-DD as local date to avoid UTC→WIB shift
    const fmtDate = (d) => {
      const [y,m,day] = (d||'').split('-').map(Number);
      if (!y) return d || '—';
      return new Date(y, m-1, day).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    };

    container.innerHTML = bookings.map(b => `
      <div class="booking-card flex flex-col gap-2">
        <div class="flex justify-between items-start">
          <div>
            <p class="font-mono text-xs font-bold text-primary">${esc(b.booking_code)}</p>
            <p class="font-bold text-sm">${esc(b.service_name || b.service_id)}</p>
          </div>
          <span class="badge badge-sm ${statusBadge(b.status)}">${esc(b.status)}</span>
        </div>
        <p class="text-[11px] opacity-60">
          <span class="inline-block mr-2">📅 ${fmtDate(b.slot_date)}</span>
          <span class="inline-block">⏰ ${esc(b.slot_time)}</span>
        </p>
        ${b.queue_number ? `<p class="text-sm font-black text-primary bg-primary/5 p-2 rounded-lg text-center border border-primary/10">Nomor Antrian: ${esc(String(b.queue_number))}</p>` : ''}
        ${b.status === 'BOOKED' ? `
          <div class="flex gap-2 mt-2">
            <button class="btn btn-xs btn-outline btn-resched flex-1" data-id="${esc(b.booking_id)}" data-sid="${esc(b.service_id)}" data-code="${esc(b.booking_code)}">Ubah Jadwal</button>
            <button class="btn btn-xs btn-error btn-ghost btn-cancel flex-1" data-code="${esc(b.booking_code)}">Batal</button>
          </div>
        ` : ''}
      </div>
    `).join('');

    container.querySelectorAll('.btn-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        showConfirm('Batalkan Booking', `Apakah Anda yakin ingin membatalkan booking ${btn.dataset.code}?`, () => {
          btn.classList.add('loading');
          btn.disabled = true;
          sendCommand('CANCEL_BOOKING', { booking_code: btn.dataset.code, citizen_id: AppState.currentUser.citizen_id });
        });
      });
    });

    container.querySelectorAll('.btn-resched').forEach(btn => {
      btn.addEventListener('click', () => openReschedule(btn.dataset));
    });
  });

  EventBus.on('cancelResult', msg => {
    if (msg.error) return showNotification('Gagal', msg.error, 'error');
    showNotification('Dibatalkan', 'Booking berhasil dibatalkan.', 'success');
    loadMyBookings();
  });

  function openReschedule(data) {
    const modal = document.getElementById('modal-reschedule');
    document.getElementById('reschedule-code').textContent = data.code;
    
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    const todayStr = today.toISOString().split('T')[0];
    
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 6);
    maxDate.setMinutes(maxDate.getMinutes() - maxDate.getTimezoneOffset());
    const maxStr = maxDate.toISOString().split('T')[0];

    const picker = document.getElementById('reschedule-date');
    picker.value = todayStr;
    picker.min   = todayStr;
    picker.max   = maxStr;
    picker.onchange = (e) => sendCommand('GET_AVAILABLE_SLOTS', { service_id: data.sid, date: e.target.value });
    
    // Clear previous selection
    document.getElementById('reschedule-slot-grid').innerHTML = '<span class="loading loading-dots loading-sm"></span>';
    document.getElementById('btn-confirm-reschedule').disabled = true;
    AppState.selectedSlot = null;

    sendCommand('GET_AVAILABLE_SLOTS', { service_id: data.sid, date: todayStr });
    
    document.getElementById('btn-confirm-reschedule').onclick = () => {
      if (!AppState.selectedSlot) return showNotification('Pilih Slot', 'Silakan pilih jam kunjungan baru.', 'warning');
      setLoading('btn-confirm-reschedule', true);
      sendCommand('RESCHEDULE_BOOKING', {
        booking_code: data.code,
        citizen_id:   AppState.currentUser.citizen_id,
        new_slot_id:  AppState.selectedSlot.slot_id
      });
    };
    modal.showModal();
  }

  EventBus.on('rescheduleResult', msg => {
    setLoading('btn-confirm-reschedule', false);
    if (msg.error) return showNotification('Gagal', msg.error, 'error');
    document.getElementById('modal-reschedule').close();
    showNotification('Berhasil', 'Jadwal diubah.', 'success');
    loadMyBookings();
  });

  // ── MONITOR VIEW ─────────────────────────────────────────────────────
  function initMonitorView() {
    const sel = document.getElementById('monitor-service-select');
    if (!sel) return;
    
    // Always sync with latest services
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">-- Pilih layanan --</option>';
    AppState.services.forEach(s => {
      const opt = new Option(`${s.short_code} - ${s.name}`, s.service_id);
      sel.add(opt);
    });
    if (currentVal) {
      sel.value = currentVal;
      // MED-1 FIX: Trigger queue status refresh for restored value
      sendCommand('GET_QUEUE_STATUS', { service_id: currentVal });
    }

    sel.addEventListener('change', (e) => {
      const sid = e.target.value;
      if (!sid) {
        document.getElementById('monitor-service-label').textContent = 'Pilih layanan untuk memulai';
        document.getElementById('monitor-current-number').textContent = '—';
        document.getElementById('monitor-total-waiting').textContent  = '—';
        updatePersonalQueueStats(null, '—');
        return;
      }
      const svc = AppState.services.find(s => s.service_id === sid);
      if (svc) document.getElementById('monitor-service-label').textContent = svc.name;
      sendCommand('GET_QUEUE_STATUS', { service_id: sid });
    });
  }

  EventBus.on('queueStatus', (msg) => {
    const p = msg.payload;
    document.getElementById('monitor-current-number').textContent = p.current_number || '—';
    document.getElementById('monitor-total-waiting').textContent  = p.total_waiting || 0;
    updatePersonalQueueStats(msg.service_id, p.current_number);
  });

  EventBus.on('queueUpdate', (msg) => {
    const sel = document.getElementById('monitor-service-select');
    if (sel && sel.value === msg.service_id) {
      const p = msg.payload;
      if (p.current_number) animateNumberFlip(document.getElementById('monitor-current-number'), p.current_number);
      document.getElementById('monitor-total-waiting').textContent = p.total_waiting || 0;
      updatePersonalQueueStats(msg.service_id, p.current_number);
    }
  });

  function updatePersonalQueueStats(serviceId, currentNumber) {
    // BUG-M6 FIX: Guard against undefined allBookings
    const bookings = AppState.allBookings || [];
    const myBooking = bookings.find(b => b.service_id === serviceId && (b.status === 'ARRIVED' || b.status === 'CALLED'));
    const myNumEl = document.getElementById('monitor-my-number');
    const aheadEl = document.getElementById('monitor-people-ahead');
    const waitEl  = document.getElementById('monitor-est-wait');

    if (!myBooking || !serviceId) {
      if (myNumEl) myNumEl.textContent = '—';
      if (aheadEl) aheadEl.textContent = '—';
      if (waitEl)  waitEl.textContent  = '—';
      return;
    }

    const myNum  = parseInt(myBooking.queue_number) || 0;
    const current = parseInt(currentNumber) || 0;
    const ahead = Math.max(0, myNum - current);

    if (myNumEl) myNumEl.textContent = myNum || '—';
    if (aheadEl) aheadEl.textContent = ahead;
    if (waitEl)  waitEl.textContent  = ahead === 0 ? 'Sekarang!' : `~${ahead * 5} menit`;
  }

  // ── MISC ─────────────────────────────────────────────────────────────
  function updateAnnBadge() {
    const b = document.getElementById('ann-badge-count');
    const btm = document.getElementById('btm-ann-badge');
    const count = AppState.unreadAnnouncements;
    if (b) {
      b.textContent = count;
      b.classList.toggle('hidden', count === 0);
    }
    if (btm) btm.classList.toggle('hidden', count === 0);
  }

  EventBus.on('newAnnouncement', (msg) => {
    // BUG-11: Update landing page banner
    const banner = document.getElementById('ann-banner');
    const bText  = document.getElementById('ann-banner-text');
    if (banner && bText) {
      bText.textContent = msg.message;
      banner.classList.remove('hidden');
      anime({ targets: banner, opacity: [0, 1], translateY: [-10, 0], duration: 500 });
    }

    if (document.querySelector('.warga-view#view-pengumuman')?.classList.contains('hidden')) {
      AppState.unreadAnnouncements++;
      updateAnnBadge();
    }
  });

  EventBus.on('announcements', (msg) => {
    const list = document.getElementById('announcement-list');
    if (!list) return;
    const anns = msg.payload?.announcements || [];
    if (!anns.length) {
      list.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 opacity-30">
          <span class="text-6xl mb-4">📢</span>
          <p class="font-bold">Papan pengumuman kosong.</p>
        </div>`;
      return;
    }
    list.innerHTML = [...anns].reverse().map(a => `
      <div class="ann-entry">
        <p class="text-[10px] opacity-40 font-bold mb-1">${new Date(a.timestamp).toLocaleString()}</p>
        <p class="text-sm font-medium">${window.esc(a.message)}</p>
      </div>
    `).join('');
  });

  // Mobile sidebar toggle
  document.getElementById('btn-sidebar-toggle')?.addEventListener('click', () => {
    const overlay = document.getElementById('mobile-sidebar-overlay');
    const sidebar = document.getElementById('mobile-sidebar');
    overlay.classList.remove('hidden');
    
    // MED-5 FIX: Always sync badges if already cloned, or clone if empty
    if (!sidebar.innerHTML) {
      sidebar.innerHTML = document.getElementById('sidebar').innerHTML;
      sidebar.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', () => showView(btn.dataset.view));
      });
      sidebar.querySelector('#btn-logout-warga').onclick = () => document.getElementById('btn-logout-warga').click();
    } else {
      // Sync badges to mobile sidebar
      const badge = document.getElementById('ann-badge-count');
      const mobileBadge = sidebar.querySelector('#ann-badge-count');
      if (badge && mobileBadge) {
        mobileBadge.textContent = badge.textContent;
        mobileBadge.classList.toggle('hidden', badge.classList.contains('hidden'));
      }
    }
    anime({ targets: sidebar, translateX: ['-100%', '0%'], duration: 300, easing: 'easeOutQuart' });
  });

  document.getElementById('mobile-sidebar-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'mobile-sidebar-overlay') {
      const sidebar = document.getElementById('mobile-sidebar');
      anime({ targets: sidebar, translateX: ['0%', '-100%'], duration: 200, easing: 'easeInQuart',
        complete: () => e.target.classList.add('hidden')
      });
    }
  });

  // BUG-2 + BUG-3 FIX: Refresh buttons
  document.getElementById('btn-refresh-bookings')?.addEventListener('click', () => loadMyBookings());
  document.getElementById('btn-refresh-announcements')?.addEventListener('click', () => sendCommand('GET_ANNOUNCEMENTS'));

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

})();
