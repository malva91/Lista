import { db } from '../shared/firebase.js';
import { 
  collection, doc, getDocs, getDoc, setDoc, onSnapshot, updateDoc, deleteDoc,
  query, where, orderBy, Timestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { formatDate, getWeekString, getDayName, showToast } from '../shared/utils.js';
import { safeQuerySelector, safeAddEventListener, validateInput, isMobile, initMobileUtils, getCachedProducts, setCachedProducts, getCachedCategories, setCachedCategories, preloadCriticalData, initTheme } from '../shared/utils.js';

// Cache per migliorare le performance
const checklistCache = new Map();
const notificationCache = new Map();
const renderCache = new Map();

class MagazzinoManager {
  constructor() {
    this.selectedDate = new Date();
    this.categories = [];
    this.products = [];
    this.currentList = null;
    this.currentChecklist = { items: [] };
    this.notifications = [];
    this.unreadCount = 0;
    
    // Performance optimizations
    this.renderQueue = [];
    this.isRendering = false;
    this.lastRenderTime = 0;
    this.renderThrottle = 16; // ~60fps
    
    this.init();
  }

  async init() {
    // Initialize mobile utilities
    initMobileUtils();
    
    // Initialize theme
    initTheme();
    
    // Preload critical data
    preloadCriticalData();
    
    this.setupDateSelector();
    this.setupEventListeners();
    
    // Load data with optimized strategy
    await this.loadDataOptimized();
    
    await this.loadCurrentList();
    await this.loadNotifications();
  }
  
  async loadDataOptimized() {
    try {
      // Try to load from cache first
      const [cachedCategories, cachedProducts] = await Promise.all([
        getCachedCategories(),
        getCachedProducts()
      ]);
      
      // Use cached data if valid
      if (cachedCategories.isValid && cachedCategories.categories.length > 0) {
        this.categories = cachedCategories.categories;
      }
      
      if (cachedProducts.isValid && cachedProducts.products.length > 0) {
        this.products = cachedProducts.products;
      }
      
      // Load fresh data in background if cache is invalid or empty
      const needsFreshCategories = !cachedCategories.isValid || cachedCategories.categories.length === 0;
      const needsFreshProducts = !cachedProducts.isValid || cachedProducts.products.length === 0;
      
      if (needsFreshCategories || needsFreshProducts) {
        const promises = [];
        
        if (needsFreshCategories) {
          promises.push(this.loadCategories(true));
        }
        
        if (needsFreshProducts) {
          promises.push(this.loadProducts(true));
        }
        
        await Promise.allSettled(promises);
      }
      
    } catch (error) {
      console.error('Errore caricamento dati ottimizzato:', error);
      // Fallback to normal loading
      await Promise.allSettled([
        this.loadCategories(),
        this.loadProducts()
      ]);
    }
  }

  // Throttled rendering per migliorare performance
  throttledRender() {
    const now = Date.now();
    if (now - this.lastRenderTime < this.renderThrottle) {
      if (!this.renderTimeout) {
        this.renderTimeout = setTimeout(() => {
          this.renderTimeout = null;
          this.performRender();
        }, this.renderThrottle);
      }
      return;
    }
    
    this.performRender();
  }
  
  performRender() {
    this.lastRenderTime = Date.now();
    
    // Use requestAnimationFrame for smooth rendering
    requestAnimationFrame(() => {
      this.renderChecklist();
    });
  }

  setupDateSelector() {
    const dateSelector = safeQuerySelector('#dateSelector');
    const currentDateEl = safeQuerySelector('#currentDate');
    
    if (!dateSelector || !currentDateEl) {
      console.error('Elementi date selector non trovati');
      return;
    }
    
    dateSelector.value = formatDate(this.selectedDate);
    currentDateEl.textContent = `${getDayName(this.selectedDate)} ${formatDate(this.selectedDate)}`;
    
    safeAddEventListener(dateSelector, 'change', (e) => {
      this.selectedDate = new Date(e.target.value);
      currentDateEl.textContent = `${getDayName(this.selectedDate)} ${formatDate(this.selectedDate)}`;
      
      // Clear caches when date changes
      checklistCache.clear();
      notificationCache.clear();
      renderCache.clear();
      
      // Rimuovi listener precedenti prima di caricare nuova data
      if (this.listenerUnsubscribes) {
        this.listenerUnsubscribes.forEach(unsubscribe => unsubscribe());
      }
      
      this.loadCurrentList();
      this.loadNotifications();
    });
  }

  setupEventListeners() {
    const markAllReadBtn = safeQuerySelector('#markAllReadBtn');
    if (markAllReadBtn) {
      safeAddEventListener(markAllReadBtn, 'click', () => {
        this.markAllNotificationsRead();
      });
    }
  }

  async loadCategories(updateCache = false) {
    try {
      // Use cached data if available and not updating
      if (!updateCache && this.categories.length > 0) {
        return;
      }
      
      const categoriesSnap = await getDocs(collection(db, 'categories'));
      const newCategories = categoriesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Validazione dei dati delle categorie
      const validCategories = newCategories.filter(category => {
        if (!category.name || !category.colorHex) {
          console.warn('Categoria con dati mancanti ignorata:', category);
          return false;
        }
        return true;
      });
      
      this.categories = validCategories;
      
      // Update IndexedDB cache
      if (updateCache) {
        setCachedCategories(this.categories);
      }
    } catch (error) {
      console.error('Errore caricamento categorie:', error);
      this.categories = [];
    }
  }

  async loadProducts(updateCache = false) {
    try {
      // Use cached data if available and not updating
      if (!updateCache && this.products.length > 0) {
        return;
      }
      
      const productsQuery = query(collection(db, 'products'), where('active', '==', true));
      const productsSnap = await getDocs(productsQuery);
      const newProducts = productsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => a.name.localeCompare(b.name));
      
      // Validazione dei dati dei prodotti
      const validProducts = newProducts.filter(product => {
        if (!product.name || !product.categoryId) {
          console.warn('Prodotto con dati mancanti ignorato:', product);
          return false;
        }
        return true;
      });
      
      this.products = validProducts;
      
      // Update IndexedDB cache
      if (updateCache) {
        setCachedProducts(this.products);
      }
    } catch (error) {
      console.error('Errore caricamento prodotti:', error);
      this.products = [];
    }
  }

  async loadCurrentList() {
    // Rimuovi listener esistenti se presenti
    if (this.listenerUnsubscribes) {
      this.listenerUnsubscribes.forEach(unsubscribe => unsubscribe());
    }
    this.listenerUnsubscribes = [];
    
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      
      // Check cache first
      const cacheKey = `${week}-${day}`;
      if (checklistCache.has(cacheKey)) {
        const cached = checklistCache.get(cacheKey);
        this.currentList = cached.list;
        this.currentChecklist = cached.checklist;
        this.throttledRender();
        document.getElementById('loadingList').classList.add('hidden');
        document.getElementById('checklistContainer').classList.remove('hidden');
        document.getElementById('emptyState').classList.add('hidden');
        this.setupRealtimeListeners();
        return;
      }
      
      // Carica lista dipendenti
      const listDoc = await getDoc(doc(db, 'weeks', week, 'lists', day));
      
      if (listDoc.exists()) {
        this.currentList = listDoc.data();
        await this.loadChecklist();
        
        // Cache the result
        checklistCache.set(cacheKey, {
          list: this.currentList,
          checklist: this.currentChecklist
        });
        
        // Limit cache size
        if (checklistCache.size > 10) {
          const firstKey = checklistCache.keys().next().value;
          checklistCache.delete(firstKey);
        }
        
        this.throttledRender();
        document.getElementById('loadingList').classList.add('hidden');
        document.getElementById('checklistContainer').classList.remove('hidden');
        document.getElementById('emptyState').classList.add('hidden');
      } else {
        this.currentList = null;
        document.getElementById('loadingList').classList.add('hidden');
        document.getElementById('checklistContainer').classList.add('hidden');
        document.getElementById('emptyState').classList.remove('hidden');
      }
      
      // Configura listener dopo il caricamento iniziale
      this.setupRealtimeListeners();
      
    } catch (error) {
      console.error('Errore caricamento lista:', error);
      this.showError('Errore nel caricamento della lista');
    }
  }

  async loadChecklist() {
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      
      const checklistDoc = await getDoc(doc(db, 'weeks', week, 'warehouse', day));
      
      if (checklistDoc.exists()) {
        this.currentChecklist = checklistDoc.data();
      } else {
        // Inizializza checklist da lista dipendenti
        this.currentChecklist = {
          items: this.currentList.items.map(item => ({
            id: item.id,
            qtyRequested: item.quantity,
            qtyPicked: 0,
            prepared: false
          })),
          extras: this.currentList.extras.map(extra => ({
            name: extra.name,
            qtyRequested: extra.quantity,
            qtyPicked: 0,
            prepared: false
          }))
        };
        
        // Salva checklist iniziale
        await setDoc(doc(db, 'weeks', week, 'warehouse', day), this.currentChecklist);
      }
    } catch (error) {
      console.error('Errore caricamento checklist:', error);
    }
  }

  async loadNotifications() {
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      const notifDocId = `${week}_${day}`;
      
      // Check cache first
      if (notificationCache.has(notifDocId)) {
        const cached = notificationCache.get(notifDocId);
        this.notifications = cached.notifications;
        this.unreadCount = cached.unreadCount;
        this.renderNotifications();
        return;
      }
      
      // Carica counter
      const notifDoc = await getDoc(doc(db, 'notifications', notifDocId));
      this.unreadCount = notifDoc.exists() ? (notifDoc.data().unreadCount || 0) : 0;
      
      // Carica notifiche
      const notificationsQuery = query(
        collection(db, 'notifications', notifDocId, 'entries'),
        orderBy('timestamp', 'desc')
      );
      const notifSnap = await getDocs(notificationsQuery);
      
      this.notifications = notifSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Cache the result
      notificationCache.set(notifDocId, {
        notifications: this.notifications,
        unreadCount: this.unreadCount
      });
      
      // Limit cache size
      if (notificationCache.size > 10) {
        const firstKey = notificationCache.keys().next().value;
        notificationCache.delete(firstKey);
      }
      
      this.renderNotifications();
    } catch (error) {
      console.error('Errore caricamento notifiche:', error);
    }
  }

  setupRealtimeListeners() {
    const week = getWeekString(this.selectedDate);
    const day = formatDate(this.selectedDate);
    const notifDocId = `${week}_${day}`;
    
    // Array per tenere traccia degli unsubscribe
    if (!this.listenerUnsubscribes) {
      this.listenerUnsubscribes = [];
    }
    
    // Listener per la lista dipendenti
    const listDocRef = doc(db, 'weeks', week, 'lists', day);
    const listUnsubscribe = onSnapshot(listDocRef, async (docSnapshot) => {
      console.log('Lista dipendenti cambiata:', docSnapshot.exists());
      
      try {
        if (docSnapshot.exists()) {
        const newList = docSnapshot.data();
        console.log('Nuova lista:', newList);
        
        // Aggiorna sempre per riflettere in tempo reale le modifiche
        this.currentList = newList;
        
        // Clear cache
        const cacheKey = `${week}-${day}`;
        checklistCache.delete(cacheKey);
        renderCache.clear();
        
          await this.syncChecklistWithList();
          this.throttledRender();
          console.log('Checklist aggiornata in tempo reale');
        } else {
        // Lista eliminata
        console.log('Lista eliminata');
        this.currentList = null;
        this.currentChecklist = { items: [], extras: [] };
        
        // Clear cache
        const cacheKey = `${week}-${day}`;
        checklistCache.delete(cacheKey);
        renderCache.clear();
        
        const checklistContainer = document.getElementById('checklistContainer');
        const emptyState = document.getElementById('emptyState');
        if (checklistContainer) checklistContainer.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        }
      } catch (error) {
        console.error('Errore nel listener della lista dipendenti:', error);
      }
    }, (error) => {
      console.error('Errore nel listener della lista dipendenti:', error);
    });
    this.listenerUnsubscribes.push(listUnsubscribe);
    
    // Listener per la checklist warehouse (per sincronizzare modifiche del magazziniere)
    const warehouseDocRef = doc(db, 'weeks', week, 'warehouse', day);
    const warehouseUnsubscribe = onSnapshot(warehouseDocRef, (docSnapshot) => {
      console.log('Checklist warehouse cambiata:', docSnapshot.exists());
      
      try {
        if (docSnapshot.exists()) {
        const newChecklist = docSnapshot.data();
        console.log('Nuova checklist:', newChecklist);
        
        // Aggiorna solo se non è una modifica locale
        if (JSON.stringify(newChecklist) !== JSON.stringify(this.currentChecklist)) {
          this.currentChecklist = newChecklist;
          
          // Clear cache
          const cacheKey = `${week}-${day}`;
          checklistCache.delete(cacheKey);
          renderCache.clear();
          
          this.throttledRender();
          console.log('UI aggiornata da modifica esterna');
        }
        }
      } catch (error) {
        console.error('Errore nel listener della checklist warehouse:', error);
      }
    }, (error) => {
      console.error('Errore nel listener della checklist warehouse:', error);
    });
    this.listenerUnsubscribes.push(warehouseUnsubscribe);
    
    // Listener per notifiche
    const notificationsRef = collection(db, 'notifications', notifDocId, 'entries');
    const notifUnsubscribe = onSnapshot(query(notificationsRef, orderBy('timestamp', 'desc')), (querySnapshot) => {
      console.log('Notifiche cambiate:', querySnapshot.size);
      
      try {
        this.notifications = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Calcola non lette
      this.unreadCount = this.notifications.filter(n => !n.read).length;
      
      // Clear notification cache
      notificationCache.delete(notifDocId);
      
      this.renderNotifications();
      console.log('Notifiche aggiornate:', this.unreadCount, 'non lette');
      } catch (error) {
        console.error('Errore nel listener delle notifiche:', error);
      }
    }, (error) => {
      console.error('Errore nel listener delle notifiche:', error);
    });
    this.listenerUnsubscribes.push(notifUnsubscribe);
  }
  
  computeCompletion() {
    if (!this.currentChecklist) {
      return { total: 0, completed: 0, percent: 0, complete: false };
    }
    
    const items = this.currentChecklist.items || [];
    const extras = this.currentChecklist.extras || [];
    const all = items.concat(extras);
    const total = all.length || 0;
    const completed = all.filter(e => (e.qtyPicked || 0) >= (e.qtyRequested || 0)).length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent, complete: total > 0 && completed === total };
  }


  async syncChecklistWithList() {
    if (!this.currentList) return;
    
    console.log('Sincronizzando checklist con lista...');
    
    const week = getWeekString(this.selectedDate);
    const day = formatDate(this.selectedDate);
    
    // Ensure currentChecklist exists
    if (!this.currentChecklist) {
      this.currentChecklist = { items: [], extras: [] };
    }
    
    if (!this.currentChecklist.items) {
      this.currentChecklist.items = [];
    }
    
    if (!this.currentChecklist.extras) {
      this.currentChecklist.extras = [];
    }
    
    // Aggiorna items esistenti e aggiungi nuovi
    const updatedItems = (this.currentList.items || []).map(listItem => {
      if (!listItem || !listItem.id) return null;
      
      const existingItem = this.currentChecklist.items.find(ci => ci.id === listItem.id);
      return existingItem ? { ...existingItem, qtyRequested: listItem.quantity, prepared: (existingItem.qtyPicked || 0) >= listItem.quantity } :
        { id: listItem.id, qtyRequested: listItem.quantity, qtyPicked: 0, prepared: false };
    }).filter(Boolean);
    
    const updatedExtras = (this.currentList.extras || []).map(listExtra => {
      if (!listExtra || !listExtra.name) return null;
      
      const existingExtra = (this.currentChecklist.extras || []).find(ce => ce.name === listExtra.name);
      return existingExtra ? { ...existingExtra, qtyRequested: listExtra.quantity, prepared: (existingExtra.qtyPicked || 0) >= listExtra.quantity } :
        { name: listExtra.name, qtyRequested: listExtra.quantity, qtyPicked: 0, prepared: false };
    }).filter(Boolean);
    
    // Rimuovi items che non sono più nella lista
    const validItemIds = (this.currentList.items || []).map(item => item?.id).filter(Boolean);
    const filteredItems = updatedItems.filter(item => validItemIds.includes(item.id));
    
    // Rimuovi extras che non sono più nella lista
    const validExtraNames = (this.currentList.extras || []).map(extra => extra?.name).filter(Boolean);
    const filteredExtras = updatedExtras.filter(extra => validExtraNames.includes(extra.name));
    
    this.currentChecklist.items = filteredItems;
    this.currentChecklist.extras = filteredExtras || [];
    
    console.log('Checklist sincronizzata:', this.currentChecklist);
    
    // Salva checklist aggiornata
    try {
      await setDoc(doc(db, 'weeks', week, 'warehouse', day), this.currentChecklist);
      
      // Update cache
      const cacheKey = `${week}-${day}`;
      checklistCache.set(cacheKey, {
        list: this.currentList,
        checklist: this.currentChecklist
      });
    } catch (error) {
      console.error('Errore salvataggio checklist sincronizzata:', error);
      // Save to local storage as fallback
      try {
        localStorage.setItem(`checklist-${week}-${day}`, JSON.stringify(this.currentChecklist));
      } catch (storageError) {
        console.warn('Errore salvataggio locale checklist:', storageError);
      }
    }
  }

  renderNotifications() {
    const panel = safeQuerySelector('#notificationPanel');
    const badge = safeQuerySelector('#notificationBadge');
    const list = safeQuerySelector('#notificationList');
    
    if (!panel || !badge || !list) {
      console.warn('Elementi notifiche non trovati');
      return;
    }
    
    if (this.notifications.length === 0) {
      panel.classList.add('hidden');
      return;
    }
    
    panel.classList.remove('hidden');
    badge.textContent = `${this.unreadCount} non lette`;
    
    // Separa lette e non lette
    const unreadNotifications = this.notifications.filter(n => !n.read);
    const readNotifications = this.notifications.filter(n => n.read);
    
    list.innerHTML = '';
    
    // Mostra non lette prima
    [...unreadNotifications, ...readNotifications].forEach(notification => {
      const notifEl = this.createNotificationElement(notification);
      list.appendChild(notifEl);
    });
  }

  createNotificationElement(notification) {
    const div = document.createElement('div');
    div.className = `notification-item notification-${notification.type.replace(/([A-Z])/g, '-$1').toLowerCase()} ${notification.read ? 'read' : ''}`;
    
    let icon = '';
    let message = '';
    
    switch (notification.type) {
      case 'added':
        icon = '✅';
        message = `Aggiunto: ${notification.name} (${notification.quantity})`;
        break;
      case 'removed':
        icon = '❌';
        message = `Rimosso: ${notification.name} (era ${notification.quantity})`;
        break;
      case 'qtyChanged':
        icon = '🔄';
        message = `${notification.name}: ${notification.oldQuantity} → ${notification.newQuantity}`;
        break;
      case 'extraAdded':
        icon = '➕';
        message = `Extra aggiunto: ${notification.name} (${notification.quantity})`;
        break;
      case 'extraRemoved':
        icon = '➖';
        message = `Extra rimosso: ${notification.name} (era ${notification.quantity})`;
        break;
      case 'extraChanged':
        icon = '🔄';
        message = `Extra ${notification.name}: ${notification.oldQuantity} → ${notification.newQuantity}`;
        break;
    }
    
    div.innerHTML = `
      <div class="flex justify-between">
        <div>
          <span style="margin-right: 0.5rem;">${icon}</span>
          ${message}
        </div>
        ${!notification.read ? `
          <button class="btn btn-secondary mark-read-btn" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" 
                  data-notification-id="${notification.id}">
            Segna come letta
          </button>
        ` : ''}
      </div>
      <div class="text-muted" style="font-size: 0.875rem; margin-top: 0.25rem;">
        ${(notification.timestamp && notification.timestamp.toDate ? notification.timestamp.toDate().toLocaleString() : '')}
      </div>
    `;
    
    // Add event listener
    const markReadBtn = div.querySelector('.mark-read-btn');
    if (markReadBtn) {
      markReadBtn.addEventListener('click', () => this.markNotificationRead(notification.id));
    }
    
    return div;
  }

  // Optimized checklist rendering with caching
  renderChecklist() {
    const container = safeQuerySelector('#checklistContainer');
    
    if (!container) {
      console.error('Container checklistContainer non trovato');
      return;
    }
    
    if (!this.currentList) {
      container.innerHTML = '';
      return;
    }
    
    // Create cache key for current checklist state
    const cacheKey = JSON.stringify({
      items: this.currentChecklist.items,
      extras: this.currentChecklist.extras
    });
    
    if (renderCache.has(cacheKey)) {
      container.innerHTML = renderCache.get(cacheKey);
      this.attachChecklistEventListeners(container);
      return;
    }
    
    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
    const headerDiv = document.createElement('div');
    headerDiv.innerHTML = `
      <div class="flex justify-between mb-3" style="align-items:center;">
        <h2>📋 Checklist Prodotti</h2>
        <div id="listStatus" style="min-width: 260px;">
          <div class="flex justify-between" style="font-size: 0.9rem;">
            <span class="text-secondary">Stato lista</span>
            <span id="statusText"></span>
          </div>
          <div style="height: 10px; background: var(--bg-tertiary); border-radius: 6px; overflow: hidden;">
            <div id="statusBar" style="height: 10px; width: 0%; background: #22c55e; transition: width .2s;"></div>
          </div>
        </div>
        <button class="btn btn-error delete-list-btn" style="padding: 0.5rem 1rem;">
          🗑️ Elimina Lista
        </button>
      </div>
    `;
    fragment.appendChild(headerDiv);
    
    
    // Aggiorna stato/progresso lista
    const st = this.computeCompletion();
    const statusTextEl = headerDiv.querySelector('#statusText');
    const statusBarEl = headerDiv.querySelector('#statusBar');
    if (statusTextEl && statusBarEl) {
      statusTextEl.textContent = `${st.completed}/${st.total} completati (${st.percent}%)`;
      statusBarEl.style.width = `${st.percent}%`;
    }
    if (st.complete) {
      const banner = document.createElement('div');
      banner.innerHTML = '✅ Lista completa!';
      banner.style.background = 'rgba(34, 197, 94, 0.15)';
      banner.style.border = '1px solid #22c55e';
      banner.style.color = '#16a34a';
      banner.style.padding = '0.5rem 0.75rem';
      banner.style.borderRadius = '6px';
      banner.style.marginBottom = '0.5rem';
      fragment.insertBefore(banner, fragment.firstChild);
    }
    // Use Map for better performance
    const groupedItems = new Map();
    
    this.currentChecklist.items.forEach(item => {
      const product = this.products.find(p => p.id === item.id);
      if (!product) return;
      
      const categoryId = product.categoryId;
      if (!groupedItems.has(categoryId)) {
        groupedItems.set(categoryId, []);
      }
      groupedItems.get(categoryId).push({ ...item, product });
    });
    
    // Sort categories alphabetically and render
    const sortedCategoryEntries = Array.from(groupedItems.entries()).sort(([categoryIdA], [categoryIdB]) => {
      const categoryA = this.categories.find(c => c.id === categoryIdA);
      const categoryB = this.categories.find(c => c.id === categoryIdB);
      if (!categoryA || !categoryB) return 0;
      return categoryA.name.localeCompare(categoryB.name);
    });
    
    sortedCategoryEntries.forEach(([categoryId, items]) => {
      const category = this.categories.find(c => c.id === categoryId);
      if (!category) return;
      
      // Sort items within category alphabetically
      items.sort((a, b) => a.product.name.localeCompare(b.product.name));
      
      const categorySection = document.createElement('div');
      categorySection.className = 'mb-4';
      
      const categoryHeader = document.createElement('div');
      categoryHeader.className = 'flex justify-between mb-2';
      categoryHeader.innerHTML = `
        <h3 style="color: ${category.colorHex};">📂 ${category.name}</h3>
        <button class="btn btn-primary mark-category-complete-btn" data-category-id="${categoryId}"
                style="padding: 0.5rem 1rem;">Segna tutti</button>
      `;
      categorySection.appendChild(categoryHeader);
      
      items.forEach(item => {
        const itemCard = this.createChecklistItemCard(item);
        categorySection.appendChild(itemCard);
      });
      
      fragment.appendChild(categorySection);
    });
    
    // Render extras
    if (this.currentChecklist.extras && this.currentChecklist.extras.length > 0) {
      const extrasSection = document.createElement('div');
      extrasSection.className = 'mb-4';
      
      const extrasHeader = document.createElement('h3');
      extrasHeader.textContent = '➕ Prodotti Extra';
      extrasHeader.className = 'mb-2';
      extrasSection.appendChild(extrasHeader);
      
      // Sort extras alphabetically
      const sortedExtras = [...this.currentChecklist.extras].sort((a, b) => a.name.localeCompare(b.name));
      
      sortedExtras.forEach((extra) => {
        const originalIndex = this.currentChecklist.extras.findIndex(e => e.name === extra.name);
        const extraCard = this.createExtraItemCard(extra, index);
        extrasSection.appendChild(extraCard);
      });
      
      fragment.appendChild(extrasSection);
    }
    
    container.innerHTML = '';
    container.appendChild(fragment);
    
    // Cache the rendered HTML
    renderCache.set(cacheKey, container.innerHTML);
    
    // Limit cache size
    if (renderCache.size > 5) {
      const firstKey = renderCache.keys().next().value;
      renderCache.delete(firstKey);
    }
    
    // Attach event listeners
    this.attachChecklistEventListeners(container);
  }
  
  // Attach event listeners after rendering from cache
  attachChecklistEventListeners(container) {
    // Delete list button
    const deleteListBtn = container.querySelector('.delete-list-btn');
    if (deleteListBtn) {
      deleteListBtn.addEventListener('click', () => this.deleteList());
    }
    
    // Mark category complete buttons
    const markCategoryBtns = container.querySelectorAll('.mark-category-complete-btn');
    markCategoryBtns.forEach(btn => {
      const categoryId = btn.dataset.categoryId;
      if (categoryId) {
        btn.addEventListener('click', () => this.markCategoryComplete(categoryId));
      }
    });
    
    // Quantity inputs
    const qtyInputs = container.querySelectorAll('.qty-input');
    qtyInputs.forEach(input => {
      const itemId = input.dataset.itemId;
      const extraIndex = input.dataset.extraIndex;
      
      if (itemId) {
        input.addEventListener('change', (e) => {
          this.updatePickedQuantity(itemId, parseInt(e.target.value) || 0);
        });
      } else if (extraIndex !== undefined) {
        input.addEventListener('change', (e) => {
          this.updateExtraPickedQuantity(parseInt(extraIndex), parseInt(e.target.value) || 0);
        });
      }
    });
    
    // Toggle buttons
    const toggleBtns = container.querySelectorAll('.toggle-prepared-btn');
    toggleBtns.forEach(btn => {
      const itemId = btn.dataset.itemId;
      const extraIndex = btn.dataset.extraIndex;
      
      if (itemId) {
        btn.addEventListener('click', () => this.toggleItemPrepared(itemId));
      } else if (extraIndex !== undefined) {
        btn.addEventListener('click', () => this.toggleExtraPrepared(parseInt(extraIndex)));
      }
    });
  }

  createChecklistItemCard(item) {
    if (!item || !item.product) {
      console.warn('Item o product mancante per card checklist');
      return document.createElement('div');
    }
    
    const card = document.createElement('div');
    card.className = 'product-card';
    
    const isComplete = item.qtyPicked >= item.qtyRequested;
    const backgroundStyle = isComplete ? 'background: rgba(34, 197, 94, 0.1); border-left: 4px solid #22c55e;' : 'background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444;';
    
    card.innerHTML = `
      <div class="flex justify-between" style="${backgroundStyle} padding: 1rem; border-radius: 6px;">
        <div style="flex: 1;">
          <div class="product-name ${isComplete ? 'text-success' : ''}">
            ${item.product.name}
            ${isComplete ? ' ✅' : ''}
          </div>
          <div class="text-secondary">
            Richiesto: ${item.qtyRequested} | Preparato: ${item.qtyPicked}
          </div>
        </div>
        <div class="flex" style="align-items: center; gap: 1rem;">
          <input type="number" value="${item.qtyPicked}" min="0" max="${item.qtyRequested}" 
                 class="qty-input" style="width: 80px;"
                 onchange="window.magazzinoManager.updatePickedQuantity('${item.id}', parseInt(this.value) || 0)">
          <button class="btn ${item.prepared ? 'btn-success' : 'btn-secondary'} toggle-prepared-btn" 
                  data-item-id="${item.id}"
                  style="padding: 0.5rem 1rem;">
            ${item.prepared ? 'Completato' : 'Prepara'}
          </button>
        </div>
      </div>
    `;
    
    return card;
  }

  createExtraItemCard(extra, index) {
    if (!extra || typeof index !== 'number') {
      console.warn('Extra o index mancante per card extra');
      return document.createElement('div');
    }
    
    const card = document.createElement('div');
    card.className = 'product-card';
    
    const isComplete = extra.qtyPicked >= extra.qtyRequested;
    const backgroundStyle = isComplete ? 'background: rgba(34, 197, 94, 0.1); border-left: 4px solid #22c55e;' : 'background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444;';
    
    card.innerHTML = `
      <div class="flex justify-between" style="${backgroundStyle} padding: 1rem; border-radius: 6px;">
        <div style="flex: 1;">
          <div class="product-name ${isComplete ? 'text-success' : ''}">
            ${extra.name}
            ${isComplete ? ' ✅' : ''}
          </div>
          <div class="text-secondary">
            Richiesto: ${extra.qtyRequested} | Preparato: ${extra.qtyPicked}
          </div>
        </div>
        <div class="flex" style="align-items: center; gap: 1rem;">
          <input type="number" value="${extra.qtyPicked}" min="0" max="${extra.qtyRequested}" 
                 class="qty-input" style="width: 80px;"
                 onchange="window.magazzinoManager.updateExtraPickedQuantity(${index}, parseInt(this.value) || 0)">
          <button class="btn ${extra.prepared ? 'btn-success' : 'btn-secondary'} toggle-prepared-btn" 
                  data-extra-index="${index}"
                  style="padding: 0.5rem 1rem;">
            ${extra.prepared ? 'Completato' : 'Prepara'}
          </button>
        </div>
      </div>
    `;
    
    return card;
  }

  async updatePickedQuantity(itemId, newQuantity) {
    // Validazione parametri
    if (!itemId) {
      console.error('ID item mancante');
      showToast('Errore: ID item mancante', 'error');
      return;
    }
    
    // Ensure currentChecklist exists
    if (!this.currentChecklist || !this.currentChecklist.items) {
      console.error('Checklist non inizializzata');
      showToast('Errore: checklist non inizializzata', 'error');
      return;
    }
    
    const item = this.currentChecklist.items.find(i => i.id === itemId);
    if (!item) {
      console.error('Item non trovato:', itemId);
      showToast('Errore: item non trovato', 'error');
      return;
    }
    
    console.log(`Aggiornando quantità per ${itemId}: ${item.qtyPicked} -> ${newQuantity}`);
    
    // Validazione input con utility
    const qtyValidation = validateInput(newQuantity, 'number', { min: 0, max: item.qtyRequested });
    if (!qtyValidation.valid) {
      showToast(qtyValidation.error, 'error');
      return;
    }
    
    item.qtyPicked = qtyValidation.value;
    item.prepared = item.qtyPicked >= item.qtyRequested;
    
    // Clear render cache
    renderCache.clear();
    
    try {
      await this.saveChecklist();
    } catch (error) {
      console.error('Errore salvataggio checklist:', error);
      showToast('Errore nel salvataggio', 'error');
      return;
    }
    
    // Forza re-render immediato per aggiornare colori
    setTimeout(() => {
      this.throttledRender();
      console.log('UI aggiornata dopo modifica quantità');
    }, 100);
  }
  async deleteList() {
    // Miglioramento UX per mobile
    const confirmMessage = isMobile() 
      ? 'Eliminare la lista di oggi?\n\nL\'azione non può essere annullata.'
      : 'Sei sicuro di voler eliminare la lista di oggi? L\'azione non può essere annullata.';
      
    try {
      const confirmDelete = window.confirm(confirmMessage);
      if (!confirmDelete) return;

      // Disiscrivi eventuali listener attivi
      if (this.listenerUnsubscribes) {
        this.listenerUnsubscribes.forEach(unsub => {
          try { unsub(); } catch (e) { /* ignore */ }
        });
      }

      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);

      // Elimina la checklist del magazzino e la lista dei dipendenti del giorno
      try {
        await deleteDoc(doc(db, 'weeks', week, 'warehouse', day));
      } catch (e) {
        console.warn('Nessuna checklist da eliminare o errore non bloccante:', e);
      }
      try {
        await deleteDoc(doc(db, 'weeks', week, 'lists', day));
      } catch (e) {
        console.warn('Nessuna lista dipendenti da eliminare o errore non bloccante:', e);
      }

      // Clear all caches
      const cacheKey = `${week}-${day}`;
      checklistCache.delete(cacheKey);
      const notifDocId = `${week}_${day}`;
      notificationCache.delete(notifDocId);
      renderCache.clear();
      
      // Reset stato locale e UI
      this.currentList = null;
      this.currentChecklist = { items: [], extras: [] };
      this.notifications = [];
      this.unreadCount = 0;

      const container = safeQuerySelector('#checklistContainer');
      const emptyState = safeQuerySelector('#emptyState');
      const loading = safeQuerySelector('#loadingList');
      if (container) container.classList.add('hidden');
      if (emptyState) emptyState.classList.remove('hidden');
      if (loading) loading.classList.add('hidden');

      showToast('Lista eliminata correttamente', 'success');
    } catch (error) {
      console.error('Errore durante l\'eliminazione della lista:', error);
      showToast('Errore durante l\'eliminazione della lista', 'error');
    }
  }



  
  async saveChecklist() {
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      await setDoc(doc(db, 'weeks', week, 'warehouse', day), this.currentChecklist);
      
      // Update cache
      const cacheKey = `${week}-${day}`;
      checklistCache.set(cacheKey, {
        list: this.currentList,
        checklist: this.currentChecklist
      });
      
      // Save to local storage as backup
      try {
        localStorage.setItem(`checklist-${week}-${day}`, JSON.stringify(this.currentChecklist));
      } catch (storageError) {
        console.warn('Errore salvataggio locale checklist:', storageError);
      }
      
      console.log('Checklist salvata');
    } catch (error) {
      console.error('Errore salvataggio checklist:', error);
      
      // Try to save locally as fallback
      try {
        const week = getWeekString(this.selectedDate);
        const day = formatDate(this.selectedDate);
        localStorage.setItem(`checklist-${week}-${day}`, JSON.stringify(this.currentChecklist));
        showToast('Salvato localmente (offline)', 'warning');
      } catch (storageError) {
        console.error('Errore anche nel salvataggio locale:', storageError);
      }
      showToast('Errore nel salvataggio', 'error');
    }
  }

async updateExtraPickedQuantity(extraIndex, newQuantity) {
    // Validazione parametri
    if (extraIndex < 0 || !this.currentChecklist.extras || extraIndex >= this.currentChecklist.extras.length) {
      console.error('Indice extra non valido:', extraIndex);
      showToast('Errore: indice extra non valido', 'error');
      return;
    }
    
    if (!this.currentChecklist.extras[extraIndex]) {
      console.error('Extra non trovato:', extraIndex);
      showToast('Errore: extra non trovato', 'error');
      return;
    }
    
    console.log(`Aggiornando quantità extra ${extraIndex}: ${this.currentChecklist.extras[extraIndex].qtyPicked} -> ${newQuantity}`);
    
    const extra = this.currentChecklist.extras[extraIndex];
    
    // Validazione input con utility
    const qtyValidation = validateInput(newQuantity, 'number', { min: 0, max: extra.qtyRequested });
    if (!qtyValidation.valid) {
      showToast(qtyValidation.error, 'error');
      return;
    }
    
    extra.qtyPicked = qtyValidation.value;
    extra.prepared = extra.qtyPicked >= extra.qtyRequested;
    
    // Clear render cache
    renderCache.clear();
    
    try {
      await this.saveChecklist();
    } catch (error) {
      console.error('Errore salvataggio checklist:', error);
      showToast('Errore nel salvataggio', 'error');
      return;
    }
    
    // Forza re-render immediato per aggiornare colori
    setTimeout(() => {
      this.throttledRender();
      console.log('UI aggiornata dopo modifica quantità extra');
    }, 100);
  }

  async toggleItemPrepared(itemId) {
    if (!itemId) {
      console.error('ID item mancante');
      showToast('Errore: ID item mancante', 'error');
      return;
    }
    
    // Ensure currentChecklist exists
    if (!this.currentChecklist || !this.currentChecklist.items) {
      console.error('Checklist non inizializzata');
      showToast('Errore: checklist non inizializzata', 'error');
      return;
    }
    
    const item = this.currentChecklist.items.find(i => i.id === itemId);
    if (!item) {
      console.error('Item non trovato:', itemId);
      showToast('Errore: item non trovato', 'error');
      return;
    }

    if (item.qtyPicked < item.qtyRequested) {
      item.qtyPicked = item.qtyRequested;
    }
    item.prepared = item.qtyPicked >= item.qtyRequested;

    // Clear render cache
    renderCache.clear();
    
    try {
      await this.saveChecklist();
    } catch (error) {
      console.error('Errore salvataggio checklist:', error);
      showToast('Errore nel salvataggio', 'error');
      return;
    }
    
    this.throttledRender();
  }
  
  async toggleExtraPrepared(extraIndex) {
    if (extraIndex < 0 || !this.currentChecklist.extras || extraIndex >= this.currentChecklist.extras.length) {
      console.error('Indice extra non valido:', extraIndex);
      showToast('Errore: indice extra non valido', 'error');
      return;
    }
    
    const extra = this.currentChecklist.extras[extraIndex];
    if (!extra) {
      console.error('Extra non trovato:', extraIndex);
      showToast('Errore: extra non trovato', 'error');
      return;
    }

    if (extra.qtyPicked < extra.qtyRequested) {
      extra.qtyPicked = extra.qtyRequested;
    }
    extra.prepared = extra.qtyPicked >= extra.qtyRequested;

    // Clear render cache
    renderCache.clear();
    
    try {
      await this.saveChecklist();
    } catch (error) {
      console.error('Errore salvataggio checklist:', error);
      showToast('Errore nel salvataggio', 'error');
      return;
    }
    
    this.throttledRender();
  }
  
  async markCategoryComplete(categoryId) {
    if (!categoryId) {
      console.error('ID categoria mancante');
      showToast('Errore: ID categoria mancante', 'error');
      return;
    }
    
    // Ensure currentChecklist exists
    if (!this.currentChecklist || !this.currentChecklist.items) {
      console.error('Checklist non inizializzata');
      showToast('Errore: checklist non inizializzata', 'error');
      return;
    }
    
    try {
      // Trova tutti gli items di questa categoria
      const categoryItems = this.currentChecklist.items.filter(item => {
        if (!item || !item.id) return false;
        const product = this.products.find(p => p.id === item.id);
        return product && product.categoryId === categoryId;
      });
      
      if (categoryItems.length === 0) {
        showToast('Nessun item trovato per questa categoria', 'warning');
        return;
      }
      
      // Segna tutti come completati
      categoryItems.forEach(item => {
        item.qtyPicked = item.qtyRequested;
        item.prepared = true;
      });
      
      // Clear render cache
      renderCache.clear();
      
      await this.saveChecklist();
      this.throttledRender();
      showToast('Categoria completata!', 'success');
    } catch (error) {
      console.error('Errore nel completamento categoria:', error);
      showToast('Errore nel completamento categoria', 'error');
    }
  }
  
  async markNotificationRead(notificationId) {
    if (!notificationId) {
      console.error('ID notifica mancante');
      showToast('Errore: ID notifica mancante', 'error');
      return;
    }
    
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      const notifDocId = `${week}_${day}`;
      
      await updateDoc(doc(db, 'notifications', notifDocId, 'entries', notificationId), {
        read: true
      });
      
      // Clear notification cache
      notificationCache.delete(notifDocId);
      
      showToast('Notifica segnata come letta', 'success');
    } catch (error) {
      console.error('Errore nel segnare notifica come letta:', error);
      showToast('Errore nell\'aggiornamento notifica', 'error');
    }
  }
  
  // Cleanup method
  destroy() {
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }
    
    // Rimuovi listener esistenti se presenti
    if (this.listenerUnsubscribes) {
      this.listenerUnsubscribes.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('Errore rimozione listener:', error);
        }
      });
    }
    
    // Clear all caches
    checklistCache.clear();
    notificationCache.clear();
    renderCache.clear();
  }
  
  async markAllNotificationsRead() {
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      const notifDocId = `${week}_${day}`;
      
      const unreadNotifications = this.notifications.filter(n => !n.read);
      
      for (const notification of unreadNotifications) {
        await updateDoc(doc(db, 'notifications', notifDocId, 'entries', notification.id), {
          read: true
        });
      }
      
      // Aggiorna counter
      await setDoc(doc(db, 'notifications', notifDocId), {
        unreadCount: 0,
        lastUpdate: Timestamp.now()
      }, { merge: true });
      
      // Clear notification cache
      notificationCache.delete(notifDocId);
      
      showToast('Tutte le notifiche segnate come lette', 'success');
    } catch (error) {
      console.error('Errore nel segnare tutte le notifiche come lette:', error);
      showToast('Errore nell\'aggiornamento notifiche', 'error');
    }
  }

}

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (window.magazzinoManager) {
    window.magazzinoManager.destroy();
  }
});

// Handle orientation changes
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    if (window.magazzinoManager) {
      window.magazzinoManager.throttledRender();
    }
  }, 100);
});

// Inizializza l'applicazione
window.magazzinoManager = new MagazzinoManager();