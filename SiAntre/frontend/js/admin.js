document.addEventListener('DOMContentLoaded', () => {
  const loginSection     = document.getElementById('admin-login-section');
  const dashboardSection = document.getElementById('admin-dashboard-section');
  
  const inputIdPegawai = document.getElementById('input-id-pegawai');
  const inputPin       = document.getElementById('input-pin');
  const btnLogin       = document.getElementById('btn-admin-login');
  const loginError     = document.getElementById('login-error');
  
  const adminNameDisplay = document.getElementById('admin-name');
  const selectService    = document.getElementById('select-service');

  // ─── LOGIN ────────────────────────────────────────────────────────────────
  btnLogin.addEventListener('click', () => {
    const id_pegawai = inputIdPegawai.value.trim();
    const pin        = inputPin.value.trim();
    
    if (!id_pegawai || !pin) {
      loginError.innerText = "ID dan PIN harus diisi.";
      loginError.classList.remove('hidden');
      return;
    }
    
    loginError.classList.add('hidden');
    btnLogin.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Loading...';
    btnLogin.disabled = true;
    
    sendCommand('ADMIN_LOGIN', { id_pegawai, pin });
  });

  EventBus.on('adminLoginResult', (msg) => {
    btnLogin.innerHTML = 'Masuk';
    btnLogin.disabled = false;
    
    if (msg.error) {
      loginError.innerText = msg.error;
      loginError.classList.remove('hidden');
    } else {
      // Success
      loginSection.classList.add('hidden');
      dashboardSection.classList.remove('hidden');
      
      adminNameDisplay.innerText = `${msg.payload.nama} (${msg.payload.role})`;
      showNotification('Login Berhasil', `Selamat datang, ${msg.payload.nama}`, 'success');
      
      // Request initial services list for dropdown
      sendCommand('LIST_SERVICES', {});
    }
  });

  // ─── DASHBOARD BINDINGS ───────────────────────────────────────────────────
  
  // Populate Service Dropdown
  EventBus.on('servicesLoaded', (services) => {
    selectService.innerHTML = '<option disabled selected>Pilih layanan...</option>';
    services.forEach(svc => {
      const opt = document.createElement('option');
      opt.value = svc.service_id;
      opt.innerText = `${svc.name} (${svc.service_id})`;
      selectService.appendChild(opt);
    });
  });

  // Stats Update
  EventBus.on('statsUpdate', (stats) => {
    document.getElementById('stat-bookings').innerText = stats.total_bookings_today || 0;
    document.getElementById('stat-served').innerText = stats.total_served_today || 0;
    document.getElementById('stat-cancelled').innerText = stats.total_cancelled_today || 0;
    document.getElementById('stat-subscribers').innerText = stats.active_subscribers || 0;
  });

  // Action Buttons
  function getSelectedService() {
    const s = selectService.value;
    if (!s || s === 'Pilih layanan...') {
      showNotification('Peringatan', 'Silakan pilih layanan terlebih dahulu.', 'warning');
      return null;
    }
    return s;
  }

  document.getElementById('btn-call-next').addEventListener('click', () => {
    const service_id = getSelectedService();
    if (service_id) sendCommand('CALL_NEXT', { service_id });
  });

  document.getElementById('btn-pause').addEventListener('click', () => {
    const service_id = getSelectedService();
    if (service_id) sendCommand('PAUSE_SERVICE', { service_id });
  });

  document.getElementById('btn-resume').addEventListener('click', () => {
    const service_id = getSelectedService();
    if (service_id) sendCommand('RESUME_SERVICE', { service_id });
  });
  
  document.getElementById('btn-checkin').addEventListener('click', () => {
    alert("Fitur Check-in akan menggunakan modal (dalam pengembangan).");
  });
  
  document.getElementById('btn-walkin').addEventListener('click', () => {
    alert("Fitur Walk-in akan menggunakan modal (dalam pengembangan).");
  });

  // Announcement
  const inputAnnounce = document.getElementById('input-announce-msg');
  document.getElementById('btn-announce').addEventListener('click', () => {
    const message = inputAnnounce.value.trim();
    if (!message) return;
    
    // Optional: send per service if selected, or global if not
    const s = selectService.value;
    const service_id = (s && s !== 'Pilih layanan...') ? s : '';
    
    sendCommand('ANNOUNCE', { service_id, message });
    inputAnnounce.value = '';
  });
});
