import {
  createContext,
  useContext,
  useEffect,
} from 'react';

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const ActualThemeContext = createContext(null);
export const useActualTheme = () => useContext(ActualThemeContext);

const SetThemeContext = createContext(null);
export const useSetTheme = () => useContext(SetThemeContext);

export const ThemeProvider = ({ children }) => {
  const theme = 'dark';
  const actualTheme = 'dark';

  // 应用主题到DOM
  useEffect(() => {
    try {
      localStorage.setItem('theme-mode', 'dark');
    } catch {
      // ignore localStorage write failures
    }
    document.body.setAttribute('theme-mode', 'dark');
    document.documentElement.classList.add('dark');
  }, [actualTheme]);

  const setTheme = () => {};

  return (
    <SetThemeContext.Provider value={setTheme}>
      <ActualThemeContext.Provider value={actualTheme}>
        <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
      </ActualThemeContext.Provider>
    </SetThemeContext.Provider>
  );
};
