// Turn-based combat state machine. Pure game logic: talks to UI only via
// the EventBus (contract in core/events.js). No DOM access here.
import { TUNING } from '../config/tuning.js';
import { rollIntent, INTENT_LABELS } from './enemies.js';
import { chance } from '../core/rng.js';

export class Combat {
  constructor(player, enemy, bus, startHp) {
    this.bus = bus;
    this.player = player;
    this.enemy = { ...enemy };
    this.done = false;
    this.busy = false;

    const s = player.stats();
    this.p = {
      hp: startHp ?? s.maxHp,
      maxHp: s.maxHp,
      energy: Math.round(s.maxEnergy / 2),
      maxEnergy: s.maxEnergy,
      potions: player.potionsForStage(enemy.stage),
      defending: false,
    };
    this.e = {
      hp: this.enemy.hp,
      maxHp: this.enemy.maxHp,
      charging: false,
      defending: false,
      intent: 'attack',
    };
  }

  start() {
    this.e.intent = rollIntent();
    this.bus.emit('log', { text: `A ${this.enemy.boss ? 'boss: ' : ''}${this.enemy.name} appears (stage ${this.enemy.stage})`, kind: 'system' });
    this.pushState();
    this.bus.emit('phase', { value: 'player' });
  }

  // Player action ids: 'attack' | 'power' | 'defend' | 'potion'
  canAct(action) {
    if (this.done || this.busy) return false;
    if (action === 'power' && this.p.energy < TUNING.combat.powerStrike.cost) return false;
    if (action === 'potion' && this.p.potions <= 0) return false;
    return true;
  }

  act(action) {
    if (!this.canAct(action)) return;
    this.busy = true;
    const s = this.player.stats();

    if (action === 'attack' || action === 'power') {
      const mult = action === 'power' ? TUNING.combat.powerStrike.multiplier : 1;
      if (action === 'power') this.p.energy -= TUNING.combat.powerStrike.cost;
      const { dmg, crit } = this.dealToEnemy(s, mult);
      this.bus.emit('log', { text: crit ? `CRITICAL! You hit for ${dmg}.` : `You hit for ${dmg}.`, kind: 'player' });
      this.bus.emit('hit', { target: 'enemy', crit });
      this.p.energy = Math.min(this.p.energy + s.attackEnergy, this.p.maxEnergy);
    } else if (action === 'defend') {
      this.p.defending = true;
      this.p.energy = Math.min(this.p.energy + TUNING.combat.defendEnergyGain, this.p.maxEnergy);
      this.bus.emit('log', { text: 'You brace for the next attack.', kind: 'player' });
    } else if (action === 'potion') {
      this.p.potions -= 1;
      const heal = Math.round(this.p.maxHp * s.potionHeal);
      const before = this.p.hp;
      this.p.hp = Math.min(this.p.maxHp, this.p.hp + heal);
      this.bus.emit('log', { text: `You drink a potion and recover ${this.p.hp - before} HP.`, kind: 'player' });
    }
    this.pushState();

    if (this.e.hp <= 0) return this.finish(true);
    // Enemy turn, then back to the player.
    this.bus.emit('phase', { value: 'enemy' });
    setTimeout(() => this.enemyTurn(), TUNING.combat.enemyActionDelayMs);
  }

  // Returns { dmg, crit } after enemy defense/crit math.
  dealToEnemy(s, mult) {
    const variance = 1 + (Math.random() * 2 - 1) * TUNING.combat.damageVariance;
    let dmg = Math.max(1, Math.round(s.attack * mult * variance));
    const crit = chance(s.critChance);
    if (crit) dmg = Math.round(dmg * s.critDamage);
    if (this.e.defending) {
      dmg = Math.round(dmg * (1 - TUNING.combat.enemyDefendReduction));
      this.e.defending = false;
    }
    this.e.hp = Math.max(0, this.e.hp - dmg);
    return { dmg, crit };
  }

  enemyTurn() {
    const intent = this.e.intent;
    this.e.intent = rollIntent();
    const charged = this.e.charging;
    this.e.charging = false;

    if (intent === 'defend') {
      this.e.defending = true;
      this.bus.emit('log', { text: `${this.enemy.name} raises its guard.`, kind: 'enemy' });
    } else {
      const mult = (intent === 'charge' ? TUNING.combat.enemyChargeMultiplier : 1) * (charged ? TUNING.combat.enemyChargeMultiplier : 1);
      const variance = 1 + (Math.random() * 2 - 1) * TUNING.combat.damageVariance;
      let dmg = Math.max(1, Math.round(this.enemy.atk * mult * variance));
      if (this.p.defending) {
        dmg = Math.round(dmg * (1 - TUNING.combat.defendReduction));
        this.p.defending = false;
      }
      this.p.hp = Math.max(0, this.p.hp - dmg);
      this.bus.emit('log', { text: `${this.enemy.name} hits you for ${dmg}.`, kind: 'enemy' });
      this.bus.emit('hit', { target: 'player', crit: false });
    }
    this.pushState();

    if (this.p.hp <= 0) return this.finish(false);
    this.busy = false;
    this.bus.emit('phase', { value: 'player' });
  }

  finish(playerWon) {
    this.done = true;
    this.busy = false;
    this.bus.emit('phase', { value: playerWon ? 'victory' : 'defeat' });
    if (playerWon) {
      this.bus.emit('log', { text: `${this.enemy.name} is defeated!`, kind: 'system' });
    } else {
      this.bus.emit('log', { text: 'You have fallen...', kind: 'system' });
    }
  }

  pushState() {
    this.bus.emit('state', {
      player: {
        hp: this.p.hp,
        maxHp: this.p.maxHp,
        energy: this.p.energy,
        maxEnergy: this.p.maxEnergy,
        potions: this.p.potions,
        defending: this.p.defending,
      },
      enemy: {
        name: this.enemy.name,
        sprite: this.enemy.sprite,
        hp: this.e.hp,
        maxHp: this.e.maxHp,
        intent: this.e.intent,
        intentLabel: INTENT_LABELS[this.e.intent],
        charging: this.e.charging,
        boss: this.enemy.boss,
      },
    });
  }
}
