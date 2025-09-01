import { db } from '../shared/firebase.js?v=1.3.0';
import { 
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, onSnapshot,
  query, where, orderBy, Timestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { formatDate, getWeekString, getDayName, showToast, debounce, getContrastColor } from '../shared/utils.js?v=1.3.0';
import { safeQuerySelector, safeAddEventListener, validateInput, initMobileUtils, initTheme, initHamburgerMenu } from '../shared/utils.js?v=1.3.0';
import { productsLoader } from '../shared/products-loader.js?v=1.3.0';

class ListaManager {
  constructor() {
    this.selectedDate = new Date();
    this.categories = [];
    this.products = [];
    this.filteredProducts = [];
    this.currentList = { items: [], extras: [] };
    this.selectedCategory = '';
    this.searchTerm = '';
    this.collapsedCategories = new Set();
    this.listListener = null;
    this.isUpdatingFromFirestore = false;
    
    this.init();
  }

  async init() {
    initMobileUtils();
    initTheme();
    initHamburgerMenu();
    
    this.setupDateSelector();
    this.setupEventListeners();
    this.showLoadingState();
    
    await this.loadData();
    await this.loadCurrentList();
    this.renderExtras();
    this.setupRealtimeSync();
  }
  
  showLoadingState() {
    const loadingEl = document.getElementById('loadingProducts');
    if (loadingEl) {
      loadingEl.classList.remove('hidden');
      loadingEl.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid var(--border-color); border-top: 4px solid var(--accent-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
          <div>Caricamento prodotti...</div>
        </div>
      `;
    }
  }
  
  async loadData() {
    try {
      const { products, categories } = await productsLoader.loadProducts();
      this.products = products;
      this.categories = categories;
      console.log('📊 Dati caricati in lista:', { products: this.products.length, categories: this.categories.length });
      this.renderCategoryFilters();
      this.filterAndRenderProducts();
    } catch (error) {
      console.error('Errore caricamento dati:', error);
      this.showError('Errore nel caricamento dei dati');
    }
  }

  setupRealtimeSync() {
    // Setup real-time listener for current list
    this.updateRealtimeListener();
  }

  updateRealtimeListener() {
    // Clean up existing listener
    if (this.listListener) {
      this.listListener();
      this.listListener = null;
    }

    const week = getWeekString(this.selectedDate);
    const day = formatDate(this.selectedDate);
    
    // Setup new listener
    this.listListener = onSnapshot(
      doc(db, 'weeks', week, 'lists', day),
      (docSnapshot) => {
        if (this.isUpdatingFromFirestore) return;
        
        if (docSnapshot.exists()) {
          const newData = docSnapshot.data();
          
          // Check if this is a remote update (not from this client)
          if (newData.lastModifiedBy !== this.getClientId()) {
            console.log('📡 Aggiornamento remoto ricevuto');
            this.currentList = newData;
            this.renderProducts();
            this.renderExtras();
            showToast('Lista aggiornata da remoto', 'info');
          }
        } else {
          // List was deleted remotely
          if (this.currentList && (this.currentList.items?.length > 0 || this.currentList.extras?.length > 0)) {
            console.log('📡 Lista eliminata da remoto');
            this.currentList = { items: [], extras: [] };
            this.renderProducts();
            this.renderExtras();
            showToast('Lista eliminata da remoto', 'warning');
          }
        }
      },
      (error) => {
        console.error('Errore listener real-time:', error);
      }
    );
  }

  getClientId() {
    let clientId = localStorage.getItem('clientId');
    if (!clientId) {
      clientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('clientId', clientId);
    }
    return clientId;
  }

  detectAndNotifyChanges(oldList, newList) {
    // Detect product quantity changes
    const oldItems = new Map((oldList.items || []).map(item => [item.id, item.quantity]));
    const newItems = new Map((newList.items || []).map(item => [item.id, item.quantity]));
    
    // Check for added products
    newItems.forEach((quantity, productId) => {
      if (!oldItems.has(productId)) {
        const product = this.products.find(p => p.id === productId);
        if (product) {
          showToast(`➕ ${product.name} (${quantity})`, 'success', 2000);
        }
      } else if (oldItems.get(productId) !== quantity) {
        const product = this.products.find(p => p.id === productId);
        if (product) {
          showToast(`🔄 ${product.name}: ${oldItems.get(productId)} → ${quantity}`, 'info', 2500);
        }
      }
    });
    
    // Check for removed products
    oldItems.forEach((quantity, productId) => {
      if (!newItems.has(productId)) {
        const product = this.products.find(p => p.id === productId);
        if (product) {
          showToast(`➖ ${product.name} rimosso`, 'warning', 2000);
        }
      }
    });
    
    // Check for extra changes
    const oldExtras = new Map((oldList.extras || []).map(extra => [extra.name, extra.quantity]));
    const newExtras = new Map((newList.extras || []).map(extra => [extra.name, extra.quantity]));
    
    newExtras.forEach((quantity, name) => {
      if (!oldExtras.has(name)) {
        showToast(`➕ Extra: ${name} (${quantity})`, 'success', 2000);
      } else if (oldExtras.get(name) !== quantity) {
        showToast(`🔄 Extra ${name}: ${oldExtras.get(name)} → ${quantity}`, 'info', 2500);
      }
    });
    
    oldExtras.forEach((quantity, name) => {
      if (!newExtras.has(name)) {
        showToast(`➖ Extra ${name} rimosso`, 'warning', 2000);
      }
    });
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
      this.loadCurrentList();
      this.updateRealtimeListener();
    });
  }

  setupEventListeners() {
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

    // Extra products
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

    // Save/Submit
    const saveDraftBtn = safeQuerySelector('#saveDraftBtn');
    if (saveDraftBtn) {
      safeAddEventListener(saveDraftBtn, 'click', () => this.saveList(false));
    }

    const submitBtn = safeQuerySelector('#submitBtn');
    if (submitBtn) {
      safeAddEventListener(submitBtn, 'click', () => this.saveList(true));
    }

    // Delete list
    const deleteListBtn = safeQuerySelector('#deleteListBtn');
    if (deleteListBtn) {
      safeAddEventListener(deleteListBtn, 'click', () => this.deleteCurrentList());
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
        this.currentList = { items: [], extras: [] };
      }
      
      this.renderProducts();
      this.renderExtras();
    } catch (error) {
      console.error('Errore caricamento lista:', error);
      this.currentList = { items: [], extras: [] };
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

    console.log('🔍 Prodotti filtrati:', this.filteredProducts.length);
    this.renderProducts();
  }

  renderProducts() {
    const container = document.getElementById('productsList');
    const loading = document.getElementById('loadingProducts');
    
    if (!container) return;
    
    loading.classList.add('hidden');
    container.classList.remove('hidden');
    
    console.log('🎨 Rendering prodotti:', this.filteredProducts.length);
    
    container.innerHTML = '';

    // Group products by category
    const groupedProducts = new Map();
    this.filteredProducts.forEach(product => {
      if (!groupedProducts.has(product.categoryId)) {
        groupedProducts.set(product.categoryId, []);
      }
      groupedProducts.get(product.categoryId).push(product);
    });

    console.log('📂 Categorie con prodotti:', groupedProducts.size);

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
    
    if (categoryEntries.length === 0) {
      container.innerHTML = `
        <div class="text-center p-4">
          <p class="text-secondary">Nessun prodotto trovato</p>
          <p class="text-muted">Prova a modificare i filtri di ricerca</p>
        </div>
      `;
    }
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

      // Find category ID from products in this section
      const firstProduct = section.querySelector('[data-product-id]');
      if (!firstProduct) return;

      const productId = firstProduct.dataset.productId;
      const product = this.products.find(p => p.id === productId);
      if (!product) return;

      const categoryId = product.categoryId;
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
            ${product.unit ? `<span class="unit-badge">${product.unit}</span>` : ''}
          </div>
          <div class="product-category" style="background-color: ${category.colorHex}20; color: ${category.colorHex}; border: 1px solid ${category.colorHex};">
            ${category.name}
          </div>
          ${product.notes ? `<div class="product-notes">${product.notes}</div>` : ''}
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
      this.currentList = { items: [], extras: [] };
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
    
    // Save to localStorage
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
      this.currentList = { items: [], extras: [] };
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
    
    // Save to localStorage
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
    
    // Save to localStorage
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
      this.isUpdatingFromFirestore = true;
      
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      
      // Carica la lista esistente per confronto
      let previousList = null;
      if (isSubmit) {
        try {
          const existingDoc = await getDoc(doc(db, 'weeks', week, 'lists', day));
          if (existingDoc.exists()) {
            previousList = existingDoc.data();
          }
        } catch (error) {
          console.warn('Errore caricamento lista precedente:', error);
        }
      }
      
      if (!this.currentList) {
        this.currentList = { items: [], extras: [] };
      }
      
      this.currentList.updatedAt = Timestamp.now();
      this.currentList.lastModifiedBy = this.getClientId();
      
      if (isSubmit) {
        this.currentList.submittedAt = Timestamp.now();
        this.currentList.status = 'submitted';
        this.currentList.version = Date.now(); // Versione per tracking modifiche
        
        // Crea notifiche solo se ci sono modifiche rispetto alla versione precedente
        if (previousList && previousList.status === 'submitted') {
          await this.createChangeNotifications(previousList, this.currentList);
        }
      }
      
      await setDoc(doc(db, 'weeks', week, 'lists', day), this.currentList);
      
      // Save to localStorage
      try {
        localStorage.setItem(`list-${week}-${day}`, JSON.stringify(this.currentList));
      } catch (error) {
        console.warn('Errore salvataggio locale:', error);
      }
      
      const message = isSubmit ? 'Lista inviata con successo!' : 'Bozza salvata!';
      showToast(message, 'success');
      
      setTimeout(() => {
        this.isUpdatingFromFirestore = false;
      }, 1000);
      
    } catch (error) {
      console.error('Errore salvataggio:', error);
      this.isUpdatingFromFirestore = false;
      
      // Fallback to localStorage
      try {
        const week = getWeekString(this.selectedDate);
        const day = formatDate(this.selectedDate);
        localStorage.setItem(`list-${week}-${day}`, JSON.stringify(this.currentList));
        showToast('Salvato localmente (offline)', 'warning');
      } catch (storageError) {
        console.error('Errore anche nel salvataggio locale:', storageError);
        showToast('Errore durante il salvataggio', 'error');
      }
    }
  }

  async createChangeNotifications(previousList, newList) {
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      const notifDocId = `${week}_${day}`;
      
      const notifications = [];
      
      // Confronta prodotti
      const previousItems = new Map((previousList.items || []).map(item => [item.id, item.quantity]));
      const newItems = new Map((newList.items || []).map(item => [item.id, item.quantity]));
      
      // Prodotti aggiunti
      newItems.forEach((quantity, productId) => {
        if (!previousItems.has(productId)) {
          const product = this.products.find(p => p.id === productId);
          if (product) {
            notifications.push({
              type: 'productAdded',
              productId: productId,
              productName: product.name,
              quantity: quantity,
              timestamp: Timestamp.now(),
              read: false
            });
          }
        }
      });
      
      // Prodotti rimossi
      previousItems.forEach((quantity, productId) => {
        if (!newItems.has(productId)) {
          const product = this.products.find(p => p.id === productId);
          if (product) {
            notifications.push({
              type: 'productRemoved',
              productId: productId,
              productName: product.name,
              quantity: quantity,
              timestamp: Timestamp.now(),
              read: false
            });
          }
        }
      });
      
      // Prodotti con quantità modificata
      newItems.forEach((newQuantity, productId) => {
        const previousQuantity = previousItems.get(productId);
        if (previousQuantity && previousQuantity !== newQuantity) {
          const product = this.products.find(p => p.id === productId);
          if (product) {
            // Reset stato preparato se la quantità è cambiata
            const itemIndex = newList.items.findIndex(item => item.id === productId);
            if (itemIndex !== -1 && newList.items[itemIndex].checked) {
              newList.items[itemIndex].checked = false;
              console.log(`🔄 Reset stato preparato per ${product.name} (quantità cambiata: ${previousQuantity} → ${newQuantity})`);
            }
            
            notifications.push({
              type: 'quantityChanged',
              productId: productId,
              productName: product.name,
              oldQuantity: previousQuantity,
              newQuantity: newQuantity,
              timestamp: Timestamp.now(),
              read: false
            });
          }
        }
      });
      
      // Confronta prodotti extra
      const previousExtras = new Map((previousList.extras || []).map(extra => [extra.name, extra.quantity]));
      const newExtras = new Map((newList.extras || []).map(extra => [extra.name, extra.quantity]));
      
      // Extra aggiunti
      newExtras.forEach((quantity, name) => {
        if (!previousExtras.has(name)) {
          notifications.push({
            type: 'extraAdded',
            extraName: name,
            quantity: quantity,
            timestamp: Timestamp.now(),
            read: false
          });
        }
      });
      
      // Extra rimossi
      previousExtras.forEach((quantity, name) => {
        if (!newExtras.has(name)) {
          notifications.push({
            type: 'extraRemoved',
            extraName: name,
            quantity: quantity,
            timestamp: Timestamp.now(),
            read: false
          });
        }
      });
      
      // Extra con quantità modificata
      newExtras.forEach((newQuantity, name) => {
        const previousQuantity = previousExtras.get(name);
        if (previousQuantity && previousQuantity !== newQuantity) {
          // Reset stato preparato se la quantità è cambiata
          const extraIndex = newList.extras.findIndex(extra => extra.name === name);
          if (extraIndex !== -1 && newList.extras[extraIndex].checked) {
            newList.extras[extraIndex].checked = false;
            console.log(`🔄 Reset stato preparato per extra ${name} (quantità cambiata: ${previousQuantity} → ${newQuantity})`);
          }
          
          notifications.push({
            type: 'extraQuantityChanged',
            extraName: name,
            oldQuantity: previousQuantity,
            newQuantity: newQuantity,
            timestamp: Timestamp.now(),
            read: false
          });
        }
      });
      
      // Salva le notifiche solo se ci sono modifiche
      if (notifications.length > 0) {
        console.log(`📝 Creazione ${notifications.length} notifiche per modifiche`);
        
        // Salva ogni notifica
        for (const notification of notifications) {
          const notificationId = `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await setDoc(doc(db, 'notifications', notifDocId, 'entries', notificationId), notification);
        }
        
        // Aggiorna contatore notifiche
        const notifDoc = await getDoc(doc(db, 'notifications', notifDocId));
        const currentUnread = notifDoc.exists() ? (notifDoc.data().unreadCount || 0) : 0;
        
        await setDoc(doc(db, 'notifications', notifDocId), {
          unreadCount: currentUnread + notifications.length,
          lastUpdate: Timestamp.now()
        }, { merge: true });
        
        showToast(`Lista aggiornata con ${notifications.length} modifiche`, 'success');
      } else {
        console.log('📝 Nessuna modifica rilevata, nessuna notifica creata');
        showToast('Lista reinviata senza modifiche', 'info');
      }
      
    } catch (error) {
      console.error('Errore creazione notifiche:', error);
    }
  }

  async deleteCurrentList() {
    if (!confirm('Sei sicuro di voler eliminare la lista corrente?')) {
      return;
    }
    
    try {
      this.isUpdatingFromFirestore = true;
      
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      
      await deleteDoc(doc(db, 'weeks', week, 'lists', day));
      
      localStorage.removeItem(`list-${week}-${day}`);
      
      this.currentList = { items: [], extras: [] };
      
      this.renderProducts();
      this.renderExtras();
      
      showToast('Lista eliminata con successo', 'success');
      
      setTimeout(() => {
        this.isUpdatingFromFirestore = false;
      }, 500);
    } catch (error) {
      console.error('Errore eliminazione lista:', error);
      this.isUpdatingFromFirestore = false;
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

  async cleanupOldData() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 2); // 2 giorni fa
      
      // Cleanup old weeks (run only occasionally to avoid performance issues)
      if (Math.random() < 0.1) { // 10% chance to run cleanup
        const weeksSnap = await getDocs(collection(db, 'weeks'));
        const deletePromises = [];
        
        weeksSnap.docs.forEach(weekDoc => {
          const weekId = weekDoc.id;
          const [year, weekNum] = weekId.split('-W');
          
          if (year && weekNum) {
            // Calculate date from week number
            const weekDate = new Date(parseInt(year), 0, 1 + (parseInt(weekNum.replace('W', '')) - 1) * 7);
            
            if (weekDate < cutoffDate) {
              deletePromises.push(this.deleteWeekData(weekId));
            }
          }
        });
        
        if (deletePromises.length > 0) {
          await Promise.all(deletePromises);
          console.log(`🧹 Eliminati ${deletePromises.length} documenti obsoleti`);
        }
      }
    } catch (error) {
      console.error('Errore cleanup dati:', error);
    }
  }

  async deleteWeekData(weekId) {
    try {
      // Delete all lists in the week
      const listsSnap = await getDocs(collection(db, 'weeks', weekId, 'lists'));
      const deletePromises = listsSnap.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      // Delete the week document
      await deleteDoc(doc(db, 'weeks', weekId));
    } catch (error) {
      console.error(`Errore eliminazione settimana ${weekId}:`, error);
    }
  }

  // Cleanup when page unloads
  destroy() {
    if (this.listListener) {
      this.listListener();
    }
  }
}

window.listaManager = new ListaManager();