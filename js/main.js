// App wiring: owns the save object, current stage, and routes game events
// (via the bus) to UI. Game modules never import UI; UI never imports game.
import { EventBus } from './core/events.js';
import { SaveStore, DEFAULT_SAVE } from './core/save.js';
import { Player } from './game/player.js';
import { Progression } from './game/progression.js';
import { createEnemy } from './game/enemies.js';
import { Combat } from './game/combat.js';
import { stackCount, xpForNext } from './game/upgrades.js';
import { Screens } from './ui/screens.js';
import { HUD } from './ui/hud.js';
import { Log } from './ui/log.js';

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
let pending = null; // set by a stage win until the player moves on

function persist() {
  save.player = player.serialize();
  store.save(save);
}

// --- Bus wiring ---
bus.on('log', (d) => log.append(d));
bus.on('state', (d) => hud.update(d));
bus.on('hit', (d) => hud.flash(d.target, d.crit));
bus.on('phase', (d) => {
  hud.setPhase(d.value);
  if (d.value === 'victory') onStageWon();
  if (d.value === 'defeat') onStageLost();
});

// --- Stage / combat lifecycle ---
function startStage(stage, startHp) {
  const enemy = createEnemy(stage);
  combat = new Combat(player, enemy, bus, startHp);
  screens.show('combat');
  log.clear();
  hud.setMeta({ stage, level: player.level, xpLabel: `${player.xp}/${xpForNext(player.level)} xp` });
  document.getElementById('btn-start').textContent = `Continue — Stage ${save.stage}`;
  combat.start();
}

function onStageWon() {
  const stage = save.stage;
  const reward = progression.onStageWon(stage);
  persist();
  log.append({
    text: `Victory! +${reward.xp} XP, +${reward.gold} gold.${reward.leveledUp ? ` LEVEL UP → ${player.level}!` : ''}`,
    kind: 'system',
  });
  pending = { victory: reward.victory, nextStage: reward.nextStage, healFrac: reward.healFrac };
  if (reward.leveledUp) {
    showLevelUp(reward.choices);
  } else if (reward.victory) {
    screens.show('victory');
  } else {
    setTimeout(() => {
      const startHp = Math.round(player.stats().maxHp * reward.healFrac);
      startStage(reward.nextStage, startHp);
    }, 1800);
  }
}

function onStageLost() {
  progression.onStageLost();
  persist();
  screens.show('gameover');
}

function continueAfterChoice() {
  if (!pending) return;
  const startHp = Math.round(player.stats().maxHp * pending.healFrac);
  const { victory, nextStage } = pending;
  if (victory) {
    screens.show('victory');
    return;
  }
  startStage(nextStage, startHp);
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
      <div class="emoji">${up.emoji}</div>
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

// --- Menu ---
function showMenu() {
  screens.show('menu');
  const s = save.stats;
  document.getElementById('menu-stats').innerHTML =
    `Hero Lv ${player.level} · Stage ${save.stage} · ${player.gold} gold<br>` +
    `Wins ${s.wins} · Losses ${s.losses} · Kills ${s.kills}`;
  const fresh = save.stage === 1 && player.level === 1 && player.upgrades.length === 0 && s.wins === 0;
  document.getElementById('btn-start').textContent = fresh ? 'Begin Campaign' : `Continue — Stage ${save.stage}`;
  document.getElementById('menu-hint').textContent =
    `Attack for energy, spend it on Power Strikes, Defend to halve incoming damage, Potion to heal.`;
}

// --- Button bindings ---
const $ = (id) => document.getElementById(id);
$('action-attack').addEventListener('click', () => combat?.act('attack'));
$('action-power').addEventListener('click', () => combat?.act('power'));
$('action-defend').addEventListener('click', () => combat?.act('defend'));
$('action-potion').addEventListener('click', () => combat?.act('potion'));

$('btn-start').addEventListener('click', () => startStage(save.stage));
$('btn-retry').addEventListener('click', () => startStage(save.stage));
$('btn-skip-levelup').addEventListener('click', () => continueAfterChoice());
$('btn-continue').addEventListener('click', () => startStage(save.stage));
$('btn-menu-1').addEventListener('click', showMenu);
$('btn-menu-2').addEventListener('click', showMenu);
$('btn-reset').addEventListener('click', () => {
  if (!confirm('Reset all progress?')) return;
  store.clear();
  save = DEFAULT_SAVE();
  player = new Player(save.player);
  progression.player = player;
  showMenu();
});

// Boot
showMenu();
