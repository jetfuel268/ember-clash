// Data-driven upgrade catalog. Upgrades are permanent stat boosts bought in
// the shop (stages ending in 5). Adding an upgrade = adding an entry here.
// Effects are applied per stack by player.js.
import { TUNING } from '../config/tuning.js';

export const UPGRADES = [
  { id: 'sharp', name: 'Sharp Edge', desc: '+2 Attack per stack', maxStacks: 5, price: 40, effect: { attack: 2 } },
  { id: 'iron', name: 'Iron Hide', desc: '+20 Max HP per stack', maxStacks: 5, price: 45, effect: { maxHp: 20 } },
  { id: 'mana', name: 'Mana Core', desc: '+3 Magic per stack', maxStacks: 5, price: 50, effect: { magic: 3 } },
  { id: 'lung', name: 'Deep Lungs', desc: '+15 Max Energy per stack', maxStacks: 3, price: 60, effect: { maxEnergy: 15 } },
  { id: 'crit', name: 'Critical Focus', desc: '+8% Crit Chance per stack', maxStacks: 3, price: 75, effect: { critChance: 0.08 } },
  { id: 'crip', name: 'Crippling Blow', desc: '+25% Crit Damage per stack', maxStacks: 3, price: 75, effect: { critDamage: 0.25 } },
  { id: 'alchem', name: 'Alchemist', desc: 'Items heal +10% more per stack', maxStacks: 2, price: 55, effect: { potionHealBonus: 0.1 } },
  { id: 'bounty', name: 'Bounty Hunter', desc: '+20% Gold earned per stack', maxStacks: 3, price: 55, effect: { goldBonus: 0.2 } },
];

export const UPGRADE_MAP = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// How many stacks of `id` the player currently has.
export function stackCount(upgradeIds, id) {
  return upgradeIds.filter((x) => x === id).length;
}

// XP needed to go from `level` to `level + 1`.
export function xpForNext(level) {
  return TUNING.xp.base + (level - 1) * TUNING.xp.perLevel;
}
