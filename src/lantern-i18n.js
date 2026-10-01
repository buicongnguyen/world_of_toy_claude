import {VI} from './lantern-vi.js';

let language = 'en';
export const normalizeLanguage = value => value === 'vi' ? 'vi' : 'en';
export const getLanguage = () => language;
export function setLanguage(value) { language = normalizeLanguage(value); return language; }
export function t(source, values = {}) {
  const text = language === 'vi' && Object.hasOwn(VI, source) ? VI[source] : source;
  return text.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
export const number = value => new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US').format(value);

// Bind only the original static markup. Dynamic renderers translate at their source;
// disconnected nodes are ignored, so controls, listeners and live regions are preserved.
export function bindStaticText(root = document) {
  const text = [], attrs = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    if (node.parentElement?.closest('script, style, [data-language]')) continue;
    if (node.data.trim()) text.push([node, node.data]);
  }
  for (const el of root.querySelectorAll('[aria-label], [title], meta[name="description"]')) {
    for (const attr of ['aria-label', 'title', ...(el.matches('meta') ? ['content'] : [])]) {
      if (el.hasAttribute(attr)) attrs.push([el, attr, el.getAttribute(attr)]);
    }
  }
  return () => {
    document.documentElement.lang = language;
    for (const [node, source] of text) if (node.isConnected) node.data = source.replace(/\S[\s\S]*\S|\S/, match => t(match));
    for (const [el, attr, source] of attrs) if (el.isConnected) el.setAttribute(attr, t(source));
  };
}
