// Собирает контент для приложения в public/content/:
//   catalog.json          — список материалов (книги + НПА)
//   docs/<id>.<lang>.json — тексты по блокам
//   questions.json        — все тестовые вопросы
// Источники: content/npa.json + content/raw/npa/*.json (импорт lex.uz),
//            content/books.json + content/books/<id>.<lang>.md,
//            content/questions/*.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUnits } from '../src/units.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = path.join(ROOT, 'content');
const OUT = path.join(ROOT, 'public', 'content');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'docs'), { recursive: true });

const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
const LANGS = ['uz', 'ru'];
const catalog = [];
const warnings = [];

const stats = (blocks, lang) => ({
  units: buildUnits(blocks, lang).length,
  articles: blocks.filter((b) => b.t === 'a').length,
  chapters: blocks.filter((b) => b.t === 'h').length,
  chars: blocks.reduce((s, b) => s + b.x.length, 0),
});

// ---------- Книги (markdown) ----------
// # раздел (после названия книги), ## урок/глава — единица чтения, ### подзаголовок,
// пустая строка разделяет абзацы, строка "> текст" — выделенное определение,
// ![подпись](img/…webp "WxH") — рисунок/схема (файлы из content/books/img копируются в public/content/img).
function mdToBlocks(md) {
  const blocks = [];
  let titleSeen = false;
  let buf = [];
  const flush = () => {
    if (buf.length) blocks.push({ t: 'p', x: buf.join(' ').trim() });
    buf = [];
  };
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      if (h[1].length === 1 && !titleSeen) {
        titleSeen = true; // первая строка «# …» — название книги
        continue;
      }
      // # раздел/глава (группирует уроки), ## урок — единица чтения, ### подзаголовок
      blocks.push({ t: 'h', l: Math.min(h[1].length, 3), x: h[2] });
    } else if (/^!\[[^\]]*\]\([^)]+\)/.test(line)) {
      // рисунок: ![подпись](img/ogp-8.ru/p007-1.webp "ширинаxвысота")
      flush();
      const m = line.match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"(\d+)x(\d+)")?\)/);
      blocks.push({ t: 'img', src: m[2], x: m[1], ...(m[3] ? { w: +m[3], h: +m[4] } : {}) });
    } else if (line.startsWith('>')) {
      flush();
      blocks.push({ t: 'p', x: line.replace(/^>\s?/, ''), k: 'def' });
    } else if (!line) flush();
    else buf.push(line);
  }
  flush();
  return blocks;
}

const books = readJson(path.join(C, 'books.json'), { books: [] }).books;
const imgSrc = path.join(C, 'books', 'img');
if (fs.existsSync(imgSrc)) fs.cpSync(imgSrc, path.join(OUT, 'img'), { recursive: true });
for (const b of books) {
  const langs = {};
  for (const lang of LANGS) {
    const p = path.join(C, 'books', `${b.id}.${lang}.md`);
    if (!fs.existsSync(p)) continue;
    const blocks = mdToBlocks(fs.readFileSync(p, 'utf8'));
    fs.writeFileSync(path.join(OUT, 'docs', `${b.id}.${lang}.json`), JSON.stringify(blocks));
    langs[lang] = stats(blocks, lang);
  }
  if (!Object.keys(langs).length) warnings.push(`книга ${b.id}: нет файлов content/books/${b.id}.uz.md / .ru.md`);
  catalog.push({ kind: 'book', ...b, langs });
}

// ---------- НПА ----------
const acts = readJson(path.join(C, 'npa.json'), { acts: [] }).acts;
for (const a of acts) {
  const raw = readJson(path.join(C, 'raw', 'npa', `${a.id}.json`), null);
  const langs = {};
  const source = {};
  if (raw) {
    for (const lang of LANGS) {
      const l = raw.langs[lang];
      if (!l) continue;
      fs.writeFileSync(path.join(OUT, 'docs', `${a.id}.${lang}.json`), JSON.stringify(l.blocks));
      langs[lang] = stats(l.blocks, lang);
      source[lang] = l.url;
    }
  } else warnings.push(`НПА ${a.id}: не импортирован (npm run import:lex)`);
  const { lex, ...rest } = a;
  catalog.push({ kind: 'npa', ...rest, source, fetched: raw?.fetched, langs });
}

// ---------- Вопросы ----------
const bookUnits = new Map();
for (const bk of books) {
  const p = path.join(OUT, 'docs', `${bk.id}.ru.json`);
  if (fs.existsSync(p)) bookUnits.set(bk.id, buildUnits(JSON.parse(fs.readFileSync(p, 'utf8')), 'ru'));
}
const qdir = path.join(C, 'questions');
const questions = [];
const ids = new Set();
const known = new Set(catalog.map((c) => c.id));
if (fs.existsSync(qdir)) {
  for (const f of fs.readdirSync(qdir).filter((f) => f.endsWith('.json'))) {
    for (const q of readJson(path.join(qdir, f), [])) {
      const where = `${f}#${q.id}`;
      if (ids.has(q.id)) warnings.push(`дубль id вопроса ${where}`);
      ids.add(q.id);
      if (!known.has(q.doc)) warnings.push(`${where}: неизвестный doc "${q.doc}"`);
      for (const lang of LANGS) {
        if (!q.q?.[lang] || !q.options?.[lang]) continue;
        if (q.options[lang].length < 2) warnings.push(`${where}: мало вариантов (${lang})`);
      }
      if (!(q.answer >= 0)) warnings.push(`${where}: нет answer`);
      // вопрос к учебнику: «lesson» → ключ главы в читалке
      if (q.lesson && !q.unit) {
        const u = bookUnits.get(q.doc)?.find((u) => u.title.includes(` ${q.lesson}. `));
        if (u) q.unit = u.key;
        else warnings.push(`${where}: урок ${q.lesson} не найден в ${q.doc}`);
      }
      questions.push(q);
    }
  }
}

fs.writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify({ built: new Date().toISOString(), items: catalog }));
fs.writeFileSync(path.join(OUT, 'questions.json'), JSON.stringify(questions));
console.log(`Материалов: ${catalog.length} (книг ${books.length}, НПА ${acts.length}); вопросов: ${questions.length}`);
for (const w of warnings) console.log('  ⚠ ' + w);
