import { db } from '../shared/firebase.js?v=1.2.0';
import { 
  collection, doc, getDocs, getDoc, setDoc, onSnapshot, deleteDoc,
  query, where, orderBy, Timestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { formatDate, getWeekString, getDayName, showToast, debounce, getContrastColor } from '../shared/utils.js?v=1.2.0';
import { safeQuerySelector, safeAddEventListener, validateInput, initMobileUtils, getCachedProducts, setCachedProducts, getCachedCategories, setCachedCategories, preloadCriticalData, initTheme, initHamburgerMenu } from '../shared/utils.js?v=1.2.0';

class ListaManager {
  constructor() {
    this.selectedDate = new Date();
    this.categories = [];
    this.products = [];
    this.currentList = { items: [], extras: [], status: {}, version: 0 };
    this.selectedCategory = '';
    this.searchTerm = '';
    this.collapsedCategories = new Set();
    
    this.init();
  }

  async init() {
    initMobileUtils();
    initTheme();
    initHamburgerMenu();
    
    this.setupDateSelector();
    this.setupEventListeners();
    
    document.getElementById('loadingProducts').classList.remove('hidden');
    
    await this.loadData();
    await this.loadCurrentList();
    this.renderProducts();
    this.renderExtras();
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
    });
  }

  setupEventListeners() {
    const searchInput = safeQuerySelector('#searchInput');
    if (searchInput) {
      safeAddEventListener(searchInput, 'input', debounce((e) => {
        this.searchTerm = e.target.value.toLowerCase();
        this.renderProducts();
      }, 300));
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
      
      const listDoc = await getDoc(doc(db, 'weeks', week, 'lists', day));
      
      if (listDoc.exists()) {
        this.currentList = listDoc.data();
      } else {
        this.currentList = { items: [], extras: [], status: {}, version: 0 };
      }
      
      this.renderProducts();
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
  }

  renderProducts() {
    const container = document.getElementById('productsList');
    const loading = document.getElementById('loadingProducts');
    
    if (!container) return;
    
    loading.classList.add('hidden');
    container.classList.remove('hidden');
    
    let filteredProducts = this.products.filter(product => {
      const matchesSearch = !this.searchTerm || 
        product.name.toLowerCase().includes(this.searchTerm);
      const matchesCategory = !this.selectedCategory || 
        product.categoryId === this.selectedCategory;
      return matchesSearch && matchesCategory;
    });

    const groupedProducts = new Map();
    filteredProducts.forEach(product => {
      if (!groupedProducts.has(product.categoryId)) {
        groupedProducts.set(product.categoryId, []);
      }
      groupedProducts.get(product.categoryId).push(product);
    });

    container.innerHTML = '';
    
    const sortedCategoryEntries = Array.from(groupedProducts.entries()).sort(([categoryIdA], [categoryIdB]) => {
      const categoryA = this.categories.find(c => c.id === categoryIdA);
      const categoryB = this.categories.find(c => c.id === categoryIdB);
      if (!categoryA || !categoryB) return 0;
      return categoryA.name.localeCompare(categoryB.name);
    });
    
    sortedCategoryEntries.forEach(([categoryId, products]) => {
      const categorySection = this.createCategorySection(categoryId, products);
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
    this.renderProducts();
  }

  expandAllCategories() {
    this.collapsedCategories.clear();
    this.saveCollapsedState();
    this.renderProducts();
    showToast('Tutte le categorie espanse', 'success');
  }

  collapseAllCategories() {
    const categoryIds = [...new Set(this.products.map(p => p.categoryId))];
    this.collapsedCategories = new Set(categoryIds);
    this.saveCollapsedState();
    this.renderProducts();
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