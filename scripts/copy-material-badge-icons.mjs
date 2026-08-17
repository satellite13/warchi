#!/usr/bin/env node
/**
 * copy-material-badge-icons.mjs — копирование SVG-иконок Material Symbols в public/icons/.
 * Нужен для интерактивного выбора иконок в бейджах пользовательских свойств;
 * после обновления пакета @material-symbols/svg-400 перегенерирует статические файлы.
 *
 * Кастомные ArchiMate SVG (Pixelmator / viewBox 120×120) не перезаписываются.
 * Старые файлы, которых нет в новом наборе, оставляем — сохранённые имена продолжают рендериться.
 *
 * Использование:
 *   node scripts/copy-material-badge-icons.mjs
 *   npm run copy:badge-icons
 *
 * Требует: npm install -D @material-symbols/svg-400
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const OUTLINED_DIR = path.join(root, 'node_modules', '@material-symbols', 'svg-400', 'outlined');
const PUBLIC_ICONS_DIR = path.join(root, 'public', 'icons');

function isCustomArchimateSvg(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const head = fs.readFileSync(filePath, 'utf8').slice(0, 800);
  return /Pixelmator|viewBox="0 0 120 120"/.test(head);
}

function main() {
  if (!fs.existsSync(OUTLINED_DIR)) {
    console.error(
      'Missing @material-symbols/svg-400. Install it first:\n  npm install -D @material-symbols/svg-400'
    );
    process.exit(1);
  }

  if (!fs.existsSync(PUBLIC_ICONS_DIR)) {
    fs.mkdirSync(PUBLIC_ICONS_DIR, { recursive: true });
  }

  const files = fs
    .readdirSync(OUTLINED_DIR)
    .filter((f) => f.endsWith('.svg') && !f.endsWith('-fill.svg'));
  let copied = 0;
  let skippedCustom = 0;
  for (const file of files) {
    const src = path.join(OUTLINED_DIR, file);
    const dest = path.join(PUBLIC_ICONS_DIR, file);
    if (isCustomArchimateSvg(dest)) {
      skippedCustom++;
      continue;
    }
    fs.copyFileSync(src, dest);
    copied++;
  }
  console.log(
    `Copied ${copied} Material Symbols outlined SVGs to public/icons/` +
      (skippedCustom ? ` (kept ${skippedCustom} custom ArchiMate icons)` : '')
  );
}

main();
