import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Msg as Descriptor } from '../../supabase/functions/_shared/insights'
import { en, type Key, type Msg, type Params } from './en'
import { zh } from './zh'

export type Lang = 'en' | 'zh'

const STORAGE_KEY = 'vpt-lang'
const dictionaries: Record<Lang, Record<Key, Msg>> = { en, zh }

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'zh') return saved
  } catch {
    // Storage can be blocked (private mode). Fall through to the browser language.
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function translate(lang: Lang, key: Key, params: Params = {}): string {
  const msg = dictionaries[lang][key]
  if (typeof msg === 'function') return msg(params)
  return msg.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''))
}

interface I18n {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: Key, params?: Params) => string
  // Translates an id + params produced by the shared insights module.
  td: (message: Descriptor) => string
}

const defaultValue: I18n = {
  lang: 'en',
  setLang: () => {},
  t: (key, params) => translate('en', key, params),
  td: (message) => translate('en', message.id as Key, message.params),
}

const Context = createContext<I18n>(defaultValue)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not persisting is acceptable.
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en'
    document.title = translate(lang, 'meta.title')
  }, [lang])

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, params) => translate(lang, key, params),
      td: (message) => translate(lang, message.id as Key, message.params),
    }),
    [lang, setLang],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export const useI18n = () => useContext(Context)
export type { Key }
