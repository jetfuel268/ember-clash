// Campaign progression: XP/levels, stage rewards, stage advancing,
// level-up skill learning. Owns the persisted save object's `stage` and
// `stats` alongside the Player.
import { TUNING } from '../config/tuning.js';
import { xpForNext } from './upgrades.js';
import { pickSkillToLearn } from './skills.js';
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

  // Call after a stage win. `bonus` is 'gold'|'xp' (kill-bonus skills).
  // Returns: { gold, xp, leveledUp, gain, learned, learnedSkill, needsReplace,
  //           healFrac, nextStage, victory }
  onStageWon(stage, bonus = null) {
    const p = this.player;
    const s = TUNING;
    const boss = this.isBossStage(stage);

    let gold =
      (randInt(s.rewards.goldMin, s.rewards.goldMax) + s.rewards.goldPerStage * stage) *
      (1 + p.stats().goldBonus);
    let xp = s.rewards.xpBase + s.rewards.xpPerStage * stage;
    if (boss) xp += s.rewards.xpBossBonus;
    if (bonus === 'gold') gold *= 2;
    if (bonus === 'xp') xp *= 2;

    p.gold += Math.round(gold);
    this.save.stats.kills += 1;
    this.save.stats.wins += 1;

    const leveledUp = p.addXp(xp);
    let learned = null;
    let learnedSkill = null;
    let needsReplace = false;
    if (leveledUp > 0) {
      const pick = pickSkillToLearn(p.level, p.skills);
      if (pick) {
        const result = p.learnSkill(pick.id);
        learnedSkill = pick;
        learned = result.learned;
        needsReplace = !!result.needsReplace;
      }
    }

    const victory = this.isVictoryStage(stage);
    const nextStage = stage + 1;
    this.save.stage = nextStage;

    // No per-level restoration: only a fraction of maxHp is restored on a win
    // (a full restore requires sleeping in a shop bed).
    const healFrac = s.stage.healOnWin;
    if (healFrac > 0) {
      p.heal(healFrac);
    }

    return {
      gold: Math.round(gold),
      xp,
      leveledUp: leveledUp > 0,
      gain: p._lastLevelUp ?? null,
      learned,
      learnedSkill,
      needsReplace,
      healFrac,
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
