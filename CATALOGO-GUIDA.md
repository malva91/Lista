# 📋 Guida Gestione Catalogo Prodotti

## 🎯 Panoramica

Il catalogo prodotti è ora gestito tramite un file JSON statico (`prodotti.json`) invece che tramite database. Questo permette una gestione più semplice e veloce del catalogo, mantenendo Firestore solo per gli stati dinamici (quantità, preparazioni, notifiche).

## 📄 Struttura del File JSON

### Posizione
Il file `prodotti.json` deve essere posizionato nella **root del progetto** (stessa cartella di `index.html`).

### Formato Base
```json
{
  "version": "1.2.0",
  "lastUpdated": "2025-01-27T10:30:00.000Z",
  "categories": [...],
  "products": [...]
}
```

## 📁 Gestione Categorie

### Struttura Categoria
```json
{
  "id": "bevande-calde",
  "name": "Bevande Calde",
  "colorHex": "#dc2626",
  "order": 1
}
```

### Campi Obbligatori
- **`id`**: Identificativo unico in formato kebab-case (es. `bevande-calde`)
- **`name`**: Nome visualizzato nell'interfaccia
- **`colorHex`**: Colore in formato esadecimale (#rrggbb)
- **`order`**: Numero per ordinamento (1, 2, 3...)

### Regole per le Categorie
- ✅ ID deve essere unico in tutto il JSON
- ✅ Nome deve essere descrittivo e chiaro
- ✅ Colore deve essere in formato #rrggbb valido
- ✅ Order determina l'ordine di visualizzazione

## 📦 Gestione Prodotti

### Struttura Prodotto
```json
{
  "id": "caffe-espresso",
  "name": "Caffè Espresso",
  "categoryId": "bevande-calde",
  "unit": "tazze",
  "important": true,
  "active": true,
  "priority": 1,
  "notes": "Miscela arabica premium"
}
```

### Campi Obbligatori
- **`id`**: Identificativo unico in formato kebab-case
- **`name`**: Nome visualizzato nell'interfaccia
- **`categoryId`**: ID della categoria di appartenenza
- **`active`**: true/false - se il prodotto è attivo

### Campi Opzionali
- **`unit`**: Unità di misura (es. "pezzi", "litri", "kg", "tazze")
- **`important`**: true/false - se è un prodotto importante
- **`priority`**: Numero per ordinamento (default: 999)
- **`notes`**: Note descrittive o specifiche

### Regole per i Prodotti
- ✅ ID deve essere unico in tutto il JSON
- ✅ categoryId deve corrispondere a una categoria esistente
- ✅ Solo prodotti con `active: true` vengono mostrati
- ✅ Prodotti `important: true` hanno badge speciale
- ✅ Priority più bassa = visualizzazione prima

## 🔧 Operazioni Comuni

### Aggiungere un Nuovo Prodotto
1. Apri `prodotti.json`
2. Aggiungi il nuovo oggetto nell'array `products`:
```json
{
  "id": "nuovo-prodotto-id",
  "name": "Nome del Nuovo Prodotto",
  "categoryId": "categoria-esistente",
  "unit": "pezzi",
  "important": false,
  "active": true,
  "priority": 10,
  "notes": "Descrizione opzionale"
}
```
3. Salva il file
4. Ricarica l'applicazione

### Aggiungere una Nuova Categoria
1. Apri `prodotti.json`
2. Aggiungi il nuovo oggetto nell'array `categories`:
```json
{
  "id": "nuova-categoria",
  "name": "Nome Nuova Categoria",
  "colorHex": "#8b5cf6",
  "order": 10
}
```
3. Salva il file
4. Ricarica l'applicazione

### Disattivare un Prodotto
Cambia `active` da `true` a `false`:
```json
{
  "id": "prodotto-da-disattivare",
  "active": false
}
```

### Modificare l'Ordine di Visualizzazione
Cambia il campo `priority` per i prodotti o `order` per le categorie:
```json
{
  "id": "prodotto-prioritario",
  "priority": 1
}
```

## ⚠️ Regole Importanti

### ID Stabili
- **MAI modificare l'ID** di prodotti o categorie esistenti
- Gli ID collegano il JSON agli stati in Firestore
- Modificare un ID rompe il collegamento con dati storici

### Backup
- **Sempre fare backup** prima di modifiche importanti
- Tenere una copia del JSON funzionante
- Testare modifiche in ambiente di sviluppo

### Validazione
L'app valida automaticamente il JSON all'avvio:
- Campi obbligatori presenti
- ID univoci
- Categorie referenziate esistenti
- Formato colori valido

## 🚀 Workflow Consigliato

### Per Modifiche Minori
1. Modifica `prodotti.json`
2. Ricarica la pagina
3. Verifica che tutto funzioni

### Per Modifiche Importanti
1. **Backup** del JSON corrente
2. Modifica in ambiente di test
3. Verifica funzionalità complete
4. Deploy in produzione
5. Monitoraggio post-deploy

## 🔍 Debugging

### Errori Comuni
- **JSON non valido**: Controlla sintassi con un validator JSON
- **ID duplicati**: Ogni ID deve essere unico
- **Categoria mancante**: categoryId deve esistere in categories
- **Colore non valido**: Usa formato #rrggbb

### Console Browser
Apri Developer Tools per vedere:
- Errori di caricamento JSON
- Statistiche catalogo
- Performance metrics
- Validazione automatica

### Strumenti Utili
- [JSONLint](https://jsonlint.com/) - Validatore JSON
- [Coolors](https://coolors.co/) - Generatore colori
- Browser DevTools - Debug e performance

## 📊 Monitoraggio

### Statistiche Disponibili
L'app mostra automaticamente:
- Numero totale prodotti
- Numero categorie
- Prodotti attivi
- Prodotti importanti
- Distribuzione per categoria

### Performance
- Caricamento JSON una sola volta all'avvio
- Cache browser automatica
- Validazione rapida
- Rendering ottimizzato

## 🔄 Migrazione da Firestore

Se hai dati esistenti in Firestore:

1. **Esporta** i dati dal modulo Catalogo
2. **Copia** il JSON esportato come `prodotti.json`
3. **Ricarica** l'app per usare il nuovo sistema
4. **Verifica** che tutti i prodotti siano visibili
5. **Testa** le funzionalità di lista e magazzino

## 🆘 Risoluzione Problemi

### Prodotti Non Visibili
- Controlla che `active: true`
- Verifica che categoryId esista
- Controlla sintassi JSON

### Errori di Caricamento
- Verifica che `prodotti.json` sia nella root
- Controlla permessi file
- Verifica connessione di rete

### Stati Non Sincronizzati
- Gli stati (quantità, preparazioni) sono su Firestore
- Solo il catalogo è su JSON
- Ricarica se necessario

## 📞 Supporto

Per problemi con la gestione del catalogo:
1. Controlla questa guida
2. Verifica la console browser
3. Testa con un JSON minimo
4. Contatta il supporto tecnico

---

**Versione Guida**: 1.2.0 | **Ultimo aggiornamento**: 27 Gennaio 2025