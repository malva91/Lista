import { db } from '../shared/firebase.js';
import { 
  collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { showToast, debounce, getContrastColor, generateUniqueId } from '../shared/utils.js';
import { safeQuerySelector, safeAddEventListener, validateInput, initMobileUtils, getCachedProducts, setCachedProducts, getCachedCategories, setCachedCategories, preloadCriticalData, initTheme } from '../shared/utils.js';

// Cache per migliorare le performance
const renderCache = new Map();
const productCache = new Map();
const categoryCache = new Map();

class CatalogoManager {
  constructor() {
    this.categories = [];
    this.products = [];
    this.filteredProducts = [];
    this.selectedCategory = '';
    this.searchTerm = '';
    this.editingCategory = null;
    this.editingProduct = null;
    this.editingProductInline = new Set(); // Track which products are being edited inline
    
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
    
    this.setupEventListeners();
    
    // Show loading immediately
    document.getElementById('loadingProducts').classList.remove('hidden');
    
    // Load data with optimized strategy
    await this.loadDataOptimized();
    
    // Render con throttling
    this.throttledRender();
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
        this.renderCategoriesList();
        this.renderProductCategorySelect();
      }
      
      if (cachedProducts.isValid && cachedProducts.products.length > 0) {
        this.products = cachedProducts.products;
        this.filterProductsOptimized();
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
      this.renderCategoryFilters();
      this.renderProducts();
    });
  }

  setupEventListeners() {
    // Category events
    const addCategoryBtn = safeQuerySelector('#addCategoryBtn');
    if (addCategoryBtn) {
      safeAddEventListener(addCategoryBtn, 'click', () => {
      this.addCategory();
      });
    }

    const updateCategoryBtn = safeQuerySelector('#updateCategoryBtn');
    if (updateCategoryBtn) {
      safeAddEventListener(updateCategoryBtn, 'click', () => {
      this.updateCategory();
      });
    }

    const cancelCategoryBtn = safeQuerySelector('#cancelCategoryBtn');
    if (cancelCategoryBtn) {
      safeAddEventListener(cancelCategoryBtn, 'click', () => {
      this.cancelCategoryEdit();
      });
    }

    // Product events
    const addProductBtn = safeQuerySelector('#addProductBtn');
    if (addProductBtn) {
      safeAddEventListener(addProductBtn, 'click', () => {
      this.addProduct();
      });
    }

    const updateProductBtn = safeQuerySelector('#updateProductBtn');
    if (updateProductBtn) {
      safeAddEventListener(updateProductBtn, 'click', () => {
      this.updateProduct();
      });
    }

    const cancelProductBtn = safeQuerySelector('#cancelProductBtn');
    if (cancelProductBtn) {
      safeAddEventListener(cancelProductBtn, 'click', () => {
      this.cancelProductEdit();
      });
    }

    // Search and filter
    const searchInput = safeQuerySelector('#searchInput');
    if (searchInput) {
      safeAddEventListener(searchInput, 'input', debounce((e) => {
      this.searchTerm = e.target.value.toLowerCase();
      this.filterProductsOptimized();
      }, 300));
    }

    // Import/Export
    const exportBtn = safeQuerySelector('#exportBtn');
    if (exportBtn) {
      safeAddEventListener(exportBtn, 'click', () => {
      this.exportData();
      });
    }

    const importFile = safeQuerySelector('#importFile');
    if (importFile) {
      safeAddEventListener(importFile, 'change', (e) => {
      this.importData(e.target.files[0]);
      });
    }
  }

  // Optimized filtering with caching
  filterProductsOptimized() {
    const cacheKey = `${this.searchTerm}-${this.selectedCategory}`;
    
    if (renderCache.has(cacheKey)) {
      this.filteredProducts = renderCache.get(cacheKey);
      this.throttledRender();
      return;
    }
    
    this.filteredProducts = this.products.filter(product => {
      const matchesSearch = !this.searchTerm || 
        product.name.toLowerCase().includes(this.searchTerm);
      const matchesCategory = !this.selectedCategory || 
        product.categoryId === this.selectedCategory;
      return matchesSearch && matchesCategory;
    }).sort((a, b) => a.name.localeCompare(b.name));
    
    // Cache result
    renderCache.set(cacheKey, this.filteredProducts);
    
    // Limit cache size
    if (renderCache.size > 50) {
      const firstKey = renderCache.keys().next().value;
      renderCache.delete(firstKey);
    }
    
    this.throttledRender();
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
      })).sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically
      
      // Validazione dei dati delle categorie
      const validCategories = newCategories.filter(category => {
        if (!category.name || !category.colorHex) {
          console.warn('Categoria con dati mancanti ignorata:', category);
          return false;
        }
        return true;
      });
      
      this.categories = validCategories;
      
      // Cache categories
      this.categories.forEach(category => {
        categoryCache.set(category.id, category);
      });
      
      // Update IndexedDB cache
      if (updateCache) {
        setCachedCategories(this.categories);
      }
      
      this.renderCategoriesList();
      this.renderProductCategorySelect();
    } catch (error) {
      console.error('Errore caricamento categorie:', error);
      this.showError('Errore nel caricamento delle categorie');
      // Fallback con array vuoto per evitare crash
      this.categories = [];
    }
  }

  async loadProducts(updateCache = false) {
    try {
      // Use cached data if available and not updating
      if (!updateCache && this.products.length > 0) {
        document.getElementById('loadingProducts').classList.add('hidden');
        return;
      }
      
      const productsSnap = await getDocs(collection(db, 'products'));
      const newProducts = productsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically
      
      // Validazione dei dati dei prodotti
      const validProducts = newProducts.filter(product => {
        if (!product.name || !product.categoryId) {
          console.warn('Prodotto con dati mancanti ignorato:', product);
          return false;
        }
        return true;
      });
      
      this.products = validProducts;
      
      // Cache products
      this.products.forEach(product => {
        productCache.set(product.id, product);
      });
      
      // Update IndexedDB cache
      if (updateCache) {
        setCachedProducts(this.products);
      }
      
      this.filterProductsOptimized();
      document.getElementById('loadingProducts').classList.add('hidden');
    } catch (error) {
      console.error('Errore caricamento prodotti:', error);
      this.showError('Errore nel caricamento dei prodotti');
      // Fallback con array vuoto per evitare crash
      this.products = [];
      document.getElementById('loadingProducts').classList.add('hidden');
    }
  }

  // Optimized rendering with virtual scrolling concept
  renderCategoriesList() {
    const container = safeQuerySelector('#categoriesList');
    if (!container) {
      console.error('Container categoriesList non trovato');
      return;
    }
    
    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Sort categories alphabetically before rendering
    const sortedCategories = [...this.categories].sort((a, b) => a.name.localeCompare(b.name));

    // Batch DOM operations
    const batchSize = 10;
    let currentBatch = 0;
    
    const renderBatch = () => {
      const start = currentBatch * batchSize;
      const end = Math.min(start + batchSize, sortedCategories.length);
      
      for (let i = start; i < end; i++) {
        const category = sortedCategories[i];
        if (!category.id || !category.name || !category.colorHex) {
          console.warn('Categoria con dati mancanti saltata:', category);
          continue;
        }
        
        const categoryDiv = this.createCategoryElement(category);
        fragment.appendChild(categoryDiv);
      }
      
      currentBatch++;
      
      if (end < sortedCategories.length) {
        // Continue with next batch
        requestAnimationFrame(renderBatch);
      } else {
        // Finished rendering all categories
        container.innerHTML = '';
        container.appendChild(fragment);
      }
    };
    
    renderBatch();
  }
  
  createCategoryElement(category) {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'category-item';
    categoryDiv.style.cssText = `
      background: linear-gradient(135deg, ${category.colorHex}10 0%, transparent 100%);
      border: 1px solid ${category.colorHex}30;
      border-radius: 8px;
      padding: 1rem;
      border-left: 4px solid ${category.colorHex};
      flex: 0 1 calc(50% - var(--spacing-sm));
      min-width: 280px;
    `;
    
    categoryDiv.innerHTML = `
      <div class="category-item-content">
        <div class="category-info">
          <div class="category-color-dot" style="background: ${category.colorHex};"></div>
          <span class="category-name">${category.name}</span>
        </div>
        <div class="category-item-actions">
          <button class="btn-icon btn-edit" title="Modifica categoria">
            <span>✏️</span>
          </button>
          <button class="btn-icon btn-delete" title="Elimina categoria">
            <span>🗑️</span>
          </button>
        </div>
      </div>
    `;
    
    // Add event listeners directly to avoid inline onclick
    const editBtn = categoryDiv.querySelector('.btn-edit');
    const deleteBtn = categoryDiv.querySelector('.btn-delete');
    
    if (editBtn) {
      editBtn.addEventListener('click', () => this.editCategory(category.id));
    }
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.deleteCategory(category.id));
    }
    
    return categoryDiv;
  }

  // Original renderCategoriesList method (keeping for reference)
  renderCategoriesListOriginal() {
    sortedCategories.forEach(category => {
      if (!category.id || !category.name || !category.colorHex) {
        console.warn('Categoria con dati mancanti saltata:', category);
        return;
      }
      
      const categoryDiv = document.createElement('div');
      categoryDiv.className = 'category-item';
      categoryDiv.style.cssText = `
        background: linear-gradient(135deg, ${category.colorHex}10 0%, transparent 100%);
        border: 1px solid ${category.colorHex}30;
        border-radius: 8px;
        padding: 1rem;
        border-left: 4px solid ${category.colorHex};
        flex: 0 1 calc(50% - var(--spacing-sm));
        min-width: 280px;
      `;
      
      categoryDiv.innerHTML = `
        <div class="category-item-content">
          <div class="category-info">
            <div class="category-color-dot" style="background: ${category.colorHex};"></div>
            <span class="category-name">${category.name}</span>
          </div>
          <div class="category-item-actions">
            <button class="btn-icon btn-edit" title="Modifica categoria">
              <span>✏️</span>
            </button>
            <button class="btn-icon btn-delete" title="Elimina categoria">
              <span>🗑️</span>
            </button>
          </div>
        </div>
      `;
      
      // Add event listeners directly to avoid inline onclick
      const editBtn = categoryDiv.querySelector('.btn-edit');
      const deleteBtn = categoryDiv.querySelector('.btn-delete');
      
      if (editBtn) {
        editBtn.addEventListener('click', () => this.editCategory(category.id));
      }
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => this.deleteCategory(category.id));
      }
      
      fragment.appendChild(categoryDiv);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
  }

  renderProductCategorySelect() {
    const select = safeQuerySelector('#productCategory');
    if (!select) {
      console.error('Select productCategory non trovato');
      return;
    }
    
    select.innerHTML = '<option value="">Seleziona categoria</option>';

    // Sort categories alphabetically in select
    const sortedCategories = [...this.categories].sort((a, b) => a.name.localeCompare(b.name));
    sortedCategories.forEach(category => {
      if (!category.id || !category.name) {
        console.warn('Categoria con dati mancanti saltata nel select:', category);
        return;
      }
      
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      select.appendChild(option);
    });
  }

  renderCategoryFilters() {
    const container = safeQuerySelector('#categoryFilters');
    if (!container) {
      console.error('Container categoryFilters non trovato');
      return;
    }
    
    const allBtn = document.createElement('button');
    allBtn.className = `btn btn-secondary ${!this.selectedCategory ? 'active' : ''}`;
    allBtn.textContent = 'Tutti';
    allBtn.addEventListener('click', () => {
      this.selectedCategory = '';
      this.filterProductsOptimized();
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
        this.filterProductsOptimized();
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
        btn.style.backgroundColor = '';
        btn.style.color = '';
      } else {
        const category = sortedCategories[index - 1];
        const isActive = this.selectedCategory === category.id;
        btn.classList.toggle('active', isActive);
        btn.style.backgroundColor = isActive ? category.colorHex : '';
        btn.style.color = isActive ? getContrastColor(category.colorHex) : '';
      }
    });
  }

  // Optimized product rendering with virtual scrolling
  renderProducts() {
    const container = safeQuerySelector('#productsList');
    if (!container) {
      console.error('Container productsList non trovato');
      return;
    }
    
    if (this.filteredProducts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <h3>Nessun prodotto trovato</h3>
          <p>Prova a modificare i filtri di ricerca o aggiungi un nuovo prodotto</p>
        </div>
      `;
      return;
    }

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Raggruppa per categoria usando Map per migliori performance
    const groupedProducts = new Map();
    this.filteredProducts.forEach(product => {
      if (!groupedProducts.has(product.categoryId)) {
        groupedProducts.set(product.categoryId, []);
      }
      groupedProducts.get(product.categoryId).push(product);
    });

    // Sort categories alphabetically
    const sortedCategoryEntries = Array.from(groupedProducts.entries()).sort(([categoryIdA], [categoryIdB]) => {
      // Use cache for better performance
      const categoryA = categoryCache.get(categoryIdA) || this.categories.find(c => c.id === categoryIdA);
      const categoryB = categoryCache.get(categoryIdB) || this.categories.find(c => c.id === categoryIdB);
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
      }
    };
    
    renderCategoryBatch();
  }
  
  createCategorySection(categoryId, products) {
    const category = categoryCache.get(categoryId) || this.categories.find(c => c.id === categoryId);
    if (!category) {
      console.warn('Categoria non trovata per ID:', categoryId);
      return null;
    }

    // Sort products within category alphabetically
    products.sort((a, b) => a.name.localeCompare(b.name));
    
    const categorySection = document.createElement('div');
    categorySection.className = 'category-section';
    categorySection.style.cssText = `
      background: linear-gradient(135deg, ${category.colorHex}05 0%, transparent 100%);
      border: 1px solid ${category.colorHex}20;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    `;
    
    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'category-header';
    categoryHeader.innerHTML = `
      <div class="category-title">
        <div class="category-color-indicator" style="background: ${category.colorHex};"></div>
        <h3 style="color: ${category.colorHex}; margin: 0;">📂 ${category.name}</h3>
        <span class="product-count">${products.length} prodott${products.length === 1 ? 'o' : 'i'}</span>
      </div>
      <div class="category-actions">
        <button class="btn-icon btn-secondary" title="Modifica categoria">
          <span>⚙️</span>
        </button>
      </div>
    `;
    
    // Add event listener for category edit
    const editCategoryBtn = categoryHeader.querySelector('.btn-secondary');
    if (editCategoryBtn) {
      editCategoryBtn.addEventListener('click', () => this.editCategory(categoryId));
    }
    
    const productsGrid = document.createElement('div');
    productsGrid.className = 'products-grid';
    
    products.forEach(product => {
      const productElement = this.createProductElement(product, category);
      productsGrid.appendChild(productElement);
    });
    
    categorySection.appendChild(categoryHeader);
    categorySection.appendChild(productsGrid);
    
    return categorySection;
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
      categorySection.className = 'category-section';
      categorySection.style.cssText = `
        background: linear-gradient(135deg, ${category.colorHex}05 0%, transparent 100%);
        border: 1px solid ${category.colorHex}20;
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 2rem;
      `;
      
      const categoryHeader = document.createElement('div');
      categoryHeader.className = 'category-header';
      categoryHeader.innerHTML = `
        <div class="category-title">
          <div class="category-color-indicator" style="background: ${category.colorHex};"></div>
          <h3 style="color: ${category.colorHex}; margin: 0;">📂 ${category.name}</h3>
          <span class="product-count">${products.length} prodott${products.length === 1 ? 'o' : 'i'}</span>
        </div>
        <div class="category-actions">
          <button class="btn-icon btn-secondary" title="Modifica categoria">
            <span>⚙️</span>
          </button>
        </div>
      `;
      
      // Add event listener for category edit
      const editCategoryBtn = categoryHeader.querySelector('.btn-secondary');
      if (editCategoryBtn) {
        editCategoryBtn.addEventListener('click', () => this.editCategory(categoryId));
      }
      
      const productsGrid = document.createElement('div');
      productsGrid.className = 'products-grid';
      
      products.forEach(product => {
        const productElement = this.createProductElement(product, category);
        productsGrid.appendChild(productElement);
      });
      
      categorySection.appendChild(categoryHeader);
      categorySection.appendChild(productsGrid);
      fragment.appendChild(categorySection);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
  }

  createProductElement(product, category) {
    const isEditing = this.editingProductInline.has(product.id);
    const backgroundColor = `${category.colorHex}08`;
    
    const productDiv = document.createElement('div');
    productDiv.className = 'product-card';
    productDiv.style.cssText = `
      background: linear-gradient(135deg, ${backgroundColor} 0%, transparent 100%);
      border-left: 3px solid ${category.colorHex};
      box-shadow: 0 2px 8px ${category.colorHex}15;
    `;
    
    if (isEditing) {
      this.renderEditingProduct(productDiv, product, category);
    } else {
      this.renderViewProduct(productDiv, product, category);
    }
    
    return productDiv;
  }

  renderViewProduct(productDiv, product, category) {
    productDiv.innerHTML = `
      <div class="product-header">
        <div style="flex: 1;">
          <div class="product-name">
            ${product.name}
            ${product.important ? '<span class="important-badge">Importante</span>' : ''}
            ${!product.active ? '<span class="important-badge" style="background: var(--text-muted);">Inattivo</span>' : ''}
          </div>
          <div class="product-category" style="background-color: ${category.colorHex}20; color: ${category.colorHex}; border: 1px solid ${category.colorHex};">
            ${category.name}
          </div>
        </div>
        <div class="product-actions">
          <button class="btn-icon btn-edit" title="Modifica">
            <span>✏️</span>
          </button>
          <button class="btn-icon ${product.active ? 'btn-warning' : 'btn-success'}" 
                  title="${product.active ? 'Disattiva' : 'Attiva'}">
            <span>${product.active ? '👁️' : '👁️‍🗨️'}</span>
          </button>
          <button class="btn-icon btn-delete" title="Elimina">
            <span>🗑️</span>
          </button>
        </div>
      </div>
    `;
    
    // Add event listeners
    const editBtn = productDiv.querySelector('.btn-edit');
    const toggleBtn = productDiv.querySelector('.btn-warning, .btn-success');
    const deleteBtn = productDiv.querySelector('.btn-delete');
    
    if (editBtn) {
      editBtn.addEventListener('click', () => this.startInlineEdit(product.id));
    }
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleProductActive(product.id));
    }
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.deleteProduct(product.id));
    }
  }

  renderEditingProduct(productDiv, product, category) {
    const categoryOptions = this.categories.map(cat => 
      `<option value="${cat.id}" ${cat.id === product.categoryId ? 'selected' : ''}>${cat.name}</option>`
    ).join('');
    
    productDiv.innerHTML = `
      <div class="product-header editing">
        <div style="flex: 1;">
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <input type="text" id="edit-name-${product.id}" class="form-input" 
                   value="${product.name}" placeholder="Nome prodotto" style="font-weight: 600;">
          </div>
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <select id="edit-category-${product.id}" class="form-select" style="font-size: 0.875rem;">
              ${categoryOptions}
            </select>
          </div>
          <div class="flex" style="gap: 1rem; margin-bottom: 0.5rem;">
            <label class="flex" style="align-items: center; font-size: 0.875rem;">
              <input type="checkbox" id="edit-important-${product.id}" 
                     ${product.important ? 'checked' : ''} style="margin-right: 0.5rem;">
              Importante
            </label>
            <label class="flex" style="align-items: center; font-size: 0.875rem;">
              <input type="checkbox" id="edit-active-${product.id}" 
                     ${product.active ? 'checked' : ''} style="margin-right: 0.5rem;">
              Attivo
            </label>
          </div>
        </div>
        <div class="product-actions">
          <button class="btn-icon btn-success" title="Salva">
            <span>💾</span>
          </button>
          <button class="btn-icon btn-secondary" title="Annulla">
            <span>❌</span>
          </button>
        </div>
      </div>
    `;
    
    // Add event listeners
    const saveBtn = productDiv.querySelector('.btn-success');
    const cancelBtn = productDiv.querySelector('.btn-secondary');
    
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveInlineEdit(product.id));
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.cancelInlineEdit(product.id));
    }
  }

  startInlineEdit(productId) {
    this.editingProductInline.add(productId);
    this.throttledRender();
  }

  cancelInlineEdit(productId) {
    this.editingProductInline.delete(productId);
    this.throttledRender();
  }

  async saveInlineEdit(productId) {
    const nameInput = document.getElementById(`edit-name-${productId}`);
    const categorySelect = document.getElementById(`edit-category-${productId}`);
    const importantInput = document.getElementById(`edit-important-${productId}`);
    const activeInput = document.getElementById(`edit-active-${productId}`);

    if (!nameInput || !categorySelect || !importantInput || !activeInput) {
      showToast('Errore: elementi form non trovati', 'error');
      return;
    }

    // Validazione
    const nameValidation = validateInput(nameInput.value, 'text', { min: 2, max: 100, required: true });
    if (!nameValidation.valid) {
      showToast(nameValidation.error, 'error');
      return;
    }

    if (!categorySelect.value) {
      showToast('Seleziona una categoria', 'error');
      return;
    }

    // Verifica che la categoria esista
    const categoryExists = this.categories.find(c => c.id === categorySelect.value);
    if (!categoryExists) {
      showToast('La categoria selezionata non è valida', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'products', productId), {
        name: nameValidation.value,
        categoryId: categorySelect.value,
        important: importantInput.checked,
        active: activeInput.checked
      });

      this.editingProductInline.delete(productId);
      
      // Clear cache
      renderCache.clear();
      productCache.delete(productId);
      
      await this.loadProducts();
      showToast('Prodotto aggiornato con successo!', 'success');
    } catch (error) {
      console.error('Errore aggiornamento prodotto:', error);
      showToast('Errore nell\'aggiornamento del prodotto', 'error');
    }
  }

  async addCategory() {
    const nameInput = safeQuerySelector('#categoryName');
    const colorInput = safeQuerySelector('#categoryColor');
    
    if (!nameInput || !colorInput) {
      showToast('Elementi form categoria non trovati', 'error');
      return;
    }

    // Validazione con utility
    const nameValidation = validateInput(nameInput.value, 'text', { min: 2, max: 50, required: true });
    if (!nameValidation.valid) {
      showToast(nameValidation.error, 'error');
      return;
    }
    
    const colorValidation = validateInput(colorInput.value, 'text', { 
      required: true, 
      pattern: /^#[0-9A-F]{6}$/i 
    });
    if (!colorValidation.valid) {
      showToast('Seleziona un colore valido', 'error');
      return;
    }

    const name = nameValidation.value;
    const colorHex = colorValidation.value;

    try {
      // Genera ID leggibile
      let categoryId;
      try {
        categoryId = await generateUniqueId('categories', name, db);
      } catch (error) {
        console.warn('Errore generazione ID, usando fallback:', error);
        categoryId = `category-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      }
      
      await setDoc(doc(db, 'categories', categoryId), {
        name,
        colorHex
      });

      nameInput.value = '';
      colorInput.value = '#3b82f6';
      
      // Clear cache
      renderCache.clear();
      categoryCache.clear();
      
      await this.loadCategories();
      this.renderCategoryFilters();
      showToast(`Categoria "${name}" aggiunta con ID: ${categoryId}`, 'success');
    } catch (error) {
      console.error('Errore aggiunta categoria:', error);
      showToast('Errore nell\'aggiunta della categoria', 'error');
    }
  }

  async updateCategory() {
    if (!this.editingCategory) return;

    const name = document.getElementById('categoryName').value.trim();
    const colorHex = document.getElementById('categoryColor').value;

    if (!name || name.length < 2) {
      showToast('Inserisci il nome della categoria', 'error');
      return;
    }
    
    if (!colorHex || !/^#[0-9A-F]{6}$/i.test(colorHex)) {
      showToast('Seleziona un colore valido', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'categories', this.editingCategory), {
        name,
        colorHex
      });

      this.cancelCategoryEdit();
      
      // Clear cache
      renderCache.clear();
      categoryCache.clear();
      
      await this.loadCategories();
      this.renderCategoryFilters();
      this.throttledRender();
      showToast('Categoria aggiornata con successo!', 'success');
    } catch (error) {
      console.error('Errore aggiornamento categoria:', error);
      showToast('Errore nell\'aggiornamento della categoria', 'error');
    }
  }

  editCategory(categoryId) {
    const category = this.categories.find(c => c.id === categoryId);
    if (!category) return;

    this.editingCategory = categoryId;
    document.getElementById('categoryName').value = category.name;
    document.getElementById('categoryColor').value = category.colorHex;

    document.getElementById('addCategoryBtn').classList.add('hidden');
    document.getElementById('updateCategoryBtn').classList.remove('hidden');
    document.getElementById('cancelCategoryBtn').classList.remove('hidden');
  }

  cancelCategoryEdit() {
    this.editingCategory = null;
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryColor').value = '#3b82f6';

    document.getElementById('addCategoryBtn').classList.remove('hidden');
    document.getElementById('updateCategoryBtn').classList.add('hidden');
    document.getElementById('cancelCategoryBtn').classList.add('hidden');
  }

  async deleteCategory(categoryId) {
    // Miglioramento UX per mobile
    const confirmMessage = 'Sei sicuro di voler eliminare questa categoria?\n\nI prodotti associati potrebbero non funzionare correttamente.';
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'categories', categoryId));
      
      // Clear cache
      renderCache.clear();
      categoryCache.delete(categoryId);
      
      await this.loadCategories();
      this.renderCategoryFilters();
      this.throttledRender();
      showToast('Categoria eliminata', 'success');
    } catch (error) {
      console.error('Errore eliminazione categoria:', error);
      showToast('Errore nell\'eliminazione della categoria', 'error');
    }
  }

  async deleteProduct(productId) {
    // Miglioramento UX per mobile
    const confirmMessage = 'Sei sicuro di voler eliminare questo prodotto?\n\nL\'azione non può essere annullata.';
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'products', productId));
      
      // Clear cache
      renderCache.clear();
      productCache.delete(productId);
      
      await this.loadProducts();
      showToast('Prodotto eliminato', 'success');
    } catch (error) {
      console.error('Errore eliminazione prodotto:', error);
      showToast('Errore nell\'eliminazione del prodotto', 'error');
    }
  }

  async addProduct() {
    const nameInput = safeQuerySelector('#productName');
    const categorySelect = safeQuerySelector('#productCategory');
    const importantInput = safeQuerySelector('#productImportant');
    const activeInput = safeQuerySelector('#productActive');
    
    if (!nameInput || !categorySelect || !importantInput || !activeInput) {
      showToast('Elementi form prodotto non trovati', 'error');
      return;
    }

    // Validazione con utility
    const nameValidation = validateInput(nameInput.value, 'text', { min: 2, max: 100, required: true });
    if (!nameValidation.valid) {
      showToast(nameValidation.error, 'error');
      return;
    }
    
    if (!categorySelect.value) {
      showToast('Seleziona una categoria', 'error');
      return;
    }
    
    const name = nameValidation.value;
    const categoryId = categorySelect.value;
    const important = importantInput.checked;
    const active = activeInput.checked;
    
    // Verifica che la categoria esista
    const categoryExists = this.categories.find(c => c.id === categoryId);
    if (!categoryExists) {
      showToast('La categoria selezionata non è valida', 'error');
      return;
    }

    try {
      // Genera ID leggibile
      let productId;
      try {
        productId = await generateUniqueId('products', name, db);
      } catch (error) {
        console.warn('Errore generazione ID, usando fallback:', error);
        productId = `product-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      }
      
      await setDoc(doc(db, 'products', productId), {
        name,
        categoryId,
        important,
        active
      });

      this.clearProductForm();
      
      // Clear cache
      renderCache.clear();
      
      await this.loadProducts();
      showToast(`Prodotto "${name}" aggiunto con ID: ${productId}`, 'success');
    } catch (error) {
      console.error('Errore aggiunta prodotto:', error);
      showToast('Errore nell\'aggiunta del prodotto', 'error');
    }
  }

  async updateProduct() {
    if (!this.editingProduct) return;

    const name = document.getElementById('productName').value.trim();
    const categoryId = document.getElementById('productCategory').value;
    const important = document.getElementById('productImportant').checked;
    const active = document.getElementById('productActive').checked;

    if (!name || name.length < 2) {
      showToast('Inserisci un nome prodotto valido (almeno 2 caratteri)', 'error');
      return;
    }
    
    if (!categoryId) {
      showToast('Inserisci nome prodotto e seleziona categoria', 'error');
      return;
    }
    
    // Verifica che la categoria esista
    const categoryExists = this.categories.find(c => c.id === categoryId);
    if (!categoryExists) {
      showToast('La categoria selezionata non è valida', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'products', this.editingProduct), {
        name,
        categoryId,
        important,
        active
      });

      this.cancelProductEdit();
      
      // Clear cache
      renderCache.clear();
      productCache.delete(this.editingProduct);
      
      await this.loadProducts();
      showToast('Prodotto aggiornato con successo!', 'success');
    } catch (error) {
      console.error('Errore aggiornamento prodotto:', error);
      showToast('Errore nell\'aggiornamento del prodotto', 'error');
    }
  }

  editProduct(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    this.editingProduct = productId;
    document.getElementById('productName').value = product.name;
    document.getElementById('productCategory').value = product.categoryId;
    document.getElementById('productImportant').checked = product.important;
    document.getElementById('productActive').checked = product.active;

    document.getElementById('addProductBtn').classList.add('hidden');
    document.getElementById('updateProductBtn').classList.remove('hidden');
    document.getElementById('cancelProductBtn').classList.remove('hidden');
  }

  cancelProductEdit() {
    this.editingProduct = null;
    this.clearProductForm();

    document.getElementById('addProductBtn').classList.remove('hidden');
    document.getElementById('updateProductBtn').classList.add('hidden');
    document.getElementById('cancelProductBtn').classList.add('hidden');
  }

  clearProductForm() {
    const nameInput = safeQuerySelector('#productName');
    const categorySelect = safeQuerySelector('#productCategory');
    const importantInput = safeQuerySelector('#productImportant');
    const activeInput = safeQuerySelector('#productActive');
    
    if (nameInput) nameInput.value = '';
    if (categorySelect) categorySelect.value = '';
    if (importantInput) importantInput.checked = false;
    if (activeInput) activeInput.checked = true;
  }

  async toggleProductActive(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    try {
      await updateDoc(doc(db, 'products', productId), {
        active: !product.active
      });

      // Clear cache
      renderCache.clear();
      productCache.delete(productId);
      
      await this.loadProducts();
      const action = product.active ? 'disattivato' : 'attivato';
      showToast(`Prodotto ${action}`, 'success');
    } catch (error) {
      console.error('Errore aggiornamento stato prodotto:', error);
      showToast('Errore nell\'aggiornamento del prodotto', 'error');
    }
  }

  async markCategoryComplete(categoryId) {
    // Metodo per completare tutti i prodotti di una categoria (usato nel magazzino)
    // Questo metodo è chiamato dal magazzino ma definito qui per consistenza
    console.log('markCategoryComplete chiamato per categoria:', categoryId);
  }

  exportData() {
    const data = {
      categories: this.categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        colorHex: cat.colorHex
      })),
      products: this.products.map(prod => ({
        id: prod.id,
        name: prod.name,
        categoryId: prod.categoryId,
        important: prod.important,
        active: prod.active
      }))
    };

    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `catalogo-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    showToast('Dati esportati con successo!', 'success');
  }

  async importData(file) {
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.json')) {
      showToast('Seleziona un file JSON valido', 'error');
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast('File troppo grande (max 5MB)', 'error');
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.categories || !data.products) {
        throw new Error('Formato file non valido');
      }
      
      // Validate data structure
      if (!Array.isArray(data.categories) || !Array.isArray(data.products)) {
        throw new Error('Struttura dati non valida');
      }

      // Importa categorie
      for (const category of data.categories) {
        if (!category.id || !category.name || !category.colorHex) {
          console.warn('Categoria con dati mancanti saltata:', category);
          continue;
        }
        await setDoc(doc(db, 'categories', category.id), {
          name: category.name,
          colorHex: category.colorHex
        });
      }

      // Importa prodotti
      for (const product of data.products) {
        if (!product.id || !product.name || !product.categoryId) {
          console.warn('Prodotto con dati mancanti saltato:', product);
          continue;
        }
        await setDoc(doc(db, 'products', product.id), {
          name: product.name,
          categoryId: product.categoryId,
          important: product.important || false,
          active: product.active !== undefined ? product.active : true
        });
      }

      // Clear all caches
      renderCache.clear();
      productCache.clear();
      categoryCache.clear();
      
      await this.loadCategories();
      await this.loadProducts();
      this.renderCategoryFilters();
      
      showToast('Dati importati con successo!', 'success');
    } catch (error) {
      console.error('Errore importazione:', error);
      if (error.message.includes('JSON')) {
        showToast('File JSON non valido', 'error');
      } else {
        showToast('Errore nell\'importazione del file', 'error');
      }
    }

    // Reset input file
    const importFile = safeQuerySelector('#importFile');
    if (importFile) {
      importFile.value = '';
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
    console.error('Catalogo Error:', message);
  }

  showSuccess(message) {
    const successEl = safeQuerySelector('#successMessage');
    if (successEl) {
      successEl.textContent = message;
      successEl.classList.remove('hidden');
      setTimeout(() => successEl.classList.add('hidden'), 3000);
    }
    // Fallback con toast se elemento non trovato
    showToast(message, 'success');
  }
  
  // Cleanup method
  destroy() {
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }
    
    // Clear all caches
    renderCache.clear();
    productCache.clear();
    categoryCache.clear();
  }
}

// Handle orientation changes
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    if (window.catalogoManager) {
      window.catalogoManager.throttledRender();
      window.catalogoManager.renderCategoriesList();
    }
  }, 100);
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (window.catalogoManager) {
    window.catalogoManager.destroy();
  }
});

// Inizializza l'applicazione
window.catalogoManager = new CatalogoManager();