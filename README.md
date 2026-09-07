# ⚔️ Ember Clash

A turn-based combat game that runs entirely in the browser. No server, no build
step required — the project root **is** the production build.

## How to play

- **Attack** deals basic damage. **Guard** halves the next enemy hit.
- **Skills** (max 4, starting with Power Strike — 150% for 25 energy) are
  **learned on level-up**: each level-up grants a random skill from the pool
  matching your new level; with all 4 slots full you choose which skill to
  replace. Skills cost **energy** and have a per-skill cooldown; energy
  regenerates each turn from your **Magic** stat. The pool includes damage,
  buff, heal, and type-specific skills (e.g. Beasthunter is 200% against
  beasts) — check the Bestiary for type matchups.
- **Items** (Potion, Energy Vial, Elixir) are **single-use**, bought in the
  shop, consumed in battle. Nothing restores between levels: you heal a small
  fraction on stage wins, and **sleep in a shop bed** (cost scales with the
  stage) to fully restore HP.

**Progression:** each stage win grants XP and gold. XP levels you up — stats
(attack, defense, magic, max HP) grow by a random amount per level, and you
learn a skill. **Upgrades** (attack, HP, magic, energy, crit, item strength,
gold) are permanent stackable boosts bought in the **shop**, which opens on
every stage ending in 5. Enemies also have **Magic**: it regenerates their
energy so they can use their skills (Enrage, Shell, Venom). A **boss** appears
every 10 stages, the campaign is **won at stage 50** — the final boss
(Umbra, Dark Reflection) — and you can continue into endless mode with
escalating enemies. The campaign spans **5 biomes of 10 stages each**
(forest, crystal cavern, dungeon, mountain walkway, dark castle), with bosses
fighting in their own biome. Losing sends you back to the same stage. All
progress is persisted in `localStorage`.

## Running locally

```bash
# any static server works, e.g.:
python3 -m http.server 8000
# then open http://localhost:8000
```

(Or just open `index.html` via a server; ES modules require `http://`, not `file://`.)

## Tests

```bash
node tests/smoke.mjs   # exercises save, stats, upgrades, progression, enemies, full combat fights
```

## Building (there is no build step)

The production output is the project root as-is:

```
index.html
css/
js/
assets/
```

All asset references are **relative** (`css/styles.css`, `js/main.js`), and the
game uses no fetch/XHR, web workers, or server-side code. This means it works
when deployed from **any base path**, including a GitHub Pages repository
subdirectory (e.g. `https://user.github.io/repo-name/`) — no path
configuration is needed.

If you add assets (images, audio), keep referencing them with relative paths so
the subdirectory deployment guarantee holds.

## Deploying to GitHub Pages

Option A — **docs folder** (recommended, no extra branch):

1. Copy the production files (`index.html`, `css/`, `js/`) into a `docs/` folder.
2. Commit and push.
3. In the repository's GitHub settings, enable Pages with `docs/` as the source.

Option B — **`gh-pages` branch:**

1. Create a `gh-pages` branch containing `index.html`, `css/`, `js/` at its root.
2. Push it; GitHub Pages serves it at `https://user.github.io/repo-name/`.

## Architecture (locality of change)

```
index.html            DOM skeleton for all screens; loads js/main.js as an ES module
css/styles.css        All styling
assets/bg/            Battle environment pixel art (AI-generated, studio pipeline)
assets/sprites/       Hand-crafted vector SVG characters (primitives + Bezier paths, layered <g> groups, gradient shading)
js/config/tuning.js   Every balance number. Tune the game here only.
js/core/events.js     Tiny typed event bus — the contract between game and UI
js/core/rng.js        Random helpers
js/core/save.js       Versioned localStorage persistence (key: combat-game.save.v3)
js/game/player.js     Player model: persisted fields + derived stats
js/game/upgrades.js   Data-driven upgrade catalog + XP curve (add an entry to add an upgrade)
js/game/skills.js     Data-driven skill catalog: effects, energy cost, cooldown, learnable level ranges
js/game/bestiary.js   Bestiary records of defeated creatures
js/game/enemies.js    Enemy types, bosses, per-stage scaling, AI intents
js/game/combat.js     Turn-based combat state machine (no DOM access)
js/game/progression.js  XP/levels, stage rewards, stage advancing
js/ui/screens.js      Screen switching
js/ui/hud.js          Bars/sprites from 'state'/'phase' events
js/ui/log.js         Combat log from 'log' events
js/main.js            Wiring only: owns the save object and routes events
tests/smoke.mjs       Node smoke test for all DOM-free modules
```

**Rules that keep changes local:**

- **Game modules never import UI modules, and UI modules never import game
  modules.** They communicate only through the `EventBus` names documented in
  `js/core/events.js` (`log`, `state`, `phase`, `hit`).
- **Balance changes** → edit `js/config/tuning.js` only.
- **New upgrade** → add one entry to `UPGRADES` in `js/game/upgrades.js`
  (use an existing stat key, or add a key handled in `Player.stats()`).
- **New enemy type** → add one entry to `BASES` in `js/game/enemies.js`.
- **New/changed sprite** → edit the SVG in `assets/sprites/` directly; keep the
  conventions (clean viewBox 0 0 800 800, layered <g> ids, gradients in <defs>).
- **New screen** → add a `<section class="screen hidden" id="screen-…">` to
  `index.html` and a case in the flow in `js/main.js`.
- **New action** → add handling in `Combat.act()` / `canAct()` and a button in
  `index.html` + `js/main.js` binding.

## Save format (v3)

```json
{
  "version": 3,
  "player": {
    "level": 1, "xp": 0, "gold": 0, "upgrades": ["sharp"],
    "stats": { "attack": 16, "defense": 0, "magic": 1, "maxHp": 100,
               "critChance": 0.1, "critDamage": 2.0 },
    "skills": ["powerstrike"],
    "items": { "potion": 2, "vial": 0, "elixir": 0 },
    "currentHp": null
  },
  "stage": 1,
  "stats": { "wins": 0, "losses": 0, "kills": 0 }
}
```

Stored under the `localStorage` key `combat-game.save.v3`. v2/v1 saves are
migrated automatically on load. Changing the schema? Bump `VERSION` in
`js/core/save.js` and add a migration for the previous version.
