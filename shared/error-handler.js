/**
 * Error Handler - Gestione centralizzata degli errori
 * Version: 1.3.0
 */

class ErrorHandler {
  constructor() {
    this.setupGlobalErrorHandling();
    this.errorQueue = [];
    this.maxErrors = 10;
  }

  setupGlobalErrorHandling() {
    // Gestione errori JavaScript
    window.addEventListener('error', (event) => {
      this.handleError({
        type: 'javascript',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
        timestamp: new Date().toISOString()
      });
    });

    // Gestione promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError({
        type: 'promise',
        message: event.reason?.message || 'Promise rejection',
        reason: event.reason,
        timestamp: new Date().toISOString()
      });
    });

    // Gestione errori di rete
    window.addEventListener('offline', () => {
      this.handleNetworkError('offline');
    });

    window.addEventListener('online', () => {
      this.handleNetworkError('online');
    });
  }

  handleError(errorInfo) {
    console.error('🚨 Errore catturato:', errorInfo);
    
    // Aggiungi alla coda errori
    this.errorQueue.push(errorInfo);
    
    // Mantieni solo gli ultimi errori
    if (this.errorQueue.length > this.maxErrors) {
      this.errorQueue.shift();
    }
    
    // Mostra notifica all'utente solo per errori critici
    if (this.isCriticalError(errorInfo)) {
      this.showUserNotification(errorInfo);
    }
    
    // Log per debugging
    this.logError(errorInfo);
  }

  isCriticalError(errorInfo) {
    const criticalPatterns = [
      /firebase/i,
      /network/i,
      /fetch/i,
      /connection/i,
      /timeout/i
    ];
    
    return criticalPatterns.some(pattern => 
      pattern.test(errorInfo.message) || 
      pattern.test(errorInfo.filename || '')
    );
  }

  showUserNotification(errorInfo) {
    let userMessage = 'Si è verificato un errore';
    
    if (errorInfo.message?.includes('firebase') || errorInfo.message?.includes('firestore')) {
      userMessage = 'Problema di connessione al database';
    } else if (errorInfo.message?.includes('fetch') || errorInfo.message?.includes('network')) {
      userMessage = 'Problema di connessione di rete';
    } else if (errorInfo.type === 'promise') {
      userMessage = 'Errore durante l\'operazione';
    }
    
    // Usa showToast se disponibile
    if (typeof showToast === 'function') {
      showToast(userMessage, 'error', 3000);
    } else {
      // Fallback
      console.warn('showToast non disponibile, errore:', userMessage);
    }
  }

  handleNetworkError(status) {
    if (status === 'offline') {
      if (typeof showToast === 'function') {
        showToast('Connessione persa - modalità offline', 'warning', 4000);
      }
    } else {
      if (typeof showToast === 'function') {
        showToast('Connessione ripristinata', 'success', 2000);
      }
    }
  }

  logError(errorInfo) {
    // Salva in localStorage per debugging
    try {
      const errorLog = JSON.parse(localStorage.getItem('errorLog') || '[]');
      errorLog.push(errorInfo);
      
      // Mantieni solo gli ultimi 50 errori
      if (errorLog.length > 50) {
        errorLog.splice(0, errorLog.length - 50);
      }
      
      localStorage.setItem('errorLog', JSON.stringify(errorLog));
    } catch (error) {
      console.warn('Impossibile salvare log errori:', error);
    }
  }

  // Metodo per ottenere gli errori recenti
  getRecentErrors() {
    try {
      return JSON.parse(localStorage.getItem('errorLog') || '[]');
    } catch (error) {
      return [];
    }
  }

  // Metodo per pulire i log degli errori
  clearErrorLog() {
    try {
      localStorage.removeItem('errorLog');
      this.errorQueue = [];
      console.log('🧹 Log errori pulito');
    } catch (error) {
      console.warn('Errore pulizia log:', error);
    }
  }
}

// Inizializza il gestore errori globale
export const errorHandler = new ErrorHandler();

// Esporta funzioni di utilità
export function reportError(message, context = {}) {
  errorHandler.handleError({
    type: 'manual',
    message,
    context,
    timestamp: new Date().toISOString()
  });
}

export function getErrorLog() {
  return errorHandler.getRecentErrors();
}

export function clearErrors() {
  errorHandler.clearErrorLog();
}