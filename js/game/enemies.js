// Enemy generation per campaign stage. Scaling lives here + tuning.js.
import { TUNING } from '../config/tuning.js';
import { pick, weightedPick } from '../core/rng.js';

const BASES = [
  { id: 'grunt', name: 'Grunt', sprite: 'grunt', hp: 60, atk: 9 },
  { id: 'brute', name: 'Brute', sprite: 'brute', hp: 48, atk: 13 },
  { id: 'tank', name: 'Warden', sprite: 'warden', hp: 85, atk: 7 },
  { id: 'stinger', name: 'Stinger', sprite: 'stinger', hp: 55, atk: 11 },
];

const BOSSES = [
  { name: 'Overlord Malgrath', sprite: 'brute' },
  { name: 'Warden Prime', sprite: 'warden' },
  { name: 'The Hollow King', sprite: 'brute' },
  { name: 'Revenant Colossus', sprite: 'warden' },
];

export function isBossStage(stage) {
  return stage % TUNING.stage.bossEvery === 0;
}

export function createEnemy(stage, baseIndex) {
  const t = TUNING;
  const hpScale = 1 + t.stage.enemyHpPerStage * (stage - 1);
  const atkScale = 1 + t.stage.enemyAtkPerStage * (stage - 1);
  const boss = isBossStage(stage);

  let base, name, emoji, sprite;
  if (boss) {
    base = { hp: 60, atk: 10 };
    const b = BOSSES[(stage / t.stage.bossEvery - 1) % BOSSES.length];
    name = b.name;
    sprite = b.sprite;
  } else {
    base = baseIndex != null ? BASES[baseIndex] : pick(BASES);
    name = base.name;
    sprite = base.sprite;
  }

  const hpMult = boss ? t.combat.boss.hpMultiplier : 1;
  const atkMult = boss ? t.combat.boss.atkMultiplier : 1;
  const maxHp = Math.round(base.hp * hpScale * hpMult);
  const atk = Math.round(base.atk * atkScale * atkMult);
  return {
    name,
    sprite,
    maxHp,
    hp: maxHp,
    atk,
    boss,
    stage,
  };
}

// Enemy next-action intent. Returns one of 'attack' | 'charge' | 'defend'.
export function rollIntent() {
  const w = TUNING.enemyAi.weights;
  return weightedPick([
    { key: 'attack', weight: w.attack },
    { key: 'charge', weight: w.charge },
    { key: 'defend', weight: w.defend },
  ]);
}

export const INTENT_LABELS = {
  attack: 'Unsheathing blade',
  charge: 'Gathering power',
  defend: 'Raising guard',
};
