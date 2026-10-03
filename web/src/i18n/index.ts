import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import hi from './hi.json'

void i18n.use(initReactI18next).init({
  resources: { hi: { translation: hi }, en: { translation: en } },
  lng: 'hi',
  fallbackLng: 'hi',
  interpolation: { escapeValue: false },
})

export default i18n

// keep <html lang> in step so the browser picks Devanagari line-breaking / spacing (and :lang(hi) styles)
const setHtmlLang = (l: string) => { document.documentElement.lang = l }
setHtmlLang(i18n.language || 'hi')
i18n.on('languageChanged', setHtmlLang)
