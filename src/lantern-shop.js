// Hazel's Trunk: cosmetic keepsakes bought with golden joys. Rules only; the scene applies the looks.
//
// Joys are never taken back from the story's score (chapter tallies, records and the ending keep
// counting everything earned). Purchases are recorded as `spent`, and the purse shows score - spent.
// Cosmetics outlive "Start the story again": the trunk keeps what was bought, and the new story's
// purse starts from zero.
export const SHOP = [
  {id: 'blanket-cornflower', kind: 'blanket', name: 'Cornflower gingham', blurb: 'Grandma Hazel’s own picnic blanket.', price: 0, look: {texture: 'shop/blanket-cornflower.webp'}},
  {id: 'blanket-strawberry', kind: 'blanket', name: 'Strawberry check', blurb: 'Red and cream, like every picnic in every storybook.', price: 600, look: {texture: 'shop/blanket-strawberry.webp'}},
  {id: 'blanket-meadow', kind: 'blanket', name: 'Meadow plaid', blurb: 'Sage and butter yellow, woven for long summer afternoons.', price: 900, look: {texture: 'shop/blanket-meadow.webp'}},
  {id: 'blanket-honey', kind: 'blanket', name: 'Honeycomb quilt', blurb: 'Patchwork in warm honey and marigold.', price: 1300, look: {texture: 'shop/blanket-honey.webp'}},
  {id: 'lantern-cream', kind: 'lantern', name: 'Cream paper', blurb: 'The clearing’s classic glow.', price: 0, look: {paper: '#ffffff', glow: '#ffb85c'}},
  {id: 'lantern-peach', kind: 'lantern', name: 'Peach blossom', blurb: 'A rosy glow for warm evenings.', price: 400, look: {paper: '#ffad96', glow: '#ff7f5c'}},
  {id: 'lantern-mint', kind: 'lantern', name: 'Mint leaf', blurb: 'Cool green light, fresh as the pond.', price: 700, look: {paper: '#9fe8bc', glow: '#5fdc95'}},
  {id: 'lantern-starlight', kind: 'lantern', name: 'Starlight blue', blurb: 'The colour of the far islands answering.', price: 1100, look: {paper: '#aac0ff', glow: '#7ea4ff'}},
];
// `look` is applied by the scene; lantern colours must match art/blender/render_shop.py (a unit test checks).
export const KINDS = ['blanket', 'lantern'];
const byId = new Map(SHOP.map(item => [item.id, item]));
export const shopItem = id => byId.get(id) || null;
const FREE = SHOP.filter(item => !item.price).map(item => item.id);
const DEFAULTS = {blanket: 'blanket-cornflower', lantern: 'lantern-cream'};

export function newShop() { return {owned: [...FREE], blanket: DEFAULTS.blanket, lantern: DEFAULTS.lantern, spent: 0}; }

/** Joys available to spend. */
export const balance = state => Math.max(0, (state.score || 0) - (state.shop?.spent || 0));
export const owns = (state, id) => !!state.shop?.owned.includes(id);
export const equipped = (state, kind) => state.shop?.[kind] || DEFAULTS[kind];

export function buy(state, id) {
  const item = shopItem(id);
  if (!item) return {ok: false, reasonCode: 'unknown'};
  if (owns(state, id)) return {ok: false, reasonCode: 'owned', item};
  if (balance(state) < item.price) return {ok: false, reasonCode: 'joys', item, missing: item.price - balance(state)};
  state.shop.owned = SHOP.filter(i => i.id === id || state.shop.owned.includes(i.id)).map(i => i.id);
  state.shop.spent += item.price;
  state.shop[item.kind] = id; // a new keepsake goes straight onto the picnic
  return {ok: true, type: 'buy', item};
}

export function equip(state, id) {
  const item = shopItem(id);
  if (!item || !owns(state, id)) return {ok: false, reasonCode: item ? 'locked' : 'unknown'};
  state.shop[item.kind] = id;
  return {ok: true, type: 'equip', item};
}

/** The trunk survives a restarted story; only the purse starts again. */
export function keepForRestart(shop) { return {...loadShop(shop, 0), spent: 0}; }

/** Validate a saved trunk: known items only, free items always owned, equipped items owned,
 *  and never more spent than the story has earned. */
export function loadShop(raw, score = 0) {
  const shop = newShop();
  if (!raw || typeof raw !== 'object') return shop;
  const owned = new Set([...FREE, ...(Array.isArray(raw.owned) ? raw.owned.filter(id => byId.has(id)) : [])]);
  shop.owned = SHOP.filter(item => owned.has(item.id)).map(item => item.id);
  for (const kind of KINDS) if (owned.has(raw[kind]) && shopItem(raw[kind]).kind === kind) shop[kind] = raw[kind];
  const spent = Number.isSafeInteger(raw.spent) && raw.spent > 0 ? raw.spent : 0;
  shop.spent = Math.min(spent, Math.max(0, score));
  return shop;
}
