# 🏪 Gestione Liste Prodotti

Sistema semplificato per la gestione delle liste prodotti per dipendenti e magazzino.

## 📱 Versione Corrente: 1.3.0

### 🆕 Novità Versione 1.3.0
- ✅ Codice semplificato e ottimizzato
- ✅ Rimossa funzione prodotti importanti
- ✅ Aggiunto editor JSON integrato
- ✅ Gestione catalogo tramite Firestore
- ✅ Interfaccia più pulita e intuitiva

## 🚀 Funzionalità

### 📝 Lista Dipendenti
- Compilazione liste giornaliere prodotti
- Ricerca e filtri per categoria
- Prodotti extra personalizzabili
- Salvataggio bozze e invio liste
- Menu a scomparsa per categorie
- Controlli globali espandi/comprimi

### 📦 Magazzino
- Visualizzazione liste inviate
- Sistema notifiche modifiche
- Checklist prodotti preparati
- Navigazione per data

### 📋 Gestione Catalogo
- Gestione prodotti e categorie
- Import/Export JSON
- Prodotti importanti
- Sistema colori categorie

## 🛠️ Tecnologie

- **Frontend**: HTML5, CSS3, JavaScript ES6+
- **Catalogo**: JSON statico (prodotti.json)
- **Stati**: Firebase Firestore per stati dinamici
- **Cache**: Browser cache per performance
- **PWA**: Service Worker ready
- **Mobile**: Ottimizzato per dispositivi touch

## 📱 Compatibilità Mobile

- ✅ iOS Safari 12+
- ✅ Android Chrome 70+
- ✅ Samsung Internet 10+
- ✅ Responsive design
- ✅ Touch gestures ottimizzati
- ✅ Safe area support (notch)

## 🔧 Installazione

```bash
# Clona il repository
git clone [repository-url]

# Entra nella directory
cd gestione-liste-prodotti

# Avvia server di sviluppo
npm run dev
```

## 📄 Gestione Catalogo Prodotti

### Struttura JSON
Il catalogo prodotti è gestito tramite il file `prodotti.json` nella root del progetto:

```json
{
  "version": "1.2.0",
  "lastUpdated": "2025-01-27T10:30:00.000Z",
  "categories": [
    {
      "id": "categoria-id",
      "name": "Nome Categoria",
      "colorHex": "#3b82f6",
      "order": 1
    }
  ],
  "products": [
    {
      "id": "prodotto-id",
      "name": "Nome Prodotto",
      "categoryId": "categoria-id",
      "unit": "pezzi",
      "important": true,
      "active": true,
      "priority": 1,
      "notes": "Note opzionali"
    }
  ]
}
```

### Campi Obbligatori

**Categorie:**
- `id`: Identificativo unico (kebab-case)
- `name`: Nome visualizzato
- `colorHex`: Colore esadecimale (#rrggbb)
- `order`: Ordine di visualizzazione (numero)

**Prodotti:**
- `id`: Identificativo unico (kebab-case)
- `name`: Nome visualizzato
- `categoryId`: ID categoria di appartenenza
- `active`: true/false (prodotto attivo)

**Campi Opzionali:**
- `unit`: Unità di misura (es. "pezzi", "litri", "kg")
- `important`: true/false (prodotto importante)
- `priority`: Numero per ordinamento (default: 999)
- `notes`: Note descrittive

### Come Aggiornare il Catalogo

1. **Modifica il file `prodotti.json`**
   - Aggiungi/rimuovi prodotti o categorie
   - Mantieni la struttura JSON valida
   - Usa ID univoci e stabili

2. **Ricarica l'applicazione**
   - Le modifiche sono visibili al prossimo caricamento
   - Non serve riavviare il server

3. **Validazione automatica**
   - L'app valida il JSON all'avvio
   - Errori di formato vengono segnalati in console

### Esempi di Modifica

**Aggiungere un nuovo prodotto:**
```json
{
  "id": "nuovo-prodotto",
  "name": "Nuovo Prodotto",
  "categoryId": "categoria-esistente",
  "unit": "pezzi",
  "important": false,
  "active": true,
  "priority": 10,
  "notes": "Descrizione del prodotto"
}
```

**Disattivare un prodotto:**
```json
{
  "id": "prodotto-esistente",
  "active": false
}
```

### ⚠️ Importante
- **Non modificare gli ID** di prodotti esistenti (rompe i collegamenti con Firestore)
- **Mantieni backup** del JSON prima di modifiche importanti
- **Testa sempre** le modifiche in ambiente di sviluppo
- **Gli stati dinamici** (quantità, preparazioni) rimangono su Firestore

## 📦 Gestione Versioni

```bash
# Aggiorna versione in package.json
npm version patch|minor|major

# Aggiorna automaticamente tutti i riferimenti
npm run version
```

## 🏗️ Struttura Progetto

```
/
├── index.html              # Homepage principale
├── shared/                 # Risorse condivise
│   ├── styles.css         # Stili globali
│   ├── utils.js           # Utility comuni
│   ├── firebase.js        # Configurazione Firebase
│   └── products-loader.js # Caricatore prodotti JSON
├── prodotti.json          # Catalogo prodotti e categorie
├── lista/                 # Modulo lista dipendenti
│   ├── index.html
│   └── lista.js
├── magazzino/             # Modulo magazzino
│   ├── index.html
│   └── magazzino.js
├── catalogo/              # Modulo gestione catalogo
│   ├── index.html
│   └── catalogo.js
├── scripts/               # Script di build
│   └── update-version.js
├── package.json
├── version.json           # Info versione corrente
└── README.md
```

## 🎯 Performance

- **First Paint**: < 1.5s
- **Time to Interactive**: < 3s
- **Cache Strategy**: JSON statico + Firestore per stati
- **Bundle Size**: < 500KB totale
- **Mobile Score**: 95+ Lighthouse

## 🔒 Sicurezza

- Validazione input lato client e server
- Sanitizzazione dati utente
- JSON read-only per sicurezza catalogo
- Rate limiting su operazioni critiche
- Backup automatico localStorage

## 📊 Monitoraggio

- Console logging per debug
- Error tracking integrato
- Performance metrics
- Usage analytics ready

## 🤝 Contributi

1. Fork del progetto
2. Crea feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit modifiche (`git commit -m 'Add AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Apri Pull Request

## 📄 Licenza

Distribuito sotto licenza MIT. Vedi `LICENSE` per maggiori informazioni.

## 📞 Supporto

Per supporto tecnico o segnalazione bug, apri una issue nel repository.

---

**Versione**: 1.2.0 | **Ultimo aggiornamento**: 27 Gennaio 2025