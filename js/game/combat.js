// Turn-based combat state machine. Pure game logic: talks to UI only via
// the EventBus (contract in core/events.js). No DOM access here.
//
// Extra events (see core/events.js):
//   'sfx'  { name: 'miss'|'defend'|'potion'|'skill'|'hurt' }
//   state payload also carries: player.hit, player.defense, player.evasion,
//   player.buffs, player.items, player.magic,
//   enemy.evasion, enemy.armor, enemy.critChance, enemy.critDamage,
//   enemy.magic, enemy.energy, enemy.buffs
import { TUNING } from '../config/tuning.js';
import { rollIntent, INTENT_LABELS, TYPES } from './enemies.js';
import { SKILL_MAP, ENEMY_SKILLS } from './skills.js';
import { chance } from '../core/rng.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function freshBuffs() {
  return { damage: null, defense: null, hit: null, dot: null, web: null, defenseDown: null };
}

export class Combat {
  constructor(player, enemy, bus, startHp = null, startEnergy = null) {
    this.bus = bus;
    this.player = player;
    this.enemy = { ...enemy };
    this.done = false;
    this.busy = false;

    const s = player.stats();
    this.p = {
      hp: Math.max(1, Math.min(startHp ?? s.maxHp, s.maxHp)),
      maxHp: s.maxHp,
      // Energy carries over between battles (clamped into the pool).
      energy: Math.min(startEnergy ?? TUNING.player.startEnergy, s.maxEnergy),
      maxEnergy: s.maxEnergy,
      items: { ...player.items },
      defending: false,
      buffs: freshBuffs(),
      swing: 1, // Giant's Swing charge multiplier
      guarantee: false, // Focus: next attack always hits
      parry: false,
      riposte: false,
      meditating: false,
      extraAction: false, // Opportune Moment
    };
    this.e = {
      hp: enemy.maxHp,
      maxHp: enemy.maxHp,
      charging: false,
      defending: false,
      intent: 'attack',
      buffs: freshBuffs(),
      energy: Math.min(TUNING.enemyMagic.startEnergy, enemy.magic),
    };
    this.eHit = Math.min(
      TUNING.enemyAi.enemyHitBase + TUNING.enemyAi.enemyHitPerStage * (enemy.stage - 1),
      0.9
    );
    this.lastKillBonus = null;
  }

  start() {
    this.rollEnemyIntent();
    this.bus.emit('log', { text: `A ${this.enemy.boss ? 'boss: ' : ''}${this.enemy.name} (${this.enemy.typeLabel}) appears (stage ${this.enemy.stage})`, kind: 'system' });
    this.pushState();
    this.bus.emit('phase', { value: 'player' });
  }

  rollEnemyIntent() {
    const canSkill =
      this.enemy.skills.length > 0 &&
      this.e.energy >= TUNING.enemyMagic.skillCost;
    this.e.intent = rollIntent(canSkill);
  }

  // Player action ids: 'attack' | 'guard' | 'skill' (arg = skillId) | 'item' (arg = itemId)
  canAct(action, arg) {
    if (this.done || this.busy) return false;
    if (action === 'skill') {
      const sk = SKILL_MAP[arg];
      if (!sk) return false;
      if (this.p.energy < sk.cost) return false;
    }
    if (action === 'item' && !(this.p.items[arg] > 0)) return false;
    return true;
  }

  act(action, arg) {
    if (!this.canAct(action, arg)) return;
    this.busy = true;
    const s = this.player.stats();

    if (action === 'attack') {
      let mult = 1;
      if (this.p.swing > 1) {
        mult = this.p.swing;
        this.p.swing = 1;
      }
      const force = this.p.guarantee;
      if (force) this.p.guarantee = false;
      const typeKey = mult > 1 ? 'slash' : 'blunt';
      const r = this.playerStrike(s, mult, { typeKey, forceHit: force });
      this.afterPlayerHit(r, mult > 1 ? ' (charged)' : '');
    } else if (action === 'guard') {
      this.p.defending = true;
      this.bus.emit('log', { text: 'You brace for the next attack.', kind: 'player' });
      this.bus.emit('sfx', { name: 'defend' });
    } else if (action === 'skill') {
      const sk = SKILL_MAP[arg];
      this.p.energy -= sk.cost;
      this.usePlayerSkill(s, sk);
    } else if (action === 'item') {
      this.useItem(arg);
    }
    this.pushState();

    if (this.e.hp <= 0) return this.finish(true);
    if (this.p.hp <= 0) return this.finish(false);
    // Opportune Moment: an extra player action before the enemy moves.
    if (this.p.extraAction) {
      this.p.extraAction = false;
      this.busy = false;
      this.bus.emit('phase', { value: 'player' });
      return;
    }
    // Enemy turn, then back to the player.
    this.bus.emit('phase', { value: 'enemy' });
    setTimeout(() => this.enemyTurn(), TUNING.combat.enemyActionDelayMs);
  }

  // One player strike. `typeKey` selects the weapon matchup (slash = charged
  // weapon, blunt = basic attack); `vsType`/`vsMult` override the matchup for
  // type-specific skills; `element` selects the element affinity (fire/ice/
  // lightning) and bypasses the weapon matchup (magic, not a weapon).
  // Returns { dmg, crit, hit }.
  playerStrike(s, mult, { typeKey = 'blunt', forceHit = false, ignoreArmor = false, vsType = null, vsMult = null, element = null }) {
    const t = TYPES[this.enemy.type];
    let totalMult;
    if (element) {
      totalMult = mult * (t.element[element] ?? 1);
    } else if (vsType && this.enemy.type === vsType) {
      totalMult = vsMult;
    } else {
      totalMult = mult * t[typeKey];
    }
    const hitChance = forceHit
      ? 1
      : clamp(
          s.hit +
            (this.p.buffs.hit?.bonus ?? 0) -
            (this.p.buffs.web ? TUNING.enemyMagic.webPenalty : 0) -
            this.enemy.evasion,
          0.05,
          0.98
        );
    if (!forceHit && chance(1 - hitChance)) {
      this.bus.emit('log', { text: 'You miss!', kind: 'player' });
      this.bus.emit('sfx', { name: 'miss' });
      return { dmg: 0, crit: false, hit: false };
    }
    const variance = 1 + (Math.random() * 2 - 1) * TUNING.combat.damageVariance;
    let dmg = Math.max(
      1,
      Math.round(s.attack * totalMult * variance * (1 + (this.p.buffs.damage?.bonus ?? 0)))
    );
    const crit = chance(s.critChance);
    if (crit) dmg = Math.round(dmg * s.critDamage);
    const defendMult = 1 - Math.max(
      this.e.defending ? TUNING.combat.enemyDefendReduction : 0,
      this.e.buffs.defense?.bonus ?? 0
    );
    let out = Math.round(dmg * defendMult);
    if (!ignoreArmor) out = Math.max(1, out - this.enemy.armor);
    out = Math.max(1, out);
    this.e.hp = Math.max(0, this.e.hp - out);
    if (this.e.defending) this.e.defending = false;
    return { dmg: out, crit, hit: true };
  }

  afterPlayerHit(r, extra) {
    if (!r.hit) return;
    this.bus.emit('log', {
      text: `${r.crit ? 'CRITICAL! ' : ''}You hit for ${r.dmg}${extra}.`,
      kind: 'player',
    });
    this.bus.emit('hit', { target: 'enemy', crit: r.crit });
  }

  // Log label for a skill's matchup against the current enemy.
  matchupLabel(sk) {
    if (sk.element) {
      const m = TYPES[this.enemy.type]?.element?.[sk.element];
      if (m > 1) return ' (weakness!)';
      if (m < 1) return ' (resisted)';
      return '';
    }
    if (sk.vsType && this.enemy.type === sk.vsType) return ' (weakness!)';
    return '';
  }

  givePlayerBuff(b) {
    if (b.damage) this.p.buffs.damage = { bonus: b.damage.bonus, turns: b.damage.turns };
    if (b.defense) this.p.buffs.defense = { bonus: b.defense.bonus, turns: b.defense.turns };
    if (b.hit) this.p.buffs.hit = { bonus: b.hit.bonus, turns: b.hit.turns };
  }

  usePlayerSkill(s, sk) {
    if (sk.hpCostFrac) {
      this.p.hp = Math.max(1, this.p.hp - Math.round(this.p.maxHp * sk.hpCostFrac));
    }
    this.bus.emit('log', { text: `You use ${sk.name}!`, kind: 'player' });
    this.bus.emit('sfx', { name: 'skill' });

    if (sk.buff) this.givePlayerBuff(sk.buff);
    if (sk.healFrac) {
      const heal = Math.round(this.p.maxHp * sk.healFrac);
      this.p.hp = Math.min(this.p.maxHp, this.p.hp + heal);
      this.bus.emit('log', { text: `You recover ${heal} ❤️.`, kind: 'player' });
    }
    if (sk.meditate) {
      this.p.meditating = true;
      this.p.energy = Math.min(this.p.energy + Math.round(this.p.maxEnergy * 0.25), this.p.maxEnergy);
    }
    if (sk.chargeMult) this.p.swing = sk.chargeMult;
    if (sk.guaranteeNext) this.p.guarantee = true;
    if (sk.parry) {
      this.p.parry = true;
      this.p.defending = true;
    }
    if (sk.riposte) this.p.riposte = true;
    if (sk.cleanse) {
      this.p.buffs.dot = null;
      this.p.meditating = false;
    }

    if (sk.type === 'damage') {
      const hits = sk.hits ?? 1;
      let total = 0;
      let anyCrit = false;
      let landed = false;
      for (let i = 0; i < hits; i++) {
        const r = this.playerStrike(s, sk.mult, {
          forceHit: this.p.guarantee,
          ignoreArmor: sk.ignoreArmor,
          vsType: sk.vsType,
          vsMult: sk.vsMult,
          element: sk.element,
        });
        if (i === 0 && this.p.guarantee) this.p.guarantee = false;
        total += r.dmg;
        if (r.crit) anyCrit = true;
        landed = landed || r.hit;
      }
      if (landed) {
        this.bus.emit('log', {
          text: `${anyCrit ? 'CRITICAL! ' : ''}${sk.name} hits for ${total}${this.matchupLabel(sk)}.`,
          kind: 'player',
        });
        this.bus.emit('hit', { target: 'enemy', crit: anyCrit });
        if (sk.poison) this.e.buffs.dot = { ...sk.poison };
        if (sk.leech) {
          const heal = Math.round(total * sk.leech);
          this.p.hp = Math.min(this.p.maxHp, this.p.hp + heal);
          this.bus.emit('log', { text: `You drain ${heal} ❤️.`, kind: 'player' });
        }
        if (sk.extraActionOnHit) this.p.extraAction = true;
        if (sk.buffOnHit) this.givePlayerBuff(sk.buffOnHit);
      }
      this.lastKillBonus = sk.killBonus ?? null;
    }
  }

  useItem(id) {
    const def = TUNING.shop.items[id];
    const s = this.player.stats();
    if (id === 'potion') {
      const heal = Math.round(this.p.maxHp * s.potionHeal);
      const before = this.p.hp;
      this.p.hp = Math.min(this.p.maxHp, this.p.hp + heal);
      this.bus.emit('log', { text: `You drink a ${def.name} and recover ${this.p.hp - before} ❤️.`, kind: 'player' });
    } else if (id === 'vial') {
      const before = this.p.energy;
      this.p.energy = Math.min(this.p.maxEnergy, this.p.energy + 50);
      this.bus.emit('log', { text: `You drink a ${def.name} and recover ${this.p.energy - before} ⭐.`, kind: 'player' });
    } else if (id === 'elixir') {
      const hpBefore = this.p.hp;
      const enBefore = this.p.energy;
      this.p.hp = Math.min(this.p.maxHp, this.p.hp + Math.round(this.p.maxHp * TUNING.player.elixirRestore));
      this.p.energy = Math.min(this.p.maxEnergy, this.p.energy + Math.round(this.p.maxEnergy * TUNING.player.elixirRestore));
      this.bus.emit('log', { text: `You drink a ${def.name} and recover ${this.p.hp - hpBefore} ❤️ and ${this.p.energy - enBefore} ⭐.`, kind: 'player' });
    }
    this.player.removeItem(id);
    this.p.items[id] -= 1;
    this.bus.emit('sfx', { name: 'potion' });
  }

  // Enemy skill effects (energy-gated; data lives in skills.js names only).
  enemySkill(id) {
    if (id === 'enrage') {
      this.e.buffs.damage = { bonus: 0.4, turns: 3 };
      this.bus.emit('log', { text: `${this.enemy.name} enrages (+40% damage)!`, kind: 'enemy' });
    } else if (id === 'shell') {
      this.e.buffs.defense = { bonus: 0.5, turns: 3 };
      this.bus.emit('log', { text: `${this.enemy.name} hardens its shell.`, kind: 'enemy' });
    } else if (id === 'venom') {
      this.p.buffs.dot = { amount: 5, turns: 3 };
      this.bus.emit('log', { text: `${this.enemy.name} poisons you!`, kind: 'enemy' });
    } else if (id === 'toxins') {
      this.p.buffs.dot = { amount: 5, turns: 5 };
      this.bus.emit('log', { text: `${this.enemy.name} drenches you in toxic venom!`, kind: 'enemy' });
    } else if (id === 'web') {
      this.p.buffs.web = { turns: 3 };
      this.bus.emit('log', { text: `${this.enemy.name} sprays webs — your accuracy drops!`, kind: 'enemy' });
    } else if (id === 'crystallineshell') {
      this.e.buffs.defense = { bonus: 0.5, turns: 5 };
      this.bus.emit('log', { text: `${this.enemy.name} hardens into a crystalline shell (5 turns of defense).`, kind: 'enemy' });
    } else if (id === 'crystaldrain') {
      // Drains the player's energy bar for the enemy's stage-scaled attack
      // value — the same strength as its normal attack (energy only).
      const drain = Math.max(1, this.enemy.atk);
      const before = this.p.energy;
      this.p.energy = Math.max(0, this.p.energy - drain);
      this.bus.emit('log', { text: `${this.enemy.name} lances your energy — −${before - this.p.energy} ⭐!`, kind: 'enemy' });
      this.bus.emit('hit', { target: 'player' });
    } else if (id === 'frostbolt' || id === 'chainlightning' || id === 'infernobolt') {
      // Damaging spell: 150% of the enemy's stage-scaled attack.
      const sk = ENEMY_SKILLS[id];
      this.bus.emit('log', { text: `${this.enemy.name} casts ${sk.name}!`, kind: 'enemy' });
      this.enemyDamage(1.5, sk.name);
    } else if (id === 'wither') {
      this.p.buffs.defenseDown = { bonus: 0.5, turns: 5 };
      this.bus.emit('log', { text: `${this.enemy.name} casts Lich's Wither — your defense crumbles (5 turns)!`, kind: 'enemy' });
    } else if (id === 'fury') {
      this.e.buffs.damage = { bonus: 0.4, turns: 5 };
      this.bus.emit('log', { text: `${this.enemy.name} rages — +40% attack for 5 turns!`, kind: 'enemy' });
    }
    this.bus.emit('sfx', { name: 'skill' });
  }

  // Apply a stage-scaled enemy attack (× mult) to the player: variance,
  // hit chance, crit, defense (reduced by the Lich's Wither debuff),
  // parry/riposte counters. Shared by normal/charged attacks and spells.
  enemyDamage(mult = 1, label = null) {
    const ps = this.player.stats();
    const variance = 1 + (Math.random() * 2 - 1) * TUNING.combat.damageVariance;
    let dmg = Math.max(1, Math.round(this.enemy.atk * mult * variance * (1 + (this.e.buffs.damage?.bonus ?? 0))));
    const hitChance = clamp(this.eHit + (this.e.buffs.hit?.bonus ?? 0) - ps.evasion, 0.05, 0.95);
    if (chance(1 - hitChance)) {
      this.bus.emit('log', { text: `${this.enemy.name} misses ${label ?? 'its attack'}!`, kind: 'enemy' });
      this.bus.emit('sfx', { name: 'miss' });
      return;
    }
    const crit = chance(this.enemy.critChance);
    const defending = this.p.defending;
    const defendMult = 1 - Math.max(
      defending ? TUNING.combat.defendReduction : 0,
      this.p.buffs.defense?.bonus ?? 0
    );
    if (defending) this.p.defending = false;
    const defDown = this.p.buffs.defenseDown?.bonus ?? 0;
    const defense = defDown > 0 ? Math.max(0, Math.round(ps.defense * (1 - defDown))) : ps.defense;
    dmg = Math.max(1, Math.round(dmg * defendMult) - defense);
    if (crit) dmg = Math.max(dmg, Math.round(dmg * this.enemy.critDamage));
    if (this.p.meditating) dmg *= 2;
    this.p.hp = Math.max(0, this.p.hp - dmg);
    this.bus.emit('log', { text: `${crit ? 'CRITICAL! ' : ''}${this.enemy.name} ${label ? `hits you with ${label} for` : 'hits you for'} ${dmg}.`, kind: 'enemy' });
    this.bus.emit('hit', { target: 'player', crit });
    this.bus.emit('sfx', { name: 'hurt' });
    if (this.p.parry) {
      const ref = Math.max(1, Math.round(dmg * 0.25));
      this.e.hp = Math.max(0, this.e.hp - ref);
      this.bus.emit('log', { text: `You parry and counter for ${ref}!`, kind: 'player' });
      this.bus.emit('hit', { target: 'enemy', crit: false });
    }
    if (this.p.riposte) {
      this.e.hp = Math.max(0, this.e.hp - dmg);
      this.bus.emit('log', { text: `Riposte! You counter for ${dmg}!`, kind: 'player' });
      this.bus.emit('hit', { target: 'enemy', crit: false });
    }
  }

  enemyTurn() {
    if (this.done) return;
    // Energy regens a flat amount per turn; magic is the pool's cap.
    this.e.energy = Math.min(this.e.energy + TUNING.combat.energyRegen, this.enemy.magic);
    const intent = this.e.intent;
    const charged = this.e.charging;
    this.e.charging = false;
    this.rollEnemyIntent();

    if (intent === 'defend') {
      this.e.defending = true;
      this.bus.emit('log', { text: `${this.enemy.name} raises its guard.`, kind: 'enemy' });
    } else if (intent === 'skill') {
      this.e.energy -= TUNING.enemyMagic.skillCost;
      const sid = this.enemy.skills[Math.floor(Math.random() * this.enemy.skills.length)];
      this.enemySkill(sid);
    } else {
      const mult =
        (intent === 'charge' ? TUNING.combat.enemyChargeMultiplier : 1) *
        (charged ? TUNING.combat.enemyChargeMultiplier : 1);
      this.enemyDamage(mult);
    }

    // Enemy poison tick (Poisoned Blade).
    if (this.e.buffs.dot) {
      this.e.hp = Math.max(0, this.e.hp - this.e.buffs.dot.amount);
      this.bus.emit('log', { text: `Poison burns ${this.enemy.name} for ${this.e.buffs.dot.amount}.`, kind: 'system' });
      this.pushState();
      if (this.e.hp <= 0) return this.finish(true);
    }
    this.tickBuffs(this.e);
    this.pushState();

    if (this.p.hp <= 0) return this.finish(false);
    // Player poison tick (venom).
    if (this.p.buffs.dot) {
      this.p.hp = Math.max(0, this.p.hp - this.p.buffs.dot.amount);
      this.bus.emit('log', { text: `Venom burns you for ${this.p.buffs.dot.amount}.`, kind: 'system' });
      this.pushState();
      if (this.p.hp <= 0) return this.finish(false);
    }
    this.tickBuffs(this.p);
    // Temporary player stances expire with the enemy turn.
    this.p.parry = false;
    this.p.riposte = false;
    this.p.meditating = false;
    // Energy regenerates from Magic.
    const ps = this.player.stats();
    this.p.energy = Math.min(this.p.energy + TUNING.combat.energyRegen, this.p.maxEnergy);
    this.busy = false;
    this.pushState();
    this.bus.emit('phase', { value: 'player' });
  }

  tickBuffs(side) {
    for (const key of ['damage', 'defense', 'hit', 'dot', 'web', 'defenseDown']) {
      const b = side.buffs[key];
      if (b) {
        b.turns -= 1;
        if (b.turns <= 0) side.buffs[key] = null;
      }
    }
  }

  finish(playerWon) {
    if (this.done) return;
    this.done = true;
    this.busy = false;
    this.bus.emit('phase', {
      value: playerWon ? 'victory' : 'defeat',
      bonus: playerWon ? this.lastKillBonus : undefined,
    });
    if (playerWon) {
      this.bus.emit('log', { text: `${this.enemy.name} is defeated!`, kind: 'system' });
    } else {
      this.bus.emit('log', { text: 'You have fallen...', kind: 'system' });
    }
  }

  pushState() {
    const ps = this.player.stats();
    this.bus.emit('state', {
      player: {
        hp: this.p.hp,
        maxHp: this.p.maxHp,
        energy: this.p.energy,
        maxEnergy: this.p.maxEnergy,
        magic: ps.magic,
        items: { ...this.p.items },
        equipment: { ...this.player.equipment },
        defending: this.p.defending,
        swing: this.p.swing,
        hit: ps.hit,
        defense: ps.defense,
        evasion: ps.evasion,
        buffs: this.describeBuffs(this.p),
        skillAvailableCount: this.player.skills.filter((id) => {
          const sk = SKILL_MAP[id];
          return sk && this.p.energy >= sk.cost;
        }).length,
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
            ? INTENT_LABELS.skill
            : INTENT_LABELS[this.e.intent],
        charging: this.e.charging,
        boss: this.enemy.boss,
        evasion: this.enemy.evasion,
        armor: this.enemy.armor,
        critChance: this.enemy.critChance,
        critDamage: this.enemy.critDamage,
        magic: this.enemy.magic,
        energy: this.e.energy,
        buffs: this.describeBuffs(this.e),
      },
    });
  }

  describeBuffs(side) {
    const out = [];
    const names = { damage: '+DMG', defense: '+DEF', hit: '+ACC', dot: 'POISON', web: 'WEB', defenseDown: 'DEF DOWN' };
    for (const [key, b] of Object.entries(side.buffs)) {
      if (b) out.push(`${names[key]} ${b.turns}t`);
    }
    return out;
  }
}

