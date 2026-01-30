// =====================
// RAGEROOM — room.js (Clean rebuild)
// =====================

/* ---------------------
   1) Grab elements
--------------------- */
const stage = document.getElementById("stage");
const canvas = document.getElementById("fxCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

const rageInput = document.getElementById("rageInput");
const releaseBtn = document.getElementById("releaseBtn");
const hitBtn = document.getElementById("hitBtn");
const resetBtn = document.getElementById("resetBtn");
const damageFill = document.getElementById("damageFill");

const avatarImg = document.getElementById("avatarImg");
const targetNameEl = document.getElementById("targetName");
const avatarWrap = document.querySelector(".avatar-wrap");

// Fail fast but don’t crash silently
const missing = [];
if (!stage) missing.push("stage");
if (!canvas) missing.push("fxCanvas");
if (!ctx) missing.push("canvas 2d context");
if (!rageInput) missing.push("rageInput");
if (!releaseBtn) missing.push("releaseBtn");
if (!hitBtn) missing.push("hitBtn");
if (!resetBtn) missing.push("resetBtn");
if (!damageFill) missing.push("damageFill");
if (!avatarImg) missing.push("avatarImg");
if (!targetNameEl) missing.push("targetName");
if (!avatarWrap) missing.push(".avatar-wrap");
if (missing.length) {
  console.error("❌ Missing required elements:", missing);
}

/* ---------------------
   2) Load user setup
--------------------- */
const storedName = localStorage.getItem("rageName") || "TARGET";
const storedGender = localStorage.getItem("rageGender") || "male";
const storedImg = localStorage.getItem("rageImage"); // data:image/... base64

if (targetNameEl) targetNameEl.textContent = storedName;

if (avatarImg) {
  if (storedImg && storedImg.startsWith("data:image")) {
    avatarImg.src = storedImg; // uploaded image
  } else {
    avatarImg.src = storedGender === "female" ? "assets/female.png" : "assets/male.png";
  }
}

/* ---------------------
   3) Weapon + damage
--------------------- */
let weapon = "fist";

const weaponConfig = {
  fist:   { dmg: 10, shake: 6,  splat: "soft"  },
  bat:    { dmg: 14, shake: 10, splat: "heavy" },
  hammer: { dmg: 16, shake: 12, splat: "crack" },
  knife:  { dmg: 18, shake: 8,  splat: "slash" }
};

document.querySelectorAll(".weapon").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".weapon").forEach(b => b.classList.remove("btn-red"));
    btn.classList.add("btn-red");
    weapon = btn.dataset.weapon || "fist";
  });
});

let damage = 0;     // 0..100 for display only
let bloodPool = 0;  // 0..1

function setDamage(v) {
  damage = Math.max(0, Math.min(100, v));
  if (damageFill) damageFill.style.width = `${damage}%`;
}
function addDamage(v) {
  // Allow hits forever, but bar caps at 100
  setDamage(damage + v);
}

/* ---------------------
   4) Sounds
--------------------- */
const sounds = {
  fist: new Audio("assets/hit.mp3"),
  bat: new Audio("assets/bat.mp3"),
  knife: new Audio("assets/knife.mp3"),
  hammer: new Audio("assets/hammer.mp3")
};

Object.values(sounds).forEach(a => {
  a.preload = "auto";
  a.volume = 0.9;
});

function playSound() {
  const a = sounds[weapon];
  if (!a) return;
  try { a.pause(); a.currentTime = 0; } catch {}
  a.play().catch(() => {});
}

/* ---------------------
   5) Canvas sizing + cursor
--------------------- */
function resizeCanvas() {
  if (!canvas || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * devicePixelRatio);
  canvas.height = Math.floor(rect.height * devicePixelRatio);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function rand(min, max) { return Math.random() * (max - min) + min; }

let cursor = { x: 0, y: 0, inside: false };

function pointFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// Hit wherever you tap/click on the avatar card
avatarWrap?.addEventListener("pointerdown", (e) => {
  const r = avatarWrap.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;

  // quick debug (remove later)
  console.log("HIT AT:", x, y);

  doHit(x, y);
});

canvas?.addEventListener("mouseleave", () => {
  cursor.inside = false;
});

/* ---------------------
   6) Shake (stage + avatar)
--------------------- */
let shakeFrames = 0;
let shakePower = 0;

function stageShake(power) {
  shakeFrames = 10;
  shakePower = power;
}

function applyStageShake() {
  if (!stage) return;
  if (shakeFrames > 0) {
    stage.style.transform = `translate(${rand(-shakePower, shakePower)}px, ${rand(-shakePower, shakePower)}px)`;
    shakeFrames--;
  } else {
    stage.style.transform = "translate(0px,0px)";
  }
}

// Avatar shake uses CSS classes .hit and .hit-hard
function avatarHitReact() {
  if (!avatarWrap) return;
  const hard = weapon === "hammer" || weapon === "bat";
  const cls = hard ? "hit-hard" : "hit";

  avatarWrap.classList.remove("hit", "hit-hard");
  void avatarWrap.offsetWidth; // retrigger
  avatarWrap.classList.add(cls);

  setTimeout(() => avatarWrap.classList.remove(cls), hard ? 170 : 130);
}

/* ---------------------
   7) FX state
--------------------- */
const splats = [];      // persistent blood blobs/slashes
const particles = [];   // flying droplets
const bruises = [];     // dark bruises
const wounds = [];      // bold knife slashes
const tags = [];        // rage text
const drips = [];      // active falling drops
const dripSources = []; // points that keep releasing drops


function spawnBruise(x, y) {
  bruises.push({
    x: x + rand(-10, 10),
    y: y + rand(-10, 10),
    r: rand(20, 46),
    a: Math.min(0.55, damage / 180) // stronger
  });
  if (bruises.length > 30) bruises.shift();
}

function spawnWound(x, y) {
  // instead of drawing a "slash", we create a dripping source
  dripSources.push({
    x,
    y,
    rate: 0.45,         // how often drops spawn (0..1 probability each frame)
    life: 900,          // frames (about 15s at 60fps)
    strength: rand(0.8, 1.2) // drop size multiplier
  });

  if (dripSources.length > 10) dripSources.shift();
}


function spawnDroplets(x, y) {
  const base = weapon === "hammer" ? 70 : weapon === "bat" ? 60 : weapon === "knife" ? 55 : 45;
  for (let i = 0; i < base; i++) {
    particles.push({
      x, y,
      vx: rand(-7, 7),
      vy: rand(-12, -2),
      g: rand(0.20, 0.34),
      r: rand(2.2, 6.8),
      a: 1
    });
  }
  if (particles.length > 650) particles.splice(0, particles.length - 650);
}

function spawnSplat(x, y, kind) {
  let r = 34;
  if (kind === "heavy") r = 52;
  if (kind === "crack") r = 60;

  splats.push({
    x, y,
    r,
    kind,
    rot: rand(0, Math.PI * 2),
    alpha: 0.98
  });
  if (splats.length > 90) splats.shift();
}

function spawnSlash(x, y) {
  splats.push({
    x, y,
    r: rand(55, 85),
    kind: "slash",
    rot: rand(-0.7, 0.7),
    alpha: 0.95
  });
  if (splats.length > 90) splats.shift();
}

function spawnTag(text, x, y) {
  tags.push({
    text,
    x: x + rand(-10, 10),
    y: y + rand(-8, 8),
    vx: rand(-1.6, 1.6),
    vy: rand(-3.4, -1.8),
    rot: rand(-0.35, 0.35),
    size: rand(28, 58),
    a: 1,
    life: 220 + Math.floor(rand(0, 160))
  });
  if (tags.length > 20) tags.shift();
}

/* ---------------------
   8) Drawing
--------------------- */
function drawBruises() {
  for (const b of bruises) {
    ctx.beginPath();
    ctx.fillStyle = `rgba(15,15,18,${b.a})`;
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWounds() {
  for (const w of wounds) {
    // bold red slash
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(w.rot);

    ctx.strokeStyle = `rgba(255,0,0,${w.a})`;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-w.len / 2, 0);
    ctx.lineTo(w.len / 2, 0);
    ctx.stroke();

    // wet highlight
    ctx.strokeStyle = `rgba(255,140,140,${w.a * 0.7})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w.len / 2, 4);
    ctx.lineTo(w.len / 2, 4);
    ctx.stroke();

    ctx.restore();

    // dripping blood lines
    if (Math.random() < 0.12) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,0,0,${w.a})`;
      ctx.lineWidth = rand(2, 5);
      ctx.moveTo(w.x + rand(-10, 10), w.y + w.dripOffset);
      ctx.lineTo(w.x + rand(-12, 12), w.y + w.dripOffset + rand(25, 85));
      ctx.stroke();
    }

    // wounds stay visible (slight fade only)
    w.a -= 0.0012;
    if (w.a < 0.7) w.a = 0.7;
  }
}

function drawSplat(s) {
  if (s.kind === "slash") {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);

    ctx.strokeStyle = `rgba(200,0,0,${s.alpha})`;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-s.r / 2, 0);
    ctx.lineTo(s.r / 2, 0);
    ctx.stroke();

    ctx.restore();
    return;
  }

  // blob splat
  const grad = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, s.r);
  grad.addColorStop(0, `rgba(255,0,0,${s.alpha})`);
  grad.addColorStop(1, `rgba(90,0,0,${s.alpha * 0.55})`);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
  ctx.fill();

  // spikes
  const spikes = s.kind === "crack" ? 14 : s.kind === "heavy" ? 12 : 10;
  ctx.fillStyle = `rgba(255,0,0,${s.alpha * 0.65})`;
  for (let i = 0; i < spikes; i++) {
    const ang = (Math.PI * 2 / spikes) * i + rand(-0.18, 0.18);
    const len = rand(s.r * 0.35, s.r * 1.05);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + Math.cos(ang) * len, s.y + Math.sin(ang) * len);
    ctx.lineTo(s.x + Math.cos(ang + 0.3) * len * 0.55, s.y + Math.sin(ang + 0.3) * len * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  // random drip from splats
  if (Math.random() < 0.25) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(255,0,0,${s.alpha * 0.55})`;
    ctx.lineWidth = rand(2, 4);
    const startX = s.x + rand(-12, 12);
    const startY = s.y + rand(10, 18);
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + rand(-10, 10), startY + rand(25, 90));
    ctx.stroke();
  }
}

function drawTags() {
  for (const t of tags) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.rot);

    ctx.font = `900 ${t.size}px Impact`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = `rgba(0,0,0,${t.a * 0.65})`;
    ctx.fillText(t.text, 4, 4);

    ctx.fillStyle = `rgba(255,0,0,${t.a})`;
    ctx.fillText(t.text, -2, 1);

    ctx.fillStyle = `rgba(255,255,255,${t.a})`;
    ctx.fillText(t.text, 0, 0);

    ctx.restore();
  }
}
function spawnDrip(x, y, strength = 1) {
  drips.push({
    x: x + rand(-10, 10),
    y: y + rand(-4, 6),
    vy: rand(3.2, 6.8) * strength,
    w: rand(2.5, 5.5) * strength,
    h: rand(10, 30) * strength,
    a: 0.95
  });

  if (drips.length > 220) drips.shift();
}

function updateDripSources() {
  for (let i = dripSources.length - 1; i >= 0; i--) {
    const s = dripSources[i];

    // spawn a drip randomly each frame
    if (Math.random() < s.rate) {
      spawnDrip(s.x, s.y, s.strength);
    }

    s.life--;
    // slowly reduce rate (so it feels like bleeding slows down)
    s.rate *= 0.9992;

    if (s.life <= 0 || s.rate < 0.04) {
      dripSources.splice(i, 1);
    }
  }
}

function updateAndDrawDrips() {
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;

  for (let i = drips.length - 1; i >= 0; i--) {
    const d = drips[i];

    d.y += d.vy;
    d.vy += 0.10;        // gravity
    d.a -= 0.002;        // very slow fade

    // draw stretched drop (looks like blood running)
    ctx.fillStyle = `rgba(255,0,0,${d.a})`;
    ctx.fillRect(d.x, d.y, d.w, d.h);

    // little glossy highlight
    ctx.fillStyle = `rgba(255,255,255,${d.a * 0.10})`;
    ctx.fillRect(d.x + d.w * 0.2, d.y + d.h * 0.1, d.w * 0.25, d.h * 0.3);

    // hit bottom -> splat and feed pool
    if (d.y + d.h > H - (H * 0.02)) {
      // small splat where it lands
      splats.push({
        x: d.x + rand(-6, 6),
        y: H - rand(8, 16),
        r: rand(12, 22),
        kind: "soft",
        rot: rand(0, Math.PI * 2),
        alpha: 0.8
      });

      // increase pool slightly from each drip impact
      bloodPool = Math.min(1, bloodPool + 0.003);

      drips.splice(i, 1);
      continue;
    }

    // remove if offscreen or invisible
    if (d.y > H + 60 || d.a <= 0) {
      drips.splice(i, 1);
    }
  }
}

function drawBloodPool() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  const poolH = Math.floor(h * 0.35 * bloodPool); // bigger & more visible
  if (poolH < 3) return;

  const grad = ctx.createLinearGradient(0, h - poolH, 0, h);
  grad.addColorStop(0, "rgba(255,0,0,0.65)");
  grad.addColorStop(0.55, "rgba(190,0,0,0.82)");
  grad.addColorStop(1, "rgba(80,0,0,0.98)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, h - poolH, w, poolH);

  // glossy top lip
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, h - poolH, w, poolH * 0.14);
}

/* ---------------------
   9) Hit + Release
--------------------- */
function doHit(x, y) {
  const cfg = weaponConfig[weapon] || weaponConfig.fist;

  addDamage(cfg.dmg);

  // pool grows aggressively with hits
  bloodPool = Math.min(1, bloodPool + (weapon === "hammer" ? 0.07 : weapon === "knife" ? 0.06 : 0.05));

  playSound();
  avatarHitReact();
  stageShake(cfg.shake);

  // Spawn effects
  if (cfg.splat === "slash") spawnSlash(x, y);
  else spawnSplat(x, y, cfg.splat);

  spawnDroplets(x, y);
  spawnBruise(x, y);

  if (weapon === "knife") spawnWound(x, y);

  const typed = rageInput?.value?.trim();
  if (typed) spawnTag(typed, x, y);
}

canvas?.addEventListener("mousedown", (e) => {
  const p = pointFromEvent(e);
  doHit(p.x, p.y);
});

hitBtn?.addEventListener("click", () => {
  const x = cursor.inside ? cursor.x : canvas.clientWidth * 0.5;
  const y = cursor.inside ? cursor.y : canvas.clientHeight * 0.55;
  doHit(x, y);
});

function releaseRage() {
  const t = rageInput.value.trim();
  if (!t) return;
  const x = canvas.clientWidth * 0.5;
  const y = canvas.clientHeight * 0.78;
  for (let i = 0; i < 4; i++) spawnTag(t, x + rand(-60, 60), y + rand(-25, 25));
  rageInput.value = "";
}

releaseBtn?.addEventListener("click", releaseRage);
rageInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    releaseRage();
  }
});

resetBtn?.addEventListener("click", () => {
  window.location.href = "index.html";
});

/* ---------------------
   10) Animation loop
--------------------- */
function animate() {
  if (!ctx || !canvas) return;

  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
updateDripSources();
updateAndDrawDrips();

  drawBruises();
  drawWounds();

  for (let i = 0; i < splats.length; i++) {
    drawSplat(splats[i]);
    // blood stays visible but "dries" slightly
    splats[i].alpha -= 0.0008;
    if (splats[i].alpha < 0.45) splats[i].alpha = 0.45;
  }

  // droplets physics
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += p.g;
    p.x += p.vx;
    p.y += p.vy;
    p.a -= 0.02;

    ctx.beginPath();
    ctx.fillStyle = `rgba(255,0,0,${Math.max(0, p.a)})`;
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();

    if (p.a <= 0 || p.y > canvas.clientHeight + 40) particles.splice(i, 1);
  }

  // tags physics
  for (let i = tags.length - 1; i >= 0; i--) {
    const t = tags[i];
    t.x += t.vx;
    t.y += t.vy;
    t.vy += 0.02;
    t.life -= 1;
    if (t.life < 80) t.a -= 0.015;
    if (t.a <= 0 || t.life <= 0) tags.splice(i, 1);
  }
  drawTags();

  // aim ring
  if (cursor.inside) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.arc(cursor.x, cursor.y, 18, 0, Math.PI * 2);
    ctx.stroke();
  }

  // pool on top
  drawBloodPool();

  applyStageShake();

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
