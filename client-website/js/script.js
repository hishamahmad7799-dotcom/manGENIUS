/**
 * ManGENIUS Staffing LLC - Master JavaScript
 * Corporate Navigation, Header Scroll, Accessibility & Component Foundation
 * Vanilla JavaScript (No Frameworks or Dependencies)
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* --------------------------------------------------------------------------
     1. STICKY HEADER & SCROLL BEHAVIOR
     -------------------------------------------------------------------------- */
  const header = document.querySelector('.site-header');
  const backToTopBtn = document.querySelector('.back-to-top');

  const handleScroll = () => {
    const scrollY = window.scrollY || window.pageYOffset;

    // Header elevation & blur effect
    if (header) {
      if (scrollY > 15) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }

    // Back to top button visibility
    if (backToTopBtn) {
      if (scrollY > 350) {
        backToTopBtn.classList.add('visible');
      } else {
        backToTopBtn.classList.remove('visible');
      }
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll(); // Initial check on load

  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  /* --------------------------------------------------------------------------
     2. MOBILE NAVIGATION DRAWER & HAMBURGER
     -------------------------------------------------------------------------- */
  const mobileToggle = document.querySelector('.mobile-nav-toggle');
  const mobileDrawer = document.querySelector('.mobile-drawer');
  const mobileBackdrop = document.querySelector('.mobile-drawer-backdrop');
  const mobileCloseBtn = document.querySelector('.mobile-drawer-close');

  const openMobileMenu = () => {
    if (!mobileDrawer) return;
    mobileDrawer.classList.add('open');
    if (mobileBackdrop) mobileBackdrop.classList.add('active');
    if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden'; // Lock background scrolling
  };

  const closeMobileMenu = () => {
    if (!mobileDrawer) return;
    mobileDrawer.classList.remove('open');
    if (mobileBackdrop) mobileBackdrop.classList.remove('active');
    if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      const isExpanded = mobileToggle.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        closeMobileMenu();
      } else {
        openMobileMenu();
      }
    });
  }

  if (mobileCloseBtn) {
    mobileCloseBtn.addEventListener('click', closeMobileMenu);
  }

  if (mobileBackdrop) {
    mobileBackdrop.addEventListener('click', closeMobileMenu);
  }

  // Close mobile drawer with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileDrawer && mobileDrawer.classList.contains('open')) {
      closeMobileMenu();
    }
  });

  /* --------------------------------------------------------------------------
     3. MOBILE ACCORDION SUBMENUS
     -------------------------------------------------------------------------- */
  const mobileDropdownToggles = document.querySelectorAll('.mobile-dropdown-btn');

  mobileDropdownToggles.forEach((toggleBtn) => {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const parentItem = toggleBtn.closest('.mobile-nav-item');
      if (!parentItem) return;
      
      const submenu = parentItem.querySelector('.mobile-submenu');
      if (submenu) {
        const isOpen = submenu.classList.contains('open');
        // Toggle current submenu
        if (isOpen) {
          submenu.classList.remove('open');
          toggleBtn.style.transform = 'rotate(0deg)';
          toggleBtn.setAttribute('aria-expanded', 'false');
        } else {
          submenu.classList.add('open');
          toggleBtn.style.transform = 'rotate(180deg)';
          toggleBtn.setAttribute('aria-expanded', 'true');
        }
      }
    });
  });

  /* --------------------------------------------------------------------------
     4. ACTIVE NAVIGATION LINK DETECTION
     -------------------------------------------------------------------------- */
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');

  navLinks.forEach((link) => {
    const linkHref = link.getAttribute('href');
    if (linkHref && (linkHref === currentPath || (currentPath === '' && linkHref === 'index.html'))) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });

  /* --------------------------------------------------------------------------
     5. DESKTOP ACCESSIBLE DROPDOWNS (KEYBOARD NAVIGATION)
     -------------------------------------------------------------------------- */
  const navItemsWithDropdown = document.querySelectorAll('.nav-item.has-dropdown');

  navItemsWithDropdown.forEach((item) => {
    const parentLink = item.querySelector('.nav-link');
    const dropdown = item.querySelector('.dropdown-menu');

    if (parentLink && dropdown) {
      // Handle Space or ArrowDown key for keyboard users (Enter follows link naturally)
      parentLink.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          dropdown.style.opacity = '1';
          dropdown.style.visibility = 'visible';
          dropdown.style.pointerEvents = 'auto';
          dropdown.style.transform = 'translateY(0)';
          
          const firstItem = dropdown.querySelector('a');
          if (firstItem) firstItem.focus();
        }
      });

      // Close dropdown on Escape inside it
      dropdown.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          dropdown.removeAttribute('style');
          parentLink.focus();
        }
      });

      // Reset inline styles when keyboard focus leaves the dropdown item
      item.addEventListener('focusout', (e) => {
        if (!item.contains(e.relatedTarget)) {
          dropdown.removeAttribute('style');
        }
      });
    }
  });

  /* --------------------------------------------------------------------------
     6. SMOOTH SCROLL FOR IN-PAGE ANCHOR LINKS
     -------------------------------------------------------------------------- */
  document.querySelectorAll('a[href^="#"]:not([href="#"])').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        const headerHeight = header ? header.offsetHeight : 0;
        const targetPos = targetEl.getBoundingClientRect().top + window.pageYOffset - headerHeight - 16;
        window.scrollTo({
          top: targetPos,
          behavior: 'smooth'
        });
        // If inside mobile drawer, close drawer after click
        if (mobileDrawer && mobileDrawer.classList.contains('open')) {
          closeMobileMenu();
        }
      }
    });
  });

  /* --------------------------------------------------------------------------
     7. SCROLL REVEAL ANIMATIONS (IntersectionObserver)
     -------------------------------------------------------------------------- */
  const revealElements = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window && revealElements.length > 0) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      root: null,
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    // Fallback for older browsers
    revealElements.forEach(el => el.classList.add('revealed'));
  }

  /* --------------------------------------------------------------------------
     8. FUNCTIONAL TESTIMONIAL CAROUSEL
     -------------------------------------------------------------------------- */
  const carousel = document.querySelector('.testimonial-carousel');
  if (carousel) {
    const track = carousel.querySelector('.carousel-track');
    const slides = Array.from(carousel.querySelectorAll('.carousel-slide'));
    const prevBtn = document.querySelector('.carousel-prev');
    const nextBtn = document.querySelector('.carousel-next');
    const dotsContainer = document.querySelector('.carousel-dots');

    if (track && slides.length > 0) {
      let currentIndex = 0;
      let autoPlayTimer = null;
      const totalSlides = slides.length;

      // Generate indicator dots
      if (dotsContainer) {
        dotsContainer.innerHTML = '';
        slides.forEach((_, idx) => {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = `carousel-dot ${idx === 0 ? 'active' : ''}`;
          dot.setAttribute('aria-label', `Go to testimonial slide ${idx + 1}`);
          dot.addEventListener('click', () => {
            goToSlide(idx);
            resetAutoPlay();
          });
          dotsContainer.appendChild(dot);
        });
      }

      const updateDots = () => {
        if (!dotsContainer) return;
        const dots = dotsContainer.querySelectorAll('.carousel-dot');
        dots.forEach((dot, idx) => {
          dot.classList.toggle('active', idx === currentIndex);
          dot.setAttribute('aria-current', idx === currentIndex ? 'true' : 'false');
        });
      };

      const goToSlide = (index) => {
        if (index < 0) {
          currentIndex = totalSlides - 1;
        } else if (index >= totalSlides) {
          currentIndex = 0;
        } else {
          currentIndex = index;
        }

        track.style.transform = `translateX(-${currentIndex * 100}%)`;
        updateDots();

        slides.forEach((slide, idx) => {
          slide.setAttribute('aria-hidden', idx !== currentIndex ? 'true' : 'false');
        });
      };

      // Button listeners
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          goToSlide(currentIndex - 1);
          resetAutoPlay();
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          goToSlide(currentIndex + 1);
          resetAutoPlay();
        });
      }

      // Keyboard navigation
      carousel.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
          goToSlide(currentIndex - 1);
          resetAutoPlay();
        } else if (e.key === 'ArrowRight') {
          goToSlide(currentIndex + 1);
          resetAutoPlay();
        }
      });

      // Touch swipe gestures
      let touchStartX = 0;
      let touchEndX = 0;

      track.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      track.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
      }, { passive: true });

      const handleSwipe = () => {
        const swipeDistance = touchStartX - touchEndX;
        if (Math.abs(swipeDistance) > 40) {
          if (swipeDistance > 0) {
            goToSlide(currentIndex + 1);
          } else {
            goToSlide(currentIndex - 1);
          }
          resetAutoPlay();
        }
      };

      // Autoplay with pause on interaction
      const startAutoPlay = () => {
        stopAutoPlay();
        autoPlayTimer = setInterval(() => {
          goToSlide(currentIndex + 1);
        }, 6500);
      };

      const stopAutoPlay = () => {
        if (autoPlayTimer) {
          clearInterval(autoPlayTimer);
          autoPlayTimer = null;
        }
      };

      const resetAutoPlay = () => {
        stopAutoPlay();
        startAutoPlay();
      };

      carousel.addEventListener('mouseenter', stopAutoPlay);
      carousel.addEventListener('mouseleave', startAutoPlay);
      carousel.addEventListener('focusin', stopAutoPlay);
      carousel.addEventListener('focusout', startAutoPlay);

      // Initialize
      goToSlide(0);
      startAutoPlay();
    }
  }

  /* --------------------------------------------------------------------------
     9. FUNCTIONAL INDUSTRY HORIZONTAL CAROUSEL
     -------------------------------------------------------------------------- */
  const industryCarousel = document.querySelector('.industry-carousel');
  if (industryCarousel) {
    const track = industryCarousel.querySelector('.industry-track');
    const slides = Array.from(industryCarousel.querySelectorAll('.industry-slide'));
    const prevBtn = document.querySelector('.industry-prev');
    const nextBtn = document.querySelector('.industry-next');
    const dotsContainer = document.querySelector('.industry-dots');

    if (track && slides.length > 0) {
      let currentIndex = 0;
      let isDragging = false;

      const getVisibleCount = () => {
        if (window.innerWidth <= 640) return 1;
        if (window.innerWidth <= 1024) return 2;
        return 3;
      };

      const getMaxIndex = () => {
        return Math.max(0, slides.length - getVisibleCount());
      };

      const renderDots = () => {
        if (!dotsContainer) return;
        const maxIdx = getMaxIndex();
        dotsContainer.innerHTML = '';
        if (maxIdx === 0) {
          dotsContainer.style.display = 'none';
          return;
        }
        dotsContainer.style.display = 'flex';
        for (let i = 0; i <= maxIdx; i++) {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = `carousel-dot ${i === currentIndex ? 'active' : ''}`;
          dot.setAttribute('aria-label', `Go to industry slide position ${i + 1}`);
          dot.addEventListener('click', () => {
            goToSlide(i);
          });
          dotsContainer.appendChild(dot);
        }
      };

      const updateControls = () => {
        const maxIdx = getMaxIndex();
        if (prevBtn) {
          if (maxIdx === 0) {
            prevBtn.disabled = true;
            prevBtn.style.opacity = '0.35';
            prevBtn.style.cursor = 'default';
          } else {
            prevBtn.disabled = false;
            prevBtn.style.opacity = '1';
            prevBtn.style.cursor = 'pointer';
          }
        }
        if (nextBtn) {
          if (maxIdx === 0) {
            nextBtn.disabled = true;
            nextBtn.style.opacity = '0.35';
            nextBtn.style.cursor = 'default';
          } else {
            nextBtn.disabled = false;
            nextBtn.style.opacity = '1';
            nextBtn.style.cursor = 'pointer';
          }
        }

        if (dotsContainer) {
          const dots = dotsContainer.querySelectorAll('.carousel-dot');
          dots.forEach((dot, idx) => {
            dot.classList.toggle('active', idx === currentIndex);
            dot.setAttribute('aria-current', idx === currentIndex ? 'true' : 'false');
          });
        }
      };

      const goToSlide = (index) => {
        const maxIdx = getMaxIndex();
        if (index > maxIdx) {
          currentIndex = 0;
        } else if (index < 0) {
          currentIndex = maxIdx;
        } else {
          currentIndex = index;
        }

        if (maxIdx === 0) {
          track.style.transform = 'translateX(0px)';
        } else {
          const slideWidth = slides[0].getBoundingClientRect().width;
          const gap = parseFloat(window.getComputedStyle(track).gap) || 24;
          const offset = currentIndex * (slideWidth + gap);
          track.style.transform = `translateX(-${offset}px)`;
        }

        updateControls();
      };

      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          goToSlide(currentIndex - 1);
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          goToSlide(currentIndex + 1);
        });
      }

      // Touch swipe gestures
      let touchStartX = 0;
      let touchEndX = 0;

      track.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      track.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const swipeDistance = touchStartX - touchEndX;
        if (Math.abs(swipeDistance) > 40) {
          if (swipeDistance > 0) {
            goToSlide(currentIndex + 1);
          } else {
            goToSlide(currentIndex - 1);
          }
        }
      }, { passive: true });

      // Mouse drag gestures (Desktop & Laptop touchpads / mice)
      let mouseStartX = 0;
      industryCarousel.addEventListener('mousedown', (e) => {
        isDragging = true;
        mouseStartX = e.pageX;
        industryCarousel.classList.add('is-dragging');
      });

      window.addEventListener('mouseup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        industryCarousel.classList.remove('is-dragging');
        const diffX = mouseStartX - e.pageX;
        if (Math.abs(diffX) > 45) {
          if (diffX > 0) {
            goToSlide(currentIndex + 1);
          } else {
            goToSlide(currentIndex - 1);
          }
        }
      });

      // Handle window resizing with debounce
      let resizeDebounce;
      window.addEventListener('resize', () => {
        clearTimeout(resizeDebounce);
        resizeDebounce = setTimeout(() => {
          renderDots();
          goToSlide(currentIndex);
        }, 150);
      });

      // Initial render
      renderDots();
      goToSlide(0);
    }
  }

  /* --------------------------------------------------------------------------
     10. LIVE COUNTING ANIMATION FOR HERO STATS
     -------------------------------------------------------------------------- */
  const counterElements = document.querySelectorAll('.trust-item-stat .counter');
  if (counterElements.length > 0) {
    const animateCounter = (counter) => {
      const target = parseFloat(counter.getAttribute('data-target'));
      const decimals = parseInt(counter.getAttribute('data-decimals') || '0', 10);
      const duration = 1800; // 1.8s smooth duration
      const startTime = performance.now();

      // Respect accessibility preferences
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        counter.textContent = target.toFixed(decimals);
        return;
      }

      const updateCount = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Cubic ease-out deceleration curve
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentVal = progress === 1 ? target : (target * easeOut);

        counter.textContent = currentVal.toFixed(decimals);

        if (progress < 1) {
          requestAnimationFrame(updateCount);
        } else {
          counter.textContent = target.toFixed(decimals);
        }
      };

      requestAnimationFrame(updateCount);
    };

    if ('IntersectionObserver' in window) {
      const counterObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });

      counterElements.forEach(counter => counterObserver.observe(counter));
    } else {
      counterElements.forEach(counter => animateCounter(counter));
    }
  }

  /* --------------------------------------------------------------------------
     11. CAREERS ENQUIRY FORM VALIDATION, RESUME UPLOAD & AREA PRE-SELECTION
     -------------------------------------------------------------------------- */
  const careersForm = document.getElementById('careersEnquiryForm');
  if (careersForm) {
    const areaSelect = document.getElementById('staffingArea');
    const statusBox = document.getElementById('careersFormStatus');
    const resumeInput = document.getElementById('resumeUpload');
    const resumeWrapper = document.getElementById('resumeUploadWrapper');
    const resumeSelectedText = document.getElementById('resumeSelectedFile');
    const privacyCheckbox = document.getElementById('privacyConsent');

    // Configured maximum file size (in MB) aligned with upload provider settings
    const maxFileSizeMB = parseFloat(careersForm.getAttribute('data-max-file-size-mb')) || 10;
    const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;
    const allowedExtensions = ['.pdf', '.docx'];
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    // Pre-select Preferred Staffing Area when clicking "Express Interest" cards
    document.querySelectorAll('[data-staffing-area]').forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const area = trigger.getAttribute('data-staffing-area');
        if (areaSelect && area) {
          areaSelect.value = area;
          areaSelect.classList.remove('is-invalid');
          const errEl = document.getElementById('staffingAreaError');
          if (errEl) {
            errEl.textContent = '';
            errEl.classList.remove('visible');
          }
        }
      });
    });

    const validateResumeFile = () => {
      if (!resumeInput) return '';
      const files = resumeInput.files;
      if (!files || files.length === 0) {
        return 'Please upload your resume in PDF or DOCX format.';
      }
      const file = files[0];
      const lowerName = (file.name || '').toLowerCase();
      const hasValidExt = allowedExtensions.some((ext) => lowerName.endsWith(ext));
      const hasValidMime = !file.type || allowedMimeTypes.includes(file.type);
      if (!hasValidExt || !hasValidMime) {
        return 'Unsupported file type. Please upload a PDF (.pdf) or Word (.docx) document.';
      }
      if (file.size > maxFileSizeBytes) {
        return `File size exceeds the ${maxFileSizeMB} MB maximum limit. Please upload a smaller PDF or DOCX file.`;
      }
      return '';
    };

    const validators = {
      fullName: (val) => {
        if (!val.trim()) return 'Please enter your full name.';
        if (val.trim().length < 2) return 'Please enter at least 2 characters for your full name.';
        return '';
      },
      emailAddress: (val) => {
        if (!val.trim()) return 'Please enter your email address.';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(val.trim())) return 'Please enter a valid email address.';
        return '';
      },
      phoneNumber: (val) => {
        if (!val.trim()) return 'Please enter your phone number.';
        const digits = val.replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15) return 'Please enter a valid phone number (7 to 15 digits).';
        return '';
      },
      staffingArea: (val) => {
        const allowed = ['Information Technology', 'Special Education', 'Healthcare'];
        if (!allowed.includes(val)) return 'Please select a preferred staffing area.';
        return '';
      },
      relevantExperience: (val) => {
        if (!val.trim()) return 'Please briefly describe your relevant experience.';
        if (val.trim().length < 3) return 'Please provide a brief summary of your relevant experience.';
        return '';
      },
      careerMessage: (val) => {
        if (!val.trim()) return 'Please enter a message about the opportunities you are interested in.';
        if (val.trim().length < 10) return 'Please enter at least 10 characters in your message.';
        return '';
      }
    };

    const setFieldError = (fieldId, message) => {
      const input = document.getElementById(fieldId);
      const errEl = document.getElementById(`${fieldId}Error`);
      if (!input || !errEl) return;
      if (message) {
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
        if (fieldId === 'resumeUpload' && resumeWrapper) resumeWrapper.classList.add('is-invalid');
        errEl.textContent = message;
        errEl.classList.add('visible');
      } else {
        input.classList.remove('is-invalid');
        input.removeAttribute('aria-invalid');
        if (fieldId === 'resumeUpload' && resumeWrapper) resumeWrapper.classList.remove('is-invalid');
        errEl.textContent = '';
        errEl.classList.remove('visible');
      }
    };

    const showStatus = (type, message) => {
      if (!statusBox) return;
      statusBox.className = `form-status is-visible is-${type}`;
      statusBox.textContent = message;
    };

    Object.keys(validators).forEach((fieldId) => {
      const el = document.getElementById(fieldId);
      if (!el) return;
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        if (el.classList.contains('is-invalid')) {
          setFieldError(fieldId, validators[fieldId](el.value));
        }
      });
      el.addEventListener('blur', () => {
        setFieldError(fieldId, validators[fieldId](el.value));
      });
    });

    if (resumeInput) {
      resumeInput.addEventListener('change', () => {
        const errMsg = validateResumeFile();
        setFieldError('resumeUpload', errMsg);
        if (resumeSelectedText) {
          if (!errMsg && resumeInput.files && resumeInput.files[0]) {
            const f = resumeInput.files[0];
            const sizeText = f.size >= 1024 * 1024
              ? `${(f.size / (1024 * 1024)).toFixed(2)} MB`
              : `${Math.max(1, Math.round(f.size / 1024))} KB`;
            resumeSelectedText.textContent = `Selected file: ${f.name} (${sizeText})`;
            resumeSelectedText.classList.add('visible');
          } else {
            resumeSelectedText.textContent = '';
            resumeSelectedText.classList.remove('visible');
          }
        }
      });
    }

    if (privacyCheckbox) {
      privacyCheckbox.addEventListener('change', () => {
        if (privacyCheckbox.checked) {
          setFieldError('privacyConsent', '');
        }
      });
    }

    careersForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      let firstInvalid = null;
      Object.keys(validators).forEach((fieldId) => {
        const el = document.getElementById(fieldId);
        if (!el) return;
        const errMsg = validators[fieldId](el.value);
        setFieldError(fieldId, errMsg);
        if (errMsg && !firstInvalid) {
          firstInvalid = el;
        }
      });

      const resumeErr = validateResumeFile();
      setFieldError('resumeUpload', resumeErr);
      if (resumeErr && !firstInvalid && resumeInput) {
        firstInvalid = resumeInput;
      }

      if (privacyCheckbox) {
        const privacyErr = privacyCheckbox.checked
          ? ''
          : 'Please confirm that you have read the Privacy Policy before submitting.';
        setFieldError('privacyConsent', privacyErr);
        if (privacyErr && !firstInvalid) {
          firstInvalid = privacyCheckbox;
        }
      }

      if (firstInvalid) {
        showStatus('error', 'Please review and complete the highlighted required fields before submitting your enquiry.');
        firstInvalid.focus();
        return;
      }

      const actionUrl = (careersForm.getAttribute('action') || '').trim();
      const isPlaceholder = !actionUrl || actionUrl === '#' || actionUrl.includes('YOUR_FORMSPREE') || actionUrl.includes('YOUR_UPLOAD_ENDPOINT');

      if (isPlaceholder) {
        showStatus(
          'error',
          'Submission unavailable: the external form and resume upload endpoint is not yet configured. Please configure an active Formspree (or secure upload backend) URL in the form action attribute. Your resume and information were not uploaded or stored.'
        );
        return;
      }

      const submitBtn = careersForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const response = await fetch(actionUrl, {
          method: 'POST',
          body: new FormData(careersForm),
          headers: { Accept: 'application/json' }
        });

        if (response.ok) {
          showStatus('success', 'Thank you for expressing your interest. Your enquiry and resume have been received by the configured upload service.');
          careersForm.reset();
          if (resumeSelectedText) {
            resumeSelectedText.textContent = '';
            resumeSelectedText.classList.remove('visible');
          }
        } else {
          let providerMsg = 'The external upload service could not accept your submission. Please verify the file type and size or try again later.';
          try {
            const data = await response.json();
            if (data && Array.isArray(data.errors) && data.errors.length > 0 && data.errors[0].message) {
              providerMsg = `Submission error from upload service: ${data.errors[0].message}`;
            }
          } catch (_) {
            // Non-JSON error response
          }
          showStatus('error', providerMsg);
        }
      } catch (err) {
        showStatus('error', 'A network error prevented delivery to the upload service. Please check your connection or contact us directly.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  /* --------------------------------------------------------------------------
     12. CONTACT ENQUIRY FORM VALIDATION (contact.html)
     -------------------------------------------------------------------------- */
  const contactForm = document.getElementById('contactEnquiryForm');
  if (contactForm) {
    const statusBox = document.getElementById('contactFormStatus');

    const contactValidators = {
      contactFullName: (val) => {
        if (!val.trim()) return 'Please enter your full name.';
        if (val.trim().length < 2) return 'Please enter at least 2 characters for your full name.';
        return '';
      },
      contactEmail: (val) => {
        if (!val.trim()) return 'Please enter your email address.';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(val.trim())) return 'Please enter a valid email address.';
        return '';
      },
      contactPhone: (val) => {
        if (!val.trim()) return 'Please enter your phone number.';
        const digits = val.replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15) return 'Please enter a valid phone number (7 to 15 digits).';
        return '';
      },
      contactRole: (val) => {
        const allowed = ['Employer', 'Job Seeker', 'Educational Institution', 'Healthcare Organization', 'Other'];
        if (!allowed.includes(val)) return 'Please select who you are contacting us as.';
        return '';
      },
      contactService: (val) => {
        const allowed = [
          'Information Technology Staffing',
          'Special Education Staffing',
          'Healthcare Staffing',
          'General Enquiry'
        ];
        if (!allowed.includes(val)) return 'Please select an interested staffing service.';
        return '';
      },
      contactMessage: (val) => {
        if (!val.trim()) return 'Please enter your message.';
        if (val.trim().length < 10) return 'Please provide at least 10 characters so we can better understand your enquiry.';
        return '';
      }
    };

    const setContactFieldError = (fieldId, message) => {
      const input = document.getElementById(fieldId);
      const errEl = document.getElementById(`${fieldId}Error`);
      if (!input || !errEl) return;
      if (message) {
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
        errEl.textContent = message;
        errEl.classList.add('visible');
      } else {
        input.classList.remove('is-invalid');
        input.removeAttribute('aria-invalid');
        errEl.textContent = '';
        errEl.classList.remove('visible');
      }
    };

    const showContactStatus = (type, message) => {
      if (!statusBox) return;
      statusBox.className = `form-status is-visible is-${type}`;
      statusBox.textContent = message;
    };

    Object.keys(contactValidators).forEach((fieldId) => {
      const el = document.getElementById(fieldId);
      if (!el) return;
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        if (el.classList.contains('is-invalid')) {
          setContactFieldError(fieldId, contactValidators[fieldId](el.value));
        }
      });
      el.addEventListener('blur', () => {
        setContactFieldError(fieldId, contactValidators[fieldId](el.value));
      });
    });

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      let firstInvalid = null;
      Object.keys(contactValidators).forEach((fieldId) => {
        const el = document.getElementById(fieldId);
        if (!el) return;
        const errMsg = contactValidators[fieldId](el.value);
        setContactFieldError(fieldId, errMsg);
        if (errMsg && !firstInvalid) {
          firstInvalid = el;
        }
      });

      if (firstInvalid) {
        showContactStatus('error', 'Please review and complete the highlighted required fields before submitting.');
        firstInvalid.focus();
        return;
      }

      const actionUrl = (contactForm.getAttribute('action') || '').trim();
      const isPlaceholder = !actionUrl || actionUrl === '#' || actionUrl.includes('YOUR_FORMSPREE');

      if (isPlaceholder) {
        showContactStatus(
          'info',
          'Form validation passed. Because this is a static website, an external form service endpoint (such as Formspree) must be configured on the form action attribute to receive live submissions. No data has been stored or transmitted.'
        );
        return;
      }

      const submitBtn = contactForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const response = await fetch(actionUrl, {
          method: 'POST',
          body: new FormData(contactForm),
          headers: { Accept: 'application/json' }
        });

        if (response.ok) {
          showContactStatus('success', 'Thank you for reaching out. Your enquiry has been sent to ManGENIUS Staffing LLC.');
          contactForm.reset();
        } else {
          showContactStatus('error', 'We could not submit your enquiry through the configured form service. Please try again later or reach out directly.');
        }
      } catch (err) {
        showContactStatus('error', 'A network error prevented delivery. Please check your connection or reach out directly.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  console.log('ManGENIUS Staffing LLC - Master Scripts, Carousels & Live Counters Active.');
});
