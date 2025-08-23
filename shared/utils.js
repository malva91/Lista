// Utilità comuni per date e formattazione

// Cache per migliorare le performance
const dateCache = new Map();
const weekCache = new Map();

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
  
  // Controlla se esiste già un listener identico
  const listenerKey = `${event}-${handler.toString()}`;
  if (eventListenerPool.has(element)) {
    const elementListeners = eventListenerPool.get(element);
    if (elementListeners.has(listenerKey)) {
      return elementListeners.get(listenerKey);
    }
  }
  
  try {
    element.addEventListener(event, handler, options);
    
    const removeListener = () => {
      try {
        element.removeEventListener(event, handler, options);
        
        // Rimuovi dalla cache
        if (eventListenerPool.has(element)) {
          const elementListeners = eventListenerPool.get(element);
          elementListeners.delete(listenerKey);
          if (elementListeners.size === 0) {
            eventListenerPool.delete(element);
          }
        }
      } catch (error) {
        console.warn('Errore rimozione event listener:', error);
      }
    };
    
    // Salva nella cache
    if (!eventListenerPool.has(element)) {
      eventListenerPool.set(element, new Map());
    }
    eventListenerPool.get(element).set(listenerKey, removeListener);
    
    return () => {
      try {
        element.removeEventListener(event, handler, options);
      } catch (error) {
        console.warn('Errore rimozione event listener:', error);
      }
    };
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
  handleInputFocus();
  
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