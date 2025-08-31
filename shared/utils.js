// Utility functions for the product management system
// Version: 1.3.0 - Simplified

// Mobile detection
export function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

// Safe DOM utilities
export function safeQuerySelector(selector) {
  try {
    return document.querySelector(selector);
  } catch (error) {
    console.warn(`Invalid selector: ${selector}`, error);
    return null;
  }
}

export function safeAddEventListener(element, event, handler, options = {}) {
  if (!element || typeof handler !== 'function') {
    console.warn('Invalid element or handler for event listener');
    return;
  }
  
  try {
    element.addEventListener(event, handler, options);
  } catch (error) {
    console.warn(`Failed to add event listener for ${event}:`, error);
  }
}

// Input validation
export function validateInput(value, type, options = {}) {
  const result = { valid: false, value: null, error: null };
  
  if (options.required && (!value || value.toString().trim() === '')) {
    result.error = 'Campo obbligatorio';
    return result;
  }
  
  if (!value && !options.required) {
    result.valid = true;
    result.value = value;
    return result;
  }
  
  switch (type) {
    case 'text':
      const trimmedValue = value.toString().trim();
      if (options.min && trimmedValue.length < options.min) {
        result.error = `Minimo ${options.min} caratteri`;
        return result;
      }
      if (options.max && trimmedValue.length > options.max) {
        result.error = `Massimo ${options.max} caratteri`;
        return result;
      }
      result.valid = true;
      result.value = trimmedValue;
      break;
      
    case 'number':
      const numValue = Number(value);
      if (isNaN(numValue)) {
        result.error = 'Deve essere un numero';
        return result;
      }
      if (options.min !== undefined && numValue < options.min) {
        result.error = `Minimo ${options.min}`;
        return result;
      }
      if (options.max !== undefined && numValue > options.max) {
        result.error = `Massimo ${options.max}`;
        return result;
      }
      result.valid = true;
      result.value = numValue;
      break;
      
    default:
      result.valid = true;
      result.value = value;
  }
  
  return result;
}

// Date utilities
export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

export function getWeekString(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const week = getWeekNumber(d);
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

export function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export function getDayName(date) {
  const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  return days[new Date(date).getDay()];
}

// Toast notifications
let toastContainer = null;

function createToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      right: 20px;
      z-index: 10000;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(message, type = 'info', duration = 3000) {
  const container = createToastContainer();
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.pointerEvents = 'auto';
  
  container.appendChild(toast);
  
  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-show');
  });
  
  // Auto remove
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 400);
  }, duration);
  
  // Click to dismiss
  toast.addEventListener('click', () => {
    toast.classList.remove('toast-show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 400);
  });
}

// Debounce utility
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      func.apply(this, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Color utilities
export function getContrastColor(hexColor) {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#000000' : '#ffffff';
}

// Mobile utilities
export function initMobileUtils() {
  // Set CSS custom property for viewport height
  function setVH() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }
  
  setVH();
  window.addEventListener('resize', debounce(setVH, 100));
  window.addEventListener('orientationchange', debounce(setVH, 100));
  
  // Prevent zoom on input focus for iOS
  if (isIOS()) {
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      if (input.style.fontSize !== '16px') {
        input.style.fontSize = '16px';
      }
    });
  }
  
  // Prevent pull-to-refresh on mobile
  document.body.style.overscrollBehavior = 'contain';
}

// Theme management
export function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else if (!systemPrefersDark) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  
  // Create theme toggle if it doesn't exist
  let toggle = document.querySelector('.theme-toggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.className = 'theme-toggle';
    toggle.setAttribute('aria-label', 'Cambia tema');
    toggle.innerHTML = document.documentElement.getAttribute('data-theme') === 'light' ? '🌙' : '☀️';
    
    toggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      toggle.innerHTML = newTheme === 'light' ? '🌙' : '☀️';
    });
    
    document.body.appendChild(toggle);
  }
}

// Hamburger menu
export function initHamburgerMenu() {
  let hamburger = document.querySelector('.hamburger-menu');
  let dropdown = document.querySelector('.dropdown-menu');
  
  if (!hamburger) {
    hamburger = document.createElement('button');
    hamburger.className = 'hamburger-menu';
    hamburger.setAttribute('aria-label', 'Menu');
    hamburger.innerHTML = `
      <span class="hamburger-line"></span>
      <span class="hamburger-line"></span>
      <span class="hamburger-line"></span>
    `;
    document.body.appendChild(hamburger);
  }
  
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.className = 'dropdown-menu';
    dropdown.innerHTML = `
      <a href="/" class="dropdown-item">🏠 Home</a>
      <a href="/lista/" class="dropdown-item">📝 Lista Dipendenti</a>
      <a href="/magazzino/" class="dropdown-item">📦 Magazzino</a>
      <a href="/catalogo/" class="dropdown-item">📋 Gestione Catalogo</a>
    `;
    document.body.appendChild(dropdown);
  }
  
  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    hamburger.classList.toggle('open');
    dropdown.classList.toggle('show');
  });
  
  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !dropdown.contains(e.target)) {
      hamburger.classList.remove('open');
      dropdown.classList.remove('show');
    }
  });
  
  // Close menu when clicking on a link
  dropdown.addEventListener('click', (e) => {
    if (e.target.classList.contains('dropdown-item')) {
      hamburger.classList.remove('open');
      dropdown.classList.remove('show');
    }
  });
}