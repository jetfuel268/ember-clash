// Campaign progression: XP/levels, stage rewards, stage advancing,
// level-up upgrade choices. Owns the persisted save object's `stage` and
// `stats` alongside the Player.
import { TUNING } from '../config/tuning.js';
import { rollUpgradeChoices, xpForNext } from './upgrades.js';
import { randInt } from '../core/rng.js';

export class Progression {
  constructor(player, save) {
    this.player = player;
    this.save = save;
  }

  isBossStage(stage) {
    return stage % TUNING.stage.bossEvery === 0;
  }

  isVictoryStage(stage) {
    return stage === TUNING.stage.victoryStage;
  }

  // Call after a stage win. Returns:
  // { gold, xp, leveledUp, choices, healedHpFrac, nextStage, victory }
  onStageWon(stage) {
    const p = this.player;
    const s = TUNING;
    const boss = this.isBossStage(stage);

    const gold =
      (randInt(s.rewards.goldMin, s.rewards.goldMax) + s.rewards.goldPerStage * stage) *
      (1 + p.stats().goldBonus);
    let xp = s.rewards.xpBase + s.rewards.xpPerStage * stage;
    if (boss) xp += s.rewards.xpBossBonus;

    p.gold += Math.round(gold);
    this.save.stats.kills += 1;
    this.save.stats.wins += 1;

    const leveledUp = p.addXp(xp);
    let choices = [];
    if (leveledUp) {
      choices = rollUpgradeChoices(p.upgrades, 3);
    }

    const victory = this.isVictoryStage(stage);
    const nextStage = stage + 1;
    this.save.stage = nextStage;
    return {
      gold: Math.round(gold),
      xp,
      leveledUp,
      choices,
      healFrac: leveledUp ? 1 : s.stage.healOnWin,
      nextStage,
      victory,
    };
  }

  // Call after a stage loss. Stage stays the same; stats recorded.
  onStageLost() {
    this.save.stats.losses += 1;
  }

  xpForNext() {
    return xpForNext(this.player.level);
  }
}
