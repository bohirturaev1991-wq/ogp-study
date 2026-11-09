import { useEffect, useState } from 'react';
import { useCatalog } from '../data';
import { useT } from '../i18n';
import { Empty, Hl } from '../components';
import { search, snippet, type Hit } from '../search';
import { href, useRoute } from '../router';

export default function SearchPage() {
  const { t, l, lang } = useT();
  const { params } = useRoute();
  const { data: items } = useCatalog();
  const [q, setQ] = useState(params.get('q') || '');
  const [doc, setDoc] = useState(params.get('doc') || '');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!items) return;
    const query = q.trim();
    if (query.length < 2) {
      setHits(null);
      return;
    }
    let alive = true;
    setBusy(true);
    const h = setTimeout(() => {
      search(items, lang, query, doc || undefined).then((r) => {
        if (!alive) return;
        setHits(r);
        setBusy(false);
        history.replaceState(null, '', href('/search', { q: query, doc }));
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [q, doc, items, lang]);

  if (!items) return <Empty>{t('loading')}</Empty>;
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));

  return (
    <div className="page">
      <h1>{t('search')}</h1>
      <div className="search-bar">
        <input
          autoFocus
          type="search"
          value={q}
          placeholder={t('searchPlaceholder')}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t('search')}
        />
        <select value={doc} onChange={(e) => setDoc(e.target.value)} aria-label={t('materials')}>
          <option value="">{t('allMaterials')}</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {l(i.short)}
            </option>
          ))}
        </select>
      </div>
      <p className="muted small">{busy ? t('loading') : hits ? `${hits.length} ${t('results')}` : t('searchHint')}</p>
      {hits && !hits.length && <Empty>{t('nothingFound')}</Empty>}
      <div className="hits">
        {hits?.slice(0, 100).map((h) => (
          <a key={h.id} className="card hit" href={href('/read/' + h.doc, { u: h.unit, a: h.anchor, hl: q })}>
            <div className="hit-head">
              <span className="badge">{l(byId[h.doc]?.short)}</span>
              <strong>
                <Hl text={h.label} q={q} />
              </strong>
            </div>
            <div className="hit-text">
              <Hl text={snippet(h.text, q)} q={q} />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
