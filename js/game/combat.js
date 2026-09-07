// Turn-based combat state machine. Pure game logic: talks to UI only via
// the EventBus (contract in core/events.js). No DOM access here.
//
// Extra events (see core/events.js):
//   'sfx'  { name: 'miss'|'defend'|'potion'|'skill'|'hurt' }
//   state payload also carries: player.hit, player.evasion, player.buffs,
//   player.skills (id -> uses left), enemy.evasion, enemy.armor, enemy.buffs
import { TUNING } from '../config/tuning.js';
import { rollIntent, INTENT_LABELS, TYPES } from './enemies.js';
import { SKILL_MAP } from './skills.js';
import { chance } from '../core/rng.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function freshBuffs() {
  return { damage: null, defense: null, hit: null, dot: null };
}

export class Combat {
  constructor(player, enemy, bus, ownedSkillIds = []) {
    this.bus = bus;
    this.player = player;
    this.enemy = { ...enemy };
    this.done = false;
    this.busy = false;

    const s = player.stats();
    this.p = {
      hp: s.maxHp,
      maxHp: s.maxHp,
      energy: Math.round(s.maxEnergy / 2),
      maxEnergy: s.maxEnergy,
      potions: player.potionsForStage(enemy.stage),
      defending: false,
      buffs: freshBuffs(),
      skillUses: {},
    };
    for (const id of ownedSkillIds) {
      const sk = SKILL_MAP[id];
      if (sk && sk.kind === 'player') this.p.skillUses[id] = sk.uses;
    }
    this.e = {
      hp: this.enemy.hp,
      maxHp: this.enemy.maxHp,
      charging: false,
      defending: false,
      intent: 'attack',
      buffs: freshBuffs(),
      skillCooldown: 0,
    };
    this.eHit = Math.min(
      TUNING.enemyAi.enemyHitBase + TUNING.enemyAi.enemyHitPerStage * (enemy.stage - 1),
      0.9
    );
  }

  start() {
    this.rollEnemyIntent();
    this.bus.emit('log', { text: `A ${this.enemy.boss ? 'boss: ' : ''}${this.enemy.name} (${this.enemy.typeLabel}) appears (stage ${this.enemy.stage})`, kind: 'system' });
    this.pushState();
    this.bus.emit('phase', { value: 'player' });
  }

  rollEnemyIntent() {
    const canSkill = this.enemy.skills.length > 0 && this.e.skillCooldown <= 0;
    this.e.intent = rollIntent(canSkill);
  }

  // Player action ids: 'attack' | 'power' | 'defend' | 'potion' | 'skill'
  canAct(action, skillId) {
    if (this.done || this.busy) return false;
    if (action === 'power' && this.p.energy < TUNING.combat.powerStrike.cost) return false;
    if (action === 'potion' && this.p.potions <= 0) return false;
    if (action === 'skill' && !(this.p.skillUses[skillId] > 0)) return false;
    return true;
  }

  act(action, skillId) {
    if (!this.canAct(action, skillId)) return;
    this.busy = true;
    const s = this.player.stats();

    if (action === 'attack' || action === 'power') {
      const mult = action === 'power' ? TUNING.combat.powerStrike.multiplier : 1;
      if (action === 'power') this.p.energy -= TUNING.combat.powerStrike.cost;
      const typeKey = action === 'power' ? 'slash' : 'blunt';
      const typeMult = TYPES[this.enemy.type][typeKey];
      const hitChance = clamp(s.hit + (this.p.buffs.hit?.bonus ?? 0) - this.enemy.evasion, 0.05, 0.98);
      if (chance(1 - hitChance)) {
        this.bus.emit('log', { text: 'You miss!', kind: 'player' });
        this.bus.emit('sfx', { name: 'miss' });
      } else {
        const { dmg, crit } = this.dealToEnemy(s, mult * typeMult);
        this.bus.emit('log', { text: `${crit ? 'CRITICAL! ' : ''}You hit for ${dmg}${typeMult > 1 ? ' (weakness!)' : typeMult < 1 ? ' (resisted)' : ''}.`, kind: 'player' });
        this.bus.emit('hit', { target: 'enemy', crit });
        this.p.energy = Math.min(this.p.energy + s.attackEnergy, this.p.maxEnergy);
      }
    } else if (action === 'defend') {
      this.p.defending = true;
      this.p.energy = Math.min(this.p.energy + TUNING.combat.defendEnergyGain, this.p.maxEnergy);
      this.bus.emit('log', { text: 'You brace for the next attack.', kind: 'player' });
      this.bus.emit('sfx', { name: 'defend' });
    } else if (action === 'potion') {
      this.p.potions -= 1;
      const heal = Math.round(this.p.maxHp * s.potionHeal);
      const before = this.p.hp;
      this.p.hp = Math.min(this.p.maxHp, this.p.hp + heal);
      this.bus.emit('log', { text: `You drink a potion and recover ${this.p.hp - before} HP.`, kind: 'player' });
      this.bus.emit('sfx', { name: 'potion' });
    } else if (action === 'skill') {
      this.p.skillUses[skillId] -= 1;
      this.useSkill(this.p.buffs, this.p, this.enemy, skillId, 'player');
    }
    this.pushState();

    if (this.e.hp <= 0) return this.finish(true);
    // Enemy turn, then back to the player.
    this.bus.emit('phase', { value: 'enemy' });
    setTimeout(() => this.enemyTurn(), TUNING.combat.enemyActionDelayMs);
  }

  useSkill(buffs, side, opponent, skillId, who) {
    const sk = SKILL_MAP[skillId];
    const eff = sk.effect;
    if (eff.damage) buffs.damage = { bonus: eff.damage.bonus, turns: eff.damage.turns };
    if (eff.defense) buffs.defense = { bonus: eff.defense.bonus, turns: eff.defense.turns };
    if (eff.hit) buffs.hit = { bonus: eff.hit.bonus, turns: eff.hit.turns };
    if (eff.dot) opponent.buffs.dot = { amount: eff.dot.amount, turns: eff.dot.turns };
    if (eff.heal) {
      side.hp = Math.min(side.maxHp, side.hp + Math.round(side.maxHp * eff.heal));
    }
    this.bus.emit('log', {
      text: `${who === 'player' ? 'You' : this.enemy.name} use${who === 'player' ? '' : 's'} ${sk.name}!`,
      kind: who === 'player' ? 'player' : 'enemy',
    });
    this.bus.emit('sfx', { name: 'skill' });
  }

  // Returns { dmg, crit } after type/armor/defense/crit math.
  dealToEnemy(s, mult) {
    const variance = 1 + (Math.random() * 2 - 1) * TUNING.combat.damageVariance;
    let dmg = Math.max(1, Math.round(s.attack * mult * variance * (1 + (this.p.buffs.damage?.bonus ?? 0))));
    const crit = chance(s.critChance);
    if (crit) dmg = Math.round(dmg * s.critDamage);
    const defendMult = 1 - Math.max(
      this.e.defending ? TUNING.combat.enemyDefendReduction : 0,
      this.e.buffs.defense?.bonus ?? 0
    );
    dmg = Math.max(1, Math.round(dmg * defendMult) - this.enemy.armor);
    this.e.hp = Math.max(0, this.e.hp - dmg);
    if (this.e.defending) this.e.defending = false;
    return { dmg, crit };
  }

  enemyTurn() {
    const intent = this.e.intent;
    this.rollEnemyIntent();
    if (this.e.skillCooldown > 0) this.e.skillCooldown -= 1;
    const charged = this.e.charging;
    this.e.charging = false;

    if (intent === 'defend') {
      this.e.defending = true;
      this.bus.emit('log', { text: `${this.enemy.name} raises its guard.`, kind: 'enemy' });
    } else if (intent === 'skill') {
      this.useSkill(this.e.buffs, this.e, this.p, this.enemy.skills[0], 'enemy');
      this.e.skillCooldown = 3;
    } else {
      const mult =
        (intent === 'charge' ? TUNING.combat.enemyChargeMultiplier : 1) *
        (charged ? TUNING.combat.enemyChargeMultiplier : 1);
      const variance = 1 + (Math.random() * 2 - 1) * TUNING.combat.damageVariance;
      let dmg = Math.max(1, Math.round(this.enemy.atk * mult * variance * (1 + (this.e.buffs.damage?.bonus ?? 0))));
      const hitChance = clamp(this.eHit + (this.e.buffs.hit?.bonus ?? 0) - TUNING.enemyAi.playerEvasion, 0.05, 0.95);
      if (chance(1 - hitChance)) {
        this.bus.emit('log', { text: `${this.enemy.name} misses!`, kind: 'enemy' });
        this.bus.emit('sfx', { name: 'miss' });
      } else {
        const defending = this.p.defending;
        const defendMult = 1 - Math.max(
          defending ? TUNING.combat.defendReduction : 0,
          this.p.buffs.defense?.bonus ?? 0
        );
        if (defending) this.p.defending = false;
        dmg = Math.max(1, Math.round(dmg * defendMult));
        this.p.hp = Math.max(0, this.p.hp - dmg);
        this.bus.emit('log', { text: `${this.enemy.name} hits you for ${dmg}.`, kind: 'enemy' });
        this.bus.emit('hit', { target: 'player', crit: false });
        this.bus.emit('sfx', { name: 'hurt' });
      }
    }
    this.tickBuffs(this.e);
    this.pushState();

    if (this.p.hp <= 0) return this.finish(false);
    // Player poison tick (venom)
    if (this.p.buffs.dot) {
      this.p.hp = Math.max(0, this.p.hp - this.p.buffs.dot.amount);
      this.bus.emit('log', { text: `Venom burns you for ${this.p.buffs.dot.amount}.`, kind: 'system' });
      this.pushState();
      if (this.p.hp <= 0) return this.finish(false);
    }
    this.tickBuffs(this.p);
    this.busy = false;
    this.bus.emit('phase', { value: 'player' });
  }

  tickBuffs(side) {
    for (const key of ['damage', 'defense', 'hit', 'dot']) {
      const b = side.buffs[key];
      if (b) {
        b.turns -= 1;
        if (b.turns <= 0) side.buffs[key] = null;
      }
    }
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
        hit: this.player.stats().hit,
        buffs: this.describeBuffs(this.p),
        skills: { ...this.p.skillUses },
      },
      enemy: {
        name: this.enemy.name,
        sprite: this.enemy.sprite,
        typeLabel: this.enemy.typeLabel,
        hp: this.e.hp,
        maxHp: this.e.maxHp,
        intent: this.e.intent,
        intentLabel:
          this.e.intent === 'skill'
            ? `Using ${SKILL_MAP[this.enemy.skills[0]]?.name ?? 'a skill'}`
            : INTENT_LABELS[this.e.intent],
        charging: this.e.charging,
        boss: this.enemy.boss,
        evasion: this.enemy.evasion,
        armor: this.enemy.armor,
        buffs: this.describeBuffs(this.e),
      },
    });
  }

  describeBuffs(side) {
    const out = [];
    const names = { damage: '+DMG', defense: '+DEF', hit: '+ACC', dot: 'POISON' };
    for (const [key, b] of Object.entries(side.buffs)) {
      if (b) out.push(`${names[key]} ${b.turns}t`);
    }
    return out;
  }
}
