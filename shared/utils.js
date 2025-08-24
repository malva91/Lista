// Utility functions for the product management system
// Version: 1.2.0

// Performance monitoring
let performanceMetrics = {
  loadTimes: [],
  renderTimes: [],
  interactionTimes: []
};

// Cache management
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const CACHE_VERSION = '1.2.0';

// Mobile detection
export function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isAndroid() {
  return /Android/.test(navigator.userAgent);
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
export function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(this, args);
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

// Generate unique ID for Firestore documents
export async function generateUniqueId(collectionName, baseName, db) {
  const { collection, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  
  const sanitized = baseName.toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  let id = sanitized;
  let counter = 1;
  
  while (true) {
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return id;
    }
    
    id = `${sanitized}-${counter}`;
    counter++;
    
    if (counter > 100) {
      id = `${sanitized}-${Date.now()}`;
      break;
    }
  }
  
  return id;
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
  
  // Handle keyboard on mobile
  if (isMobile()) {
    let initialViewportHeight = window.innerHeight;
    
    function handleViewportChange() {
      const currentHeight = window.innerHeight;
      const keyboardHeight = Math.max(0, initialViewportHeight - currentHeight);
      document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
    }
    
    window.addEventListener('resize', debounce(handleViewportChange, 100));
    
    // Prevent zoom on input focus for iOS
    if (isIOS()) {
      const inputs = document.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        if (input.style.fontSize !== '16px') {
          input.style.fontSize = '16px';
        }
      });
    }
  }
  
  // Add touch feedback
  document.addEventListener('touchstart', function() {}, { passive: true });
  
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
  
  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      toggle.innerHTML = e.matches ? '☀️' : '🌙';
    }
  });
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

// Performance optimization utilities
export function getAdaptiveBatchSize() {
  const screenHeight = window.innerHeight;
  const isMobileDevice = isMobile();
  
  if (isMobileDevice) {
    return screenHeight < 600 ? 15 : 20;
  }
  
  return screenHeight < 800 ? 25 : 35;
}

export function scheduleRender(callback) {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      callback();
      resolve();
    });
  });
}

// Global batch processor for DOM operations
export const globalBatchProcessor = {
  queue: [],
  isProcessing: false,
  
  add(operation) {
    this.queue.push(operation);
    if (!this.isProcessing) {
      this.process();
    }
  },
  
  async process() {
    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, 5); // Process 5 operations at a time
      
      await new Promise(resolve => {
        requestAnimationFrame(() => {
          batch.forEach(operation => {
            try {
              operation();
            } catch (error) {
              console.warn('Batch operation failed:', error);
            }
          });
          resolve();
        });
      });
      
      // Small delay to prevent blocking
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    this.isProcessing = false;
  }
};

// Smart prefetcher for predictive loading
export const smartPrefetcher = {
  interactions: new Map(),
  patterns: new Map(),
  
  trackInteraction(type, data) {
    const key = `${type}_${JSON.stringify(data)}`;
    const count = this.interactions.get(key) || 0;
    this.interactions.set(key, count + 1);
    
    // Update patterns
    this.updatePatterns(type, data);
  },
  
  updatePatterns(type, data) {
    if (!this.patterns.has(type)) {
      this.patterns.set(type, new Map());
    }
    
    const typePatterns = this.patterns.get(type);
    const pattern = JSON.stringify(data);
    const count = typePatterns.get(pattern) || 0;
    typePatterns.set(pattern, count + 1);
  },
  
  shouldPrefetch(type, data) {
    const key = `${type}_${JSON.stringify(data)}`;
    const count = this.interactions.get(key) || 0;
    return count > 2; // Prefetch if used more than twice
  }
};

// Virtual scroll manager for large lists
export class VirtualScrollManager {
  constructor(container, itemHeight, renderItem) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.renderItem = renderItem;
    this.items = [];
    this.visibleStart = 0;
    this.visibleEnd = 0;
    this.scrollTop = 0;
    this.containerHeight = 0;
    
    this.init();
  }
  
  init() {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'auto';
    
    this.container.addEventListener('scroll', debounce(() => {
      this.handleScroll();
    }, 16), { passive: true });
    
    this.updateContainerHeight();
    window.addEventListener('resize', debounce(() => {
      this.updateContainerHeight();
    }, 100));
  }
  
  updateContainerHeight() {
    this.containerHeight = this.container.clientHeight;
    this.calculateVisibleRange();
    this.render();
  }
  
  setItems(items) {
    this.items = items;
    this.calculateVisibleRange();
    this.render();
  }
  
  handleScroll() {
    this.scrollTop = this.container.scrollTop;
    this.calculateVisibleRange();
    this.render();
  }
  
  calculateVisibleRange() {
    const buffer = 5; // Render extra items for smooth scrolling
    this.visibleStart = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - buffer);
    this.visibleEnd = Math.min(
      this.items.length,
      Math.ceil((this.scrollTop + this.containerHeight) / this.itemHeight) + buffer
    );
  }
  
  render() {
    const totalHeight = this.items.length * this.itemHeight;
    const offsetY = this.visibleStart * this.itemHeight;
    
    this.container.innerHTML = `
      <div style="height: ${totalHeight}px; position: relative;">
        <div style="transform: translateY(${offsetY}px);">
          ${this.items.slice(this.visibleStart, this.visibleEnd)
            .map((item, index) => this.renderItem(item, this.visibleStart + index))
            .join('')}
        </div>
      </div>
    `;
  }
}

// Enhanced intersection observer for better performance
export function initEnhancedIntersectionObserver() {
  const options = {
    root: null,
    rootMargin: '50px',
    threshold: [0, 0.1, 0.5, 1]
  };
  
  return new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Element is visible, can trigger loading
        const element = entry.target;
        if (element.dataset.lazyLoad) {
          // Trigger lazy loading
          const event = new CustomEvent('lazyLoad', { detail: { element } });
          element.dispatchEvent(event);
        }
      }
    });
  }, options);
}

// Optimized scroll handler
export function createScrollHandler(callback, threshold = 100) {
  let ticking = false;
  let lastScrollY = 0;
  
  return function(event) {
    const scrollY = event.target.scrollTop || window.pageYOffset;
    const scrollDirection = scrollY > lastScrollY ? 'down' : 'up';
    const scrollDelta = Math.abs(scrollY - lastScrollY);
    
    if (!ticking && scrollDelta > threshold) {
      requestAnimationFrame(() => {
        callback({
          scrollY,
          scrollDirection,
          scrollDelta,
          target: event.target
        });
        ticking = false;
      });
      ticking = true;
    }
    
    lastScrollY = scrollY;
  };
}

// Cache management for products and categories
export async function getCachedProducts() {
  try {
    const cached = localStorage.getItem(`products_cache_${CACHE_VERSION}`);
    if (!cached) return { products: [], isValid: false };
    
    const data = JSON.parse(cached);
    const isValid = (Date.now() - data.timestamp) < CACHE_DURATION;
    
    return {
      products: data.products || [],
      isValid
    };
  } catch (error) {
    console.warn('Error reading products cache:', error);
    return { products: [], isValid: false };
  }
}

export function setCachedProducts(products) {
  try {
    const data = {
      products,
      timestamp: Date.now(),
      version: CACHE_VERSION
    };
    localStorage.setItem(`products_cache_${CACHE_VERSION}`, JSON.stringify(data));
  } catch (error) {
    console.warn('Error setting products cache:', error);
  }
}

export async function getCachedCategories() {
  try {
    const cached = localStorage.getItem(`categories_cache_${CACHE_VERSION}`);
    if (!cached) return { categories: [], isValid: false };
    
    const data = JSON.parse(cached);
    const isValid = (Date.now() - data.timestamp) < CACHE_DURATION;
    
    return {
      categories: data.categories || [],
      isValid
    };
  } catch (error) {
    console.warn('Error reading categories cache:', error);
    return { categories: [], isValid: false };
  }
}

export function setCachedCategories(categories) {
  try {
    const data = {
      categories,
      timestamp: Date.now(),
      version: CACHE_VERSION
    };
    localStorage.setItem(`categories_cache_${CACHE_VERSION}`, JSON.stringify(data));
  } catch (error) {
    console.warn('Error setting categories cache:', error);
  }
}

// Preload critical data
export function preloadCriticalData() {
  // Preload Firebase modules
  const firebaseModules = [
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
  ];
  
  firebaseModules.forEach(url => {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = url;
    document.head.appendChild(link);
  });
  
  // Warm up IndexedDB
  if ('indexedDB' in window) {
    try {
      const request = indexedDB.open('app_cache', 1);
      request.onerror = () => console.warn('IndexedDB not available');
    } catch (error) {
      console.warn('IndexedDB initialization failed:', error);
    }
  }
}

// Performance monitoring
export function trackPerformance(metric, value) {
  if (!performanceMetrics[metric]) {
    performanceMetrics[metric] = [];
  }
  
  performanceMetrics[metric].push({
    value,
    timestamp: Date.now()
  });
  
  // Keep only last 100 entries
  if (performanceMetrics[metric].length > 100) {
    performanceMetrics[metric] = performanceMetrics[metric].slice(-100);
  }
}

export function getPerformanceMetrics() {
  return { ...performanceMetrics };
}

// Error boundary for better error handling
export function createErrorBoundary(element, fallbackContent = 'Si è verificato un errore') {
  const originalContent = element.innerHTML;
  
  window.addEventListener('error', (event) => {
    if (element.contains(event.target)) {
      console.error('Error in component:', event.error);
      element.innerHTML = `
        <div class="error-boundary">
          <p>${fallbackContent}</p>
          <button onclick="this.parentElement.parentElement.innerHTML = '${originalContent.replace(/'/g, "\\'")}'; location.reload();">
            Riprova
          </button>
        </div>
      `;
    }
  });
}

// Initialize all utilities
export function initializeApp() {
  initMobileUtils();
  initTheme();
  initHamburgerMenu();
  preloadCriticalData();
  
  // Track app initialization performance
  trackPerformance('appInit', performance.now());
  
  console.log('App utilities initialized');
}

// Auto-initialize if not in module context
if (typeof window !== 'undefined' && !window.APP_UTILS_INITIALIZED) {
  window.APP_UTILS_INITIALIZED = true;
  document.addEventListener('DOMContentLoaded', initializeApp);
}