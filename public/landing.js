(function () {
  function bootLandingI18n() {
    if (window.initLandingI18n) {
      window.initLandingI18n();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootLandingI18n);
  } else {
    bootLandingI18n();
  }

  // Scroll reveal
  var reveals = document.querySelectorAll('.reveal');
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );
  reveals.forEach(function (el) {
    observer.observe(el);
  });

  // Runtime app version from /version.json (generated on build)
  var appVersionEl = document.getElementById('app-version');
  var heroVersionEl = document.getElementById('hero-version');
  if (appVersionEl || heroVersionEl) {
    fetch('/version.json', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('version fetch failed');
        return response.json();
      })
      .then(function (payload) {
        if (payload && typeof payload.version === 'string' && payload.version.trim()) {
          if (appVersionEl) {
            appVersionEl.textContent = payload.version;
          }
          if (heroVersionEl) {
            var parts = payload.version.split('.');
            var shortVersion =
              parts.length >= 2 ? parts[0] + '.' + parts[1] : payload.version;
            heroVersionEl.textContent = 'v' + shortVersion;
          }
        }
      })
      .catch(function () {
        // Keep fallback value from HTML if version endpoint is unavailable.
      });
  }

  // Navigate parent frame
  document.addEventListener('click', function (event) {
    var target = event.target instanceof Element ? event.target : null;
    var link = target ? target.closest('a[href]') : null;
    if (!link) return;
    var href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return;
    if (window.top && window.top !== window) {
      event.preventDefault();
      window.top.location.href = href;
    }
  });
})();
