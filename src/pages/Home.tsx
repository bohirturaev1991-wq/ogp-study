import { useCatalog } from '../data';
import { useStore } from '../store';
import { useT } from '../i18n';
import { Empty, Progress } from '../components';
import { myItems, readFraction, streak } from '../progress';
import { href } from '../router';
import { DocCard } from './Library';
import { TodayTasks } from './Plan';

export default function Home() {
  const { t, l, lang } = useT();
  const { data: items } = useCatalog();
  const s = useStore((s) => s);
  if (!items) return <Empty>{t('loading')}</Empty>;
  const mine = myItems(items, s, s.profile.role);
  const lastItem = s.last && items.find((i) => i.id === s.last!.doc);
  const overall = mine.length ? mine.reduce((a, i) => a + readFraction(s, i, lang), 0) / mine.length : 0;
  const st = streak(s);

  return (
    <div className="page">
      <section className="hero card">
        <div>
          <h1>{t('hello')}</h1>
          <p className="muted">
            {t(s.profile.role === 'teacher' ? 'teacher' : 'applicant')}
            {st > 0 && (
              <>
                {' · 🔥 '}
                {st} {t('streak')}
              </>
            )}
          </p>
        </div>
        <div className="hero-progress">
          <div className="big-num">{Math.round(overall * 100)}%</div>
          <div className="muted small">{t('overall')}</div>
          <Progress value={overall} />
        </div>
      </section>

      {lastItem && (
        <a className="card continue" href={href('/read/' + lastItem.id, { u: s.last!.unit })}>
          <span className="muted small">{t('continueReading')}</span>
          <strong>{l(lastItem.title)}</strong>
          <span className="arrow">→</span>
        </a>
      )}

      <h2>{t('goalsToday')}</h2>
      <TodayTasks items={mine} />

      <div className="quick">
        <a className="btn" href="#/quiz">
          ✓ {t('newTest')}
        </a>
        <a className="btn" href="#/cards">
          🗂 {t('cards')}
        </a>
        <a className="btn" href="#/search">
          🔍 {t('search')}
        </a>
      </div>

      <h2>{t('materials')}</h2>
      <div className="grid">
        {mine.map((i) => (
          <DocCard key={i.id} item={i} />
        ))}
      </div>
    </div>
  );
}
