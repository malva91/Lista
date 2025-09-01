import { db } from '../shared/firebase.js?v=1.3.0';
import { 
  collection, doc, getDocs, getDoc, setDoc, updateDoc, onSnapshot, deleteDoc,
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

    const clearNotificationsBtn = safeQuerySelector('#clearNotificationsBtn');
    if (clearNotificationsBtn) {
      safeAddEventListener(clearNotificationsBtn, 'click', () => this.clearAllNotifications());
    }

    const closeNotificationsBtn = safeQuerySelector('#closeNotificationsBtn');
    if (closeNotificationsBtn) {
      safeAddEventListener(closeNotificationsBtn, 'click', () => this.hideNotifications());
    }

    const showNotificationsBtn = safeQuerySelector('#showNotificationsBtn');
    if (showNotificationsBtn) {
      safeAddEventListener(showNotificationsBtn, 'click', () => this.toggleNotifications());
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
            const previousList = this.currentList;
            this.currentList = newData;
            
            // Mantieni stato preparato se la quantità non è cambiata
            if (previousList && previousList.items && newData.items) {
              this.preservePreparedState(previousList, newData);
            }
            
            this.renderChecklist();
            
            // Show notification if list was just submitted
            if (!previousList && newData.status === 'submitted') {
              showToast('Nuova lista ricevuta!', 'success');
            }
            
            // Auto-cleanup old data
            this.cleanupOldData();
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

  preservePreparedState(previousList, newList) {
    if (!previousList.items || !newList.items) return;
    
    // Crea una mappa degli stati precedenti
    const previousStates = new Map();
    previousList.items.forEach(item => {
      if (item.checked) {
        previousStates.set(item.id, item.quantity);
      }
    });
    
    // Mantieni lo stato preparato se la quantità non è cambiata
    newList.items.forEach(item => {
      if (previousStates.has(item.id)) {
        const previousQuantity = previousStates.get(item.id);
        if (item.quantity === previousQuantity) {
          item.checked = true;
        }
      }
    });
    
    // Mantieni anche gli extra preparati se non sono cambiati
    if (previousList.extras && newList.extras) {
      const previousExtras = new Map();
      previousList.extras.forEach(extra => {
        if (extra.checked) {
          previousExtras.set(extra.name, extra.quantity);
        }
      });
      
      newList.extras.forEach(extra => {
        if (previousExtras.has(extra.name)) {
          const previousQuantity = previousExtras.get(extra.name);
          if (extra.quantity === previousQuantity) {
            extra.checked = true;
          }
        }
      });
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
      let details = '';
      let className = '';
      
      switch (notification.type) {
        case 'added':
          message = `➕ Prodotto aggiunto`;
          details = `${notification.name} - Qtà: ${notification.quantity}`;
          className = 'notification-added';
          break;
        case 'removed':
          message = `➖ Prodotto rimosso`;
          details = `${notification.name} - Qtà: ${notification.quantity}`;
          className = 'notification-removed';
          break;
        case 'qtyChanged':
          message = `🔄 Quantità modificata`;
          details = `${notification.name}: ${notification.oldQuantity} → ${notification.newQuantity}`;
          className = 'notification-changed';
          break;
        case 'listSubmitted':
          message = `📝 Lista inviata`;
          details = `${notification.data?.itemsCount || 0} prodotti + ${notification.data?.extrasCount || 0} extra`;
          className = 'notification-success';
          break;
        case 'productChecked':
          message = `✅ Prodotto preparato`;
          details = notification.name;
          className = 'notification-success';
          break;
        case 'productUnchecked':
          message = `⏳ Da preparare`;
          details = notification.name;
          className = 'notification-warning';
          break;
        case 'extraChecked':
          message = `✅ Extra preparato`;
          details = notification.name;
          className = 'notification-success';
          break;
        case 'extraUnchecked':
          message = `⏳ Extra da preparare`;
          details = notification.name;
          className = 'notification-warning';
          break;
        default:
          message = `📝 Modifica`;
          details = `${notification.type}: ${notification.name}`;
          className = 'notification-changed';
      }
      
      notifDiv.classList.add(className);
      notifDiv.innerHTML = `
        <div class="notification-message">${message}</div>
        ${details ? `<div class="notification-details">${details}</div>` : ''}
        <div class="notification-timestamp">
          ${notification.timestamp.toDate().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
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

  toggleNotifications() {
    const panel = safeQuerySelector('#notificationPanel');
    if (panel) {
      if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    }
  }

  async clearAllNotifications() {
    if (!confirm('Eliminare tutte le notifiche? Questa azione non può essere annullata.')) {
      return;
    }
    
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      const notifDocId = `${week}_${day}`;
      
      // Delete all notification entries
      const entriesSnap = await getDocs(collection(db, 'notifications', notifDocId, 'entries'));
      const deletePromises = entriesSnap.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      // Reset notification counter
      await setDoc(doc(db, 'notifications', notifDocId), {
        unreadCount: 0,
        lastUpdate: Timestamp.now()
      });
      
      this.notifications = [];
      this.hideNotifications();
      
      showToast('Tutte le notifiche eliminate', 'success');
    } catch (error) {
      console.error('Errore eliminazione notifiche:', error);
      showToast('Errore durante l\'eliminazione delle notifiche', 'error');
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
          await updateDoc(doc(db, 'notifications', notifDocId, 'entries', notification.id), {
            read: true
          });
        }
      }
      
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
    
    // Calcola statistiche completamento
    const completionStats = this.calculateCompletionStats();
    
    // Aggiungi indicatore generale di completamento
    if (completionStats.totalCategories > 0) {
      const completionIndicator = this.createCompletionIndicator(completionStats);
      container.appendChild(completionIndicator);
    }
    
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

  calculateCompletionStats() {
    if (!this.currentList || !this.currentList.items) {
      return { totalCategories: 0, completedCategories: 0, totalItems: 0, completedItems: 0, totalExtras: 0, completedExtras: 0 };
    }
    
    // Raggruppa prodotti per categoria
    const categoryStats = new Map();
    
    this.currentList.items.forEach(item => {
      const product = this.products.find(p => p.id === item.id);
      if (product) {
        if (!categoryStats.has(product.categoryId)) {
          categoryStats.set(product.categoryId, { total: 0, completed: 0 });
        }
        const stats = categoryStats.get(product.categoryId);
        stats.total++;
        if (item.checked) {
          stats.completed++;
        }
      }
    });
    
    const totalCategories = categoryStats.size;
    const completedCategories = Array.from(categoryStats.values()).filter(stats => stats.completed === stats.total).length;
    
    const totalItems = this.currentList.items.length;
    const completedItems = this.currentList.items.filter(item => item.checked).length;
    
    const totalExtras = this.currentList.extras ? this.currentList.extras.length : 0;
    const completedExtras = this.currentList.extras ? this.currentList.extras.filter(extra => extra.checked).length : 0;
    
    return {
      totalCategories,
      completedCategories,
      totalItems,
      completedItems,
      totalExtras,
      completedExtras,
      categoryStats
    };
  }

  createCompletionIndicator(stats) {
    const indicator = document.createElement('div');
    indicator.className = 'completion-indicator';
    indicator.style.cssText = `
      background: var(--bg-card);
      border: 2px solid var(--border-color);
      border-radius: var(--border-radius-lg);
      padding: var(--spacing-lg);
      margin-bottom: var(--spacing-lg);
      box-shadow: var(--shadow-md);
    `;
    
    const overallProgress = stats.totalItems > 0 ? Math.round((stats.completedItems / stats.totalItems) * 100) : 0;
    const categoryProgress = stats.totalCategories > 0 ? Math.round((stats.completedCategories / stats.totalCategories) * 100) : 0;
    
    let progressColor = '#ef4444'; // Rosso per 0-30%
    if (overallProgress >= 70) progressColor = '#10b981'; // Verde per 70-100%
    else if (overallProgress >= 40) progressColor = '#f59e0b'; // Giallo per 40-69%
    
    indicator.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md);">
        <h3 style="color: var(--text-primary); margin: 0;">📊 Stato Completamento</h3>
        <div style="font-size: var(--text-2xl);">${overallProgress === 100 ? '🎉' : overallProgress >= 70 ? '✅' : overallProgress >= 40 ? '⚠️' : '⏳'}</div>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-md);">
        <div style="text-align: center; background: var(--bg-tertiary); padding: var(--spacing-md); border-radius: var(--border-radius);">
          <div style="font-size: var(--text-xl); font-weight: 700; color: ${progressColor};">${stats.completedItems}/${stats.totalItems}</div>
          <div style="font-size: var(--text-xs); color: var(--text-secondary); font-weight: 600;">PRODOTTI</div>
        </div>
        
        <div style="text-align: center; background: var(--bg-tertiary); padding: var(--spacing-md); border-radius: var(--border-radius);">
          <div style="font-size: var(--text-xl); font-weight: 700; color: ${categoryProgress >= 70 ? '#10b981' : categoryProgress >= 40 ? '#f59e0b' : '#ef4444'};">${stats.completedCategories}/${stats.totalCategories}</div>
          <div style="font-size: var(--text-xs); color: var(--text-secondary); font-weight: 600;">CATEGORIE</div>
        </div>
        
        ${stats.totalExtras > 0 ? `
        <div style="text-align: center; background: var(--bg-tertiary); padding: var(--spacing-md); border-radius: var(--border-radius);">
          <div style="font-size: var(--text-xl); font-weight: 700; color: ${stats.completedExtras === stats.totalExtras ? '#10b981' : '#f59e0b'};">${stats.completedExtras}/${stats.totalExtras}</div>
          <div style="font-size: var(--text-xs); color: var(--text-secondary); font-weight: 600;">EXTRA</div>
        </div>
        ` : ''}
      </div>
      
      <div style="background: var(--bg-secondary); border-radius: var(--border-radius); overflow: hidden; margin-bottom: var(--spacing-sm);">
        <div style="height: 8px; background: ${progressColor}; width: ${overallProgress}%; transition: all 0.5s ease;"></div>
      </div>
      
      <div style="text-align: center; font-size: var(--text-sm); color: var(--text-secondary);">
        <strong>${overallProgress}%</strong> completato
        ${overallProgress === 100 ? ' - 🎉 Lista completata!' : ''}
      </div>
    `;
    
    return indicator;
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
    const isCompleted = checkedCount === totalCount;
    
    categoryHeader.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="transition: transform 0.3s; ${isCollapsed ? 'transform: rotate(-90deg);' : ''}">▼</span>
        <span>${isCompleted ? '✅' : '📂'}</span>
        <span>${category.name}</span>
      </div>
      <span style="font-size: 0.8rem; opacity: 0.8; color: ${isCompleted ? '#10b981' : 'inherit'}; font-weight: ${isCompleted ? '700' : '400'};">${checkedCount}/${totalCount}</span>
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
    
    const product = this.products.find(p => p.id === productId);
    if (product) {
      await this.createCheckNotification(product.name, checked, 'product');
    }
    
    this.currentList.items[itemIndex].checked = checked;
    
    await this.saveChecklist();
    this.renderChecklist();
  }

  async toggleExtraCheck(extraIndex, checked) {
    if (!this.currentList || !this.currentList.extras) return;
    
    if (extraIndex < 0 || extraIndex >= this.currentList.extras.length) return;
    
    const extra = this.currentList.extras[extraIndex];
    if (extra) {
      await this.createCheckNotification(extra.name, checked, 'extra');
    }
    
    this.currentList.extras[extraIndex].checked = checked;
    
    await this.saveChecklist();
    this.renderChecklist();
  }

  async saveChecklist() {
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      
      await setDoc(doc(db, 'weeks', week, 'lists', day), this.currentList);
      
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

  // Category collapse/expand functionality
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

      // Find category ID from the first product in this section
      const firstCheckbox = section.querySelector('input[data-product-id]');
      if (!firstCheckbox) return;

      const productId = firstCheckbox.dataset.productId;
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
    this.renderChecklist(); // Re-render to update all category states
    showToast('Tutte le categorie espanse', 'success');
  }

  collapseAllCategories() {
    if (!this.currentList || !this.currentList.items) {
      showToast('Nessuna lista da chiudere', 'info');
      return;
    }
    
    const categoryIds = [...new Set(this.currentList.items.map(item => {
      const product = this.products.find(p => p.id === item.id);
      return product ? product.categoryId : null;
    }).filter(Boolean))];
    
    this.collapsedCategories = new Set(categoryIds);
    this.renderChecklist(); // Re-render to update all category states
    showToast('Tutte le categorie chiuse', 'success');
  }

  async markAllPrepared() {
    if (!this.currentList || (!this.currentList.items?.length && !this.currentList.extras?.length)) {
      showToast('Nessuna lista da completare', 'info');
      return;
    }
    
    if (!confirm('Segnare tutti i prodotti come preparati?')) {
      return;
    }
    
    try {
      let changedCount = 0;
      
      // Mark all products as checked
      if (this.currentList.items) {
        this.currentList.items.forEach(item => {
          if (!item.checked) {
            item.checked = true;
            changedCount++;
          }
        });
      }
      
      // Mark all extras as checked
      if (this.currentList.extras) {
        this.currentList.extras.forEach(extra => {
          if (!extra.checked) {
            extra.checked = true;
            changedCount++;
          }
        });
      }
      
      if (changedCount > 0) {
        await this.saveChecklist();
        showToast(`${changedCount} prodotti segnati come preparati`, 'success');
      } else {
        showToast('Tutti i prodotti sono già preparati', 'info');
      }
    } catch (error) {
      console.error('Errore completamento lista:', error);
      showToast('Errore durante il completamento', 'error');
    }
  }

  async markAllUnprepared() {
    if (!this.currentList || (!this.currentList.items?.length && !this.currentList.extras?.length)) {
      showToast('Nessuna lista da resettare', 'info');
      return;
    }
    
    if (!confirm('Segnare tutti i prodotti come non preparati?')) {
      return;
    }
    
    try {
      let changedCount = 0;
      
      // Mark all products as unchecked
      if (this.currentList.items) {
        this.currentList.items.forEach(item => {
          if (item.checked) {
            item.checked = false;
            changedCount++;
          }
        });
      }
      
      // Mark all extras as unchecked
      if (this.currentList.extras) {
        this.currentList.extras.forEach(extra => {
          if (extra.checked) {
            extra.checked = false;
            changedCount++;
          }
        });
      }
      
      if (changedCount > 0) {
        await this.saveChecklist();
        showToast(`${changedCount} prodotti segnati come non preparati`, 'warning');
      } else {
        showToast('Tutti i prodotti sono già non preparati', 'info');
      }
    } catch (error) {
      console.error('Errore reset lista:', error);
      showToast('Errore durante il reset', 'error');
    }
  }

  async createCheckNotification(productName, checked, type) {
    try {
      const week = getWeekString(this.selectedDate);
      const day = formatDate(this.selectedDate);
      const notifDocId = `${week}_${day}`;
      
      const notificationType = checked ? 
        (type === 'product' ? 'productChecked' : 'extraChecked') :
        (type === 'product' ? 'productUnchecked' : 'extraUnchecked');
      
      // Create notification entry
      const notificationId = `${notificationType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await setDoc(doc(db, 'notifications', notifDocId, 'entries', notificationId), {
        type: notificationType,
        name: productName,
        timestamp: Timestamp.now(),
        read: false
      });
      
      // Update notification counter
      const notifDoc = await getDoc(doc(db, 'notifications', notifDocId));
      const currentUnread = notifDoc.exists() ? (notifDoc.data().unreadCount || 0) : 0;
      
      await setDoc(doc(db, 'notifications', notifDocId), {
        unreadCount: currentUnread + 1,
        lastUpdate: Timestamp.now()
      }, { merge: true });
      
    } catch (error) {
      console.error('Errore creazione notifica:', error);
    }
  }

  async cleanupOldData() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 2); // 2 giorni fa
      
      // Cleanup old weeks
      const weeksSnap = await getDocs(collection(db, 'weeks'));
      const deletePromises = [];
      
      weeksSnap.docs.forEach(weekDoc => {
        const weekId = weekDoc.id;
        const [year, weekNum] = weekId.split('-W');
        
        // Calculate date from week number
        const weekDate = new Date(parseInt(year), 0, 1 + (parseInt(weekNum.replace('W', '')) - 1) * 7);
        
        if (weekDate < cutoffDate) {
          deletePromises.push(this.deleteWeekData(weekId));
        }
      });
      
      // Cleanup old notifications
      const notificationsSnap = await getDocs(collection(db, 'notifications'));
      notificationsSnap.docs.forEach(notifDoc => {
        const notifId = notifDoc.id;
        const [year, weekNum, day] = notifId.split('_');
        
        if (year && weekNum && day) {
          const notifDate = new Date(`${year}-${weekNum.replace('W', '')}-${day}`);
          if (notifDate < cutoffDate) {
            deletePromises.push(deleteDoc(notifDoc.ref));
          }
        }
      });
      
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        console.log(`🧹 Eliminati ${deletePromises.length} documenti obsoleti`);
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

  getClientId() {
    let clientId = localStorage.getItem('clientId');
    if (!clientId) {
      clientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('clientId', clientId);
    }
    return clientId;
  }

  // Cleanup when page unloads
  destroy() {
    if (this.listListener) {
      this.listListener();
    }
    if (this.notificationListener) {
      this.notificationListener();
    }
  }
}

window.magazzinoManager = new MagazzinoManager();