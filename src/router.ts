import { useSyncExternalStore } from 'react';

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, qs] = h.split('?');
  return { parts: p.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(qs || '') };
}

let current = parseHash();
let currentHash = location.hash;
const subs = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parseHash();
  currentHash = location.hash;
  subs.forEach((s) => s());
});

export function useRoute() {
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => currentHash,
  );
  return current;
}

export const go = (to: string) => {
  location.hash = to.startsWith('#') ? to : '#' + to;
};

export const href = (path: string, params?: Record<string, string | undefined>) => {
  const qs = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
        .join('&')
    : '';
  return '#' + path + (qs ? '?' + qs : '');
};
