import { TUNING } from '../config/tuning.js';
import { UPGRADE_MAP } from './upgrades.js';
import { xpForNext } from './upgrades.js';
import { randInt } from '../core/rng.js';
import { MAX_SKILLS as MAX_SKILLS_CAP, SKILLS } from './skills.js';

export class Player {
  constructor({
    level = 1,
    xp = 0,
    gold = 0,
    upgrades = [],
    stats = null,
    skills = null,
    items = null,
    currentHp = null,
    currentEnergy = null,
    rng,
  }) {
    this.level = level;
    this.xp = xp;
    this.gold = gold;
    this.upgrades = upgrades.slice();
    this.rng = rng ?? Math.random;
    // Stored stats grow randomly on level-up (see levelUpGain).
    const base = TUNING.player;
    this.stats0 =
      stats ?? {
        attack: base.baseAttack,
        defense: base.baseDefense,
        magic: base.baseMagic,
        maxHp: base.baseMaxHp,
        critChance: base.baseCritChance,
        critDamage: base.baseCritDamage,
      };
    this.skills = skills ?? SKILLS_STARTER();
    this.items = items ?? { potion: 2, vial: 0, elixir: 0 };
    this.currentHp = currentHp; // null = at full HP
    this.currentEnergy = currentEnergy; // null = stage-start default
  }

  // Fractional heal of maxHp (e.g. post-victory restore). Returns HP gained.
  heal(frac) {
    const max = this.stats().maxHp;
    const cur = this.currentHp ?? max;
    const target = Math.min(max, Math.round(cur + max * frac));
    this.currentHp = target;
    return target - cur;
  }

  fullRestore() {
    const s = this.stats();
    const cur = this.currentHp ?? s.maxHp;
    this.currentHp = s.maxHp;
    this.currentEnergy = s.maxEnergy; // bed restores HP and energy
    return s.maxHp - cur;
  }

  static defaultStats() {
    const b = TUNING.player;
    return {
      attack: b.baseAttack,
      defense: b.baseDefense,
      magic: b.baseMagic,
      maxHp: b.baseMaxHp,
      critChance: b.baseCritChance,
      critDamage: b.baseCritDamage,
    };
  }

  static defaultItems() {
    return { potion: 2, vial: 0, elixir: 0 };
  }

  // Magic is the player's MAX ENERGY. The flat per-turn regen is
  // TUNING.combat.energyRegen; Deep Lungs adds on top (capped).
  stats() {
    const s = { ...this.stats0 };
    const counts = {};
    for (const id of this.upgrades) counts[id] = (counts[id] ?? 0) + 1;

    if (counts.sharp) s.attack += 2 * counts.sharp;
    if (counts.iron) s.maxHp += 20 * counts.iron;
    if (counts.mana) s.magic += 3 * counts.mana;
    if (counts.lung) s.maxEnergyBonus = 15 * counts.lung;
    if (counts.crit) s.critChance += 0.08 * counts.crit;
    if (counts.crip) s.critDamage += 0.25 * counts.crip;

    s.hit = Math.min(0.8 + (this.level - 1) * 0.01, 0.9);
    s.evasion = Math.min(
      TUNING.player.evasionBase + (this.level - 1) * TUNING.player.evasionPerLevel,
      TUNING.player.evasionCap
    );
    s.maxEnergy = Math.min(
      s.magic + (s.maxEnergyBonus ?? 0),
      TUNING.player.energyCap
    );
    delete s.maxEnergyBonus;
    s.goldBonus = counts.bounty ? 0.2 * counts.bounty : 0;
    s.potionHeal = TUNING.player.potionHeal + (counts.alchem ? 0.1 * counts.alchem : 0);
    return s;
  }

  addXp(amount) {
    this.xp += amount;
    let gained = 0;
    let guard = 0;
    let totalGain = { attack: 0, defense: 0, magic: 0, maxHp: 0 };
    while (this.xp >= xpForNext(this.level) && guard++ < 100) {
      this.xp -= xpForNext(this.level);
      this.level += 1;
      gained += 1;
      const g = this.applyLevelUpGain();
      for (const k of Object.keys(totalGain)) totalGain[k] += g[k];
    }
    this._lastLevelUp = { gained, ...totalGain };
    return gained;
  }

  // Random per-stat growth on level-up: attack/defense in [statMin, statMax],
  // magic (max energy) in [magicMin, magicMax], maxHp in [hpMin, hpMax].
  applyLevelUpGain() {
    const { statMin, statMax, magicMin, magicMax, hpMin, hpMax } = TUNING.player.levelUp;
    const gain = {
      attack: randInt(statMin, statMax, this.rng),
      defense: randInt(statMin, statMax, this.rng),
      magic: randInt(magicMin, magicMax, this.rng),
      maxHp: randInt(hpMin, hpMax, this.rng),
    };
    this.stats0.attack += gain.attack;
    this.stats0.defense += gain.defense;
    this.stats0.magic += gain.magic;
    this.stats0.maxHp += gain.maxHp;
    return gain;
  }

  hasUpgrade(id) {
    const max = UPGRADE_MAP[id]?.maxStacks ?? Infinity;
    return this.upgrades.filter((u) => u === id).length < max;
  }

  applyUpgrade(id) {
    const max = UPGRADE_MAP[id]?.maxStacks ?? Infinity;
    const owned = this.upgrades.filter((u) => u === id).length;
    if (owned >= max) return false;
    this.upgrades.push(id);
    return true;
  }

  learnSkill(id) {
    if (this.skills.includes(id)) return { learned: true, already: true };
    if (this.skills.length < MAX_SKILLS_CAP) {
      this.skills.push(id);
      return { learned: true };
    }
    return { learned: false, needsReplace: true };
  }

  replaceSkill(oldId, newId) {
    const i = this.skills.indexOf(oldId);
    if (i === -1) return false;
    if (this.skills.includes(newId) || newId === oldId) return false;
    this.skills[i] = newId;
    return true;
  }

  addItem(id, count = 1) {
    this.items[id] = (this.items[id] ?? 0) + count;
  }

  hasItem(id) {
    return (this.items[id] ?? 0) > 0;
  }

  removeItem(id, count = 1) {
    if ((this.items[id] ?? 0) < count) return false;
    this.items[id] -= count;
    return true;
  }

  serialize() {
    return {
      level: this.level,
      xp: this.xp,
      gold: this.gold,
      upgrades: this.upgrades,
      stats: { ...this.stats0 },
      skills: this.skills,
      items: { ...this.items },
      currentHp: this.currentHp,
      currentEnergy: this.currentEnergy,
    };
  }
}

function SKILLS_STARTER() {
  return SKILLS.filter((s) => s.starter).map((s) => s.id);
}
