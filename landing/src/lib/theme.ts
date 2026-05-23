export const THEME_STORAGE_KEY = "clovapi-theme";

export type ThemeMode = "light" | "dark";

function getSystemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveThemeMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return getSystemPrefersDark() ? "dark" : "light";
}

export function applyThemeMode(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function initThemeMode(): ThemeMode {
  const mode = resolveThemeMode();
  applyThemeMode(mode);
  return mode;
}

export function persistThemeMode(theme: ThemeMode) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}
