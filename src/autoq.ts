// Автоматические вопросы по текстам НПА — чтобы тренироваться по всем 35–40 актам,
// даже пока вручную составленных вопросов мало.
//  1) «В какой статье закреплено …?» — 4 варианта номеров статей
//  2) «Заполните пропуск» — сроки, возраст, количества (цифры из текста статьи)
import type { Block, CatalogItem, Lang, Question } from './types';
import { tr } from './i18n';

const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

interface Art {
  n: string;
  text: string;
}

function articles(blocks: Block[]): Art[] {
  const out: Art[] = [];
  let cur: Art | null = null;
  for (const b of blocks) {
    if (b.t === 'a') out.push((cur = { n: b.n, text: '' }));
    else if (b.t === 'p' && cur) cur.text += (cur.text ? ' ' : '') + b.x;
    else cur = null;
  }
  return out.filter((a) => a.text.length > 40);
}

// слишком общие фразы встречаются во многих статьях — по ним нельзя однозначно узнать статью
const GENERIC = /(qonun(lar)? bilan belgilanadi|qonunchilikda belgilanadi|определя\S* законом|устанавлива\S* законом|в порядке, установленном законом)\.?$/iu;
// ссылки «на себя» — без текста самой статьи вопрос не имеет смысла
const SELF = /(ushbu modda|ushbu qism|mazkur modda|bu qoida|настоящ\S* стать|настоящ\S* част|этой стать|это правило|указанн\S* в части)/iu;
const sentences = (t: string) =>
  t
    .split(/(?<=[.;:])\s+(?=[A-ZА-ЯЎҚҒҲʻ«"0-9])/u)
    .map((s) => s.replace(/^\d+\)\s*/, ''))
    .filter((s) => s.length > 50 && !SELF.test(s) && !(s.length < 110 && GENERIC.test(s)));

const strip = (s: string, max = 230) => (s.length > max ? s.slice(0, max).replace(/\s+\S*$/, '') + '…' : s);

function whichArticle(item: CatalogItem, lang: Lang, arts: Art[]): Question | null {
  if (arts.length < 4) return null;
  const a = rnd(arts);
  const s = rnd(sentences(a.text)) || a.text;
  // соседние номера — самые «коварные» дистракторы
  const idx = arts.indexOf(a);
  const pool = arts.filter((x, i) => x !== a && Math.abs(i - idx) <= 12).map((x) => x.n);
  const wrong = shuffle([...new Set(pool)]).slice(0, 3);
  if (wrong.length < 3) return null;
  const label = (n: string) => (lang === 'uz' ? `${n}-modda` : `Статья ${n}`);
  const opts = [a.n, ...wrong].map(label);
  const q = tr(lang, 'whichArticle', { x: strip(s.replace(/[.;:]$/, '')), doc: item.short[lang] });
  return {
    id: `auto:wa:${item.id}:${a.n}:${s.length}`,
    doc: item.id,
    art: a.n,
    q: { uz: q, ru: q },
    options: { uz: opts, ru: opts },
    answer: 0,
    auto: true,
  };
}

// число + единица (лет, дней, yil, kun …), но не ссылки на статьи («12-модда», «статья 5»)
const NUM_RE =
  // число отделено пробелом от единицы: «10 kun», «18 лет» (но не «1-kunidan», «2019-yil», «1941 — 1945»)
  /(?<![\d\-–—.,]\s?)(\d{1,3})(?=\s+(?:yosh\p{L}*|yil\p{L}*|oy|oydan|oylik|kun\p{L}*|ish kuni\p{L}*|soat\p{L}*|foiz\p{L}*|nafar|marta|baravar|лет|год|года|годам?|месяц(?:а|ев)?|дн(?:я|ей)|день|суток|час(?:а|ов)?|процент(?:а|ов)?|человек|раза?|депутат(?:а|ов)?|сенатор(?:а|ов)?|aʼzo\p{L}*|член(?:а|ов)?)(?!\p{L})|\s*%)/iu;

function fillNumber(item: CatalogItem, lang: Lang, arts: Art[]): Question | null {
  const cands: { a: Art; s: string; m: RegExpMatchArray }[] = [];
  for (const a of arts)
    for (const s of sentences(a.text)) {
      const m = s.match(NUM_RE);
      if (m && m.index !== undefined) cands.push({ a, s, m });
    }
  if (!cands.length) return null;
  const { a, s, m } = rnd(cands);
  const n = +m[1];
  const blank = s.slice(0, m.index!) + '____' + s.slice(m.index! + m[1].length);
  const set = new Set<number>([n]);
  const alts =
    n <= 10
      ? [n + 1, n + 2, n + 3, n - 1, n - 2, n + 5]
      : n <= 31
        ? [n + 1, n + 2, n + 5, n - 1, n - 2, n - 5, n + 10]
        : [Math.round(n / 2), n * 2, n + 10, n - 10, Math.round(n * 1.5)];
  for (const v of shuffle(alts)) {
    if (v > 0 && v !== n) set.add(v);
    if (set.size === 4) break;
  }
  if (set.size < 4) return null;
  const opts = [...set].map(String);
  const head = tr(lang, 'fillNumber', { doc: item.short[lang], n: a.n });
  const q = `${head}\n${strip(blank, 320)}`;
  return {
    id: `auto:fn:${item.id}:${a.n}:${m.index}`,
    doc: item.id,
    art: a.n,
    q: { uz: q, ru: q },
    options: { uz: opts, ru: opts },
    answer: 0,
    auto: true,
  };
}

export function generateAuto(item: CatalogItem, blocks: Block[], lang: Lang, count: number): Question[] {
  const arts = articles(blocks);
  const out: Question[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < count && tries < count * 8; tries++) {
    const q = Math.random() < 0.6 ? whichArticle(item, lang, arts) : fillNumber(item, lang, arts);
    if (q && !seen.has(q.id)) {
      seen.add(q.id);
      out.push(q);
    }
  }
  return out;
}

// ---------- авто-вопросы по учебникам: из определений «**Термин** – это …» ----------
//  «Что означает термин X?» (варианты — определения) и «Какой термин соответствует определению?»
export interface BookDef {
  term: string;
  def: string;
  unit: string;
  i: number;
}

export function bookDefs(blocks: Block[], unitOf: (i: number) => string): BookDef[] {
  const out: BookDef[] = [];
  blocks.forEach((b, i) => {
    if (b.t !== 'p' || b.k !== 'def') return;
    const x = b.x.split('**').join('');
    const m = x.match(/^[«"“]?(.{2,70}?)[»"”]?\s[—–-]\s(?:это\s|bu\s)?(.{20,})$/u);
    if (!m) return;
    let term = m[1]
      .replace(/^(значит|так|итак|таким образом|например|следовательно|другими словами|demak|masalan|shunday qilib|yaʼni),\s*/i, '')
      .replace(/\s*\([^)]*\)\s*$/, '') // «Адвокат (лат. …)» → «Адвокат»
      .trim();
    if (!term) return;
    term = term[0].toUpperCase() + term.slice(1);
    if (term.split(/\s+/).length > 7) return;
    const def = m[2].trim();
    out.push({ term, def: def.length > 220 ? def.slice(0, 220).replace(/\s+\S*$/, '') + '…' : def, unit: unitOf(i), i });
  });
  // один термин — одно определение (первое)
  const seen = new Set<string>();
  return out.filter((d) => {
    const k = d.term.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function generateBookAuto(item: CatalogItem, defs: BookDef[], lang: Lang, count: number, unit?: string): Question[] {
  const pool = unit ? defs.filter((d) => d.unit === unit) : defs;
  if (defs.length < 4) return [];
  const out: Question[] = [];
  for (const d of shuffle(pool)) {
    if (out.length >= count) break;
    // дистракторы — сначала из того же урока, затем из книги
    const others = shuffle(defs.filter((x) => x !== d && x.term.toLowerCase() !== d.term.toLowerCase()));
    others.sort((a, b) => Number(b.unit === d.unit) - Number(a.unit === d.unit));
    const wrong = others.slice(0, 3);
    if (wrong.length < 3) continue;
    const reverse = Math.random() < 0.5;
    const q = reverse
      ? tr(lang, 'whichTerm', { x: d.def })
      : tr(lang, 'whatMeans', { x: d.term });
    const opts = reverse ? [d.term, ...wrong.map((w) => w.term)] : [d.def, ...wrong.map((w) => w.def)];
    out.push({
      id: `auto:bd:${item.id}:${d.i}:${reverse ? 'r' : 'd'}`,
      doc: item.id,
      unit: d.unit,
      q: { uz: q, ru: q },
      options: { uz: opts, ru: opts },
      answer: 0,
      auto: true,
    });
  }
  return out;
}
