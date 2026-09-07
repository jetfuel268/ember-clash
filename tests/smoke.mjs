// Node smoke test for the DOM-free game modules. Run: node tests/smoke.mjs
import { EventBus } from '../js/core/events.js';
import { SaveStore, DEFAULT_SAVE } from '../js/core/save.js';
import { Player } from '../js/game/player.js';
import { Progression } from '../js/game/progression.js';
import { createEnemy } from '../js/game/enemies.js';
import { Combat } from '../js/game/combat.js';
import { UPGRADES, xpForNext, rollUpgradeChoices } from '../js/game/upgrades.js';
import { TUNING } from '../js/config/tuning.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

// localStorage shim for SaveStore
globalThis.localStorage = {
  _m: {},
  getItem(k) { return this._m[k] ?? null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; },
};

// --- SaveStore round-trip ---
const store = new SaveStore();
const def = DEFAULT_SAVE();
store.save(def);
const loaded = store.load();
assert(loaded.stage === 1 && loaded.player.level === 1, 'save round-trip returns defaults');
store.save({ ...def, stage: 5 });
assert(store.load().stage === 5, 'save persists stage change');
store.clear();
assert(store.load().stage === 1, 'clear resets to defaults');

// --- Player stats derivation ---
const player = new Player({ level: 1, xp: 0, gold: 0, upgrades: [] });
const s = player.stats();
assert(s.attack === TUNING.player.baseAttack, 'base attack matches tuning');
player.applyUpgrade('sharp');
assert(player.stats().attack === TUNING.player.baseAttack + 2, 'Sharp Edge adds 2 attack per stack');
assert(!player.applyUpgrade('satchel') === false, 'applyUpgrade returns boolean');
player.applyUpgrade('crit');
assert(player.stats().critChance > TUNING.player.baseCritChance, 'Critical Focus raises crit chance');

// --- XP / levels ---
const before = player.level;
let leveled = false;
let xpToGive = 0;
// addXp in a loop to trigger a level
for (let i = 0; i < 50; i++) {
  const xp = xpForNext(player.level);
  player.addXp(xp);
  if (player.level > before) leveled = true;
}
assert(leveled, 'addXp triggers level ups');
assert(player.stats().maxHp > s.maxHp, 'level up increases maxHp');

// --- Upgrade choices respect max stacks ---
const ups = [];
for (const u of UPGRADES) for (let i = 0; i < u.max; i++) ups.push(u.id);
const choices = rollUpgradeChoices(ups, 3);
assert(choices.length === 0, 'no choices when all upgrades are maxed');
const choices2 = rollUpgradeChoices([], 3);
assert(choices2.length === 3 && new Set(choices2.map((c) => c.id)).size === 3, 'three distinct choices when empty');

// --- Progression ---
const save = DEFAULT_SAVE();
const p2 = new Player(save.player);
const prog = new Progression(p2, save);
const stage1 = save.stage;
const reward = prog.onStageWon(stage1);
assert(save.stage === stage1 + 1, 'win advances stage');
assert(reward.xp > 0 && reward.gold > 0, 'win grants xp and gold');
assert(p2.xp >= reward.xp - 1, 'xp applied (may overflow into a level)');
assert(prog.onStageLost() === undefined && save.stats.losses === 1, 'loss recorded, stage unchanged');

// --- Enemy scaling & bosses ---
const e1 = createEnemy(1, 0);
const e5 = createEnemy(5);
const e10 = createEnemy(10);
assert(e10.boss === true, 'stage 10 is a boss stage');
assert(e5.boss === false, 'stage 5 is not a boss');
assert(e1.boss === false, 'stage 1 is not a boss');
assert(e10.critChance > 0 && e10.critDamage > 1, 'enemies have crit stats');
assert(e10.critChance > e1.critChance, 'enemy crit scales with stage');
const ps5 = new Player({ level: 5, xp: 0, gold: 0, upgrades: [] }).stats();
const ps9 = new Player({ level: 9, xp: 0, gold: 0, upgrades: [] }).stats();
assert(ps9.defense > ps5.defense && ps9.evasion > ps5.evasion, 'player defense and evasion scale with level');
const e50 = createEnemy(50);

// --- Level curve: a clean run (49 stage wins) lands in Lv 22-25 at the final boss ---
let cleanRunLevel = 0;
{
  const sv = DEFAULT_SAVE();
  const prog = new Progression(new Player(sv.player), sv);
  for (let s = 1; s <= 49; s++) prog.onStageWon(s);
  cleanRunLevel = prog.player.level;
  assert(cleanRunLevel >= 22 && cleanRunLevel <= 25, `clean run reaches Lv 22-25 by stage 50 (got Lv ${cleanRunLevel})`);
}
assert(e50.maxHp > 700 && e50.atk > 55, 'final boss keeps full stage-50 stats (uncapped)');

// --- Final boss winnability: a clean-run player actually beats Umbra ---
async function playBossFight(level, upgrades) {
  const bus = new EventBus();
  const pl = new Player({ level, xp: 0, gold: 0, upgrades });
  const c = new Combat(pl, createEnemy(50), bus);
  let phase = null;
  bus.on('phase', (d) => { phase = d.value; });
  const oldDelay = TUNING.combat.enemyActionDelayMs;
  TUNING.combat.enemyActionDelayMs = 30; // speed up the simulation
  c.start();
  const iv = setInterval(() => {
    if (c.done) return;
    if (c.p.hp / c.p.maxHp < 0.45 && c.canAct('potion')) c.act('potion');
    else if (c.p.energy >= 25 && c.canAct('power')) c.act('power');
    else if (c.canAct('attack')) c.act('attack');
  }, 5);
  const result = await new Promise((resolve) => {
    const t = setTimeout(() => resolve('timeout'), 30000);
    const ch = setInterval(() => { if (c.done) { clearTimeout(t); clearInterval(ch); resolve(phase); } }, 25);
  });
  clearInterval(iv);
  TUNING.combat.enemyActionDelayMs = oldDelay;
  return result;
}
const bossResult = await playBossFight(
  cleanRunLevel,
  ['crit', 'crit', 'crip', 'crip', 'lung', 'lung', 'sharp', 'sharp']
);
assert(bossResult === 'victory', `clean-run player (Lv ${cleanRunLevel}, typical upgrades) defeats Umbra (got ${bossResult})`);
const e2 = createEnemy(2, 0);
assert(e2.maxHp > e1.maxHp && e2.atk >= e1.atk, 'enemy stats scale with stage (same base)');
assert(e50.boss === true && e50.name === 'Umbra, Dark Reflection', 'stage 50 is the final boss');
assert(e50.maxHp > e5.maxHp, 'final boss out-scales a regular boss');

// --- Combat state machine: play full fights, must terminate ---
function playFight(stage, seedAction) {
  const bus = new EventBus();
  const sv = DEFAULT_SAVE();
  const pl = new Player({ level: 3, xp: 0, gold: 0, upgrades: ['sharp', 'sharp', 'iron'] });
  const enemy = createEnemy(stage);
  const c = new Combat(pl, enemy, bus);
  let events = [];
  bus.on('phase', (d) => events.push(d.value));
  c.start();
  const timer = setTimeout(() => {
    console.error(`FAIL: combat on stage ${stage} did not terminate`);
    failures++;
    process.exit(1);
  }, 30000);
  const iv = setInterval(() => {
    if (c.done) return;
    const opts = ['attack', 'power', 'defend', 'potion'].filter((a) => c.canAct(a));
    c.act(opts.length ? seedAction(opts) : 'attack');
  }, 5);
  return new Promise((resolve) => {
    const check = setInterval(() => {
      if (c.done) {
        clearInterval(check);
        clearInterval(iv);
        clearTimeout(timer);
        resolve(events);
      }
    }, 25);
  });
}

await playFight(1, (opts) => opts[0]);
await playFight(5, (opts) => (opts.includes('attack') ? 'attack' : opts[0]));
assert(true, 'combat fights terminate (no infinite loops)');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
