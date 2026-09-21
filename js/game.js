(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlaySub = document.getElementById("overlay-sub");
  const overlayBody = document.getElementById("overlay-body");
  const overlayBtn = document.getElementById("overlay-btn");
  const elDistance = document.getElementById("distance");
  const elSpeed = document.getElementById("speed");
  const elBest = document.getElementById("best");
  const btnLeft = document.getElementById("btn-left");
  const btnRight = document.getElementById("btn-right");
  const btnAccel = document.getElementById("btn-accel");

  const BEST_KEY = "neon-racing-best";
  const BASE_W = 360;
  const BASE_H = 640;

  const state = {
    mode: "title", // title | playing | over
    keys: { left: false, right: false, accel: false },
    player: null,
    enemies: [],
    obstacles: [],
    particles: [],
    roadOffset: 0,
    distance: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0) || 0,
    speed: 0,
    targetSpeed: 0,
    spawnTimer: 0,
    obstacleTimer: 0,
    shake: 0,
    lastTs: 0,
    roadPulse: 0,
  };

  elBest.textContent = String(Math.floor(state.best));

  function resizeCanvas() {
    const wrap = document.getElementById("canvas-wrap");
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.viewW = cssW;
    state.viewH = cssH;
    state.scale = Math.min(cssW / BASE_W, cssH / BASE_H);
  }

  function roadMetrics() {
    const w = state.viewW;
    const h = state.viewH;
    const roadW = Math.min(w * 0.78, 300 * state.scale);
    const left = (w - roadW) / 2;
    return { w, h, roadW, left, right: left + roadW, laneCount: 3 };
  }

  function resetRun() {
    const m = roadMetrics();
    const carW = 42 * state.scale;
    const carH = 68 * state.scale;
    state.player = {
      x: m.w / 2,
      y: m.h * 0.78,
      w: carW,
      h: carH,
      vx: 0,
    };
    state.enemies = [];
    state.obstacles = [];
    state.particles = [];
    state.roadOffset = 0;
    state.distance = 0;
    state.speed = 180;
    state.targetSpeed = 220;
    state.spawnTimer = 0.8;
    state.obstacleTimer = 1.6;
    state.shake = 0;
    state.roadPulse = 0;
  }

  function showOverlay(title, sub, body, btnText) {
    overlayTitle.textContent = title;
    overlaySub.textContent = sub;
    overlayBody.innerHTML = body || "";
    overlayBtn.textContent = btnText;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function startGame() {
    resetRun();
    state.mode = "playing";
    hideOverlay();
  }

  function endGame() {
    state.mode = "over";
    const dist = Math.floor(state.distance);
    if (dist > state.best) {
      state.best = dist;
      localStorage.setItem(BEST_KEY, String(state.best));
      elBest.textContent = String(state.best);
    }
    showOverlay(
      "撞车了！",
      "再来一局，刷新纪录",
      `本次距离 <strong>${dist}</strong> m<br/>最高纪录 <strong>${Math.floor(state.best)}</strong> m`,
      "再来一局"
    );
    burstParticles(state.player.x, state.player.y, "#ff6ec7", 28);
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function pickLaneX(m) {
    const laneW = m.roadW / m.laneCount;
    const lane = Math.floor(Math.random() * m.laneCount);
    return m.left + laneW * (lane + 0.5);
  }

  function spawnEnemy() {
    const m = roadMetrics();
    const colors = ["#ff6ec7", "#7cf9ff", "#b388ff", "#ffd166", "#06d6a0"];
    state.enemies.push({
      x: pickLaneX(m),
      y: -80 * state.scale,
      w: 40 * state.scale,
      h: 64 * state.scale,
      speed: rand(40, 110),
      color: colors[Math.floor(Math.random() * colors.length)],
      wobble: Math.random() * Math.PI * 2,
    });
  }

  function spawnObstacle() {
    const m = roadMetrics();
    const laneW = m.roadW / m.laneCount;
    const lane = Math.floor(Math.random() * m.laneCount);
    const kind = Math.random() < 0.55 ? "barrel" : "cone";
    state.obstacles.push({
      kind,
      x: m.left + laneW * (lane + 0.5),
      y: -50 * state.scale,
      w: (kind === "barrel" ? 28 : 22) * state.scale,
      h: (kind === "barrel" ? 34 : 28) * state.scale,
    });
  }

  function burstParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(60, 260);
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.35, 0.9),
        color,
        size: rand(2, 5) * state.scale,
      });
    }
  }

  function aabb(a, b, pad) {
    const p = pad || 0;
    return (
      Math.abs(a.x - b.x) < (a.w + b.w) * 0.5 - p &&
      Math.abs(a.y - b.y) < (a.h + b.h) * 0.5 - p
    );
  }

  function update(dt) {
    const m = roadMetrics();
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 8);

    // particles always
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.life <= 0) state.particles.splice(i, 1);
    }

    if (state.mode !== "playing") {
      state.roadOffset += 120 * dt;
      state.roadPulse += dt;
      return;
    }

    const p = state.player;
    const steer = (state.keys.left ? -1 : 0) + (state.keys.right ? 1 : 0);
    const accelBoost = state.keys.accel ? 1 : 0;

    // progressive difficulty
    const progress = state.distance / 1000;
    state.targetSpeed = 220 + progress * 55 + accelBoost * 140;
    state.speed += (state.targetSpeed - state.speed) * Math.min(1, dt * 2.2);
    if (!accelBoost && state.speed > state.targetSpeed) {
      state.speed += (state.targetSpeed - state.speed) * Math.min(1, dt * 3);
    }

    p.vx += steer * 980 * dt;
    p.vx *= Math.pow(0.08, dt); // friction-ish damping
    if (Math.abs(steer) < 0.01) p.vx *= Math.pow(0.02, dt);
    p.x += p.vx * dt;

    const margin = p.w * 0.55;
    const minX = m.left + margin;
    const maxX = m.right - margin;
    if (p.x < minX) {
      p.x = minX;
      p.vx = 0;
    }
    if (p.x > maxX) {
      p.x = maxX;
      p.vx = 0;
    }

    state.roadOffset += state.speed * dt;
    state.distance += (state.speed * dt) / 8;
    state.roadPulse += dt * (1 + state.speed / 300);

    // spawn
    state.spawnTimer -= dt;
    state.obstacleTimer -= dt;
    const enemyInterval = Math.max(0.55, 1.35 - progress * 0.12);
    const obsInterval = Math.max(0.9, 2.2 - progress * 0.15);
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      state.spawnTimer = enemyInterval + rand(0, 0.4);
    }
    if (state.obstacleTimer <= 0) {
      spawnObstacle();
      state.obstacleTimer = obsInterval + rand(0, 0.5);
    }

    // move entities
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      e.y += (state.speed - e.speed) * dt;
      e.wobble += dt * 2;
      e.x += Math.sin(e.wobble) * 18 * dt * state.scale;
      // keep on road
      e.x = Math.max(m.left + e.w * 0.5, Math.min(m.right - e.w * 0.5, e.x));
      if (e.y > m.h + 100) state.enemies.splice(i, 1);
      else if (aabb(p, e, 8 * state.scale)) {
        state.shake = 1;
        endGame();
        return;
      }
    }

    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const o = state.obstacles[i];
      o.y += state.speed * dt;
      if (o.y > m.h + 80) state.obstacles.splice(i, 1);
      else if (aabb(p, o, 6 * state.scale)) {
        state.shake = 1;
        endGame();
        return;
      }
    }

    // trail sparks when accelerating
    if (accelBoost && Math.random() < 0.45) {
      state.particles.push({
        x: p.x + rand(-p.w * 0.25, p.w * 0.25),
        y: p.y + p.h * 0.45,
        vx: rand(-30, 30),
        vy: rand(40, 120),
        life: rand(0.15, 0.35),
        color: Math.random() < 0.5 ? "#7cf9ff" : "#ff6ec7",
        size: rand(1.5, 3.5) * state.scale,
      });
    }

    elDistance.textContent = String(Math.floor(state.distance));
    elSpeed.textContent = String(Math.floor(state.speed / 4));
  }

  function drawCar(x, y, w, h, color, isPlayer) {
    ctx.save();
    ctx.translate(x, y);

    // glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 18 * state.scale;

    // body
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.25, color);
    g.addColorStop(1, "#1a1030");
    ctx.fillStyle = g;
    roundRect(-w / 2, -h / 2, w, h, 8 * state.scale);
    ctx.fill();

    // windshield
    ctx.shadowBlur = 0;
    ctx.fillStyle = isPlayer ? "rgba(180, 240, 255, 0.85)" : "rgba(40, 20, 60, 0.75)";
    roundRect(-w * 0.32, -h * 0.28, w * 0.64, h * 0.22, 4 * state.scale);
    ctx.fill();

    // lights
    ctx.fillStyle = isPlayer ? "#fff8c0" : "#ff4466";
    ctx.fillRect(-w * 0.38, -h / 2 + 2, w * 0.18, 5 * state.scale);
    ctx.fillRect(w * 0.2, -h / 2 + 2, w * 0.18, 5 * state.scale);

    // stripe
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(-2 * state.scale, -h * 0.1, 4 * state.scale, h * 0.45);

    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawObstacle(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    if (o.kind === "barrel") {
      ctx.shadowColor = "#ff9f1c";
      ctx.shadowBlur = 12 * state.scale;
      const g = ctx.createLinearGradient(-o.w / 2, 0, o.w / 2, 0);
      g.addColorStop(0, "#5c2a00");
      g.addColorStop(0.5, "#ff9f1c");
      g.addColorStop(1, "#5c2a00");
      ctx.fillStyle = g;
      roundRect(-o.w / 2, -o.h / 2, o.w, o.h, 6 * state.scale);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#1a0a00";
      ctx.fillRect(-o.w / 2, -o.h * 0.15, o.w, o.h * 0.18);
      ctx.fillRect(-o.w / 2, o.h * 0.12, o.w, o.h * 0.18);
    } else {
      ctx.shadowColor = "#ff6ec7";
      ctx.shadowBlur = 10 * state.scale;
      ctx.fillStyle = "#ff6ec7";
      ctx.beginPath();
      ctx.moveTo(0, -o.h / 2);
      ctx.lineTo(o.w / 2, o.h / 2);
      ctx.lineTo(-o.w / 2, o.h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      ctx.fillRect(-o.w * 0.12, -o.h * 0.05, o.w * 0.24, o.h * 0.35);
    }
    ctx.restore();
  }

  function draw() {
    const m = roadMetrics();
    const w = m.w;
    const h = m.h;

    ctx.save();
    if (state.shake > 0) {
      const mag = state.shake * 8 * state.scale;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    // sky / night bg
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#12082a");
    bg.addColorStop(0.45, "#0a0618");
    bg.addColorStop(1, "#05040f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // side neon strips
    const pulse = 0.55 + 0.45 * Math.sin(state.roadPulse * 3);
    ctx.fillStyle = `rgba(180, 60, 255, ${0.12 + pulse * 0.1})`;
    ctx.fillRect(0, 0, m.left, h);
    ctx.fillRect(m.right, 0, w - m.right, h);

    // city glow dots on sides
    ctx.fillStyle = "rgba(124, 249, 255, 0.35)";
    for (let i = 0; i < 18; i++) {
      const sy = ((i * 47 + state.roadOffset * 0.35) % (h + 40)) - 20;
      const sx = (i % 2 === 0 ? m.left * 0.35 : m.right + (w - m.right) * 0.55);
      ctx.beginPath();
      ctx.arc(sx + (i * 13) % 20, sy, 1.5 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }

    // road
    const roadGrad = ctx.createLinearGradient(m.left, 0, m.right, 0);
    roadGrad.addColorStop(0, "#1a1430");
    roadGrad.addColorStop(0.5, "#12101f");
    roadGrad.addColorStop(1, "#1a1430");
    ctx.fillStyle = roadGrad;
    ctx.fillRect(m.left, 0, m.roadW, h);

    // road edge neon
    ctx.strokeStyle = `rgba(255, 110, 199, ${0.55 + pulse * 0.35})`;
    ctx.lineWidth = 4 * state.scale;
    ctx.shadowColor = "#ff6ec7";
    ctx.shadowBlur = 12 * state.scale;
    ctx.beginPath();
    ctx.moveTo(m.left, 0);
    ctx.lineTo(m.left, h);
    ctx.moveTo(m.right, 0);
    ctx.lineTo(m.right, h);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // lane dashes
    const dashH = 28 * state.scale;
    const gap = 36 * state.scale;
    const period = dashH + gap;
    const off = state.roadOffset % period;
    ctx.strokeStyle = `rgba(124, 249, 255, ${0.45 + pulse * 0.25})`;
    ctx.lineWidth = 3 * state.scale;
    ctx.setLineDash([]);
    ctx.shadowColor = "#7cf9ff";
    ctx.shadowBlur = 8 * state.scale;
    for (let lane = 1; lane < m.laneCount; lane++) {
      const x = m.left + (m.roadW / m.laneCount) * lane;
      for (let y = -period + off; y < h + period; y += period) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + dashH);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;

    // obstacles & enemies
    for (const o of state.obstacles) drawObstacle(o);
    for (const e of state.enemies) drawCar(e.x, e.y, e.w, e.h, e.color, false);

    if (state.player) {
      drawCar(state.player.x, state.player.y, state.player.w, state.player.h, "#7cf9ff", true);
    }

    // particles
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life * 1.4);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // vignette
    const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.75);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();
  }

  function loop(ts) {
    if (!state.lastTs) state.lastTs = ts;
    let dt = (ts - state.lastTs) / 1000;
    state.lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // --- input ---
  function setKey(name, down) {
    state.keys[name] = down;
    const map = { left: btnLeft, right: btnRight, accel: btnAccel };
    const el = map[name];
    if (el) el.classList.toggle("active", down);
  }

  function bindTouchButton(el, name) {
    const on = (e) => {
      e.preventDefault();
      setKey(name, true);
    };
    const off = (e) => {
      e.preventDefault();
      setKey(name, false);
    };
    el.addEventListener("touchstart", on, { passive: false });
    el.addEventListener("touchend", off, { passive: false });
    el.addEventListener("touchcancel", off, { passive: false });
    el.addEventListener("mousedown", on);
    el.addEventListener("mouseup", off);
    el.addEventListener("mouseleave", off);
  }

  bindTouchButton(btnLeft, "left");
  bindTouchButton(btnRight, "right");
  bindTouchButton(btnAccel, "accel");

  // multitouch: track multiple fingers on canvas-wrap area via controls only
  // also support holding multiple buttons

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (["arrowleft", "a", "arrowright", "d", "arrowup", "w", " ", "enter"].includes(k) || e.code === "Space") {
      e.preventDefault();
    }
    if (k === "arrowleft" || k === "a") setKey("left", true);
    if (k === "arrowright" || k === "d") setKey("right", true);
    if (k === "arrowup" || k === "w" || k === " " || e.code === "Space") setKey("accel", true);
    if ((k === "enter" || k === " ") && state.mode !== "playing") {
      startGame();
    }
    if (k === "r" && state.mode === "over") startGame();
  });

  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") setKey("left", false);
    if (k === "arrowright" || k === "d") setKey("right", false);
    if (k === "arrowup" || k === "w" || k === " " || e.code === "Space") setKey("accel", false);
  });

  overlayBtn.addEventListener("click", (e) => {
    e.preventDefault();
    startGame();
  });

  // prevent page scroll/zoom while playing
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.target.closest("#app")) e.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener(
    "gesturestart",
    (e) => e.preventDefault(),
    { passive: false }
  );

  window.addEventListener("resize", () => {
    const wasPlaying = state.mode === "playing";
    const dist = state.distance;
    const spd = state.speed;
    const keys = { ...state.keys };
    resizeCanvas();
    if (wasPlaying && state.player) {
      // keep relative player x
      const m = roadMetrics();
      state.player.w = 42 * state.scale;
      state.player.h = 68 * state.scale;
      state.player.y = m.h * 0.78;
      state.player.x = Math.max(m.left + state.player.w * 0.55, Math.min(m.right - state.player.w * 0.55, state.player.x));
      state.distance = dist;
      state.speed = spd;
      state.keys = keys;
    }
  });

  // boot
  resizeCanvas();
  showOverlay(
    "霓虹狂飙",
    "躲避对手与障碍，冲得越远越好",
    "触屏左右转向 · 中间加速<br/>键盘 ←→ / A D · ↑ W 空格",
    "开始游戏"
  );
  requestAnimationFrame(loop);
})();
