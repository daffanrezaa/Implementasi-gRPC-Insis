const ActivityLog = {
  container: null,
  counter: null,
  count: 0,
  maxLogs: 50,

  init() {
    this.container = document.getElementById('activity-log');
    this.counter   = document.getElementById('log-count');
    
    // Clear initial "Waiting for connection" text when connected
    EventBus.on('wsConnected', () => {
      if (this.container && this.count === 0) {
        this.container.innerHTML = '';
      }
    });

    EventBus.on('activityLog', (log) => this.addLog(log.type, log.message, log.timestamp));
  },

  addLog(type, message, timestamp = new Date().toISOString()) {
    if (!this.container) return;

    if (this.count === 0) this.container.innerHTML = ''; // clear waiting msg

    const timeStr = new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second:'2-digit' });
    
    const p = document.createElement('p');
    p.className = `log-${type}`;
    p.innerHTML = `<span class="opacity-40 mr-2">[${timeStr}]</span> ${message}`;
    
    this.container.prepend(p);
    
    this.count++;
    if (this.counter) this.counter.innerText = this.count;

    // Prune old logs
    while (this.container.children.length > this.maxLogs) {
      this.container.removeChild(this.container.lastChild);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => ActivityLog.init());
