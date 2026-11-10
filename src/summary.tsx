// Конспект урока: майндкарта (тема → подтемы → термины), таблица ключевых понятий и схемы урока.
// Строится автоматически из структуры урока: подзаголовков, жирных терминов и определений.
import { useMemo } from 'react';
import { useT } from './i18n';
import { plain, type Block } from './types';

// рубрики учебников — это не подтемы содержания
const RUBRIC =
  /^(активизирующие вопросы|закрепляем знания|запомните|выполняем вместе|закон (определяет|устанавливает)|продолжа\S* (изучение|исследовать)|сдела\S* (заключение|вывод\S*)|основные понятия|подтверждаем|историческая справка|взгляд на историю|вопросы и задания|задание|вы узнаете|творческая (работа|деятельность)|это интересно|минута активности|faollashtiruvchi savollar|fikrimizni tasdiqlaymiz|yodda tuting|birgalikda bajaramiz|hamkorlikda bajaramiz|qonun belgilaydi|xulosa\b.*|asosiy tushunchalar|tarixga nazar|siz bilib olasiz|savol va topshiriqlar|mustaqil ish.*|ijodiy (ish|faoliyat)|bilimlarni mustahkamlaymiz|oʻrganishni davom.*|tasdiqlaymiz)!?$/i;

interface Branch {
  title: string;
  leaves: string[];
}

// вводные слова перед термином: «Значит, общество – …», «Так, терроризм – …»
const LEAD = /^(значит|так|итак|таким образом|например|следовательно|другими словами|demak|masalan|shunday qilib|yaʼni),\s*/i;
const termOf = (x: string) => {
  const m = plain(x).match(/^[«"“]?(.{2,60}?)[»"”]?\s[—–-]\s/u);
  if (!m) return null;
  const t = m[1].replace(LEAD, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : null;
};
// ключевые признаки из определения: части через запятую/точку с запятой, коротко
const clauses = (def: string) =>
  def
    .replace(/[.…]+$/, '')
    .split(/[;,]\s+/)
    .map((c) => c.trim())
    .filter((c) => c.length >= 6)
    .slice(0, 4)
    .map((c) => (c.length > 55 ? c.slice(0, 55).replace(/\s+\S*$/, '') + '…' : c));
const boldTerms = (x: string) =>
  x
    .split('**')
    .filter((_, i) => i % 2 === 1)
    .map((s) => s.replace(/[.,:;–—-]+$/, '').trim())
    .filter((s) => s.length >= 3 && s.length <= 45 && s.split(/\s+/).length <= 6 && !/\d/.test(s) && !/^(статья|из статьи|глава|урок|modda)/i.test(s))
    .map((s) => s.replace(LEAD, ''));

export function LessonSummary({ blocks, title }: { blocks: Block[]; title: string }) {
  const { t } = useT();
  const { branches, defs, figs } = useMemo(() => {
    const branches: Branch[] = [];
    const general: Branch = { title: '', leaves: [] };
    let cur: Branch = general;
    const defs: { term: string; def: string }[] = [];
    const figs: string[] = [];
    const add = (b: Branch, leaf: string) => {
      const k = leaf.toLowerCase();
      if (!b.leaves.some((l) => l.toLowerCase() === k) && b.leaves.length < 6) b.leaves.push(leaf);
    };
    for (const b of blocks) {
      if (b.t === 'h' && b.l === 3) {
        const h = plain(b.x).replace(/[:.]$/, '');
        if (RUBRIC.test(h)) continue;
        cur = { title: h, leaves: [] };
        branches.push(cur);
      } else if (b.t === 'p') {
        const term = termOf(b.x);
        if (b.k === 'def' && term) {
          add(cur, term);
          const x = plain(b.x);
          defs.push({ term, def: x.slice(x.indexOf(term) + term.length).replace(/^[»"”]?\s*[—–-]\s*(это\s|bu\s)?/u, '') });
        } else for (const bt of boldTerms(b.x)) add(cur, bt);
      } else if (b.t === 'img') figs.push(b.src);
    }
    let out: Branch[];
    if (branches.length >= 2) {
      // по подтемам урока
      if (general.leaves.length) branches.unshift({ ...general, title: t('keyTerms') });
      out = branches;
    } else {
      // подтем нет — ветки по определённым терминам, листья — их ключевые признаки
      out = defs.map((d) => ({ title: d.term, leaves: clauses(d.def) }));
      const rest = [...general.leaves, ...branches.flatMap((b) => b.leaves)].filter((l) => !defs.some((d) => d.term.toLowerCase() === l.toLowerCase()));
      if (rest.length) out.push({ title: t('keyTerms'), leaves: rest.slice(0, 6) });
    }
    return { branches: out.slice(0, 8), defs, figs };
  }, [blocks, t]);

  const root = title.replace(/^(Урок[и]?\s+[\d–-]+\.|[\d–-]+-dars\.)\s*/i, '');
  return (
    <section className="summary card">
      <h3>🧭 {t('mindMap')}</h3>
      <div className="mm">
        <div className="mm-root">{root}</div>
        <div className="mm-branches">
          {branches.map((b, i) => (
            <div key={i} className={'mm-branch c' + (i % 6)}>
              <div className="mm-title">{b.title}</div>
              {b.leaves.length > 0 && (
                <div className="mm-leaves">
                  {b.leaves.map((l) => (
                    <span key={l} className="mm-leaf">
                      {l}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {defs.length > 0 && (
        <>
          <h3>📋 {t('keyTerms')}</h3>
          <table className="terms">
            <thead>
              <tr>
                <th>{t('term')}</th>
                <th>{t('definition')}</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((d) => (
                <tr key={d.term}>
                  <td>
                    <strong>{d.term}</strong>
                  </td>
                  <td>{d.def}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {figs.length > 0 && (
        <div className="mm-figs">
          {figs.map((src) => (
            <img key={src} src={'content/' + src} alt="" loading="lazy" />
          ))}
        </div>
      )}
    </section>
  );
}
