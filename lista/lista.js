import { db } from '../shared/firebase.js?v=1.2.0';
import { 
  collection, doc, getDocs, getDoc, setDoc, onSnapshot, deleteDoc,
  query, where, orderBy, Timestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { formatDate, getWeekString, getDayName, showToast, debounce, getContrastColor } from '../shared/utils.js?v=1.2.0';
import { 
  safeQuerySelector, safeAddEventListener, validateInput, initMobileUtils, 
  getCachedProducts, setCachedProducts, getCachedCategories, setCachedCategories, 
  preloadCriticalData, initTheme, initHamburgerMenu, getAdaptiveBatchSize,
  scheduleRender, globalBatchProcessor, smartPrefetcher, VirtualScrollManager,
  initEnhancedIntersectionObserver, createScrollHandler
} from '../shared/utils.js?v=1.2.0';

class ListaManager {
  constructor() {
    this.selectedDate = new Date();
    this.categories = [];
    this.products = [];
    this.filteredProducts = [];
    this.renderedProducts = [];
    this.currentList = { items: [], extras: [], status: {}, version: 0 };
    this.selectedCategory = '';
    this.searchTerm = '';
    this.collapsedCategories = new Set();
    this.virtualScrollManager = null;
    this.isLoading = false;
    this.hasMoreProducts = true;
    this.currentBatch = 0;
    this.loadingIndicator = null;
    this.intersectionObserver = null;
    
    this.init();
  }

  async init() {
    initMobileUtils();
    initTheme();
    initHamburgerMenu();
    
    // Initialize enhanced intersection observer
    this.intersectionObserver = initEnhancedIntersectionObserver();
    
    // Preload critical data in background
    preloadCriticalData();
    
    this.setupDateSelector();
    this.setupEventListeners();
    
    this.showLoadingState();
    
    await this.loadDataOptimized();
    await this.loadCurrentList();
    await this.renderProductsOptimized();
    this.renderExtras();
  }
  
  showLoadingState() {
    const loadingEl = document.getElementById('loadingProducts');
    if (loadingEl) {
      loadingEl.classList.remove('hidden');
      loadingEl.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid var(--border-color); border-top: 4px solid var(--accent-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
          <div id="loadingText">Caricamento prodotti...</div>
          <div id="loadingProgress" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem;"></div>
        </div>
      `;
    }
  }
  
  updateLoadingProgress(message) {
    const progressEl = document.getElementById('loadingProgress');
    if (progressEl) {
      progressEl.textContent = message;
    }
  }
  
  async loadDataOptimized() {
    const startTime = performance.now();
    
    try {
      this.updateLoadingProgress('Controllo cache locale...');
      
      // Try to load from cache first
      const [cachedProducts, cachedCategories] = await Promise.all([
        getCachedProducts(),
        getCachedCategories()
      ]);
      
      // Load categories first (smaller dataset)
      if (cachedCategories.isValid && cachedCategories.categories.length > 0) {
        this.categories = cachedCategories.categories;
        this.renderCategoryFilters();
        this.loadCollapsedState();
        this.updateLoadingProgress('Categorie caricate dalla cache');
      } else {
        this.updateLoadingProgress('Caricamento categorie...');
        await this.loadCategories();
      }
      
      // Load products with progress
      if (cachedProducts.isValid && cachedProducts.products.length > 0) {
        this.products = cachedProducts.products;
        this.updateLoadingProgress(`${this.products.length} prodotti caricati dalla cache`);
      } else {
        this.updateLoadingProgress('Caricamento prodotti dal server...');
        await this.loadProducts();
        this.updateLoadingProgress(`${this.products.length} prodotti caricati`);
      }
      
      const loadTime = performance.now() - startTime;
      console.log(`Dati caricati in ${loadTime.toFixed(2)}ms`);
      
      // Track performance
      smartPrefetcher.trackInteraction('load_performance', {
        loadTime,
        productsCount: this.products.length,
        categoriesCount: this.categories.length,
        fromCache: cachedProducts.isValid
      });
      
    } catch (error) {
      console.error('Errore caricamento dati:', error);
      this.showError('Errore nel caricamento dei dati');
      showToast('Errore caricamento dati. Riprova.', 'error');
    }
  }

  setupDateSelector() {
    const dateSelector = safeQuerySelector('#dateSelector');
    const currentDateEl = safeQuerySelector('#currentDate');
    
    if (!dateSelector || !currentDateEl) return;
    
    dateSelector.value = formatDate(this.selectedDate);
    currentDateEl.textContent = `${getDayName(this.selectedDate)} ${formatDate(this.selectedDate)}`;
    
    safeAddEventListener(dateSelector, 'change', (e) => {
      this.selectedDate = new Date(e.target.value);
      currentDateEl.textContent = `${getDayName(this.selectedDate)} ${formatDate(this.selectedDate)}`;
      
      // Track date selection pattern
      smartPrefetcher.trackInteraction('date_selection', {
        date: e.target.value,
        dayOfWeek: this.selectedDate.getDay()
      });
      
      this.loadCurrentList();
    });
  }

  setupEventListeners() {
    const searchInput = safeQuerySelector('#searchInput');
    if (searchInput) {
      const debouncedSearch = debounce((e) => {
        this.searchTerm = e.target.value.toLowerCase();
        
        // Track search patterns
        if (this.searchTerm.length > 2) {
          smartPrefetcher.trackInteraction('search', { term: this.searchTerm });
        }
        
        this.resetPagination();
        this.filterAndRenderProducts();
      }, 200); // Reduced debounce for better responsiveness
      
      safeAddEventListener(searchInput, 'input', debouncedSearch);
    }

    // Optimized scroll handler
    const container = safeQuerySelector('#productsList');
    if (container) {
      const scrollHandler = debounce((e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target.scrollingElement || e.target;
        const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
        
        // Load more when 70% scrolled
        if (scrollPercentage > 0.7 && this.hasMoreProducts && !this.isLoading) {
          console.log('Loading more products...', {
            currentBatch: this.currentBatch,
            hasMore: this.hasMoreProducts,
            filteredCount: this.filteredProducts.length
          });
          this.loadMoreProducts();
        }
      }, 100);
      
      safeAddEventListener(container, 'scroll', scrollHandler, { passive: true });
    }

    const addExtraBtn = safeQuerySelector('#addExtraBtn');
    if (addExtraBtn) {
      safeAddEventListener(addExtraBtn, 'click', () => this.addExtra());
    }

    const extraName = safeQuerySelector('#extraName');
    if (extraName) {
      safeAddEventListener(extraName, 'keypress', (e) => {
        if (e.key === 'Enter') this.addExtra();
      });
    }

    const saveDraftBtn = safeQuerySelector('#saveDraftBtn');
    if (saveDraftBtn) {
      safeAddEventListener(saveDraftBtn, 'click', () => this.saveList(false));
    }

    const submitBtn = safeQuerySelector('#submitBtn');
    if (submitBtn) {
      safeAddEventListener(submitBtn, 'click', () => this.saveList(true));
    }

    const expandAllBtn = safeQuerySelector('#expandAllBtn');
    if (expandAllBtn) {
      safeAddEventListener(expandAllBtn, 'click', () => this.expandAllCategories());
    }

    const collapseAllBtn = safeQuerySelector('#collapseAllBtn');
    if (collapseAllBtn) {
      safeAddEventListener(collapseAllBtn, 'click', () => this.collapseAllCategories());
    }

    const deleteListBtn = safeQuerySelector('#deleteListBtn');
    if (deleteListBtn) {
      safeAddEventListener(deleteListBtn, 'click', () => this.deleteCurrentList());
    }
  }

  async loadCategories() {
    try {
      const categoriesSnap = await getDocs(collection(db, 'categories'));
      this.categories = categoriesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).filter(category => category.name && category.colorHex);
      
      // Cache categories
      setCachedCategories(this.categories);
      
      this.renderCategoryFilters();
      this.loadCollapsedState();
    } catch (error) {
      console.error('Errore caricamento categorie:', error);
      this.showError('Errore nel caricamento delle categorie');
      this.categories = [];
    }
  }

  async loadProducts() {
    try {
      const productsQuery = query(collection(db, 'products'), where('active', '==', true));
      const productsSnap = await getDocs(productsQuery);
      this.products = productsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).filter(product => product.name && product.categoryId)
        .sort((a, b) => a.name.localeCompare(b.name));
      
      // Cache products
      setCachedProducts(this.products);
      
    } catch (error) {
      console.error('Errore caricamento prodotti:', error);
      this.showError('Errore nel caricamento dei prodotti');
      this.products = [];
    }
  }

  resetPagination() {
    this.currentBatch = 0;
    this.renderedProducts = [];
    this.hasMoreProducts = true;
    this.isLoading = false;
  }
  
  filterAndRenderProducts() {
    // Filter products
    this.filteredProducts = this.products.filter(product => {
      const matchesSearch = !this.searchTerm || 
        product.name.toLowerCase().includes(this.searchTerm);
      const matchesCategory = !this.selectedCategory || 
        product.categoryId === this.selectedCategory;
      return matchesSearch && matchesCategory;
    });

    const container = document.getElementById('productsList');
    const loading = document.getElementById('loadingProducts');
    
    if (!container) return;
    
    loading.classList.add('hidden');
    container.classList.remove('hidden');
    
    // Render all filtered products at once
    this.renderAllProducts();
  }
  
  async renderAllProducts() {
    const container = document.getElementById('productsList');
    if (!container) return;
    
    // Clear container
    container.innerHTML = '';
    
    // Group all filtered products by category
    const groupedProducts = new Map();
    this.filteredProducts.forEach(product => {
      if (!groupedProducts.has(product.categoryId)) {
        groupedProducts.set(product.categoryId, []);
      }
      groupedProducts.get(product.categoryId).push(product);
    });

    // Sort categories alphabetically
    const sortedCategoryEntries = Array.from(groupedProducts.entries()).sort(([categoryIdA], [categoryIdB]) => {
      const categoryA = this.categories.find(c => c.id === categoryIdA);
      const categoryB = this.categories.find(c => c.id === categoryIdB);
      if (!categoryA || !categoryB) return 0;
      return categoryA.name.localeCompare(categoryB.name);
    });
    
    // Render each category section
    sortedCategoryEntries.forEach(([categoryId, categoryProducts]) => {
      const categorySection = this.createCategorySection(categoryId, categoryProducts);
      if (categorySection) {
        categorySection.setAttribute('data-category-id', categoryId);
        container.appendChild(categorySection);
      }
    });
  }
  
  async loadMoreProducts() {
    if (this.isLoading || !this.hasMoreProducts) return;
    
    this.isLoading = true;
    this.showLoadingIndicator();
    
    const batchSize = getAdaptiveBatchSize();
    const startIndex = this.currentBatch * batchSize;
    const endIndex = startIndex + batchSize;
    
    console.log('Loading batch:', { startIndex, endIndex, totalFiltered: this.filteredProducts.length });
    
    if (startIndex >= this.filteredProducts.length) {
      this.hasMoreProducts = false;
      this.hideLoadingIndicator();
      this.isLoading = false;
      console.log('No more products to load');
      return;
    }
    
    const batch = this.filteredProducts.slice(startIndex, endIndex);
    console.log('Batch products:', batch.length);
    
    this.currentBatch++;
    this.hasMoreProducts = endIndex < this.filteredProducts.length;
    
    await this.renderProductsBatch(batch, startIndex === 0);
    
    console.log('Batch rendered. HasMore:', this.hasMoreProducts, 'CurrentBatch:', this.currentBatch);
    
    this.hideLoadingIndicator();
    this.isLoading = false;
  }
  
  showLoadingIndicator() {
    if (this.loadingIndicator) return;
    
    const container = safeQuerySelector('#productsList');
    if (!container) return;
    
    this.loadingIndicator = document.createElement('div');
    this.loadingIndicator.className = 'loading-more';
    this.loadingIndicator.innerHTML = `
      <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid var(--border-color); border-top: 2px solid var(--accent-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-right: 0.5rem;"></div>
      Caricamento altri prodotti...
    `;
    
    container.appendChild(this.loadingIndicator);
  }
  
  hideLoadingIndicator() {
    if (this.loadingIndicator && this.loadingIndicator.parentNode) {
      this.loadingIndicator.remove();
      this.loadingIndicator = null;
    }
  }
  async loadCurrentList() {
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      
      const listDoc = await getDoc(doc(db, 'weeks', week, 'lists', day));
      
      if (listDoc.exists()) {
        this.currentList = listDoc.data();
      } else {
        this.currentList = { items: [], extras: [], status: {}, version: 0 };
      }
      
      this.renderProductsOptimized();
      this.renderExtras();
    } catch (error) {
      console.error('Errore caricamento lista:', error);
      this.currentList = { items: [], extras: [], status: {}, version: 0 };
    }
  }

  renderCategoryFilters() {
    const container = document.getElementById('categoryFilters');
    if (!container) return;
    
    container.innerHTML = '';
    
    const allBtn = document.createElement('button');
    allBtn.className = `btn btn-secondary ${!this.selectedCategory ? 'active' : ''}`;
    allBtn.textContent = 'Tutte';
    allBtn.addEventListener('click', () => {
      this.selectedCategory = '';
      this.filterAndRenderProducts();
      this.updateCategoryFilters();
    });
    container.appendChild(allBtn);
    
    const sortedCategories = [...this.categories].sort((a, b) => a.name.localeCompare(b.name));
    sortedCategories.forEach(category => {
      const btn = document.createElement('button');
      btn.className = `btn btn-secondary ${this.selectedCategory === category.id ? 'active' : ''}`;
      btn.textContent = category.name;
      btn.style.backgroundColor = this.selectedCategory === category.id ? category.colorHex : '';
      btn.style.color = this.selectedCategory === category.id ? getContrastColor(category.colorHex) : '';
      btn.addEventListener('click', () => {
        // Track category selection
        smartPrefetcher.trackInteraction('category_selection', {
          categoryId: category.id,
          categoryName: category.name
        });
        
        this.selectedCategory = category.id;
        this.filterAndRenderProducts();
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
        if (!category) return;
        const isActive = this.selectedCategory === category.id;
        btn.classList.toggle('active', isActive);
        btn.style.backgroundColor = isActive ? category.colorHex : '';
        btn.style.color = isActive ? getContrastColor(category.colorHex) : '';
      }
    });
  }

  async renderProductsOptimized() {
    const container = document.getElementById('productsList');
    const loading = document.getElementById('loadingProducts');
    
    if (!container) return;
    
    loading.classList.add('hidden');
    container.classList.remove('hidden');
    
    // Filter products first
    this.filteredProducts = this.products.filter(product => {
      const matchesSearch = !this.searchTerm || 
        product.name.toLowerCase().includes(this.searchTerm);
      const matchesCategory = !this.selectedCategory || 
        product.categoryId === this.selectedCategory;
      return matchesSearch && matchesCategory;
    });
    
    // Render all products
    await this.renderAllProducts();
  }
  
  async renderProductsBatch(products, isFirstBatch = false) {
    const container = safeQuerySelector('#productsList');
    if (!container) return;
    
    console.log('Rendering batch of', products.length, 'products');
    
    // Group products by category
    const groupedProducts = new Map();
    products.forEach(product => {
      if (!groupedProducts.has(product.categoryId)) {
        groupedProducts.set(product.categoryId, []);
      }
      groupedProducts.get(product.categoryId).push(product);
    });

    const sortedCategoryEntries = Array.from(groupedProducts.entries()).sort(([categoryIdA], [categoryIdB]) => {
      const categoryA = this.categories.find(c => c.id === categoryIdA);
      const categoryB = this.categories.find(c => c.id === categoryIdB);
      if (!categoryA || !categoryB) return 0;
      return categoryA.name.localeCompare(categoryB.name);
    });
    
    sortedCategoryEntries.forEach(([categoryId, categoryProducts]) => {
      // Check if category section already exists
      let categorySection = container.querySelector(`[data-category-id="${categoryId}"]`);
      
      if (!categorySection) {
        categorySection = this.createCategorySection(categoryId, categoryProducts);
        if (categorySection) {
          categorySection.setAttribute('data-category-id', categoryId);
          // Find correct position to insert category (alphabetically)
          const existingSections = Array.from(container.querySelectorAll('[data-category-id]'));
          const categoryName = this.categories.find(c => c.id === categoryId)?.name || '';
          
          let insertPosition = null;
          for (const section of existingSections) {
            const sectionCategoryId = section.getAttribute('data-category-id');
            const sectionCategoryName = this.categories.find(c => c.id === sectionCategoryId)?.name || '';
            if (categoryName.localeCompare(sectionCategoryName) < 0) {
              insertPosition = section;
              break;
            }
          }
          
          if (insertPosition) {
            container.insertBefore(categorySection, insertPosition);
          } else {
            container.appendChild(categorySection);
          }
        }
      } else {
        // Add products to existing category
        const productsGrid = categorySection.querySelector('.products-grid');
        if (productsGrid) {
          const productFragment = document.createDocumentFragment();
          categoryProducts.forEach(product => {
            const category = this.categories.find(c => c.id === categoryId);
            const productCard = this.createProductCard(product, category);
            productFragment.appendChild(productCard);
          });
          productsGrid.appendChild(productFragment);
        }
      }
    });
  }
  
  createCategorySection(categoryId, products) {
    const category = this.categories.find(c => c.id === categoryId);
    if (!category) return null;

    products.sort((a, b) => a.name.localeCompare(b.name));
    const isCollapsed = this.collapsedCategories.has(categoryId);
    
    const categorySection = document.createElement('div');
    categorySection.className = 'category-section compact';
    categorySection.style.background = `linear-gradient(135deg, ${category.colorHex}10 0%, transparent 100%)`;
    categorySection.style.border = `1px solid ${category.colorHex}30`;
    categorySection.style.borderRadius = '12px';
    categorySection.style.borderLeft = `4px solid ${category.colorHex}`;
    categorySection.style.overflow = 'hidden';
    
    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'category-header';
    categoryHeader.style.cssText = `
      color: ${category.colorHex};
      cursor: pointer;
      user-select: none;
      padding: 0.75rem 1rem;
      background: ${category.colorHex}08;
      border-bottom: ${isCollapsed ? 'none' : `1px solid ${category.colorHex}20`};
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    `;
    categoryHeader.innerHTML = `
      <div class="category-title">
        <span class="category-toggle-icon ${isCollapsed ? 'collapsed' : ''}">▼</span>
        <span>📂</span>
        <span style="font-weight: 600; font-size: 0.95rem;">${category.name}</span>
      </div>
      <span class="product-count">${products.length}</span>
    `;
    
    categoryHeader.addEventListener('click', () => {
      // Track category toggle
      smartPrefetcher.trackInteraction('category_toggle', {
        categoryId: category.id,
        action: this.collapsedCategories.has(categoryId) ? 'expand' : 'collapse'
      });
      
      this.toggleCategory(categoryId);
    });
    
    categorySection.appendChild(categoryHeader);

    const categoryContent = document.createElement('div');
    categoryContent.className = 'category-content';
    categoryContent.style.cssText = `
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      overflow: hidden;
      ${isCollapsed ? 'max-height: 0; opacity: 0; padding: 0;' : 'opacity: 1; padding: 0.5rem;'}
    `;
    
    const productsGrid = document.createElement('div');
    productsGrid.className = 'products-grid';

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
    
    this.saveCollapsedState();
    this.updateCategoryVisibility();
  }
  
  updateCategoryVisibility() {
    const categorySections = document.querySelectorAll('.category-section');
    categorySections.forEach(section => {
      const categoryId = section.getAttribute('data-category-id');
      if (categoryId) {
        const isCollapsed = this.collapsedCategories.has(categoryId);
        const content = section.querySelector('.category-content');
        const toggleIcon = section.querySelector('.category-toggle-icon');
        
        if (content && toggleIcon) {
          if (isCollapsed) {
            content.style.maxHeight = '0';
            content.style.opacity = '0';
            content.style.padding = '0';
            toggleIcon.classList.add('collapsed');
          } else {
            content.style.maxHeight = '2000px';
            content.style.opacity = '1';
            content.style.padding = '0.5rem';
            toggleIcon.classList.remove('collapsed');
          }
        }
      }
    });
  }

  expandAllCategories() {
    this.collapsedCategories.clear();
    this.saveCollapsedState();
    this.updateCategoryVisibility();
    showToast('Tutte le categorie espanse', 'success');
  }

  collapseAllCategories() {
    const categoryIds = [...new Set(this.products.map(p => p.categoryId))];
    this.collapsedCategories = new Set(categoryIds);
    this.saveCollapsedState();
    this.updateCategoryVisibility();
    showToast('Tutte le categorie chiuse', 'success');
  }

  loadCollapsedState() {
    try {
      const saved = localStorage.getItem('collapsedCategories');
      if (saved) {
        this.collapsedCategories = new Set(JSON.parse(saved));
      }
    } catch (error) {
      console.warn('Errore caricamento stato categorie:', error);
      this.collapsedCategories = new Set();
    }
  }

  saveCollapsedState() {
    try {
      localStorage.setItem('collapsedCategories', JSON.stringify([...this.collapsedCategories]));
    } catch (error) {
      console.warn('Errore salvataggio stato categorie:', error);
    }
  }

  createProductCard(product, category) {
    const existingItem = this.currentList.items.find(item => item.id === product.id);
    const quantity = existingItem ? existingItem.quantity : 0;

    const card = document.createElement('div');
    card.className = `product-card ${quantity > 0 ? 'has-quantity' : ''}`;
    card.style.willChange = 'transform, opacity'; // Optimize for animations
    
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

    // Add event listeners
    const qtyInput = card.querySelector('.qty-input');
    const qtyBtns = card.querySelectorAll('.qty-btn');
    
    qtyInput.addEventListener('change', (e) => {
      this.updateQuantity(product.id, parseInt(e.target.value) || 0);
    });
    
    qtyBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const action = btn.dataset.action;
        const currentQty = this.getCurrentQuantity(product.id);
        const newQty = action === 'increase' ? currentQty + 1 : Math.max(0, currentQty - 1);
        
        // Track quantity changes
        smartPrefetcher.trackInteraction('quantity_change', {
          productId: product.id,
          action,
          oldQuantity: currentQty,
          newQuantity: newQty
        });
        
        this.updateQuantity(product.id, newQty);
      });
    });

    return card;
  }
  
  getCurrentQuantity(productId) {
    const existingItem = this.currentList.items.find(item => item.id === productId);
    return existingItem ? existingItem.quantity : 0;
  }

  updateQuantity(productId, newQuantity) {
    if (!productId) return;
    
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
    
    this.updateProductCardQuantity(productId, newQuantity);
    
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      localStorage.setItem(`list-${week}-${day}`, JSON.stringify(this.currentList));
    } catch (error) {
      console.warn('Errore salvataggio locale:', error);
    }
  }
  
  updateProductCardQuantity(productId, newQuantity) {
    const qtyInput = document.querySelector(`.qty-input[data-product-id="${productId}"]`);
    if (qtyInput) {
      qtyInput.value = newQuantity;
      
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
    
    if (!nameInput || !qtyInput) return;
    
    if (!this.currentList) {
      this.currentList = { items: [], extras: [], status: {}, version: 0 };
    }
    
    if (!this.currentList.extras) {
      this.currentList.extras = [];
    }
    
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
    
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      localStorage.setItem(`list-${week}-${day}`, JSON.stringify(this.currentList));
    } catch (error) {
      console.warn('Errore salvataggio locale:', error);
    }
  }

  renderExtras() {
    const container = safeQuerySelector('#extrasList');
    if (!container) return;
    
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
      
      const removeBtn = extraDiv.querySelector('.remove-extra-btn');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => this.removeExtra(index));
      }
      
      container.appendChild(extraDiv);
    });
  }

  removeExtra(index) {
    if (!this.currentList || !this.currentList.extras) return;
    
    if (index < 0 || index >= this.currentList.extras.length) {
      showToast('Errore: indice non valido', 'error');
      return;
    }
    
    this.currentList.extras.splice(index, 1);
    this.renderExtras();
    
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      localStorage.setItem(`list-${week}-${day}`, JSON.stringify(this.currentList));
    } catch (error) {
      console.warn('Errore salvataggio locale:', error);
    }
  }

  async saveList(isSubmit = false) {
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      
      if (!this.currentList) {
        this.currentList = { items: [], extras: [], status: {}, version: 0 };
      }
      
      this.currentList.status.updatedAt = Timestamp.now();
      this.currentList.version = (this.currentList.version || 0) + 1;
      
      if (isSubmit) {
        const importantProducts = this.products.filter(p => p.important);
        const missingImportant = importantProducts.filter(ip => 
          !this.currentList.items.find(item => item.id === ip.id)
        );
        
        if (missingImportant.length > 0) {
          const missingNames = missingImportant.map(p => p.name).join(', ');
          const confirmMessage = `Non hai segnato i seguenti prodotti importanti:\n\n${missingNames}\n\nVuoi continuare comunque?`;
          
          if (!confirm(confirmMessage)) {
            document.getElementById('validationMessage').textContent = 
              `Attenzione: mancano i seguenti prodotti importanti: ${missingNames}`;
            document.getElementById('validationMessage').classList.remove('hidden');
            return;
          }
          
          document.getElementById('validationMessage').classList.add('hidden');
        }
        
        this.currentList.status.submittedAt = Timestamp.now();
      }
      
      await setDoc(doc(db, 'weeks', week, 'lists', day), this.currentList);
      
      try {
        localStorage.setItem(`list-${week}-${day}`, JSON.stringify(this.currentList));
      } catch (error) {
        console.warn('Errore salvataggio locale:', error);
      }
      
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

  async deleteCurrentList() {
    if (!confirm('Sei sicuro di voler eliminare la lista corrente? Questa azione non può essere annullata.')) {
      return;
    }
    
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      
      await deleteDoc(doc(db, 'weeks', week, 'lists', day));
      
      localStorage.removeItem(`list-${week}-${day}`);
      
      this.currentList = { items: [], extras: [], status: {}, version: 0 };
      
      this.renderProducts();
      this.renderExtras();
      
      showToast('Lista eliminata con successo', 'success');
    } catch (error) {
      console.error('Errore eliminazione lista:', error);
      showToast('Errore durante l\'eliminazione della lista', 'error');
    }
  }

  showError(message) {
    const errorEl = safeQuerySelector('#errorMessage');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
      setTimeout(() => errorEl.classList.add('hidden'), 5000);
    }
    showToast(message, 'error');
  }
}

window.listaManager = new ListaManager();