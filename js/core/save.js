// Versioned localStorage persistence. Save shape (v5):
// {
//   version: 4,
//   player: { level, xp, gold, upgrades: [legacy ids],
//             stats: { attack, defense, magic, maxHp, critChance, critDamage },
//             skills: [ids], items: { potion, vial, elixir },
//             equipment: { helmet, chest, legs, sword },  // tiers 0-5
//             currentHp, currentEnergy },
//   bestiary: { [enemyId]: { name, type, sprite, skills, weakness, kills } },
//   stage: 1,
//   stats: { wins, losses, kills },
//   victorySeen: false,
// }
const KEY = 'combat-game.save.v5';
const VERSION = 5;

export const DEFAULT_SAVE = () => ({
  version: VERSION,
  player: {
    level: 1,
    xp: 0,
    gold: 0,
    upgrades: [],
    stats: null, // null = derive defaults (Player fills base stats)
    skills: ['powerstrike'],
    items: { potion: 2, vial: 0, elixir: 0 },
    equipment: { helmet: 0, chest: 0, legs: 0, sword: 0 },
    currentHp: null,
    currentEnergy: null,
  },
  bestiary: {},
  stage: 1,
  stats: { wins: 0, losses: 0, kills: 0 },
  victorySeen: false,
});

// Skill ids removed by the 5-tier rework - stripped on migration.
const REMOVED_SKILL_IDS = [
  'flickcut', 'fleetcut', 'cinderkiss', 'sparkthrow',
  'rimetouch', 'sleetshard', 'arcflick', 'volflick',
];

// v3 upgrades (stackable text boosts) -> equipment tiers.
// lung (Deep Lungs) is dropped: max energy is the magic stat itself.
// bounty (gold bonus) is dropped: no slot for it.
function upgradesToEquipment(ids) {
  const c = {};
  for (const id of ids ?? []) c[id] = (c[id] ?? 0) + 1;
  return {
    helmet: Math.min(5, Math.ceil((c.alchem ?? 0) * 2.5)), // 2 stacks -> tier 5
    chest: Math.min(5, c.iron ?? 0),
    legs: Math.min(5, c.mana ?? 0),
    sword: Math.min(
      5,
      Math.max(
        c.sharp ?? 0,
        Math.ceil(((c.crit ?? 0) * 5) / 3),
        Math.ceil(((c.crip ?? 0) * 5) / 3)
      )
    ),
  };
}

// v3 player -> v4 (adds equipment, keeps everything else).
function v3PlayerToV4(p) {
  return {
    ...p,
    equipment: p.equipment ?? upgradesToEquipment(p.upgrades),
  };
}

// v4 player -> v5 (drops skill ids that no longer exist).
function v4PlayerToV5(p) {
  return { ...p, skills: (p.skills ?? []).filter((id) => !REMOVED_SKILL_IDS.includes(id)) };
}

export class SaveStore {
  load() {
    try {
      const data =
        this._read(KEY) ??
        this._read('combat-game.save.v4') ??
        this._read('combat-game.save.v3') ??
        this._read('combat-game.save.v2') ??
        this._read('combat-game.save.v1');
      if (!data) return DEFAULT_SAVE();
      if (data.version === 1 || data.version === 2) {
        // Older saves: rebuild the player the old way, then run it through
        // the v3->v4 upgrade (equipment from legacy upgrades).
        const player = data.version === 1 ? this._upgradePlayer(data) : v2PlayerToV3(data.player);
        return { ...DEFAULT_SAVE(), player: v4PlayerToV5(v3PlayerToV4(player)), version: VERSION };
      }
      if (data.version === 3) {
        return { ...data, player: v4PlayerToV5(v3PlayerToV4(data.player)), version: VERSION };
      }
      if (data.version === 4) {
        return { ...data, player: v4PlayerToV5(data.player), version: VERSION };
      }
      if (data.version !== VERSION) return DEFAULT_SAVE();
      return data;
    } catch {
      return DEFAULT_SAVE();
    }
  }
  _upgradePlayer(data) {
    // v1 had { player: { level, xp, gold, upgrades } } — reuse the v2 mapper.
    return { ...DEFAULT_SAVE().player, ...v2PlayerToV3(data.player ?? {}) };
  }
  _read(key) {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }
  save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...data, version: VERSION }));
    } catch {
      // Storage unavailable (private mode, etc.) — game still works, no persistence.
    }
  }
  clear() {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem('combat-game.save.v4');
      localStorage.removeItem('combat-game.save.v3');
      localStorage.removeItem('combat-game.save.v2');
      localStorage.removeItem('combat-game.save.v1');
    } catch {
      // ignore
    }
  }
}

// v2 player (no stored stats: level-derived) -> v3 shape.
// NOTE: upgrade effects are intentionally NOT baked in here — they now
// come from the equipment tiers (see upgradesToEquipment).
function v2PlayerToV3(p) {
  const level = p.level ?? 1;
  return {
    level,
    xp: p.xp ?? 0,
    gold: p.gold ?? 0,
    upgrades: p.upgrades ?? [],
    stats: {
      attack: 12 + (level - 1) * 2,
      defense: level - 1,
      // Old saves stored magic as a small regen value; it is now MAX ENERGY.
      magic: 25 + (level - 1) * 3,
      maxHp: 100 + (level - 1) * 12,
      critChance: 0.1,
      critDamage: 2.0,
    },
    // Old shop-purchased skills map 1:1 onto the new learned-skill ids.
    skills: ['powerstrike', ...(p.skills ?? []).filter((s) =>
      ['berserk', 'stone', 'focus', 'mend'].includes(s)
    )],
    items: { potion: 2, vial: 0, elixir: 0 },
    currentHp: null,
  };
}
