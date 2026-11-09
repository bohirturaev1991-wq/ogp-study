import { useCatalog, docLang } from '../data';
import { useStore } from '../store';
import { useT } from '../i18n';
import { Progress, Empty } from '../components';
import { readFraction, docAccuracy } from '../progress';
import { href } from '../router';
import type { CatalogItem } from '../types';

export default function Library() {
  const { t } = useT();
  const { data: items, error } = useCatalog();
  if (error) return <Empty>{error.message}</Empty>;
  if (!items) return <Empty>{t('loading')}</Empty>;
  const books = items.filter((i) => i.kind === 'book');
  const npa = items.filter((i) => i.kind === 'npa');
  return (
    <div className="page">
      <h1>{t('library')}</h1>
      <h2>{t('books')}</h2>
      {books.length ? <div className="grid">{books.map((b) => <DocCard key={b.id} item={b} />)}</div> : <Empty>{t('noBooks')}</Empty>}
      <h2>
        {t('npa')} <span className="muted">({npa.length})</span>
      </h2>
      <div className="grid">
        {npa.map((b) => (
          <DocCard key={b.id} item={b} />
        ))}
      </div>
    </div>
  );
}

export function DocCard({ item }: { item: CatalogItem }) {
  const { t, l, lang } = useT();
  const frac = useStore((s) => readFraction(s, item, lang));
  const acc = useStore((s) => docAccuracy(s, item.id).acc);
  const dl = docLang(item, lang);
  const st = dl ? item.langs[dl] : undefined;
  return (
    <a className={'card doc-card' + (dl ? '' : ' disabled')} href={dl ? href('/read/' + item.id) : undefined}>
      <div className="doc-kind">{item.kind === 'book' ? '📘' : '⚖️'}</div>
      <div className="doc-body">
        <div className="doc-title">{l(item.title)}</div>
        <div className="muted small">
          {item.author && <>{item.author} · </>}
          {item.date && <>{item.date.split('-').reverse().join('.')} · </>}
          {st && (item.kind === 'npa' ? `${st.articles} ${t('articles')}` : `${st.units} ${t('chapters')}`)}
          {dl && dl !== lang && <> · {dl.toUpperCase()}</>}
        </div>
        <Progress value={frac} />
        <div className="muted small">
          {Math.round(frac * 100)}% {t('readPct')}
          {acc !== null && (
            <>
              {' · '}
              {Math.round(acc * 100)}% {t('accuracy')}
            </>
          )}
        </div>
      </div>
    </a>
  );
}
