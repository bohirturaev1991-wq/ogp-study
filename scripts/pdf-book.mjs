// Конвертер учебника (PDF) → markdown для приложения (content/books/<id>.<lang>.md).
//   1) извлечение текста:  node scripts/pdf-book.mjs extract <file.pdf> <out.json>
//      (для сканов без текстового слоя — OCR, см. content/books/README.md; результат в том же формате)
//   2) конвертация:        node scripts/pdf-book.mjs convert <extract.json> <config.json> <out.md>
// config (content/books/src/<id>.config.json):
//   { title, startPage, bodySize?, glossary?, sections: [{ title, lessons: [{ n: "1–2", title }] }], dropLines? }
// Идея: строки собираются в блоки (по колонкам и интервалам), блоки — в абзацы. Короткие обрывки
// (подписи к схемам) отбрасываются; заголовки уроков и глав берутся из оглавления (config).
import fs from 'node:fs';

const [cmd, a1, a2, a3] = process.argv.slice(2);

if (cmd === 'extract') {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(a1)), verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.filter((it) => it.str !== undefined).map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]) || it.height, f: it.fontName, w: it.width })));
  }
  fs.writeFileSync(a2, JSON.stringify(pages));
  console.log('pages', pages.length);
  process.exit(0);
}
if (cmd !== 'convert') {
  console.log('usage: extract <pdf> <json> | convert <json> <config> <md>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(a1, 'utf8'));
const cfg = JSON.parse(fs.readFileSync(a2, 'utf8'));
const RUBRICS = new Set(
  [
    'Активизирующие вопросы', 'Закрепляем знания', 'Запомните', 'Выполняем вместе', 'Закон определяет', 'Закон устанавливает',
    'Продолжайте изучение', 'Сделайте заключение', 'Сделайте вывод', 'Основные понятия', 'Подтверждаем', 'Историческая справка',
    'Взгляд на историю', 'Вопросы и задания', 'Задание для самостоятельной работы', 'Вы узнаете', 'Творческая работа', 'Это интересно',
    'Выполняем вместе', 'Проверьте себя', 'Задание', 'Кейс', 'Обсудим', 'Знаете ли вы', 'Знаете ли вы?',
    // узбекские издания
    'Faollashtiruvchi savollar', 'Fikrimizni tasdiqlaymiz', 'Yodda tuting', 'Birgalikda bajaramiz', 'Qonun belgilaydi', 'Xulosa qiling',
    'Xulosa chiqaring', 'Xulosa chiqaramiz', 'Asosiy tushunchalar', 'Tarixga nazar', 'Tarixiy maʼlumot', 'Siz bilib olasiz', 'Savol va topshiriqlar',
    'Mustaqil ish uchun topshiriq', 'Ijodiy ish', 'Bilimlarni mustahkamlaymiz', 'Oʻrganishni davom ettiring', 'Tasdiqlaymiz', ...(cfg.rubrics || []),
  ].map((s) => s.toLowerCase()),
);
const UZ = cfg.lang === 'uz';
const apos = (s) => s.replace(/(?<=(\p{L}))['‘’`ʻʼ](?=\p{L})/gu, (m, a) => (/[oOgG]/.test(a) ? 'ʻ' : 'ʼ'));
const rubricKey = (s) => apos(s).toLowerCase().replace(/[!.:?]+$/, '').trim();
for (const r of [...RUBRICS]) RUBRICS.add(rubricKey(r));
const rubricOf = (s) => (RUBRICS.has(rubricKey(s)) ? s.replace(/[:.]+$/, '') : null);
const REMEMBER = /^(Запомните|Yodda tuting)/i;

// ---------- строки ----------
// Формат A (pdf.js): массив страниц, на странице — элементы {s,x,y,h,f,w}, y растёт вверх.
// Формат B (OCR): [{page, w, lines:[{t,x,y,r,h}]}], y растёт вниз — переворачиваем.
const OCR = !Array.isArray(raw[0]);
function pageLines(pi) {
  if (OCR) {
    const p = raw[pi];
    const ls = (Array.isArray(p.lines) ? p.lines : p.lines ? [p.lines] : []).filter((l) => l && l.t);
    return ls
      .map((l) => ({ y: 10000 - l.y, x0: l.x, x1: l.r, w: l.r - l.x, h: l.h, f: 'ocr', bold: false, s: fixOcr(l.t) }))
      .sort((a, b) => b.y - a.y || a.x0 - b.x0);
  }
  const seen = new Set();
  const its = raw[pi]
    .filter((i) => i.s.trim() && i.h > 4)
    .filter((i) => {
      const k = `${i.s}|${Math.round(i.x)}|${Math.round(i.y)}`; // дубли («тень» текста)
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.y - a.y || a.x - b.x);
  // полосы по высоте (знаки препинания бывают чуть выше/ниже строки), внутри полосы — слева направо
  const bands = [];
  for (const it of its) {
    const tol = Math.max(it.h * 0.45, 2);
    const band = bands.find((b) => Math.abs(b.y - it.y) < tol && (Math.abs(b.h - it.h) < 2.5 || /^[.,;:!?»)]+$/.test(it.s.trim())));
    if (band) band.items.push(it);
    else bands.push({ y: it.y, h: it.h, items: [it] });
  }
  // вертикальные «коридоры» между колонками: широкий пробел на одном и том же месте в ≥ 3 строках
  const gapsOf = (band) => {
    const s = band.items.slice().sort((a, b) => a.x - b.x);
    const g = [];
    for (let i = 1; i < s.length; i++) {
      const e = s[i - 1].x + (s[i - 1].w || 0);
      if (s[i].x - e > band.h * 1.1) g.push([e, s[i].x]);
    }
    return g;
  };
  const allGaps = bands.map(gapsOf);
  const isGutter = (gap) => allGaps.filter((gs) => gs.some((o) => Math.min(o[1], gap[1]) - Math.max(o[0], gap[0]) > 2)).length >= 3;
  const lines = [];
  for (const [bi, band] of bands.entries()) {
    let l = null;
    const cuts = allGaps[bi].filter(isGutter).map((g) => g[1]);
    for (const it of band.items.sort((a, b) => a.x - b.x)) {
      if (!l || it.x - l.x1 > it.h * 2.5 || cuts.some((c) => Math.abs(c - it.x) < 0.5)) {
        l = { y: band.y, x0: it.x, x1: it.x, h: band.h, fonts: {}, s: '' };
        lines.push(l);
      } else if (it.x - l.x1 > it.h * 0.12 && !/\s$/.test(l.s) && !/^\s/.test(it.s)) l.s += ' ';
      l.s += it.s;
      l.x1 = Math.max(l.x1, it.x + (it.w || it.s.length * it.h * 0.5));
      if (!/^[.,;:!?»)\s]+$/.test(it.s)) l.fonts[it.f] = (l.fonts[it.f] || 0) + it.s.length;
    }
  }
  for (const l of lines) if (!Object.keys(l.fonts).length) l.fonts.x = 1;
  for (const l of lines) {
    l.s = l.s.replace(/\s+/g, ' ').trim();
    l.f = Object.entries(l.fonts).sort((a, b) => b[1] - a[1])[0][0];
    l.bold = l.f !== BODY && BOLDS.has(l.f);
    l.w = l.x1 - l.x0;
  }
  return lines.sort((a, b) => b.y - a.y || a.x0 - b.x0);
}
// типичные ошибки OCR в русском тексте: «З» вместо «3» в номерах, латиница внутри слов
function fixOcr(s) {
  // «I-DARS», «IO-DARS», «II-DARS» → 1, 10, 11
  s = s.replace(/^I\.\s(?=\p{L})/u, '1. ').replace(/(^|\s)I-(?=\p{Ll})/gu, '$11-'); // «I.» / «I-rasmda» в нумерации
  s = s.replace(/^([IlO\d]+(?:\s*[–—-]\s*[IlO\d]+)?)(\s*[–—-]\s*DARS)/, (m, n, rest) => n.replace(/[Il]/g, '1').replace(/O/g, '0').replace(/\s+/g, '') + rest.trim());
  return s
    .replace(/(^|\s)З(\s*[.)])/g, '$13$2')
    .replace(/\b(Урок[и]?\s+)З\b/g, '$13')
    .replace(/([а-яё])([aeopcxyk])([а-яё])/gi, (m, a, b, c) => a + ({ a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', k: 'к' }[b.toLowerCase()] || b) + c);
}

let BODY = 'ocr';
let BOLDS = new Set();
let bodySize = cfg.bodySize || 12;
if (!OCR) {
  const st = {};
  for (const p of raw) for (const i of p) if (Math.abs(i.h - bodySize) < 0.6) st[i.f] = (st[i.f] || 0) + i.s.length;
  const fonts = Object.entries(st).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  BODY = fonts[0];
  BOLDS = new Set(cfg.boldFonts || [fonts[1]]);
} else {
  const hs = {};
  for (const p of raw) for (const l of [].concat(p.lines || [])) if (l && l.h) hs[l.h] = (hs[l.h] || 0) + l.t.length;
  bodySize = +Object.entries(hs).sort((a, b) => b[1] - a[1])[0][0];
}
const sizeTol = OCR ? bodySize * 0.35 : 1.3;
const isBodySize = (h) => Math.abs(h - bodySize) <= sizeTol;

// слова книги — для снятия переносов (настоящий дефис или перенос)
const words = new Map(); // слово → сколько раз встречается (не на стыке строк)
const inner = new Map(); // то же, но только слова не на краю строки
const hyStems = new Set(); // «социально-эко»: признак настоящего дефиса в составном слове
const forms = new Map(); // точное написание → частота (для исправления регистра после OCR)
const stems = new Map(); // «l:досто» / «u:досто» → сколько слов с этой основой со строчной / с заглавной
for (let i = 0; i < raw.length; i++)
  for (const l of pageLines(i)) {
    for (const w of l.s.match(/[\p{L}]+/gu) || []) {
      forms.set(w, (forms.get(w) || 0) + 1);
      if (w.length >= 5 && w.slice(1) === w.slice(1).toLowerCase()) {
        const k = `${w[0] === w[0].toLowerCase() ? 'l' : 'u'}:${w.slice(0, 5).toLowerCase()}`;
        stems.set(k, (stems.get(k) || 0) + 1);
      }
    }
    const ws = l.s.toLowerCase().replace(/[-‑­]$/, '').match(/[\p{L}-]+/gu) || [];
    ws.forEach((w, i) => {
      words.set(w, (words.get(w) || 0) + 1);
      // слова на краях строки могут быть обрывками переноса — их не считаем
      if (i > 0 && i < ws.length - 1) inner.set(w, (inner.get(w) || 0) + 1);
      const p = w.split('-');
      if (p.length === 2 && p[0].length > 1 && p[1].length >= 3) hyStems.add(`${p[0]}-${p[1].slice(0, 3)}`);
    });
  }
function joinLines(a, b) {
  const m = a.match(/([\p{L}]+)[-‑­]$/u);
  if (m && /^[\p{Ll}]/u.test(b)) {
    const next = b.match(/^[\p{L}-]+/u)[0];
    const glued = (m[1] + next).toLowerCase();
    const hy = (m[1] + '-' + next).toLowerCase();
    if ((words.has(hy) || hyStems.has(`${m[1].toLowerCase()}-${next.slice(0, 3).toLowerCase()}`)) && !words.has(glued)) return a + b;
    return a.slice(0, -1) + b;
  }
  // перенос без дефиса: «физиче» + «ское» → «физическое», если склейка встречается в книге, а части — нет
  const m2 = a.match(/([\p{L}]+)$/u);
  const n2 = b.match(/^([\p{Ll}]+)/u);
  if (m2 && n2) {
    const glued = (m2[1] + n2[1]).toLowerCase();
    const ca = inner.get(m2[1].toLowerCase()) || 0;
    const cb = inner.get(n2[1]) || 0;
    if (inner.get(glued) && Math.min(ca, cb) <= 1 && !(ca > 30 && cb > 30)) return a + b;
  }
  return a + ' ' + b;
}

// ---------- уроки ----------
const lessonKey = (s) => s.replace(/[—–-]/g, '–').replace(/\s+/g, '');
const lessons = [];
for (const [si, sec] of cfg.sections.entries()) for (const l of sec.lessons) lessons.push({ ...l, si, key: lessonKey(l.n) });
const dropTexts = new Set(
  [...cfg.sections.map((s) => s.title.replace(/^(Глава|Раздел)\s+[IVX]+\.\s*/i, '')), ...cfg.sections.map((s) => s.title), ...(cfg.dropLines || [])].map((s) => s.toUpperCase()),
);
const LESSON_RE = /^(?:УРОК[ИI]?|Урок[и]?)\s*([\dЗ]+(?:\s*[–—-]\s*[\dЗ]+)?)\s*[.,]?\s*(.*)$/;
const LESSON_UZ = /^(\d+(?:\s*[–—-]\s*\d+)?)\s*[–—-]\s*DARS(?:LAR)?\b\.?\s*(.*)$/i;
const lessonLabel = (les) => (UZ ? `${les.n}-dars. ${les.title}` : `Урок${les.key.includes('–') ? 'и' : ''} ${les.n}. ${les.title}`);

// рубрики, которых нет в списке: короткая строка в смешанном регистре, повторяющаяся отдельной строкой ≥ 5 раз
{
  const cnt = new Map();
  for (let i = (cfg.startPage || 1) - 1; i < raw.length; i++)
    for (const l of pageLines(i)) {
      const t = l.s.replace(/^\W+/u, '').trim();
      if (t.length >= 5 && t.length <= 40 && /^[\p{Lu}]/u.test(t) && t !== t.toUpperCase() && !/\d/.test(t)) cnt.set(rubricKey(t), (cnt.get(rubricKey(t)) || 0) + 1);
    }
  for (const [k, n] of cnt) if (n >= 5 && !dropTexts.has(k.toUpperCase())) RUBRICS.add(k);
}

// ---------- проход по страницам ----------
const out = [];
let cur = null;
let curSec = -1;
let inGlossary = false;
const stats = { kept: 0, dropped: 0, samples: [] };
const clean = (t) =>
  t
    .replace(/\s+/g, ' ')
    .replace(/(\p{L})([–—])\s/gu, '$1 $2 ')
    .replace(/\s+([.,;:!?»)])/g, '$1')
    .replace(/([«(])\s+/g, '$1')
    .replace(/^(\d{1,2})\s?\.(?=\p{L})/u, '$1. ')
    .replace(UZ ? /([oOgG])\s+['‘’`ʻ](\p{Ll})/gu : /$^/u, '$1ʻ$2') // OCR: «to 'lash»
    .replace(UZ ? /(?<=(\p{L}))['‘’`ʻʼ](?=\p{L})/gu : /$^/u, (m, a) => (/[oOgG]/.test(a) ? 'ʻ' : 'ʼ'))
    .trim();
const emit = (type, text) => {
  text = clean(text);
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === type && last.text === text) return;
  if (type === 'h3' && inGlossary && text === text.toUpperCase()) return;
  if (type === 'h3' && cur && text.toLowerCase() === cur.title.toLowerCase()) return; // повтор названия урока
  if (OCR && (type === 'p' || type === 'def')) {
    text = fixCase(text);
    // значок рубрики + рубрика + текст в одной строке: «V) Asosiy tushunchalar Mehnat huquqi — …»
    const m = text.match(/^(?:\S{1,3}\s+)?(.+)$/u);
    for (const r of RUBRICS) {
      const body = m[1];
      if (body.length > r.length + 5 && rubricKey(body.slice(0, r.length)) === r && /^\s+[\p{Lu}«"“]/u.test(body.slice(r.length))) {
        out.push({ type: 'h3', text: body.slice(0, r.length) });
        text = body.slice(r.length).trim();
        if (DEF_RE.test(text) && REMEMBER.test(r) || DEF_STRONG.test(text) || /tushunchalar|понятия/i.test(r)) type = DEF_RE.test(text) ? 'def' : type;
        break;
      }
    }
  }
  if (OCR && type === 'h3') {
    const rest = text.replace(/^\S+\s+/, '');
    if (!rubricOf(text) && rubricOf(rest)) text = rest; // мусор от значка рубрики: «.i}h Историческая справка»
    text = text.replace(/^[^\p{L}«\d]+/u, '');
    if (rubricOf(text)) text = text[0].toUpperCase() + text.slice(1);
  }
  out.push({ type, text });
};
// OCR путает строчные и заглавные («Достойный», «ИСТОЧНИКа»): если слово в книге
// намного чаще встречается со строчной буквы — исправляем (кроме начала предложения)
function fixCase(t) {
  t = t.replace(/(?<![\p{L}])([\p{Ll}]+)([\p{Lu}])([\p{Ll}]*)(?![\p{L}])/gu, (m) => m.toLowerCase()); // «iSh» → «ish»
  if (UZ) t = t.replace(/(?<=[\p{Ll},;]\s)Ol(?=[\p{Ll}])(?!iy\s+(?:Majlis|sud|Kengash|taʼlim|majlis))/gu, 'ol'); // «farqlab Olish»
  return t.replace(/(^|[^.!?«"„]\s|[\p{Ll},;:]\s?)([\p{Lu}][\p{L}]+)/gu, (m, pre, w) => {
    if (pre === '' || /[.!?]\s*$/.test(pre)) return m;
    const lw = w.toLowerCase();
    const isMixed = w !== w.toUpperCase() && /[\p{Lu}]{2}/u.test(w);
    const lower = forms.get(lw) || 0;
    if (isMixed && (lower || stems.get(`l:${lw.slice(0, 5)}`))) return pre + lw;
    if (isMixed || w.length < 4 || w[1] !== w[1].toLowerCase()) return m;
    const st = lw.slice(0, 5);
    const sl = stems.get(`l:${st}`) || 0; // со строчной
    const su = stems.get(`u:${st}`) || 0; // с заглавной
    if (lower >= 3 * (forms.get(w) || 1) || (sl >= 3 && su <= sl / 3)) return pre + lw;
    return m;
  });
}
const DEF_RE = /^[«"“]?[\p{Lu}][^.!?]{1,90}?\s[–—]\s?(?:это\s|bu\s)?\S/u;
const DEF_STRONG = /^[«"“]?[\p{Lu}][^.!?]{1,90}?\s[–—]\s?(?:это|bu)\s/u;

for (let pi = (cfg.startPage || 1) - 1; pi < raw.length; pi++) {
  let lines = pageLines(pi);
  if (!lines.length) continue;
  const maxY = Math.max(...lines.map((l) => l.y));
  const minY = Math.min(...lines.map((l) => l.y));
  // колонтитулы, номера страниц, водяные знаки
  lines = lines.filter((l) => {
    if (/^\d{1,3}$/.test(l.s)) return false;
    if (/скачано с сайта|yuklab olindi|t\.me\/|rtm[ _]?met|metodik xizmat/i.test(l.s)) return false;
    if (/^[RTM\s]+$/.test(l.s)) return false; // водяной знак «RTM»
    if (l.y > maxY - l.h * 2 && dropTexts.has(l.s.toUpperCase())) return false;
    return true;
  });

  // блоки: соседние строки одного размера, перекрывающиеся по горизонтали
  const blocks = [];
  for (const l of lines) {
    let best = null;
    for (const b of blocks) {
      const last = b.lines[b.lines.length - 1];
      const dy = last.y - l.y;
      if (dy <= 0 || dy > (OCR ? bodySize * 2.1 : l.h * 1.95) || Math.abs(last.h - l.h) > sizeTol) continue;
      const ov = Math.min(last.x1, l.x1) - Math.max(last.x0, l.x0);
      if (ov < Math.min(last.w, l.w) * 0.3) continue;
      if (!best || dy < best.dy) best = { b, dy };
    }
    if (best) best.b.lines.push(l);
    else blocks.push({ lines: [l] });
  }
  for (const b of blocks) {
    b.top = b.lines[0].y;
    b.x0 = Math.min(...b.lines.map((l) => l.x0));
    b.x1 = Math.max(...b.lines.map((l) => l.x1));
    b.len = b.lines.reduce((s, l) => s + l.s.length, 0);
  }
  blocks.sort((a, b) => b.top - a.top || a.x0 - b.x0);

  for (const b of blocks) {
    // заголовок урока / словарь — по первой строке блока
    const first = b.lines[0];
    const lm = first.s.match(UZ ? LESSON_UZ : LESSON_RE);
    if (lm && !/\.{4,}|…{2,}/.test(first.s)) {
      const les = lessons.find((x) => x.key === lessonKey(lm[1].replace(/З/g, '3')));
      if (les && lessons.indexOf(les) > lessons.indexOf(cur)) {
        if (les.si !== curSec) {
          curSec = les.si;
          emit('h1', cfg.sections[les.si].title);
        }
        cur = les;
        inGlossary = false;
        emit('h2', lessonLabel(les));
        b.lines = b.lines.filter((l) => l.h <= first.h - 1 || l === first ? false : true).length ? b.lines.slice(1).filter((l) => !(l.s === l.s.toUpperCase() && l.y > first.y - first.h * 3)) : [];
        if (!b.lines.length) continue;
      } else if (les) continue;
    }
    if (cfg.glossary && !inGlossary && cur && first.s.toLowerCase().startsWith(cfg.glossary.toLowerCase().slice(0, 15)) && !/\.{4,}/.test(first.s)) {
      inGlossary = true;
      emit('h1', UZ ? 'Lugʻat' : 'Словарь');
      emit('h2', cfg.glossary);
      b.lines = b.lines.slice(1);
      if (!b.lines.length) continue;
    }
    if (!cur && !inGlossary) continue;

    const text = b.lines.map((l) => l.s).join(' ');
    // одиночные строки: рубрика, подзаголовок или обрывок
    if (b.lines.length === 1) {
      const r = rubricOf(text);
      if (r) {
        emit('h3', r.replace(/^Запомните$/i, 'Запомните!'));
        continue;
      }
      const looksHeading =
        (first.bold || (OCR && first.h > bodySize * 1.08 && text.split(' ').length >= 3)) && text.length >= 8 && text.length < 110 && /\s/.test(text) && !/[,;–-]$/.test(text);
      if (looksHeading && !/[.]$/.test(text)) {
        emit('h3', text.replace(/:$/, ''));
        continue;
      }
      if (text.length >= 45 && /[.!?»:]$/.test(text)) {
        emit(DEF_STRONG.test(text) || inGlossary ? 'def' : 'p', text);
        stats.kept += text.length;
      } else {
        stats.dropped += text.length;
        if (stats.samples.length < 600) stats.samples.push(`p${pi + 1} [1]: ${text}`);
      }
      continue;
    }
    if (b.len < 60 && !rubricOf(first.s)) {
      stats.dropped += b.len;
      if (stats.samples.length < 600) stats.samples.push(`p${pi + 1} [${b.lines.length}]: ${text.slice(0, 120)}`);
      continue;
    }
    // абзацы внутри блока
    let ls = b.lines;
    const r0 = rubricOf(ls[0].s);
    if (r0) {
      emit('h3', r0.replace(/^Запомните$/i, 'Запомните!'));
      ls = ls.slice(1);
    } else if ((ls[0].bold || (OCR && ls[0].h > bodySize * 1.12)) && ls.length > 1 && !ls[1].bold && ls[0].s.length < 110 && !/[.,;–—-]$/.test(ls[0].s)) {
      emit('h3', ls[0].s.replace(/:$/, ''));
      ls = ls.slice(1);
    }
    if (!ls.length) continue;
    const bx0 = Math.min(...ls.map((l) => l.x0));
    const bx1 = Math.max(...ls.map((l) => l.x1));
    const bw = bx1 - bx0;
    let para = null;
    const prevH3 = () => out.length && out[out.length - 1].type === 'h3' ? out[out.length - 1].text : '';
    const flush = () => {
      if (!para) return;
      const t = clean(para.text);
      const def = inGlossary || DEF_STRONG.test(t) || ((para.bold || REMEMBER.test(prevH3())) && DEF_RE.test(t));
      emit(def ? 'def' : 'p', t);
      stats.kept += t.length;
      para = null;
    };
    let prev = null;
    for (const l of ls) {
      const r = rubricOf(l.s);
      if (r && l.s.length < 40) {
        flush();
        emit('h3', r.replace(/^Запомните$/i, 'Запомните!'));
        prev = null;
        continue;
      }
      const start =
        !para ||
        (l.x0 - bx0 > (OCR ? bodySize * 0.6 : 6) && prev.x0 - bx0 <= (OCR ? bodySize * 0.6 : 6) && /[.!?:;»"”]$/.test(prev.s)) ||
        /^(\d{1,2}[.)]|[–•▪●-]|[а-я]\))\s/.test(l.s) ||
        (prev.x1 < bx1 - bw * 0.15 && /[.!?:;»]$/.test(prev.s)) ||
        (l.bold && !prev.bold && DEF_RE.test(l.s));
      if (start) {
        flush();
        para = { text: l.s, bold: l.bold };
      } else para.text = joinLines(para.text, l.s);
      prev = l;
    }
    flush();
  }
}

// подзаголовок, за которым нет текста (подписи к схемам), — убираем; рубрики оставляем, если после них есть текст
const isRubric = (t) => !!rubricOf(t) || t === 'Запомните!';
for (const b of out) {
  if (b.type !== 'h3' || isRubric(b.text)) continue;
  // «заголовок» со строчной буквы или из одного слова — это обрывок, а не подзаголовок
  if (/^[\p{Ll}]/u.test(b.text) || !/\s/.test(b.text)) b.type = b.text.length >= 40 ? 'p' : 'drop';
}
const final = out.filter((b, i) => {
  if (b.type === 'drop') return false;
  if (b.type !== 'h3') return true;
  const next = out[i + 1];
  return next && (next.type === 'p' || next.type === 'def' || (isRubric(b.text) === false && false));
});

// ---------- markdown ----------
let md = `# ${cfg.title}\n`;
for (const b of final) {
  if (b.type === 'h1') md += `\n# ${b.text}\n`;
  else if (b.type === 'h2') md += `\n## ${b.text}\n`;
  else if (b.type === 'h3') md += `\n### ${b.text}\n`;
  else if (b.type === 'def') md += `\n> ${b.text}\n`;
  else md += `\n${b.text}\n`;
}
fs.writeFileSync(a3, md);
const labels = new Set(out.filter((b) => b.type === 'h2').map((b) => b.text));
const missing = lessons.filter((l) => !labels.has(clean(lessonLabel(l))));
const found = lessons.length - missing.length;
console.log(`уроков: ${found}/${lessons.length}${missing.length ? '  НЕ НАЙДЕНЫ: ' + missing.map((l) => l.n).join(', ') : ''}${inGlossary ? ', словарь есть' : ''}`);
console.log(`абзацев: ${out.filter((b) => b.type === 'p').length}, определений: ${out.filter((b) => b.type === 'def').length}, подзаголовков: ${out.filter((b) => b.type === 'h3').length}`);
console.log(`символов: оставлено ${stats.kept}, отброшено ${stats.dropped} (подписи к схемам и обрывки — см. ${a3}.dropped.txt)`);
fs.writeFileSync(a3 + '.dropped.txt', stats.samples.join('\n'));
