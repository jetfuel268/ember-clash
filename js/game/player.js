// Player model: persisted fields (level, xp, gold, upgrades) + derived stats.
import { TUNING } from '../config/tuning.js';
import { UPGRADE_MAP, xpForNext } from './upgrades.js';

export class Player {
  constructor({ level, xp, gold, upgrades }) {
    this.level = level;
    this.xp = xp;
    this.gold = gold;
    this.upgrades = upgrades; // array of ids, may repeat (stacks)
  }

  // Recomputed from level + upgrade stacks; never stored, always in sync.
  stats() {
    const s = {
      attack: TUNING.player.baseAttack + (this.level - 1) * TUNING.player.attackGainPerLevel,
      maxHp: TUNING.player.baseMaxHp + (this.level - 1) * TUNING.player.hpGainPerLevel,
      maxEnergy: 50,
      critChance: TUNING.player.baseCritChance,
      critDamage: TUNING.player.baseCritDamage,
      attackEnergy: TUNING.combat.attackEnergyGain,
      goldBonus: 0,
      potionHeal: TUNING.player.potionHeal,
      startPotions: TUNING.player.baseStartPotions,
    };
    for (const id of this.upgrades) {
      const up = UPGRADE_MAP[id];
      if (!up) continue;
      for (const [k, v] of Object.entries(up.effect)) {
        s[k] = (s[k] ?? 0) + v;
      }
    }
    s.maxEnergy = Math.min(s.maxEnergy, TUNING.player.maxEnergyCap);
    s.startPotions = Math.min(s.startPotions, TUNING.player.maxPotions);
    return s;
  }

  // Potions granted at the start of stage `stage`.
  potionsForStage(stage) {
    const s = this.stats();
    const refill = Math.floor((stage - 1) / TUNING.stage.potionRefillEvery);
    return Math.min(s.startPotions + refill, TUNING.player.maxPotions);
  }

  addXp(amount) {
    this.xp += amount;
    let leveled = false;
    while (this.xp >= xpForNext(this.level)) {
      this.xp -= xpForNext(this.level);
      this.level += 1;
      leveled = true;
    }
    return leveled;
  }

  applyUpgrade(id) {
    const up = UPGRADE_MAP[id];
    if (!up) throw new Error(`Unknown upgrade: ${id}`);
    const stacks = this.upgrades.filter((x) => x === id).length;
    if (stacks >= up.max) return false;
    this.upgrades.push(id);
    return true;
  }

  // Full heal at level-up / stage start.
  serialize() {
    return { level: this.level, xp: this.xp, gold: this.gold, upgrades: [...this.upgrades] };
  }
}
