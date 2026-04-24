(function () {
  'use strict';

  /* ============================================================
     MOBILE NAV — with overlay, body scroll lock, outside click
     ============================================================ */
  var nav = document.querySelector('.nav');
  var toggle = document.querySelector('.nav__toggle');
  var overlay = document.querySelector('.nav__overlay');

  function openMenu() {
    if (!nav) return;
    nav.setAttribute('data-open', 'true');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
  }

  function closeMenu() {
    if (!nav) return;
    nav.setAttribute('data-open', 'false');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  }

  if (nav && toggle) {
    toggle.addEventListener('click', function () {
      var isOpen = nav.getAttribute('data-open') === 'true';
      isOpen ? closeMenu() : openMenu();
    });

    // Close menu on nav link click
    document.querySelectorAll('.nav__link').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    // Close menu on overlay click
    if (overlay) {
      overlay.addEventListener('click', closeMenu);
    }

    // Close menu on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.getAttribute('data-open') === 'true') {
        closeMenu();
        toggle.focus();
      }
    });
  }

  /* ============================================================
     NAV SCROLL SHADOW + ACTIVE SECTION TRACKING
     ============================================================ */
  var sections = document.querySelectorAll('section[id]');
  var navLinks = document.querySelectorAll('.nav__link[href^="#"]');

  function onScroll() {
    var scrollY = window.scrollY;

    // Nav shadow
    if (nav) {
      if (scrollY > 10) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    }

    // Active section tracking
    var current = '';
    sections.forEach(function (section) {
      var top = section.offsetTop - 120;
      if (scrollY >= top) {
        current = section.getAttribute('id');
      }
    });

    navLinks.forEach(function (link) {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + current) {
        link.classList.add('active');
      }
    });
  }

  var scrollTimer;
  window.addEventListener('scroll', function () {
    if (scrollTimer) cancelAnimationFrame(scrollTimer);
    scrollTimer = requestAnimationFrame(onScroll);
  }, { passive: true });

  /* ============================================================
     SCROLL REVEAL — IntersectionObserver with stagger
     ============================================================ */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      reveals.forEach(function (el) { el.classList.add('visible'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

      reveals.forEach(function (el) { io.observe(el); });
    }
  } else {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  }

  /* ============================================================
     BACK TO TOP
     ============================================================ */
  var backToTop = document.querySelector('.back-to-top');
  if (backToTop) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 600) {
        backToTop.classList.add('visible');
      } else {
        backToTop.classList.remove('visible');
      }
    }, { passive: true });

    backToTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ============================================================
     LIGHTBOX — with focus trapping, ESC, body lock
     ============================================================ */
  var lightbox = document.querySelector('.lightbox');
  var lightboxImg = lightbox ? lightbox.querySelector('img') : null;
  var lightboxClose = lightbox ? lightbox.querySelector('.lightbox__close') : null;
  var lastFocusedElement = null;

  function openLightbox(src, alt) {
    if (!lightbox || !lightboxImg) return;
    lastFocusedElement = document.activeElement;
    lightboxImg.src = src;
    lightboxImg.alt = alt || '';
    lightbox.classList.add('open');
    document.body.classList.add('lightbox-open');

    // Focus the close button after opening
    setTimeout(function () {
      if (lightboxClose) lightboxClose.focus();
    }, 100);
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('open');
    document.body.classList.remove('lightbox-open');

    // Return focus to trigger element
    if (lastFocusedElement) {
      lastFocusedElement.focus();
      lastFocusedElement = null;
    }
  }

  // Open lightbox on click or Enter/Space
  document.querySelectorAll('[data-lightbox]').forEach(function (img) {
    // Make images keyboard-accessible
    if (!img.getAttribute('tabindex')) {
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', 'تكبير الصورة: ' + (img.alt || ''));
    }

    img.addEventListener('click', function () {
      openLightbox(img.src, img.alt);
    });

    img.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(img.src, img.alt);
      }
    });
  });

  if (lightbox) {
    // Close on overlay click
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });

    // Focus trap inside lightbox
    lightbox.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        // Only one focusable element (close button), trap focus
        e.preventDefault();
        if (lightboxClose) lightboxClose.focus();
      }
    });
  }

  if (lightboxClose) {
    lightboxClose.addEventListener('click', closeLightbox);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && lightbox && lightbox.classList.contains('open')) {
      closeLightbox();
    }
  });

  /* ============================================================
     HERO VIDEO — poster fade, reduced motion fallback
     ============================================================ */
  var heroVideo = document.querySelector('.hero__video');
  var heroPoster = document.querySelector('.hero__poster');

  if (heroVideo && heroPoster) {
    var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      heroVideo.removeAttribute('autoplay');
      heroVideo.pause();
    } else {
      heroVideo.addEventListener('canplay', function () {
        heroPoster.classList.add('loaded');
      }, { once: true });

      // Fallback: fade poster after 3s even if canplay doesn't fire
      setTimeout(function () {
        if (!heroPoster.classList.contains('loaded') && !heroVideo.paused) {
          heroPoster.classList.add('loaded');
        }
      }, 3000);
    }
  }

  /* ============================================================
     CONTACT FORM — validation + submission
     ============================================================ */
  var form = document.querySelector('.contact-form');
  if (form) {
    var submitBtn = form.querySelector('button[type="submit"]');

    // Client-side validation
    function validateField(field) {
      var parent = field.closest('.form-field');
      var errorEl = parent ? parent.querySelector('.form-field__error') : null;

      if (field.validity.valid) {
        if (parent) parent.classList.remove('has-error');
        return true;
      } else {
        if (parent) parent.classList.add('has-error');
        if (errorEl) {
          if (field.validity.valueMissing) {
            errorEl.textContent = 'هذا الحقل مطلوب';
          } else if (field.validity.typeMismatch && field.type === 'email') {
            errorEl.textContent = 'يرجى إدخال بريد إلكتروني صحيح';
          } else {
            errorEl.textContent = 'قيمة غير صحيحة';
          }
        }
        return false;
      }
    }

    // Validate on blur
    form.querySelectorAll('input, textarea').forEach(function (field) {
      field.addEventListener('blur', function () {
        validateField(field);
      });

      // Clear error on input
      field.addEventListener('input', function () {
        var parent = field.closest('.form-field');
        if (parent && parent.classList.contains('has-error')) {
          if (field.validity.valid) {
            parent.classList.remove('has-error');
          }
        }
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var msgSuccess = form.querySelector('.form-message--success');
      var msgError = form.querySelector('.form-message--error');

      // Hide previous messages
      if (msgSuccess) { msgSuccess.classList.remove('show'); msgSuccess.style.display = 'none'; }
      if (msgError) { msgError.classList.remove('show'); msgError.style.display = 'none'; }

      // Validate all fields
      var fields = form.querySelectorAll('input[required], textarea[required]');
      var allValid = true;
      fields.forEach(function (field) {
        if (!validateField(field)) {
          allValid = false;
        }
      });

      if (!allValid) {
        // Focus first invalid field
        var firstInvalid = form.querySelector('.form-field.has-error input, .form-field.has-error textarea');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var endpoint = form.getAttribute('action');

      if (!endpoint || endpoint.indexOf('REPLACE') !== -1) {
        if (msgError) {
          msgError.textContent = 'نموذج التواصل غير مهيأ بعد. أضف مفتاح Formspree لتفعيله.';
          msgError.classList.add('show');
          msgError.style.display = 'block';
        }
        return;
      }

      // Show loading state
      if (submitBtn) {
        submitBtn.classList.add('btn--loading');
        submitBtn.disabled = true;
      }

      var data = new FormData(form);
      fetch(endpoint, {
        method: 'POST',
        body: data,
        headers: { 'Accept': 'application/json' }
      }).then(function (res) {
        if (submitBtn) {
          submitBtn.classList.remove('btn--loading');
          submitBtn.disabled = false;
        }

        if (res.ok) {
          form.reset();
          // Clear all error states
          form.querySelectorAll('.form-field').forEach(function (f) {
            f.classList.remove('has-error');
          });
          if (msgSuccess) {
            msgSuccess.classList.add('show');
            msgSuccess.style.display = 'block';
            msgSuccess.setAttribute('role', 'status');
          }
        } else {
          if (msgError) {
            msgError.textContent = 'تعذر الإرسال، حاول مرة أخرى.';
            msgError.classList.add('show');
            msgError.style.display = 'block';
          }
        }
      }).catch(function () {
        if (submitBtn) {
          submitBtn.classList.remove('btn--loading');
          submitBtn.disabled = false;
        }
        if (msgError) {
          msgError.textContent = 'تعذر الإرسال، تحقق من اتصالك بالإنترنت.';
          msgError.classList.add('show');
          msgError.style.display = 'block';
        }
      });
    });
  }

  /* ============================================================
     UPDATE YEAR IN FOOTER
     ============================================================ */
  var yearEl = document.querySelector('[data-current-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

})();
