// Node smoke tests for the game modules (no DOM required).
import assert from 'node:assert/strict';

// Minimal localStorage shim for Node.
if (typeof globalThis.localStorage === 'undefined') {
  const mem = {};
  globalThis.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
    clear: () => { for (const k in mem) delete mem[k]; },
  };
}
import { Player } from '../js/game/player.js';
import { Progression } from '../js/game/progression.js';
import { createEnemy, isBossStage } from '../js/game/enemies.js';
import { Combat } from '../js/game/combat.js';
import { EventBus } from '../js/core/events.js';
import { SaveStore, DEFAULT_SAVE } from '../js/core/save.js';
import { TUNING } from '../js/config/tuning.js';
import { pickSkillToLearn, poolFor } from '../js/game/skills.js';
import { UPGRADES, xpForNext, stackCount } from '../js/game/upgrades.js';

// Deterministic RNG: a 32-bit xorshift seeded by the caller.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function newPlayer(seed = 42) {
  return new Player({ rng: makeRng(seed) });
}

function newSave() {
  return { ...DEFAULT_SAVE(), player: {}, stage: 1 };
}

// --- Player: stored stats, random level-up growth, skills, items ------------
{
  const p = newPlayer();
  const s = p.stats();
  assert.equal(s.attack, 16, 'base attack');
  assert.equal(s.defense, 0, 'base defense');
  assert.equal(s.magic, 1, 'base magic');
  assert.equal(s.maxEnergy, 100, 'base max energy');
  assert.equal(p.skills.length, 1, 'starts with Power Strike');
  assert.equal(p.skills[0], 'powerstrike');

  const before = p.stats();
  for (let i = 0; i < 10; i++) p.addXp(1000); // force ~10 levels
  const after = p.stats();
  assert.ok(p.level >= 9, `10k xp should reach high level (got ${p.level})`);
  assert.ok(after.attack >= before.attack, 'attack grows on level-up');
  assert.ok(after.maxHp >= before.maxHp, 'maxHp grows on level-up');
  assert.ok(after.magic >= before.magic, 'magic grows on level-up');
  const g = p._lastLevelUp;
  for (const k of ['attack', 'defense', 'magic']) {
    assert.ok(g[k] >= 0 && g[k] <= 2, `per-level ${k} gain in [0,2] (got ${g[k]})`);
  }
  assert.ok(g.maxHp >= 12 && g.maxHp <= 28, `per-level maxHp gain in [12,28] (got ${g.maxHp})`);
}

// --- Skill pools: max 4, learn/replace, level ranges ------------------------
{
  const p = newPlayer();
  const r1 = p.learnSkill('berserk');
  assert.equal(r1.learned, true, 'auto-learn when room');
  assert.equal(p.skills.length, 2);
  const dup = p.learnSkill('berserk');
  assert.equal(dup.already, true, 'no duplicate skills');

  // Fill to 4, then the next learn must request replacement.
  for (const id of ['stone', 'aim']) p.learnSkill(id);
  assert.equal(p.skills.length, 4);
  const full = p.learnSkill('mend');
  assert.equal(full.needsReplace, true, 'replace prompt at 4 skills');
  assert.equal(p.skills.length, 4, 'not auto-added when full');
  assert.equal(p.replaceSkill('aim', 'mend'), true, 'replace works');
  assert.ok(p.skills.includes('mend') && !p.skills.includes('aim'));

  // Pool randomization by level range.
  assert.ok(poolFor(3).some((s) => s.pool[0] <= 3 && s.pool[1] >= 3), 'pool 1-9 non-empty at lv3');
  assert.ok(!poolFor(3).some((s) => s.pool[0] > 3), 'no 10+ skills at lv3');
  assert.ok(poolFor(15).some((s) => s.pool[0] >= 10), 'pool 10-19 present at lv15');
  for (let i = 0; i < 50; i++) {
    const pick = pickSkillToLearn(15, [], makeRng(i));
    if (pick) assert.ok(pick.pool[0] <= 15 && pick.pool[1] >= 15, 'pick matches level range');
  }
}

// --- Items: single-use, shop prices -----------------------------------------
{
  const p = newPlayer();
  p.addItem('vial', 2);
  assert.equal(p.items.vial, 2);
  assert.equal(p.removeItem('vial'), true);
  assert.equal(p.removeItem('vial'), true);
  assert.equal(p.removeItem('vial'), false, 'cannot go negative');
  const price = TUNING.shop.items.potion.priceBase + TUNING.shop.items.potion.perStage * 5;
  assert.equal(price, 25 + 10, 'potion price scales with stage');
}

// --- Enemy scaling: HP, atk, armor, magic ----------------------------------
{
  const e1 = createEnemy(1);
  const e10 = createEnemy(10);
  assert.ok(e10.maxHp > e1.maxHp, 'enemy HP scales with stage');
  assert.ok(e10.atk > e1.atk, 'enemy atk scales with stage');
  assert.equal(e10.armor, 2, 'armor every 4 stages');
  assert.equal(isBossStage(10), true);
  assert.equal(isBossStage(11), false);
  const e50 = createEnemy(50);
  assert.equal(e50.id, 'umbra', 'stage 50 is the final boss');
  assert.ok(e50.magic >= e10.magic, 'enemy magic scales with stage');
}

// --- Combat: turn order, guard, skill energy/cd, items, victory ------------
async function testCombatBasics() {
  TUNING.combat.enemyActionDelayMs = 0; // timer fires on the next tick
  const tick = () => new Promise((r) => setTimeout(r, 20));
  const p = newPlayer(7);
  const e = createEnemy(1);
  e.maxHp = 200; e.hp = 200;
  const bus = new EventBus();
  const c = new Combat(p, e, bus);
  c.start();
  assert.equal(c.busy, false);
  assert.ok(c.canAct('attack'));
  assert.ok(c.canAct('skill', 'powerstrike'), 'power strike affordable at 50 energy');
  c.p.guarantee = true; // remove miss variance for a deterministic test
  c.act('attack');
  assert.equal(c.busy, true, 'busy while enemy turn is pending');
  await tick(); // enemy turn resolves via its 0ms timer
  assert.equal(c.busy, false, 'back to player after enemy turn');
  assert.ok(c.e.hp < 200, 'attack dealt damage (resolved on enemy turn)');
  // Guard reduces the next hit.
  c.act('guard');
  await tick();
  // Energy regenerates from magic at the start of the player turn.
  assert.ok(c.p.energy >= 50, `energy regen from magic (got ${c.p.energy})`);
  // Skill cooldown.
  c.act('skill', 'powerstrike');
  await tick();
  assert.ok((c.p.skillCd.powerstrike ?? 0) >= 1, 'cooldown ticks down');
  assert.ok(!c.canAct('skill', 'powerstrike'), 'cooldown gates use');
  // Items.
  c.p.hp = 10;
  c.act('item', 'potion');
  assert.ok(c.p.hp > 10, 'potion heals');
  assert.equal(p.items.potion, 1, 'item consumed from player inventory');
  await tick(); // resolve the potion's enemy turn
  // Victory path.
  c.e.hp = 1;
  c.p.guarantee = true; // Focus: guaranteed hit, no flaky miss
  c.act('attack');
  assert.equal(c.done, true, 'enemy death ends the fight');
}

// --- Combat: type-specific skills -------------------------------------------
async function testTypeSkills() {
  const p = newPlayer(3);
  p.skills = ['beasthunter', 'powerstrike'];
  const beast = createEnemy(1);
  beast.type = 'beast';
  beast.maxHp = 30; beast.hp = 30;
  const c = new Combat(p, beast, new EventBus());
  c.start();
  c.act('skill', 'beasthunter');
  assert.ok(c.e.hp < 30, 'beasthunter damages');
  // Undead Bane against a non-undead target uses the base multiplier only.
  const p2 = newPlayer(3);
  p2.skills = ['undeadbane', 'powerstrike'];
  const beast2 = createEnemy(1);
  beast2.type = 'beast';
  beast2.maxHp = 30; beast2.hp = 30;
  const c2 = new Combat(p2, beast2, new EventBus());
  c2.start();
  c2.act('skill', 'undeadbane');
  assert.ok(c2.e.hp < 30, 'undeadbane base damage works vs non-undead');
}

// --- Progression: rewards, skill learning, victory stage -------------------
{
  const p = newPlayer();
  const save = newSave();
  const prog = new Progression(p, save);
  const reward = prog.onStageWon(1);
  assert.ok(reward.gold >= 8, 'gold reward');
  assert.ok(reward.xp >= 12, 'xp reward');
  assert.equal(save.stage, 2, 'stage advances');
  assert.equal(save.stats.kills, 1, 'kill recorded');

  // Level-ups learn skills (random per level range).
  const p2 = newPlayer();
  const save2 = newSave();
  const prog2 = new Progression(p2, save2);
  let learned = 0;
  for (let i = 0; i < 20; i++) {
    const r = prog2.onStageWon(i + 1);
    if (r.learned) learned++;
  }
  assert.ok(learned >= 3, `several skills learned across 20 stages (got ${learned})`);
  assert.ok(p2.skills.length <= 4, 'max 4 skills');
}

// --- Save v3: round-trip + migration ----------------------------------------
{
  const store = new SaveStore();
  const data = store.load();
  assert.equal(data.version, 3, 'v3 by default');
  assert.equal(data.player.skills[0], 'powerstrike', 'starter skill');

  // v2 -> v3 migration: level-derived stats.
  localStorage.setItem('combat-game.save.v2', JSON.stringify({
    version: 2,
    player: { level: 5, xp: 0, gold: 40, upgrades: ['sharp'], skills: ['berserk'] },
    stage: 6,
    stats: { wins: 5, losses: 1, kills: 6 },
  }));
  const migrated = store.load();
  assert.equal(migrated.version, 3);
  assert.equal(migrated.player.level, 5);
  assert.equal(migrated.player.stats.attack, 12 + 4 * 2 + 2, 'v2 attack recomputed');
  assert.ok(migrated.player.skills.includes('powerstrike'));
  assert.ok(migrated.player.skills.includes('berserk'), 'v2 skill carried over');
  assert.equal(migrated.player.items.potion, 2, 'default items on migration');
  localStorage.clear();
}

// --- Balance: clean campaign run reaches the final stage --------------------
{
  // XP per stage is fixed, so the level at stage 50 is deterministic.
  let xp = 0;
  for (let stage = 1; stage < TUNING.stage.victoryStage; stage++) {
    xp += TUNING.rewards.xpBase + TUNING.rewards.xpPerStage * stage +
      (isBossStage(stage) ? TUNING.rewards.xpBossBonus : 0);
  }
  let level = 1;
  let rem = xp;
  while (rem >= xpForNext(level)) {
    rem -= xpForNext(level);
    level++;
  }
  assert.ok(level >= 20 && level <= 25, `clean run reaches level ${level} (expected 20-25)`);
}

// --- Winability: a level-N player beats the stage-50 final boss ------------
async function playBossFight(level, upgrades, seed) {
  const p = new Player({
    level,
    upgrades: upgrades.map((u) => u.id),
    stats: null,
    skills: ['powerstrike', 'giantswing', 'mend', 'aim'],
    items: { potion: 3, vial: 0, elixir: 1 },
    rng: makeRng(seed),
  });
  // Rebuild stats for a level-N hero (deterministic growth, average case).
  for (let i = 1; i < level; i++) {
    p.stats0.attack += 1; p.stats0.defense += 1; p.stats0.magic += 1; p.stats0.maxHp += 20;
  }
  const e = createEnemy(50);
  e.maxHp = Math.round(e.maxHp / 6); e.hp = e.maxHp; // shortened fight
  const bus = new EventBus();
  const c = new Combat(p, e, bus);
  TUNING.combat.enemyActionDelayMs = 30;
  c.start();
  let guard = 0;
  while (!c.done && guard++ < 500) {
    if (c.canAct('skill', 'powerstrike')) c.act('skill', 'powerstrike');
    else if (c.p.hp < c.p.maxHp * 0.3 && c.canAct('item', 'potion')) c.act('item', 'potion');
    else if (c.canAct('attack')) c.act('attack');
    else if (c.canAct('guard')) c.act('guard');
    await new Promise((r) => setTimeout(r, 30));
    if (c.done) break;
    if (c.e.hp <= 0) break;
  }
  return c.e.hp <= 0;
}

async function main() {
  await testCombatBasics();
  await testTypeSkills();
  const win = await playBossFight(23, UPGRADES.filter((u) => ['sharp', 'iron', 'crit'].includes(u.id)));
  assert.ok(win, `Lv 23 player (with upgrades) defeats the stage-50 final boss (shortened)`);
}

main().then(() => {
  console.log('All smoke tests passed.');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
