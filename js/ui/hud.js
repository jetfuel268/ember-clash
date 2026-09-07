// Renders combat state (bars, labels, intent) from 'state' and 'phase'
// events. Holds element refs only — no game rules here.
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
      playerSpriteImg: document.getElementById('player-sprite-img'),
      playerBuffs: document.getElementById('player-buffs'),
      playerStats: document.getElementById('player-stats'),
      enemySprite: document.getElementById('enemy-sprite'),
      enemySpriteImg: document.getElementById('enemy-sprite-img'),
      enemyName: document.getElementById('enemy-name'),
      enemyHp: document.getElementById('enemy-hp-fill'),
      enemyHpText: document.getElementById('enemy-hp-text'),
      enemyIntent: document.getElementById('enemy-intent'),
      enemyBuffs: document.getElementById('enemy-buffs'),
      enemyStats: document.getElementById('enemy-stats'),
      actions: {
        attack: document.getElementById('action-attack'),
        guard: document.getElementById('action-guard'),
        skills: document.getElementById('action-skills'),
        items: document.getElementById('action-items'),
      },
    };
    this.currentPhase = 'player';
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
    this.el.enemyName.textContent = `${e.name}${e.boss ? ' (BOSS)' : ''} · ${e.typeLabel}`;
    this.el.playerHp.style.width = `${(p.hp / p.maxHp) * 100}%`;
    this.el.playerHpText.textContent = `${p.hp} / ${p.maxHp}`;
    this.el.playerEnergy.style.width = `${(p.energy / p.maxEnergy) * 100}%`;
    this.el.playerEnergyText.textContent = `${p.energy} / ${p.maxEnergy}`;
    this.el.playerStats.textContent = `Hit ${Math.round(p.hit * 100)}% · Def ${p.defense} · Evade ${Math.round(p.evasion * 100)}% · Magic ${p.magic}`;
    this.renderBuffs(this.el.playerBuffs, p.buffs);
    this.el.enemyHp.style.width = `${(e.hp / e.maxHp) * 100}%`;
    this.el.enemyHpText.textContent = `${e.hp} / ${e.maxHp}`;
    this.el.enemyIntent.textContent = e.intentLabel || '';
    this.el.enemyStats.textContent = `Evade ${Math.round(e.evasion * 100)}% · Armor ${e.armor} · Crit ${Math.round(e.critChance * 100)}% · Magic ${e.magic}`;
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
