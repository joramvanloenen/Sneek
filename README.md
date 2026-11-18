# Sneek
### A different kind of Snake.

**[PLAY SNEEK →](https://joramvanloenen.github.io/Sneek/)**

SNEEK is a colorful, physics-flavored reinvention of classic Snake. Grow a long body, chain color reactions, compete with autonomous rival snakes, collect power-ups, and survive an increasingly rowdy arena.

## What's in the pit?

- **Reactive chemistry.** Eat two different pigments in succession to set off a reaction. **Coral + cyan** makes an **Ion Blast** that stuns nearby rivals; **coral + gold** triggers a **Solar Flare** for bonus points and more roaming food; **cyan + gold** creates a **Growth Spurt** and restores health.
- **Physics.** Snakes have inertia and springy linked bodies; moving orbs, explosive impulses, swirling gravity wells and shockwaves keep the arena alive.
- **Three autonomous NPCs.** **NIBBLE** seeks food, **BYTE** stalks the player, and **ZIG** competes for pickups and occasionally harasses you. Their local steering logic includes predictive pursuit, avoidance, collision response and goal changes. No cloud service needed.
- **Power-ups.** Magnet attracts orbs. Ghost lets you phase through danger. Hyper adds speed. Shield heals and grants brief invulnerability.
- **Endless waves.** Rivals become quicker over time. Knock them out to earn points and energy; they respawn.
- **Unmistakable player.** Your snake always has a green head, light outline, subtle locator ring and floating **YOU** label, even while collecting other colors.
- **Clear feedback without blocking play.** Successes and mistakes appear in a dedicated status strip **above** the arena, including on small screens. Positive actions use muted green, mistakes use red; the canvas retains point callouts, collision flashes and sounds.
- **Simplified visual style.** Flat, readable sprites, soft color palette, understated canvas grid, compact HUD and uncluttered controls.
- **Browser-first.** On-screen drag joystick (mouse/touch), optional mouse aiming and keyboard movement, mobile boost, responsive canvas, synthesized sound, pause, restart and a personal best saved with localStorage. No tracking, accounts, databases or build tools.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Steer | On-screen joystick, mouse, WASD or arrow keys | Drag the on-screen joystick |
| Boost | Hold Space | Hold the BOOST button |
| Pause / resume | P or Escape | PAUSE button |
| Restart | R / Enter after game over | Play again button |
| Sound | Sound button | Sound button |

## Run locally

Open index.html in a current browser, or serve the folder with the Python command **python -m http.server 8000** and visit http://localhost:8000. No compilation or installation needed.

## Files

- **index.html** — app structure and accessible game controls
- **style.css** — responsive visual design
- **game.js** — canvas renderer, game loop, physics, autonomous rivals, color mixing, pickups and effects
- **GitHub Pages** — site publishes automatically from the main branch

The rivals are autonomous rule/utility-based game AI, not remote generative models. This keeps them responsive, free, easy to debug, and playable offline.

Made for playful experimentation.
