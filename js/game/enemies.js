// Enemy generation per campaign stage: type system, stats, skills, scaling.
import { TUNING } from '../config/tuning.js';
import { pick, weightedPick } from '../core/rng.js';

// Creature-based types. `slash` = Power Strike multiplier, `blunt` = Attack.
export const TYPES = {
  beast: { label: 'Beast', slash: 1.0, blunt: 1.0 },
  demon: { label: 'Demon', slash: 1.25, blunt: 0.75 },
  undead: { label: 'Undead', slash: 0.75, blunt: 1.25 },
  insect: { label: 'Insect', slash: 0.75, blunt: 1.25 },
  construct: { label: 'Construct', slash: 0.9, blunt: 0.9 },
};

export function weaknessOf(type) {
  const t = TYPES[type];
  return t.blunt >= t.slash ? 'Blunt (Attack)' : 'Slash (Power Strike)';
}

const BASES = [
  { id: 'grunt', name: 'Grunt', sprite: 'grunt', type: 'beast', hp: 60, atk: 9, skills: [] },
  { id: 'brute', name: 'Brute', sprite: 'brute', type: 'demon', hp: 48, atk: 13, skills: ['enrage'] },
  { id: 'tank', name: 'Warden', sprite: 'warden', type: 'construct', hp: 85, atk: 7, skills: ['shell'] },
  { id: 'stinger', name: 'Stinger', sprite: 'stinger', type: 'insect', hp: 55, atk: 11, skills: ['venom'] },
  { id: 'skeleton', name: 'Skeleton', sprite: 'skeleton', type: 'undead', hp: 58, atk: 12, skills: ['shell'] },
  { id: 'wyvern', name: 'Wyvern', sprite: 'wyvern', type: 'beast', hp: 52, atk: 12, skills: ['enrage'] },
];

const BOSSES = [
  { id: 'malgrath', name: 'Overlord Malgrath', sprite: 'brute', type: 'demon', skills: ['enrage', 'venom'] },
  { id: 'wardenprime', name: 'Warden Prime', sprite: 'warden', type: 'construct', skills: ['shell', 'enrage'] },
  { id: 'hollowking', name: 'The Hollow King', sprite: 'skeleton', type: 'undead', skills: ['venom', 'shell'] },
  { id: 'colossus', name: 'Revenant Colossus', sprite: 'wyvern', type: 'beast', skills: ['enrage', 'venom'] },
];

// All discoverable bestiary ids (BASES ids + boss ids).
export const KNOWN_ENEMY_IDS = [...BASES.map((b) => b.id), ...BOSSES.map((b) => b.id)];

export function isBossStage(stage) {
  return stage % TUNING.stage.bossEvery === 0;
}

export function createEnemy(stage, baseIndex) {
  const t = TUNING;
  const hpScale = 1 + t.stage.enemyHpPerStage * (stage - 1);
  const atkScale = 1 + t.stage.enemyAtkPerStage * (stage - 1);
  const boss = isBossStage(stage);

  let base;
  if (boss) {
    const b = BOSSES[(stage / t.stage.bossEvery - 1) % BOSSES.length];
    base = { hp: 60, atk: 10, id: b.id, name: b.name, sprite: b.sprite, type: b.type, skills: b.skills };
  } else {
    base = baseIndex != null ? BASES[baseIndex] : pick(BASES);
  }

  const hpMult = boss ? t.combat.boss.hpMultiplier : 1;
  const atkMult = boss ? t.combat.boss.atkMultiplier : 1;
  const maxHp = Math.round(base.hp * hpScale * hpMult);
  const atk = Math.round(base.atk * atkScale * atkMult);
  const evasion = Math.min(0.05 + t.stage.enemyEvasionPerStage * (stage - 1) + (boss ? 0.05 : 0), 0.2);
  const armor = Math.floor((stage - 1) / 4);
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
  skill: 'Preparing a skill', // replaced with the real name in combat.js
};
