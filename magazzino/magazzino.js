import { db } from '../shared/firebase.js?v=1.3.0';
import { 
  collection, doc, getDocs, getDoc, setDoc, onSnapshot, deleteDoc,
  query, where, orderBy, Timestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { formatDate, getWeekString, getDayName, showToast, getContrastColor } from '../shared/utils.js?v=1.3.0';
import { safeQuerySelector, safeAddEventListener, initMobileUtils, initTheme, initHamburgerMenu } from '../shared/utils.js?v=1.3.0';
import { productsLoader } from '../shared/products-loader.js?v=1.3.0';

class MagazzinoManager {
  constructor() {
    this.selectedDate = new Date();
    this.categories = [];
    this.products = [];
    this.currentList = null;
    this.notifications = [];
    this.collapsedCategories = new Set();
    this.listListener = null;
    this.notificationListener = null;
    
    this.init();
  }

  async init() {
    initMobileUtils();
    initTheme();
    initHamburgerMenu();
    
    this.setupDateSelector();
    this.setupEventListeners();
    
    document.getElementById('loadingList').classList.remove('hidden');
    
    await this.loadData();
    await this.loadCurrentList();
    await this.loadNotifications();
  }
  
  async loadData() {
    try {
      const { products, categories } = await productsLoader.loadProducts();
      this.products = products;
      this.categories = categories;
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
      this.loadNotifications();
    });
  }

  setupEventListeners() {
    // Global controls
    const expandAllBtn = safeQuerySelector('#expandAllBtn');
    if (expandAllBtn) {
      safeAddEventListener(expandAllBtn, 'click', () => this.expandAllCategories());
    }

    const collapseAllBtn = safeQuerySelector('#collapseAllBtn');
    if (collapseAllBtn) {
      safeAddEventListener(collapseAllBtn, 'click', () => this.collapseAllCategories());
    }

    const markAllPreparedBtn = safeQuerySelector('#markAllPreparedBtn');
    if (markAllPreparedBtn) {
      safeAddEventListener(markAllPreparedBtn, 'click', () => this.markAllPrepared());
    }

    const markAllUnpreparedBtn = safeQuerySelector('#markAllUnpreparedBtn');
    if (markAllUnpreparedBtn) {
      safeAddEventListener(markAllUnpreparedBtn, 'click', () => this.markAllUnprepared());
    }

    const markAllReadBtn = safeQuerySelector('#markAllReadBtn');
    if (markAllReadBtn) {
      safeAddEventListener(markAllReadBtn, 'click', () => this.markAllNotificationsRead());
    }
  }

  async loadCurrentList() {
    try {
      // Clean up existing listener
      if (this.listListener) {
        this.listListener();
        this.listListener = null;
      }

      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      
      // Setup real-time listener for the list
      this.listListener = onSnapshot(
        doc(db, 'weeks', week, 'lists', day),
        (docSnapshot) => {
          if (docSnapshot.exists()) {
            const newData = docSnapshot.data();
            const hadList = this.currentList !== null;
            this.currentList = newData;
            
            this.renderChecklist();
            
            // Show notification if list was just submitted
            if (!hadList && newData.status === 'submitted') {
              showToast('Nuova lista ricevuta!', 'success');
            }
          } else {
            this.currentList = null;
            this.showEmptyState();
          }
          
          document.getElementById('loadingList').classList.add('hidden');
        },
        (error) => {
          console.error('Errore listener lista:', error);
          this.showError('Errore nel caricamento della lista');
          document.getElementById('loadingList').classList.add('hidden');
        }
      );

      const listDoc = await getDoc(doc(db, 'weeks', week, 'lists', day));
      
      if (listDoc.exists()) {
        this.currentList = listDoc.data();
        this.renderChecklist();
      } else {
        this.currentList = null;
        this.showEmptyState();
      }
      
      document.getElementById('loadingList').classList.add('hidden');
    } catch (error) {
      console.error('Errore caricamento lista:', error);
      this.showError('Errore nel caricamento della lista');
      document.getElementById('loadingList').classList.add('hidden');
    }
  }

  async loadNotifications() {
    try {
      // Clean up existing notification listener
      if (this.notificationListener) {
        this.notificationListener();
        this.notificationListener = null;
      }

      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      const notifDocId = `${week}_${day}`;
      
      // Setup real-time listener for notifications
      this.notificationListener = onSnapshot(
        doc(db, 'notifications', notifDocId),
        async (docSnapshot) => {
          if (docSnapshot.exists()) {
            const notifData = docSnapshot.data();
            
            // Load notification entries
            const entriesSnap = await getDocs(collection(db, 'notifications', notifDocId, 'entries'));
            this.notifications = entriesSnap.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })).sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
            
            this.renderNotifications(notifData.unreadCount || 0);
          } else {
            this.notifications = [];
            this.hideNotifications();
          }
        },
        (error) => {
          console.error('Errore listener notifiche:', error);
        }
      );

      const notifDoc = await getDoc(doc(db, 'notifications', notifDocId));
      
      if (notifDoc.exists()) {
        const notifData = notifDoc.data();
        
        const entriesSnap = await getDocs(collection(db, 'notifications', notifDocId, 'entries'));
        this.notifications = entriesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })).sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
        
        this.renderNotifications(notifData.unreadCount || 0);
      } else {
        this.notifications = [];
        this.hideNotifications();
      }
    } catch (error) {
      console.error('Errore caricamento notifiche:', error);
      this.notifications = [];
      this.hideNotifications();
    }
  }

  renderNotifications(unreadCount) {
    const panel = safeQuerySelector('#notificationPanel');
    const badge = safeQuerySelector('#notificationBadge');
    const list = safeQuerySelector('#notificationList');
    
    if (!panel || !badge || !list) return;
    
    if (this.notifications.length === 0) {
      panel.classList.add('hidden');
      return;
    }
    
    panel.classList.remove('hidden');
    badge.textContent = `${unreadCount} non lette`;
    
    list.innerHTML = '';
    
    this.notifications.forEach(notification => {
      const notifDiv = document.createElement('div');
      notifDiv.className = `notification-item ${notification.read ? 'read' : ''}`;
      
      let message = '';
      let className = '';
      
      switch (notification.type) {
        case 'added':
          message = `➕ Aggiunto: ${notification.name} (${notification.quantity})`;
          className = 'notification-added';
          break;
        case 'removed':
          message = `➖ Rimosso: ${notification.name} (${notification.quantity})`;
          className = 'notification-removed';
          break;
        case 'qtyChanged':
          message = `🔄 Modificato: ${notification.name} (${notification.oldQuantity} → ${notification.newQuantity})`;
          className = 'notification-changed';
          break;
        case 'listSubmitted':
          message = `📝 ${notification.message}`;
          className = 'notification-success';
          break;
        case 'productChecked':
          message = `✅ Preparato: ${notification.name}`;
          className = 'notification-success';
          break;
        case 'productUnchecked':
          message = `⏳ Da preparare: ${notification.name}`;
          className = 'notification-warning';
          break;
        case 'extraChecked':
          message = `✅ Extra preparato: ${notification.name}`;
          className = 'notification-success';
          break;
        case 'extraUnchecked':
          message = `⏳ Extra da preparare: ${notification.name}`;
          className = 'notification-warning';
          break;
        default:
          message = `📝 ${notification.type}: ${notification.name}`;
          className = 'notification-changed';
      }
      
      notifDiv.classList.add(className);
      notifDiv.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 0.25rem;">${message}</div>
        <div style="font-size: 0.75rem; opacity: 0.8;">
          ${notification.timestamp.toDate().toLocaleString('it-IT')}
        </div>
      `;
      
      list.appendChild(notifDiv);
    });
  }

  hideNotifications() {
    const panel = safeQuerySelector('#notificationPanel');
    if (panel) {
      panel.classList.add('hidden');
    }
  }

  async markAllNotificationsRead() {
    try {
      if (this.notifications.length === 0) {
        showToast('Nessuna notifica da segnare', 'info');
        return;
      }
      
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      const notifDocId = `${week}_${day}`;
      
      await setDoc(doc(db, 'notifications', notifDocId), {
        unreadCount: 0,
        lastUpdate: Timestamp.now()
      }, { merge: true });
      
      const batch = [];
      for (const notification of this.notifications) {
        if (!notification.read) {
          batch.push(
            updateDoc(doc(db, 'notifications', notifDocId, 'entries', notification.id), {
              read: true
            })
          );
        }
      }
      
      await Promise.all(batch);
      
      showToast('Tutte le notifiche segnate come lette', 'success');
    } catch (error) {
      console.error('Errore aggiornamento notifiche:', error);
      showToast('Errore durante l\'aggiornamento delle notifiche', 'error');
    }
  }

  renderChecklist() {
    const container = safeQuerySelector('#checklistContainer');
    const emptyState = safeQuerySelector('#emptyState');
    
    if (!container || !emptyState) return;
    
    if (!this.currentList || (!this.currentList.items?.length && !this.currentList.extras?.length)) {
      this.showEmptyState();
      return;
    }
    
    container.classList.remove('hidden');
    emptyState.classList.add('hidden');
    
    container.innerHTML = '';
    
    // Group products by category
    const groupedProducts = new Map();
    
    if (this.currentList.items) {
      this.currentList.items.forEach(item => {
        const product = this.products.find(p => p.id === item.id);
        if (product) {
          if (!groupedProducts.has(product.categoryId)) {
            groupedProducts.set(product.categoryId, []);
          }
          groupedProducts.get(product.categoryId).push({
            ...product,
            quantity: item.quantity,
            checked: item.checked || false
          });
        }
      });
    }
    
    // Render categories
    const sortedCategoryEntries = Array.from(groupedProducts.entries()).sort(([categoryIdA], [categoryIdB]) => {
      const categoryA = this.categories.find(c => c.id === categoryIdA);
      const categoryB = this.categories.find(c => c.id === categoryIdB);
      if (!categoryA || !categoryB) return 0;
      return categoryA.name.localeCompare(categoryB.name);
    });
    
    sortedCategoryEntries.forEach(([categoryId, products]) => {
      const categorySection = this.createCategoryChecklistSection(categoryId, products);
      if (categorySection) {
        container.appendChild(categorySection);
      }
    });
    
    // Render extras if any
    if (this.currentList.extras && this.currentList.extras.length > 0) {
      const extrasSection = this.createExtrasSection();
      if (extrasSection) {
        container.appendChild(extrasSection);
      }
    }
  }

  createCategoryChecklistSection(categoryId, products) {
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
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.3s ease;
    `;
    
    const checkedCount = products.filter(p => p.checked).length;
    const totalCount = products.length;
    
    categoryHeader.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="transition: transform 0.3s; ${isCollapsed ? 'transform: rotate(-90deg);' : ''}">▼</span>
        <span>📂</span>
        <span>${category.name}</span>
      </div>
      <span style="font-size: 0.8rem; opacity: 0.8;">${checkedCount}/${totalCount}</span>
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
    productsGrid.style.display = 'grid';
    productsGrid.style.gap = '0.5rem';

    products.forEach(product => {
      const productCard = this.createProductChecklistCard(product, category);
      productsGrid.appendChild(productCard);
    });

    categoryContent.appendChild(productsGrid);
    categorySection.appendChild(categoryContent);
    return categorySection;
  }

  createProductChecklistCard(product, category) {
    const card = document.createElement('div');
    card.className = `product-card ${product.checked ? 'checked' : ''}`;
    card.style.cssText = `
      background: var(--bg-card);
      border: 2px solid ${product.checked ? category.colorHex : 'var(--border-color)'};
      border-radius: 8px;
      padding: 1rem;
      transition: all 0.3s ease;
      ${product.checked ? `background: ${category.colorHex}10;` : ''}
    `;
    
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 0.25rem; ${product.checked ? 'text-decoration: line-through; opacity: 0.7;' : ''}">
            ${product.name}
            ${product.unit ? `<span class="unit-badge">${product.unit}</span>` : ''}
          </div>
          <div style="font-size: 0.875rem; color: var(--text-secondary);">
            Quantità: ${product.quantity}
            ${product.notes ? `<br>Note: ${product.notes}` : ''}
          </div>
        </div>
        <label style="display: flex; align-items: center; cursor: pointer;">
          <input type="checkbox" ${product.checked ? 'checked' : ''} 
                 data-product-id="${product.id}"
                 style="width: 20px; height: 20px; margin-right: 0.5rem;">
          <span style="font-size: 0.875rem; font-weight: 600;">
            ${product.checked ? '✅ Preparato' : '⏳ Da preparare'}
          </span>
        </label>
      </div>
    `;

    // Add event listener for checkbox
    const checkbox = card.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        this.toggleProductCheck(product.id, e.target.checked);
      });
    }

    return card;
  }

  createExtrasSection() {
    const extrasSection = document.createElement('div');
    extrasSection.className = 'category-section';
    extrasSection.style.cssText = `
      background: linear-gradient(135deg, #f59e0b10 0%, transparent 100%);
      border: 1px solid #f59e0b30;
      border-radius: 12px;
      border-left: 4px solid #f59e0b;
      margin-bottom: 1rem;
    `;
    
    const extrasHeader = document.createElement('div');
    extrasHeader.className = 'category-header';
    extrasHeader.style.cssText = `
      color: #f59e0b;
      padding: 0.75rem 1rem;
      background: #f59e0b08;
      border-bottom: 1px solid #f59e0b20;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    
    const checkedExtras = this.currentList.extras.filter(e => e.checked).length;
    const totalExtras = this.currentList.extras.length;
    
    extrasHeader.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span>➕</span>
        <span>Prodotti Extra</span>
      </div>
      <span style="font-size: 0.8rem; opacity: 0.8;">${checkedExtras}/${totalExtras}</span>
    `;
    
    extrasSection.appendChild(extrasHeader);

    const extrasContent = document.createElement('div');
    extrasContent.style.padding = '0.5rem';
    
    const extrasGrid = document.createElement('div');
    extrasGrid.style.display = 'grid';
    extrasGrid.style.gap = '0.5rem';

    this.currentList.extras.forEach((extra, index) => {
      const extraCard = this.createExtraChecklistCard(extra, index);
      extrasGrid.appendChild(extraCard);
    });

    extrasContent.appendChild(extrasGrid);
    extrasSection.appendChild(extrasContent);
    return extrasSection;
  }

  createExtraChecklistCard(extra, index) {
    const card = document.createElement('div');
    card.className = `product-card ${extra.checked ? 'checked' : ''}`;
    card.style.cssText = `
      background: var(--bg-card);
      border: 2px solid ${extra.checked ? '#f59e0b' : 'var(--border-color)'};
      border-radius: 8px;
      padding: 1rem;
      transition: all 0.3s ease;
      ${extra.checked ? 'background: #f59e0b10;' : ''}
    `;
    
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 0.25rem; ${extra.checked ? 'text-decoration: line-through; opacity: 0.7;' : ''}">
            ${extra.name}
          </div>
          <div style="font-size: 0.875rem; color: var(--text-secondary);">
            Quantità: ${extra.quantity}
          </div>
        </div>
        <label style="display: flex; align-items: center; cursor: pointer;">
          <input type="checkbox" ${extra.checked ? 'checked' : ''} 
                 data-extra-index="${index}"
                 style="width: 20px; height: 20px; margin-right: 0.5rem;">
          <span style="font-size: 0.875rem; font-weight: 600;">
            ${extra.checked ? '✅ Preparato' : '⏳ Da preparare'}
          </span>
        </label>
      </div>
    `;

    // Add event listener for checkbox
    const checkbox = card.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        this.toggleExtraCheck(index, e.target.checked);
      });
    }

    return card;
  }

  async toggleProductCheck(productId, checked) {
    if (!this.currentList || !this.currentList.items) return;
    
    const itemIndex = this.currentList.items.findIndex(item => item.id === productId);
    if (itemIndex === -1) return;
    
    this.currentList.items[itemIndex].checked = checked;
    
    await this.saveChecklist();
    this.renderChecklist();
  }

  async toggleExtraCheck(extraIndex, checked) {
    if (!this.currentList || !this.currentList.extras) return;
    
    if (extraIndex < 0 || extraIndex >= this.currentList.extras.length) return;
    
    this.currentList.extras[extraIndex].checked = checked;
    
    await this.saveChecklist();
    this.renderChecklist();
  }

  async saveChecklist() {
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      
      this.currentList.lastModifiedBy = this.getClientId();
      this.currentList.updatedAt = Timestamp.now();
      
      await setDoc(doc(db, 'weeks', week, 'lists', day), this.currentList);
      
      // Don't show toast for individual saves, only for bulk operations
    } catch (error) {
      console.error('Errore salvataggio checklist:', error);
      showToast('Errore durante il salvataggio', 'error');
    }
  }

  showEmptyState() {
    const container = safeQuerySelector('#checklistContainer');
    const emptyState = safeQuerySelector('#emptyState');
    
    if (container) container.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
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

window.magazzinoManager = new MagazzinoManager();