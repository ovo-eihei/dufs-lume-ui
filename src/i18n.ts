import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './locales/zh.json';
import en from './locales/en.json';
import { LanguagePreference } from './types/dufs';

export const LANG_STORAGE_KEY = 'dufs_lume_lang';

/**
 * 检测浏览器/系统首选语言（navigator.languages / navigator.language）
 */
export function detectSystemLanguage(): 'zh' | 'en' {
  if (typeof navigator === 'undefined') return 'zh';
  const primary = (navigator.languages?.[0] || navigator.language || 'zh').toLowerCase();
  return primary.startsWith('zh') ? 'zh' : 'en';
}

/**
 * 读取用户持久化的语言偏好设置；未配置时默认返回 'system'（自动跟随系统）
 */
export function getSavedLanguagePreference(): LanguagePreference {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'zh' || saved === 'en' || saved === 'system') {
      return saved;
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  return 'system';
}

export function resolveEffectiveLanguage(pref: LanguagePreference): 'zh' | 'en' {
  if (pref === 'system') {
    return detectSystemLanguage();
  }
  return pref;
}

const initialPref = getSavedLanguagePreference();

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: resolveEffectiveLanguage(initialPref),
  fallbackLng: 'zh',
  interpolation: {
    escapeValue: false,
  },
});

export function setAppLanguagePreference(pref: LanguagePreference): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, pref);
  } catch {
    // Ignore localStorage write errors
  }
  const effective = resolveEffectiveLanguage(pref);
  i18n.changeLanguage(effective);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = effective === 'zh' ? 'zh-CN' : 'en';
  }
}

// 监听系统语言变化事件（当处于 'system' 模式时自动同步切换）
if (typeof window !== 'undefined') {
  window.addEventListener('languagechange', () => {
    if (getSavedLanguagePreference() === 'system') {
      const effective = detectSystemLanguage();
      i18n.changeLanguage(effective);
      document.documentElement.lang = effective === 'zh' ? 'zh-CN' : 'en';
    }
  });
}

export default i18n;
