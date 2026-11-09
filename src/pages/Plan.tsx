import { useCatalog } from '../data';
import { useStore, setState, today, type State } from '../store';
import { useT } from '../i18n';
import { Empty, Progress } from '../components';
import { docAccuracy, myItems, readFraction, streak, unitCount } from '../progress';
import { href } from '../router';
import { useDeckStats } from './Cards';
import type { CatalogItem, Lang } from '../types';

const DAY = 86400000;

export function planNumbers(s: State, items: CatalogItem[], lang: Lang) {
  const remaining = items.reduce((a, i) => a + Math.max(0, unitCount(i, lang) - Object.keys(s.read[i.id] || {}).length), 0);
  if (!s.profile.examDate) return { remaining, daysLeft: null as number | null, perDay: 2, review: false };
  const daysLeft = Math.ceil((new Date(s.profile.examDate).getTime() - new Date(today()).getTime()) / DAY);
  const review = daysLeft <= 7 || remaining === 0;
  const perDay = review ? 0 : Math.max(1, Math.ceil(remaining / Math.max(1, daysLeft - 7)));
  return { remaining, daysLeft, perDay, review };
}

export function TodayTasks({ items }: { items: CatalogItem[] }) {
  const { t, lang } = useT();
  const s = useStore((s) => s);
  const deck = useDeckStats();
  const { perDay, review } = planNumbers(s, items, lang);
  const act = s.activity[today()] || { read: 0, answered: 0, reviewed: 0 };
  // куда «продолжить»: последний открытый материал, если в нём есть непрочитанное, иначе первый с непрочитанным
  const target =
    items.find((i) => i.id === s.last?.doc && readFraction(s, i, lang) < 1) || items.find((i) => readFraction(s, i, lang) < 1 && unitCount(i, lang) > 0);
  const dueCount = deck ? deck.due.length + Math.min(20, deck.fresh.length) : null;
  const tasks = [
    !review && {
      label: t('todayRead', { n: perDay }),
      done: act.read >= perDay,
      sub: `${Math.min(act.read, perDay)}/${perDay}`,
      to: target ? href('/read/' + target.id) : '#/library',
    },
    { label: t('todayCards', { n: dueCount ?? '…' }), done: dueCount === 0 || (dueCount !== null && act.reviewed >= dueCount && act.reviewed > 0), sub: String(act.reviewed), to: '#/cards' },
    { label: t('todayTest'), done: act.answered >= 20, sub: `${Math.min(act.answered, 20)}/20`, to: '#/quiz' },
  ].filter(Boolean) as { label: string; done: boolean; sub: string; to: string }[];
  return (
    <div className="card tasks">
      {review && <div className="notice">{t('reviewPhase')}</div>}
      {tasks.map((x) => (
        <a key={x.label} className={'task' + (x.done ? ' done' : '')} href={x.to}>
          <span className="tick">{x.done ? '✓' : ''}</span>
          <span className="task-label">{x.label}</span>
          <span className="muted small">{x.sub}</span>
        </a>
      ))}
    </div>
  );
}

export default function Plan() {
  const { t, l, lang } = useT();
  const { data: items } = useCatalog();
  const s = useStore((s) => s);
  if (!items) return <Empty>{t('loading')}</Empty>;
  const mine = myItems(items, s, s.profile.role);
  const { daysLeft, perDay, remaining } = planNumbers(s, mine, lang);
  const setDocs = (docs: string[]) => setState((st) => ({ ...st, profile: { ...st.profile, docs } }));
  const toggle = (id: string) => {
    const cur = mine.map((i) => i.id);
    setDocs(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };
  const weak = mine.filter((i) => {
    const a = docAccuracy(s, i.id);
    return a.seen >= 5 && a.acc! < 0.7;
  });

  return (
    <div className="page">
      <h1>{t('plan')}</h1>
      <div className="card form">
        <label className="field">
          <span>{t('examDate')}</span>
          <input
            type="date"
            value={s.profile.examDate || ''}
            min={today()}
            onChange={(e) => setState((st) => ({ ...st, profile: { ...st.profile, examDate: e.target.value || undefined } }))}
          />
        </label>
        {daysLeft !== null ? (
          <div className="stat-row">
            <div>
              <div className="big-num">{daysLeft}</div>
              <div className="muted small">{t('daysLeft')}</div>
            </div>
            <div>
              <div className="big-num">{remaining}</div>
              <div className="muted small">{t('chapters')}</div>
            </div>
            <div>
              <div className="big-num">{perDay}</div>
              <div className="muted small">/ {t('today').toLowerCase()}</div>
            </div>
          </div>
        ) : (
          <p className="muted small">{t('noExamDate')}</p>
        )}
        <p className="muted small">{t('planHint')}</p>
      </div>

      <h2>{t('today')}</h2>
      <TodayTasks items={mine} />

      {weak.length > 0 && (
        <>
          <h2>{t('weak')}</h2>
          <div className="card">
            <p className="muted small">{t('weakHint')}</p>
            {weak.map((i) => (
              <div key={i.id} className="row between">
                <span>{l(i.short)}</span>
                <a className="btn small" href={href('/quiz', { doc: i.id })}>
                  {t('newTest')}
                </a>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>{t('progress')}</h2>
      <div className="card">
        {items.map((i) => {
          const on = mine.some((m) => m.id === i.id);
          const a = docAccuracy(s, i.id);
          const f = readFraction(s, i, lang);
          return (
            <div key={i.id} className={'prog-row' + (on ? '' : ' off')}>
              <label className="check">
                <input type="checkbox" checked={on} onChange={() => toggle(i.id)} />
                <span>{l(i.short)}</span>
              </label>
              <Progress value={f} />
              <span className="small muted">
                {Math.round(f * 100)}%{a.acc !== null && ` · ✓${Math.round(a.acc * 100)}%`}
              </span>
            </div>
          );
        })}
      </div>

      <h2>
        {t('activity')} · 🔥 {streak(s)} {t('streak')}
      </h2>
      <Heatmap s={s} />
    </div>
  );
}

function Heatmap({ s }: { s: State }) {
  const weeks = 16;
  const end = new Date();
  const start = new Date(end.getTime() - (weeks * 7 - 1) * DAY);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // с понедельника
  const days: { k: string; v: number }[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + DAY)) {
    const k = d.toISOString().slice(0, 10);
    const a = s.activity[k];
    days.push({ k, v: a ? a.read * 5 + a.answered + a.reviewed : 0 });
  }
  const lvl = (v: number) => (v === 0 ? 0 : v < 10 ? 1 : v < 30 ? 2 : v < 60 ? 3 : 4);
  return (
    <div className="card heatmap" role="img" aria-label="activity">
      {days.map((d) => (
        <span key={d.k} className={'hm l' + lvl(d.v)} title={`${d.k}: ${d.v}`} />
      ))}
    </div>
  );
}
