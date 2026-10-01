// The Lantern Trail's languages: English source strings, Vietnamese from trail-vi.js (fetched only
// when Vietnamese is chosen). The choice is shared with The Lantern Picnic's settings.
let language = 'en', VI = {};
export const getLang = () => language;
/** Switch language, loading the Vietnamese table the first time it is needed. */
export async function setLang(value) {
  language = value === 'vi' ? 'vi' : 'en';
  if (language === 'vi' && !Object.keys(VI).length) {
    try { ({VI} = await import('./trail-vi.js')); } catch { language = 'en'; }
  }
  document.documentElement.lang = language;
  return language;
}
export function t(source, values = {}) {
  const text = language === 'vi' && Object.hasOwn(VI, source) ? VI[source] : source;
  return text.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
/** Translate every element marked with data-t (text) or data-t-label (aria-label and title). */
export function translatePage(root = document) {
  for (const el of root.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of root.querySelectorAll('[data-t-label]')) { const s = t(el.dataset.tLabel); el.setAttribute('aria-label', s); el.title = s; }
}
