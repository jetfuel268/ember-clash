// Presentation-only: the 5-tier color schemes for each equipment slot and
// the item icon SVGs shown in the shop. The same colors drive the hero
// model (see the inline hero SVG in index.html + HUD.applyHeroSkin).
//
// Tier 0 = the base silver look (nothing equipped).
//
// Color progression: Iron (gray) -> Steel (blue) -> Mithril (bronze) ->
// Runed (violet) -> Dragon (gold). Each slot keeps its own hue identity.
export const TIER_COLORS = {
  helmet: [
    { main: '#c3cadb', dark: '#8792ac' }, // 0 base
    { main: '#a9b2c6', dark: '#6d7890' }, // 1 Iron
    { main: '#7d9cc9', dark: '#4c6a99' }, // 2 Steel
    { main: '#cfa25c', dark: '#96702f' }, // 3 Mithril
    { main: '#a678cf', dark: '#6f4796' }, // 4 Runed
    { main: '#eec44e', dark: '#b08a1e' }, // 5 Dragon
  ],
  chest: [
    { main: '#d5dbea', dark: '#9aa4bd' }, // 0 base
    { main: '#9fa9bd', dark: '#66718c' }, // 1 Iron
    { main: '#6f93c4', dark: '#42638f' }, // 2 Steel
    { main: '#d4a45a', dark: '#9c7530' }, // 3 Mithril
    { main: '#9d74cc', dark: '#68469b' }, // 4 Runed
    { main: '#f2ca52', dark: '#bb9522' }, // 5 Dragon
  ],
  legs: [
    { main: '#a7b0c4', dark: '#76819c' }, // 0 base
    { main: '#96a0b4', dark: '#5f6a84' }, // 1 Iron
    { main: '#6d94b4', dark: '#41668a' }, // 2 Steel
    { main: '#c99a4a', dark: '#926c26' }, // 3 Mithril
    { main: '#9163c2', dark: '#5d3a94' }, // 4 Runed
    { main: '#e8bc4a', dark: '#a8891c' }, // 5 Dragon
  ],
  sword: [
    { main: '#f2c94c', dark: '#a8801a' }, // 0 base
    { main: '#c8cdd8', dark: '#8b93a8' }, // 1 Iron
    { main: '#7fa8e0', dark: '#4d74ac' }, // 2 Steel
    { main: '#e0b060', dark: '#a87e2e' }, // 3 Mithril
    { main: '#b585e0', dark: '#7d52a8' }, // 4 Runed
    { main: '#ffd258', dark: '#c29a22' }, // 5 Dragon
  ],
};

// Small clean vector icon of an equipment piece, tinted to its tier.
// Injected inline into the shop (no fetch, no image file needed).
export function equipIconSvg(slot, tier) {
  const t = Math.max(1, Math.min(5, tier));
  const pal = TIER_COLORS[slot][t];
  const main = pal.main;
  const dark = pal.dark;
  const stroke = 'stroke="#23263a" stroke-width="18"';
  let shape = '';
  if (slot === 'helmet') {
    shape = `
    <g ${stroke}>
      <path d="M 250 430 C 250 300 285 240 400 240 C 515 240 550 300 550 430 C 550 520 505 560 400 560 C 295 560 250 520 250 430 Z" fill="${main}"/>
      <rect x="300" y="418" width="200" height="56" rx="28" fill="#1a1c2a" stroke="none"/>
      <rect x="382" y="180" width="36" height="90" rx="18" fill="${dark}"/>
    </g>`;
  } else if (slot === 'chest') {
    shape = `
    <g ${stroke}>
      <path d="M 270 260 C 268 220 320 200 400 200 C 480 200 532 220 530 260 L 545 520 C 545 575 490 595 400 595 C 310 595 255 575 255 520 Z" fill="${main}"/>
      <rect x="285" y="470" width="230" height="56" rx="20" fill="${dark}"/>
      <circle cx="285" cy="270" r="52" fill="${dark}"/>
      <circle cx="515" cy="270" r="52" fill="${dark}"/>
    </g>`;
  } else if (slot === 'legs') {
    shape = `
    <g ${stroke}>
      <rect x="250" y="200" width="120" height="330" rx="50" fill="${main}"/>
      <rect x="430" y="200" width="120" height="330" rx="50" fill="${main}"/>
      <rect x="230" y="500" width="160" height="95" rx="32" fill="${dark}"/>
      <rect x="410" y="500" width="160" height="95" rx="32" fill="${dark}"/>
    </g>`;
  } else {
    shape = `
    <g ${stroke}>
      <path d="M 375 120 L 425 120 C 435 250 438 380 428 470 L 372 470 C 362 380 365 250 375 120 Z" fill="${main}"/>
      <rect x="290" y="470" width="220" height="48" rx="16" fill="${dark}"/>
      <rect x="366" y="518" width="68" height="130" rx="22" fill="${dark}"/>
      <circle cx="400" cy="678" r="34" fill="${main}"/>
    </g>`;
  }
  return `<svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${shape}</svg>`;
}
