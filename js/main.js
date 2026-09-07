// App wiring: owns the save object, current stage, and routes game events
// (via the bus) to UI. Game modules never import UI; UI never imports game.
import { EventBus } from './core/events.js';
import { SaveStore } from './core/save.js';
import { Player } from './game/player.js';
import { Progression } from './game/progression.js';
import { createEnemy, KNOWN_ENEMY_IDS } from './game/enemies.js';
import { Combat } from './game/combat.js';
import { stackCount, xpForNext, UPGRADES } from './game/upgrades.js';
import { SKILL_MAP } from './game/skills.js';
import { TUNING } from './config/tuning.js';
import { recordKill } from './game/bestiary.js';
import { Screens } from './ui/screens.js';
import { HUD } from './ui/hud.js';
import { Log } from './ui/log.js';
import { sfx, setMuted, isMuted } from './core/audio.js';

const store = new SaveStore();
const bus = new EventBus();
const screens = new Screens(document.getElementById('app'));
const hud = new HUD();
const log = new Log(document.getElementById('log'));

// --- Mutable app state (module-local; no globals) ---
let save = store.load();
let player = new Player(save.player);
const progression = new Progression(player, save);
let combat = null;
let pending = null; // stage reward, held until the player moves on

// Environments: 5 biomes of 10 stages each (bosses fight in their own tier's
// environment; past stage 50 the cycle repeats in endless mode).
const ENV_TIERS = ['forest', 'cavern', 'arena', 'walkway', 'darkcastle'];
function setEnvironment(stage) {
  const name = stage <= TUNING.stage.victoryStage
    ? ENV_TIERS[Math.floor((stage - 1) / 10) % ENV_TIERS.length]
    : ENV_TIERS[4];
  document.getElementById('battlefield').style.backgroundImage =
    `url('assets/bg/${name}.png')`;
}

function persist() {
  save.player = player.serialize();
  store.save(save);
}

// --- Bus wiring ---
bus.on('log', (d) => log.append(d));
bus.on('state', (d) => hud.update(d));
bus.on('hit', (d) => {
  if (d.target === 'enemy') sfx[d.crit ? 'crit' : 'hit']();
  hud.flash(d.target, d.crit);
});
bus.on('sfx', (d) => sfx[d.name]?.());
bus.on('phase', (d) => {
  hud.setPhase(d.value);
  if (d.value === 'victory') {
    hud.playDeath(); // kill feedback before the screen change
    setTimeout(() => {
      hud.stopDeath();
      onStageWon(d.bonus ?? null);
    }, 1000);
  }
  if (d.value === 'defeat') {
    hud.playDeath('player'); // fade out before the game-over screen
    setTimeout(() => {
      hud.stopDeath('player');
      onStageLost();
    }, 1000);
  }
});

// --- Stage / combat lifecycle ---
function startStage(stage) {
  const enemy = createEnemy(stage);
  combat = new Combat(player, enemy, bus, player.currentHp, player.currentEnergy);
  screens.show('combat');
  document.getElementById('skills-menu').classList.add('hidden');
  document.getElementById('items-menu').classList.add('hidden');
  log.clear();
  setEnvironment(stage);
  hud.setMeta({ stage, level: player.level, xpLabel: `${player.xp}/${xpForNext(player.level)} xp` });
  combat.start();
}

function onStageWon(bonus) {
  const stage = save.stage;
  // HP and energy carry over between battles — no win or level-up restoration.
  player.currentHp = combat.p.hp;
  player.currentEnergy = combat.p.energy;
  const reward = progression.onStageWon(stage, bonus);
  recordKill(save.bestiary, combat.enemy);
  persist();
  log.append({
    text: `Victory! +${reward.xp} XP, +${reward.gold} gold.${reward.leveledUp ? ` LEVEL UP to ${player.level}!` : ''}`,
    kind: 'system',
  });
  pending = reward;
  if (reward.leveledUp && reward.learnedSkill) {
    sfx.levelup();
    showLevelUp(reward);
  } else {
    showStageEnd(reward, stage);
  }
}

function onStageLost() {
  // Defeat ends the run — there is no stage retry.
  progression.onStageLost();
  persist();
  sfx.defeat();
  screens.show('gameover');
}

// New run: the campaign restarts at stage 1 (full HP/energy); progression
// (level, gold, upgrades, skills, items) is kept.
function newRun() {
  save.stage = 1;
  player.currentHp = null;
  player.currentEnergy = null;
  persist();
  sfx.ui();
  startStage(1);
}

// --- Stage-end screen (shop appears on stages ending in 5) ---
function isShopStage(stage) {
  return stage % 10 === 5;
}

function showStageEnd(reward, stage) {
  const $ = (id) => document.getElementById(id);
  $('stageend-title').textContent = reward.victory ? 'VICTORY!' : `Stage ${stage} Cleared!`;
  $('stageend-rewards').textContent = `+${reward.xp} XP  ·  +${reward.gold} gold`;
  $('btn-next-stage').textContent = reward.victory ? 'Continue (Endless)' : 'Next Stage';
  const shop = isShopStage(stage);
  document.querySelector('#screen-stageend .shop').classList.toggle('hidden', !shop);
  $('shop-scene').classList.toggle('hidden', !shop);
  if (shop) renderShop();
  sfx.victory();
  screens.show('stageend');
}

function itemPrice(id, stage) {
  const def = TUNING.shop.items[id];
  return def.priceBase + def.perStage * stage;
}

function renderShop() {
  const $ = (id) => document.getElementById(id);
  const stage = save.stage - 1; // the stage just cleared
  const wrap = $('shop-items');
  wrap.textContent = '';
  $('shop-gold').textContent = `${player.gold} gold`;

  // Bed: full restore, scaling cost.
  const bed = TUNING.shop.bed;
  const bedCost = bed.base + bed.perStage * stage;
  const bedBtn = $('shop-bed-btn');
  bedBtn.textContent = `${bedCost} gold`;
  bedBtn.disabled = player.gold < bedCost;
  bedBtn.onclick = () => {
    if (player.gold < bedCost) return;
    player.gold -= bedCost;
    player.fullRestore();
    persist();
    sfx.ui();
    renderShop();
  };

  // Items (single-use, consumed in battle).
  for (const id of ['potion', 'vial', 'elixir']) {
    const def = TUNING.shop.items[id];
    const price = itemPrice(id, stage);
    const item = document.createElement('div');
    item.className = 'shop-item';
    item.innerHTML = `
      <div>
        <div class="s-name">${def.name} <span style="color:var(--muted);font-weight:400">owned × ${player.items[id] ?? 0}</span></div>
        <div class="s-desc">${def.desc}</div>
      </div>
      <button class="btn" ${player.gold >= price ? '' : 'disabled'}>${price} gold</button>`;
    item.querySelector('button').addEventListener('click', () => {
      if (player.gold < price) return;
      player.gold -= price;
      player.addItem(id);
      persist();
      sfx.ui();
      renderShop();
    });
    wrap.appendChild(item);
  }

  // Upgrades (permanent, stackable).
  const uwrap = $('shop-upgrades');
  uwrap.textContent = '';
  for (const up of UPGRADES) {
    const have = stackCount(player.upgrades, up.id);
    const maxed = have >= up.maxStacks;
    const item = document.createElement('div');
    item.className = 'shop-item';
    item.innerHTML = `
      <div>
        <div class="s-name">${up.name} <span style="color:var(--muted);font-weight:400">${have}/${up.maxStacks} stacks</span></div>
        <div class="s-desc">${up.desc}</div>
      </div>
      <button class="btn" ${maxed || player.gold < up.price ? 'disabled' : ''}>${maxed ? 'MAX' : `${up.price} gold`}</button>`;
    item.querySelector('button').addEventListener('click', () => {
      if (maxed || player.gold < up.price) return;
      player.gold -= up.price;
      player.applyUpgrade(up.id);
      persist();
      sfx.ui();
      renderShop();
    });
    uwrap.appendChild(item);
  }
}

function continueAfterChoice() {
  if (!pending) return;
  sfx.ui();
  showStageEnd(pending, save.stage - 1);
}

// --- Level-up screen: stat gains + a new skill (learn or replace) ---
function showLevelUp(reward) {
  screens.show('levelup');
  const $ = (id) => document.getElementById(id);
  const g = reward.gain ?? { attack: 0, defense: 0, magic: 0, maxHp: 0 };
  $('levelup-title').textContent = `Level Up! (Lv ${player.level})`;
  $('levelup-sub').textContent = 'Your stats increased:';
  $('levelup-gain').textContent = `+${g.attack} Attack  ·  +${g.defense} Defense  ·  +${g.magic} Magic  ·  +${g.maxHp} Max HP`;

  const sk = reward.learnedSkill;
  $('levelup-skill').innerHTML = `
    <div class="name">Learned: ${sk.name}</div>
    <div class="desc">${sk.desc} — ${sk.cost} energy</div>`;

  const replaceWrap = $('levelup-replace');
  const skipBtn = $('btn-levelup-skip');
  if (reward.needsReplace) {
    replaceWrap.classList.remove('hidden');
    skipBtn.classList.remove('hidden');
    const cards = $('levelup-replace-cards');
    cards.textContent = '';
    for (const oldId of player.skills) {
      const old = SKILL_MAP[oldId];
      const card = document.createElement('button');
      card.className = 'card';
      card.innerHTML = `<div class="name">Replace ${old.name}</div><div class="desc">${old.desc}</div>`;
      card.addEventListener('click', () => {
        player.replaceSkill(oldId, sk.id);
        persist();
        continueAfterChoice();
      });
      cards.appendChild(card);
    }
  } else {
    replaceWrap.classList.add('hidden');
    skipBtn.classList.add('hidden');
  }
}

// --- Skills dropdown (in-combat) ---
function toggleSkillsMenu() {
  const menu = document.getElementById('skills-menu');
  const state = hud.lastState;
  if (menu.classList.contains('hidden')) {
    menu.textContent = '';
    for (const id of player.skills) {
      const sk = SKILL_MAP[id];
      const afford = (state?.player?.energy ?? 0) >= sk.cost;
      const item = document.createElement('button');
      item.className = 'skill-item';
      item.disabled = !afford;
      item.innerHTML = `<strong>${sk.name}</strong> (${sk.cost} energy)<span class="s-desc">${sk.desc}</span>`;
      item.addEventListener('click', () => {
        menu.classList.add('hidden');
        combat?.act('skill', id);
      });
      menu.appendChild(item);
    }
    menu.classList.remove('hidden');
  } else {
    menu.classList.add('hidden');
  }
}

// --- Items dropdown (in-combat) ---
function toggleItemsMenu() {
  const menu = document.getElementById('items-menu');
  const state = hud.lastState;
  if (menu.classList.contains('hidden')) {
    menu.textContent = '';
    for (const id of ['potion', 'vial', 'elixir']) {
      const def = TUNING.shop.items[id];
      const count = state?.player?.items?.[id] ?? 0;
      const item = document.createElement('button');
      item.className = 'skill-item';
      item.disabled = count <= 0;
      item.innerHTML = `<strong>${def.name}</strong> (× ${count})<span class="s-desc">${def.desc}</span>`;
      item.addEventListener('click', () => {
        menu.classList.add('hidden');
        combat?.act('item', id);
      });
      menu.appendChild(item);
    }
    menu.classList.remove('hidden');
  } else {
    menu.classList.add('hidden');
  }
}

// --- Bestiary screen ---
function showBestiary() {
  const $ = (id) => document.getElementById(id);
  const grid = $('bestiary-grid');
  grid.textContent = '';
  for (const id of KNOWN_ENEMY_IDS) {
    const entry = save.bestiary[id];
    const card = document.createElement('div');
    if (entry) {
      card.className = 'bestiary-card';
      card.innerHTML = `
        <div class="b-head">
          <img src="assets/sprites/${entry.sprite}.svg" alt="">
          <div>
            <div class="b-name">${entry.name}</div>
            <div class="b-type">${entry.type}</div>
          </div>
        </div>
        <div class="b-line">Skills: ${entry.skills.length ? entry.skills.join(', ') : 'none'}</div>
        <div class="b-line">Weak to: ${entry.weakness}</div>
        <div class="b-line">Element: ${entry.element || '—'}</div>
        <div class="b-line">Kills: ${entry.kills}</div>`;
    } else {
      card.className = 'bestiary-card undiscovered';
      card.innerHTML = `<div class="b-name">???</div><div class="b-line">Undiscovered</div>`;
    }
    grid.appendChild(card);
  }
  screens.show('bestiary');
}

// --- Menu ---
function showMenu() {
  screens.show('menu');
  const s = save.stats;
  const totalItems = player.items.potion + player.items.vial + player.items.elixir;
  document.getElementById('menu-stats').innerHTML =
    `Hero Lv ${player.level} · Stage ${save.stage} · ${player.gold} gold<br>` +
    `Wins ${s.wins} · Losses ${s.losses} · Kills ${s.kills} · Skills ${player.skills.length}/4 · Items ${totalItems}`;
  document.getElementById('btn-sound').textContent = `Sound: ${isMuted() ? 'Off' : 'On'}`;
  const fresh = save.stage === 1 && player.level === 1 && player.upgrades.length === 0 && s.wins === 0;
  document.getElementById('btn-start').textContent = fresh ? 'Begin Campaign' : `Continue — Stage ${save.stage}`;
  document.getElementById('menu-hint').textContent =
    'Skills are learned on level-up (max 4). Items are bought in the shop and consumed in battle. Magic is your max energy; energy regens 10/turn. HP and energy carry over between battles — sleep in a shop bed to restore both.';
}

// --- Button bindings ---
const $ = (id) => document.getElementById(id);
$('action-attack').addEventListener('click', () => combat?.act('attack'));
$('action-guard').addEventListener('click', () => combat?.act('guard'));
$('action-skills').addEventListener('click', () => {
  if (combat && !combat.busy && !combat.done) toggleSkillsMenu();
});
$('action-items').addEventListener('click', () => {
  if (combat && !combat.busy && !combat.done) toggleItemsMenu();
});

$('btn-start').addEventListener('click', () => startStage(save.stage));
$('btn-new-run').addEventListener('click', () => newRun());
$('btn-levelup-continue').addEventListener('click', () => continueAfterChoice());
$('btn-levelup-skip').addEventListener('click', () => continueAfterChoice());
$('btn-next-stage').addEventListener('click', () => {
  if (pending?.victory && !save.victorySeen) {
    save.victorySeen = true;
    persist();
    screens.show('victory');
  } else {
    startStage(save.stage);
  }
});
$('btn-continue').addEventListener('click', () => startStage(save.stage));
$('btn-menu-1').addEventListener('click', () => showMenu());
$('btn-menu-2').addEventListener('click', () => showMenu());
$('btn-menu-3').addEventListener('click', () => showMenu());
$('btn-menu-4').addEventListener('click', () => showMenu());
$('btn-bestiary').addEventListener('click', showBestiary);
$('btn-sound').addEventListener('click', () => {
  setMuted(!isMuted());
  showMenu();
});
$('btn-reset').addEventListener('click', () => {
  if (!confirm('Reset all progress?')) return;
  store.clear();
  save = store.load();
  player = new Player(save.player);
  // Re-point progression at the new save object (it holds the stage writes).
  progression.player = player;
  progression.save = save;
  showMenu();
});

// --- Hidden debug mode (Konami code) ---
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
let konamiIndex = 0;
const debugPanel = document.getElementById('debug-panel');
window.addEventListener('keydown', (e) => {
  konamiIndex = e.code === KONAMI[konamiIndex] ? konamiIndex + 1 : (e.code === KONAMI[0] ? 1 : 0);
  if (konamiIndex === KONAMI.length) {
    konamiIndex = 0;
    debugPanel.classList.remove('hidden');
  }
  if (e.code === 'Escape') debugPanel.classList.add('hidden');
});
function blankBuffs() { return { damage: null, defense: null, hit: null, dot: null }; }
const DBG_ACTIONS = {
  'enemy-1': (c) => { c.e.hp = 1; },
  'player-1': (c) => { c.p.hp = 1; },
  'heal-both': (c) => { c.p.hp = c.p.maxHp; c.e.hp = c.e.maxHp; },
  'potion': (c) => { c.p.items.potion += 1; },
  'buff-p-dmg': (c) => { c.p.buffs.damage = { bonus: 0.5, turns: 3 }; },
  'buff-p-hit': (c) => { c.p.buffs.hit = { bonus: 0.3, turns: 3 }; },
  'buff-p-def': (c) => { c.p.buffs.defense = { bonus: 0.5, turns: 3 }; },
  'dot-p': (c) => { c.p.buffs.dot = { amount: 5, turns: 3 }; },
  'buff-e-dmg': (c) => { c.e.buffs.damage = { bonus: 0.4, turns: 3 }; },
  'buff-e-def': (c) => { c.e.buffs.defense = { bonus: 0.5, turns: 3 }; },
  'defend': (c) => { c.p.defending = true; c.e.defending = true; },
  'clear-buffs': (c) => { c.p.buffs = blankBuffs(); c.e.buffs = blankBuffs(); },
};
document.querySelectorAll('#debug-panel [data-dbg]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const c = combat;
    if (!c || c.done || c.busy) return;
    const fn = DBG_ACTIONS[btn.dataset.dbg];
    if (!fn) return;
    fn(c);
    c.pushState();
  });
});

// Boot
showMenu();
