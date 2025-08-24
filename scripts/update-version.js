#!/usr/bin/env node

/**
 * Script per aggiornare automaticamente i numeri di versione in tutti i file
 * Uso: npm run version
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Leggi la versione dal package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const currentVersion = packageJson.version;

console.log(`🔄 Aggiornamento versione a: ${currentVersion}`);

// File da aggiornare con i loro pattern
const filesToUpdate = [
  {
    path: 'index.html',
    patterns: [
      { regex: /shared\/styles\.css\?v=[\d.]+/g, replacement: `shared/styles.css?v=${currentVersion}` },
      { regex: /shared\/utils\.js\?v=[\d.]+/g, replacement: `shared/utils.js?v=${currentVersion}` },
      { regex: /shared\/firebase\.js\?v=[\d.]+/g, replacement: `shared/firebase.js?v=${currentVersion}` }
    ]
  },
  {
    path: 'lista/index.html',
    patterns: [
      { regex: /\.\.\/shared\/styles\.css\?v=[\d.]+/g, replacement: `../shared/styles.css?v=${currentVersion}` },
      { regex: /lista\.js\?v=[\d.]+/g, replacement: `lista.js?v=${currentVersion}` }
    ]
  },
  {
    path: 'magazzino/index.html',
    patterns: [
      { regex: /\.\.\/shared\/styles\.css\?v=[\d.]+/g, replacement: `../shared/styles.css?v=${currentVersion}` },
      { regex: /magazzino\.js\?v=[\d.]+/g, replacement: `magazzino.js?v=${currentVersion}` },
      { regex: /\.\.\/shared\/utils\.js\?v=[\d.]+/g, replacement: `../shared/utils.js?v=${currentVersion}` }
    ]
  },
  {
    path: 'catalogo/index.html',
    patterns: [
      { regex: /\.\.\/shared\/styles\.css\?v=[\d.]+/g, replacement: `../shared/styles.css?v=${currentVersion}` },
      { regex: /catalogo\.js\?v=[\d.]+/g, replacement: `catalogo.js?v=${currentVersion}` }
    ]
  },
  {
    path: 'lista/lista.js',
    patterns: [
      { regex: /\.\.\/shared\/firebase\.js\?v=[\d.]+/g, replacement: `../shared/firebase.js?v=${currentVersion}` },
      { regex: /\.\.\/shared\/utils\.js\?v=[\d.]+/g, replacement: `../shared/utils.js?v=${currentVersion}` }
    ]
  },
  {
    path: 'shared/utils.js',
    patterns: [
      { regex: /\.js\?v=[\d.]+/g, replacement: `.js?v=${currentVersion}` }
    ]
  }
];

let updatedFiles = 0;
let totalReplacements = 0;

// Aggiorna ogni file
filesToUpdate.forEach(fileConfig => {
  const filePath = path.join(rootDir, fileConfig.path);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File non trovato: ${fileConfig.path}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let fileChanged = false;
  let fileReplacements = 0;
  
  fileConfig.patterns.forEach(pattern => {
    const matches = content.match(pattern.regex);
    if (matches) {
      content = content.replace(pattern.regex, pattern.replacement);
      fileChanged = true;
      fileReplacements += matches.length;
    }
  });
  
  if (fileChanged) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Aggiornato: ${fileConfig.path} (${fileReplacements} sostituzioni)`);
    updatedFiles++;
    totalReplacements += fileReplacements;
  } else {
    console.log(`ℹ️  Nessuna modifica: ${fileConfig.path}`);
  }
});

console.log(`\n🎉 Completato! Aggiornati ${updatedFiles} file con ${totalReplacements} sostituzioni totali.`);
console.log(`📦 Versione corrente: ${currentVersion}`);

// Crea un file di versione per riferimento
const versionInfo = {
  version: currentVersion,
  timestamp: new Date().toISOString(),
  files: filesToUpdate.map(f => f.path)
};

fs.writeFileSync(
  path.join(rootDir, 'version.json'), 
  JSON.stringify(versionInfo, null, 2), 
  'utf8'
);

console.log(`📄 Creato version.json con informazioni di versione`);