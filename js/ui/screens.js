// Screen manager: shows one top-level section at a time.
// Screens: 'menu' | 'combat' | 'levelup' | 'gameover' | 'victory'
export class Screens {
  constructor(root) {
    this.root = root;
  }
  show(name) {
    for (const el of this.root.querySelectorAll('.screen')) {
      el.classList.toggle('hidden', el.id !== `screen-${name}`);
    }
  }
}
