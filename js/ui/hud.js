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
      playerPotions: document.getElementById('player-potions'),
      playerSprite: document.getElementById('player-sprite'),
      playerSpriteImg: document.getElementById('player-sprite-img'),
      enemySprite: document.getElementById('enemy-sprite'),
      enemySpriteImg: document.getElementById('enemy-sprite-img'),
      enemyName: document.getElementById('enemy-name'),
      enemyHp: document.getElementById('enemy-hp-fill'),
      enemyHpText: document.getElementById('enemy-hp-text'),
      enemyIntent: document.getElementById('enemy-intent'),
      actions: {
        attack: document.getElementById('action-attack'),
        power: document.getElementById('action-power'),
        defend: document.getElementById('action-defend'),
        potion: document.getElementById('action-potion'),
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
    this.el.playerSpriteImg.src = 'assets/sprites/hero.svg';
    this.el.enemySpriteImg.src = `assets/sprites/${e.sprite}.svg`;
    this.el.enemyName.textContent = `${e.name}${e.boss ? ' (BOSS)' : ''}`;
    this.el.playerHp.style.width = `${(p.hp / p.maxHp) * 100}%`;
    this.el.playerHpText.textContent = `${p.hp} / ${p.maxHp}`;
    this.el.playerEnergy.style.width = `${(p.energy / p.maxEnergy) * 100}%`;
    this.el.playerEnergyText.textContent = `${p.energy} / ${p.maxEnergy}`;
    this.el.playerPotions.textContent = p.potions > 0 ? `× ${p.potions}` : '× 0';
    this.el.enemyHp.style.width = `${(e.hp / e.maxHp) * 100}%`;
    this.el.enemyHpText.textContent = `${e.hp} / ${e.maxHp}`;
    this.el.enemyIntent.textContent = e.intentLabel || '';
    this.lastState = state;
    this.updateActionButtons();
  }

  // Action availability that depends on current resources.
  updateActionButtons() {
    if (this.currentPhase !== 'player' || !this.lastState) return;
    const p = this.lastState.player;
    const needPower = 25; // mirrors TUNING.combat.powerStrike.cost (UI may not import tuning)
    this.el.actions.power.disabled = p.energy < needPower;
    this.el.actions.potion.disabled = p.potions <= 0;
  }

  flash(target, crit) {
    const sprite = target === 'player' ? this.el.playerSprite : this.el.enemySprite;
    sprite.classList.remove('hit', 'hit-crit');
    void sprite.offsetWidth; // restart animation
    sprite.classList.add(crit ? 'hit-crit' : 'hit');
  }

  setMeta({ stage, level, xpLabel }) {
    this.el.stage.textContent = `Stage ${stage}`;
    this.el.playerLvl.textContent = `Lv ${level}`;
    if (xpLabel) this.el.playerName.textContent = `Hero · ${xpLabel}`;
  }
}
