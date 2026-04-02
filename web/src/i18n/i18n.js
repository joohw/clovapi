import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCNTranslation from './locales/zh-CN.json';

i18n
  .use(initReactI18next)
  .init({
    lng: 'zh-CN',
    load: 'currentOnly',
    supportedLngs: ['zh-CN'],
    resources: {
      'zh-CN': zhCNTranslation,
    },
    fallbackLng: 'zh-CN',
    nsSeparator: false,
    interpolation: {
      escapeValue: false,
    },
  });

window.__i18n = i18n;

export default i18n;
