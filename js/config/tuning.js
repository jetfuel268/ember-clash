// Central tuning values. Change numbers here; do not hardcode them elsewhere.
export const TUNING = {
  player: {
    baseAttack: 16,
    baseMaxHp: 100,
    baseDefense: 0,
    baseMagic: 1,
    energyCap: 150,
    startEnergy: 50,
    baseCritChance: 0.1,
    baseCritDamage: 2.0,
    potionHeal: 0.35, // fraction of maxHp
    // Per level-up: each stat gains a random amount in [min, max].
    levelUp: {
      statMin: 0,
      statMax: 2, // attack / defense / magic
      hpMin: 12,
      hpMax: 28,
    },
    evasionBase: 0.03,
    evasionPerLevel: 0.004,
    evasionCap: 0.15,
  },
  combat: {
    damageVariance: 0.15, // +/- fraction
    defendReduction: 0.5, // fraction of incoming damage blocked
    enemyChargeMultiplier: 1.6,
    enemyDefendReduction: 0.5,
    enemyActionDelayMs: 650,
    boss: { hpMultiplier: 1.8, atkMultiplier: 1.25 },
  },
  xp: { base: 30, perLevel: 20 }, // xpForNext(level) = base + (level-1)*perLevel
  rewards: {
    xpBase: 12,
    xpPerStage: 4,
    xpBossBonus: 25,
    goldMin: 8,
    goldMax: 20,
    goldPerStage: 2,
  },
  stage: {
    bossEvery: 10,
    victoryStage: 50,
    enemyHpPerStage: 0.12,
    enemyAtkPerStage: 0.08,
    enemyEvasionPerStage: 0.004,
    enemyArmorEvery: 4,
    shopEvery: 10, // shop opens on stages ending in 5
    shopOffset: 5,
  },
  enemyAi: {
    weights: { attack: 60, charge: 12, defend: 12, skill: 16 },
    enemyHitBase: 0.6,
    enemyHitPerStage: 0.02,
  },
  enemyCrit: {
    base: 0.05,
    perStage: 0.005,
    cap: 0.2,
    dmgBase: 1.5,
    dmgPerStage: 0.02,
    dmgCap: 2.0,
  },
  enemyMagic: {
    base: 15,
    perStage: 0.5,
    cap: 50,
    bossBonus: 5,
    startEnergy: 50,
    skillCost: 25,
    webPenalty: 0.25, // accuracy reduction while webbed (Broodmother)
  },
  shop: {
    bed: { base: 15, perStage: 4 }, // full restore cost = base + perStage * stage
    items: {
      potion: { name: 'Potion', desc: 'Heal 35% of max HP', priceBase: 25, perStage: 2 },
      vial: { name: 'Energy Vial', desc: 'Restore 50 energy', priceBase: 35, perStage: 2 },
      elixir: { name: 'Elixir', desc: 'Fully restore HP and energy', priceBase: 70, perStage: 3 },
    },
  },
};
