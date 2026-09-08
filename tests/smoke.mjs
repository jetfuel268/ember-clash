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
import { createEnemy, isBossStage, poolForStage } from '../js/game/enemies.js';
import { Combat } from '../js/game/combat.js';
import { EventBus } from '../js/core/events.js';
import { SaveStore, DEFAULT_SAVE } from '../js/core/save.js';
import { TUNING } from '../js/config/tuning.js';
import { pickSkillToLearn, poolFor, skillLine, candidatesFor, isPlainDamage, TIER_BLOCKS, TIER_COSTS, TIER_MULTS, SKILLS } from '../js/game/skills.js';
import { xpForNext } from '../js/game/upgrades.js';
import { EQUIPMENT, pieceName, nextTier } from '../js/game/equipment.js';

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
  assert.equal(s.magic, 25, 'base magic');
  assert.equal(s.maxEnergy, 25, 'max energy = magic');
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
  for (const k of ['attack', 'defense']) {
    assert.ok(g[k] >= 0 && g[k] <= 2, `per-level ${k} gain in [0,2] (got ${g[k]})`);
  }
  assert.ok(g.magic >= 2 && g.magic <= 4, `per-level magic gain in [2,4] (got ${g.magic})`);
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

  // Pool randomization by level range (pools are 10-level blocks).
  assert.ok(poolFor(3).some((s) => s.pool[0] <= 3 && s.pool[1] >= 3), 'block-1 pool non-empty at lv3');
  assert.ok(!poolFor(3).some((s) => s.pool[0] > 3), 'no block-2+ skills at lv3');
  assert.ok(poolFor(15).some((s) => s.pool[0] >= 11), 'block-2 skills present at lv15');
  // Tier skills are learnable in their own 10-level block and nowhere else.
  for (const sk of SKILLS.filter((k) => k.pool && k.cost >= 15 && k.cost <= 55 && isPlainDamage(k))) {
    const block = TIER_BLOCKS[TIER_COSTS.indexOf(sk.cost)];
    assert.deepEqual(sk.pool, block, `${sk.id} pool matches its tier block ${JSON.stringify(block)}`);
  }
  // Early pool carries the Keen (tier 1) element basics and cheap utility.
  const earlyIds = poolFor(3).map((s) => s.id);
  assert.ok(earlyIds.includes('minormend'), 'early pool has the cheap heal (Minor Mend)');
  assert.ok(earlyIds.includes('swiftedge'), 'early pool has the on-hit skill (Swift Edge)');
  assert.ok(earlyIds.includes('embersnap') && earlyIds.includes('frostenip') && earlyIds.includes('staticzap'),
    'early pool has the tier-1 element basics');
  // Late pool (20+) is populated.
  const lateIds = poolFor(25).map((s) => s.id);
  for (const id of ['trueedge', 'adrenaline', 'secondwind', 'cleave']) {
    assert.ok(lateIds.includes(id), `late pool has ${id} at lv25`);
  }
  for (let i = 0; i < 50; i++) {
    const pick = pickSkillToLearn(15, [], Infinity, makeRng(i));
    if (pick) assert.ok(pick.pool[0] <= 15 && pick.pool[1] >= 15, 'pick matches level range');
  }
  // Level-up offers respect the current energy: nothing you cannot use.
  for (let i = 0; i < 50; i++) {
    const pick = pickSkillToLearn(3, [], 25, makeRng(i));
    if (pick) assert.ok(pick.cost <= 25, `level-up pick payable at 25 energy (${pick.id} costs ${pick.cost})`);
  }
  // Owning a higher-tier skill hides the lower tiers of that line.
  for (let i = 0; i < 50; i++) {
    const pick = pickSkillToLearn(3, ['powerstrike'], Infinity, makeRng(i));
    if (pick)
      assert.ok(
        !(skillLine(pick) === 'blade' && pick.mult < 1.5),
        `no lower blade tier under Power Strike (got ${pick.id})`,
      );
  }
  // Multi-effect skills are never suppressed: Double Strike stays offered
  // under a higher blade tier, plain lower blade tiers stay suppressed.
  const underBlade = candidatesFor(5, ['powerstrike'], Infinity).map((s) => s.id);
  assert.ok(underBlade.includes('doublestrike'), 'Double Strike offered despite higher blade tier owned');
  assert.ok(underBlade.includes('poisonedblade'), 'Poisoned Blade offered despite higher blade tier owned');
  for (const blocked of ['fairblade'])
    assert.ok(!underBlade.includes(blocked), `${blocked} still suppressed under Power Strike`);
  // A multi-effect owner (Beasthunter, 150% + type bonus) suppresses
  // nothing: line skills stay offered in their own pool windows.
  const underType5 = candidatesFor(5, ['beasthunter'], Infinity).map((s) => s.id);
  assert.ok(underType5.includes('doublestrike'), 'multi-effect owner does not hide Double Strike');
  const underType15 = candidatesFor(15, ['beasthunter'], Infinity).map((s) => s.id);
  assert.ok(underType15.includes('vampirefang'), 'multi-effect owner does not hide Vampire Fang');
  // A plain Cataclysmic owner suppresses plain lower tiers of its line.
  const underSunder = candidatesFor(5, ['sunderingstroke'], Infinity).map((s) => s.id);
  for (const blocked of ['fairblade'])
    assert.ok(!underSunder.includes(blocked), `${blocked} suppressed under Sundering Stroke`);
  for (let i = 0; i < 50; i++) {
    const pick = pickSkillToLearn(3, ['emberjab'], Infinity, makeRng(i));
    if (pick)
      assert.ok(
        !(pick.element === 'fire' && pick.mult < 1.5),
        `no weaker fire under Ember Jab (got ${pick.id})`,
      );
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

// --- Full tier ladder: exactly 5 tiers, every weapon carries each ------
{
  const TIERS = {
    keen: 1.25,
    mighty: 1.5,
    brutal: 1.75,
    crushing: 2.0,
    cataclysmic: 2.25,
  };
  const weapons = ['blade', 'blunt', 'fire', 'ice', 'lightning'];
  for (const w of weapons) {
    for (const [tier, mult] of Object.entries(TIERS)) {
      const has = SKILLS.some((s) =>
        s.type === 'damage' &&
        s.mult === mult &&
        (w === 'blade'
          ? s.weapon === 'blade'
          : w === 'blunt'
            ? !s.element && s.weapon !== 'blade'
            : s.element === w));
      assert.ok(has, `${w} has a ${tier} (${mult}x) skill`);
    }
  }
  // No damage skill sits outside the 5-tier ladder (multi-hit skills
  // reuse tier multipliers per hit).
  for (const s of SKILLS) {
    if (s.type !== 'damage') continue;
    assert.ok(TIER_MULTS.includes(s.mult), `${s.id} sits on the tier ladder (${s.mult})`);
  }
  // Every learnable skill is payable when it enters the pool: magic
  // grows 2-4 per level from 25, so max magic at pool start >= cost.
  for (const s of SKILLS.filter((k) => k.pool)) {
    const maxMagicAtStart = 25 + 4 * (s.pool[0] - 1);
    assert.ok(
      s.cost === 0 || maxMagicAtStart >= s.cost,
      `${s.id} payable at pool start (cost ${s.cost}, max magic ${maxMagicAtStart})`,
    );
  }
}

// --- Stage pools: limited per-stage pools + biome bosses -------------------
{
  const pool1 = poolForStage(1);
  assert.deepEqual(pool1, ['stinger', 'skeleton', 'slime'], 'stage-1 pool is spider/skeleton/slime');
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(createEnemy(1).id);
  for (const id of seen) assert.ok(pool1.includes(id), `stage-1 only spawns pool enemies (got ${id})`);
  // Pools differ per biome.
  assert.deepEqual(poolForStage(11), ['warden', 'slime', 'grunt'], 'cavern pool');
  assert.deepEqual(poolForStage(41), ['brute', 'skeleton', 'wyvern'], 'dark castle pool');
  // The stage-10 boss is the Broodmother with web + 5-turn toxin + bite.
  const bm = createEnemy(10);
  assert.equal(bm.id, 'broodmother', 'stage 10 boss is the Broodmother');
  assert.deepEqual(bm.skills.sort(), ['toxins', 'web']);
  assert.equal(bm.boss, true);
}

// --- Combat: turn order, guard, skill energy/cd, items, victory ------------
async function testCombatBasics() {
  TUNING.combat.enemyActionDelayMs = 0; // timer fires on the next tick
  const tick = () => new Promise((r) => setTimeout(r, 20));
  const p = newPlayer(7);
  p.stats0.magic = 100; // roomy pool so flat regen is observable
  const e = createEnemy(1);
  e.maxHp = 200; e.hp = 200;
  const bus = new EventBus();
  const c = new Combat(p, e, bus);
  c.start();
  assert.equal(c.busy, false);
  assert.ok(c.canAct('attack'));
  assert.equal(c.p.energy, 50, 'fresh battle starts at default 50');
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
  // Energy regens a flat 10 per turn (magic is the pool cap).
  assert.equal(c.p.energy, 70, `flat energy regen (got ${c.p.energy})`);
  // Skills are gated by energy only.
  c.act('skill', 'powerstrike');
  await tick();
  assert.equal(c.p.energy, 55, 'energy deducted (50 start + 30 regen, -25 cost)');
  c.p.energy = 10;
  assert.ok(!c.canAct('skill', 'powerstrike'), 'insufficient energy gates use');
  c.p.energy = 25;
  assert.ok(c.canAct('skill', 'powerstrike'), 'sufficient energy allows use');
  // Energy carries over between battles (clamped into the pool).
  const c2 = new Combat(p, e, bus, null, 80);
  assert.equal(c2.p.energy, 80, 'carried energy used as battle start');
  const c3 = new Combat(p, e, bus, null, 500);
  assert.equal(c3.p.energy, 100, 'carried energy clamped to max');
  // Items.
  c.p.hp = 10;
  c.act('item', 'potion');
  assert.ok(c.p.hp > 10, 'potion heals');
  assert.equal(p.items.potion, 1, 'item consumed from player inventory');
  await tick(); // resolve the potion's enemy turn
  // Elixir restores 50% of max HP and max energy.
  p.items.elixir = 1;
  c.p.items.elixir = 1;
  c.p.maxHp = 100;
  c.p.maxEnergy = 100;
  c.p.hp = 10;
  c.p.energy = 5;
  c.act('item', 'elixir');
  assert.equal(c.p.hp, 60, 'elixir restores 50% max HP');
  assert.equal(c.p.energy, 55, 'elixir restores 50% max energy');
  await tick(); // resolve the elixir's enemy turn
  // Victory path.
  c.e.hp = 1;
  c.p.guarantee = true; // Focus: guaranteed hit, no flaky miss
  c.act('attack');
  assert.equal(c.done, true, 'enemy death ends the fight');
}

// --- Combat: type-specific skills -------------------------------------------
async function testTypeSkills() {
  const p = newPlayer(3);
  p.stats0.magic = 100; // pool large enough for the skill cost
  p.skills = ['beasthunter', 'powerstrike'];
  const beast = createEnemy(1);
  beast.type = 'beast';
  beast.maxHp = 30; beast.hp = 30;
  const c = new Combat(p, beast, new EventBus());
  c.start();
  c.p.guarantee = true; // remove miss variance
  c.act('skill', 'beasthunter');
  assert.ok(c.e.hp < 30, 'beasthunter damages');
  // Undead Bane against a non-undead target uses the base multiplier only.
  const p2 = newPlayer(3);
  p2.stats0.magic = 100;
  p2.skills = ['undeadbane', 'powerstrike'];
  const beast2 = createEnemy(1);
  beast2.type = 'beast';
  beast2.maxHp = 30; beast2.hp = 30;
  const c2 = new Combat(p2, beast2, new EventBus());
  c2.start();
  c2.p.guarantee = true;
  c2.act('skill', 'undeadbane');
  assert.ok(c2.e.hp < 30, 'undeadbane base damage works vs non-undead');
}

// --- Combat: element skills (attack elements vs creature affinities) --------
async function testElementSkills() {
  // Fire is 1.5x vs beasts, 0.5x vs demons.
  const p = newPlayer(3);
  p.stats0.magic = 100;
  p.stats0.critChance = 0; // keep comparisons deterministic (no crits)
  p.skills = ['emberjab', 'powerstrike'];
  const beast = createEnemy(1);
  beast.type = 'beast';
  beast.maxHp = 300; beast.hp = 300;
  const c = new Combat(p, beast, new EventBus());
  c.start();
  c.p.guarantee = true;
  c.act('skill', 'emberjab');
  const vsWeak = 300 - c.e.hp;

  const p2 = newPlayer(3);
  p2.stats0.magic = 100;
  p2.stats0.critChance = 0;
  p2.skills = ['emberjab', 'powerstrike'];
  const demon = createEnemy(1);
  demon.type = 'demon';
  demon.maxHp = 300; demon.hp = 300;
  const c2 = new Combat(p2, demon, new EventBus());
  c2.start();
  c2.p.guarantee = true;
  c2.act('skill', 'emberjab');
  const vsResist = 300 - c2.e.hp;
  assert.ok(vsWeak > vsResist, `fire weakness vs beast (${vsWeak}) > resistance vs demon (${vsResist})`);

  // Advanced tier is strictly stronger than the basic tier.
  const p3 = newPlayer(3);
  p3.stats0.magic = 100;
  p3.stats0.critChance = 0;
  p3.skills = ['pyroclasm', 'emberjab'];
  const beast3 = createEnemy(1);
  beast3.type = 'beast';
  beast3.maxHp = 300; beast3.hp = 300;
  const c3 = new Combat(p3, beast3, new EventBus());
  c3.start();
  c3.p.guarantee = true;
  c3.p.energy = 100; // Pyroclasm costs 55 (above the 50 battle start)
  c3.act('skill', 'pyroclasm');
  const adv = 300 - c3.e.hp;
  assert.ok(adv > vsWeak, `advanced tier (${adv}) > basic tier (${vsWeak})`);
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

// --- Equipment: tiers, cumulative stats, purchase cap ---------------------
{
  const p = newPlayer();
  const base = p.stats();
  assert.equal(p.equipment.helmet, 0, 'starts with no equipment');

  assert.ok(p.buyEquipmentTier('chest'));
  assert.ok(p.buyEquipmentTier('chest'));
  assert.equal(p.stats().maxHp, base.maxHp + 20 + 25, 'chest tiers are cumulative');

  assert.ok(p.buyEquipmentTier('sword'));
  const s3 = p.stats();
  assert.equal(s3.attack, base.attack + 2, 'sword tier 1 attack');
  assert.equal(s3.critChance, base.critChance + 0.04, 'sword tier 1 crit chance');
  assert.equal(s3.critDamage, base.critDamage + 0.1, 'sword tier 1 crit damage');

  p.buyEquipmentTier('helmet');
  assert.ok(p.stats().potionHeal > TUNING.player.potionHeal, 'helmet boosts item healing');

  const magicBefore = p.stats().magic;
  p.buyEquipmentTier('legs');
  assert.equal(p.stats().magic, magicBefore + 3, 'legs tier 1 magic');
  assert.equal(p.stats().maxEnergy, p.stats().magic, 'max energy = magic (no Deep Lungs)');

  for (let i = 0; i < 6; i++) p.buyEquipmentTier('chest');
  assert.equal(p.equipment.chest, 5, 'equipment caps at tier 5');
  assert.ok(!p.buyEquipmentTier('chest'), 'cannot buy past tier 5');

  const swordPrices = [1, 2, 3, 4, 5].map((t) => EQUIPMENT.sword.pieces[t].price);
  assert.ok(
    swordPrices.every((v, i) => i === 0 || v > swordPrices[i - 1]),
    'sword tier prices increase'
  );

  assert.equal(pieceName('sword', 2), 'Steel Sword');
  assert.equal(nextTier({ helmet: 0 }, 'helmet'), 1);
  assert.equal(nextTier({ helmet: 5 }, 'helmet'), null);

  const data = p.serialize();
  const p2 = new Player(data);
  assert.equal(p2.equipment.chest, 5, 'equipment serialized');
  assert.equal(p2.equipment.sword, 1, 'equipment serialized (sword)');
}

// --- Save v5: round-trip + migration ---------------------------------------
{
  const store = new SaveStore();
  const data = store.load();
  assert.equal(data.version, 5, 'v5 by default');
  assert.equal(data.player.skills[0], 'powerstrike', 'starter skill');
  assert.equal(data.player.equipment.sword, 0, 'default equipment empty');

  // Round-trip keeps equipment.
  const p = newPlayer();
  p.buyEquipmentTier('legs');
  p.buyEquipmentTier('legs');
  p.gold = 77;
  localStorage.setItem('combat-game.save.v5', JSON.stringify({
    version: 5,
    player: p.serialize(),
    stage: 9,
    stats: { wins: 3, losses: 1, kills: 4 },
    victorySeen: false,
  }));
  const rt = store.load();
  assert.equal(rt.version, 5);
  assert.equal(rt.player.equipment.legs, 2, 'round-trip keeps equipment');
  assert.equal(rt.player.gold, 77, 'round-trip keeps gold');
  assert.equal(rt.stage, 9, 'round-trip keeps stage');

  // v4 -> v5 migration: removed skill ids are stripped.
  localStorage.clear();
  localStorage.setItem('combat-game.save.v4', JSON.stringify({
    version: 4,
    player: {
      level: 5, xp: 0, gold: 50, upgrades: [],
      stats: { attack: 20, defense: 4, magic: 40, maxHp: 160, critChance: 0.1, critDamage: 2 },
      skills: ['powerstrike', 'cinderkiss', 'volflick', 'embersnap'],
      items: { potion: 1, vial: 0, elixir: 0 },
      equipment: { helmet: 0, chest: 1, legs: 0, sword: 0 },
      currentHp: null, currentEnergy: null,
    },
    stage: 6,
    stats: { wins: 5, losses: 0, kills: 5 },
    victorySeen: false,
  }));
  const m45 = store.load();
  assert.equal(m45.version, 5);
  assert.ok(!m45.player.skills.includes('cinderkiss'), 'removed skill stripped');
  assert.ok(!m45.player.skills.includes('volflick'), 'removed skill stripped');
  assert.ok(m45.player.skills.includes('embersnap'), 'kept skill survives migration');
  assert.equal(m45.player.equipment.chest, 1, 'equipment preserved on v4->v5');

  // v3 -> v4 migration: text upgrades become equipment tiers.
  localStorage.clear();
  localStorage.setItem('combat-game.save.v3', JSON.stringify({
    version: 3,
    player: {
      level: 7, xp: 0, gold: 120, upgrades: ['iron', 'iron', 'mana', 'lung', 'sharp'],
      stats: { attack: 18, defense: 6, magic: 40, maxHp: 140, critChance: 0.1, critDamage: 2 },
      skills: ['powerstrike', 'berserk'],
      items: { potion: 2, vial: 1, elixir: 0 },
      currentHp: null, currentEnergy: null,
    },
    stage: 8,
    stats: { wins: 7, losses: 0, kills: 8 },
    victorySeen: false,
  }));
  const m34 = store.load();
  assert.equal(m34.version, 5);
  assert.equal(m34.player.equipment.chest, 2, 'iron x2 -> chest tier 2');
  assert.equal(m34.player.equipment.legs, 1, 'mana x1 -> legs tier 1 (lung dropped)');
  assert.equal(m34.player.equipment.sword, 1, 'sharp x1 -> sword tier 1');
  assert.equal(m34.player.level, 7, 'level preserved');
  assert.equal(m34.stage, 8, 'stage preserved');

  // v2 -> v4 migration: level-derived stats, upgrades -> equipment.
  localStorage.clear();
  localStorage.setItem('combat-game.save.v2', JSON.stringify({
    version: 2,
    player: { level: 5, xp: 0, gold: 40, upgrades: ['sharp'], skills: ['berserk'] },
    stage: 6,
    stats: { wins: 5, losses: 1, kills: 6 },
  }));
  const migrated = store.load();
  assert.equal(migrated.version, 5);
  assert.equal(migrated.player.level, 5);
  assert.equal(migrated.player.stats.attack, 12 + 4 * 2, 'v2 attack recomputed (no upgrade bake-in)');
  assert.equal(migrated.player.stats.magic, 25 + 4 * 3, 'v2 magic re-scaled to max-energy');
  assert.equal(migrated.player.equipment.sword, 1, 'v2 sharp -> sword tier 1');
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
async function playBossFight(level, equipment, seed) {
  const p = new Player({
    level,
    equipment,
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

// --- HP carryover: no heal on win or level-up ------------------------------
async function testHpCarryover() {
  const p = newPlayer(11);
  const e = createEnemy(1);
  e.maxHp = 200; e.hp = 200;
  const c = new Combat(p, e, new EventBus());
  c.start();
  c.p.guarantee = true;
  c.p.hp = 40; // simulate damage taken in battle
  c.e.hp = 1;
  c.act('attack'); // guaranteed kill
  assert.equal(c.done, true);
  p.currentHp = c.p.hp; // main.js does this on win
  const e2 = createEnemy(1);
  e2.maxHp = 300; e2.hp = 300;
  const c2 = new Combat(p, e2, new EventBus(), p.currentHp);
  c2.start();
  assert.equal(c2.p.hp, 40, 'battle starts with carried-over HP (no heal)');
}

// --- Early-pool variants: Minor Mend heals, Swift Edge grants on-hit buff --
async function testEarlyVariants() {
  TUNING.combat.enemyActionDelayMs = 0;
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const p = newPlayer(3);
  p.stats0.magic = 100;
  p.skills = ['minormend', 'swiftedge', 'powerstrike'];
  const e = createEnemy(1);
  e.maxHp = 300; e.hp = 300;
  e.armor = 0;
  const c = new Combat(p, e, new EventBus());
  c.start();
  c.p.guarantee = true; // hits land
  // Minor Mend: heals 15% of max HP.
  c.p.hp = Math.max(1, Math.round(c.p.maxHp * 0.5));
  const before = c.p.hp;
  c.act('skill', 'minormend');
  await tick(); // let the enemy turn resolve so busy clears
  assert.ok(c.p.hp > Math.round(c.p.maxHp * 0.5),
    `Minor Mend raised HP above the 50% floor (hp ${c.p.hp})`);
  assert.ok(c.p.hp <= Math.round(c.p.maxHp * 0.65) + 20,
    `Minor Mend heals ~15% (not more), even after an enemy hit (hp ${c.p.hp})`);
  // Swift Edge: on a hit, grants +20% damage for 2 turns.
  assert.ok(!c.p.buffs.damage, 'no damage buff before Swift Edge');
  c.act('skill', 'swiftedge');
  assert.ok(c.p.buffs.damage && c.p.buffs.damage.bonus === 0.2 && c.p.buffs.damage.turns === 2,
    `Swift Edge grants +20% dmg buff on hit (got ${JSON.stringify(c.p.buffs.damage)})`);
}

// --- Balance: each tier kills its own 10-stage block in ~4 turns --------
// Mid-block player attack approximations include level gains + equipment.
async function testTierBalance() {
  TUNING.combat.enemyActionDelayMs = 0;
  const tick = () => new Promise((r) => setTimeout(r, 20));
  const cases = [
    { stage: 5, level: 3, atk: 20, skill: 'steadyslow' }, // T1 vs block 1
    { stage: 15, level: 7, atk: 24, skill: 'heavyslow' }, // T2 vs block 2
    { stage: 25, level: 11, atk: 29, skill: 'sageslow' }, // T3 vs block 3
    { stage: 35, level: 16, atk: 35, skill: 'mountainbreaker' }, // T4 vs block 4
    { stage: 45, level: 20, atk: 39, skill: 'titancrush' }, // T5 vs block 5
  ];
  for (const c of cases) {
    const p = new Player({ level: c.level });
    p.stats0.attack = c.atk;
    p.stats0.magic = 150;
    p.stats0.critChance = 0;
    p.skills = [c.skill];
    const e = createEnemy(c.stage);
    e.type = 'beast'; // blunt 1.0 - neutral matchup
    e.hp = e.maxHp;
    const cb = new Combat(p, e, new EventBus(), null, 150);
    cb.start();
    cb.p.guarantee = true;
    cb.rollEnemyIntent = () => { cb.e.intent = 'attack'; }; // no charge/defend/skill variance
    let turns = 0;
    while (!cb.done && turns < 15) {
      cb.p.energy = 150; // items/regen keep the spell up (damage-math test)
      cb.act('skill', c.skill);
      await tick();
      turns++;
    }
    assert.ok(cb.done, `tier skill wins vs stage-${c.stage} enemy`);
    assert.ok(turns >= 2 && turns <= 8,
      `tier ${Math.ceil(c.stage / 10)} kills its block in ${turns} turns (stage ${c.stage})`);
  }
}

// --- Late-pool skills: Volley (3 hits), Adrenaline (dual buff), Second Wind (heal + cleanse) --
async function testLateSkills() {
  TUNING.combat.enemyActionDelayMs = 0;
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const p = newPlayer(3);
  p.stats0.magic = 150; // pool big enough for all three skills (120 total)
  p.stats0.critChance = 0;
  p.skills = ['volley', 'adrenaline', 'secondwind', 'powerstrike'];
  const e = createEnemy(1);
  e.type = 'beast'; // neutral 1.0 blunt matchup (deterministic damage math)
  e.maxHp = 300; e.hp = 300;
  e.armor = 0;
  const c = new Combat(p, e, new EventBus(), null, 150);
  c.start();
  // Force every Volley hit to land (guarantee only covers the first).
  const strike = c.playerStrike.bind(c);
  c.playerStrike = (s, mult, opts) => strike(s, mult, { ...opts, forceHit: true });
  c.act('skill', 'volley');
  const dmg = 300 - c.e.hp;
  // 3 hits x 125% x 16 atk, +/-15% variance -> 51..69 (no crits)
  assert.ok(dmg >= 50 && dmg <= 70, `Volley deals 3x125% (got ${dmg})`);
  await tick();
  c.act('skill', 'adrenaline');
  assert.ok(c.p.buffs.damage && c.p.buffs.damage.bonus === 0.35 && c.p.buffs.damage.turns === 2,
    'Adrenaline grants +35% damage buff');
  assert.ok(c.p.buffs.hit && c.p.buffs.hit.bonus === 0.35 && c.p.buffs.hit.turns === 2,
    'Adrenaline grants +35% hit buff');
  await tick();
  c.p.buffs.dot = { amount: 5, turns: 3 }; // simulate a poison
  c.p.hp = Math.max(1, Math.round(c.p.maxHp * 0.5));
  c.act('skill', 'secondwind');
  assert.equal(c.p.buffs.dot, null, 'Second Wind purges the dot');
  assert.ok(c.p.hp > Math.round(c.p.maxHp * 0.5), `Second Wind heals (hp ${c.p.hp})`);
}

async function main() {
  await testCombatBasics();
  await testHpCarryover();
  await testTypeSkills();
  await testElementSkills();
  await testEarlyVariants();
  await testLateSkills();
  await testTierBalance();
  const win = await playBossFight(23, { helmet: 3, chest: 5, legs: 5, sword: 5 });
  assert.ok(win, 'Lv 23 player (full equipment) defeats the stage-50 final boss (shortened)');
}

main().then(() => {
  console.log('All smoke tests passed.');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
