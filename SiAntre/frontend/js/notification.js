function showNotification(title, message, type = 'info', duration = 5000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const alertClass = {
    info:    'alert-info',
    success: 'alert-success',
    warning: 'alert-warning',
    error:   'alert-error'
  }[type] || 'alert-info';

  const toast = document.createElement('div');
  toast.className = `alert ${alertClass} shadow-lg mb-2`;
  toast.innerHTML = `
    <div>
      <h3 class="font-bold text-sm">${title}</h3>
      <div class="text-xs">${message}</div>
    </div>
  `;

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

// Global exposure for ws-client
window.showNotification = showNotification;

document.addEventListener('DOMContentLoaded', () => {
  // Bind your-turn banner
  const banner = document.getElementById('your-turn-banner');
  if (banner) {
    EventBus.on('yourTurn', () => {
      banner.classList.remove('hidden');
      
      // Anime.js shake effect
      if (typeof anime !== 'undefined') {
        anime({
          targets: banner,
          translateX: [
            { value: -10, duration: 50 },
            { value: 10, duration: 50 },
            { value: -10, duration: 50 },
            { value: 10, duration: 50 },
            { value: 0, duration: 50 }
          ],
          easing: 'easeInOutSine'
        });
      }
      
      // Auto hide after 15 seconds
      setTimeout(() => banner.classList.add('hidden'), 15000);
    });
  }
});
