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
    id: 'minormend',
    name: 'Minor Mend',
    desc: 'Heal 15% of your max HP.',
    cost: 25,
    pool: [1, 9],
    healFrac: 0.15,
  },
  {
    id: 'mend',
    name: 'Mend',
    desc: 'Heal 30% of your max HP.',
    cost: 50,
    pool: [11, 13],
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
  {
    id: 'emberjab',
    name: 'Ember Jab',
    desc: 'A fire attack dealing 150% damage.',
    cost: 25,
    pool: [1, 9],
    type: 'damage',
    mult: 1.5,
    element: 'fire',
  },
  {
    id: 'frostbrand',
    name: 'Frost Brand',
    desc: 'An ice attack dealing 150% damage.',
    cost: 25,
    pool: [1, 9],
    type: 'damage',
    mult: 1.5,
    element: 'ice',
  },
  {
    id: 'arcbolt',
    name: 'Arc Bolt',
    desc: 'A lightning attack dealing 150% damage.',
    cost: 25,
    pool: [1, 9],
    type: 'damage',
    mult: 1.5,
    element: 'lightning',
  },
  {
    id: 'swiftedge',
    name: 'Swift Edge',
    desc: 'Deal 125% damage. If it hits, gain +20% damage for 2 turns.',
    cost: 25,
    pool: [1, 9],
    type: 'damage',
    mult: 1.25,
    buffOnHit: { damage: { bonus: 0.2, turns: 2 } },
  },
  // Weak element basics: 100% (neutral), 15 energy — cheap, safe against
  // unknown targets, still 1.5x on a weakness / 0.5x resisted.
  {
    id: 'embersnap',
    name: 'Ember Snap',
    desc: 'A quick fire attack dealing 100% damage.',
    cost: 15,
    pool: [1, 9],
    type: 'damage',
    mult: 1,
    element: 'fire',
  },
  {
    id: 'frostenip',
    name: 'Frost Nip',
    desc: 'A quick ice attack dealing 100% damage.',
    cost: 15,
    pool: [1, 9],
    type: 'damage',
    mult: 1,
    element: 'ice',
  },
  {
    id: 'staticzap',
    name: 'Static Zap',
    desc: 'A quick lightning attack dealing 100% damage.',
    cost: 15,
    pool: [1, 9],
    type: 'damage',
    mult: 1,
    element: 'lightning',
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
  {
    id: 'pyroclasm',
    name: 'Pyroclasm',
    desc: 'A devastating fire attack dealing 225% damage.',
    cost: 50,
    pool: [11, 13],
    type: 'damage',
    mult: 2.25,
    element: 'fire',
  },
  {
    id: 'permafrost',
    name: 'Permafrost',
    desc: 'A crushing ice attack dealing 225% damage.',
    cost: 50,
    pool: [11, 13],
    type: 'damage',
    mult: 2.25,
    element: 'ice',
  },
  {
    id: 'stormcall',
    name: 'Stormcall',
    desc: 'A blinding lightning attack dealing 225% damage.',
    cost: 50,
    pool: [11, 13],
    type: 'damage',
    mult: 2.25,
    element: 'lightning',
  },
  // ---- Late game ------------------------------------------------------
  // (True Edge / Volley / Adrenaline / Second Wind are 20+; Opportune
  // Moment belongs to the 11-13 window.)
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
    pool: [11, 13],
    type: 'damage',
    mult: 1,
    extraActionOnHit: true,
  },
  {
    id: 'volley',
    name: 'Volley',
    desc: 'Strike three times at 70% strength. Each hit can miss and crit.',
    cost: 40,
    pool: [20, 999],
    type: 'damage',
    mult: 0.7,
    hits: 3,
  },
  {
    id: 'adrenaline',
    name: 'Adrenaline',
    desc: 'Gain +35% damage and +35% hit rate for 2 turns.',
    cost: 45,
    pool: [20, 999],
    buff: {
      damage: { bonus: 0.35, turns: 2 },
      hit: { bonus: 0.35, turns: 2 },
    },
  },
  {
    id: 'secondwind',
    name: 'Second Wind',
    desc: 'Heal 20% of your max HP and purge all negative effects.',
    cost: 35,
    pool: [20, 999],
    healFrac: 0.2,
    cleanse: true,
  },
];

export const SKILL_MAP = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

// Enemy skills (names/desc only — effects live in combat.js; costs come from
// TUNING.enemyMagic.skillCost). Used by the bestiary and intent labels.
export const ENEMY_SKILLS = {
  enrage: { id: 'enrage', name: 'Enrage', desc: 'Gain +40% damage for 3 turns.' },
  shell: { id: 'shell', name: 'Shell', desc: 'Halve incoming damage for 3 turns.' },
  venom: { id: 'venom', name: 'Venom', desc: 'Poison the hero (5 damage/turn for 3 turns).' },
  toxins: { id: 'toxins', name: 'Brood Toxin', desc: 'Poison the hero (5 damage/turn for 5 turns).' },
  web: { id: 'web', name: 'Web Spray', desc: 'Reduce the hero\u2019s accuracy for 3 turns.' },
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
