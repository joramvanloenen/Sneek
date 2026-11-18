/* SNEEK: CHROMA CHAOS — dependency-free canvas arcade game.
   Rivals use autonomous goal selection, steering, avoidance and state-dependent behavior.
   No external model/API is required. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const arena = $('arena');
  const C = {
    coral: { hex: '#df867a', soft: '#f0c0b8', label: 'CORAL' },
    cyan: { hex: '#80bec4', soft: '#c0e0e2', label: 'CYAN' },
    yellow: { hex: '#e2bf77', soft: '#f4e2b6', label: 'GOLD' }
  };
  const PALETTE = ['coral', 'cyan', 'yellow'];
  const BOTS = [
    { name: 'NIBBLE', color: '#a99bc4', type: 'forager', speed: 118, length: 13 },
    { name: 'BYTE', color: '#d78e71', type: 'hunter', speed: 128, length: 15 },
    { name: 'ZIG', color: '#7bb7c1', type: 'trickster', speed: 122, length: 11 }
  ];
  const POWER = {
    magnet: { name: 'MAGNET', color: '#55e9e1', symbol: '◎', duration: 9 },
    shield: { name: 'SHIELD', color: '#ffd36b', symbol: '◇', duration: 0 },
    phase: { name: 'GHOST', color: '#b69aff', symbol: '✳', duration: 7 },
    rush: { name: 'HYPER', color: '#ff668d', symbol: '↗', duration: 8 }
  };
  const WORLD = { w: 1100, h: 660 };
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const len = (x, y) => Math.hypot(x, y);
  const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  const isMobile = () => matchMedia('(max-width: 660px)').matches;

  let best = 0;
  try { best = Number(localStorage.getItem('sneek-best') || 0) || 0; } catch (_) {}
  let mode = 'menu';
  let player;
  let bots = [];
  let foods = [];
  let pickups = [];
  let wells = [];
  let particles = [];
  let rings = [];
  let floats = [];
  let time = 0;
  let ambientTime = 0;
  let frameLast = 0;
  let hudClock = 0;
  let toastClock = 0;
  let shake = 0;
  let nextPickup = 13;
  let nextWell = 22;
  let wave = 1;
  let lives = 3;
  let score = 0;
  let combo = 0;
  let reactions = 0;
  let lastColor = null;
  let reactionCooldown = 0;
  let reactionTitle = 'FIND YOUR FIRST COLOR';
  let reactionHint = 'MIX DIFFERENT COLORS FOR REACTIONS';
  let energy = 100;
  let buffs = { magnet: 0, phase: 0, rush: 0 };
  let keys = new Set();
  let pointer = { x: WORLD.w * .72, y: WORLD.h * .5, active: false };
  let boostingTouch = false;
  let joystick = { pressed: false, pointerId: null, active: false, angle: 0 };
  let feedbackTint = 0;
  let feedbackMode = 'positive';
  let boostLocked = false;
  let boostWarned = false;
  let audioCtx = null;
  let muted = true;

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * ratio));
    canvas.height = Math.max(1, Math.round(r.height * ratio));
    const oldW = WORLD.w, oldH = WORLD.h;
    WORLD.w = isMobile() ? 690 : 1100;
    WORLD.h = WORLD.w * r.height / r.width;
    if (player && oldW && oldH) {
      const sx = WORLD.w / oldW, sy = WORLD.h / oldH;
      for (const snake of [player, ...bots]) {
        snake.x *= sx; snake.y *= sy;
        for (const part of snake.body) { part.x *= sx; part.y *= sy; }
      }
      for (const item of [...foods, ...pickups, ...wells, ...particles, ...rings, ...floats]) {
        item.x *= sx; item.y *= sy;
      }
    }
    pointer.x = WORLD.w * .72;
    pointer.y = WORLD.h * .5;
    pointer.active = false;
  }

  function pointAway(minDistance = 0, from = player) {
    let x, y;
    for (let i = 0; i < 45; i++) {
      x = rand(45, WORLD.w - 45);
      y = rand(110, WORLD.h - 48);
      if (!from || (x - from.x) ** 2 + (y - from.y) ** 2 > minDistance ** 2) break;
    }
    return { x, y };
  }

  function makeSnake(name, x, y, angle, color, type, count, speed) {
    const snake = {
      name, x, y, angle, color, type, speed,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      body: [], alive: true, invuln: 1.5, stun: 0,
      respawn: 0, aiTimer: 0, goal: null,
      wobble: rand(0, 10), blink: rand(0, TAU)
    };
    for (let i = 0; i < count; i++) {
      snake.body.push({ x: x - Math.cos(angle) * i * 17, y: y - Math.sin(angle) * i * 17, color });
    }
    return snake;
  }

  function spawnFood(x, y, forcedColor, impulse = 0) {
    const p = x === undefined ? pointAway(85) : { x, y };
    const id = forcedColor || PALETTE[Math.floor(rand(0, 3))];
    foods.push({
      x: clamp(p.x, 30, WORLD.w - 30), y: clamp(p.y, 40, WORLD.h - 30),
      vx: rand(-1, 1) * impulse, vy: rand(-1, 1) * impulse,
      color: id, phase: rand(0, TAU), size: rand(6, 9)
    });
  }

  function grow(snake, amount = 1) {
    const tail = snake.body[snake.body.length - 1];
    for (let i = 0; i < amount; i++) {
      if (snake.body.length >= 155) break;
      snake.body.push({ x: tail.x, y: tail.y, color: tail.color });
    }
  }

  function reset(start = true) {
    time = 0; ambientTime = 0; shake = 0; hudClock = 0;
    nextPickup = 11; nextWell = 20; wave = 1;
    lives = 3; score = 0; combo = 0; reactions = 0; lastColor = null;
    energy = 100; reactionCooldown = 0; feedbackTint = 0; boostLocked = false; boostWarned = false;
    reactionTitle = 'FIND YOUR FIRST COLOR';
    reactionHint = 'MIX DIFFERENT COLORS FOR REACTIONS';
    buffs = { magnet: 0, phase: 0, rush: 0 };
    foods = []; pickups = []; wells = []; particles = []; rings = []; floats = [];
    const cx = WORLD.w / 2, cy = WORLD.h / 2;
    player = makeSnake('YOU', cx * .78, cy * 1.06, -.35, '#bbd86d', 'player', 14, 147);
    bots = BOTS.map((def, i) => {
      const a = i * TAU / 3 - 1.2;
      const radius = Math.min(WORLD.w, WORLD.h) * .34;
      const x = clamp(cx + Math.cos(a) * radius, 80, WORLD.w - 80);
      const y = clamp(cy + Math.sin(a) * radius, 125, WORLD.h - 75);
      return makeSnake(def.name, x, y, a + 2.1, def.color, def.type, def.length, def.speed);
    });
    for (let i = 0; i < (isMobile() ? 27 : 39); i++) spawnFood();
    keys.clear(); pointer.active = false; boostingTouch = false; resetJoystick();
    mode = start ? 'playing' : 'menu';
    $('menu').classList.toggle('hidden', start);
    $('pauseScreen').classList.add('hidden');
    $('gameOverScreen').classList.add('hidden');
    $('pauseButton').disabled = !start;
    $('reactionName').textContent = reactionTitle;
    $('reactionHint').textContent = reactionHint;
    refreshHud();
    if (start) {
      say('You are the green snake', '#bbd86d', 2.8, 'neutral', 'Use the joystick or arrow keys to steer');
      chirp(520, .10, 'triangle', .03);
    }
  }

  function showPause() {
    if (mode === 'playing') {
      mode = 'paused'; resetJoystick(); boostingTouch = false;
      $('pauseScreen').classList.remove('hidden');
      $('pauseButton').querySelector('span').textContent = 'RESUME';
    } else if (mode === 'paused') {
      mode = 'playing'; $('pauseScreen').classList.add('hidden');
      $('pauseButton').querySelector('span').textContent = 'PAUSE';
    }
  }

  function endGame() {
    if (mode !== 'playing') return;
    mode = 'over';
    burst(player.x, player.y, '#d6ff59', 50, 200);
    shake = 18;
    if (score > best) {
      best = score;
      try { localStorage.setItem('sneek-best', String(best)); } catch (_) {}
    }
    $('finalScore').textContent = score.toLocaleString();
    $('finalBest').textContent = best.toLocaleString();
    $('finalReactions').textContent = String(reactions);
    $('finalMessage').textContent = score >= best && score > 0 ? 'NEW PERSONAL BEST. THE PIT IS IMPRESSED.' : 'THE PIT HAS CLAIMED ANOTHER ONE.';
    $('gameOverScreen').classList.remove('hidden');
    $('pauseButton').disabled = true;
    chirp(190, .4, 'sawtooth', .07, -110);
  }

  function say(message, color = '#ffffff', duration = 1.4, kind = 'neutral', detail = '') {
    const toast = $('toast');
    $('toastTitle').textContent = message;
    $('toastDetail').textContent = detail;
    $('toastKicker').textContent = kind === 'negative' ? 'WATCH OUT' : kind === 'positive' ? 'NICE ONE' : 'GAME INFO';
    $('toastIcon').textContent = kind === 'negative' ? '!' : kind === 'positive' ? '+' : 'i';
    toast.style.setProperty('--feedback-color', color);
    toast.classList.remove('show', 'positive', 'negative', 'neutral');
    toast.classList.add(kind, 'show');
    toastClock = duration;
    if (kind !== 'neutral') {
      feedbackMode = kind;
      feedbackTint = kind === 'negative' ? 1 : .68;
    }
  }

  function floating(x, y, text, color = '#ffffff') {
    floats.push({ x, y, text, color, life: 1.25, maxLife: 1.25 });
  }

  function burst(x, y, color, count = 16, force = 130) {
    for (let i = 0; i < count && particles.length < 550; i++) {
      const a = rand(0, TAU), speed = rand(force * .15, force);
      const life = rand(.3, .9);
      particles.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        color, life, maxLife: life, size: rand(1.5, 5), drag: rand(1.9, 3.4)
      });
    }
  }

  function ripple(x, y, color, maxRadius = 225) {
    rings.push({ x, y, r: 2, max: maxRadius, life: .85, maxLife: .85, color });
    shake = Math.max(shake, 9);
  }

  function chirp(freq, duration = .1, type = 'sine', vol = .045, slide = 0) {
    if (muted) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + duration);
      gain.gain.setValueAtTime(Math.max(.0001, vol), now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + duration + .02);
    } catch (_) {}
  }

  function refreshHud() {
    $('score').textContent = String(score).padStart(6, '0');
    $('best').textContent = String(Math.max(score, best)).padStart(6, '0');
    $('hearts').textContent = '♥ '.repeat(Math.max(0, lives)) + '♡ '.repeat(Math.max(0, 4 - lives));
    $('energyFill').style.width = energy.toFixed(0) + '%';
    $('energyText').textContent = Math.round(energy) + '%';
    $('levelLabel').textContent = 'WAVE ' + String(wave).padStart(2, '0');
    $('arenaStatus').innerHTML = '<span class="status-dot"></span> ' + bots.filter(b => b.alive).length + ' RIVALS IN THE PIT';
    const labels = [];
    if (buffs.magnet > 0) labels.push('<span>◎ MAGNET ' + Math.ceil(buffs.magnet) + 's</span>');
    if (buffs.phase > 0) labels.push('<span>✳ GHOST ' + Math.ceil(buffs.phase) + 's</span>');
    if (buffs.rush > 0) labels.push('<span>↗ HYPER ' + Math.ceil(buffs.rush) + 's</span>');
    $('powerBadges').innerHTML = labels.join('');
    $('reactionName').textContent = reactionTitle;
    $('reactionHint').textContent = reactionHint;
  }

  function nearest(items, x, y, filter) {
    let chosen = null, bestD = Infinity;
    for (const obj of items) {
      if (filter && !filter(obj)) continue;
      const d = (obj.x - x) ** 2 + (obj.y - y) ** 2;
      if (d < bestD) { chosen = obj; bestD = d; }
    }
    return chosen;
  }

  function aiDirection(bot, dt) {
    bot.aiTimer -= dt;
    if (bot.aiTimer <= 0 || !bot.goal) {
      bot.aiTimer = rand(.24, .49);
      const nearFood = nearest(foods, bot.x, bot.y);
      const nearPickup = nearest(pickups, bot.x, bot.y);
      if (bot.type === 'hunter' && player && player.body.length < bot.body.length + 18 && dist2(bot, player) < 480 ** 2) {
        bot.goal = { kind: 'hunt', target: player };
      } else if (bot.type === 'trickster' && nearPickup && dist2(bot, nearPickup) < 410 ** 2) {
        bot.goal = { kind: 'pickup', target: nearPickup };
      } else if (bot.type === 'trickster' && player && Math.sin(time * .7) > .45 && dist2(bot, player) < 400 ** 2) {
        bot.goal = { kind: 'harass', target: player };
      } else {
        bot.goal = { kind: 'food', target: nearFood };
      }
    }
    let tx = Math.cos(bot.angle), ty = Math.sin(bot.angle);
    const g = bot.goal;
    if (g && g.target) {
      const target = g.target;
      const gx = target.x - bot.x, gy = target.y - bot.y;
      const d = len(gx, gy) || 1;
      tx = gx / d; ty = gy / d;
      if (g.kind === 'harass') {
        tx = gx / d * .48 - gy / d * .85;
        ty = gy / d * .48 + gx / d * .85;
      }
      if (g.kind === 'hunt') {
        tx = (gx + player.vx * .45) / (d + 25);
        ty = (gy + player.vy * .45) / (d + 25);
      }
    }
    const margin = 95;
    if (bot.x < margin) tx += (margin - bot.x) / 35;
    if (bot.x > WORLD.w - margin) tx -= (bot.x - (WORLD.w - margin)) / 35;
    if (bot.y < margin) ty += (margin - bot.y) / 35;
    if (bot.y > WORLD.h - margin) ty -= (bot.y - (WORLD.h - margin)) / 35;
    const forwardX = bot.x + Math.cos(bot.angle) * 65;
    const forwardY = bot.y + Math.sin(bot.angle) * 65;
    for (const other of [player, ...bots]) {
      if (!other.alive) continue;
      for (let i = other === bot ? 10 : 3; i < other.body.length; i += 3) {
        const seg = other.body[i];
        const dx = forwardX - seg.x, dy = forwardY - seg.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 57 * 57 && d2 > 1) {
          const force = (57 - Math.sqrt(d2)) / 34;
          tx += dx / Math.sqrt(d2) * force;
          ty += dy / Math.sqrt(d2) * force;
        }
      }
    }
    const wobble = Math.sin(time * 2.1 + bot.wobble) * .13;
    return Math.atan2(ty, tx) + wobble;
  }

  function playerDirection() {
    if (joystick.pressed && joystick.active) return joystick.angle;
    let x = 0, y = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) x--;
    if (keys.has('ArrowRight') || keys.has('KeyD')) x++;
    if (keys.has('ArrowUp') || keys.has('KeyW')) y--;
    if (keys.has('ArrowDown') || keys.has('KeyS')) y++;
    if (x || y) { pointer.active = false; return Math.atan2(y, x); }
    if (pointer.active && dist2(pointer, player) > 23 ** 2) {
      return Math.atan2(pointer.y - player.y, pointer.x - player.x);
    }
    return player.angle;
  }

  function moveSnake(snake, dt) {
    if (!snake.alive) return;
    snake.invuln = Math.max(0, snake.invuln - dt);
    snake.stun = Math.max(0, snake.stun - dt);
    const desired = snake.type === 'player' ? playerDirection() : aiDirection(snake, dt);
    const turn = snake.type === 'player' ? 4.4 : 3.5;
    snake.angle += clamp(angleDiff(snake.angle, desired), -turn * dt, turn * dt);
    const wantsBoost = snake.type === 'player' && (keys.has('Space') || boostingTouch);
    if (snake.type === 'player' && energy <= .5) boostLocked = true;
    if (snake.type === 'player' && !wantsBoost && energy >= 22 && boostLocked) {
      boostLocked = false; boostWarned = false;
      say('Boost ready', '#bbd86d', 1.0, 'positive', 'Energy recharged');
    }
    const boosting = wantsBoost && !boostLocked && energy > .5;
    if (boosting) energy = Math.max(0, energy - 36 * dt);
    else if (snake.type === 'player') energy = Math.min(100, energy + 7 * dt);
    if (wantsBoost && boostLocked && !boostWarned) {
      boostWarned = true;
      say('Boost empty', '#bb4e43', 1.6, 'negative', 'Release boost and recharge');
      chirp(160, .22, 'sawtooth', .045, -85);
    }
    let speed = snake.speed * (snake.type === 'player' ? 1 : 1 + Math.min(.3, (wave - 1) * .065));
    if (boosting) speed *= 1.65;
    if (snake.type === 'player' && buffs.rush > 0) speed *= 1.24;
    if (snake.stun > 0) speed *= .55;
    const targetVX = Math.cos(snake.angle) * speed, targetVY = Math.sin(snake.angle) * speed;
    snake.vx = lerp(snake.vx, targetVX, Math.min(1, dt * 8));
    snake.vy = lerp(snake.vy, targetVY, Math.min(1, dt * 8));
    for (const well of wells) {
      const dx = well.x - snake.x, dy = well.y - snake.y, d = Math.max(20, len(dx, dy));
      if (d < well.radius) {
        const force = (1 - d / well.radius) * (snake.type === 'player' ? 125 : 190);
        snake.vx += (dx / d * force - dy / d * force * .45) * dt;
        snake.vy += (dy / d * force + dx / d * force * .45) * dt;
      }
    }
    snake.x += snake.vx * dt;
    snake.y += snake.vy * dt;
    const pad = 22;
    let hitWall = false;
    if (snake.x < pad) { snake.x = pad; snake.vx = Math.abs(snake.vx) * .55; snake.angle = Math.atan2(snake.vy, Math.abs(snake.vx)); hitWall = true; }
    if (snake.x > WORLD.w - pad) { snake.x = WORLD.w - pad; snake.vx = -Math.abs(snake.vx) * .55; snake.angle = Math.atan2(snake.vy, -Math.abs(snake.vx)); hitWall = true; }
    if (snake.y < pad) { snake.y = pad; snake.vy = Math.abs(snake.vy) * .55; snake.angle = Math.atan2(Math.abs(snake.vy), snake.vx); hitWall = true; }
    if (snake.y > WORLD.h - pad) { snake.y = WORLD.h - pad; snake.vy = -Math.abs(snake.vy) * .55; snake.angle = Math.atan2(-Math.abs(snake.vy), snake.vx); hitWall = true; }
    if (hitWall && snake.type === 'player' && snake.invuln <= 0 && buffs.phase <= 0) damage('WALL HUGGER');
    for (let i = 0; i < snake.body.length; i++) {
      const part = snake.body[i];
      if (i === 0) {
        part.x = snake.x; part.y = snake.y;
      } else {
        const prev = snake.body[i - 1];
        const dx = prev.x - part.x, dy = prev.y - part.y;
        const d = len(dx, dy);
        if (d > .0001) {
          const spring = (d - 16.5) * Math.min(1, dt * 23);
          part.x += dx / d * spring;
          part.y += dy / d * spring;
        }
      }
    }
  }

  function damage(label) {
    if (mode !== 'playing' || player.invuln > 0 || buffs.phase > 0) return;
    lives--;
    combo = 0;
    player.invuln = 2;
    shake = 24;
    ripple(player.x, player.y, '#ff668d', 160);
    burst(player.x, player.y, '#ff668d', 20, 175);
    floating(player.x, player.y - 30, '-1 LIFE', '#ff668d');
    say('Lost a life · ' + label.toLowerCase(), '#bb4e43', 2.3, 'negative', 'Avoid walls and snake bodies');
    chirp(220, .22, 'sawtooth', .06, -145);
    if (lives <= 0) endGame();
    refreshHud();
  }

  function killBot(bot, credit = true) {
    if (!bot.alive) return;
    bot.alive = false;
    bot.respawn = time + 3.5;
    burst(bot.x, bot.y, bot.color, 33, 210);
    ripple(bot.x, bot.y, bot.color, 120);
    if (credit) {
      score += 200;
      energy = Math.min(100, energy + 22);
      floating(bot.x, bot.y - 35, '+200 K.O.', '#d6ff59');
      say('Knockout · +200', '#bbd86d', 1.5, 'positive', bot.name + ' is out');
      chirp(420, .24, 'triangle', .05, 260);
    }
    for (let i = 0; i < 4; i++) spawnFood(bot.x + rand(-24, 24), bot.y + rand(-24, 24), undefined, 95);
  }

  function emitReaction(idA, idB) {
    const ids = [idA, idB];
    reactionCooldown = 1.75;
    reactions++;
    energy = Math.min(100, energy + 20);
    combo++;
    if (ids.includes('coral') && ids.includes('cyan')) {
      reactionTitle = 'ION BLAST ⚡';
      reactionHint = 'SHOCKWAVE · STUNS RIVALS';
      ripple(player.x, player.y, '#b3a4ff', 235);
      burst(player.x, player.y, '#9cf5ff', 34, 240);
      for (const bot of bots) {
        if (!bot.alive) continue;
        const dx = bot.x - player.x, dy = bot.y - player.y, d = Math.max(1, len(dx, dy));
        if (d < 245) {
          bot.vx += dx / d * 280; bot.vy += dy / d * 280;
          bot.stun = Math.max(bot.stun, 1.1);
        }
      }
      chirp(260, .38, 'sawtooth', .045, 600);
    } else if (ids.includes('coral') && ids.includes('yellow')) {
      reactionTitle = 'SOLAR FLARE ✳';
      reactionHint = 'POINTS · EXPLOSIVE ORB BLOOM';
      ripple(player.x, player.y, '#ff9466', 200);
      burst(player.x, player.y, '#ffd36b', 52, 235);
      score += 130;
      floating(player.x, player.y - 38, '+130 FLARE', '#ffd36b');
      for (let i = 0; i < 5; i++) spawnFood(player.x + rand(-60, 60), player.y + rand(-60, 60), undefined, 180);
      chirp(330, .28, 'triangle', .045, 480);
    } else {
      reactionTitle = 'GROWTH SPURT ✳';
      reactionHint = 'EXTRA LENGTH · REPAIRS YOUR BODY';
      ripple(player.x, player.y, '#d6ff59', 205);
      burst(player.x, player.y, '#d6ff59', 35, 190);
      grow(player, 4);
      lives = Math.min(4, lives + 1);
      floating(player.x, player.y - 38, '+4 SEGMENTS', '#d6ff59');
      chirp(510, .26, 'sine', .055, 410);
    }
    say(reactionTitle, '#bbd86d', 1.8, 'positive', 'Color reaction triggered');
    refreshHud();
  }

  function eat(snake, food) {
    const isPlayer = snake === player;
    if (isPlayer) {
      const changed = lastColor !== null && lastColor !== food.color;
      if (changed) combo = Math.min(12, combo + 1);
      else combo = 0;
      const bonus = 20 * (1 + Math.min(combo, 5));
      score += bonus;
      energy = Math.min(100, energy + 9);
      snake.body[0].color = C[food.color].hex;
      grow(snake, 1);
      // Pigment spreads down the newest links, leaving a history of color bands.
      for (let j = 1; j < Math.min(snake.body.length, 7); j++) snake.body[j].color = C[food.color].hex;
      burst(food.x, food.y, C[food.color].hex, 9, 100);
      floating(food.x, food.y - 14, '+' + bonus, C[food.color].hex);
      chirp(370 + PALETTE.indexOf(food.color) * 110 + Math.min(5, combo) * 40, .09, 'sine', .035, 80);
      if (changed && reactionCooldown <= 0) emitReaction(lastColor, food.color);
      else {
        say('+' + bonus + ' points', '#bbd86d', .88, 'positive', changed ? 'Different color collected' : 'Try a different color next');
        if (!changed) {
          reactionTitle = C[food.color].label + ' COLLECTED';
          reactionHint = 'NEXT: TRY A DIFFERENT COLOR';
        }
      }
      lastColor = food.color;
    } else {
      grow(snake, 1);
      snake.body[0].color = C[food.color].hex;
      burst(food.x, food.y, C[food.color].hex, 5, 70);
    }
  }

  function collectPickup(snake, pick) {
    if (snake !== player) {
      grow(snake, 2);
      burst(pick.x, pick.y, pick.color, 14, 130);
      if (snake.type === 'trickster') say('Power-up stolen', '#bb4e43', 1.8, 'negative', 'Zig got there first');
      return;
    }
    if (pick.type === 'shield') {
      lives = Math.min(4, lives + 1);
      player.invuln = Math.max(player.invuln, 1);
    } else {
      buffs[pick.type] = Math.max(buffs[pick.type], POWER[pick.type].duration);
    }
    score += 70;
    ripple(pick.x, pick.y, pick.color, 100);
    burst(pick.x, pick.y, pick.color, 26, 150);
    say(POWER[pick.type].name + ' activated', '#bbd86d', 1.65, 'positive', '+70 points · power-up collected');
    floating(pick.x, pick.y - 20, '+70', pick.color);
    chirp(570, .16, 'triangle', .05, 270);
    refreshHud();
  }

  function updatePhysics(dt) {
    for (const food of foods) {
      food.phase += dt * 2.4;
      for (const well of wells) {
        const dx = well.x - food.x, dy = well.y - food.y;
        const d = Math.max(12, len(dx, dy));
        if (d < well.radius * 1.25) {
          const f = (1 - d / (well.radius * 1.25)) * 340;
          food.vx += (dx / d * f - dy / d * f * .75) * dt;
          food.vy += (dy / d * f + dx / d * f * .75) * dt;
        }
      }
      if (buffs.magnet > 0 && player) {
        const dx = player.x - food.x, dy = player.y - food.y;
        const d = Math.max(12, len(dx, dy));
        if (d < 245) {
          const f = (1 - d / 245) * 1000;
          food.vx += dx / d * f * dt;
          food.vy += dy / d * f * dt;
        }
      }
      food.vx *= Math.max(.0, 1 - dt * 1.35);
      food.vy *= Math.max(.0, 1 - dt * 1.35);
      food.x = clamp(food.x + food.vx * dt, 18, WORLD.w - 18);
      food.y = clamp(food.y + food.vy * dt, 18, WORLD.h - 18);
    }
    for (let i = wells.length - 1; i >= 0; i--) {
      wells[i].life -= dt;
      if (wells[i].life <= 0) wells.splice(i, 1);
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      pickups[i].life -= dt;
      if (pickups[i].life <= 0) pickups.splice(i, 1);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - Math.min(.95, dt * p.drag);
      p.vy *= 1 - Math.min(.95, dt * p.drag);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      ring.life -= dt;
      ring.r = ring.max * (1 - ring.life / ring.maxLife);
      if (ring.life <= 0) rings.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      floats[i].life -= dt;
      floats[i].y -= 30 * dt;
      if (floats[i].life <= 0) floats.splice(i, 1);
    }
    if (toastClock > 0) {
      toastClock -= dt;
      if (toastClock <= 0) {
        const toast = $('toast');
        toast.classList.remove('show', 'positive', 'negative');
        toast.classList.add('neutral');
        $('toastKicker').textContent = 'IN PLAY';
        $('toastTitle').textContent = 'Keep moving';
        $('toastDetail').textContent = 'Try another color to trigger a reaction.';
        $('toastIcon').textContent = 'i';
      }
    }
    shake *= Math.max(0, 1 - dt * 8);
    feedbackTint = Math.max(0, feedbackTint - dt * (feedbackMode === 'negative' ? 1.25 : 1.5));
  }

  function collisions() {
    for (const snake of [player, ...bots]) {
      if (!snake.alive) continue;
      for (let i = foods.length - 1; i >= 0; i--) {
        if (dist2(snake, foods[i]) < 21 ** 2) {
          const food = foods.splice(i, 1)[0];
          eat(snake, food);
          spawnFood();
        }
      }
      for (let i = pickups.length - 1; i >= 0; i--) {
        if (dist2(snake, pickups[i]) < 26 ** 2) {
          const pick = pickups.splice(i, 1)[0];
          collectPickup(snake, pick);
        }
      }
    }
    // The player can collide with their own tail or rival bodies; phase grants safe passage.
    if (player.alive && buffs.phase <= 0 && player.invuln <= 0) {
      for (let i = 13; i < player.body.length; i++) {
        if (dist2(player, player.body[i]) < 18 ** 2) { damage('TAIL TROUBLE'); break; }
      }
      for (const bot of bots) {
        if (!bot.alive) continue;
        for (let i = 1; i < bot.body.length; i += 2) {
          if (dist2(player, bot.body[i]) < 22 ** 2) {
            const playerBoosting = (keys.has('Space') || boostingTouch) && energy > 1;
            if (playerBoosting && i <= 5) killBot(bot);
            else damage('SNAKE BITE');
            break;
          }
        }
        if (player.invuln > 0) break;
      }
    }
    for (const bot of bots) {
      if (!bot.alive || bot.invuln > 0) continue;
      for (let i = 5; i < player.body.length; i += 2) {
        if (dist2(bot, player.body[i]) < 19 ** 2) {
          killBot(bot);
          break;
        }
      }
      if (!bot.alive) continue;
      for (const other of bots) {
        if (other === bot || !other.alive) continue;
        for (let i = 6; i < other.body.length; i += 3) {
          if (dist2(bot, other.body[i]) < 18 ** 2) {
            killBot(bot, false);
            break;
          }
        }
        if (!bot.alive) break;
      }
    }
  }

  function update(dt) {
    ambientTime += dt;
    if (mode !== 'playing') {
      updatePhysics(dt * (mode === 'menu' ? .35 : .55));
      return;
    }
    time += dt;
    reactionCooldown = Math.max(0, reactionCooldown - dt);
    for (const buff of Object.keys(buffs)) buffs[buff] = Math.max(0, buffs[buff] - dt);
    const newWave = 1 + Math.floor(time / 36);
    if (newWave > wave) {
      wave = newWave; say('WAVE ' + String(wave).padStart(2, '0') + ' / FASTER RIVALS', '#ffd36b', 2);
      burst(player.x, player.y, '#d6ff59', 24, 130);
    }
    if (time >= nextPickup) {
      const types = Object.keys(POWER);
      const type = types[Math.floor(rand(0, types.length))];
      const p = pointAway(130);
      pickups.push({ ...p, type, color: POWER[type].color, life: 14, spin: rand(0, TAU) });
      nextPickup = time + rand(14, 20);
      floating(p.x, p.y - 35, 'POWER UP', '#d6ff59');
    }
    if (time >= nextWell) {
      const p = pointAway(180);
      wells.push({ ...p, life: 13, maxLife: 13, radius: rand(145, 195), spin: rand(0, TAU) });
      if (wells.length > 2) wells.shift();
      nextWell = time + rand(21, 27);
      say('GRAVITY ANOMALY', '#b69aff', 1.5);
    }
    moveSnake(player, dt);
    for (const bot of bots) {
      if (!bot.alive) {
        if (time >= bot.respawn) {
          const point = pointAway(250);
          const def = BOTS.find(d => d.name === bot.name);
          Object.assign(bot, makeSnake(bot.name, point.x, point.y, rand(0, TAU), def.color, def.type, def.length, def.speed));
          bot.invuln = 2.2;
        }
      } else moveSnake(bot, dt);
    }
    updatePhysics(dt);
    collisions();
    hudClock -= dt;
    if (hudClock <= 0) { refreshHud(); hudClock = .12; }
  }

  function glowingCircle(x, y, r, color, blur = 13) {
    ctx.save();
    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawBackground() {
    // Flat dark ink, quiet dot grid. Brightness is reserved for game-relevant objects.
    ctx.fillStyle = '#1c2828';
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    const step = 44;
    ctx.fillStyle = '#68766b3d';
    for (let x = step / 2; x < WORLD.w; x += step) {
      for (let y = step / 2; y < WORLD.h; y += step) {
        ctx.fillRect(x - .8, y - .8, 1.6, 1.6);
      }
    }
    ctx.strokeStyle = '#75877835';
    ctx.lineWidth = 1;
    ctx.strokeRect(11, 11, WORLD.w - 22, WORLD.h - 22);
  }

  function drawWells() {
    for (const w of wells) {
      const alpha = Math.min(1, w.life * 2, (w.maxLife - w.life) * 2);
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(ambientTime * .34 + w.spin);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#a99bc48f';
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 4; i++) {
        const radius = 26 + i * 24;
        ctx.beginPath();
        ctx.arc(0, 0, radius, i * .6, i * .6 + Math.PI * 1.3);
        ctx.stroke();
      }
      ctx.fillStyle = '#a99bc4';
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#263331';
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawFoods() {
    for (const f of foods) {
      const y = f.y + Math.sin(f.phase) * 2;
      ctx.fillStyle = C[f.color].hex;
      ctx.beginPath(); ctx.arc(f.x, y, f.size, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#e1e8dc80'; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.fillStyle = C[f.color].soft;
      ctx.beginPath(); ctx.arc(f.x - 2, y - 2, Math.max(1.4, f.size * .25), 0, TAU); ctx.fill();
    }
  }

  function drawPickups() {
    for (const p of pickups) {
      const blink = p.life < 4 ? .5 + .5 * Math.abs(Math.sin(ambientTime * 7)) : 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ambientTime * .7 + p.spin);
      ctx.globalAlpha = blink;
      ctx.fillStyle = '#263330';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6;
        const x = Math.cos(a) * 19, y = Math.sin(a) * 19;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.rotate(-ambientTime * .7 - p.spin);
      ctx.fillStyle = p.color;
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(POWER[p.type].symbol, 0, 1);
      ctx.restore();
    }
  }

  function drawSnake(snake) {
    if (!snake.alive) return;
    const isPlayer = snake === player;
    const ghost = isPlayer && buffs.phase > 0;
    ctx.save();
    if (ghost) ctx.globalAlpha = .6 + Math.sin(ambientTime * 15) * .12;
    else if (snake.invuln > 0 && isPlayer) ctx.globalAlpha = .76 + .24 * Math.abs(Math.sin(ambientTime * 9));
    const body = snake.body;
    for (let i = body.length - 1; i >= 1; i--) {
      const part = body[i];
      const taper = Math.min(1, .36 + (body.length - i) / 8);
      const r = (isPlayer ? 11.3 : 10.3) * taper;
      ctx.beginPath();
      ctx.arc(part.x, part.y, r, 0, TAU);
      ctx.fillStyle = i % 4 === 0 ? snake.color : (part.color || snake.color);
      ctx.fill();
      ctx.strokeStyle = isPlayer ? '#e4edce' : '#1d2928';
      ctx.lineWidth = isPlayer ? 1.6 : 1.2;
      ctx.stroke();
      if (i % 5 === 2 && i < body.length - 4) {
        ctx.fillStyle = '#ffffff4d';
        ctx.beginPath();
        ctx.arc(part.x - 2, part.y - 2, 1.7, 0, TAU);
        ctx.fill();
      }
    }
    ctx.translate(snake.x, snake.y);
    ctx.rotate(snake.angle);
    const headColor = isPlayer ? '#bbd86d' : (body[0].color || snake.color);
    ctx.fillStyle = headColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, isPlayer ? 20 : 18.5, isPlayer ? 15.5 : 14.5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = isPlayer ? '#edf3d9' : '#1d2928';
    ctx.lineWidth = isPlayer ? 2.5 : 1.4;
    ctx.stroke();
    ctx.fillStyle = '#202b29';
    ctx.beginPath();
    ctx.ellipse(7, -6, 2.7, 3.3, 0, 0, TAU);
    ctx.ellipse(7, 6, 2.7, 3.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f7f8ec';
    ctx.beginPath();
    ctx.arc(7.7, -6.8, .9, 0, TAU);
    ctx.arc(7.7, 5.3, .9, 0, TAU);
    ctx.fill();
    if (isPlayer && (keys.has('Space') || boostingTouch) && energy > 0) {
      ctx.strokeStyle = '#d5e59f'; ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-21, -7); ctx.lineTo(-34 - Math.random() * 7, -7);
      ctx.moveTo(-21, 7); ctx.lineTo(-34 - Math.random() * 7, 7);
      ctx.stroke();
    }
    ctx.restore();
    if (isPlayer) {
      // This restrained marker remains visible through every color reaction.
      ctx.save();
      ctx.strokeStyle = '#bbd86dc5';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(snake.x, snake.y, 27 + Math.sin(ambientTime * 3) * 1.4, 0, TAU);
      ctx.stroke();
      const x = clamp(snake.x, 30, WORLD.w - 30);
      const above = snake.y > 96;
      const y = snake.y + (above ? -47 : 47);
      ctx.fillStyle = '#bbd86d';
      ctx.fillRect(x - 25, y - 12, 50, 24);
      ctx.fillStyle = '#253329';
      ctx.font = 'bold 12px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('YOU', x, y + 1);
      ctx.restore();
    } else {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d4ded5';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.fillText(snake.name, snake.x, snake.y - 25);
      ctx.restore();
    }
  }

  function drawEffects() {
    for (const ring of rings) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ring.life / ring.maxLife) * .7;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 3 * ring.life / ring.maxLife;
      ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      const r = Math.max(1, p.size * .55 * p.life / p.maxLife);
      ctx.fillRect(p.x - r, p.y - r, 2 * r, 2 * r);
      ctx.restore();
    }
    for (const f of floats) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 13px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  function drawFeedbackFlash() {
    if (feedbackTint <= 0) return;
    const t = feedbackTint;
    const bad = feedbackMode === 'negative';
    const rgb = bad ? '185,70,61' : '187,216,109';
    ctx.save();
    ctx.fillStyle = 'rgba(' + rgb + ',' + (bad ? .18 : .08) * t + ')';
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (bad ? .94 : .62) * t + ')';
    ctx.lineWidth = (bad ? 22 : 9) * t;
    ctx.strokeRect(5, 5, WORLD.w - 10, WORLD.h - 10);
    ctx.restore();
  }

  function render() {
    if (!canvas.width) return;
    ctx.setTransform(canvas.width / WORLD.w, 0, 0, canvas.height / WORLD.h, 0, 0);
    ctx.save();
    if (shake > .2 && mode !== 'menu') ctx.translate(rand(-shake, shake) * .42, rand(-shake, shake) * .42);
    drawBackground();
    drawWells();
    drawFoods();
    drawPickups();
    for (const bot of bots) drawSnake(bot);
    if (player) drawSnake(player);
    drawEffects();
    drawFeedbackFlash();
    ctx.restore();
  }

  function loop(timestamp) {
    const dt = Math.min(.033, (timestamp - (frameLast || timestamp)) / 1000);
    frameLast = timestamp;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  const stickPad = $('joystickPad');
  const stickKnob = $('joystickKnob');
  const stickGroup = $('joystick');

  function resetJoystick() {
    joystick.pressed = false;
    joystick.active = false;
    joystick.pointerId = null;
    stickKnob.style.transform = 'translate(0px, 0px)';
    stickGroup.classList.remove('engaged');
  }

  function steerJoystick(event) {
    const box = stickPad.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    const d = len(dx, dy);
    const max = box.width * .29;
    const factor = d > max ? max / d : 1;
    stickKnob.style.transform = 'translate(' + (dx * factor).toFixed(1) + 'px,' + (dy * factor).toFixed(1) + 'px)';
    if (d >= 7) {
      joystick.angle = Math.atan2(dy, dx);
      joystick.active = true;
    } else joystick.active = false;
  }

  stickPad.addEventListener('pointerdown', (event) => {
    if (mode !== 'playing') return;
    event.preventDefault(); event.stopPropagation();
    joystick.pressed = true; joystick.pointerId = event.pointerId; joystick.active = false;
    pointer.active = false;
    stickGroup.classList.add('engaged');
    stickPad.setPointerCapture(event.pointerId);
    steerJoystick(event);
  });
  stickPad.addEventListener('pointermove', (event) => {
    if (joystick.pressed && joystick.pointerId === event.pointerId) {
      event.preventDefault(); steerJoystick(event);
    }
  });
  function releaseJoystick(event) {
    if (joystick.pressed && joystick.pointerId === event.pointerId) resetJoystick();
  }
  stickPad.addEventListener('pointerup', releaseJoystick);
  stickPad.addEventListener('pointercancel', releaseJoystick);
  stickPad.addEventListener('lostpointercapture', releaseJoystick);

  function setPointer(event) {
    const box = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - box.left) / box.width * WORLD.w;
    pointer.y = (event.clientY - box.top) / box.height * WORLD.h;
    pointer.active = true;
  }

  canvas.addEventListener('pointermove', (e) => {
    if (mode === 'playing') setPointer(e);
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (mode === 'playing') { setPointer(e); canvas.setPointerCapture(e.pointerId); }
  });
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) showPause();
    if (e.code === 'KeyR' && !e.repeat && mode !== 'menu') reset(true);
    if (e.code === 'Enter' && !e.repeat && (mode === 'menu' || mode === 'over')) reset(true);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); boostingTouch = false; resetJoystick(); if (mode === 'playing') showPause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') showPause(); });
  $('playButton').addEventListener('click', () => reset(true));
  $('resumeButton').addEventListener('click', showPause);
  $('restartButton').addEventListener('click', () => reset(true));
  $('pauseButton').addEventListener('click', showPause);
  $('soundButton').addEventListener('click', () => {
    muted = !muted;
    $('soundState').textContent = muted ? 'OFF' : 'ON';
    $('soundButton').setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
    if (!muted) chirp(610, .12, 'sine', .04, 140);
  });

  // A dedicated mobile boost button avoids the need for a keyboard or double tap.
  const boostButton = document.createElement('button');
  boostButton.type = 'button';
  boostButton.textContent = '↗ BOOST';
  boostButton.setAttribute('aria-label', 'Hold to boost');
  boostButton.className = 'touch-boost';
  boostButton.style.display = 'none';
  arena.appendChild(boostButton);
  function syncBoostButton() { boostButton.style.display = matchMedia('(pointer:coarse)').matches && mode === 'playing' ? 'block' : 'none'; }
  boostButton.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); boostingTouch = true; boostButton.setPointerCapture(e.pointerId); });
  boostButton.addEventListener('pointerup', () => { boostingTouch = false; });
  boostButton.addEventListener('pointercancel', () => { boostingTouch = false; });
  boostButton.addEventListener('lostpointercapture', () => { boostingTouch = false; });
  // Track scene mode without polling every frame for the mobile control.
  const observer = new MutationObserver(syncBoostButton);
  observer.observe($('menu'), { attributes: true, attributeFilter: ['class'] });
  observer.observe($('pauseScreen'), { attributes: true, attributeFilter: ['class'] });
  observer.observe($('gameOverScreen'), { attributes: true, attributeFilter: ['class'] });
  // Keep mobile button hidden on the paused/game-over overlays.
  function updateBoostVisibility() {
    boostButton.style.display = matchMedia('(pointer:coarse)').matches && mode === 'playing' ? 'block' : 'none';
  }
  // MutationObserver runs at the end of the input task, after mode changes.
  window.addEventListener('resize', () => { resize(); updateBoostVisibility(); });
  resize();
  reset(false);
  updateBoostVisibility();
  requestAnimationFrame(loop);
})();
