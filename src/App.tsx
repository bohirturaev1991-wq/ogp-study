import { useEffect } from 'react';
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
      <main className="content">{body}</main>
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
