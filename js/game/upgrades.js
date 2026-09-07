// Data-driven upgrade catalog. Adding an upgrade = adding an entry here.
// `effect` is a map of stat keys -> amount, applied per stack by player.js.
// Valid stat keys (handled in player.js):
//   attack, maxHp, maxEnergy, critChance (fraction), critDamage (additive),
//   attackEnergy (extra energy on basic attack), goldBonus (fraction),
//   potionHealBonus (fraction added to potion heal), startPotions
import { TUNING } from '../config/tuning.js';

export const UPGRADES = [
  { id: 'sharp', name: 'Sharp Edge', emoji: '🗡️', desc: '+2 Attack per stack', max: 5, effect: { attack: 2 } },
  { id: 'iron', name: 'Iron Hide', emoji: '🛡️', desc: '+20 Max HP, +1 Defense per stack', max: 5, effect: { maxHp: 20, defense: 1 } },
  { id: 'lung', name: 'Deep Lungs', emoji: '🌀', desc: '+15 Max Energy per stack', max: 3, effect: { maxEnergy: 15 } },
  { id: 'frenzy', name: 'Frenzy', emoji: '⚡', desc: '+3 Energy on basic attack per stack', max: 3, effect: { attackEnergy: 3 } },
  { id: 'crit', name: 'Critical Focus', emoji: '🎯', desc: '+8% Crit Chance per stack', max: 3, effect: { critChance: 0.08 } },
  { id: 'crip', name: 'Crippling Blow', emoji: '💥', desc: '+25% Crit Damage per stack', max: 3, effect: { critDamage: 0.25 } },
  { id: 'satchel', name: 'Satchel', emoji: '🎒', desc: '+1 starting Potion per stack', max: 2, effect: { startPotions: 1 } },
  { id: 'alchem', name: 'Alchemist', emoji: '⚗️', desc: 'Potions heal +10% more per stack', max: 2, effect: { potionHealBonus: 0.1 } },
  { id: 'bounty', name: 'Bounty Hunter', emoji: '💰', desc: '+20% Gold earned per stack', max: 3, effect: { goldBonus: 0.2 } },
];

export const UPGRADE_MAP = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// How many stacks of `id` the player currently has.
export function stackCount(upgradeIds, id) {
  return upgradeIds.filter((x) => x === id).length;
}

// Random `n` distinct candidate upgrades the player can still take.
export function rollUpgradeChoices(upgradeIds, n) {
  const available = UPGRADES.filter((u) => stackCount(upgradeIds, u.id) < u.max);
  const out = [];
  const pool = [...available];
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// XP needed to go from `level` to `level + 1`.
export function xpForNext(level) {
  return TUNING.xp.base + (level - 1) * TUNING.xp.perLevel;
}
