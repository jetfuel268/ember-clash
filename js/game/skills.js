// Data-driven skill catalog.
//  - kind 'player': bought with gold in the stage-end shop, usable in combat
//    via the Skills dropdown (limited uses per battle).
//  - kind 'enemy': referenced by enemy definitions; used by enemy AI.
//
// effect keys (handled in combat.js):
//   damage:  { bonus, turns }   outgoing damage multiplier bonus
//   defense: { bonus, turns }   incoming damage reduction
//   hit:     { bonus, turns }   accuracy bonus
//   dot:     { amount, turns }  damage-over-time dealt to the opponent
//   heal:    fraction of maxHp
export const SKILLS = [
  { id: 'berserk', name: 'Berserk', kind: 'player', desc: '+50% damage for 3 turns', price: 50, uses: 1,
    effect: { damage: { bonus: 0.5, turns: 3 } } },
  { id: 'stoneskin', name: 'Stone Skin', kind: 'player', desc: 'Halve incoming damage for 3 turns', price: 50, uses: 1,
    effect: { defense: { bonus: 0.5, turns: 3 } } },
  { id: 'focus', name: 'Focus', kind: 'player', desc: '+20% accuracy for 3 turns', price: 40, uses: 1,
    effect: { hit: { bonus: 0.2, turns: 3 } } },
  { id: 'mend', name: 'Mend', kind: 'player', desc: 'Heal 30% of max HP', price: 45, uses: 2,
    effect: { heal: 0.3 } },
  { id: 'enrage', name: 'Enrage', kind: 'enemy', desc: '+40% damage for 3 turns',
    effect: { damage: { bonus: 0.4, turns: 3 } } },
  { id: 'shell', name: 'Shell', kind: 'enemy', desc: '+50% defense for 3 turns',
    effect: { defense: { bonus: 0.5, turns: 3 } } },
  { id: 'venom', name: 'Venom', kind: 'enemy', desc: 'Poison: 8 damage per turn for 3 turns',
    effect: { dot: { amount: 8, turns: 3 } } },
];

export const SKILL_MAP = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export function playerSkills(ownedIds) {
  return SKILLS.filter((s) => s.kind === 'player' && ownedIds.includes(s.id));
}
