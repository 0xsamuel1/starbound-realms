import { useState, useEffect } from 'react';

const THEME_KEY = 'starbound-theme';

function getStoredTheme(): 'dark' | 'light' {
  if (typeof localStorage === 'undefined') return 'dark';
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

/**
 * #124 — Dark/light mode toggle.
 * Switches data-theme attribute and persists choice in localStorage.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(getStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        padding: '0.5rem 1rem',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        color: 'var(--text)',
        fontSize: 'var(--font-sm)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
    </button>
  );
}
