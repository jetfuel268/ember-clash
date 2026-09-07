// Data-driven equipment catalog. Four slots, five tiers each (tier 0 =
// nothing equipped). Effects are cumulative: owning tier 3 means you have
// the effects of tiers 1+2+3. Buying the next tier happens in the shop.
//
// Slot mapping (replaces the old text upgrades):
//   Helmet     <- Alchemist (items heal more), normalized to 5 tiers
//   Chestplate <- Iron Hide (max HP), normalized to 5 tiers
//   Leggings   <- Mana Core (magic = max energy), normalized to 5 tiers
//   Sword      <- Sharp Edge (attack) + Critical Focus (crit chance) +
//                 Crippling Blow (crit damage), all normalized to 5 tiers
//                 with prices increasing to match
// Deep Lungs was removed: max energy is the magic stat (Leggings) itself.
// Bounty Hunter was dropped (no slot for it).

export const EQUIPMENT_SLOTS = ['helmet', 'chest', 'legs', 'sword'];

const TIER_PREFIX = ['', 'Iron', 'Steel', 'Mithril', 'Runed', 'Dragon'];

export const EQUIPMENT = {
  helmet: {
    label: 'Helmet',
    pieces: [
      null,
      { stats: { potionHeal: 0.04 }, price: 30 },
      { stats: { potionHeal: 0.05 }, price: 50 },
      { stats: { potionHeal: 0.06 }, price: 80 },
      { stats: { potionHeal: 0.07 }, price: 120 },
      { stats: { potionHeal: 0.08 }, price: 160 },
    ],
  },
  chest: {
    label: 'Chestplate',
    pieces: [
      null,
      { stats: { maxHp: 20 }, price: 40 },
      { stats: { maxHp: 25 }, price: 65 },
      { stats: { maxHp: 30 }, price: 100 },
      { stats: { maxHp: 40 }, price: 150 },
      { stats: { maxHp: 45 }, price: 200 },
    ],
  },
  legs: {
    label: 'Leggings',
    pieces: [
      null,
      { stats: { magic: 3 }, price: 45 },
      { stats: { magic: 4 }, price: 70 },
      { stats: { magic: 5 }, price: 110 },
      { stats: { magic: 6 }, price: 160 },
      { stats: { magic: 8 }, price: 220 },
    ],
  },
  sword: {
    label: 'Sword',
    pieces: [
      null,
      { stats: { attack: 2, critChance: 0.04, critDamage: 0.1 }, price: 50 },
      { stats: { attack: 3, critChance: 0.05, critDamage: 0.12 }, price: 80 },
      { stats: { attack: 3, critChance: 0.06, critDamage: 0.15 }, price: 125 },
      { stats: { attack: 4, critChance: 0.07, critDamage: 0.2 }, price: 180 },
      { stats: { attack: 5, critChance: 0.09, critDamage: 0.25 }, price: 250 },
    ],
  },
};

// "Iron Helmet", "Runed Sword", ... (tier 1..5).
export function pieceName(slot, tier) {
  if (!tier) return `${EQUIPMENT[slot].label} (none)`;
  return `${TIER_PREFIX[tier]} ${EQUIPMENT[slot].label}`;
}

// The next purchasable tier, or null when the slot is at tier 5.
export function nextTier(equipment, slot) {
  const t = equipment[slot] ?? 0;
  return t >= 5 ? null : t + 1;
}

// Short, readable stat line for shop cards ("+3 Max HP").
export function statLine(stats) {
  const names = {
    maxHp: 'Max HP',
    magic: 'Magic',
    attack: 'Attack',
    critChance: 'Crit',
    critDamage: 'Crit Dmg',
    potionHeal: 'Item Heal',
  };
  const parts = [];
  for (const [k, v] of Object.entries(stats)) {
    if (typeof v !== 'number') continue;
    if (k === 'critChance' || k === 'critDamage' || k === 'potionHeal') {
      parts.push(`+${Math.round(v * 100)}% ${names[k]}`);
    } else {
      parts.push(`+${v} ${names[k]}`);
    }
  }
  return parts.join(' · ');
}
