// Minimal typed-ish event bus so game modules never import UI modules.
// Event names (documented here — the module boundary contract):
//   'log'           { text, kind: 'info'|'player'|'enemy'|'system' }
//   'state'         { player: {hp,maxHp,energy,maxEnergy,potions,defending},
//                     enemy:  {name,emoji,hp,maxHp,intent,intentLabel,boss} }
//   'phase'         { value: 'player'|'enemy'|'busy'|'victory'|'defeat' }
//   'hit'           { target: 'player'|'enemy', crit: boolean }
export class EventBus extends EventTarget {
  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }
  on(name, handler) {
    this.addEventListener(name, (e) => handler(e.detail));
  }
}
