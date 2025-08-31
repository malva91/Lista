import { db } from '../shared/firebase.js?v=1.2.0';
import {
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, addDoc, updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { generateUniqueId, showToast, debounce, getContrastColor } from '../shared/utils.js?v=1.2.0';
import {
  safeQuerySelector, safeAddEventListener, validateInput, initMobileUtils, initTheme, initHamburgerMenu,
  getAdaptiveBatchSize, scheduleRender, globalBatchProcessor, smartPrefetcher,
  preloadCriticalData, initEnhancedIntersectionObserver, createScrollHandler
} from '../shared/utils.js?v=1.2.0';
import { productsLoader } from '../shared/products-loader.js?v=1.2.0';

class CatalogoManager {
  constructor() {
    this.categories = [];
    this.products = [];
    this.filteredProducts = [];
    this.renderedProducts = [];
    this.currentBatch = 0;
    this.isLoading = false;
    this.hasMoreProducts = true;
    this.selectedCategory = '';
    this.searchTerm = '';
    this.collapsedCategories = new Set();
    this.editingCategory = null;
    this.editingProduct = null;
    this.intersectionObserver = null;
    this.loadingIndicator = null;

    this.init();
  }

  async init() {
    initMobileUtils();
    initTheme();
    initHamburgerMenu();

    // Initialize enhanced intersection observer
    this.intersectionObserver = initEnhancedIntersectionObserver();

    // Preload critical data
    preloadCriticalData();

    this.setupEventListeners();

    this.showLoadingState();

    await this.loadDataOptimized();
    this.filterAndRenderProducts();
  }

  showLoadingState() {
    const loadingEl = document.getElementById('loadingProducts');
    if (loadingEl) {
      loadingEl.classList.remove('hidden');
      loadingEl.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid var(--border-color); border-top: 4px solid var(--accent-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
          <div id="loadingText">Caricamento catalogo...</div>
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
      this.updateLoadingProgress('Caricamento catalogo prodotti...');
      
      // Carica prodotti e categorie dal JSON
      const { products, categories } = await productsLoader.loadProducts();
      
      this.products = products;
      this.categories = categories;
      
      this.renderCategoriesList();
      this.renderCategoryFilters();
      this.renderProductCategorySelect();
      this.loadCollapsedState();
      
      this.updateLoadingProgress(`${this.products.length} prodotti caricati dal catalogo`);

      const loadTime = performance.now() - startTime;
      console.log(`Catalogo caricato in ${loadTime.toFixed(2)}ms`);

      // Aggiorna statistiche
      this.updateStats();
    } catch (error) {
      console.error('Errore caricamento dati:', error);
      this.showError(`Errore nel caricamento del catalogo: ${error.message}`);
    }
  }

  updateStats() {
    const stats = productsLoader.getStats();
    
    const totalProductsEl = document.getElementById('totalProducts');
    const totalCategoriesEl = document.getElementById('totalCategories');
    const activeProductsEl = document.getElementById('activeProducts');
    const importantProductsEl = document.getElementById('importantProducts');
    
    if (totalProductsEl) totalProductsEl.textContent = stats.totalProducts;
    if (totalCategoriesEl) totalCategoriesEl.textContent = stats.visibleCategories;
    if (activeProductsEl) activeProductsEl.textContent = stats.activeProducts;
    if (importantProductsEl) importantProductsEl.textContent = stats.importantProducts;
  }

  setupEventListeners() {
    // Category management
    // Le operazioni di gestione ora puntano al JSON
    console.log('📄 Gestione catalogo tramite prodotti.json');

    // Search and filters
    const searchInput = safeQuerySelector('#searchInput');
    if (searchInput) {
      const debouncedSearch = debounce((e) => {
        this.searchTerm = e.target.value.toLowerCase();

        // Track search patterns
        if (this.searchTerm.length > 2) {
          smartPrefetcher.trackInteraction('catalog_search', { term: this.searchTerm });
        }

        this.resetPagination();
        this.filterAndRenderProducts();
      }, 200);

      safeAddEventListener(searchInput, 'input', debouncedSearch);
    }

    // Optimized infinite scroll
    const container = safeQuerySelector('#productsList');
    if (container) {
      const scrollHandler = createScrollHandler((scrollInfo) => {
        if (this.hasMoreProducts && !this.isLoading) {
          this.loadMoreProducts();
        }
      }, 200);

      safeAddEventListener(container, 'scroll', scrollHandler, { passive: true });
    }

    // Global controls
    const expandAllBtn = safeQuerySelector('#expandAllBtn');
    if (expandAllBtn) {
      safeAddEventListener(expandAllBtn, 'click', () => this.expandAllCategories());
    }

    const collapseAllBtn = safeQuerySelector('#collapseAllBtn');
    if (collapseAllBtn) {
      safeAddEventListener(collapseAllBtn, 'click', () => this.collapseAllCategories());
    }

    // Import/Export
    const exportBtn = safeQuerySelector('#exportBtn');
    if (exportBtn) {
      safeAddEventListener(exportBtn, 'click', () => this.exportData());
    }

    const importFile = safeQuerySelector('#importFile');
    if (importFile) {
      safeAddEventListener(importFile, 'change', (e) => this.importData(e));
    }

    // Reload button per sviluppo
    const reloadBtn = document.createElement('button');
    reloadBtn.className = 'btn btn-secondary';
    reloadBtn.textContent = '🔄 Ricarica Catalogo';
    reloadBtn.style.marginLeft = 'var(--spacing-sm)';
    
    const exportBtnParent = exportBtn?.parentNode;
    if (exportBtnParent) {
      exportBtnParent.insertBefore(reloadBtn, exportBtn.nextSibling);
      
      safeAddEventListener(reloadBtn, 'click', async () => {
        try {
          reloadBtn.disabled = true;
          reloadBtn.textContent = '🔄 Ricaricando...';
          
          await productsLoader.reload();
          const { products, categories } = await productsLoader.loadProducts();
          
          this.products = products;
          this.categories = categories;
          
          this.renderCategoriesList();
          this.renderCategoryFilters();
          this.renderProductCategorySelect();
          this.filterAndRenderProducts();
          this.updateStats();
          
          showToast('Catalogo ricaricato dal JSON', 'success');
        } catch (error) {
          console.error('Errore ricaricamento:', error);
          showToast(`Errore ricaricamento: ${error.message}`, 'error');
        } finally {
          reloadBtn.disabled = false;
          reloadBtn.textContent = '🔄 Ricarica Catalogo';
        }
      });
    }
  }

  resetPagination() {
    this.currentBatch = 0;
    this.renderedProducts = [];
    this.hasMoreProducts = true;
    this.isLoading = false;
  }

  renderCategoriesList() {
    const container = safeQuerySelector('#categoriesList');
    if (!container) return;

    container.innerHTML = '';

    const sortedCategories = [...this.categories].sort((a, b) => a.name.localeCompare(b.name));

    sortedCategories.forEach(category => {
      const categoryDiv = document.createElement('div');
      categoryDiv.className = 'category-item';

      categoryDiv.innerHTML = `
        <div class="category-item-content">
          <div class="category-info">
            <div class="category-color-dot" style="background-color: ${category.colorHex};"></div>
            <span class="category-name">${category.name}</span>
          </div>
          <div class="category-item-actions">
            <button class="btn-icon btn-edit" data-category-id="${category.id}">✏️</button>
            <button class="btn-icon btn-delete" data-category-id="${category.id}">🗑️</button>
          </div>
        </div>
      `;

      // Add event listeners
      const editBtn = categoryDiv.querySelector('.btn-edit');
      const deleteBtn = categoryDiv.querySelector('.btn-delete');

      editBtn.addEventListener('click', () => this.editCategory(category.id));
      deleteBtn.addEventListener('click', () => this.deleteCategory(category.id));

      container.appendChild(categoryDiv);
    });
  }

  renderCategoryFilters() {
    const container = safeQuerySelector('#categoryFilters');
    if (!container) return;

    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = `btn btn-secondary ${!this.selectedCategory ? 'active' : ''}`;
    allBtn.textContent = 'Tutte';
    allBtn.addEventListener('click', () => {
      this.selectedCategory = '';
      this.renderProducts();
      this.updateCategoryFilters();
    });
    container.appendChild(allBtn);

    // Usa solo le categorie che hanno prodotti
    const categoriesWithProducts = productsLoader.getCategoriesWithCount().filter(cat => cat.hasProducts);
    const sortedCategories = categoriesWithProducts.sort((a, b) => a.name.localeCompare(b.name));
    
    sortedCategories.forEach(category => {
      const btn = document.createElement('button');
      btn.className = `btn btn-secondary ${this.selectedCategory === category.id ? 'active' : ''}`;
      btn.textContent = category.name;
      btn.style.backgroundColor = this.selectedCategory === category.id ? category.colorHex : '';
      btn.style.color = this.selectedCategory === category.id ? getContrastColor(category.colorHex) : '';
      btn.addEventListener('click', () => {
        this.selectedCategory = category.id;
        this.renderProducts();
        this.updateCategoryFilters();
      });
      container.appendChild(btn);
    });
  }

  updateCategoryFilters() {
    const buttons = document.querySelectorAll('#categoryFilters button');
    const categoriesWithProducts = productsLoader.getCategoriesWithCount();
    const sortedCategories = categoriesWithProducts.sort((a, b) => a.name.localeCompare(b.name));

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

  resetPagination() {
    this.currentBatch = 0;
    this.renderedProducts = [];
    this.hasMoreProducts = true;
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

    // Reset and render first batch
    this.resetPagination();

    const container = safeQuerySelector('#productsList');
    const loading = safeQuerySelector('#loadingProducts');

    if (!container) return;

    loading.classList.add('hidden');
    container.classList.remove('hidden');

    // Clear container for fresh render
    container.innerHTML = '';

    // Load first batch
    this.loadMoreProducts();
  }

  async loadMoreProducts() {
    if (this.isLoading || !this.hasMoreProducts) return;

    this.isLoading = true;
    this.showLoadingIndicator();

    const batchSize = getAdaptiveBatchSize();
    const startIndex = this.currentBatch * batchSize;
    const endIndex = startIndex + batchSize;

    if (startIndex >= this.filteredProducts.length) {
      this.hasMoreProducts = false;
      this.hideLoadingIndicator();
      this.isLoading = false;
      return;
    }

    const batch = this.filteredProducts.slice(startIndex, endIndex);
    this.renderedProducts.push(...batch);

    this.currentBatch++;
    this.hasMoreProducts = endIndex < this.filteredProducts.length;

    await this.renderProductsBatch(batch, startIndex === 0);

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
  renderProductCategorySelect() {
    const select = safeQuerySelector('#productCategory');
    if (!select) return;

    select.innerHTML = '<option value="">Seleziona categoria</option>';

    const sortedCategories = [...this.categories].sort((a, b) => a.name.localeCompare(b.name));
    sortedCategories.forEach(category => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      select.appendChild(option);
    });
  }

  renderProducts() {
    const container = safeQuerySelector('#productsList');
    const loading = safeQuerySelector('#loadingProducts');

    if (!container) return;

    loading.classList.add('hidden');
    container.classList.remove('hidden');

    // Clear container for fresh render
    container.innerHTML = '';

    // Reset pagination state
    this.resetPagination();

    // Load first batch
    this.loadMoreProducts();
  }

  async renderProductsBatch(products, isFirstBatch = false) {
    const container = safeQuerySelector('#productsList');
    if (!container) return;

    // Group products by category
    const groupedProducts = new Map();
    products.forEach(product => {
      if (!groupedProducts.has(product.categoryId)) {
        groupedProducts.set(product.categoryId, []);
      }
      groupedProducts.get(product.categoryId).push(product);
    });

    // Use scheduled rendering for better performance
    await scheduleRender(() => {
      const fragment = document.createDocumentFragment();

      const categoryEntries = Array.from(groupedProducts.entries()).sort(([categoryIdA], [categoryIdB]) => {
        const categoryA = this.categories.find(c => c.id === categoryIdA);
        const categoryB = this.categories.find(c => c.id === categoryIdB);
        if (!categoryA || !categoryB) return 0;
        return categoryA.name.localeCompare(categoryB.name);
      });

      categoryEntries.forEach(([categoryId, categoryProducts]) => {
        // Check if category section already exists
        let categorySection = container.querySelector(`[data-category-id="${categoryId}"]`);

        if (!categorySection) {
          categorySection = this.createCategorySection(categoryId, categoryProducts);
          if (categorySection) {
            categorySection.setAttribute('data-category-id', categoryId);
            fragment.appendChild(categorySection);
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

      // Append all at once for better performance
      container.appendChild(fragment);
    });
  }

  createCategorySection(categoryId, products) {
    const category = this.categories.find(c => c.id === categoryId);
    if (!category) return null;

    products.sort((a, b) => a.name.localeCompare(b.name));
    const isCollapsed = this.collapsedCategories.has(categoryId);

    const categorySection = document.createElement('div');
    categorySection.className = 'category-section compact';
    categorySection.style.willChange = 'transform, opacity'; // Optimize for animations
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
      // Track category interactions
      smartPrefetcher.trackInteraction('catalog_category_toggle', {
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
      ${isCollapsed ? 'max-height: 0; opacity: 0; padding: 0;' : 'max-height: 2000px; opacity: 1; padding: 0.5rem;'}
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

  createProductCard(product, category) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.style.willChange = 'transform, opacity'; // Optimize for animations

    card.innerHTML = `
      <div class="product-header">
        <div>
          <div class="product-name">
            ${product.name}
            ${product.important ? '<span class="important-badge">Importante</span>' : ''}
            ${product.active === false ? '<span class="important-badge" style="background: var(--accent-warning);">Inattivo</span>' : ''}
            ${product.unit ? `<span class="unit-badge">${product.unit}</span>` : ''}
          </div>
          <div class="product-category" style="background-color: ${category.colorHex}20; color: ${category.colorHex}; border: 1px solid ${category.colorHex};">
            ${category.name}
          </div>
          ${product.notes ? `<div class="product-notes">${product.notes}</div>` : ''}
        </div>
        <div class="product-actions">
          <button class="btn-icon btn-edit" data-product-id="${product.id}">✏️</button>
          <button class="btn-icon btn-delete" data-product-id="${product.id}">🗑️</button>
        </div>
      </div>
    `;

    // Add event listeners
    const editBtn = card.querySelector('.btn-edit');
    const deleteBtn = card.querySelector('.btn-delete');

    editBtn.addEventListener('click', () => {
      smartPrefetcher.trackInteraction('product_edit', { productId: product.id });
      this.editProduct(product.id);
    });

    deleteBtn.addEventListener('click', () => {
      smartPrefetcher.trackInteraction('product_delete', { productId: product.id });
      this.deleteProduct(product.id);
    });

    return card;
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

  loadCollapsedState() {
    try {
      const saved = localStorage.getItem('catalogoCollapsedCategories');
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
      localStorage.setItem('catalogoCollapsedCategories', JSON.stringify([...this.collapsedCategories]));
    } catch (error) {
      console.warn('Errore salvataggio stato categorie:', error);
    }
  }

  // Gestione categorie e prodotti ora tramite JSON
  addCategory() {
    showToast('Per aggiungere categorie, modifica il file prodotti.json', 'info');
  }

  editCategory(categoryId) {
    showToast('Per modificare categorie, modifica il file prodotti.json', 'info');
  }

  deleteCategory(categoryId) {
    showToast('Per eliminare categorie, modifica il file prodotti.json', 'info');
  }

  addProduct() {
    showToast('Per aggiungere prodotti, modifica il file prodotti.json', 'info');
  }

  editProduct(productId) {
    showToast('Per modificare prodotti, modifica il file prodotti.json', 'info');
  }

  deleteProduct(productId) {
    showToast('Per eliminare prodotti, modifica il file prodotti.json', 'info');
  }

  exportData() {
    try {
      const data = {
        categories: this.categories,
        products: this.products,
        exportDate: new Date().toISOString(),
        version: '1.2.0'
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `catalogo-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);

      showToast('Dati esportati con successo', 'success');
    } catch (error) {
      console.error('Errore esportazione:', error);
      showToast('Errore durante l\'esportazione', 'error');
    }
  }

  importData(event) {
    showToast('Per importare dati, sostituisci il file prodotti.json e ricarica la pagina', 'info');
    event.target.value = '';
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

  showSuccess(message) {
    const successEl = safeQuerySelector('#successMessage');
    if (successEl) {
      successEl.textContent = message;
      successEl.classList.remove('hidden');
      setTimeout(() => successEl.classList.add('hidden'), 3000);
    }
    showToast(message, 'success');
  }
}

window.catalogoManager = new CatalogoManager();