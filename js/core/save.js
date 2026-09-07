// Versioned localStorage persistence. Save shape (v3):
// {
//   version: 3,
//   player: { level, xp, gold, upgrades: [ids], stats: { attack, defense,
//             magic, maxHp, critChance, critDamage },
//             skills: [ids], items: { potion, vial, elixir }, currentHp },
//   bestiary: { [enemyId]: { name, type, sprite, skills, weakness, kills } },
//   stage: 1,
//   stats: { wins, losses, kills },
//   victorySeen: false,
// }
const KEY = 'combat-game.save.v3';
const VERSION = 3;

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
    currentHp: null,
  },
  bestiary: {},
  stage: 1,
  stats: { wins: 0, losses: 0, kills: 0 },
  victorySeen: false,
});

// v2 player (no stored stats: level-derived) -> v3.
function v2PlayerToV3(p) {
  // v2 growth: +2 atk, +12 maxHp, +1 defense per level; upgrades applied on top.
  const counts = {};
  for (const id of p.upgrades) counts[id] = (counts[id] ?? 0) + 1;
  const level = p.level ?? 1;
  return {
    level,
    xp: p.xp ?? 0,
    gold: p.gold ?? 0,
    upgrades: p.upgrades ?? [],
    stats: {
      attack: 12 + (level - 1) * 2 + 2 * (counts.sharp ?? 0),
      defense: (level - 1) + (counts.iron ?? 0),
      // Old saves stored magic as a small regen value; it is now MAX ENERGY.
      magic: 25 + (level - 1) * 3,
      maxHp: 100 + (level - 1) * 12 + 20 * (counts.iron ?? 0),
      critChance: 0.1 + 0.08 * (counts.crit ?? 0),
      critDamage: 2.0 + 0.25 * (counts.crip ?? 0),
    },
    // Old shop-purchased skills map 1:1 onto the new learned-skill ids.
    skills: ['powerstrike', ...(p.skills ?? []).filter((s) =>
      ['berserk', 'stone', 'focus', 'mend'].includes(s)
    )],
    items: { potion: 2, vial: 0, elixir: 0 },
    currentHp: null,
  };
}

export class SaveStore {
  load() {
    try {
      const data =
        this._read(KEY) ?? this._read('combat-game.save.v2') ?? this._read('combat-game.save.v1');
      if (!data) return DEFAULT_SAVE();
      if (data.version === 1) {
        return { ...DEFAULT_SAVE(), ...this._upgradePlayer(data), version: VERSION };
      }
      if (data.version === 2) {
        return { ...data, player: v2PlayerToV3(data.player), version: VERSION };
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
      localStorage.removeItem('combat-game.save.v2');
      localStorage.removeItem('combat-game.save.v1');
    } catch {
      // ignore
    }
  }
}
