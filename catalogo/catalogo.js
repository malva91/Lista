import { db } from '../shared/firebase.js?v=1.2.0';
import { 
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, addDoc, updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { generateUniqueId, showToast, debounce, getContrastColor } from '../shared/utils.js?v=1.2.0';
import { safeQuerySelector, safeAddEventListener, validateInput, initMobileUtils, initTheme, initHamburgerMenu } from '../shared/utils.js?v=1.2.0';

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
    
    this.init();
  }

  async init() {
    initMobileUtils();
    initTheme();
    initHamburgerMenu();
    
    // Initialize intersection observer for lazy loading
    this.intersectionObserver = initIntersectionObserver();
    
    this.setupEventListeners();
    
    document.getElementById('loadingProducts').classList.remove('hidden');
    
    await this.loadDataWithProgress();
    this.filterAndRenderProducts();
  }
  
  async loadDataWithProgress() {
    const loadingEl = document.getElementById('loadingProducts');
    
    try {
      loadingEl.textContent = 'Caricamento categorie...';
      await this.loadCategories();
      
      loadingEl.textContent = 'Caricamento prodotti...';
      await this.loadProducts();
      
      loadingEl.textContent = 'Preparazione interfaccia...';
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error('Errore caricamento dati:', error);
      this.showError('Errore nel caricamento dei dati');
    }
  }
  
  async loadData() {
    try {
      await Promise.all([
        this.loadCategories(),
        this.loadProducts()
      ]);
    } catch (error) {
      console.error('Errore caricamento dati:', error);
      this.showError('Errore nel caricamento dei dati');
    }
  }

  setupEventListeners() {
    // Category management
    const addCategoryBtn = safeQuerySelector('#addCategoryBtn');
    if (addCategoryBtn) {
      safeAddEventListener(addCategoryBtn, 'click', () => this.addCategory());
    }

    const updateCategoryBtn = safeQuerySelector('#updateCategoryBtn');
    if (updateCategoryBtn) {
      safeAddEventListener(updateCategoryBtn, 'click', () => this.updateCategory());
    }

    const cancelCategoryBtn = safeQuerySelector('#cancelCategoryBtn');
    if (cancelCategoryBtn) {
      safeAddEventListener(cancelCategoryBtn, 'click', () => this.cancelCategoryEdit());
    }

    // Product management
    const addProductBtn = safeQuerySelector('#addProductBtn');
    if (addProductBtn) {
      safeAddEventListener(addProductBtn, 'click', () => this.addProduct());
    }

    const updateProductBtn = safeQuerySelector('#updateProductBtn');
    if (updateProductBtn) {
      safeAddEventListener(updateProductBtn, 'click', () => this.updateProduct());
    }

    const cancelProductBtn = safeQuerySelector('#cancelProductBtn');
    if (cancelProductBtn) {
      safeAddEventListener(cancelProductBtn, 'click', () => this.cancelProductEdit());
    }

    // Search and filters
    const searchInput = safeQuerySelector('#searchInput');
    if (searchInput) {
      safeAddEventListener(searchInput, 'input', debounce((e) => {
        this.searchTerm = e.target.value.toLowerCase();
        this.resetPagination();
        this.filterAndRenderProducts();
      }, 300));
    }

    // Infinite scroll
    const container = safeQuerySelector('#productsList');
    if (container) {
      const scrollHandler = createScrollHandler(() => {
        if (this.hasMoreProducts && !this.isLoading) {
          this.loadMoreProducts();
        }
      });
      
      safeAddEventListener(container, 'scroll', scrollHandler);
      safeAddEventListener(window, 'scroll', scrollHandler);
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
  }

  async loadCategories() {
    try {
      const categoriesSnap = await getDocs(collection(db, 'categories'));
      this.categories = categoriesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).filter(category => category.name && category.colorHex);
      
      this.renderCategoriesList();
      this.renderCategoryFilters();
      this.renderProductCategorySelect();
      this.loadCollapsedState();
    } catch (error) {
      console.error('Errore caricamento categorie:', error);
      this.showError('Errore nel caricamento delle categorie');
      this.categories = [];
    }
  }

  async loadProducts() {
    try {
      // Try to load from cache first
      const cached = await getCachedProducts();
      if (cached.isValid && cached.products.length > 0) {
        this.products = cached.products.filter(product => 
          product.name && product.categoryId
        ).sort((a, b) => a.name.localeCompare(b.name));
        return;
      }
      
      // Load from Firestore
      const productsSnap = await getDocs(collection(db, 'products'));
      this.products = productsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).filter(product => product.name && product.categoryId)
        .sort((a, b) => a.name.localeCompare(b.name));
      
      // Cache the results
      setCachedProducts(this.products);
      
    } catch (error) {
      console.error('Errore caricamento prodotti:', error);
      this.showError('Errore nel caricamento dei prodotti');
      this.products = [];
    }
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
    
    const sortedCategories = [...this.categories].sort((a, b) => a.name.localeCompare(b.name));
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
    
    // Re-filter and render when category changes
    this.filterAndRenderProducts();
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
    this.renderProducts();
  }

  async loadMoreProducts() {
    if (this.isLoading || !this.hasMoreProducts) return;
    
    this.isLoading = true;
    const startIndex = this.currentBatch * ITEMS_PER_BATCH;
    const endIndex = startIndex + ITEMS_PER_BATCH;
    
    if (startIndex >= this.filteredProducts.length) {
      this.hasMoreProducts = false;
      this.isLoading = false;
      return;
    }
    
    const batch = this.filteredProducts.slice(startIndex, endIndex);
    this.renderedProducts.push(...batch);
    
    this.currentBatch++;
    this.hasMoreProducts = endIndex < this.filteredProducts.length;
    
    await this.renderProductsBatch(batch, startIndex === 0);
    this.isLoading = false;
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
    
    // Load first batch
    this.loadMoreProducts();
  }

  async renderProductsBatch(products, isFirstBatch = false) {
    const container = safeQuerySelector('#productsList');
    if (!container) return;
    
    // Remove loading indicator if present
    const existingIndicator = container.querySelector('.loading-more');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    // Group products by category
    const groupedProducts = new Map();
    products.forEach(product => {
      if (!groupedProducts.has(product.categoryId)) {
        groupedProducts.set(product.categoryId, []);
      }
      groupedProducts.get(product.categoryId).push(product);
    });

    // Create document fragment for better performance
    const fragment = createDocumentFragment();
    
    // Process categories in batches
    const categoryEntries = Array.from(groupedProducts.entries()).sort(([categoryIdA], [categoryIdB]) => {
      const categoryA = this.categories.find(c => c.id === categoryIdA);
      const categoryB = this.categories.find(c => c.id === categoryIdB);
      if (!categoryA || !categoryB) return 0;
      return categoryA.name.localeCompare(categoryB.name);
    });
    
    await processBatch(categoryEntries, 5, ([categoryId, categoryProducts]) => {
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
          const productFragment = createDocumentFragment();
          categoryProducts.forEach(product => {
            const category = this.categories.find(c => c.id === categoryId);
            const productCard = this.createProductCard(product, category);
            productFragment.appendChild(productCard);
          });
          productsGrid.appendChild(productFragment);
        }
      }
      
      return categorySection;
    });
    
    // Append all at once for better performance
    container.appendChild(fragment);
    
    // Add loading indicator if there are more products
    if (this.hasMoreProducts) {
      this.addLoadingIndicator();
    }
  }

  addLoadingIndicator() {
    const container = safeQuerySelector('#productsList');
    if (!container) return;
    
    const indicator = document.createElement('div');
    indicator.className = 'loading-more';
    indicator.style.cssText = `
      text-align: center;
      padding: 2rem;
      color: var(--text-secondary);
      font-size: 0.9rem;
    `;
    indicator.innerHTML = `
      <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid var(--border-color); border-top: 2px solid var(--accent-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-right: 0.5rem;"></div>
      Caricamento altri prodotti...
    `;
    
    container.appendChild(indicator);
    
    // Use intersection observer to trigger loading
    if (this.intersectionObserver) {
      indicator.dataset.lazyLoad = 'true';
      indicator.addEventListener('lazyLoad', () => {
        if (this.hasMoreProducts && !this.isLoading) {
          this.loadMoreProducts();
        }
      });
      this.intersectionObserver.observe(indicator);
    }
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
    
    card.innerHTML = `
      <div class="product-header">
        <div>
          <div class="product-name">
            ${product.name}
            ${product.important ? '<span class="important-badge">Importante</span>' : ''}
            ${!product.active ? '<span class="important-badge" style="background: var(--accent-warning);">Inattivo</span>' : ''}
          </div>
          <div class="product-category" style="background-color: ${category.colorHex}20; color: ${category.colorHex}; border: 1px solid ${category.colorHex};">
            ${category.name}
          </div>
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
    
    editBtn.addEventListener('click', () => this.editProduct(product.id));
    deleteBtn.addEventListener('click', () => this.deleteProduct(product.id));

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

  async addCategory() {
    const nameInput = safeQuerySelector('#categoryName');
    const colorInput = safeQuerySelector('#categoryColor');
    
    if (!nameInput || !colorInput) return;
    
    const nameValidation = validateInput(nameInput.value, 'text', { min: 2, max: 50, required: true });
    if (!nameValidation.valid) {
      showToast(nameValidation.error, 'error');
      return;
    }
    
    const name = nameValidation.value;
    const colorHex = colorInput.value;
    
    // Check for duplicate names
    if (this.categories.some(cat => cat.name.toLowerCase() === name.toLowerCase())) {
      showToast('Esiste già una categoria con questo nome', 'error');
      return;
    }
    
    try {
      const categoryId = await generateUniqueId('categories', name, db);
      
      const categoryData = {
        name,
        colorHex,
        createdAt: new Date()
      };
      
      await setDoc(doc(db, 'categories', categoryId), categoryData);
      
      nameInput.value = '';
      colorInput.value = '#3b82f6';
      
      await this.loadCategories();
      this.filterAndRenderProducts();
      
      showToast('Categoria aggiunta con successo', 'success');
    } catch (error) {
      console.error('Errore aggiunta categoria:', error);
      showToast('Errore durante l\'aggiunta della categoria', 'error');
    }
  }

  editCategory(categoryId) {
    const category = this.categories.find(c => c.id === categoryId);
    if (!category) return;
    
    const nameInput = safeQuerySelector('#categoryName');
    const colorInput = safeQuerySelector('#categoryColor');
    const addBtn = safeQuerySelector('#addCategoryBtn');
    const updateBtn = safeQuerySelector('#updateCategoryBtn');
    const cancelBtn = safeQuerySelector('#cancelCategoryBtn');
    
    if (!nameInput || !colorInput || !addBtn || !updateBtn || !cancelBtn) return;
    
    nameInput.value = category.name;
    colorInput.value = category.colorHex;
    
    addBtn.classList.add('hidden');
    updateBtn.classList.remove('hidden');
    cancelBtn.classList.remove('hidden');
    
    this.editingCategory = categoryId;
  }

  async updateCategory() {
    if (!this.editingCategory) return;
    
    const nameInput = safeQuerySelector('#categoryName');
    const colorInput = safeQuerySelector('#categoryColor');
    
    if (!nameInput || !colorInput) return;
    
    const nameValidation = validateInput(nameInput.value, 'text', { min: 2, max: 50, required: true });
    if (!nameValidation.valid) {
      showToast(nameValidation.error, 'error');
      return;
    }
    
    const name = nameValidation.value;
    const colorHex = colorInput.value;
    
    // Check for duplicate names (excluding current category)
    if (this.categories.some(cat => cat.id !== this.editingCategory && cat.name.toLowerCase() === name.toLowerCase())) {
      showToast('Esiste già una categoria con questo nome', 'error');
      return;
    }
    
    try {
      const categoryData = {
        name,
        colorHex,
        updatedAt: new Date()
      };
      
      await updateDoc(doc(db, 'categories', this.editingCategory), categoryData);
      
      this.cancelCategoryEdit();
      await this.loadCategories();
      this.filterAndRenderProducts();
      
      showToast('Categoria aggiornata con successo', 'success');
    } catch (error) {
      console.error('Errore aggiornamento categoria:', error);
      showToast('Errore durante l\'aggiornamento della categoria', 'error');
    }
  }

  cancelCategoryEdit() {
    const nameInput = safeQuerySelector('#categoryName');
    const colorInput = safeQuerySelector('#categoryColor');
    const addBtn = safeQuerySelector('#addCategoryBtn');
    const updateBtn = safeQuerySelector('#updateCategoryBtn');
    const cancelBtn = safeQuerySelector('#cancelCategoryBtn');
    
    if (nameInput) nameInput.value = '';
    if (colorInput) colorInput.value = '#3b82f6';
    
    if (addBtn) addBtn.classList.remove('hidden');
    if (updateBtn) updateBtn.classList.add('hidden');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    
    this.editingCategory = null;
  }

  async deleteCategory(categoryId) {
    const category = this.categories.find(c => c.id === categoryId);
    if (!category) return;
    
    // Check if category has products
    const hasProducts = this.products.some(p => p.categoryId === categoryId);
    if (hasProducts) {
      showToast('Impossibile eliminare: la categoria contiene prodotti', 'error');
      return;
    }
    
    if (!confirm(`Sei sicuro di voler eliminare la categoria "${category.name}"?`)) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'categories', categoryId));
      
      await this.loadCategories();
      this.filterAndRenderProducts();
      
      showToast('Categoria eliminata con successo', 'success');
    } catch (error) {
      console.error('Errore eliminazione categoria:', error);
      showToast('Errore durante l\'eliminazione della categoria', 'error');
    }
  }

  async addProduct() {
    const nameInput = safeQuerySelector('#productName');
    const categorySelect = safeQuerySelector('#productCategory');
    const importantCheck = safeQuerySelector('#productImportant');
    const activeCheck = safeQuerySelector('#productActive');
    
    if (!nameInput || !categorySelect || !importantCheck || !activeCheck) return;
    
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
    const important = importantCheck.checked;
    const active = activeCheck.checked;
    
    // Check for duplicate names in same category
    if (this.products.some(p => p.categoryId === categoryId && p.name.toLowerCase() === name.toLowerCase())) {
      showToast('Esiste già un prodotto con questo nome nella categoria selezionata', 'error');
      return;
    }
    
    try {
      const productId = await generateUniqueId('products', name, db);
      
      const productData = {
        name,
        categoryId,
        important,
        active,
        createdAt: new Date()
      };
      
      await setDoc(doc(db, 'products', productId), productData);
      
      nameInput.value = '';
      categorySelect.value = '';
      importantCheck.checked = false;
      activeCheck.checked = true;
      
      await this.loadProducts();
      this.filterAndRenderProducts();
      
      showToast('Prodotto aggiunto con successo', 'success');
    } catch (error) {
      console.error('Errore aggiunta prodotto:', error);
      showToast('Errore durante l\'aggiunta del prodotto', 'error');
    }
  }

  editProduct(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;
    
    const nameInput = safeQuerySelector('#productName');
    const categorySelect = safeQuerySelector('#productCategory');
    const importantCheck = safeQuerySelector('#productImportant');
    const activeCheck = safeQuerySelector('#productActive');
    const addBtn = safeQuerySelector('#addProductBtn');
    const updateBtn = safeQuerySelector('#updateProductBtn');
    const cancelBtn = safeQuerySelector('#cancelProductBtn');
    
    if (!nameInput || !categorySelect || !importantCheck || !activeCheck || !addBtn || !updateBtn || !cancelBtn) return;
    
    nameInput.value = product.name;
    categorySelect.value = product.categoryId;
    importantCheck.checked = product.important || false;
    activeCheck.checked = product.active !== false;
    
    addBtn.classList.add('hidden');
    updateBtn.classList.remove('hidden');
    cancelBtn.classList.remove('hidden');
    
    this.editingProduct = productId;
  }

  async updateProduct() {
    if (!this.editingProduct) return;
    
    const nameInput = safeQuerySelector('#productName');
    const categorySelect = safeQuerySelector('#productCategory');
    const importantCheck = safeQuerySelector('#productImportant');
    const activeCheck = safeQuerySelector('#productActive');
    
    if (!nameInput || !categorySelect || !importantCheck || !activeCheck) return;
    
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
    const important = importantCheck.checked;
    const active = activeCheck.checked;
    
    // Check for duplicate names in same category (excluding current product)
    if (this.products.some(p => p.id !== this.editingProduct && p.categoryId === categoryId && p.name.toLowerCase() === name.toLowerCase())) {
      showToast('Esiste già un prodotto con questo nome nella categoria selezionata', 'error');
      return;
    }
    
    try {
      const productData = {
        name,
        categoryId,
        important,
        active,
        updatedAt: new Date()
      };
      
      await updateDoc(doc(db, 'products', this.editingProduct), productData);
      
      this.cancelProductEdit();
      await this.loadProducts();
      this.filterAndRenderProducts();
      
      showToast('Prodotto aggiornato con successo', 'success');
    } catch (error) {
      console.error('Errore aggiornamento prodotto:', error);
      showToast('Errore durante l\'aggiornamento del prodotto', 'error');
    }
  }

  cancelProductEdit() {
    const nameInput = safeQuerySelector('#productName');
    const categorySelect = safeQuerySelector('#productCategory');
    const importantCheck = safeQuerySelector('#productImportant');
    const activeCheck = safeQuerySelector('#productActive');
    const addBtn = safeQuerySelector('#addProductBtn');
    const updateBtn = safeQuerySelector('#updateProductBtn');
    const cancelBtn = safeQuerySelector('#cancelProductBtn');
    
    if (nameInput) nameInput.value = '';
    if (categorySelect) categorySelect.value = '';
    if (importantCheck) importantCheck.checked = false;
    if (activeCheck) activeCheck.checked = true;
    
    if (addBtn) addBtn.classList.remove('hidden');
    if (updateBtn) updateBtn.classList.add('hidden');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    
    this.editingProduct = null;
  }

  async deleteProduct(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;
    
    if (!confirm(`Sei sicuro di voler eliminare il prodotto "${product.name}"?`)) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'products', productId));
      
      await this.loadProducts();
      this.filterAndRenderProducts();
      
      showToast('Prodotto eliminato con successo', 'success');
    } catch (error) {
      console.error('Errore eliminazione prodotto:', error);
      showToast('Errore durante l\'eliminazione del prodotto', 'error');
    }
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

  async importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.categories || !data.products) {
        showToast('File non valido: mancano categorie o prodotti', 'error');
        return;
      }
      
      if (!confirm('Questo sostituirà tutti i dati esistenti. Continuare?')) {
        return;
      }
      
      // Import categories first
      for (const category of data.categories) {
        if (category.name && category.colorHex) {
          const categoryId = await generateUniqueId('categories', category.name, db);
          await setDoc(doc(db, 'categories', categoryId), {
            name: category.name,
            colorHex: category.colorHex,
            createdAt: new Date()
          });
        }
      }
      
      // Reload categories to get new IDs
      await this.loadCategories();
      
      // Import products with updated category IDs
      for (const product of data.products) {
        if (product.name && product.categoryId) {
          // Find matching category by name
          const matchingCategory = this.categories.find(c => 
            data.categories.find(dc => dc.id === product.categoryId)?.name === c.name
          );
          
          if (matchingCategory) {
            const productId = await generateUniqueId('products', product.name, db);
            await setDoc(doc(db, 'products', productId), {
              name: product.name,
              categoryId: matchingCategory.id,
              important: product.important || false,
              active: product.active !== false,
              createdAt: new Date()
            });
          }
        }
      }
      
      await this.loadProducts();
      this.filterAndRenderProducts();
      
      showToast('Dati importati con successo', 'success');
    } catch (error) {
      console.error('Errore importazione:', error);
      showToast('Errore durante l\'importazione', 'error');
    }
    
    // Reset file input
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