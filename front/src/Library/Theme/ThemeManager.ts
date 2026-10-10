import {useEffect, useState} from 'react';

export type ThemeType = 'dark' | 'light';

const STORAGE_KEY = 'theme';
const listeners = new Set<(theme: ThemeType) => void>();

/** stored choice, otherwise theme of operating system */
const initialTheme = (): ThemeType => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch (e) {
    // storage is not available
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

let current: ThemeType = initialTheme();

/** dark / light theme of application - colors are CSS variables in theme.css */
const ThemeManager = {
  get: (): ThemeType => current,

  apply: (): void => {
    document.documentElement.dataset.theme = current;
  },

  set: (theme: ThemeType): void => {
    current = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // choice is only for this page load
    }
    ThemeManager.apply();
    listeners.forEach((listener) => listener(theme));
  },

  toggle: (): void => ThemeManager.set(current === 'dark' ? 'light' : 'dark'),

  subscribe: (listener: (theme: ThemeType) => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** current theme, component is rendered again when it changes */
export const useTheme = (): ThemeType => {
  const [theme, setTheme] = useState<ThemeType>(current);
  useEffect(() => ThemeManager.subscribe(setTheme), []);
  return theme;
};

export default ThemeManager;
