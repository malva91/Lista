/**
 * Product Loader - Gestisce il caricamento dei prodotti dal JSON e Firestore
 * Version: 1.3.0 - Simplified
 */

import { db } from './firebase.js?v=1.3.0';
import { collection, getDocs, doc, setDoc, deleteDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

class ProductsLoader {
  constructor() {
    this.products = [];
    this.categories = [];
    this.isLoaded = false;
    this.loadPromise = null;
    this.useFirestore = false; // Flag per usare Firestore invece del JSON
    this.listeners = new Map(); // Store real-time listeners
    this.callbacks = new Set(); // Store update callbacks
  }

  async loadProducts() {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this._loadProductsInternal();
    return this.loadPromise;
  }

  async _loadProductsInternal() {
    if (this.isLoaded) {
      return { products: this.products, categories: this.categories };
    }

    try {
      console.log('🔄 Caricamento prodotti...');
      const startTime = performance.now();

      // Prima prova a caricare da Firestore
      const firestoreData = await this.loadFromFirestore();
      
      if (firestoreData.hasData) {
        console.log('📊 Dati caricati da Firestore');
        this.products = firestoreData.products;
        this.categories = firestoreData.categories;
        this.useFirestore = true;
        this.setupRealtimeSync();
      } else {
        // Fallback al JSON statico
        console.log('📄 Caricamento da JSON statico...');
        const jsonData = await this.loadFromJSON();
        this.products = jsonData.products;
        this.categories = jsonData.categories;
        this.useFirestore = false;
      }
      
      this.isLoaded = true;
      
      const loadTime = performance.now() - startTime;
      console.log(`✅ Prodotti caricati in ${loadTime.toFixed(2)}ms`);
      console.log(`📊 ${this.products.length} prodotti, ${this.categories.length} categorie`);
      
      return { products: this.products, categories: this.categories };
      
    } catch (error) {
      console.error('❌ Errore caricamento prodotti:', error);
      this.isLoaded = false;
      this.loadPromise = null;
      throw new Error(`Impossibile caricare il catalogo prodotti: ${error.message}`);
    }
  }

  setupRealtimeSync() {
    if (!this.useFirestore) return;
    
    // Setup real-time listeners for categories and products
    const categoriesListener = onSnapshot(
      collection(db, 'prodottiCatalogo', 'data', 'categories'),
      (snapshot) => {
        const categories = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })).filter(cat => cat.active !== false);
        
        this.categories = categories;
        this.notifyCallbacks('categories', categories);
      },
      (error) => {
        console.error('Errore listener categorie:', error);
      }
    );
    
    const productsListener = onSnapshot(
      collection(db, 'prodottiCatalogo', 'data', 'products'),
      (snapshot) => {
        const products = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })).filter(prod => prod.active !== false);
        
        this.products = products;
        this.notifyCallbacks('products', products);
      },
      (error) => {
        console.error('Errore listener prodotti:', error);
      }
    );
    
    this.listeners.set('categories', categoriesListener);
    this.listeners.set('products', productsListener);
  }

  // Subscribe to real-time updates
  onUpdate(callback) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  notifyCallbacks(type, data) {
    this.callbacks.forEach(callback => {
      try {
        callback(type, data);
      } catch (error) {
        console.error('Errore callback update:', error);
      }
    });
  }

  async loadFromFirestore() {
    try {
      const [categoriesSnap, productsSnap] = await Promise.all([
        getDocs(collection(db, 'prodottiCatalogo', 'data', 'categories')),
        getDocs(collection(db, 'prodottiCatalogo', 'data', 'products'))
      ]);

      if (categoriesSnap.empty && productsSnap.empty) {
        return { hasData: false };
      }

      const categories = categoriesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const products = productsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return {
        hasData: true,
        categories: categories.filter(cat => cat.active !== false),
        products: products.filter(prod => prod.active !== false)
      };
    } catch (error) {
      console.warn('Firestore non disponibile, uso JSON:', error);
      return { hasData: false };
    }
  }

  async loadFromJSON() {
    const response = await fetch('/prodotti.json?v=1.3.0');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Validazione JSON
    this.validateProductsData(data);
    
    // Processa categorie
    const categories = (data.categories || [])
      .filter(cat => cat.id && cat.name && cat.colorHex)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    
    // Processa prodotti (solo attivi)
    const products = (data.products || [])
      .filter(prod => prod.id && prod.name && prod.categoryId && prod.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name));

    return { products, categories };
  }

  validateProductsData(data) {
    if (!data) {
      throw new Error('JSON vuoto o non valido');
    }

    if (!Array.isArray(data.categories)) {
      throw new Error('Campo "categories" mancante o non valido');
    }

    if (!Array.isArray(data.products)) {
      throw new Error('Campo "products" mancante o non valido');
    }

    // Validazione categorie
    const categoryIds = new Set();
    data.categories.forEach((cat, index) => {
      if (!cat.id) {
        throw new Error(`Categoria ${index}: campo "id" mancante`);
      }
      if (!cat.name) {
        throw new Error(`Categoria ${cat.id}: campo "name" mancante`);
      }
      if (!cat.colorHex || !/^#[0-9A-Fa-f]{6}$/.test(cat.colorHex)) {
        throw new Error(`Categoria ${cat.id}: campo "colorHex" mancante o non valido`);
      }
      if (categoryIds.has(cat.id)) {
        throw new Error(`Categoria ${cat.id}: ID duplicato`);
      }
      categoryIds.add(cat.id);
    });

    // Validazione prodotti
    const productIds = new Set();
    data.products.forEach((prod, index) => {
      if (!prod.id) {
        throw new Error(`Prodotto ${index}: campo "id" mancante`);
      }
      if (!prod.name) {
        throw new Error(`Prodotto ${prod.id}: campo "name" mancante`);
      }
      if (!prod.categoryId) {
        throw new Error(`Prodotto ${prod.id}: campo "categoryId" mancante`);
      }
      if (!categoryIds.has(prod.categoryId)) {
        throw new Error(`Prodotto ${prod.id}: categoria "${prod.categoryId}" non esistente`);
      }
      if (productIds.has(prod.id)) {
        throw new Error(`Prodotto ${prod.id}: ID duplicato`);
      }
      productIds.add(prod.id);
    });

    console.log(`✅ JSON validato: ${data.categories.length} categorie, ${data.products.length} prodotti`);
  }

  // Metodi di accesso
  getProducts() {
    return this.products;
  }

  getCategories() {
    return this.categories;
  }

  getProductById(id) {
    return this.products.find(p => p.id === id);
  }

  getCategoryById(id) {
    return this.categories.find(c => c.id === id);
  }

  getProductsByCategory(categoryId) {
    return this.products.filter(p => p.categoryId === categoryId);
  }

  // Metodi per salvare su Firestore
  async saveToFirestore(categories, products) {
    try {
      // Salva categorie
      const categoryPromises = categories.map(category => 
        setDoc(doc(db, 'prodottiCatalogo', 'data', 'categories', category.id), category)
      );

      // Salva prodotti
      const productPromises = products.map(product => 
        setDoc(doc(db, 'prodottiCatalogo', 'data', 'products', product.id), product)
      );

      await Promise.all([...categoryPromises, ...productPromises]);
      
      // Aggiorna cache locale
      this.categories = categories;
      this.products = products;
      this.useFirestore = true;
      
      console.log('✅ Dati salvati su Firestore');
      return true;
    } catch (error) {
      console.error('❌ Errore salvataggio Firestore:', error);
      throw error;
    }
  }

  async deleteFromFirestore(type, id) {
    try {
      const collectionName = type === 'category' ? 'categories' : 'products';
      await deleteDoc(doc(db, 'prodottiCatalogo', 'data', collectionName, id));
      
      // Aggiorna cache locale
      if (type === 'category') {
        this.categories = this.categories.filter(c => c.id !== id);
      } else {
        this.products = this.products.filter(p => p.id !== id);
      }
      
      console.log(`✅ ${type} ${id} eliminato da Firestore`);
      return true;
    } catch (error) {
      console.error(`❌ Errore eliminazione ${type}:`, error);
      throw error;
    }
  }

  // Metodo per ricaricare i prodotti
  async reload() {
    this.isLoaded = false;
    this.loadPromise = null;
    this.cleanup();
    return this.loadProducts();
  }

  cleanup() {
    // Clean up listeners
    this.listeners.forEach(listener => {
      if (typeof listener === 'function') {
        listener();
      }
    });
    this.listeners.clear();
    this.callbacks.clear();
  }

  // Statistiche
  getStats() {
    return {
      totalProducts: this.products.length,
      totalCategories: this.categories.length,
      activeProducts: this.products.filter(p => p.active !== false).length,
      productsByCategory: this.categories.map(cat => ({
        category: cat.name,
        count: this.getProductsByCategory(cat.id).length
      }))
    };
  }

  // Ottieni categorie con conteggio prodotti
  getCategoriesWithCount() {
    return this.categories.map(category => {
      const productsInCategory = this.products.filter(p => p.categoryId === category.id);
      return {
        ...category,
        productCount: productsInCategory.length,
        hasProducts: productsInCategory.length > 0
      };
    }).sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  // Esporta dati per JSON
  exportToJSON() {
    return {
      version: "1.3.0",
      lastUpdated: new Date().toISOString(),
      categories: this.categories,
      products: this.products
    };
  }
}

// Singleton instance
export const productsLoader = new ProductsLoader();