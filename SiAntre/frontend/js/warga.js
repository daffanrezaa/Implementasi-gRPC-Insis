// ─── Bind Warga UI Elements ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const currentNumberDisplay = document.getElementById('current-number-display');
  const totalWaitingDisplay  = document.getElementById('total-waiting-display');
  const servicesStatusList   = document.getElementById('services-status-list');

  // Handle QUEUE_UPDATE
  EventBus.on('queueUpdate', (msg) => {
    const { current_number, total_waiting } = msg.payload;
    if (current_number) {
      if (currentNumberDisplay.innerText !== current_number.toString()) {
        currentNumberDisplay.innerText = current_number;
        
        // Anime.js flip animation
        if (typeof anime !== 'undefined') {
          anime({
            targets: currentNumberDisplay,
            scale: [1.5, 1],
            opacity: [0, 1],
            color: ['#10b981', ''], // flash green
            duration: 800,
            easing: 'easeOutElastic(1, .8)'
          });
        }
      }
    }
    if (total_waiting !== undefined) {
      totalWaitingDisplay.innerText = `Menunggu: ${total_waiting}`;
    }
  });

  // Handle SERVICES_STATUS_UPDATE
  EventBus.on('servicesUpdate', (services) => {
    if (!servicesStatusList) return;
    servicesStatusList.innerHTML = '';
    
    services.forEach(svc => {
      const el = document.createElement('div');
      el.className = `service-status-card p-3 rounded-lg bg-base-200 flex justify-between items-center mb-2 
                      ${svc.status === 'OPEN' ? 'status-open' : (svc.status === 'PAUSED' ? 'status-paused' : 'status-closed')}`;
      
      const statusBadge = svc.status === 'OPEN'   ? '<span class="badge badge-success badge-sm">OPEN</span>' :
                          svc.status === 'PAUSED' ? '<span class="badge badge-warning badge-sm">PAUSED</span>' :
                                                    '<span class="badge badge-error badge-sm">CLOSED</span>';
                                                    
      el.innerHTML = `
        <div>
          <div class="font-bold text-sm">${svc.name}</div>
          <div class="text-xs opacity-60">Sisa Kuota: ${svc.quota_remaining}</div>
        </div>
        <div>${statusBadge}</div>
      `;
      servicesStatusList.appendChild(el);
    });
  });

  // Demo Login/Register Buttons (placeholder)
  document.getElementById('btn-login-citizen')?.addEventListener('click', () => {
    alert("Fitur Warga lengkap (Login/Booking) akan dikerjakan pada tahap selanjutnya.");
  });
  document.getElementById('btn-register-citizen')?.addEventListener('click', () => {
    alert("Fitur Warga lengkap (Login/Booking) akan dikerjakan pada tahap selanjutnya.");
  });
});
