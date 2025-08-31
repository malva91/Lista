/**
 * Product Loader - Gestisce il caricamento dei prodotti dal JSON
 * Version: 1.2.0
 */

class ProductsLoader {
  constructor() {
    this.products = [];
    this.categories = [];
    this.isLoaded = false;
    this.loadPromise = null;
    this.cache = new Map();
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
      console.log('🔄 Caricamento prodotti dal JSON...');
      const startTime = performance.now();

      const response = await fetch('/prodotti.json?v=1.2.0');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Validazione JSON
      this.validateProductsData(data);
      
      // Processa categorie
      this.categories = (data.categories || [])
        .filter(cat => cat.id && cat.name && cat.colorHex)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      // Processa prodotti
      this.products = (data.products || [])
        .filter(prod => prod.id && prod.name && prod.categoryId)
        .filter(prod => prod.active !== false) // Solo prodotti attivi
        .sort((a, b) => {
          // Prima per categoria, poi per priorità, poi per nome
          const catA = this.categories.find(c => c.id === a.categoryId);
          const catB = this.categories.find(c => c.id === b.categoryId);
          
          if (catA && catB && catA.order !== catB.order) {
            return catA.order - catB.order;
          }
          
          if (a.priority !== b.priority) {
            return (a.priority || 999) - (b.priority || 999);
          }
          
          return a.name.localeCompare(b.name);
        });

      // Crea indici per performance
      this.createIndices();
      
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

  createIndices() {
    // Indice prodotti per categoria
    this.cache.set('productsByCategory', new Map());
    const productsByCategory = this.cache.get('productsByCategory');
    
    this.products.forEach(product => {
      if (!productsByCategory.has(product.categoryId)) {
        productsByCategory.set(product.categoryId, []);
      }
      productsByCategory.get(product.categoryId).push(product);
    });

    // Indice prodotti per ID
    this.cache.set('productsById', new Map());
    const productsById = this.cache.get('productsById');
    
    this.products.forEach(product => {
      productsById.set(product.id, product);
    });

    // Indice categorie per ID
    this.cache.set('categoriesById', new Map());
    const categoriesById = this.cache.get('categoriesById');
    
    this.categories.forEach(category => {
      categoriesById.set(category.id, category);
    });
  }

  // Metodi di accesso ottimizzati
  getProducts() {
    return this.products;
  }

  getCategories() {
    return this.categories;
  }

  getProductById(id) {
    const productsById = this.cache.get('productsById');
    return productsById ? productsById.get(id) : this.products.find(p => p.id === id);
  }

  getCategoryById(id) {
    const categoriesById = this.cache.get('categoriesById');
    return categoriesById ? categoriesById.get(id) : this.categories.find(c => c.id === id);
  }

  getProductsByCategory(categoryId) {
    const productsByCategory = this.cache.get('productsByCategory');
    return productsByCategory ? productsByCategory.get(categoryId) || [] : 
           this.products.filter(p => p.categoryId === categoryId);
  }

  searchProducts(searchTerm) {
    if (!searchTerm) return this.products;
    
    const term = searchTerm.toLowerCase();
    return this.products.filter(product => 
      product.name.toLowerCase().includes(term) ||
      (product.notes && product.notes.toLowerCase().includes(term))
    );
  }

  filterProducts(filters = {}) {
    let filtered = this.products;

    if (filters.categoryId) {
      filtered = filtered.filter(p => p.categoryId === filters.categoryId);
    }

    if (filters.important !== undefined) {
      filtered = filtered.filter(p => p.important === filters.important);
    }

    if (filters.active !== undefined) {
      filtered = filtered.filter(p => p.active === filters.active);
    }

    if (filters.search) {
      const term = filters.search.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(term) ||
        (p.notes && p.notes.toLowerCase().includes(term))
      );
    }

    return filtered;
  }

  // Metodo per ricaricare i prodotti (utile per sviluppo)
  async reload() {
    this.isLoaded = false;
    this.loadPromise = null;
    this.cache.clear();
    return this.loadProducts();
  }

  // Statistiche
  getStats() {
    return {
      totalProducts: this.products.length,
      totalCategories: this.categories.length,
      visibleCategories: this.getVisibleCategories().length,
      activeProducts: this.products.filter(p => p.active !== false).length,
      importantProducts: this.products.filter(p => p.important).length,
      productsByCategory: this.categories.map(cat => ({
        category: cat.name,
        count: this.getProductsByCategory(cat.id).length
      }))
    };
  }

  // Ottieni solo le categorie che hanno prodotti attivi
  getVisibleCategories() {
    return this.categories.filter(category => {
      const productsInCategory = this.products.filter(p => p.categoryId === category.id);
      return productsInCategory.length > 0;
    });
  }

  // Ottieni tutte le categorie (anche quelle senza prodotti)
  getAllCategories() {
    return this.categories.sort((a, b) => (a.order || 0) - (b.order || 0));
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
}

// Singleton instance
export const productsLoader = new ProductsLoader();

// Utility per compatibilità con il codice esistente
export async function loadProductsFromJSON() {
  return productsLoader.loadProducts();
}

export function getProductsFromCache() {
  return {
    products: productsLoader.getProducts(),
    categories: productsLoader.getCategories()
  };
}