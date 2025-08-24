import { db } from '../shared/firebase.js';
import { 
  collection, doc, getDocs, getDoc, setDoc, onSnapshot, deleteDoc,
  query, where, orderBy, Timestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { formatDate, getWeekString, getDayName, showToast, debounce , getContrastColor } from '../shared/utils.js';
import { safeQuerySelector, safeAddEventListener, validateInput, initMobileUtils, getCachedProducts, setCachedProducts, getCachedCategories, setCachedCategories, preloadCriticalData, initTheme } from '../shared/utils.js';

// Cache per migliorare le performance
const listCache = new Map();
const productRenderCache = new Map();

class ListaManager {
  constructor() {
    this.selectedDate = new Date();
    this.categories = [];
    this.products = [];
    this.currentList = { items: [], extras: [], status: {}, version: 0 };
    this.selectedCategory = '';
    this.searchTerm = '';
    this.collapsedCategories = new Set(); // Track collapsed categories
    
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
    
    // Show loading immediately
    document.getElementById('loadingProducts').classList.remove('hidden');
    
    // Load data with optimized strategy
    await this.loadDataOptimized();
    
    await this.loadCurrentList();
    this.throttledRender();
    this.renderExtras();
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
        this.renderCategoryFilters();
      }
      
      if (cachedProducts.isValid && cachedProducts.products.length > 0) {
        this.products = cachedProducts.products;
        this.throttledRender();
        document.getElementById('loadingProducts').classList.add('hidden');
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
      this.renderProducts();
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
      
      // Clear cache when date changes
      listCache.clear();
      productRenderCache.clear();
      
      this.loadCurrentList();
    });
  }

  setupEventListeners() {
    const searchInput = safeQuerySelector('#searchInput');
    if (searchInput) {
      safeAddEventListener(searchInput, 'input', debounce((e) => {
        this.searchTerm = e.target.value.toLowerCase();
        this.throttledRender();
      }, 300));
    }

    const addExtraBtn = safeQuerySelector('#addExtraBtn');
    if (addExtraBtn) {
      safeAddEventListener(addExtraBtn, 'click', () => {
        this.addExtra();
      });
    }

    const extraName = safeQuerySelector('#extraName');
    if (extraName) {
      safeAddEventListener(extraName, 'keypress', (e) => {
        if (e.key === 'Enter') this.addExtra();
      });
    }

    const saveDraftBtn = safeQuerySelector('#saveDraftBtn');
    if (saveDraftBtn) {
      safeAddEventListener(saveDraftBtn, 'click', () => {
        this.saveList(false);
      });
    }

    const submitBtn = safeQuerySelector('#submitBtn');
    if (submitBtn) {
      safeAddEventListener(submitBtn, 'click', () => {
        this.saveList(true);
      });
    }

    // Global controls for expand/collapse
    const expandAllBtn = safeQuerySelector('#expandAllBtn');
    if (expandAllBtn) {
      safeAddEventListener(expandAllBtn, 'click', () => {
        this.expandAllCategories();
      });
    }

    const collapseAllBtn = safeQuerySelector('#collapseAllBtn');
    if (collapseAllBtn) {
      safeAddEventListener(collapseAllBtn, 'click', () => {
        this.collapseAllCategories();
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
      
      this.renderCategoryFilters();
    } catch (error) {
      console.error('Errore caricamento categorie:', error);
      this.showError('Errore nel caricamento delle categorie');
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
      
      // Load collapsed state after products are loaded
      this.loadCollapsedState();
      
      // Update IndexedDB cache
      if (updateCache) {
        setCachedProducts(this.products);
      }
    } catch (error) {
      console.error('Errore caricamento prodotti:', error);
      this.showError('Errore nel caricamento dei prodotti');
      this.products = [];
    }
  }

  async loadCurrentList() {
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      
      // Check cache first
      const cacheKey = `${week}-${day}`;
      if (listCache.has(cacheKey)) {
        this.currentList = listCache.get(cacheKey);
        this.throttledRender();
        this.renderExtras();
        return;
      }
      
      try {
        const listDoc = await getDoc(doc(db, 'weeks', week, 'lists', day));
        
        if (listDoc.exists()) {
          this.currentList = listDoc.data();
        } else {
          this.currentList = { items: [], extras: [], status: {}, version: 0 };
        }
        
        // Cache the result
        listCache.set(cacheKey, this.currentList);
        
        // Limit cache size
        if (listCache.size > 20) {
          const firstKey = listCache.keys().next().value;
          listCache.delete(firstKey);
        }
      } catch (firestoreError) {
        console.warn('Errore Firestore, usando dati locali:', firestoreError);
        // Fallback to local storage
        const localData = localStorage.getItem(`list-${week}-${day}`);
        if (localData) {
          try {
            this.currentList = JSON.parse(localData);
          } catch (parseError) {
            console.error('Errore parsing dati locali:', parseError);
            this.currentList = { items: [], extras: [], status: {}, version: 0 };
          }
        } else {
          this.currentList = { items: [], extras: [], status: {}, version: 0 };
        }
      }
      
      this.throttledRender();
      this.renderExtras();
    } catch (error) {
      console.error('Errore caricamento lista:', error);
      this.showError('Errore nel caricamento della lista');
      // Ensure we have a valid currentList even on error
      if (!this.currentList) {
        this.currentList = { items: [], extras: [], status: {}, version: 0 };
      }
    }
  }

  renderCategoryFilters() {
    const container = document.getElementById('categoryFilters');
    if (!container) {
      console.error('Container categoryFilters non trovato');
      return;
    }
    
    const allBtn = document.createElement('button');
    allBtn.className = `btn btn-secondary ${!this.selectedCategory ? 'active' : ''}`;
    allBtn.textContent = 'Tutte';
    allBtn.addEventListener('click', () => {
      this.selectedCategory = '';
      this.throttledRender();
      this.updateCategoryFilters();
    });
    
    container.innerHTML = '';
    container.appendChild(allBtn);
    
    // Sort categories alphabetically in filters
    const sortedCategories = [...this.categories].sort((a, b) => a.name.localeCompare(b.name));
    sortedCategories.forEach(category => {
      if (!category.id || !category.name || !category.colorHex) {
        console.warn('Categoria con dati mancanti saltata nei filtri:', category);
        return;
      }
      
      const btn = document.createElement('button');
      btn.className = `btn btn-secondary ${this.selectedCategory === category.id ? 'active' : ''}`;
      btn.textContent = category.name;
      btn.style.backgroundColor = this.selectedCategory === category.id ? category.colorHex : '';
      btn.style.color = this.selectedCategory === category.id ? getContrastColor(category.colorHex) : '';
      btn.addEventListener('click', () => {
        this.selectedCategory = category.id;
        this.throttledRender();
        this.updateCategoryFilters();
      });
      container.appendChild(btn);
    });
  }

  updateCategoryFilters() {
    const buttons = document.querySelectorAll('#categoryFilters button');
    const sortedCategories = [...this.categories].sort((a, b) => a.name.localeCompare(b.name));
    buttons.forEach((btn, index) => {
      if (index === 0) {
        btn.classList.toggle('active', !this.selectedCategory);
      } else {
        const category = sortedCategories[index - 1];
        const isActive = this.selectedCategory === category.id;
        btn.classList.toggle('active', isActive);
        btn.style.backgroundColor = isActive ? category.colorHex : '';
        btn.style.color = isActive ? getContrastColor(category.colorHex) : '';
      }
    });
  }

  // Optimized product rendering with caching
  renderProducts() {
    const container = document.getElementById('productsList');
    const loading = document.getElementById('loadingProducts');
    
    if (!container) {
      console.error('Container productsList non trovato');
      return;
    }
    
    loading.classList.add('hidden');
    container.classList.remove('hidden');
    
    // Create cache key for current filter state
    const cacheKey = `${this.searchTerm}-${this.selectedCategory}-${JSON.stringify(this.currentList.items)}`;
    
    if (productRenderCache.has(cacheKey)) {
      container.innerHTML = productRenderCache.get(cacheKey);
      this.attachEventListeners(container);
      return;
    }
    
    let filteredProducts = this.products.filter(product => {
      const matchesSearch = !this.searchTerm || 
        product.name.toLowerCase().includes(this.searchTerm);
      const matchesCategory = !this.selectedCategory || 
        product.categoryId === this.selectedCategory;
      return matchesSearch && matchesCategory;
    }).sort((a, b) => a.name.localeCompare(b.name)); // Sort filtered results alphabetically

    // Use Map for better performance
    const groupedProducts = new Map();
    filteredProducts.forEach(product => {
      if (!groupedProducts.has(product.categoryId)) {
        groupedProducts.set(product.categoryId, []);
      }
      groupedProducts.get(product.categoryId).push(product);
    });

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Sort categories alphabetically
    const sortedCategoryEntries = Array.from(groupedProducts.entries()).sort(([categoryIdA], [categoryIdB]) => {
      const categoryA = this.categories.find(c => c.id === categoryIdA);
      const categoryB = this.categories.find(c => c.id === categoryIdB);
      if (!categoryA || !categoryB) return 0;
      return categoryA.name.localeCompare(categoryB.name);
    });
    
    // Render categories in batches for better performance
    let categoryIndex = 0;
    
    const renderCategoryBatch = () => {
      const batchSize = 2; // Render 2 categories at a time
      const endIndex = Math.min(categoryIndex + batchSize, sortedCategoryEntries.length);
      
      for (let i = categoryIndex; i < endIndex; i++) {
        const [categoryId, products] = sortedCategoryEntries[i];
        const categorySection = this.createCategorySection(categoryId, products);
        if (categorySection) {
          fragment.appendChild(categorySection);
        }
      }
      
      categoryIndex = endIndex;
      
      if (categoryIndex < sortedCategoryEntries.length) {
        // Continue with next batch
        requestAnimationFrame(renderCategoryBatch);
      } else {
        // Finished rendering all categories
        container.innerHTML = '';
        container.appendChild(fragment);
        
        // Cache the rendered HTML
        productRenderCache.set(cacheKey, container.innerHTML);
        
        // Limit cache size
        if (productRenderCache.size > 10) {
          const firstKey = productRenderCache.keys().next().value;
          productRenderCache.delete(firstKey);
        }
        
        // Attach event listeners
        this.attachEventListeners(container);
      }
    };
    
    renderCategoryBatch();
  }
  
  createCategorySection(categoryId, products) {
    const category = this.categories.find(c => c.id === categoryId);
    if (!category) {
      console.warn('Categoria non trovata per ID:', categoryId);
      return null;
    }

    // Sort products within category alphabetically
    products.sort((a, b) => a.name.localeCompare(b.name));
    const isCollapsed = this.collapsedCategories.has(categoryId);
    
    const categorySection = document.createElement('div');
    categorySection.className = 'category-section compact';
    categorySection.style.background = `linear-gradient(135deg, ${category.colorHex}10 0%, transparent 100%)`;
    categorySection.style.border = `1px solid ${category.colorHex}30`;
    categorySection.style.borderRadius = '12px';
    categorySection.style.borderLeft = `4px solid ${category.colorHex}`;
    
    const categoryHeader = document.createElement('div');
    categoryHeader.className = `category-header ${isCollapsed ? 'collapsed' : ''}`;
    categoryHeader.style.color = category.colorHex;
    categoryHeader.innerHTML = `
      <div class="category-title">
        <span class="category-toggle-icon ${isCollapsed ? 'collapsed' : ''}">▼</span>
        <span>📂</span>
        <span style="font-weight: 600; font-size: 0.95rem;">${category.name}</span>
      </div>
      <span class="product-count">${products.length}</span>
    `;
    
    // Add click handler for toggle
    categoryHeader.addEventListener('click', () => {
      this.toggleCategory(categoryId);
    });
    
    categorySection.appendChild(categoryHeader);

    const categoryContent = document.createElement('div');
    categoryContent.className = `category-content ${isCollapsed ? 'collapsed' : ''}`;
    
    const productsGrid = document.createElement('div');
    productsGrid.className = 'products-grid';
    productsGrid.style.padding = '0.5rem';

    products.forEach(product => {
      const productCard = this.createProductCard(product, category);
      productsGrid.appendChild(productCard);
    });

    categoryContent.appendChild(productsGrid);
    categorySection.appendChild(categoryContent);
    return categorySection;
  }
  
  toggleCategory(categoryId) {
    if (this.collapsedCategories.has(categoryId)) {
      this.collapsedCategories.delete(categoryId);
    } else {
      this.collapsedCategories.add(categoryId);
    }
    
    // Save state to localStorage
    localStorage.setItem('collapsedCategories', JSON.stringify([...this.collapsedCategories]));
    
    this.throttledRender();
  }

  expandAllCategories() {
    this.collapsedCategories.clear();
    localStorage.setItem('collapsedCategories', JSON.stringify([]));
    this.throttledRender();
    showToast('Tutte le categorie espanse', 'success');
  }

  collapseAllCategories() {
    // Add all category IDs to collapsed set
    const categoryIds = [...new Set(this.products.map(p => p.categoryId))];
    this.collapsedCategories = new Set(categoryIds);
    localStorage.setItem('collapsedCategories', JSON.stringify([...this.collapsedCategories]));
    this.throttledRender();
    showToast('Tutte le categorie chiuse', 'success');
  }

  loadCollapsedState() {
    try {
      const saved = localStorage.getItem('collapsedCategories');
      if (saved) {
        this.collapsedCategories = new Set(JSON.parse(saved));
      } else {
        // Default: all categories collapsed
        const categoryIds = [...new Set(this.products.map(p => p.categoryId))];
        this.collapsedCategories = new Set(categoryIds);
      }
    } catch (error) {
      console.warn('Errore caricamento stato categorie:', error);
      this.collapsedCategories = new Set();
    }
  }
  
  // Attach event listeners after rendering from cache
  attachEventListeners(container) {
    const qtyInputs = container.querySelectorAll('.qty-input');
    const qtyBtns = container.querySelectorAll('.qty-btn');
    
    qtyInputs.forEach(input => {
      const productId = input.dataset.productId;
      if (productId) {
        input.addEventListener('change', (e) => {
          this.updateQuantity(productId, parseInt(e.target.value) || 0);
        });
      }
    });
    
    qtyBtns.forEach(btn => {
      const productId = btn.dataset.productId;
      const action = btn.dataset.action;
      if (productId && action) {
        btn.addEventListener('click', () => {
          const currentQty = this.getCurrentQuantity(productId);
          const newQty = action === 'increase' ? currentQty + 1 : Math.max(0, currentQty - 1);
          this.updateQuantity(productId, newQty);
        });
      }
    });
  }
  
  getCurrentQuantity(productId) {
    const existingItem = this.currentList.items.find(item => item.id === productId);
    return existingItem ? existingItem.quantity : 0;
  }

  // Original renderProducts method (keeping for reference)
  renderProductsOriginal() {
    sortedCategoryEntries.forEach(([categoryId, products]) => {
      const category = this.categories.find(c => c.id === categoryId);
      if (!category) {
        console.warn('Categoria non trovata per ID:', categoryId);
        return;
      }

      // Sort products within category alphabetically
      products.sort((a, b) => a.name.localeCompare(b.name));
      const categorySection = document.createElement('div');
      categorySection.className = 'category-section compact';
      categorySection.style.background = `linear-gradient(135deg, ${category.colorHex}10 0%, transparent 100%)`;
      categorySection.style.border = `1px solid ${category.colorHex}30`;
      categorySection.style.borderRadius = '12px';
      categorySection.style.padding = '0.5rem';
      categorySection.style.borderLeft = `4px solid ${category.colorHex}`;
      
      const categoryHeader = document.createElement('h3');
      categoryHeader.className = 'category-header-compact';
      categoryHeader.style.color = category.colorHex;
      categoryHeader.style.margin = '0 0 0.5rem 0';
      categoryHeader.style.fontSize = '0.95rem';
      categoryHeader.style.fontWeight = '600';
      categoryHeader.style.display = 'flex';
      categoryHeader.style.alignItems = 'center';
      categoryHeader.style.gap = '0.5rem';
      categoryHeader.innerHTML = `
        <span>📂</span>
        <span>${category.name}</span>
        <span style="margin-left: auto; font-size: 0.7rem; opacity: 0.8;">${products.length}</span>
      `;
      categorySection.appendChild(categoryHeader);

      const productsGrid = document.createElement('div');
      productsGrid.className = 'products-grid';

      products.forEach(product => {
        const productCard = this.createProductCard(product, category);
        productsGrid.appendChild(productCard);
      });

      categorySection.appendChild(productsGrid);
      fragment.appendChild(categorySection);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
  }

  createProductCard(product, category) {
    const existingItem = this.currentList.items.find(item => item.id === product.id);
    const quantity = existingItem ? existingItem.quantity : 0;

    const card = document.createElement('div');
    card.className = `product-card ${quantity > 0 ? 'has-quantity' : ''}`;
    
    card.innerHTML = `
      <div class="product-header">
        <div>
          <div class="product-name">
            ${product.name}
            ${product.important ? '<span class="important-badge">Importante</span>' : ''}
          </div>
          <div class="product-category" style="background-color: ${category.colorHex}20; color: ${category.colorHex}; border: 1px solid ${category.colorHex};">
            ${category.name}
          </div>
        </div>
      </div>
      <div class="quantity-controls">
        <button class="qty-btn" data-product-id="${product.id}" data-action="decrease">-</button>
        <input type="number" class="qty-input" value="${quantity}" min="0" data-product-id="${product.id}">
        <button class="qty-btn" data-product-id="${product.id}" data-action="increase">+</button>
      </div>
    `;

    return card;
  }

  updateQuantity(productId, newQuantity) {
    // Validazione parametri
    if (!productId) {
      console.error('ID prodotto mancante');
      showToast('Errore: ID prodotto mancante', 'error');
      return;
    }
    
    // Ensure currentList exists
    if (!this.currentList) {
      this.currentList = { items: [], extras: [], status: {}, version: 0 };
    }
    
    if (!this.currentList.items) {
      this.currentList.items = [];
    }
    
    const qtyValidation = validateInput(newQuantity, 'number', { min: 0, max: 999 });
    if (!qtyValidation.valid) {
      showToast('Quantità non valida', 'error');
      return;
    }
    
    newQuantity = qtyValidation.value;
    
    const existingIndex = this.currentList.items.findIndex(item => item.id === productId);
    
    if (newQuantity <= 0 && existingIndex !== -1) {
      this.currentList.items.splice(existingIndex, 1);
    } else if (newQuantity > 0) {
      if (existingIndex !== -1) {
        this.currentList.items[existingIndex].quantity = newQuantity;
      } else {
        this.currentList.items.push({
          id: productId,
          quantity: newQuantity
        });
      }
    }
    
    // Clear render cache since quantities changed
    productRenderCache.clear();
    
    // Update only the specific product card for better performance
    this.updateProductCardQuantity(productId, newQuantity);
    
    // Save to local storage as backup
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      localStorage.setItem(`list-${week}-${day}`, JSON.stringify(this.currentList));
      
      // Update cache
      const cacheKey = `${week}-${day}`;
      listCache.set(cacheKey, this.currentList);
    } catch (storageError) {
      console.warn('Errore salvataggio locale:', storageError);
    }
    
    // Auto-save draft after quantity change (debounced)
    if (!this.autoSaveTimeout) {
      this.autoSaveTimeout = setTimeout(() => {
        this.saveList(false);
        this.autoSaveTimeout = null;
      }, 2000);
    }
  }
  
  updateProductCardQuantity(productId, newQuantity) {
    // Find and update only the specific product card
    const qtyInput = document.querySelector(`.qty-input[data-product-id="${productId}"]`);
    if (qtyInput) {
      qtyInput.value = newQuantity;
      
      // Update card styling
      const card = qtyInput.closest('.product-card');
      if (card) {
        if (newQuantity > 0) {
          card.classList.add('has-quantity');
        } else {
          card.classList.remove('has-quantity');
        }
      }
    }
  }

  addExtra() {
    const nameInput = safeQuerySelector('#extraName');
    const qtyInput = safeQuerySelector('#extraQty');
    
    if (!nameInput || !qtyInput) {
      console.error('Input per prodotti extra non trovati');
      return;
    }
    
    // Ensure currentList exists
    if (!this.currentList) {
      this.currentList = { items: [], extras: [], status: {}, version: 0 };
    }
    
    if (!this.currentList.extras) {
      this.currentList.extras = [];
    }
    
    // Validazione input con utility
    const nameValidation = validateInput(nameInput.value, 'text', { min: 2, max: 100, required: true });
    if (!nameValidation.valid) {
      showToast(nameValidation.error, 'error');
      return;
    }
    
    const qtyValidation = validateInput(qtyInput.value, 'number', { min: 1, max: 999, required: true });
    if (!qtyValidation.valid) {
      showToast(qtyValidation.error, 'error');
      return;
    }
    
    const name = nameValidation.value;
    const qty = qtyValidation.value;
    
    const existingIndex = this.currentList.extras.findIndex(extra => extra.name === name);
    
    if (existingIndex !== -1) {
      this.currentList.extras[existingIndex].quantity += qty;
    } else {
      this.currentList.extras.push({ name, quantity: qty });
    }
    
    nameInput.value = '';
    qtyInput.value = '';
    this.renderExtras();
    
    // Save to local storage as backup
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      localStorage.setItem(`list-${week}-${day}`, JSON.stringify(this.currentList));
      
      // Update cache
      const cacheKey = `${week}-${day}`;
      listCache.set(cacheKey, this.currentList);
    } catch (storageError) {
      console.warn('Errore salvataggio locale:', storageError);
    }
  }

  renderExtras() {
    const container = safeQuerySelector('#extrasList');
    if (!container) {
      console.error('Container extrasList non trovato');
      return;
    }
    
    // Ensure currentList exists
    if (!this.currentList || !this.currentList.extras) {
      return;
    }
    
    container.innerHTML = '';
    
    this.currentList.extras.forEach((extra, index) => {
      const extraDiv = document.createElement('div');
      extraDiv.className = 'flex justify-between mb-2 p-2';
      extraDiv.style.background = 'var(--bg-tertiary)';
      extraDiv.style.borderRadius = '4px';
      
      extraDiv.innerHTML = `
        <span>${extra.name} (${extra.quantity})</span>
        <button class="btn btn-error remove-extra-btn" style="padding: 0.25rem 0.5rem; font-size: 0.875rem;" 
                data-index="${index}">🗑️</button>
      `;
      
      // Add event listener
      const removeBtn = extraDiv.querySelector('.remove-extra-btn');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => this.removeExtra(index));
      }
      
      container.appendChild(extraDiv);
    });
  }

  removeExtra(index) {
    // Ensure currentList exists
    if (!this.currentList || !this.currentList.extras) {
      return;
    }
    
    if (index < 0 || index >= this.currentList.extras.length) {
      console.error('Indice extra non valido:', index);
      showToast('Errore: indice non valido', 'error');
      return;
    }
    
    this.currentList.extras.splice(index, 1);
    this.renderExtras();
    
    // Save to local storage as backup
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      localStorage.setItem(`list-${week}-${day}`, JSON.stringify(this.currentList));
      
      // Update cache
      const cacheKey = `${week}-${day}`;
      listCache.set(cacheKey, this.currentList);
    } catch (storageError) {
      console.warn('Errore salvataggio locale:', storageError);
    }
  }

  async saveList(isSubmit = false) {
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      
      // Ensure currentList exists
      if (!this.currentList) {
        this.currentList = { items: [], extras: [], status: {}, version: 0 };
      }
      
      // Calcola diff per notifiche
      const previousList = { ...this.currentList };
      
      this.currentList.status.updatedAt = Timestamp.now();
      this.currentList.version = (this.currentList.version || 0) + 1;
      
      if (isSubmit) {
        // Verifica prodotti importanti
        const importantProducts = this.products.filter(p => p.important);
        const missingImportant = importantProducts.filter(ip => 
          !this.currentList.items.find(item => item.id === ip.id)
        );
        
        if (missingImportant.length > 0) {
          const missingNames = missingImportant.map(p => p.name).join(', ');
          
          // Mostra popup di conferma
          const confirmMessage = `Non hai segnato i seguenti prodotti importanti:\n\n${missingNames}\n\nVuoi continuare comunque?`;
          
          if (!confirm(confirmMessage)) {
            document.getElementById('validationMessage').textContent = 
              `Attenzione: mancano i seguenti prodotti importanti: ${missingNames}`;
            document.getElementById('validationMessage').classList.remove('hidden');
            return;
          }
          
          // Se l'utente conferma, continua con l'invio
          document.getElementById('validationMessage').classList.add('hidden');
        }
        
        this.currentList.status.submittedAt = Timestamp.now();
      }
      
      // Salva lista
      await setDoc(doc(db, 'weeks', week, 'lists', day), this.currentList);
      
      // Save to local storage as backup
      try {
        localStorage.setItem(`list-${week}-${day}`, JSON.stringify(this.currentList));
        
        // Update cache
        const cacheKey = `${week}-${day}`;
        listCache.set(cacheKey, this.currentList);
      } catch (storageError) {
        console.warn('Errore salvataggio locale:', storageError);
      }
      
      // Genera notifiche
      await this.generateNotifications(previousList, week, day);
      
      const message = isSubmit ? 'Lista inviata con successo!' : 'Bozza salvata!';
      document.getElementById('successMessage').textContent = message;
      document.getElementById('successMessage').classList.remove('hidden');
      document.getElementById('validationMessage').classList.add('hidden');
      
      showToast(message, 'success');
      
      setTimeout(() => {
        document.getElementById('successMessage').classList.add('hidden');
      }, 3000);
      
    } catch (error) {
      console.error('Errore salvataggio:', error);
      
      // Try to save locally as fallback
      try {
        const week = getWeekString(this.selectedDate);
        const day = formatDate(this.selectedDate);
        localStorage.setItem(`list-${week}-${day}`, JSON.stringify(this.currentList));
        showToast('Salvato localmente (offline)', 'warning');
      } catch (storageError) {
        console.error('Errore anche nel salvataggio locale:', storageError);
      }
      this.showError('Errore durante il salvataggio');
    }
  }

  async generateNotifications(previousList, week, day) {
    // Ensure we have valid data
    if (!this.currentList) {
      console.warn('currentList non disponibile per notifiche');
      return;
    }
    
    const notifications = [];
    
    // Confronta items
    const prevItems = previousList.items || [];
    const currItems = this.currentList.items || [];
    
    // Prodotti aggiunti
    currItems.forEach(curr => {
      if (!curr || !curr.id) return;
      
      const prev = prevItems.find(p => p.id === curr.id);
      if (!prev) {
        const product = this.products.find(p => p.id === curr.id);
        notifications.push({
          type: 'added',
          id: curr.id,
          name: product?.name || curr.id,
          quantity: curr.quantity,
          atVersion: this.currentList.version
        });
      } else if (prev.quantity !== curr.quantity) {
        const product = this.products.find(p => p.id === curr.id);
        notifications.push({
          type: 'qtyChanged',
          id: curr.id,
          name: product?.name || curr.id,
          oldQuantity: prev.quantity,
          newQuantity: curr.quantity,
          atVersion: this.currentList.version
        });
      }
    });
    
    // Prodotti rimossi
    prevItems.forEach(prev => {
      if (!prev || !prev.id) return;
      
      const curr = currItems.find(c => c.id === prev.id);
      if (!curr) {
        const product = this.products.find(p => p.id === prev.id);
        notifications.push({
          type: 'removed',
          id: prev.id,
          name: product?.name || prev.id,
          quantity: prev.quantity,
          atVersion: this.currentList.version
        });
      }
    });
    
    // Confronta extras
    const prevExtras = previousList.extras || [];
    const currExtras = this.currentList.extras || [];
    
    currExtras.forEach(curr => {
      if (!curr || !curr.name) return;
      
      const prev = prevExtras.find(p => p.name === curr.name);
      if (!prev) {
        notifications.push({
          type: 'extraAdded',
          name: curr.name,
          quantity: curr.quantity,
          atVersion: this.currentList.version
        });
      } else if (prev.quantity !== curr.quantity) {
        notifications.push({
          type: 'extraChanged',
          name: curr.name,
          oldQuantity: prev.quantity,
          newQuantity: curr.quantity,
          atVersion: this.currentList.version
        });
      }
    });
    
    prevExtras.forEach(prev => {
      if (!prev || !prev.name) return;
      
      const curr = currExtras.find(c => c.name === prev.name);
      if (!curr) {
        notifications.push({
          type: 'extraRemoved',
          name: prev.name,
          quantity: prev.quantity,
          atVersion: this.currentList.version
        });
      }
    });
    
    // Salva notifiche
    if (notifications.length > 0) {
      try {
        const notifDocId = `${week}_${day}`;
        
        for (const notif of notifications) {
          const notifId = `${notif.type}_${notif.id || notif.name}_${notif.atVersion}`;
          await setDoc(doc(db, 'notifications', notifDocId, 'entries', notifId), {
            ...notif,
            timestamp: Timestamp.now(),
            read: false
          });
        }
        
        // Aggiorna counter
        const notifDoc = await getDoc(doc(db, 'notifications', notifDocId));
        const currentCount = notifDoc.exists() ? (notifDoc.data().unreadCount || 0) : 0;
        
        await setDoc(doc(db, 'notifications', notifDocId), {
          unreadCount: currentCount + notifications.length,
          lastUpdate: Timestamp.now()
        }, { merge: true });
      } catch (error) {
        console.error('Errore salvataggio notifiche:', error);
        // Non bloccare il salvataggio della lista per errori nelle notifiche
      }
    }
  }

  showError(message) {
    const errorEl = safeQuerySelector('#errorMessage');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
      setTimeout(() => errorEl.classList.add('hidden'), 5000);
    }
    // Fallback con toast se elemento non trovato
    showToast(message, 'error');
    
    // Log error for debugging
    console.error('Lista Error:', message);
  }
  
  // Cleanup method
  destroy() {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }
    
    // Clear caches
    listCache.clear();
    productRenderCache.clear();
  }
}

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (window.listaManager) {
    window.listaManager.destroy();
  }
});

// Handle orientation changes
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    if (window.listaManager) {
      window.listaManager.throttledRender();
    }
  }, 100);
});

// Inizializza l'applicazione
window.listaManager = new ListaManager();