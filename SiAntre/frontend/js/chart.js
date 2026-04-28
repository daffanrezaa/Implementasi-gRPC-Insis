(function () {
  let chart = null;

  const chartOptions = {
    chart: {
      type:       'bar',
      height:     220,
      fontFamily: 'inherit',
      toolbar:    { show: false },
      animations: {
        enabled:          true,
        easing:           'easeinout',
        speed:            500,
        dynamicAnimation: { enabled: true, speed: 400 },
      },
      background: 'transparent',
    },
    series: [{ name: 'Menunggu', data: [] }],
    xaxis: {
      categories: [],
      labels: { style: { colors: 'currentColor', opacity: 0.7 } }
    },
    yaxis: {
      labels: { style: { colors: 'currentColor', opacity: 0.7 } }
    },
    plotOptions: {
      bar: { borderRadius: 4, horizontal: false, distributed: true }
    },
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
    dataLabels: { enabled: true },
    tooltip: { theme: 'dark' }
  };

  function initChart() {
    const el = document.querySelector('#queue-chart');
    if (!el) return;
    chart = new ApexCharts(el, chartOptions);
    chart.render();
  }

  EventBus.on('queueChartUpdate', (stats) => {
    if (!chart || !stats || !stats.per_service) return;

    // Pastikan Object.keys(stats.per_service) di-sort atau konsisten jika diperlukan.
    const categories = Object.keys(stats.per_service);
    const data       = categories.map(k => stats.per_service[k].waiting_count || 0);

    chart.updateSeries([{ name: 'Menunggu', data }]);
    chart.updateOptions({ xaxis: { categories } });
  });

  document.addEventListener('DOMContentLoaded', initChart);
})();
