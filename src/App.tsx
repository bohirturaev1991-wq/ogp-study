import { useEffect, useState } from 'react';
import { APK_URL, checkUpdate, downloadApk, isAndroidBrowser } from './update';
import { useRoute, href } from './router';
import { useStore, setState } from './store';
import { useT, type Key } from './i18n';
import Home from './pages/Home';
import Library from './pages/Library';
import Reader from './pages/Reader';
import SearchPage from './pages/Search';
import Quiz from './pages/Quiz';
import Cards from './pages/Cards';
import Plan from './pages/Plan';
import Settings from './pages/Settings';
import Onboarding from './pages/Onboarding';
import type { Lang } from './types';

const NAV: { path: string; key: Key; icon: string }[] = [
  { path: '/', key: 'home', icon: '⌂' },
  { path: '/library', key: 'library', icon: '📚' },
  { path: '/search', key: 'search', icon: '🔍' },
  { path: '/quiz', key: 'tests', icon: '✓' },
  { path: '/cards', key: 'cards', icon: '🗂' },
  { path: '/plan', key: 'plan', icon: '📅' },
];

export default function App() {
  const { parts } = useRoute();
  const { t, lang } = useT();
  const role = useStore((s) => s.profile.role);
  const fontSize = useStore((s) => s.profile.fontSize);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.style.setProperty('--reader-size', fontSize + 'px');
  }, [lang, fontSize]);

  if (!role) return <Onboarding />;

  const page = parts[0] || '';
  let body;
  switch (page) {
    case 'library':
      body = <Library />;
      break;
    case 'read':
      body = <Reader id={parts[1]} />;
      break;
    case 'search':
      body = <SearchPage />;
      break;
    case 'quiz':
      body = <Quiz />;
      break;
    case 'cards':
      body = <Cards />;
      break;
    case 'plan':
      body = <Plan />;
      break;
    case 'settings':
      body = <Settings />;
      break;
    default:
      body = <Home />;
  }
  const active = (p: string) => (p === '/' ? page === '' : '/' + page === p || (p === '/library' && page === 'read'));

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">
          <img src="icon.svg" alt="" width={28} height={28} />
          <span>{t('appName')}</span>
        </a>
        <div className="topbar-actions">
          <LangSwitch lang={lang} />
          <a className="icon-btn" href="#/settings" title={t('settings')} aria-label={t('settings')}>
            ⚙
          </a>
        </div>
      </header>
      <nav className="sidenav" aria-label="main">
        {NAV.map((n) => (
          <a key={n.path} href={href(n.path)} className={active(n.path) ? 'active' : ''}>
            <span className="nav-icon" aria-hidden>
              {n.icon}
            </span>
            <span className="nav-label">{t(n.key)}</span>
          </a>
        ))}
      </nav>
      <main className="content">
        <UpdateBanner />
        {body}
      </main>
    </div>
  );
}

/** Плашка «Доступна новая версия» — только в Android-приложении и только при наличии интернета. */
function UpdateBanner() {
  const { t } = useT();
  const [latest, setLatest] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const run = () => checkUpdate().then(setLatest);
    run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, []);
  // сайт, открытый на Android: предлагаем установить приложение (можно скрыть)
  const [webHidden, setWebHidden] = useState(() => {
    try {
      return !!localStorage.getItem('ogp:getapp-hidden');
    } catch {
      return false;
    }
  });
  if (isAndroidBrowser() && !webHidden)
    return (
      <div className="update-banner" role="status">
        <div>
          <strong>{t('getAndroid')}</strong>
          <div className="small">{t('getAndroidHint')}</div>
        </div>
        <div className="row">
          <a className="btn primary" href={APK_URL}>
            ⬇ {t('updateDownload')}
          </a>
          <button
            className="btn ghost"
            onClick={() => {
              try {
                localStorage.setItem('ogp:getapp-hidden', '1');
              } catch {
                /* ignore */
              }
              setWebHidden(true);
            }}
          >
            ✕
          </button>
        </div>
      </div>
    );
  if (!latest || hidden) return null;
  return (
    <div className="update-banner" role="status">
      <div>
        <strong>{t('updateAvailable')}</strong>
        <div className="small">{t('updateHint')}</div>
      </div>
      <div className="row">
        <button className="btn primary" onClick={downloadApk}>
          ⬇ {t('updateDownload')}
        </button>
        <button className="btn ghost" onClick={() => setHidden(true)}>
          {t('updateLater')}
        </button>
      </div>
    </div>
  );
}

function LangSwitch({ lang }: { lang: Lang }) {
  return (
    <div className="seg small" role="group" aria-label="Til / Язык">
      {(['uz', 'ru'] as Lang[]).map((l) => (
        <button key={l} className={lang === l ? 'on' : ''} onClick={() => setState((s) => ({ ...s, profile: { ...s.profile, lang: l } }))}>
          {l === 'uz' ? 'UZ' : 'RU'}
        </button>
      ))}
    </div>
  );
}
