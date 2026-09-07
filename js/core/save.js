// Versioned localStorage persistence. Save shape (v2):
// {
//   version: 2,
//   player: { level, xp, gold, upgrades: [ids, may repeat] },
//   skills: [purchased skill ids],
//   bestiary: { [enemyId]: { name, type, sprite, skills, weakness, kills } },
//   stage: 1,
//   stats: { wins, losses, kills },
//   victorySeen: false,
// }
const KEY = 'combat-game.save.v2';
const VERSION = 2;

export const DEFAULT_SAVE = () => ({
  version: VERSION,
  player: { level: 1, xp: 0, gold: 0, upgrades: [] },
  skills: [],
  bestiary: {},
  stage: 1,
  stats: { wins: 0, losses: 0, kills: 0 },
  victorySeen: false,
});

export class SaveStore {
  load() {
    try {
      const data = this._read(KEY) ?? this._read('combat-game.save.v1');
      if (!data) return DEFAULT_SAVE();
      // v1 -> v2 migration: carry everything over, add the new fields.
      if (data.version === 1) {
        return { ...data, skills: [], bestiary: {}, victorySeen: false, version: VERSION };
      }
      if (data.version !== VERSION) return DEFAULT_SAVE();
      return data;
    } catch {
      return DEFAULT_SAVE();
    }
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
    } catch {
      // ignore
    }
  }
}
