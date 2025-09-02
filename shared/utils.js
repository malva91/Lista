// Utility functions for the product management system
// Version: 1.3.0 - Simplified

// Import error handler
import { errorHandler, reportError } from './error-handler.js?v=1.3.0';

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
    // Wrapper per catturare errori negli event handler
    const wrappedHandler = (e) => {
      try {
        handler(e);
      } catch (error) {
        reportError(`Errore in event handler ${event}`, { 
          element: element.tagName, 
          error: error.message 
        });
        throw error;
      }
    };
    
    element.addEventListener(event, wrappedHandler, options);
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
let activeToasts = [];
const maxToasts = 3;

function createToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: calc(var(--safe-area-top) + 10px);
      left: 10px;
      right: 10px;
      z-index: 10000;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    `;
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(message, type = 'info', duration = 2500) {
  if (!message) return;
  
  const container = createToastContainer();
  
  // Limit number of active toasts
  if (activeToasts.length >= maxToasts) {
    const oldestToast = activeToasts.shift();
    if (oldestToast && oldestToast.parentNode) {
      oldestToast.classList.remove('toast-show');
      setTimeout(() => {
        if (oldestToast.parentNode) {
          oldestToast.parentNode.removeChild(oldestToast);
        }
      }, 300);
    }
  }
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Sanitizza il messaggio
  const sanitizedMessage = message.toString().substring(0, 200);
  toast.textContent = sanitizedMessage;
  
  toast.style.pointerEvents = 'auto';
  toast.style.cssText += `
    max-width: 280px;
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    line-height: 1.4;
    word-break: break-word;
  `;
  
  container.appendChild(toast);
  activeToasts.push(toast);
  
  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-show');
  });
  
  const removeToast = () => {
    const index = activeToasts.indexOf(toast);
    if (index > -1) {
      activeToasts.splice(index, 1);
    }
    toast.classList.remove('toast-show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  };
  
  // Auto remove
  const timeoutId = setTimeout(() => {
    removeToast();
  }, duration);
  
  // Click to dismiss
  toast.addEventListener('click', () => {
    clearTimeout(timeoutId);
    removeToast();
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
    
    // Determina il percorso base in base alla posizione corrente
    const currentPath = window.location.pathname;
    const isInSubfolder = currentPath.includes('/lista/') || currentPath.includes('/magazzino/') || currentPath.includes('/catalogo/');
    const basePath = isInSubfolder ? '../' : './';
    
    dropdown.innerHTML = `
      <a href="${basePath}" class="dropdown-item">🏠 Home</a>
      <a href="${basePath}lista/" class="dropdown-item">📝 Lista Dipendenti</a>
      <a href="${basePath}magazzino/" class="dropdown-item">📦 Magazzino</a>
      <a href="${basePath}catalogo/" class="dropdown-item">📋 Gestione Catalogo</a>
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