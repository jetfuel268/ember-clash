// Versioned localStorage persistence. Save shape (v1):
// {
//   version: 1,
//   player: { level, xp, gold, upgrades: [ids, may repeat] },
//   stage: 1,
//   stats: { wins, losses, kills },
// }
const KEY = 'combat-game.save.v1';
const VERSION = 1;

export const DEFAULT_SAVE = () => ({
  version: VERSION,
  player: { level: 1, xp: 0, gold: 0, upgrades: [] },
  stage: 1,
  stats: { wins: 0, losses: 0, kills: 0 },
});

export class SaveStore {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return DEFAULT_SAVE();
      const data = JSON.parse(raw);
      if (!data || data.version !== VERSION) return DEFAULT_SAVE();
      return data;
    } catch {
      return DEFAULT_SAVE();
    }
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
