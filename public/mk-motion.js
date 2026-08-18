/* web-design-system — motion.js. Copy verbatim. No dependencies. ~2KB.
   Budget: at most 15% of elements should carry data-reveal. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var d = document;

  // 1. Scroll reveal with capped stagger -------------------------------
  var items = d.querySelectorAll('[data-reveal]');
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.style.opacity = 1; el.style.transform = 'none'; });
  } else {
    items.forEach(function (el) {
      el.style.opacity = 0;
      el.style.transform = 'translateY(18px)';
      el.style.transition = 'opacity 280ms cubic-bezier(.16,1,.3,1), transform 280ms cubic-bezier(.16,1,.3,1)';
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = Math.min(+(e.target.dataset.reveal || 0), 6); // cap stagger at 6
        e.target.style.transitionDelay = (i * 70) + 'ms';
        e.target.style.opacity = 1;
        e.target.style.transform = 'none';
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
    items.forEach(function (el) { io.observe(el); });
  }

  // 2. Count-up on numbers --------------------------------------------
  var nums = d.querySelectorAll('[data-count]');
  if (nums.length && !reduce && 'IntersectionObserver' in window) {
    var nio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target, to = parseFloat(el.dataset.count), t0 = null;
        var suffix = el.dataset.countSuffix || '';
        function step(ts) {
          if (!t0) t0 = ts;
          var p = Math.min((ts - t0) / 900, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(to * eased).toLocaleString() + suffix;
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        nio.unobserve(el);
      });
    }, { threshold: 0.5 });
    nums.forEach(function (el) { nio.observe(el); });
  }

  // 3. Sticky header state --------------------------------------------
  var hdr = d.querySelector('[data-sticky-header]');
  if (hdr) {
    var tick = false;
    window.addEventListener('scroll', function () {
      if (tick) return;
      tick = true;
      requestAnimationFrame(function () {
        hdr.classList.toggle('is-stuck', window.scrollY > 24);
        tick = false;
      });
    }, { passive: true });
  }
})();
