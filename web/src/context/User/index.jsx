import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { reducer, initialState } from './reducer';

export const UserContext = React.createContext({
  state: initialState,
  dispatch: () => null,
});

export const UserProvider = ({ children }) => {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const { i18n } = useTranslation();

  // Force fixed Chinese locale and ignore per-user language preference.
  useEffect(() => {
    const fixedLanguage = 'zh-CN';
    if (i18n.language !== fixedLanguage) {
      i18n.changeLanguage(fixedLanguage);
    }
    localStorage.setItem('i18nextLng', fixedLanguage);
  }, [i18n]);

  return (
    <UserContext.Provider value={[state, dispatch]}>
      {children}
    </UserContext.Provider>
  );
};
