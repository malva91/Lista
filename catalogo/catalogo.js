import { db } from '../shared/firebase.js?v=1.3.0';
import { collection, doc, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { showToast, debounce, getContrastColor } from '../shared/utils.js?v=1.3.0';
import { safeQuerySelector, safeAddEventListener, validateInput, initMobileUtils, initTheme, initHamburgerMenu } from '../shared/utils.js?v=1.3.0';
import { productsLoader } from '../shared/products-loader.js?v=1.3.0';

class CatalogoManager {
  constructor() {
    this.categories = [];
    this.products = [];
    this.filteredProducts = [];
    this.selectedCategory = '';
    this.searchTerm = '';
    this.collapsedCategories = new Set();
    this.currentView = 'catalog'; // 'catalog' or 'editor'

    this.init();
  }

  async init() {
    initMobileUtils();
    initTheme();
    initHamburgerMenu();

    this.setupEventListeners();
    this.showLoadingState();

    await this.loadData();
    this.renderView();
  }

  showLoadingState() {
    const loadingEl = document.getElementById('loadingProducts');
    if (loadingEl) {
      loadingEl.classList.remove('hidden');
      loadingEl.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid var(--border-color); border-top: 4px solid var(--accent-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
          <div>Caricamento catalogo...</div>
        </div>
      `;
    }
  }

  async loadData() {
    try {
      const { products, categories } = await productsLoader.loadProducts();
      this.products = products;
      this.categories = categories;
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
    
    if (totalProductsEl) totalProductsEl.textContent = stats.totalProducts;
    if (totalCategoriesEl) totalCategoriesEl.textContent = stats.totalCategories;
    if (activeProductsEl) activeProductsEl.textContent = stats.activeProducts;
  }

  setupEventListeners() {
    // View switcher
    const catalogViewBtn = safeQuerySelector('#catalogViewBtn');
    const editorViewBtn = safeQuerySelector('#editorViewBtn');
    
    if (catalogViewBtn) {
      safeAddEventListener(catalogViewBtn, 'click', () => this.switchView('catalog'));
    }
    
    if (editorViewBtn) {
      safeAddEventListener(editorViewBtn, 'click', () => this.switchView('editor'));
    }

    // Search
    const searchInput = safeQuerySelector('#searchInput');
    if (searchInput) {
      const debouncedSearch = debounce((e) => {
        this.searchTerm = e.target.value.toLowerCase();
        this.filterAndRenderProducts();
      }, 300);

      safeAddEventListener(searchInput, 'input', debouncedSearch);
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

    // Export/Import
    const exportBtn = safeQuerySelector('#exportBtn');
    if (exportBtn) {
      safeAddEventListener(exportBtn, 'click', () => this.exportData());
    }

    // Editor controls
    const saveEditorBtn = safeQuerySelector('#saveEditorBtn');
    if (saveEditorBtn) {
      safeAddEventListener(saveEditorBtn, 'click', () => this.saveFromEditor());
    }

    const loadEditorBtn = safeQuerySelector('#loadEditorBtn');
    if (loadEditorBtn) {
      safeAddEventListener(loadEditorBtn, 'click', () => this.loadToEditor());
    }

    const validateEditorBtn = safeQuerySelector('#validateEditorBtn');
    if (validateEditorBtn) {
      safeAddEventListener(validateEditorBtn, 'click', () => this.validateEditor());
    }

    // Add category/product buttons
  }

  switchView(view) {
    this.currentView = view;
    this.renderView();
  }

  renderView() {
    const catalogView = safeQuerySelector('#catalogView');
    const editorView = safeQuerySelector('#editorView');
    const catalogViewBtn = safeQuerySelector('#catalogViewBtn');
    const editorViewBtn = safeQuerySelector('#editorViewBtn');

    if (this.currentView === 'catalog') {
      if (catalogView) catalogView.classList.remove('hidden');
      if (editorView) editorView.classList.add('hidden');
      if (catalogViewBtn) catalogViewBtn.classList.add('active');
      if (editorViewBtn) editorViewBtn.classList.remove('active');
      
      this.renderCategoryFilters();
      this.filterAndRenderProducts();
    } else {
      if (catalogView) catalogView.classList.add('hidden');
      if (editorView) editorView.classList.remove('hidden');
      if (catalogViewBtn) catalogViewBtn.classList.remove('active');
      if (editorViewBtn) editorViewBtn.classList.add('active');
      
      this.loadToEditor();
    }

    const loadingEl = document.getElementById('loadingProducts');
    if (loadingEl) loadingEl.classList.add('hidden');
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
      this.filterAndRenderProducts();
      this.updateCategoryFilters();
    });
    container.appendChild(allBtn);

    const categoriesWithProducts = this.categories.filter(category => {
      return this.products.some(p => p.categoryId === category.id);
    });
    
    categoriesWithProducts.forEach(category => {
      const btn = document.createElement('button');
      btn.className = `btn btn-secondary ${this.selectedCategory === category.id ? 'active' : ''}`;
      btn.textContent = category.name;
      btn.style.backgroundColor = this.selectedCategory === category.id ? category.colorHex : '';
      btn.style.color = this.selectedCategory === category.id ? getContrastColor(category.colorHex) : '';
      btn.addEventListener('click', () => {
        this.selectedCategory = category.id;
        this.filterAndRenderProducts();
        this.updateCategoryFilters();
      });
      container.appendChild(btn);
    });
  }

  updateCategoryFilters() {
    const buttons = document.querySelectorAll('#categoryFilters button');
    const categoriesWithProducts = this.categories.filter(category => {
      return this.products.some(p => p.categoryId === category.id);
    });
    
    buttons.forEach((btn, index) => {
      if (index === 0) {
        btn.classList.toggle('active', !this.selectedCategory);
      } else {
        const category = categoriesWithProducts[index - 1];
        if (!category) return;
        const isActive = this.selectedCategory === category.id;
        btn.classList.toggle('active', isActive);
        btn.style.backgroundColor = isActive ? category.colorHex : '';
        btn.style.color = isActive ? getContrastColor(category.colorHex) : '';
      }
    });
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

    this.renderProducts();
  }

  renderProducts() {
    const container = safeQuerySelector('#productsList');
    if (!container) return;

    container.innerHTML = '';

    // Group products by category
    const groupedProducts = new Map();
    this.filteredProducts.forEach(product => {
      if (!groupedProducts.has(product.categoryId)) {
        groupedProducts.set(product.categoryId, []);
      }
      groupedProducts.get(product.categoryId).push(product);
    });

    // Render categories
    const categoryEntries = Array.from(groupedProducts.entries()).sort(([categoryIdA], [categoryIdB]) => {
      const categoryA = this.categories.find(c => c.id === categoryIdA);
      const categoryB = this.categories.find(c => c.id === categoryIdB);
      if (!categoryA || !categoryB) return 0;
      return categoryA.name.localeCompare(categoryB.name);
    });

    categoryEntries.forEach(([categoryId, categoryProducts]) => {
      const categorySection = this.createCategorySection(categoryId, categoryProducts);
      if (categorySection) {
        container.appendChild(categorySection);
      }
    });
  }

  createCategorySection(categoryId, products) {
    const category = this.categories.find(c => c.id === categoryId);
    if (!category) return null;

    products.sort((a, b) => a.name.localeCompare(b.name));
    const isCollapsed = this.collapsedCategories.has(categoryId);

    const categorySection = document.createElement('div');
    categorySection.className = 'category-section';
    categorySection.style.background = `linear-gradient(135deg, ${category.colorHex}10 0%, transparent 100%)`;
    categorySection.style.border = `1px solid ${category.colorHex}30`;
    categorySection.style.borderRadius = '12px';
    categorySection.style.borderLeft = `4px solid ${category.colorHex}`;
    categorySection.style.marginBottom = '1rem';

    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'category-header';
    categoryHeader.style.cssText = `
      color: ${category.colorHex};
      cursor: pointer;
      user-select: none;
      padding: 0.75rem 1rem;
      background: ${category.colorHex}08;
      border-bottom: ${isCollapsed ? 'none' : `1px solid ${category.colorHex}20`};
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    categoryHeader.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="transition: transform 0.3s; ${isCollapsed ? 'transform: rotate(-90deg);' : ''}">▼</span>
        <span>📂</span>
        <span style="font-weight: 600;">${category.name}</span>
      </div>
      <span style="font-size: 0.8rem; opacity: 0.8;">${products.length}</span>
    `;

    categoryHeader.addEventListener('click', () => {
      this.toggleCategory(categoryId);
    });

    categorySection.appendChild(categoryHeader);

    const categoryContent = document.createElement('div');
    categoryContent.className = 'category-content';
    categoryContent.style.cssText = `
      transition: all 0.3s ease;
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

    card.innerHTML = `
      <div class="product-header">
        <div>
          <div class="product-name">
            ${product.name}
            ${product.unit ? `<span class="unit-badge">${product.unit}</span>` : ''}
          </div>
          <div class="product-category" style="background-color: ${category.colorHex}20; color: ${category.colorHex}; border: 1px solid ${category.colorHex};">
            ${category.name}
          </div>
          ${product.notes ? `<div class="product-notes">${product.notes}</div>` : ''}
        </div>
      </div>
    `;

    return card;
  }

  toggleCategory(categoryId) {
    if (this.collapsedCategories.has(categoryId)) {
      this.collapsedCategories.delete(categoryId);
    } else {
      this.collapsedCategories.add(categoryId);
    }

    this.updateCategoryVisibility();
  }

  updateCategoryVisibility() {
    const categorySections = document.querySelectorAll('.category-section');
    categorySections.forEach(section => {
      const categoryHeader = section.querySelector('.category-header');
      if (!categoryHeader) return;

      const categoryId = categoryHeader.querySelector('[data-category-id]')?.dataset.categoryId;
      if (!categoryId) return;

      const isCollapsed = this.collapsedCategories.has(categoryId);
      const content = section.querySelector('.category-content');
      const toggleIcon = categoryHeader.querySelector('span');

      if (content && toggleIcon) {
        if (isCollapsed) {
          content.style.maxHeight = '0';
          content.style.opacity = '0';
          content.style.padding = '0';
          toggleIcon.style.transform = 'rotate(-90deg)';
        } else {
          content.style.maxHeight = '2000px';
          content.style.opacity = '1';
          content.style.padding = '0.5rem';
          toggleIcon.style.transform = '';
        }
      }
    });
  }

  expandAllCategories() {
    this.collapsedCategories.clear();
    this.renderProducts(); // Re-render to update all category states
    showToast('Tutte le categorie espanse', 'success');
  }

  collapseAllCategories() {
    const categoryIds = [...new Set(this.products.map(p => p.categoryId))];
    this.collapsedCategories = new Set(categoryIds);
    this.renderProducts(); // Re-render to update all category states
    showToast('Tutte le categorie chiuse', 'success');
  }

  // Editor functions
  loadToEditor() {
    const editor = safeQuerySelector('#jsonEditor');
    if (!editor) return;

    const data = productsLoader.exportToJSON();
    editor.value = JSON.stringify(data, null, 2);
  }

  validateEditor() {
    const editor = safeQuerySelector('#jsonEditor');
    const validationResult = safeQuerySelector('#validationResult');
    
    if (!editor || !validationResult) return;

    try {
      const data = JSON.parse(editor.value);
      productsLoader.validateProductsData(data);
      
      validationResult.className = 'success';
      validationResult.textContent = '✅ JSON valido!';
      showToast('JSON valido', 'success');
    } catch (error) {
      validationResult.className = 'error';
      validationResult.textContent = `❌ Errore: ${error.message}`;
      showToast(`Errore validazione: ${error.message}`, 'error');
    }
  }

  async saveFromEditor() {
    const editor = safeQuerySelector('#jsonEditor');
    if (!editor) return;

    try {
      const data = JSON.parse(editor.value);
      productsLoader.validateProductsData(data);

      // Salva su Firestore
      await productsLoader.saveToFirestore(data.categories, data.products);
      
      // Ricarica i dati
      await this.loadData();
      
      if (this.currentView === 'catalog') {
        this.renderCategoryFilters();
        this.filterAndRenderProducts();
      }

      showToast('Catalogo salvato con successo!', 'success');
    } catch (error) {
      console.error('Errore salvataggio:', error);
      showToast(`Errore salvataggio: ${error.message}`, 'error');
    }
  }

  // CRUD operations
  exportData() {
    try {
      const data = productsLoader.exportToJSON();
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

window.catalogoManager = new CatalogoManager();