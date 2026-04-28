(function() {
  const MAX_LOG = 100;
  let logEl = null;

  function fmt(iso) {
    return new Date(iso || Date.now()).toLocaleTimeString('id-ID', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function appendLog({ type, message, timestamp }) {
    if (!logEl) logEl = document.getElementById('activity-log') || document.getElementById('monitor-event-log');
    if (!logEl) return;

    // Remove empty state placeholder
    const empty = logEl.querySelector('.log-empty') || logEl.querySelector('.italic');
    if (empty) empty.remove();

    const entry = document.createElement('div');
    entry.className = `log-entry type-${type || 'system'}`;
    entry.innerHTML = `
      <span class="log-time">${fmt(timestamp)}</span>
      <span class="log-text">${esc(message)}</span>
    `;

    logEl.insertBefore(entry, logEl.firstChild);

    // Prune old entries
    while (logEl.children.length > MAX_LOG) {
      logEl.removeChild(logEl.lastChild);
    }
  }

  // Clear log
  const clearBtn = document.getElementById('btn-clear-log');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!logEl) return;
      logEl.innerHTML = '<p class="log-empty text-base-content/40 italic text-center py-4 text-sm">Log dibersihkan.</p>';
    });
  }

  // Listen to EventBus
  EventBus.on('activityLog', (data) => appendLog(data));

  // Also listen for connection events
  EventBus.on('wsConnected', () => appendLog({ type: 'system', message: '📡 Terhubung ke Gateway.' }));
  EventBus.on('wsDisconnected', (e) => appendLog({ type: 'error', message: `❌ Terputus: ${e.reason || 'Koneksi hilang'}` }));

})();
