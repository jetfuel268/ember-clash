// Enemy generation per campaign stage: type system, stats, skills, scaling,
// and per-stage limited enemy pools.
import { TUNING } from '../config/tuning.js';
import { weightedPick } from '../core/rng.js';

// Creature-based types. `slash` = Power Strike multiplier, `blunt` = Attack.
// `element` = strengths (1.5x) and weaknesses (0.5x) of the creature against
// fire / ice / lightning *attacks*. (The elements are attack types only —
// there are no fire/ice/lightning monsters.)
export const TYPES = {
  beast: { label: 'Beast', slash: 1.0, blunt: 1.0, element: { fire: 1.5, ice: 0.5, lightning: 1.0 } },
  demon: { label: 'Demon', slash: 1.25, blunt: 0.75, element: { fire: 0.5, ice: 1.5, lightning: 1.0 } },
  undead: { label: 'Undead', slash: 0.75, blunt: 1.25, element: { fire: 0.5, ice: 1.0, lightning: 1.5 } },
  insect: { label: 'Insect', slash: 0.75, blunt: 1.25, element: { fire: 1.0, ice: 1.5, lightning: 0.5 } },
  construct: { label: 'Construct', slash: 0.9, blunt: 0.9, element: { fire: 1.0, ice: 0.5, lightning: 1.5 } },
};

// Human-readable element line for the bestiary, e.g. "weak to lightning, resists fire".
export function elementSummary(type) {
  const el = TYPES[type]?.element;
  if (!el) return '';
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const weak = Object.entries(el).filter(([, m]) => m > 1).map(([k]) => cap(k));
  const res = Object.entries(el).filter(([, m]) => m < 1).map(([k]) => cap(k));
  const parts = [];
  if (weak.length) parts.push(`weak to ${weak.join(', ')}`);
  if (res.length) parts.push(`resists ${res.join(', ')}`);
  return parts.join(', ');
}

export function weaknessOf(type) {
  const t = TYPES[type];
  return t.blunt >= t.slash ? '🔨 Blunt (Attack)' : '⚔️ Slash (Power Strike)';
}

// Regular (non-boss) enemies. Adding an enemy = adding an entry here.
export const ENEMY_DEFS = {
  grunt: { id: 'grunt', name: 'Grunt', sprite: 'grunt', type: 'beast', hp: 60, atk: 9, skills: [] },
  brute: { id: 'brute', name: 'Brute', sprite: 'brute', type: 'demon', hp: 48, atk: 13, skills: ['enrage'] },
  warden: { id: 'warden', name: 'Warden', sprite: 'warden', type: 'construct', hp: 85, atk: 7, skills: ['shell'] },
  stinger: { id: 'stinger', name: 'Stinger', sprite: 'stinger', type: 'insect', hp: 55, atk: 11, skills: ['venom'] },
  skeleton: { id: 'skeleton', name: 'Skeleton', sprite: 'skeleton', type: 'undead', hp: 58, atk: 12, skills: ['shell'] },
  wyvern: { id: 'wyvern', name: 'Wyvern', sprite: 'wyvern', type: 'beast', hp: 52, atk: 12, skills: ['enrage'] },
  slime: { id: 'slime', name: 'Slime', sprite: 'slime', type: 'beast', hp: 45, atk: 8, skills: ['shell'] },
};

// Limited per-stage pools: each biome (10 stages) draws only from its pool.
// Order matches the ENV_TIERS biomes (forest, crystal cavern, dungeon,
// walkway, dark castle); past stage 50 the cycle repeats in endless mode.
export const STAGE_POOLS = [
  ['stinger', 'skeleton', 'slime'], // forest (1-10)
  ['warden', 'slime', 'grunt'], // crystal cavern (11-20)
  ['skeleton', 'brute', 'warden'], // dungeon (21-30)
  ['wyvern', 'grunt', 'stinger'], // walkway (31-40)
  ['brute', 'skeleton', 'wyvern'], // dark castle (41-50)
];

// The boss of each biome, cycled every 10 stages (10, 20, 30, 40, ...).
const BOSSES = [
  { id: 'broodmother', name: 'The Broodmother', sprite: 'broodmother', type: 'insect', skills: ['web', 'toxins'] },
  { id: 'crystalguardian', name: 'Crystal Guardian', sprite: 'crystalguardian', type: 'construct', skills: ['crystallineshell', 'crystaldrain'] },
  { id: 'lich', name: 'The Lich', sprite: 'lich', type: 'undead', skills: ['frostbolt', 'chainlightning', 'wither'] },
  { id: 'emberwyrm', name: 'The Ember Wyrm', sprite: 'dragon', type: 'demon', skills: ['infernobolt', 'fury'] },
];

// The stage-50 final boss: a dark mirror of the hero.
const FINAL_BOSS = {
  id: 'umbra', name: 'Umbra, Dark Reflection', sprite: 'dreadknight',
  type: 'undead', hp: 70, atk: 11, skills: ['shell', 'enrage'],
};

// All discoverable bestiary ids (regular + boss + final boss).
export const KNOWN_ENEMY_IDS = [
  ...Object.keys(ENEMY_DEFS),
  ...BOSSES.map((b) => b.id),
  FINAL_BOSS.id,
];

export function isBossStage(stage) {
  return stage % TUNING.stage.bossEvery === 0;
}

// The pool a stage draws from (biomes cycle in endless mode).
export function poolForStage(stage) {
  return STAGE_POOLS[Math.floor((stage - 1) / 10) % STAGE_POOLS.length];
}

export function createEnemy(stage, baseIndex) {
  const t = TUNING;
  const hpScale = 1 + t.stage.enemyHpPerStage * (stage - 1);
  const atkScale = 1 + t.stage.enemyAtkPerStage * (stage - 1);
  const boss = isBossStage(stage);

  let base;
  if (stage === TUNING.stage.victoryStage) {
    base = { ...FINAL_BOSS };
  } else if (boss) {
    const b = BOSSES[(stage / t.stage.bossEvery - 1) % BOSSES.length];
    base = { hp: 60, atk: 10, id: b.id, name: b.name, sprite: b.sprite, type: b.type, skills: b.skills };
  } else {
    const pool = poolForStage(stage);
    const id = baseIndex != null ? pool[baseIndex % pool.length] : pool[Math.floor(Math.random() * pool.length)];
    base = { ...ENEMY_DEFS[id] };
  }

  const hpMult = boss ? t.combat.boss.hpMultiplier : 1;
  const atkMult = boss ? t.combat.boss.atkMultiplier : 1;
  const maxHp = Math.round(base.hp * hpScale * hpMult);
  const atk = Math.round(base.atk * atkScale * atkMult);
  const evasion = Math.min(0.05 + t.stage.enemyEvasionPerStage * (stage - 1) + (boss ? 0.05 : 0), 0.2);
  const armor = Math.floor((stage - 1) / 4);
  const critChance = Math.min(
    t.enemyCrit.base + t.enemyCrit.perStage * (stage - 1) + (boss ? 0.05 : 0),
    t.enemyCrit.cap
  );
  const critDamage = Math.min(
    t.enemyCrit.dmgBase + t.enemyCrit.dmgPerStage * (stage - 1),
    t.enemyCrit.dmgCap
  );
  const em = t.enemyMagic;
  const magic = Math.min(
    Math.round(em.base + (stage - 1) * em.perStage + (boss ? em.bossBonus : 0)),
    em.cap
  );
  return {
    id: base.id,
    name: base.name,
    sprite: base.sprite,
    type: base.type,
    typeLabel: TYPES[base.type].label,
    skills: [...base.skills],
    maxHp,
    hp: maxHp,
    atk,
    evasion,
    armor,
    critChance,
    critDamage,
    magic,
    energy: em.startEnergy,
    boss,
    stage,
  };
}

// Enemy next-action intent: 'attack' | 'charge' | 'defend' | 'skill'
export function rollIntent(canSkill) {
  const w = TUNING.enemyAi.weights;
  const entries = [
    { key: 'attack', weight: w.attack },
    { key: 'charge', weight: w.charge },
    { key: 'defend', weight: w.defend },
  ];
  if (canSkill) entries.push({ key: 'skill', weight: w.skill });
  return weightedPick(entries);
}

export const INTENT_LABELS = {
  attack: 'Unsheathing blade',
  charge: 'Gathering power',
  defend: 'Raising guard',
  skill: 'Preparing a skill',
};
