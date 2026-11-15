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
      if (scrollY > 20) {
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
      // Handle Enter or Space key for keyboard users
      parentLink.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
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

  console.log('ManGENIUS Staffing LLC - Shared UI Foundation Initialized.');
});
