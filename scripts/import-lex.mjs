// Импорт НПА с lex.uz.
// Использование:
//   node scripts/import-lex.mjs            — импортировать все акты из content/npa.json, которых ещё нет
//   node scripts/import-lex.mjs --force    — перекачать все
//   node scripts/import-lex.mjs constitution labor-code  — только указанные id
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { cyrToLat } from './lib/translit.mjs';

import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'content', 'npa.json');
const RAW = path.join(ROOT, 'content', 'raw', 'npa');
fs.mkdirSync(RAW, { recursive: true });

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

const list = JSON.parse(fs.readFileSync(SRC, 'utf8')).acts;

const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const clean = (s) => decode(s).replace(/\s+/g, ' ').trim();

function headerLevel(t) {
  if (/(бўлим|bo.?lim|раздел|қисм\b|qism\b|часть\b|китоб|kitob|книга)/i.test(t) && !/боб|\bbob\b|глава/i.test(t)) return 1;
  if (/(боб|\bbob\b|глава)/i.test(t)) return 2;
  return 3;
}

// Возвращает массив блоков:
//  {t:'h', l:1|2|3, x:'...'}             — заголовок раздела/главы/параграфа
//  {t:'a', n:'12', x:'заголовок статьи'} — начало статьи
//  {t:'p', x:'...'}                       — абзац
//  appendix: N — взять только N-е приложение (напр. «Положение» к постановлению)
function parseDoc(html, lang, appendix) {
  const root = parse(html);
  const titleEl = root.querySelector('title');
  const title = titleEl ? clean(titleEl.text).replace(/^\s*[\d.]+\s*/, '').trim() : '';
  const blocks = [];
  let banner = 0;
  for (const el of root.querySelectorAll('.lx_elem')) {
    const cls = el.getAttribute('class') || '';
    if (cls.includes('APPL_BANNER')) banner++;
    if (appendix && banner !== appendix) continue;
    if (/APPL_BANNER|ACT_TITLE_APPL|ACCEPTING_BODY|SIGNATURE|ACT_ESSENTIAL|FOOTNOTE/.test(cls)) continue;
    const body = el.childNodes.find((n) => n.tagName === 'DIV' && n.getAttribute && n.getAttribute('id'));
    if (!body) continue;
    // переносы строк внутри таблиц/абзацев
    // «5<sup>1</sup>» → «5¹» (иначе статья 5¹ сливается со статьёй 51)
    const text = clean(body.innerHTML.replace(/<sup[^>]*>\s*(\d+)\s*([.,]?)\s*<\/sup>/gi, (_, d, p) => [...d].map((c) => SUP[c]).join('') + p).replace(/<br\s*\/?>/gi, ' ').replace(/<\/(td|th)>/gi, ' | ').replace(/<\/tr>/gi, '\n').replace(/<[^>]+>/g, ''));
    if (!text) continue;
    if (/ACT_TITLE|ACT_FORM/.test(cls)) continue; // «ЗАКОН РЕСПУБЛИКИ УЗБЕКИСТАН» + название — есть в карточке акта
    if (cls.includes('TEXT_HEADER')) {
      blocks.push({ t: 'h', l: headerLevel(text), x: text });
    } else if (cls.includes('CLAUSE')) {
      const m =
        lang === 'ru'
          ? text.match(/^[СC]тать[яи]\s+(\d+[⁰¹²³⁴⁵⁶⁷⁸⁹]*(?:[-–‑]\d+)?)\.?\s*(.*)$/i)
          : text.match(/^(\d+[⁰¹²³⁴⁵⁶⁷⁸⁹]*(?:[-–‑]\d+)?)[-–‑]\s*(?:модда|modda)\.?\s*(.*)$/i);
      if (m) blocks.push({ t: 'a', n: m[1].replace(/\s+/g, '').replace(/[–‑]/g, '-'), x: m[2] });
      else blocks.push({ t: 'h', l: 3, x: text });
    } else if (blocks.length === 0 && title.toUpperCase().includes(text.toUpperCase())) {
      // заголовок документа — пропускаем, он есть в title
    } else if (text.length < 90 && text === text.toUpperCase() && /\p{L}{3}/u.test(text)) {
      // «ПРЕАМБУЛА», «МУҚАДДИМА» и т.п. — подзаголовок; дубль названия акта пропускаем
      blocks.push({ t: 'h', l: 3, x: text });
    } else {
      blocks.push({ t: 'p', x: text });
    }
  }
  return { title, blocks };
}

const latBlocks = (blocks) => blocks.map((b) => ({ ...b, x: cyrToLat(b.x) }));

async function fetchLex(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (ogp-study importer)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

let done = 0;
for (const act of list) {
  if (only.length && !only.includes(act.id)) continue;
  const out = path.join(RAW, `${act.id}.json`);
  if (!force && fs.existsSync(out)) continue;
  const result = { id: act.id, fetched: new Date().toISOString().slice(0, 10), langs: {} };
  for (const lang of ['uz', 'ru']) {
    const lexId = act.lex?.[lang];
    if (!lexId) continue;
    // узбекский: официальная латиница lex.uz (ID со знаком минус); если её нет — кириллица + транслитерация
    let url = lang === 'ru' ? `https://lex.uz/ru/docs/${lexId}` : `https://lex.uz/docs/-${lexId}`;
    process.stdout.write(`${act.id} [${lang}] ${url} … `);
    try {
      let { title, blocks } = parseDoc(await fetchLex(url), lang, act.appendix);
      if (lang === 'uz' && blocks.length < 3) {
        url = `https://lex.uz/docs/${lexId}`;
        process.stdout.write(`(латиницы нет → ${url}) `);
        ({ title, blocks } = parseDoc(await fetchLex(url), lang, act.appendix));
        title = cyrToLat(title);
        blocks = latBlocks(blocks);
      }
      result.langs[lang] = { url, title, blocks };
      console.log(`${blocks.filter((b) => b.t === 'a').length} статей`);
    } catch (e) {
      console.log('ОШИБКА: ' + e.message);
    }
    await new Promise((r) => setTimeout(r, 800)); // бережно к серверу lex.uz
  }
  if (Object.keys(result.langs).length) {
    fs.writeFileSync(out, JSON.stringify(result));
    done++;
  }
}
console.log(`Готово: ${done} акт(ов) импортировано. Теперь: npm run content`);
