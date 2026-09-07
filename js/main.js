// App wiring: owns the save object, current stage, and routes game events
// (via the bus) to UI. Game modules never import UI; UI never imports game.
import { EventBus } from './core/events.js';
import { SaveStore } from './core/save.js';
import { Player } from './game/player.js';
import { Progression } from './game/progression.js';
import { createEnemy, KNOWN_ENEMY_IDS } from './game/enemies.js';
import { Combat } from './game/combat.js';
import { stackCount, xpForNext } from './game/upgrades.js';
import { SKILLS } from './game/skills.js';
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
  const name = ENV_TIERS[Math.floor((stage - 1) / 10) % ENV_TIERS.length];
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
      onStageWon();
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
function startStage(stage, startHp) {
  const enemy = createEnemy(stage);
  combat = new Combat(player, enemy, bus, save.skills);
  screens.show('combat');
  document.getElementById('skills-menu').classList.add('hidden');
  log.clear();
  setEnvironment(stage);
  hud.setMeta({ stage, level: player.level, xpLabel: `${player.xp}/${xpForNext(player.level)} xp` });
  combat.start();
}

function onStageWon() {
  const stage = save.stage;
  const reward = progression.onStageWon(stage);
  recordKill(save.bestiary, combat.enemy);
  persist();
  log.append({
    text: `Victory! +${reward.xp} XP, +${reward.gold} gold.${reward.leveledUp ? ` LEVEL UP to ${player.level}!` : ''}`,
    kind: 'system',
  });
  pending = reward;
  if (reward.leveledUp) {
    sfx.levelup();
    showLevelUp(reward.choices);
  } else {
    showStageEnd(reward, stage);
  }
}

function onStageLost() {
  progression.onStageLost();
  persist();
  sfx.defeat();
  screens.show('gameover');
}

// --- Stage-end screen (skill shop appears on stages ending in 5) ---
function isShopStage(stage) {
  return stage % 10 === 5;
}

function showStageEnd(reward, stage) {
  const $ = (id) => document.getElementById(id);
  $('stageend-title').textContent = reward.victory ? 'VICTORY!' : `Stage ${stage} Cleared!`;
  $('stageend-rewards').textContent = `+${reward.xp} XP  ·  +${reward.gold} gold  ·  ${reward.leveledUp ? 'leveled up' : `healed ${Math.round(reward.healFrac * 100)}%`}`;
  $('btn-next-stage').textContent = reward.victory ? 'Continue (Endless)' : 'Next Stage';
  const shop = isShopStage(stage);
  document.querySelector('#screen-stageend .shop').classList.toggle('hidden', !shop);
  $('shop-scene').classList.toggle('hidden', !shop);
  if (shop) renderShop();
  sfx.victory();
  screens.show('stageend');
}

function renderShop() {
  const $ = (id) => document.getElementById(id);
  const wrap = $('shop-items');
  wrap.textContent = '';
  $('shop-gold').textContent = `${player.gold} gold`;
  const forSale = SKILLS.filter((s) => s.kind === 'player' && !save.skills.includes(s.id));
  $('shop-empty').classList.toggle('hidden', forSale.length > 0);
  for (const sk of forSale) {
    const item = document.createElement('div');
    item.className = 'shop-item';
    const afford = player.gold >= sk.price;
    item.innerHTML = `
      <div>
        <div class="s-name">${sk.name} <span style="color:var(--muted);font-weight:400">× ${sk.uses}/battle</span></div>
        <div class="s-desc">${sk.desc}</div>
      </div>
      <button class="btn" ${afford ? '' : 'disabled'}>${sk.price} gold</button>`;
    item.querySelector('button').addEventListener('click', () => {
      if (player.gold < sk.price) return;
      player.gold -= sk.price;
      save.skills.push(sk.id);
      persist();
      sfx.ui();
      renderShop();
    });
    wrap.appendChild(item);
  }
}

function continueAfterChoice() {
  if (!pending) return;
  sfx.ui();
  showStageEnd(pending, save.stage - 1);
}

// --- Level-up screen ---
function showLevelUp(choices) {
  screens.show('levelup');
  document.getElementById('levelup-title').textContent = `Level Up! (Lv ${player.level})`;
  const wrap = document.getElementById('upgrade-cards');
  wrap.textContent = '';
  for (const up of choices) {
    const card = document.createElement('div');
    card.className = 'card';
    const have = stackCount(player.upgrades, up.id);
    card.innerHTML = `
      <div class="name">${up.name}</div>
      <div class="desc">${up.desc}</div>
      <div class="stacks">${have}/${up.max} stacks taken</div>`;
    card.addEventListener('click', () => {
      player.applyUpgrade(up.id);
      persist();
      continueAfterChoice();
    });
    wrap.appendChild(card);
  }
}

// --- Skills dropdown (in-combat) ---
function toggleSkillsMenu() {
  const menu = document.getElementById('skills-menu');
  const btn = document.getElementById('action-skills');
  const state = hud.lastState;
  if (menu.classList.contains('hidden')) {
    menu.textContent = '';
    const owned = SKILLS.filter((s) => s.kind === 'player' && save.skills.includes(s.id));
    if (owned.length === 0) {
      const none = document.createElement('button');
      none.className = 'skill-item';
      none.disabled = true;
      none.textContent = 'No skills — buy some in the shop';
      menu.appendChild(none);
    }
    for (const sk of owned) {
      const uses = state?.player?.skills?.[sk.id] ?? 0;
      const item = document.createElement('button');
      item.className = 'skill-item';
      item.disabled = uses <= 0;
      item.innerHTML = `<strong>${sk.name}</strong> (${uses} left)<span class="s-desc">${sk.desc}</span>`;
      item.addEventListener('click', () => {
        menu.classList.add('hidden');
        combat?.act('skill', sk.id);
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
  document.getElementById('menu-stats').innerHTML =
    `Hero Lv ${player.level} · Stage ${save.stage} · ${player.gold} gold<br>` +
    `Wins ${s.wins} · Losses ${s.losses} · Kills ${s.kills} · Skills ${save.skills.length}/${SKILLS.filter((x) => x.kind === 'player').length}`;
  document.getElementById('btn-sound').textContent = `Sound: ${isMuted() ? 'Off' : 'On'}`;
  const fresh = save.stage === 1 && player.level === 1 && player.upgrades.length === 0 && s.wins === 0;
  document.getElementById('btn-start').textContent = fresh ? 'Begin Campaign' : `Continue — Stage ${save.stage}`;
  document.getElementById('menu-hint').textContent =
    'Attack (blunt) and Power Strike (slash) have different type matchups — check the Bestiary. Buy skills in the shop.';
}

// --- Button bindings ---
const $ = (id) => document.getElementById(id);
$('action-attack').addEventListener('click', () => combat?.act('attack'));
$('action-power').addEventListener('click', () => combat?.act('power'));
$('action-defend').addEventListener('click', () => combat?.act('defend'));
$('action-potion').addEventListener('click', () => combat?.act('potion'));
$('action-skills').addEventListener('click', () => {
  if (combat && !combat.busy && !combat.done) toggleSkillsMenu();
});

$('btn-start').addEventListener('click', () => startStage(save.stage));
$('btn-retry').addEventListener('click', () => startStage(save.stage));
$('btn-skip-levelup').addEventListener('click', () => continueAfterChoice());
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
$('btn-menu-1').addEventListener('click', showMenu);
$('btn-menu-2').addEventListener('click', showMenu);
$('btn-menu-3').addEventListener('click', showMenu);
$('btn-menu-4').addEventListener('click', showMenu);
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
  progression.player = player;
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
  'enemy-1': (c) => { c.e.hp = 1; c.enemy.hp = 1; },
  'player-1': (c) => { c.p.hp = 1; },
  'heal-both': (c) => { c.p.hp = c.p.maxHp; c.e.hp = c.e.maxHp; },
  'potion': (c) => { c.p.potions += 1; },
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
