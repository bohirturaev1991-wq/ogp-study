import { useEffect, useMemo, useState } from 'react';
import { docLang, loadDoc, loadQuestions, useAsync, useCatalog } from '../data';
import { useStore, setState, getState, bumpActivity } from '../store';
import { useT } from '../i18n';
import { Empty, Progress } from '../components';
import { generateAuto, shuffle } from '../autoq';
import { myItems } from '../progress';
import { href, useRoute } from '../router';
import type { CatalogItem, Lang, Question } from '../types';

type Mode = 'practice' | 'exam';
type Pool = 'all' | 'new' | 'wrong';
interface RunQ {
  q: Question;
  order: number[]; // перемешанные индексы вариантов
  picked?: number; // индекс в исходных options
}
interface Run {
  mode: Mode;
  qs: RunQ[];
  started: number;
  limit: number; // сек, 0 — без лимита
  docs: string[];
}

export default function Quiz() {
  const { t } = useT();
  const { data: items } = useCatalog();
  const { data: questions } = useAsync(loadQuestions, []);
  const [run, setRun] = useState<Run | null>(null);
  const [done, setDone] = useState<Run | null>(null);
  if (!items || !questions) return <Empty>{t('loading')}</Empty>;
  if (done) return <Results run={done} items={items} onAgain={() => setDone(null)} />;
  if (run)
    return (
      <Runner
        run={run}
        items={items}
        onFinish={(r) => {
          record(r);
          setRun(null);
          setDone(r);
        }}
      />
    );
  return <Setup items={items} questions={questions} onStart={setRun} />;
}

function Setup({ items, questions, onStart }: { items: CatalogItem[]; questions: Question[]; onStart: (r: Run) => void }) {
  const { t, l, lang } = useT();
  const { params } = useRoute();
  const s = useStore((s) => s);
  const mine = myItems(items, s, s.profile.role).map((i) => i.id);
  const [docs, setDocs] = useState<string[]>(params.get('doc') ? [params.get('doc')!] : mine);
  const [count, setCount] = useState(20);
  const [mode, setMode] = useState<Mode>('practice');
  const [pool, setPool] = useState<Pool>((params.get('pool') as Pool) || 'all');
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const mistakesCount = Object.values(s.mistakes).filter((q) => docs.includes(q.doc)).length;

  const start = async () => {
    setBusy(true);
    setMsg('');
    const st = getState();
    let picked: Question[];
    if (pool === 'wrong') {
      picked = shuffle(Object.values(st.mistakes).filter((q) => docs.includes(q.doc))).slice(0, count);
    } else {
      const manual = shuffle(
        questions.filter((q) => docs.includes(q.doc) && (q.q[lang] || q.q.uz || q.q.ru) && (pool === 'all' || !st.qstats[q.id])),
      );
      picked = manual.slice(0, count);
      if (auto && picked.length < count) {
        // только акты со статьями; не грузим все 36 текстов — берём случайные ~по 3 вопроса с акта
        const need = count - picked.length;
        const npa = shuffle(
          items.filter((i) => i.kind === 'npa' && docs.includes(i.id) && Object.values(i.langs).some((l) => l && l.articles >= 4)),
        ).slice(0, Math.max(1, Math.ceil(need / 3)));
        const per = Math.ceil(need / Math.max(1, npa.length)) + 2;
        let gen: Question[] = [];
        for (const it of npa) {
          const dl = docLang(it, lang);
          if (!dl) continue;
          const blocks = await loadDoc(it.id, dl);
          gen.push(...generateAuto(it, blocks, dl, per).filter((q) => pool === 'all' || !st.qstats[q.id]));
        }
        gen = shuffle(gen).slice(0, need);
        picked = shuffle([...picked, ...gen]);
      }
    }
    setBusy(false);
    if (!picked.length) {
      setMsg(t('noQuestions'));
      return;
    }
    onStart({
      mode,
      docs,
      started: Date.now(),
      limit: mode === 'exam' ? Math.round(picked.length * 1.5) * 60 : 0,
      qs: picked.map((q) => ({ q, order: shuffle(optionsOf(q, lang).map((_, i) => i)) })),
    });
  };

  const toggle = (id: string) => setDocs((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  const manualCount = questions.filter((q) => docs.includes(q.doc)).length;

  return (
    <div className="page">
      <h1>{t('newTest')}</h1>
      <div className="card form">
        <div className="field">
          <span>{t('materials')}</span>
          <div className="chips">
            {items.map((i) => (
              <button key={i.id} className={'chip' + (docs.includes(i.id) ? ' on' : '')} onClick={() => toggle(i.id)}>
                {l(i.short)}
              </button>
            ))}
          </div>
          <span className="muted small">
            {t('question')}: {manualCount}
            {auto && ' + ' + t('autoLabel')}
          </span>
        </div>
        <div className="field">
          <span>{t('count')}</span>
          <div className="seg">
            {[10, 20, 30, 50].map((n) => (
              <button key={n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>{t('mode')}</span>
          <div className="seg">
            <button className={mode === 'practice' ? 'on' : ''} onClick={() => setMode('practice')}>
              {t('practice')}
            </button>
            <button className={mode === 'exam' ? 'on' : ''} onClick={() => setMode('exam')}>
              {t('exam')} · {Math.round(count * 1.5)} {t('minutes')}
            </button>
          </div>
        </div>
        <div className="field">
          <span>{t('pool')}</span>
          <div className="seg">
            <button className={pool === 'all' ? 'on' : ''} onClick={() => setPool('all')}>
              {t('poolAll')}
            </button>
            <button className={pool === 'new' ? 'on' : ''} onClick={() => setPool('new')}>
              {t('poolNew')}
            </button>
            <button className={pool === 'wrong' ? 'on' : ''} onClick={() => setPool('wrong')}>
              {t('poolWrong')} ({mistakesCount})
            </button>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} disabled={pool === 'wrong'} />
          {t('autoQ')}
        </label>
        {msg && <div className="notice">{msg}</div>}
        <button className="btn primary wide" disabled={!docs.length || busy} onClick={start}>
          {busy ? t('loading') : t('start')}
        </button>
      </div>
      <History items={items} />
    </div>
  );
}

const optionsOf = (q: Question, lang: Lang) => (q.options[lang]?.length ? q.options[lang] : q.options.uz.length ? q.options.uz : q.options.ru);
const textOf = (q: Question, lang: Lang) => q.q[lang] || q.q.uz || q.q.ru;

function Runner({ run, items, onFinish }: { run: Run; items: CatalogItem[]; onFinish: (r: Run) => void }) {
  const { t, l, lang } = useT();
  const [qs, setQs] = useState(run.qs);
  const [i, setI] = useState(0);
  const [now, setNow] = useState(Date.now());
  const exam = run.mode === 'exam';
  const cur = qs[i];
  const opts = optionsOf(cur.q, lang);
  const revealed = !exam && cur.picked !== undefined;
  const left = run.limit ? Math.max(0, run.limit - Math.floor((now - run.started) / 1000)) : 0;
  const finish = () => onFinish({ ...run, qs });

  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  useEffect(() => {
    if (run.limit && left === 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const pick = (oi: number) => {
    if (revealed) return;
    setQs((a) => a.map((x, k) => (k === i ? { ...x, picked: oi } : x)));
  };
  const item = items.find((x) => x.id === cur.q.doc);
  const answered = qs.filter((x) => x.picked !== undefined).length;

  return (
    <div className="page quiz">
      <div className="quiz-top">
        <span>
          {t('question')} {i + 1}/{qs.length}
        </span>
        {run.limit > 0 && (
          <span className={'timer' + (left < 60 ? ' warn' : '')}>
            ⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </span>
        )}
        <button className="btn ghost small" onClick={finish}>
          {t('finish')}
        </button>
      </div>
      <Progress value={(exam ? answered : i + (revealed ? 1 : 0)) / qs.length} />

      <div className="card question">
        <div className="muted small">
          {l(item?.short)}
          {cur.q.art && ` · ${lang === 'uz' ? cur.q.art + '-modda' : 'ст. ' + cur.q.art}`}
          {cur.q.lesson && ` · ${lang === 'uz' ? cur.q.lesson + '-dars' : 'урок ' + cur.q.lesson}`}
          {cur.q.auto && <span className="badge soft">{t('autoLabel')}</span>}
        </div>
        <p className="q-text">{textOf(cur.q, lang)}</p>
        <div className="options">
          {cur.order.map((oi, k) => {
            let cls = 'option';
            if (cur.picked === oi) cls += ' picked';
            if (revealed && oi === cur.q.answer) cls += ' right';
            if (revealed && cur.picked === oi && oi !== cur.q.answer) cls += ' wrong';
            return (
              <button key={oi} className={cls} onClick={() => pick(oi)} disabled={revealed}>
                <span className="opt-letter">{'ABCDEF'[k]}</span>
                <span>{opts[oi]}</span>
              </button>
            );
          })}
        </div>
        {revealed && <Explain q={cur.q} correct={cur.picked === cur.q.answer} />}
      </div>

      {exam && (
        <div className="palette">
          {qs.map((x, k) => (
            <button key={k} className={(k === i ? 'cur ' : '') + (x.picked !== undefined ? 'ans' : '')} onClick={() => setI(k)}>
              {k + 1}
            </button>
          ))}
        </div>
      )}

      <div className="row between">
        <button className="btn ghost" disabled={i === 0 || !exam} onClick={() => setI(i - 1)} style={{ visibility: exam ? 'visible' : 'hidden' }}>
          ← {t('prev')}
        </button>
        {i < qs.length - 1 ? (
          <button className="btn primary" disabled={!exam && !revealed} onClick={() => setI(i + 1)}>
            {t('next')} →
          </button>
        ) : (
          <button className="btn primary" disabled={!exam && !revealed} onClick={finish}>
            {t('finish')}
          </button>
        )}
      </div>
    </div>
  );
}

function Explain({ q, correct }: { q: Question; correct: boolean }) {
  const { t, l } = useT();
  return (
    <div className={'explain ' + (correct ? 'ok' : 'bad')}>
      <strong>{correct ? t('correct') : t('wrong')}</strong>
      {q.explain && <p>{l(q.explain)}</p>}
      {(q.art || q.unit) && (
        <a href={srcHref(q)} target="_blank" rel="noreferrer">
          {t('source')} →
        </a>
      )}
    </div>
  );
}

const srcHref = (q: Question) => href('/read/' + q.doc, q.art ? { a: 'a' + q.art } : { u: q.unit! });

function record(r: Run) {
  const correct = r.qs.filter((x) => x.picked === x.q.answer).length;
  setState((s) => {
    const qstats = { ...s.qstats };
    const mistakes = { ...s.mistakes };
    for (const x of r.qs) {
      if (x.picked === undefined) continue;
      const ok = x.picked === x.q.answer;
      const p = qstats[x.q.id] || { seen: 0, correct: 0, doc: x.q.doc };
      qstats[x.q.id] = { ...p, seen: p.seen + 1, correct: p.correct + (ok ? 1 : 0), lastWrong: !ok };
      if (ok) delete mistakes[x.q.id];
      else mistakes[x.q.id] = x.q;
    }
    const keys = Object.keys(mistakes);
    for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete mistakes[k];
    const rec = { at: Date.now(), mode: r.mode, total: r.qs.length, correct, secs: Math.round((Date.now() - r.started) / 1000), docs: r.docs };
    return { ...s, qstats, mistakes, history: [rec, ...s.history].slice(0, 100) };
  });
  bumpActivity('answered', r.qs.filter((x) => x.picked !== undefined).length);
}

function Results({ run, items, onAgain }: { run: Run; items: CatalogItem[]; onAgain: () => void }) {
  const { t, l, lang } = useT();
  const correct = run.qs.filter((x) => x.picked === x.q.answer).length;
  const pct = Math.round((correct / run.qs.length) * 100);
  const wrong = run.qs.filter((x) => x.picked !== x.q.answer);
  const byDoc = useMemo(() => {
    const m = new Map<string, { n: number; ok: number }>();
    for (const x of run.qs) {
      const e = m.get(x.q.doc) || { n: 0, ok: 0 };
      e.n++;
      if (x.picked === x.q.answer) e.ok++;
      m.set(x.q.doc, e);
    }
    return [...m.entries()];
  }, [run]);
  const secs = Math.round((Date.now() - run.started) / 1000);
  return (
    <div className="page">
      <h1>{t('result')}</h1>
      <div className="card result">
        <div className={'big-num ' + (pct >= 70 ? 'good' : pct >= 50 ? 'mid' : 'bad')}>{pct}%</div>
        <div>
          {correct} / {run.qs.length} · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
        </div>
        <div className="by-doc">
          {byDoc.map(([d, e]) => (
            <div key={d} className="row between small">
              <span>{l(items.find((i) => i.id === d)?.short)}</span>
              <span>
                {e.ok}/{e.n}
              </span>
            </div>
          ))}
        </div>
        <div className="row">
          <button className="btn primary" onClick={onAgain}>
            {t('again')}
          </button>
        </div>
      </div>
      {wrong.length > 0 && (
        <>
          <h2>{t('mistakes')}</h2>
          {wrong.map((x) => {
            const opts = optionsOf(x.q, lang);
            return (
              <div key={x.q.id} className="card mistake">
                <p className="q-text">{textOf(x.q, lang)}</p>
                <div className="bad small">
                  {t('yourAnswer')}: {x.picked !== undefined ? opts[x.picked] : '—'}
                </div>
                <div className="good small">
                  {t('rightAnswer')}: {opts[x.q.answer]}
                </div>
                {x.q.explain && <p className="small">{l(x.q.explain)}</p>}
                {(x.q.art || x.q.unit) && (
                  <a className="small" href={srcHref(x.q)}>
                    {t('source')} →
                  </a>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function History({ items }: { items: CatalogItem[] }) {
  const { t, l } = useT();
  const h = useStore((s) => s.history);
  if (!h.length) return null;
  return (
    <>
      <h2>{t('history')}</h2>
      <div className="card">
        {h.slice(0, 10).map((r) => (
          <div key={r.at} className="row between small hist-row">
            <span>{new Date(r.at).toLocaleDateString()}</span>
            <span className="muted">{r.docs.map((d) => l(items.find((i) => i.id === d)?.short)).join(', ')}</span>
            <span className={r.correct / r.total >= 0.7 ? 'good' : 'bad'}>
              {r.correct}/{r.total}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
