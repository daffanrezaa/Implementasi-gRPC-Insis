(function () {
  'use strict';
  let chart = null;
  let adminChart = null;

  const commonOptions = {
    chart: {
      type:       'bar',
      height:     220,
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      toolbar:    { show: false },
      animations: { enabled: true, easing: 'easeinout', speed: 800 },
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth:  '55%',
        distributed:  false,
      }
    },
    dataLabels: { enabled: false },
    legend:     { position: 'top', fontSize: '12px' },
    grid:       { borderColor: 'rgba(0,0,0,0.05)' },
    xaxis: {
      categories: [],
      labels: { style: { fontSize: '11px', fontWeight: 600 } }
    },
    // HIGH-2 FIX: ApexCharts does not support oklch() CSS functions
    colors: ['#570df8', '#fbbd23'], 
    tooltip: { theme: 'light' }
  };

  function initChart(containerId, isWarga = true) {
    const el = document.getElementById(containerId);
    if (!el) return null;

    const options = {
      ...commonOptions,
      series: [
        { name: 'Menunggu', data: [] },
        { name: 'Sisa Kuota', data: [] }
      ],
    };

    const c = new ApexCharts(el, options);
    c.render();
    return c;
  }

  function updateChart(c, perService) {
    if (!c || !perService) return;

    const categories = perService.map(s => s.service_short_code || s.service_id);
    const waiting    = perService.map(s => s.waiting_count);
    const quota      = perService.map(s => s.quota_remaining);

    c.updateOptions({
      xaxis: { categories: categories }
    });

    c.updateSeries([
      { name: 'Menunggu', data: waiting },
      { name: 'Sisa Kuota', data: quota }
    ]);
  }

  // Handle stats push
  EventBus.on('statsUpdate', (msg) => {
    const stats = msg.payload || msg; // handle both raw and msg wrapper
    
    const updateVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    // Dashboard Cards
    updateVal('adm-stat-bookings',  stats.total_bookings_today);
    updateVal('adm-stat-served',    stats.total_served_today);
    updateVal('adm-stat-cancelled', stats.total_cancelled_today);
    updateVal('adm-stat-subs',      stats.active_subscribers);

    // Statistics View Cards
    updateVal('stat-total-bookings',  stats.total_bookings_today);
    updateVal('stat-total-served',    stats.total_served_today);
    updateVal('stat-total-cancelled', stats.total_cancelled_today);
    updateVal('stat-subs',            stats.active_subscribers);

    // BUG-L2 FIX: Only init/update charts when container is visible
    if (stats.per_service) {
      const chartEl      = document.getElementById('admin-queue-chart');
      const statChartEl  = document.getElementById('stat-detail-chart');

      // Only init if element exists AND is visible (not inside a hidden parent)
      if (chartEl && chartEl.offsetParent !== null) {
        if (!chart) chart = initChart('admin-queue-chart', false);
        if (chart) updateChart(chart, stats.per_service);
      }

      if (statChartEl && statChartEl.offsetParent !== null) {
        if (!adminChart) adminChart = initChart('stat-detail-chart', false);
        if (adminChart) updateChart(adminChart, stats.per_service);
      }

      // Also update Stats Table if exists
      const tableBody = document.getElementById('stat-table-body');
      if (tableBody) {
        tableBody.innerHTML = stats.per_service.map(s => `
          <tr>
            <td class="font-bold text-xs">${window.esc(s.service_name)}</td>
            <td>${s.quota_total}</td>
            <td>${s.quota_used}</td>
            <td class="text-warning font-bold">${s.waiting_count}</td>
            <td class="font-mono">${window.esc(s.current_number) || '—'}</td>
            <td><span class="badge badge-xs ${s.is_open ? 'badge-success' : 'badge-ghost'}">${s.is_open ? 'BUKA' : 'TUTUP'}</span></td>
          </tr>
        `).join('');
      }
    }
  });

  // Export for manual trigger
  window.initQueueChart = initChart;

})();
