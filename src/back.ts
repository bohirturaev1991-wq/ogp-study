// Системная кнопка «Назад» (Android-приложение) и общий стек «закрываемых» окон.
// Порядок: закрыть открытое окно (оглавление, диалог) → предыдущий экран → с главной — выход.
import { useEffect, useRef } from 'react';

const stack: (() => void)[] = [];

/** Пока компонент открыт, «Назад» сначала закрывает его. */
export function useBackClose(open: boolean, close: () => void) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!open) return;
    const fn = () => ref.current();
    stack.push(fn);
    return () => {
      const i = stack.lastIndexOf(fn);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open]);
}

const atHome = () => !location.hash || location.hash === '#' || location.hash === '#/';

export async function initBackButton() {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return;
  const { App } = await import('@capacitor/app');
  App.addListener('backButton', ({ canGoBack }) => {
    const close = stack.pop();
    if (close) return close();
    if (atHome()) return App.exitApp();
    if (canGoBack) history.back();
    else location.hash = '#/';
  });
}
