(function() {
  function getStatusBadgeClass(svc) {
    const st = svc.status || (svc.is_open ? 'OPEN' : 'CLOSED');
    if (st === 'OPEN')   return 'badge badge-success';
    if (st === 'PAUSED') return 'badge badge-warning';
    return 'badge badge-error';
  }

  function getStatusText(svc) {
    const st = svc.status || (svc.is_open ? 'OPEN' : 'CLOSED');
    if (st === 'OPEN')   return 'Buka';
    if (st === 'PAUSED') return 'Jeda';
    return 'Tutup';
  }

  function renderSidebarStatus(services) {
    const container = document.getElementById('sidebar-service-status') || document.getElementById('admin-sidebar-svc');
    if (!container) return;

    container.innerHTML = services.map(svc => {
      const isOpen = svc.status === 'OPEN' || svc.is_open;
      const dotClass = isOpen ? 'bg-success' : (svc.status === 'PAUSED' ? 'bg-warning' : 'bg-error');
      
      return `
        <div class="sidebar-svc-row flex items-center justify-between gap-2 px-1">
          <div class="flex items-center gap-2 overflow-hidden">
            <span class="sidebar-svc-dot ${dotClass} animate-pulse"></span>
            <span class="text-xs truncate font-medium">${svc.short_code || svc.service_id}</span>
          </div>
          <span class="text-[10px] opacity-40 font-mono">${svc.quota_remaining ?? 0}</span>
        </div>
      `;
    }).join('');
  }

  function renderMiniStatus(services) {
    const container = document.getElementById('service-status-mini');
    if (!container) return;

    container.innerHTML = services.map(svc => `
      <div class="flex items-center justify-between bg-base-100/50 p-3 rounded-xl border border-base-content/5">
        <div class="flex items-center gap-3">
          <span class="text-xl font-black text-primary">${svc.short_code}</span>
          <div>
            <p class="text-xs font-bold leading-tight">${svc.name}</p>
            <p class="text-[10px] opacity-50">${svc.open_hour} - ${svc.close_hour}</p>
          </div>
        </div>
        <div class="text-right">
          <span class="${getStatusBadgeClass(svc)} badge-xs mb-1">${getStatusText(svc)}</span>
          <p class="text-[10px] opacity-50">Sisa: ${svc.quota_remaining} Kuota</p>
        </div>
      </div>
    `).join('');
  }

  // Listen to events
  EventBus.on('servicesLoaded', (services) => {
    renderSidebarStatus(services);
    renderMiniStatus(services);
  });

  EventBus.on('servicesUpdate', (services) => {
    renderSidebarStatus(services);
    renderMiniStatus(services);
  });

  // Export
  window.renderSidebarStatus = renderSidebarStatus;

})();
