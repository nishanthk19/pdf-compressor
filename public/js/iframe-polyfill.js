// Polyfill and handle iframe permission policy restrictions (e.g., Keyboard getLayoutMap API)
(function() {
  if (typeof window !== 'undefined') {
    if (navigator.keyboard && typeof navigator.keyboard.getLayoutMap === 'function') {
      try {
        navigator.keyboard.getLayoutMap = function() {
          return Promise.resolve(new Map());
        };
      } catch (e) {
        try {
          Object.defineProperty(navigator.keyboard, 'getLayoutMap', {
            value: function() { return Promise.resolve(new Map()); },
            configurable: true,
            writable: true
          });
        } catch (err) {}
      }
    }

    window.addEventListener('unhandledrejection', function(event) {
      if (event && event.reason) {
        const msg = String(event.reason.message || event.reason);
        if (msg.includes('getLayoutMap') || msg.includes('browsing context') || msg.includes('permission policy') || msg.includes('Script error')) {
          event.preventDefault();
        }
      }
    });

    window.addEventListener('error', function(event) {
      if (event && event.message) {
        const msg = String(event.message);
        if (msg.includes('getLayoutMap') || msg.includes('permission policy') || msg === 'Script error.') {
          event.preventDefault();
        }
      }
    }, true);
  }
})();
