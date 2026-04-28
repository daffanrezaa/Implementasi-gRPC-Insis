// ─── Web Audio API: Sound Notification ───────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let _audioCtx  = null;

function playChime(type = 'info') {
  try {
    if (!_audioCtx) _audioCtx = new AudioCtx();
    const osc = _audioCtx.createOscillator();
    const g   = _audioCtx.createGain();
    osc.connect(g);
    g.connect(_audioCtx.destination);

    const now = _audioCtx.currentTime;
    if (type === 'success') {
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2); // G5
    } else if (type === 'error') {
      osc.frequency.setValueAtTime(440, now); // A4
      osc.frequency.exponentialRampToValueAtTime(349.23, now + 0.2); // F4
    } else if (type === 'turn') {
      // Major chord arpeggio
      osc.frequency.setValueAtTime(392, now); // G4
      osc.frequency.setValueAtTime(493.88, now + 0.1); // B4
      osc.frequency.setValueAtTime(587.33, now + 0.2); // D5
      osc.frequency.setValueAtTime(783.99, now + 0.3); // G5
    } else {
      osc.frequency.setValueAtTime(440, now); // A4
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5
    }

    g.gain.setValueAtTime(0.1, now);
    g.gain.exponentialRampToValueAtTime(0.00001, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
  } catch (e) { console.warn('Audio play failed:', e); }
}

// ─── DaisyUI Toast + Anime.js ────────────────────────────────────────────────
function showNotification(title, message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const alertClass = {
    info:    'alert-info',
    success: 'alert-success',
    warning: 'alert-warning',
    error:   'alert-error',
  }[type] || 'alert-info';

  const toast = document.createElement('div');
  toast.className = `alert ${alertClass} shadow-lg mb-2 min-w-[300px] pointer-events-auto`;
  toast.innerHTML = `
    <div>
      <p class="font-bold text-sm">${title}</p>
      <p class="text-xs opacity-90">${message}</p>
    </div>
  `;

  container.appendChild(toast);
  playChime(type);

  // Slide in
  anime({
    targets: toast,
    translateX: [100, 0],
    opacity: [0, 1],
    duration: 500,
    easing: 'easeOutElastic(1, .6)'
  });

  if (duration > 0) {
    setTimeout(() => {
      anime({
        targets: toast,
        translateX: 100,
        opacity: 0,
        duration: 400,
        easing: 'easeInBack',
        complete: () => toast.remove()
      });
    }, duration);
  }
}

// ─── YOUR_TURN Banner ────────────────────────────────────────────────────────
function showYourTurnBanner(serviceName, number) {
  const existing = document.getElementById('your-turn-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'your-turn-banner';
  banner.className = 'fixed top-20 right-4 z-[9999] w-80';
  banner.innerHTML = `
    <div class="card bg-primary text-primary-content shadow-2xl border-2 border-white/20 overflow-hidden">
      <div class="card-body p-4 items-center text-center">
        <h2 class="card-title text-xl font-black italic">GILIRAN ANDA! 🔔</h2>
        <p class="text-xs opacity-80 uppercase tracking-widest font-bold">${serviceName}</p>
        <div class="text-5xl font-black my-2 tracking-tighter">${number}</div>
        <p class="text-sm">Silakan menuju loket sekarang.</p>
        <div class="card-actions w-full mt-4">
          <button class="btn btn-sm btn-block btn-ghost bg-white/20" onclick="this.closest('#your-turn-banner').remove()">SAYA MENGERTI</button>
        </div>
      </div>
      <div id="turn-progress" class="h-1 bg-white/40 w-full"></div>
    </div>
  `;

  document.body.appendChild(banner);
  playChime('turn');

  // Animation
  anime({
    targets: banner,
    translateX: [200, 0],
    scale: [0.8, 1],
    opacity: [0, 1],
    duration: 800,
    easing: 'easeOutElastic(1, .5)'
  });

  // Progress bar countdown
  anime({
    targets: '#turn-progress',
    width: '0%',
    duration: 15000,
    easing: 'linear',
    complete: () => {
      anime({
        targets: banner,
        translateX: 200,
        opacity: 0,
        duration: 500,
        complete: () => banner.remove()
      });
    }
  });
}

// Listen to YOUR_TURN event
EventBus.on('yourTurn', (msg) => {
  const p = msg.payload;
  showYourTurnBanner(p.service_name || msg.service_id, p.current_number);
});

// Globalize
window.showNotification = showNotification;
window.showYourTurnBanner = showYourTurnBanner;
