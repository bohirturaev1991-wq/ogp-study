// Конвертер учебника (PDF) → markdown для приложения (content/books/<id>.<lang>.md).
//   1) извлечение текста:  node scripts/pdf-book.mjs extract <file.pdf> <out.json>
//      (для сканов без текстового слоя — OCR, см. content/books/README.md; результат в том же формате)
//   2) конвертация:        node scripts/pdf-book.mjs convert <extract.json> <config.json> <out.md>
// config (content/books/src/<id>.config.json):
//   { title, startPage, bodySize?, glossary?, sections: [{ title, lessons: [{ n: "1–2", title }] }], dropLines? }
// Идея: строки собираются в блоки (по колонкам и интервалам), блоки — в абзацы. Короткие обрывки
// (подписи к схемам) отбрасываются; заголовки уроков и глав берутся из оглавления (config).
import fs from 'node:fs';
import path from 'node:path';

const [cmd, a1, a2, a3] = process.argv.slice(2);

if (cmd === 'extract') {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(a1)), verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    await page.getOperatorList(); // чтобы загрузились шрифты и были доступны их настоящие имена
    const fname = {};
    const nameOf = (id) => {
      if (!(id in fname)) {
        try {
          fname[id] = page.commonObjs.get(id).name.replace(/^[A-Z]{6}\+/, '');
        } catch {
          fname[id] = id;
        }
      }
      return fname[id];
    };
    // f — настоящее имя шрифта («Arial-BoldMT»): по нему определяется жирный текст
    pages.push(tc.items.filter((it) => it.str !== undefined).map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]) || it.height, f: nameOf(it.fontName), w: it.width })));
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
      .map((l) => {
        const s = fixOcr(l.t);
        return { y: 10000 - l.y, x0: l.x, x1: l.r, w: l.r - l.x, h: l.h, f: 'ocr', bold: false, s, rich: s, top: l.y };
      })
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
        l = { y: band.y, x0: it.x, x1: it.x, h: band.h, fonts: {}, s: '', rich: '', inBold: false };
        lines.push(l);
      } else if (it.x - l.x1 > it.h * 0.12 && !/\s$/.test(l.s) && !/^\s/.test(it.s)) {
        l.s += ' ';
        l.rich += ' ';
      }
      // жирные фрагменты помечаем **…** (пробелы и знаки препинания не меняют начертание)
      const neutral = /^[\s.,;:!?»«"()–—-]*$/.test(it.s);
      const b = BOLDS.has(it.f);
      if (!neutral && b !== l.inBold) {
        l.rich = b ? l.rich.replace(/(\s*)$/, '$1**') : l.rich.replace(/(\s*)$/, '**$1');
        l.inBold = b;
      }
      l.s += it.s;
      l.rich += it.s;
      l.x1 = Math.max(l.x1, it.x + (it.w || it.s.length * it.h * 0.5));
      if (!/^[.,;:!?»)\s]+$/.test(it.s)) l.fonts[it.f] = (l.fonts[it.f] || 0) + it.s.length;
    }
  }
  for (const l of lines) if (!Object.keys(l.fonts).length) l.fonts.x = 1;
  for (const l of lines) {
    if (l.inBold) l.rich += '**';
    l.rich = l.rich.replace(/\s+/g, ' ').replace(/\*\*\*\*/g, '').trim();
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
  // новые извлечения хранят настоящие имена шрифтов («Arial-BoldMT»); старые — внутренние id
  const all = new Set(raw.flat().map((i) => i.f));
  const named = [...all].some((f) => /Arial|Times|Myriad|Bold|Regular/i.test(f));
  BOLDS = new Set(cfg.boldFonts || (named ? [...all].filter((f) => /Bold|Black|Heavy|Semibold/i.test(f)) : [fonts[1]]));
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
const plain = (s) => s.split('**').join('');
// склейка строк с разметкой жирного: «…**» + «**…» — жирный продолжается на следующей строке
function joinRich(a, b) {
  if (a.endsWith('**') && b.startsWith('**')) return joinLines(a.slice(0, -2), b.slice(2));
  if (a.endsWith('**')) return insertClose(a, b);
  return joinLines(a, b);
}
// жирный кончился ровно в конце строки: склеиваем без разметки, затем возвращаем «**» на место
function insertClose(a, b) {
  const base = a.slice(0, -2);
  const joined = joinLines(base, b);
  // перенос мог «съесть» дефис/пробел — ищем место стыка по длине base без дефиса
  const cut = joined.startsWith(base) ? base.length : base.replace(/[-‑­]$/, '').length;
  return joined.slice(0, cut) + '**' + joined.slice(cut);
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

// ---------- рисунки, схемы, таблицы ----------
// Страница отрисовывается, основной текст «закрывается», и всё, что осталось (фото, схемы,
// таблицы, рисунки), группируется в области и сохраняется картинками. Текст внутри этих
// областей (подписи схем) из основного потока убирается — он виден на картинке.
// Нужен путь к PDF в config («pdf»); выключить: --no-figs.
const FIG = !!cfg.pdf && !process.argv.includes('--no-figs');
const S = 1.6; // масштаб отрисовки
const CELL = 10; // размер клетки сетки, px
const imgBase = path.basename(a3).replace(/\.md$/, '');
const imgDir = path.join(path.dirname(a3), 'img', imgBase);
let pdfDoc = null;
let createCanvas = null;
if (FIG) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  ({ createCanvas } = await import('@napi-rs/canvas'));
  pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(cfg.pdf)), verbosity: 0 }).promise;
  fs.rmSync(imgDir, { recursive: true, force: true });
  fs.mkdirSync(imgDir, { recursive: true });
}
let figCount = 0;
const allFigs = [];
// «отпечаток» картинки 8×8 (светлее/темнее среднего) — чтобы найти повторяющиеся значки и оформление
function signature(cv) {
  const t = createCanvas(8, 8);
  const g = t.getContext('2d');
  g.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8).data;
  const lum = [];
  for (let i = 0; i < 64; i++) lum.push(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
  const avg = lum.reduce((a, b) => a + b, 0) / 64;
  return lum.map((v) => (v > avg ? 1 : 0)).join('') + '|' + Math.round((cv.width / cv.height) * 4);
}
const sigClose = (a, b, tol = 6) => {
  const [ba, ra] = a.split('|');
  const [bb, rb] = b.split('|');
  if (ra !== rb) return false;
  let d = 0;
  for (let i = 0; i < 64; i++) if (ba[i] !== bb[i]) d++;
  return d <= tol;
};

async function findFigures(pi, keptLines, allBlocks) {
  const page = await pdfDoc.getPage(pi + 1);
  const vp = page.getViewport({ scale: S });
  const W = Math.ceil(vp.width);
  const H = Math.ceil(vp.height);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  try {
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  } catch (e) {
    console.log(`  стр. ${pi + 1}: не удалось отрисовать (${e.message}) — без рисунков`);
    return [];
  }
  const px = ctx.getImageData(0, 0, W, H).data;
  const pageH = vp.height / S;
  const k2 = S / 2; // OCR-координаты сняты при масштабе 2
  // прямоугольник строки в пикселях холста
  const boxOf = (l) =>
    OCR
      ? [l.x0 * k2 - 2, l.top * k2 - 3, l.x1 * k2 + 2, (l.top + l.h * 1.35) * k2 + 3]
      : [l.x0 * S - 2, (pageH - l.y - l.h * 0.95) * S - 2, l.x1 * S + 2, (pageH - l.y + l.h * 0.3) * S + 2];
  const gw = Math.ceil(W / CELL);
  const gh = Math.ceil(H / CELL);
  const mask = new Uint8Array(gw * gh);
  for (const l of keptLines) {
    const [x0, y0, x1, y1] = boxOf(l);
    for (let gy = Math.max(0, Math.floor(y0 / CELL)); gy <= Math.min(gh - 1, Math.floor(y1 / CELL)); gy++)
      for (let gx = Math.max(0, Math.floor(x0 / CELL)); gx <= Math.min(gw - 1, Math.floor(x1 / CELL)); gx++) mask[gy * gw + gx] = 1;
  }
  // «чернила»: клетка, где заметная доля тёмных/цветных пикселей (светлые плашки не считаются)
  const ink = new Uint8Array(gw * gh);
  for (let gy = Math.ceil(gh * 0.085); gy < gh * 0.94; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const k = gy * gw + gx;
      if (mask[k]) continue;
      let n = 0;
      let t = 0;
      for (let y = gy * CELL; y < Math.min(H, (gy + 1) * CELL); y += 2)
        for (let x = gx * CELL; x < Math.min(W, (gx + 1) * CELL); x += 2) {
          const p = (y * W + x) * 4;
          t++;
          if (0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2] < 215) n++;
        }
      if (t && n / t > 0.06) ink[k] = 1;
    }
  // связные области (с «мостиками» до 3 клеток)
  const lab = new Int32Array(gw * gh).fill(-1);
  const comps = [];
  for (let k = 0; k < gw * gh; k++) {
    if (!ink[k] || lab[k] >= 0) continue;
    const c = { x0: 1e9, y0: 1e9, x1: -1, y1: -1, n: 0 };
    const q = [k];
    lab[k] = comps.length;
    while (q.length) {
      const j = q.pop();
      const x = j % gw;
      const y = (j - x) / gw;
      c.n++;
      c.x0 = Math.min(c.x0, x);
      c.x1 = Math.max(c.x1, x);
      c.y0 = Math.min(c.y0, y);
      c.y1 = Math.max(c.y1, y);
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
          const jj = yy * gw + xx;
          if (ink[jj] && lab[jj] < 0) {
            lab[jj] = comps.length;
            q.push(jj);
          }
        }
    }
    comps.push(c);
  }
  const center = (l) => {
    const [x0, y0, x1, y1] = boxOf(l);
    return [(x0 + x1) / 2, (y0 + y1) / 2];
  };
  // куски одной схемы (картинки, разделённые подписями) объединяем: близко по вертикали и перекрываются по горизонтали
  let parts = comps.filter((c) => c.n >= 6).map((c) => ({ ...c, parts: 1 }));
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < parts.length && !changed; i++)
      for (let j = i + 1; j < parts.length && !changed; j++) {
        const a = parts[i];
        const b = parts[j];
        const vgap = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
        const hov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        if (vgap * CELL <= 70 && hov > Math.min(a.x1 - a.x0, b.x1 - b.x0) * 0.3) {
          const m = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), n: a.n + b.n, parts: a.parts + b.parts };
          // не объединяем, если между кусками много основного текста (два рисунка, разделённые абзацем)
          const box = [m.x0 * CELL, m.y0 * CELL, (m.x1 + 1) * CELL, (m.y1 + 1) * CELL];
          const txt = keptLines.filter((l) => {
            const [cx, cy] = center(l);
            return cx >= box[0] && cx <= box[2] && cy >= box[1] && cy <= box[3];
          }).reduce((s, l) => s + l.s.length, 0);
          if (txt > 350) continue;
          parts.splice(j, 1);
          parts[i] = m;
          changed = true;
        }
      }
  }
  const figs = [];
  for (const c of parts) {
    const cw = c.x1 - c.x0 + 1;
    const ch = c.y1 - c.y0 + 1;
    if (cw * CELL < 90 || ch * CELL < 60 || c.n < 30 || (c.parts === 1 && c.n / (cw * ch) < 0.12)) continue; // значки, линейки, рамки
    const r = [Math.max(0, c.x0 * CELL - 6), Math.max(0, c.y0 * CELL - 6), Math.min(W, (c.x1 + 1) * CELL + 6), Math.min(H, (c.y1 + 1) * CELL + 6)];
    // обрезка краёв: строки основного текста (не внутри рисунка) и рубрики не должны попадать на картинку
    const isInner = (l) => {
      const [cx, cy] = center(l);
      return cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3];
    };
    for (const l of keptLines) {
      const [x0, y0, x1, y1] = boxOf(l);
      if (Math.min(x1, r[2]) - Math.max(x0, r[0]) <= 0 || y1 <= r[1] || y0 >= r[3]) continue;
      const nearEdge = (y0 + y1) / 2 - r[1] < (r[3] - r[1]) * 0.25 || r[3] - (y0 + y1) / 2 < (r[3] - r[1]) * 0.25;
      const headingLike = rubricOf(l.s) || LESSON_ANY.test(l.s) || (l.bold && l.s.length < 60 && nearEdge);
      if (isInner(l) && !headingLike) continue;
      if ((y0 + y1) / 2 < (r[1] + r[3]) / 2) r[1] = Math.max(r[1], y1 + 2);
      else r[3] = Math.min(r[3], y0 - 2);
    }
    if (r[3] - r[1] < 50) continue;
    const inside = (l) => {
      const [cx, cy] = center(l);
      return cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3];
    };
    // область, накрывающая много основного текста, — это фон или оформление страницы, не рисунок
    const keptInside = keptLines.filter(inside).reduce((s, l) => s + l.s.length, 0);
    if (keptInside > 500) continue;
    if (allBlocks.some((b) => b.protect && b.lines.some(inside))) continue; // плашка с названием урока
    // рамка с текстом без рисунков внутри («Запомните», цитата) — оставляем текстом: он нужен для поиска и карточек
    if (keptInside >= 60) {
      let innerInk = 0;
      const gx0 = Math.floor(r[0] / CELL) + 2, gx1 = Math.floor(r[2] / CELL) - 2;
      const gy0 = Math.floor(r[1] / CELL) + 2, gy1 = Math.floor(r[3] / CELL) - 2;
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) if (ink[gy * gw + gx]) innerInk++;
      if (innerInk < 15) continue;
    }
    figs.push({ r, inside });
  }
  // сохраняем картинки, отмечаем блоки, попавшие внутрь рисунков
  const res = [];
  for (const f of figs) {
    const [x0, y0, x1, y1] = f.r;
    const cw = x1 - x0;
    const ch = y1 - y0;
    if (ch < 45 || cw / ch > 9 || (cw / ch > 4 && ch < 120)) continue; // тонкие и низкие полоски оформления
    // почти пустая вырезка (линия оформления на белом фоне)
    {
      let n = 0;
      let t = 0;
      for (let y = Math.round(y0); y < y1; y += 3)
        for (let x = Math.round(x0); x < x1; x += 3) {
          const p = (y * W + x) * 4;
          t++;
          if (0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2] < 235) n++;
        }
      if (n / t < 0.07) continue;
    }
    // значок/оформление одного насыщенного цвета (таблицы — серые, схемы и фото — многоцветные)
    {
      let nonWhite = 0;
      let sat = 0;
      const bins = new Map();
      for (let y = Math.round(y0); y < y1; y += 3)
        for (let x = Math.round(x0); x < x1; x += 3) {
          const p = (y * W + x) * 4;
          const r = px[p], g = px[p + 1], bl = px[p + 2];
          if (0.299 * r + 0.587 * g + 0.114 * bl >= 235) continue;
          nonWhite++;
          if (Math.max(r, g, bl) - Math.min(r, g, bl) > 60) {
            sat++;
            const key = (r >> 5) * 64 + (g >> 5) * 8 + (bl >> 5);
            bins.set(key, (bins.get(key) || 0) + 1);
          }
        }
      const top2 = [...bins.values()].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0);
      if (nonWhite && sat / nonWhite >= 0.8 && top2 / sat >= 0.75) continue;
    }
    const k = Math.min(1, 900 / cw);
    const c2 = createCanvas(Math.round(cw * k), Math.round(ch * k));
    c2.getContext('2d').drawImage(canvas, x0, y0, cw, ch, 0, 0, c2.width, c2.height);
    const name = `p${String(pi + 1).padStart(3, '0')}-${res.length + 1}.webp`;
    fs.writeFileSync(path.join(imgDir, name), c2.toBuffer('image/webp', 78));
    figCount++;
    const top = OCR ? 10000 - y0 / k2 : pageH - y0 / S;
    // левый квадрат — у значка рубрики с линией разной длины он одинаковый
    const sq = createCanvas(Math.min(c2.width, c2.height), c2.height);
    sq.getContext('2d').drawImage(c2, 0, 0);
    const fig = { src: `img/${imgBase}/${name}`, w: c2.width, h: c2.height, sig: signature(c2), sigL: signature(sq) };
    allFigs.push(fig);
    res.push({ fig, top, x0: x0 / S, lines: [] });
    for (const b of allBlocks) if (!b.inFig && b.lines.filter(f.inside).length >= b.lines.length * 0.6) b.inFig = true;
  }
  return res;
}

const LESSON_ANY = UZ ? LESSON_UZ : LESSON_RE;
// тот же отбор, что и в основном проходе: блок станет текстом (а не отброшенным обрывком)
function isKeptBlock(b) {
  const first = b.lines[0];
  const text = b.lines.map((l) => l.s).join(' ');
  if (LESSON_ANY.test(first.s)) return true;
  if (b.lines.length === 1) {
    if (rubricOf(text)) return true;
    const looks =
      (first.bold || (OCR && first.h > bodySize * 1.08 && text.split(' ').length >= 3)) && text.length >= 8 && text.length < 110 && /\s/.test(text) && !/[,;–.-]$/.test(text);
    return looks || (text.length >= 45 && /[.!?»:]$/.test(text));
  }
  return !(b.len < 60 && !rubricOf(first.s));
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

  if (FIG) {
    for (const b of blocks) b.protect = LESSON_ANY.test(b.lines[0].s) || (cfg.glossary && b.lines[0].s.toLowerCase().startsWith(cfg.glossary.toLowerCase().slice(0, 15)));
    const kept = blocks.filter(isKeptBlock).flatMap((b) => b.lines);
    const figs = await findFigures(pi, kept, blocks);
    if (figs.length) {
      const rest = blocks.filter((b) => !b.inFig || b.protect);
      blocks.length = 0;
      blocks.push(...rest, ...figs);
      blocks.sort((a, b) => b.top - a.top || a.x0 - b.x0);
    }
  }

  for (const b of blocks) {
    if (b.fig) {
      if (cur || inGlossary) out.push({ type: 'img', ...b.fig });
      continue;
    }
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
        emit(DEF_STRONG.test(text) || inGlossary ? 'def' : 'p', first.rich);
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
      const t = clean(para.text.replace(/\*\*(\s*)\*\*/g, '$1').replace(/\*\*\s*\*\*/g, ''));
      const tp = plain(t);
      const def = inGlossary || DEF_STRONG.test(tp) || ((para.bold || REMEMBER.test(prevH3())) && DEF_RE.test(tp));
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
        para = { text: l.rich, bold: l.bold };
      } else para.text = joinRich(para.text, l.rich);
      prev = l;
    }
    flush();
  }
}

// картинки, повторяющиеся в книге 3+ раза (значки рубрик, оформление), — не содержание
if (FIG) {
  let removed = 0;
  for (const f of allFigs) {
    const same = allFigs.filter((g) => sigClose(f.sig, g.sig)).length;
    const sameL = allFigs.filter((g) => sigClose(f.sigL, g.sigL, 10)).length;
    if (same >= 3 || sameL >= 4) f.repeat = true;
  }
  const rep = new Set(allFigs.filter((f) => f.repeat).map((f) => f.src));
  for (const b of out)
    if (b.type === 'img' && rep.has(b.src)) {
      b.type = 'drop';
      removed++;
    }
  for (const f of allFigs) if (f.repeat) fs.rmSync(path.join(imgDir, path.basename(f.src)), { force: true });
  figCount -= allFigs.filter((f) => f.repeat).length;
  if (removed) console.log(`повторяющихся значков убрано: ${allFigs.filter((f) => f.repeat).length}`);
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
  return next && (next.type === 'p' || next.type === 'def' || next.type === 'img');
});

// ---------- markdown ----------
let md = `# ${cfg.title}\n`;
for (const b of final) {
  if (b.type === 'h1') md += `\n# ${b.text}\n`;
  else if (b.type === 'h2') md += `\n## ${b.text}\n`;
  else if (b.type === 'h3') md += `\n### ${b.text}\n`;
  else if (b.type === 'def') md += `\n> ${b.text}\n`;
  else if (b.type === 'img') md += `\n![](${b.src} "${b.w}x${b.h}")\n`;
  else md += `\n${b.text}\n`;
}
fs.writeFileSync(a3, md);
const labels = new Set(out.filter((b) => b.type === 'h2').map((b) => b.text));
const missing = lessons.filter((l) => !labels.has(clean(lessonLabel(l))));
const found = lessons.length - missing.length;
console.log(`уроков: ${found}/${lessons.length}${missing.length ? '  НЕ НАЙДЕНЫ: ' + missing.map((l) => l.n).join(', ') : ''}${inGlossary ? ', словарь есть' : ''}`);
console.log(`абзацев: ${out.filter((b) => b.type === 'p').length}, определений: ${out.filter((b) => b.type === 'def').length}, подзаголовков: ${out.filter((b) => b.type === 'h3').length}`);
if (FIG) console.log(`рисунков/схем: ${figCount} → ${imgDir}`);
console.log(`символов: оставлено ${stats.kept}, отброшено ${stats.dropped} (подписи к схемам и обрывки — см. ${a3}.dropped.txt)`);
fs.writeFileSync(a3 + '.dropped.txt', stats.samples.join('\n'));
