// Utilità comuni per date e formattazione

// Cache per migliorare le performance
const dateCache = new Map();
const weekCache = new Map();
const productCache = new Map();
const categoryCache = new Map();

// Virtual scrolling e lazy loading
export const ITEMS_PER_BATCH = 15; // Ridotto per mobile
const SCROLL_THRESHOLD = 200;
const PRELOAD_THRESHOLD = 300; // Precarica quando mancano 300px al fondo

// Performance monitoring
let performanceMetrics = {
  renderTime: 0,
  loadTime: 0,
  itemsRendered: 0
};

// Adaptive batch sizing based on device performance
export function getAdaptiveBatchSize() {
  const isMobileDevice = window.innerWidth <= 768;
  const isLowEndDevice = navigator.hardwareConcurrency <= 2 || navigator.deviceMemory <= 2;
  
  if (isLowEndDevice) return 8;
  if (isMobileDevice) return 12;
  return ITEMS_PER_BATCH;
}

// Optimized rendering with RAF batching
export function scheduleRender(callback) {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      const startTime = performance.now();
      try {
        const result = callback();
        performanceMetrics.renderTime = performance.now() - startTime;
        resolve(result);
      } catch (error) {
        console.error('Errore durante il rendering:', error);
        resolve(null);
      }
    });
  });
}

// Optimized intersection observer with better thresholds
export function createOptimizedIntersectionObserver(callback, options = {}) {
  const defaultOptions = {
    rootMargin: '100px 0px 300px 0px', // Precarica prima che sia visibile
    threshold: [0, 0.1, 0.5, 1.0] // Multiple thresholds per controllo granulare
  };
  
  return new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
        callback(entry);
      }
    });
  }, { ...defaultOptions, ...options });
}
// Intersection Observer per lazy loading
let intersectionObserver = null;

export function initIntersectionObserver() {
  if (intersectionObserver) return intersectionObserver;
  
  intersectionObserver = createOptimizedIntersectionObserver((entry) => {
    const element = entry.target;
    if (element.dataset.lazyLoad) {
      const event = new CustomEvent('lazyLoad', { detail: { element, entry } });
      element.dispatchEvent(event);
    }
  });
  
  return intersectionObserver;
}

// Virtual scrolling implementation
export class VirtualScrollManager {
  constructor(container, itemHeight = 120, buffer = 5) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.buffer = buffer;
    this.items = [];
    this.visibleItems = [];
    this.scrollTop = 0;
    this.containerHeight = 0;
    this.totalHeight = 0;
    this.startIndex = 0;
    this.endIndex = 0;
    
    this.init();
  }
  
  init() {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'auto';
    
    // Create spacer elements
    this.topSpacer = document.createElement('div');
    this.topSpacer.className = 'virtual-scroll-spacer';
    this.bottomSpacer = document.createElement('div');
    this.bottomSpacer.className = 'virtual-scroll-spacer';
    
    this.container.appendChild(this.topSpacer);
    this.container.appendChild(this.bottomSpacer);
    
    this.container.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });
    window.addEventListener('resize', this.handleResize.bind(this), { passive: true });
  }
  
  setItems(items) {
    this.items = items;
    this.totalHeight = items.length * this.itemHeight;
    this.updateVisibleItems();
  }
  
  handleScroll() {
    this.scrollTop = this.container.scrollTop;
    this.updateVisibleItems();
  }
  
  handleResize() {
    this.containerHeight = this.container.clientHeight;
    this.updateVisibleItems();
  }
  
  updateVisibleItems() {
    if (!this.items.length) return;
    
    this.containerHeight = this.container.clientHeight || window.innerHeight;
    
    const visibleStart = Math.floor(this.scrollTop / this.itemHeight);
    const visibleEnd = Math.min(
      visibleStart + Math.ceil(this.containerHeight / this.itemHeight),
      this.items.length - 1
    );
    
    this.startIndex = Math.max(0, visibleStart - this.buffer);
    this.endIndex = Math.min(this.items.length - 1, visibleEnd + this.buffer);
    
    this.renderVisibleItems();
  }
  
  renderVisibleItems() {
    // Update spacers
    this.topSpacer.style.height = `${this.startIndex * this.itemHeight}px`;
    this.bottomSpacer.style.height = `${(this.items.length - this.endIndex - 1) * this.itemHeight}px`;
    
    // Clear existing items (except spacers)
    const existingItems = this.container.querySelectorAll(':not(.virtual-scroll-spacer)');
    existingItems.forEach(item => item.remove());
    
    // Render visible items
    const fragment = document.createDocumentFragment();
    for (let i = this.startIndex; i <= this.endIndex; i++) {
      const item = this.items[i];
      if (item && item.element) {
        fragment.appendChild(item.element);
      }
    }
    
    this.container.insertBefore(fragment, this.bottomSpacer);
  }
}

// Optimized batch processing with priority queue
export class BatchProcessor {
  constructor(batchSize = getAdaptiveBatchSize()) {
    this.batchSize = batchSize;
    this.queue = [];
    this.processing = false;
    this.highPriorityQueue = [];
  }
  
  addTask(task, priority = 'normal') {
    if (priority === 'high') {
      this.highPriorityQueue.push(task);
    } else {
      this.queue.push(task);
    }
    
    if (!this.processing) {
      this.processQueue();
    }
  }
  
  async processQueue() {
    this.processing = true;
    
    while (this.highPriorityQueue.length > 0 || this.queue.length > 0) {
      // Process high priority tasks first
      const currentQueue = this.highPriorityQueue.length > 0 ? this.highPriorityQueue : this.queue;
      const batch = currentQueue.splice(0, this.batchSize);
      
      if (batch.length === 0) break;
      
      await this.processBatch(batch);
      
      // Yield control to browser
      await new Promise(resolve => {
        if (window.requestIdleCallback) {
          requestIdleCallback(resolve, { timeout: 50 });
        } else {
          setTimeout(resolve, 0);
        }
      });
    }
    
    this.processing = false;
  }
  
  async processBatch(batch) {
    return Promise.all(batch.map(async task => {
      try {
        return await task();
      } catch (error) {
        console.error('Errore processing task:', error);
        return null;
      }
    }));
  }
}

// Global batch processor instance
export const globalBatchProcessor = new BatchProcessor();

// Enhanced intersection observer for lazy loading
let enhancedIntersectionObserver = null;

export function initEnhancedIntersectionObserver() {
  if (enhancedIntersectionObserver) return enhancedIntersectionObserver;
  
  enhancedIntersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        if (element.dataset.lazyLoad) {
          const event = new CustomEvent('lazyLoad', { 
            detail: { element, entry, ratio: entry.intersectionRatio } 
          });
          element.dispatchEvent(event);
          
          // Remove observer after loading to improve performance
          enhancedIntersectionObserver.unobserve(element);
        }
      }
    });
  }, {
    rootMargin: '150px 0px 300px 0px', // Precarica molto prima
    threshold: [0, 0.1]
  });
  
  return enhancedIntersectionObserver;
}

// Enhanced batch processing with performance monitoring
export function processBatch(items, batchSize = getAdaptiveBatchSize(), processor) {
  const startTime = performance.now();
  
  return new Promise((resolve) => {
    let index = 0;
    const results = [];
    let processedCount = 0;
    
    function processBatchChunk() {
      const endIndex = Math.min(index + batchSize, items.length);
      const batch = items.slice(index, endIndex);
      
      batch.forEach(item => {
        try {
          const result = processor(item, index);
          if (result) results.push(result);
          processedCount++;
        } catch (error) {
          console.error('Errore processing batch item:', error, item);
        }
        index++;
      });
      
      if (index < items.length) {
        // Adaptive scheduling based on performance
        const elapsed = performance.now() - startTime;
        const avgTimePerItem = elapsed / processedCount;
        
        // If processing is slow, reduce batch size
        if (avgTimePerItem > 5) { // 5ms per item is slow
          batchSize = Math.max(3, Math.floor(batchSize * 0.8));
        }
        
        if (window.requestIdleCallback) {
          requestIdleCallback(processBatchChunk, { timeout: 100 });
        } else {
          setTimeout(processBatchChunk, avgTimePerItem > 10 ? 16 : 0);
        }
      } else {
        performanceMetrics.loadTime = performance.now() - startTime;
        performanceMetrics.itemsRendered = processedCount;
        resolve(results);
      }
    }
    
    processBatchChunk();
  });
}

// Memory-efficient scroll handler with throttling
let scrollRAF = null;

// Debounced scroll handler
export function createScrollHandler(callback, threshold = PRELOAD_THRESHOLD) {
  let lastScrollTop = 0;
  let scrollDirection = 'down';
  
  return function(event) {
    if (scrollRAF) {
      cancelAnimationFrame(scrollRAF);
    }
    
    scrollRAF = requestAnimationFrame(() => {
      const scrollTop = event.target.scrollTop || window.pageYOffset;
      const scrollHeight = event.target.scrollHeight || document.documentElement.scrollHeight;
      const clientHeight = event.target.clientHeight || window.innerHeight;
      
      // Determine scroll direction
      scrollDirection = scrollTop > lastScrollTop ? 'down' : 'up';
      lastScrollTop = scrollTop;
      
      // Only trigger callback when scrolling down and near bottom
      if (scrollDirection === 'down' && scrollHeight - scrollTop - clientHeight < threshold) {
        callback({ scrollTop, scrollHeight, clientHeight, direction: scrollDirection });
      }
      
      scrollRAF = null;
    });
  };
}

// Fragment-based DOM manipulation
export function createDocumentFragment() {
  return document.createDocumentFragment();
}

export function appendToFragment(fragment, elements) {
  if (Array.isArray(elements)) {
    elements.forEach(element => {
      if (element) fragment.appendChild(element);
    });
  } else if (elements) {
    fragment.appendChild(elements);
  }
  return fragment;
}

// IndexedDB per cache persistente
let dbCache = null;
const DB_VERSION = 2; // Incrementato per nuove ottimizzazioni

async function initIndexedDB() {
  if (dbCache) return dbCache;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ProductCacheDB', DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbCache = request.result;
      resolve(dbCache);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('products')) {
        const productStore = db.createObjectStore('products', { keyPath: 'id' });
        productStore.createIndex('categoryId', 'categoryId', { unique: false });
        productStore.createIndex('active', 'active', { unique: false });
        productStore.createIndex('important', 'important', { unique: false });
        productStore.createIndex('name', 'name', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('categories')) {
        const categoryStore = db.createObjectStore('categories', { keyPath: 'id' });
        categoryStore.createIndex('name', 'name', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
      
      // New store for performance metrics
      if (!db.objectStoreNames.contains('performance')) {
        db.createObjectStore('performance', { keyPath: 'key' });
      }
    };
  });
}

// Enhanced caching with compression and better expiration
export async function getCachedProducts() {
  try {
    const db = await initIndexedDB();
    const transaction = db.transaction(['products', 'metadata', 'performance'], 'readonly');
    const productStore = transaction.objectStore('products');
    const metadataStore = transaction.objectStore('metadata');
    const performanceStore = transaction.objectStore('performance');
    
    const [products, metadata, perfData] = await Promise.all([
      new Promise((resolve, reject) => {
        const request = productStore.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
      new Promise((resolve, reject) => {
        const request = metadataStore.get('products_timestamp');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
      new Promise((resolve, reject) => {
        const request = performanceStore.get('load_metrics');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
    ]);
    
    // Adaptive cache duration based on performance
    const baseCacheDuration = 300000; // 5 minutes
    const performanceMultiplier = perfData?.value?.loadTime > 1000 ? 2 : 1; // Cache longer if slow
    const cacheDuration = baseCacheDuration * performanceMultiplier;
    
    const isValid = metadata && (Date.now() - metadata.value) < cacheDuration;
    
    return { 
      products: products || [], 
      isValid,
      performance: perfData?.value || null
    };
  } catch (error) {
    console.warn('Errore lettura cache IndexedDB:', error);
    return { products: [], isValid: false, performance: null };
  }
}

export async function setCachedProducts(products) {
  try {
    const db = await initIndexedDB();
    const transaction = db.transaction(['products', 'metadata', 'performance'], 'readwrite');
    const productStore = transaction.objectStore('products');
    const metadataStore = transaction.objectStore('metadata');
    const performanceStore = transaction.objectStore('performance');
    
    // Clear existing products
    await new Promise((resolve, reject) => {
      const request = productStore.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    // Add new products in optimized batches
    const batchSize = getAdaptiveBatchSize() * 3; // Larger batches for DB operations
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      await Promise.all(batch.map(product => 
        new Promise((resolve, reject) => {
          const request = productStore.add(product);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
      ));
    }
    
    // Update timestamp and performance metrics
    await Promise.all([
      new Promise((resolve, reject) => {
      const request = metadataStore.put({ key: 'products_timestamp', value: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      }),
      new Promise((resolve, reject) => {
        const request = performanceStore.put({ 
          key: 'load_metrics', 
          value: performanceMetrics 
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
    ]);
    
  } catch (error) {
    console.warn('Errore scrittura cache IndexedDB:', error);
  }
}

// Preload critical data with priority
export async function preloadCriticalData() {
  const startTime = performance.now();
  
  try {
    // Use high priority for critical data
    globalBatchProcessor.addTask(async () => {
      const [productsCache, categoriesCache] = await Promise.all([
        getCachedProducts(),
        getCachedCategories()
      ]);
      
      console.log('Preload completed:', {
        products: productsCache.products.length,
        categories: categoriesCache.categories.length,
        time: performance.now() - startTime
      });
      
      return { productsCache, categoriesCache };
    }, 'high');
  } catch (error) {
    console.warn('Errore preload dati:', error);
  }
}

// Smart prefetching based on user behavior
export class SmartPrefetcher {
  constructor() {
    this.userPatterns = JSON.parse(localStorage.getItem('userPatterns') || '{}');
    this.currentSession = [];
  }
  
  trackInteraction(type, data) {
    this.currentSession.push({ type, data, timestamp: Date.now() });
    
    // Update patterns
    if (!this.userPatterns[type]) {
      this.userPatterns[type] = {};
    }
    
    const key = JSON.stringify(data);
    this.userPatterns[type][key] = (this.userPatterns[type][key] || 0) + 1;
    
    // Save patterns periodically
    if (this.currentSession.length % 10 === 0) {
      this.savePatterns();
    }
  }
  
  getPredictions(type, limit = 5) {
    const patterns = this.userPatterns[type] || {};
    return Object.entries(patterns)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([key]) => JSON.parse(key));
  }
  
  savePatterns() {
    try {
      localStorage.setItem('userPatterns', JSON.stringify(this.userPatterns));
    } catch (error) {
      console.warn('Errore salvataggio pattern utente:', error);
    }
  }
}

export const smartPrefetcher = new SmartPrefetcher();

export async function getCachedCategories() {
  try {
    const db = await initIndexedDB();
    const transaction = db.transaction(['categories', 'metadata'], 'readonly');
    const categoryStore = transaction.objectStore('categories');
    const metadataStore = transaction.objectStore('metadata');
    
    const [categories, metadata] = await Promise.all([
      new Promise((resolve, reject) => {
        const request = categoryStore.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
      new Promise((resolve, reject) => {
        const request = metadataStore.get('categories_timestamp');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
    ]);
    
    // Cache valida per 15 minuti (categorie cambiano meno spesso)
    const isValid = metadata && (Date.now() - metadata.value) < 900000;
    
    return { categories: categories || [], isValid };
  } catch (error) {
    console.warn('Errore lettura cache categorie IndexedDB:', error);
    return { categories: [], isValid: false };
  }
}

export async function setCachedCategories(categories) {
  try {
    const db = await initIndexedDB();
    const transaction = db.transaction(['categories', 'metadata'], 'readwrite');
    const categoryStore = transaction.objectStore('categories');
    const metadataStore = transaction.objectStore('metadata');
    
    // Clear existing categories
    await new Promise((resolve, reject) => {
      const request = categoryStore.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    // Add new categories
    await Promise.all(categories.map(category => 
      new Promise((resolve, reject) => {
        const request = categoryStore.add(category);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
    ));
    
    // Update timestamp
    await new Promise((resolve, reject) => {
      const request = metadataStore.put({ key: 'categories_timestamp', value: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
  } catch (error) {
    console.warn('Errore scrittura cache categorie IndexedDB:', error);
  }
}

// Preload critical data
export function preloadCriticalData() {
  // Preload in background
  setTimeout(async () => {
    try {
      await Promise.all([
        getCachedProducts(),
        getCachedCategories()
      ]);
    } catch (error) {
      console.warn('Errore preload dati:', error);
    }
  }, 100);
}

export function formatDate(date = new Date()) {
  const timestamp = date.getTime();
  if (dateCache.has(timestamp)) {
    return dateCache.get(timestamp);
  }
  
  const formatted = date.toISOString().split('T')[0];
  dateCache.set(timestamp, formatted);
  
  // Limita la cache a 100 elementi
  if (dateCache.size > 100) {
    const firstKey = dateCache.keys().next().value;
    dateCache.delete(firstKey);
  }
  
  return formatted;
}

export function getWeekString(date = new Date()) {
  const timestamp = date.getTime();
  if (weekCache.has(timestamp)) {
    return weekCache.get(timestamp);
  }
  
  const year = date.getFullYear();
  const week = getWeekNumber(date);
  const weekString = `${year}-W${week.toString().padStart(2, '0')}`;
  
  weekCache.set(timestamp, weekString);
  
  // Limita la cache a 100 elementi
  if (weekCache.size > 100) {
    const firstKey = weekCache.keys().next().value;
    weekCache.delete(firstKey);
  }
  
  return weekString;
}

// Memoizzazione per getWeekNumber
const weekNumberCache = new Map();

export function getWeekNumber(date) {
  const timestamp = date.getTime();
  if (weekNumberCache.has(timestamp)) {
    return weekNumberCache.get(timestamp);
  }
  
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  
  weekNumberCache.set(timestamp, weekNumber);
  
  // Limita la cache a 100 elementi
  if (weekNumberCache.size > 100) {
    const firstKey = weekNumberCache.keys().next().value;
    weekNumberCache.delete(firstKey);
  }
  
  return weekNumber;
}

// Cache per i nomi dei giorni
const dayNames = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

export function getDayName(date) {
  return dayNames[date.getDay()];
}

// Cache per conversioni colore
const hexToRgbCache = new Map();
const contrastColorCache = new Map();

export function hexToRgb(hex) {
  if (hexToRgbCache.has(hex)) {
    return hexToRgbCache.get(hex);
  }
  
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  const rgb = result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
  
  hexToRgbCache.set(hex, rgb);
  
  // Limita la cache a 50 elementi
  if (hexToRgbCache.size > 50) {
    const firstKey = hexToRgbCache.keys().next().value;
    hexToRgbCache.delete(firstKey);
  }
  
  return rgb;
}

export function getContrastColor(hexColor) {
  if (contrastColorCache.has(hexColor)) {
    return contrastColorCache.get(hexColor);
  }
  
  const rgb = hexToRgb(hexColor);
  if (!rgb) return '#ffffff';
  
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  const contrastColor = brightness > 128 ? '#000000' : '#ffffff';
  
  contrastColorCache.set(hexColor, contrastColor);
  
  // Limita la cache a 50 elementi
  if (contrastColorCache.size > 50) {
    const firstKey = contrastColorCache.keys().next().value;
    contrastColorCache.delete(firstKey);
  }
  
  return contrastColor;
}

// Pool di toast per riutilizzo
const toastPool = [];
let activeToasts = 0;
const MAX_TOASTS = 3;

export function showToast(message, type = 'success') {
  // Validazione parametri
  if (!message || typeof message !== 'string') {
    console.warn('Messaggio toast non valido:', message);
    return;
  }

  // Limita il numero di toast attivi
  if (activeToasts >= MAX_TOASTS) {
    const oldestToast = document.querySelector('.toast');
    if (oldestToast) {
      oldestToast.remove();
      activeToasts--;
    }
  }

  // Riutilizza toast dal pool o crea nuovo
  let toast = toastPool.pop();
  if (!toast) {
    toast = document.createElement('div');
  }
  
  toast.className = `toast toast-${type || 'info'}`;
  toast.textContent = message;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  
  try {
    document.body.appendChild(toast);
    activeToasts++;
    
    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });
  } catch (error) {
    console.error('Errore aggiunta toast al DOM:', error);
    return;
  }
  
  const hideTimeout = setTimeout(() => {
    if (toast && toast.parentNode) {
      activeToasts--;
      
      toast.classList.remove('toast-show');
      setTimeout(() => {
        try {
          if (toast && toast.parentNode) {
            toast.remove();
            
            // Rimetti nel pool per riutilizzo
            if (toastPool.length < 5) {
              toast.textContent = '';
              toast.className = '';
              toast.removeAttribute('role');
              toast.removeAttribute('aria-live');
              toastPool.push(toast);
            }
          }
        } catch (error) {
          console.warn('Errore rimozione toast:', error);
        }
      }, 300);
    }
  }, 3000);
  
  // Allow manual dismissal on touch
  toast.addEventListener('click', () => {
    clearTimeout(hideTimeout);
    activeToasts--;
    
    if (toast && toast.parentNode) {
      toast.classList.remove('toast-show');
      setTimeout(() => {
        try {
          if (toast && toast.parentNode) {
            toast.remove();
            
            // Rimetti nel pool per riutilizzo
            if (toastPool.length < 5) {
              toast.textContent = '';
              toast.className = '';
              toast.removeAttribute('role');
              toast.removeAttribute('aria-live');
              toastPool.push(toast);
            }
          }
        } catch (error) {
          console.warn('Errore rimozione toast:', error);
        }
      }, 300);
    }
  });
}

// Cache per funzioni debounced
const debounceCache = new WeakMap();

export function debounce(func, wait) {
  if (typeof func !== 'function') {
    console.error('debounce: primo parametro deve essere una funzione');
    return () => {};
  }
  
  if (typeof wait !== 'number' || wait < 0) {
    console.warn('debounce: wait deve essere un numero positivo, usando 300ms');
    wait = 300;
  }
  
  // Riutilizza funzione debounced se già esistente
  if (debounceCache.has(func)) {
    const cached = debounceCache.get(func);
    if (cached.wait === wait) return cached.fn;
  }
  
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      try {
        func.apply(this, args);
      } catch (error) {
        console.error('Errore in funzione debounced:', error);
      }
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    
    // Cache la funzione debounced
    debounceCache.set(func, {
      fn: executedFunction,
      wait: wait
    });
  };
}

export function createSlug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '') // Rimuovi caratteri speciali
    .replace(/\s+/g, '-') // Sostituisci spazi con trattini
    .replace(/-+/g, '-') // Rimuovi trattini multipli
    .replace(/^-|-$/g, ''); // Rimuovi trattini all'inizio e alla fine
}

// Cache per ID unici generati
const uniqueIdCache = new Map();

export async function generateUniqueId(collection, baseName, db) {
  if (!baseName || !collection || !db) {
    console.error('generateUniqueId: parametri mancanti', { collection, baseName, db: !!db });
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  const baseSlug = createSlug(baseName);
  if (!baseSlug) {
    console.error('generateUniqueId: impossibile creare slug da', baseName);
    return `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Controlla cache per evitare duplicati recenti
  const cacheKey = `${collection}-${baseSlug}`;
  if (uniqueIdCache.has(cacheKey)) {
    const cached = uniqueIdCache.get(cacheKey);
    if (Date.now() - cached.timestamp < 60000) return `${baseSlug}-${Date.now()}`;
  }

  let slug = baseSlug;
  let counter = 1;
  
  // Importa getDoc e doc qui per evitare dipendenze circolari
  let getDoc, doc;
  try {
    const firestore = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    getDoc = firestore.getDoc;
    doc = firestore.doc;
  } catch (error) {
    console.error('Errore importazione Firestore:', error);
    return `${baseSlug}-${Date.now()}`;
  }
  
  // Limita il numero di tentativi per evitare loop infiniti
  const maxAttempts = 100;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    let docRef;
    try {
      docRef = doc(db, collection, slug);
    } catch (error) {
      console.error('Errore creazione riferimento documento:', error);
      return `${baseSlug}-${Date.now()}`;
    }
    
    try {
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        // Salva in cache
        uniqueIdCache.set(cacheKey, {
          slug: slug,
          timestamp: Date.now()
        });
        return slug;
      }
    } catch (error) {
      console.error('Errore verifica esistenza documento:', error, { collection, slug });
      // Se è un errore di rete, riprova con un delay
      if (error.code === 'unavailable' || error.code === 'deadline-exceeded') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      return `${baseSlug}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    }
    
    slug = `${baseSlug}-${counter}`;
    counter++;
    attempts++;
  }
  
  console.error('generateUniqueId: raggiunto limite tentativi', { collection, baseName, maxAttempts });
  return `${baseSlug}-${Date.now()}-fallback`;
}

// Cache per selettori DOM
const selectorCache = new Map();

// Utility per gestire errori DOM in modo sicuro
export function safeQuerySelector(selector, context = document) {
  try {
    if (!selector || typeof selector !== 'string') {
      console.warn('safeQuerySelector: selector non valido', selector);
      return null;
    }
    
    // Cache solo per document context per evitare memory leak
    if (context === document) {
      const cacheKey = `selector-${selector}`;
      if (selectorCache.has(cacheKey)) {
        const cached = selectorCache.get(cacheKey);
        if (cached.element && cached.element.parentNode) {
          return cached.element;
        }
      }
    }
    
    const element = context.querySelector(selector);
    
    // Cache l'elemento se trovato e context è document
    if (element && context === document) {
      const cacheKey = `selector-${selector}`;
      selectorCache.set(cacheKey, { element, timestamp: Date.now() });
      
      // Pulisci cache vecchia ogni 100 elementi
      if (selectorCache.size > 100) {
        const entries = Array.from(selectorCache.entries());
        const oldEntries = entries.filter(([key, value]) => Date.now() - value.timestamp > 30000);
        oldEntries.forEach(([key]) => selectorCache.delete(key));
      }
    }
    
    return element;
  } catch (error) {
    console.error('Errore querySelector:', error, selector);
    return null;
  }
}

export function safeQuerySelectorAll(selector, context = document) {
  try {
    if (!selector || typeof selector !== 'string') {
      console.warn('safeQuerySelectorAll: selector non valido', selector);
      return [];
    }
    return Array.from(context.querySelectorAll(selector));
  } catch (error) {
    console.error('Errore querySelectorAll:', error, selector);
    return [];
  }
}

// Pool di event listener per riutilizzo
const eventListenerPool = new Map();

// Utility per gestire eventi in modo sicuro
export function safeAddEventListener(element, event, handler, options = {}) {
  if (!element || typeof element.addEventListener !== 'function') {
    console.warn('safeAddEventListener: elemento non valido', element);
    return () => {};
  }
  
  if (!event || typeof event !== 'string') {
    console.warn('safeAddEventListener: evento non valido', event);
    return () => {};
  }
  
  if (typeof handler !== 'function') {
    console.warn('safeAddEventListener: handler non valido', handler);
    return () => {};
  }
  
  try {
    // Add passive option for touch events to improve performance
    const finalOptions = { ...options };
    if (event.startsWith('touch') && !('passive' in options)) {
      finalOptions.passive = true;
    }
    
    element.addEventListener(event, handler, options);
    
    const removeListener = () => {
      try {
        element.removeEventListener(event, handler, options);
      } catch (error) {
        console.warn('Errore rimozione event listener:', error);
      }
    };
    
    return removeListener;
  } catch (error) {
    console.error('Errore aggiunta event listener:', error);
    return () => {};
  }
}

// Cache per validazioni
const validationCache = new Map();

// Utility per validazione input
export function validateInput(value, type = 'text', options = {}) {
  const { min = 0, max = Infinity, required = false, pattern = null } = options;
  
  // Cache key per validazioni ripetute
  const cacheKey = `${value}-${type}-${JSON.stringify(options)}`;
  if (validationCache.has(cacheKey)) {
    return validationCache.get(cacheKey);
  }
  
  let result;
  
  if (required && (!value || value.toString().trim() === '')) {
    result = { valid: false, error: 'Campo obbligatorio' };
  } else if (!value && !required) {
    result = { valid: true, value: '' };
  } else {
    switch (type) {
      case 'number':
        const num = parseFloat(value);
        if (isNaN(num)) {
          result = { valid: false, error: 'Deve essere un numero' };
        } else if (num < min) {
          result = { valid: false, error: `Deve essere almeno ${min}` };
        } else if (num > max) {
          result = { valid: false, error: `Deve essere al massimo ${max}` };
        } else {
          result = { valid: true, value: num };
        }
        break;
        
      case 'text':
        const text = value.toString().trim();
        if (text.length < min) {
          result = { valid: false, error: `Deve essere almeno ${min} caratteri` };
        } else if (text.length > max) {
          result = { valid: false, error: `Deve essere al massimo ${max} caratteri` };
        } else if (pattern && !pattern.test(text)) {
          result = { valid: false, error: 'Formato non valido' };
        } else {
          result = { valid: true, value: text };
        }
        break;
        
      case 'email':
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(value)) {
          result = { valid: false, error: 'Email non valida' };
        } else {
          result = { valid: true, value: value.toString().trim() };
        }
        break;
        
      default:
        result = { valid: true, value: value };
    }
  }
  
  // Salva in cache
  validationCache.set(cacheKey, result);
  
  // Limita cache a 200 elementi
  if (validationCache.size > 200) {
    const firstKey = validationCache.keys().next().value;
    validationCache.delete(firstKey);
  }
  
  return result;
}

// Cache per viewport queries
let cachedViewportInfo = null;
let lastViewportCheck = 0;
const VIEWPORT_CACHE_DURATION = 100; // 100ms

// Utility per gestire il viewport mobile
export function isMobile() {
  const now = Date.now();
  if (cachedViewportInfo && (now - lastViewportCheck) < VIEWPORT_CACHE_DURATION) {
    return cachedViewportInfo.isMobile;
  }
  
  updateViewportCache();
  return cachedViewportInfo.isMobile;
}

export function isSmallMobile() {
  const now = Date.now();
  if (cachedViewportInfo && (now - lastViewportCheck) < VIEWPORT_CACHE_DURATION) {
    return cachedViewportInfo.isSmallMobile;
  }
  
  updateViewportCache();
  return cachedViewportInfo.isSmallMobile;
}

export function isExtraSmallMobile() {
  const now = Date.now();
  if (cachedViewportInfo && (now - lastViewportCheck) < VIEWPORT_CACHE_DURATION) {
    return cachedViewportInfo.isExtraSmallMobile;
  }
  
  updateViewportCache();
  return cachedViewportInfo.isExtraSmallMobile;
}

export function isLandscape() {
  const now = Date.now();
  if (cachedViewportInfo && (now - lastViewportCheck) < VIEWPORT_CACHE_DURATION) {
    return cachedViewportInfo.isLandscape;
  }
  
  updateViewportCache();
  return cachedViewportInfo.isLandscape;
}

function updateViewportCache() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  cachedViewportInfo = {
    isMobile: width <= 768,
    isSmallMobile: width <= 480,
    isExtraSmallMobile: width <= 320,
    isLandscape: width > height,
    width,
    height
  };
  
  lastViewportCheck = Date.now();
}

export function getViewportHeight() {
  // Use dynamic viewport height if available
  return window.visualViewport ? window.visualViewport.height : window.innerHeight;
}

export function getViewportWidth() {
  return window.visualViewport ? window.visualViewport.width : window.innerWidth;
}

// Cache per safe area insets
let cachedSafeAreaInsets = null;
let lastSafeAreaCheck = 0;

// Utility per gestire safe area su dispositivi con notch
export function getSafeAreaInsets() {
  const now = Date.now();
  if (cachedSafeAreaInsets && (now - lastSafeAreaCheck) < 1000) {
    return cachedSafeAreaInsets;
  }
  
  const style = getComputedStyle(document.documentElement);
  cachedSafeAreaInsets = {
    top: parseInt(style.getPropertyValue('--safe-area-top')) || 0,
    right: parseInt(style.getPropertyValue('--safe-area-right')) || 0,
    bottom: parseInt(style.getPropertyValue('--safe-area-bottom')) || 0,
    left: parseInt(style.getPropertyValue('--safe-area-left')) || 0
  };
  
  lastSafeAreaCheck = now;
  return cachedSafeAreaInsets;
}

// Throttle per orientation change
let orientationChangeTimeout = null;

// Utility per gestire l'orientamento del dispositivo
export function handleOrientationChange() {
  // Throttle per evitare chiamate multiple
  if (orientationChangeTimeout) {
    clearTimeout(orientationChangeTimeout);
  }
  
  orientationChangeTimeout = setTimeout(() => {
  // Force a small delay to allow for orientation change to complete
  setTimeout(() => {
    // Invalida cache viewport
    cachedViewportInfo = null;
    cachedSafeAreaInsets = null;
    
    // Update viewport height custom property
    const vh = getViewportHeight() * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    
    // Trigger a resize event to recalculate layouts
    window.dispatchEvent(new Event('resize'));
  }, 100);
  }, 50);
}

// Cache per scrollable parent lookup
const scrollableParentCache = new WeakMap();

// Utility per prevenire il bounce scroll su iOS
export function preventBounceScroll() {
  let isScrolling = false;
  
  document.addEventListener('touchstart', function() {
    isScrolling = false;
  }, { passive: true });
  
  document.addEventListener('touchmove', function(e) {
    if (!isScrolling) {
      const target = e.target;
      const scrollableParent = findScrollableParent(target);
      
      if (!scrollableParent) {
        e.preventDefault();
      } else {
        isScrolling = true;
      }
    }
  }, { passive: false });
}

function findScrollableParent(element) {
  // Controlla cache
  if (scrollableParentCache.has(element)) {
    return scrollableParentCache.get(element);
  }
  
  if (!element || element === document.body) {
    scrollableParentCache.set(element, null);
    return null;
  }
  
  const style = getComputedStyle(element);
  const overflowY = style.overflowY;
  
  if (overflowY === 'auto' || overflowY === 'scroll') {
    scrollableParentCache.set(element, element);
    return element;
  }
  
  const parent = findScrollableParent(element.parentElement);
  scrollableParentCache.set(element, parent);
  return parent;
}

// Throttle per keyboard updates
let keyboardUpdateTimeout = null;

// Utility per gestire il keyboard su mobile
export function handleMobileKeyboard() {
  if (!window.visualViewport) return;
  
  const viewport = window.visualViewport;
  let keyboardHeight = 0;
  
  function updateViewport() {
    // Throttle updates
    if (keyboardUpdateTimeout) {
      clearTimeout(keyboardUpdateTimeout);
    }
    
    keyboardUpdateTimeout = setTimeout(() => {
    const vh = viewport.height * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    
    // Calculate keyboard height
    const newKeyboardHeight = window.innerHeight - viewport.height;
    if (newKeyboardHeight !== keyboardHeight) {
      keyboardHeight = newKeyboardHeight;
      document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
      
      // Dispatch custom event for keyboard state change
      window.dispatchEvent(new CustomEvent('keyboardchange', {
        detail: { height: keyboardHeight, visible: keyboardHeight > 0 }
      }));
    }
    }, 16); // ~60fps
  }
  
  viewport.addEventListener('resize', updateViewport);
  updateViewport();
}

// Cache per input elements
let cachedInputs = null;
let lastInputScan = 0;

// Utility per gestire il focus degli input su mobile
export function handleInputFocus() {
  const now = Date.now();
  
  // Riutilizza cache degli input per 5 secondi
  if (!cachedInputs || (now - lastInputScan) > 5000) {
  const inputs = document.querySelectorAll('input, textarea, select');
    cachedInputs = Array.from(inputs);
    lastInputScan = now;
  }
  
  cachedInputs.forEach(input => {
    // Evita di aggiungere listener duplicati
    if (input.dataset.focusHandlerAdded) return;
    input.dataset.focusHandlerAdded = 'true';
    
    input.addEventListener('focus', () => {
      // Scroll into view with offset for mobile keyboards
      setTimeout(() => {
        const rect = input.getBoundingClientRect();
        const offset = window.innerHeight * 0.3; // 30% of viewport height
        
        if (rect.bottom > window.innerHeight - offset) {
          input.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
        }
      }, 300); // Wait for keyboard animation
    });
  });
}

// Throttle per resize events
let resizeTimeout = null;

// Inizializza le utility mobile
export function initMobileUtils() {
  // Set initial viewport height
  const vh = getViewportHeight() * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
  document.documentElement.style.setProperty('--keyboard-height', '0px');
  
  // Handle orientation changes
  const throttledOrientationChange = () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleOrientationChange, 100);
  };
  
  window.addEventListener('orientationchange', throttledOrientationChange);
  window.addEventListener('resize', throttledOrientationChange);
  
  // Invalida cache viewport su resize
  window.addEventListener('resize', () => {
    cachedViewportInfo = null;
  });
  
  // Handle mobile keyboard
  handleMobileKeyboard();
  
  // Handle input focus
  setTimeout(handleInputFocus, 1000); // Delay to ensure DOM is ready
  
  // Prevent bounce scroll on iOS
  if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
    preventBounceScroll();
  }
  
  // Update safe area insets
  updateSafeAreaInsets();
  
  // Add mobile-specific classes
  document.documentElement.classList.add(isMobile() ? 'is-mobile' : 'is-desktop');
  if (isSmallMobile()) document.documentElement.classList.add('is-small-mobile');
  if (isExtraSmallMobile()) document.documentElement.classList.add('is-extra-small-mobile');
  
  // Optimize touch events
  document.addEventListener('touchstart', function() {}, { passive: true });
  document.addEventListener('touchmove', function() {}, { passive: true });
}

// Cache per computed styles
let cachedComputedStyle = null;
let lastStyleCheck = 0;

function updateSafeAreaInsets() {
  const now = Date.now();
  
  // Cache computed style per 1 secondo
  if (!cachedComputedStyle || (now - lastStyleCheck) > 1000) {
    // Update CSS custom properties with safe area insets
    cachedComputedStyle = getComputedStyle(document.documentElement);
    lastStyleCheck = now;
  }
  
  const top = cachedComputedStyle.getPropertyValue('env(safe-area-inset-top)') || '0px';
  const right = cachedComputedStyle.getPropertyValue('env(safe-area-inset-right)') || '0px';
  const bottom = cachedComputedStyle.getPropertyValue('env(safe-area-inset-bottom)') || '0px';
  const left = cachedComputedStyle.getPropertyValue('env(safe-area-inset-left)') || '0px';
  
  document.documentElement.style.setProperty('--safe-area-top', top);
  document.documentElement.style.setProperty('--safe-area-right', right);
  document.documentElement.style.setProperty('--safe-area-bottom', bottom);
  document.documentElement.style.setProperty('--safe-area-left', left);
}

// Cleanup function per liberare memoria
export function cleanupCaches() {
  dateCache.clear();
  weekCache.clear();
  weekNumberCache.clear();
  hexToRgbCache.clear();
  contrastColorCache.clear();
  validationCache.clear();
  selectorCache.clear();
  eventListenerPool.clear();
  scrollableParentCache.clear();
  uniqueIdCache.clear();
  cachedViewportInfo = null;
  cachedSafeAreaInsets = null;
  cachedInputs = null;
}

// Theme Management
export function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // Set initial theme
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else if (!systemPrefersDark) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  
  // Create theme toggle button
  createThemeToggle();
  
  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });
}

function createThemeToggle() {
  // Remove existing toggle if present
  const existingToggle = document.querySelector('.theme-toggle');
  if (existingToggle) {
    existingToggle.remove();
  }
  
  const toggle = document.createElement('button');
  toggle.className = 'theme-toggle';
  toggle.setAttribute('aria-label', 'Cambia tema');
  toggle.setAttribute('title', 'Cambia tema');
  
  const updateToggleIcon = () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const isDark = currentTheme === 'dark' || (!currentTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    toggle.innerHTML = isDark ? '☀️' : '🌙';
  };
  
  updateToggleIcon();
  
  toggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const isDark = currentTheme === 'dark' || (!currentTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const newTheme = isDark ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateToggleIcon();
    
    // Show toast notification
    showToast(`Tema ${newTheme === 'dark' ? 'scuro' : 'chiaro'} attivato`, 'success');
  });
  
  document.body.appendChild(toggle);
}

export function getTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) return savedTheme;
  
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme) {
  if (!['light', 'dark'].includes(theme)) {
    console.warn('Tema non valido:', theme);
    return;
  }
  
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  
  // Update toggle icon if present
  const toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    toggle.innerHTML = theme === 'dark' ? '☀️' : '🌙';
  }
}

// Hamburger Menu Management
export function initHamburgerMenu() {
  // Remove existing menu if present
  const existingMenu = document.querySelector('.hamburger-menu');
  const existingDropdown = document.querySelector('.dropdown-menu');
  if (existingMenu) existingMenu.remove();
  if (existingDropdown) existingDropdown.remove();
  
  // Create hamburger button
  const hamburger = document.createElement('button');
  hamburger.className = 'hamburger-menu';
  hamburger.setAttribute('aria-label', 'Menu');
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.innerHTML = `
    <div class="hamburger-line"></div>
    <div class="hamburger-line"></div>
    <div class="hamburger-line"></div>
  `;
  
  // Create dropdown menu
  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown-menu';
  dropdown.setAttribute('role', 'menu');
  
  // Get current page
  const currentPath = window.location.pathname;
  const isHome = currentPath === '/' || currentPath.endsWith('/index.html');
  const isLista = currentPath.includes('/lista/');
  const isMagazzino = currentPath.includes('/magazzino/');
  const isCatalogo = currentPath.includes('/catalogo/');
  
  // Build menu items
  const menuItems = [];
  
  if (!isHome) {
    menuItems.push({ text: '🏠 Home', href: '../' });
  }
  
  if (!isLista) {
    menuItems.push({ text: '📝 Lista Dipendenti', href: isHome ? 'lista/' : '../lista/' });
  }
  
  if (!isMagazzino) {
    menuItems.push({ text: '📦 Magazzino', href: isHome ? 'magazzino/' : '../magazzino/' });
  }
  
  if (!isCatalogo) {
    menuItems.push({ text: '📋 Gestione Catalogo', href: isHome ? 'catalogo/' : '../catalogo/' });
  }
  
  // Add menu items to dropdown
  menuItems.forEach((item, index) => {
    const link = document.createElement('a');
    link.className = 'dropdown-item';
    link.href = item.href;
    link.textContent = item.text;
    link.setAttribute('role', 'menuitem');
    dropdown.appendChild(link);
    
    if (index < menuItems.length - 1) {
      const divider = document.createElement('div');
      divider.className = 'dropdown-divider';
      dropdown.appendChild(divider);
    }
  });
  
  // Add special actions for specific pages
  if (isLista || isCatalogo) {
    if (menuItems.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'dropdown-divider';
      dropdown.appendChild(divider);
    }
    
    const expandBtn = document.createElement('button');
    expandBtn.className = 'dropdown-item';
    expandBtn.textContent = '📂 Apri Tutte le Categorie';
    expandBtn.setAttribute('role', 'menuitem');
    expandBtn.addEventListener('click', () => {
      if (window.listaManager) {
        window.listaManager.expandAllCategories();
      } else if (window.catalogoManager) {
        window.catalogoManager.expandAllCategories();
      }
      hideDropdown();
    });
    dropdown.appendChild(expandBtn);
    
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'dropdown-item';
    collapseBtn.textContent = '📁 Chiudi Tutte le Categorie';
    collapseBtn.setAttribute('role', 'menuitem');
    collapseBtn.addEventListener('click', () => {
      if (window.listaManager) {
        window.listaManager.collapseAllCategories();
      } else if (window.catalogoManager) {
        window.catalogoManager.collapseAllCategories();
      }
      hideDropdown();
    });
    dropdown.appendChild(collapseBtn);
  }
  
  // Add to DOM
  document.body.appendChild(hamburger);
  document.body.appendChild(dropdown);
  
  // Event handlers
  function showDropdown() {
    dropdown.classList.add('show');
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
  }
  
  function hideDropdown() {
    dropdown.classList.remove('show');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
  }
  
  function toggleDropdown() {
    if (dropdown.classList.contains('show')) {
      hideDropdown();
    } else {
      showDropdown();
    }
  }
  
  // Hamburger click
  hamburger.addEventListener('click', toggleDropdown);
  
  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !dropdown.contains(e.target)) {
      hideDropdown();
    }
  });
  
  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dropdown.classList.contains('show')) {
      hideDropdown();
      hamburger.focus();
    }
  });
  
  // Handle keyboard navigation
  dropdown.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.dropdown-item');
    const currentIndex = Array.from(items).indexOf(document.activeElement);
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items[nextIndex].focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items[prevIndex].focus();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (document.activeElement.click) {
          document.activeElement.click();
        }
        break;
    }
  });
  
  return { hamburger, dropdown, showDropdown, hideDropdown };
}