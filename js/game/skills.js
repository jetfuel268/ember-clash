export const MAX_SKILLS = 4;

// Skill catalog. Each entry is data only: the combat engine interprets the
// effect fields, and progression decides when skills become learnable.
//
// `pool: [minLevel, maxLevel]` — the level range in which this skill can be
// randomly learned on level-up. Skills with no pool are not learnable
// (starter only). `starter: true` skills begin equipped.
//
// Energy is the only gate: costs are set so cadence comes from the Magic
// stat (energy regen per turn).
export const SKILLS = [
  {
    id: 'powerstrike',
    name: 'Power Strike',
    desc: 'A heavy blow dealing 150% damage.',
    cost: 25,
    starter: true,
    type: 'damage',
    mult: 1.5,
  },
  // ---- Pool 1-9 ------------------------------------------------------
  {
    id: 'berserk',
    name: 'Berserk',
    desc: 'Gain +50% damage for 3 turns.',
    cost: 45,
    pool: [1, 9],
    buff: { damage: { bonus: 0.5, turns: 3 } },
  },
  {
    id: 'stone',
    name: 'Stone Skin',
    desc: 'Halve incoming damage for 3 turns.',
    cost: 45,
    pool: [1, 9],
    buff: { defense: { bonus: 0.5, turns: 3 } },
  },
  {
    id: 'mend',
    name: 'Mend',
    desc: 'Heal 30% of your max HP.',
    cost: 50,
    pool: [1, 9],
    healFrac: 0.3,
  },
  {
    id: 'aim',
    name: 'Aim',
    desc: 'Gain +20% hit rate for 3 turns.',
    cost: 25,
    pool: [1, 9],
    buff: { hit: { bonus: 0.2, turns: 3 } },
  },
  {
    id: 'doublestrike',
    name: 'Double Strike',
    desc: 'Strike twice at basic strength. Each hit can miss and crit.',
    cost: 30,
    pool: [1, 9],
    type: 'damage',
    mult: 1,
    hits: 2,
  },
  {
    id: 'focus',
    name: 'Focus',
    desc: 'Your next attack always hits.',
    cost: 15,
    pool: [1, 9],
    guaranteeNext: true,
  },
  {
    id: 'parry',
    name: 'Parry',
    desc: 'Guard, and reflect 25% of incoming damage back at the enemy.',
    cost: 35,
    pool: [1, 9],
    parry: true,
  },
  {
    id: 'meditate',
    name: 'Meditate',
    desc: 'Take double damage this turn, but restore 25% energy.',
    cost: 10,
    pool: [1, 9],
    meditate: true,
  },
  {
    id: 'poisonedblade',
    name: 'Poisoned Blade',
    desc: 'Attack and poison the enemy (damage over time).',
    cost: 20,
    pool: [1, 9],
    type: 'damage',
    mult: 1,
    poison: { amount: 6, turns: 3 },
  },
  // ---- Pool 10-19 ----------------------------------------------------
  {
    id: 'vampirefang',
    name: 'Vampire Fang',
    desc: 'Attack and heal for 50% of the damage dealt.',
    cost: 35,
    pool: [10, 19],
    type: 'damage',
    mult: 1,
    leech: 0.5,
  },
  {
    id: 'reckless',
    name: 'Reckless Strike',
    desc: 'Deal 175% damage, but lose 20% of your max HP.',
    cost: 0,
    pool: [10, 19],
    type: 'damage',
    mult: 1.75,
    hpCostFrac: 0.2,
  },
  {
    id: 'giantswing',
    name: "Giant's Swing",
    desc: 'Charge your weapon. Your next attack deals 175% damage.',
    cost: 40,
    pool: [10, 19],
    chargeMult: 1.75,
  },
  {
    id: 'riposte',
    name: 'Riposte',
    desc: 'Counter the next incoming attack for the damage you take.',
    cost: 35,
    pool: [10, 19],
    riposte: true,
  },
  {
    id: 'bloodlet',
    name: 'Bloodlet',
    desc: 'Purge negative effects. Costs 10% of your max HP.',
    cost: 0,
    pool: [10, 19],
    hpCostFrac: 0.1,
    cleanse: true,
  },
  {
    id: 'greedystab',
    name: 'Greedy Stab',
    desc: 'Deal 25% damage. Doubles the gold if it kills.',
    cost: 25,
    pool: [10, 19],
    type: 'damage',
    mult: 0.25,
    killBonus: 'gold',
  },
  {
    id: 'surgicalslice',
    name: 'Surgical Slice',
    desc: 'Deal 25% damage. Doubles the XP if it kills.',
    cost: 25,
    pool: [10, 19],
    type: 'damage',
    mult: 0.25,
    killBonus: 'xp',
  },
  {
    id: 'beasthunter',
    name: 'Beasthunter',
    desc: 'Deal 150% damage, 200% against beasts.',
    cost: 30,
    pool: [10, 19],
    type: 'damage',
    mult: 1.5,
    vsType: 'beast',
    vsMult: 2,
  },
  {
    id: 'undeadbane',
    name: 'Undead Bane',
    desc: 'Deal 150% damage, 200% against undead.',
    cost: 30,
    pool: [10, 19],
    type: 'damage',
    mult: 1.5,
    vsType: 'undead',
    vsMult: 2,
  },
  // ---- Pool 20+ ------------------------------------------------------
  {
    id: 'trueedge',
    name: 'True Edge',
    desc: 'Deal 125% damage, ignoring armor.',
    cost: 30,
    pool: [20, 999],
    type: 'damage',
    mult: 1.25,
    ignoreArmor: true,
  },
  {
    id: 'opportune',
    name: 'Opportune Moment',
    desc: 'Attack. If it hits, you act again.',
    cost: 60,
    pool: [20, 999],
    type: 'damage',
    mult: 1,
    extraActionOnHit: true,
  },
];

export const SKILL_MAP = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

// Enemy skills (names/desc only — effects live in combat.js; costs come from
// TUNING.enemyMagic.skillCost). Used by the bestiary and intent labels.
export const ENEMY_SKILLS = {
  enrage: { id: 'enrage', name: 'Enrage', desc: 'Gain +40% damage for 3 turns.' },
  shell: { id: 'shell', name: 'Shell', desc: 'Halve incoming damage for 3 turns.' },
  venom: { id: 'venom', name: 'Venom', desc: 'Poison the hero (5 damage/turn for 3 turns).' },
};

// Skills learnable at a given player level (randomized pool per level range).
export function poolFor(level) {
  return SKILLS.filter((s) => s.pool && level >= s.pool[0] && level <= s.pool[1]);
}

// A random learnable skill the player does not already own, or null.
export function pickSkillToLearn(level, ownedIds, rng) {
  const candidates = poolFor(level).filter((s) => !ownedIds.includes(s.id));
  if (candidates.length === 0) return null;
  const roll = rng ? rng() : Math.random();
  return candidates[Math.min(candidates.length - 1, Math.floor(roll * candidates.length))];
}
