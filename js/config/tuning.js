// Central tuning values. Change numbers here; do not hardcode them elsewhere.
export const TUNING = {
  player: {
    baseAttack: 12,
    baseMaxHp: 100,
    maxEnergyCap: 100,
    baseCritChance: 0.1,
    baseCritDamage: 2.0,
    potionHeal: 0.35, // fraction of maxHp
    baseStartPotions: 2,
    maxPotions: 9,
    attackGainPerLevel: 2,
    hpGainPerLevel: 12,
    defenseGainPerLevel: 1,
    evasionBase: 0.03,
    evasionPerLevel: 0.005,
    evasionCap: 0.15,
  },
  combat: {
    damageVariance: 0.15, // +/- fraction
    defendReduction: 0.5, // fraction of incoming damage blocked
    attackEnergyGain: 10,
    defendEnergyGain: 20,
    powerStrike: { multiplier: 1.75, cost: 25 },
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
    goldBountyPerStack: 0.2,
  },
  stage: {
    bossEvery: 10,
    victoryStage: 50,
    enemyHpPerStage: 0.12,
    enemyAtkPerStage: 0.08,
    enemyEvasionPerStage: 0.004,
    enemyArmorEvery: 4,
    healOnWin: 0.4, // fraction of maxHp restored after a stage win
    potionRefillEvery: 3,
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
};
