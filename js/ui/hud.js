// Renders combat state (bars, labels, intent) from 'state' and 'phase'
// events. Holds element refs only — no game rules here.
import { TIER_COLORS } from './equipIcons.js';

export class HUD {
  constructor() {
    this.el = {
      stage: document.getElementById('stage-label'),
      playerName: document.getElementById('player-name'),
      playerLvl: document.getElementById('player-level'),
      playerHp: document.getElementById('player-hp-fill'),
      playerHpText: document.getElementById('player-hp-text'),
      playerEnergy: document.getElementById('player-energy-fill'),
      playerEnergyText: document.getElementById('player-energy-text'),
      playerSprite: document.getElementById('player-sprite'),
      heroSvg: document.getElementById('hero-svg'),
      playerBuffs: document.getElementById('player-buffs'),
      enemySprite: document.getElementById('enemy-sprite'),
      enemySpriteImg: document.getElementById('enemy-sprite-img'),
      enemyName: document.getElementById('enemy-name'),
      enemyHp: document.getElementById('enemy-hp-fill'),
      enemyHpText: document.getElementById('enemy-hp-text'),
      enemyIntent: document.getElementById('enemy-intent'),
      enemyBuffs: document.getElementById('enemy-buffs'),
      actions: {
        attack: document.getElementById('action-attack'),
        guard: document.getElementById('action-guard'),
        skills: document.getElementById('action-skills'),
        items: document.getElementById('action-items'),
      },
    };
    this.currentPhase = 'player';
  }

  // Recolor the inline hero model to the equipped tiers.
  // (public so the shop can update the model right after a purchase)
  applyHeroSkin(equipment) {
    const svg = this.el.heroSvg;
    if (!svg) return;
    for (const slot of Object.keys(TIER_COLORS)) {
      const t = Math.max(0, Math.min(5, equipment?.[slot] ?? 0));
      const pal = TIER_COLORS[slot][t];
      const prefix = slot === 'helmet' ? 'helm' : slot;
      svg.style.setProperty(`--${prefix}-main`, pal.main);
      svg.style.setProperty(`--${prefix}-dark`, pal.dark);
    }
  }

  setPhase(phase) {
    this.currentPhase = phase;
    const enabled = phase === 'player';
    for (const btn of Object.values(this.el.actions)) {
      btn.disabled = !enabled;
    }
    this.updateActionButtons();
  }

  update(state) {
    const { player: p, enemy: e } = state;
    this.el.enemySpriteImg.src = `assets/sprites/${e.sprite}.svg`;
    this.applyHeroSkin(p.equipment);
    this.el.enemyName.textContent = `${e.name}${e.boss ? ' (BOSS)' : ''} · ${e.typeLabel}`;
    this.el.playerHp.style.width = `${(p.hp / p.maxHp) * 100}%`;
    this.el.playerHpText.textContent = `❤️ ${p.hp} / ${p.maxHp}`;
    this.el.playerEnergy.style.width = `${(p.energy / p.maxEnergy) * 100}%`;
    this.el.playerEnergyText.textContent = `⭐ ${p.energy} / ${p.maxEnergy}`;
    this.renderBuffs(this.el.playerBuffs, p.buffs);
    this.el.enemyHp.style.width = `${(e.hp / e.maxHp) * 100}%`;
    this.el.enemyHpText.textContent = `❤️ ${e.hp} / ${e.maxHp}`;
    this.el.enemyIntent.textContent = e.intentLabel || '';
    this.renderBuffs(this.el.enemyBuffs, e.buffs);
    this.lastState = state;
    this.updateActionButtons();
  }

  renderBuffs(el, buffs) {
    el.textContent = '';
    for (const label of buffs) {
      const chip = document.createElement('span');
      chip.className = 'buff-chip' + (label.startsWith('POISON') ? ' poison' : '');
      chip.textContent = label;
      el.appendChild(chip);
    }
  }

  // Action availability that depends on current resources.
  updateActionButtons() {
    if (this.currentPhase !== 'player' || !this.lastState) return;
    const p = this.lastState.player;
    this.el.actions.skills.disabled = !(p.skillAvailableCount > 0);
    const totalItems = (p.items.potion ?? 0) + (p.items.vial ?? 0) + (p.items.elixir ?? 0);
    this.el.actions.items.disabled = totalItems <= 0;
  }

  flash(target, crit) {
    const sprite = target === 'player' ? this.el.playerSprite : this.el.enemySprite;
    sprite.classList.remove('hit', 'hit-crit');
    void sprite.offsetWidth; // restart animation
    sprite.classList.add(crit ? 'hit-crit' : 'hit');
  }

  playDeath(target = 'enemy') {
    (target === 'player' ? this.el.playerSprite : this.el.enemySprite).classList.add('dying');
  }

  stopDeath(target = 'enemy') {
    (target === 'player' ? this.el.playerSprite : this.el.enemySprite).classList.remove('dying');
  }

  setMeta({ stage, level, xpLabel }) {
    this.el.stage.textContent = `Stage ${stage}`;
    this.el.playerLvl.textContent = `Lv ${level}`;
    if (xpLabel) this.el.playerName.textContent = `Hero · ${xpLabel}`;
  }
}
