import {fruitIcon} from './fruit-icons.js';
export function picnicIcon(level,size=42){
 const face='<g fill="#5d496f"><circle cx="26" cy="40" r="1.8"/><circle cx="38" cy="40" r="1.8"/></g><path d="M29 44q3 3 6 0" stroke="#82638a" stroke-width="1.4" fill="none" stroke-linecap="round"/>';
 const star='<path d="m32 19 2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5Z" fill="#fff4ad"/>';
 const art=[
  `<circle cx="32" cy="33" r="20" fill="#baf3f2" fill-opacity=".55" stroke="#7ecee0" stroke-width="2"/><path d="M18 26q2-7 10-9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>${star}${face}`,
  `<circle cx="32" cy="33" r="26" fill="#d7bdff" fill-opacity=".62" stroke="#b398e7" stroke-width="2"/><path d="M13 25q4-9 13-11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>${star}${face}<path d="m46 21 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="#fff8cd"/>`,
  `<path d="m19 22 3 35h22l3-35Z" fill="#ffdb60"/><ellipse cx="33" cy="22" rx="14" ry="4" fill="#fff1af"/><path d="m35 26 3-20 9-3" stroke="#e279b4" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="18" cy="23" r="9" fill="#ffd24d" stroke="#fff4b2" stroke-width="2"/>${face}`,
  `<path d="m7 19 50 0-22 38-28-5Z" fill="#d99b57"/><path d="m8 37 27 9 21-20v9L35 54 8 47" fill="#67cd91"/><path d="m8 31 27 11 21-19v8L35 49 8 40" fill="#f5838e"/><path d="M7 19 33 8l24 11-22 24Z" fill="#fff0c1"/><g transform="translate(0 -11)">${face}</g>`,
  `<path d="M47 26q12-5 11-15l4 8q-1 15-15 17" fill="#bf86df"/><ellipse cx="13" cy="31" rx="10" ry="12" fill="none" stroke="#b77fe0" stroke-width="5"/><ellipse cx="33" cy="37" rx="21" ry="18" fill="#d8a8f5"/><ellipse cx="33" cy="20" rx="14" ry="4" fill="#ecd1ff"/><circle cx="33" cy="15" r="4" fill="#ffd776"/>${face}`,
  `<path d="M17 25V18a15 15 0 0 1 30 0v7" fill="none" stroke="#d6a162" stroke-width="5"/><rect x="7" y="25" width="50" height="32" rx="7" fill="#e7b675"/><path d="M10 31h44M10 39h44M10 48h44M19 26v29m13-29v29m13-29v29" stroke="#c78f50" stroke-width="2"/><path d="M9 23h46v10H9Z" fill="#f2a9ca"/><path d="M17 24v8m11-8v8m11-8v8m11-8v8" stroke="#ffe4ec" stroke-width="4"/>${face}`,
 ][level]||'';
 return `<svg class="fruit-icon picnic-icon" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${art}</svg>`;
}
export const itemIcon=(item,size=42)=>item.kind==='picnic'?picnicIcon(item.level,size):fruitIcon(item.level,size);
