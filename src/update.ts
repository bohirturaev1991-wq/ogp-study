// Проверка обновлений Android-приложения.
// Номер сборки (__BUILD__) подставляется при сборке на GitHub Actions (GITHUB_RUN_NUMBER).
// Номер последней сборки записан в описании релиза «apk-latest» строкой «build=N».
// GitHub API отдаёт его без авторизации и с CORS — аккаунт GitHub ученикам не нужен.
declare const __BUILD__: string;

const REPO = 'bohirturaev1991-wq/ogp-study';
export const APK_URL = `https://github.com/${REPO}/releases/download/apk-latest/ogp-study.apk`;
export const BUILD = Number(__BUILD__) || 0;
const KEY = 'ogp:update';
const EVERY = 6 * 3600 * 1000; // не чаще раза в 6 часов

export const isNative = () => !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
export const isAndroidBrowser = () => !isNative() && /Android/i.test(navigator.userAgent);

interface Cache {
  t: number;
  latest: number;
}
const readCache = (): Cache | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
};

/** Номер новой сборки, если она есть; иначе null. Без интернета и вне приложения ничего не делает. */
export async function checkUpdate(force = false): Promise<number | null> {
  if (!isNative() || !BUILD) return null;
  const c = readCache();
  if (!force && c && Date.now() - c.t < EVERY) return c.latest > BUILD ? c.latest : null;
  if (!navigator.onLine) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/apk-latest`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    const latest = Number(String(j.body || '').match(/build=(\d+)/)?.[1] || 0);
    try {
      localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), latest }));
    } catch {
      /* нет места — не страшно */
    }
    return latest > BUILD ? latest : null;
  } catch {
    return null;
  }
}

/** Открыть ссылку на APK: в приложении Android откроет её в браузере и скачает файл. */
export function downloadApk() {
  window.location.href = APK_URL;
}
