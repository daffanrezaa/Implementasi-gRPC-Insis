(function() {
  const FLIP_DURATION = 400;

  function animateNumberFlip(element, newValue) {
    if (!element) return;
    const oldValue = element.textContent;
    if (oldValue === String(newValue)) return;

    // Phase 1: Flip out
    anime({
      targets:  element,
      rotateX:  [0, -90],
      opacity:  [1, 0],
      duration: FLIP_DURATION / 2,
      easing:   'easeInQuad',
      complete: () => {
        element.textContent = newValue;
        // Phase 2: Flip in
        anime({
          targets:  element,
          rotateX:  [90, 0],
          opacity:  [0, 1],
          duration: FLIP_DURATION / 2,
          easing:   'easeOutQuad'
        });
      }
    });

    // Background flash effect
    const card = element.closest('.card') || element.parentElement;
    if (card) {
      anime({
        targets: card,
        backgroundColor: ['rgba(255,255,255,0)', 'oklch(var(--p)/0.1)', 'rgba(255,255,255,0)'],
        duration: 1000,
        easing: 'easeOutQuad'
      });
    }
  }

  // Hook into EventBus
  EventBus.on('queueNumberCalled', (data) => {
    // Only animate if it's the monitor's big number or a specific card
    const monitorEl = document.getElementById('monitor-current-number');
    if (monitorEl) animateNumberFlip(monitorEl, data.number);
    
    const adminNumEl = document.getElementById(`qnum-${data.service_id}`);
    if (adminNumEl) animateNumberFlip(adminNumEl, data.number);
  });

  window.animateNumberFlip = animateNumberFlip;

})();
