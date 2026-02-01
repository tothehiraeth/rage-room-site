// UPDATED RAGE ROOM VERSION — 02 FEB
// =====================
// RAGEROOM — room.js (Stable build)
// =====================

/* ---------------------
   Elements
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

if (!canvas || !ctx) console.error("fxCanvas missing or no 2d context");
if (!avatarWrap) console.error(".avatar-wrap missing");

/* ---------------------
   Helpers
--------------------- */
function rand(min, max) { return Math.random() * (max - min) + min; }

/* ---------------------
   Canvas sizing
--------------------- */
function resizeCanvas() {
  if (!canvas || !ctx || !avatarWrap) return;
  const rect = avatarWrap.getBoundingClientRect();

  canvas.width = Math.floor(rect.width * devicePixelRatio);
  canvas.height = Math.floor(rect.height * devicePixelRatio);

  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";

  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* ---------------------
   Load user setup
--------------------- */
const storedName = localStorage.getItem("rageName") || "TARGET";
const storedGender = (localStorage.getItem("rageGender") || "male").toLowerCase();
const storedImg = localStorage.getItem("rageImage"); // data:image...

if (targetNameEl) targetNameEl.textContent = storedName;

if (avatarImg) {
  if (storedImg && storedImg.startsWith("data:image")) {
    avatarImg.src = storedImg;
  } else {
    avatarImg.src = storedGender === "female" ? "assets/female.png" : "assets/male.png";
  }
}

/* ---------------------
   Weapon + damage
--------------------- */
let weapon = "fist";
const weaponConfig = {
  fist:   { dmg: 10, shake: 7  },
  bat:    { dmg: 14, shake: 10 },
  knife:  { dmg: 18, shake: 8  },
  hammer: { dmg: 16, shake: 13 }
};

document.querySelectorAll(".weapon").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".weapon").forEach(b => b.classList.remove("btn-red"));
    btn.classList.add("btn-red");
    weapon = btn.dataset.weapon || "fist";
  });
});

let damage = 0;     // bar only caps at 100, but hits continue
let bloodPool = 0;  // 0..1

function setDamage(v) {
  damage = Math.max(0, Math.min(100, v));
  if (damageFill) damageFill.style.width = `${damage}%`;
}
function addDamage(v) { setDamage(damage + v); }

/* ---------------------
   Sounds (weapon)
--------------------- */
const sounds = {
  fist: new Audio("assets/hit.mp3"),
  bat: new Audio("assets/bat.mp3"),
  knife: new Audio("assets/knife.mp3"),
  hammer: new Audio("assets/hammer.mp3"),
};
Object.values(sounds).forEach(a => { a.preload = "auto"; a.volume = 0.9; });

function playWeaponSound() {
  const a = sounds[weapon];
  if (!a) return;
  try { a.pause(); a.currentTime = 0; } catch {}
  a.play().catch(() => {});
}

/* ---------------------
   Groans (1 per 15s max)
--------------------- */
const groans = {
  male: new Audio("assets/male-groan.mp3"),
  female: new Audio("assets/female-groan.mp3"),
};
groans.male.preload = groans.female.preload = "auto";
groans.male.volume = groans.female.volume = 0.9;

let lastGroanAt = { male: 0, female: 0 };
const GROAN_COOLDOWN_MS = 15000;

function maybePlayGroan() {
  const key = storedGender === "female" ? "female" : "male";
  const now = Date.now();
  if (now - lastGroanAt[key] < GROAN_COOLDOWN_MS) return;

  // not every hit (feels better)
  if (Math.random() > 0.35) return;

  lastGroanAt[key] = now;
  const a = groans[key];
  try { a.pause(); a.currentTime = 0; } catch {}
  a.play().catch(() => {});
}

/* ---------------------
   Screen shake
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
    stage.style.transform = "translate(0,0)";
  }
}

/* ---------------------
   Avatar shake (weapon-specific via CSS classes)
--------------------- */
function avatarHitReact() {
  if (!avatarWrap) return;

  const cls =
    weapon === "hammer" ? "shake-hammer" :
    weapon === "bat"    ? "shake-bat" :
    weapon === "knife"  ? "shake-knife" :
                          "shake-fist";

  avatarWrap.classList.remove("shake-hammer","shake-bat","shake-knife","shake-fist");
  void avatarWrap.offsetWidth;
  avatarWrap.classList.add(cls);

  setTimeout(() => avatarWrap.classList.remove(cls), 260);
}

/* ---------------------
   Weapon overlay FX
--------------------- */
let weaponFxEl = null;
if (avatarWrap) {
  weaponFxEl = document.createElement("div");
  weaponFxEl.className = "weapon-fx";
  avatarWrap.appendChild(weaponFxEl);
}

function showWeaponFx(x, y) {
  if (!weaponFxEl) return;

  const icon =
    weapon === "hammer" ? "🔨" :
    weapon === "bat"    ? "🪵" :
    weapon === "knife"  ? "🔪" :
                          "👊";

  const el = document.createElement("div");
  el.className = "icon";
  el.textContent = icon;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;

  weaponFxEl.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

/* ---------------------
   FX state
--------------------- */
const splats = [];
const particles = [];
const tags = [];

/* ---------------------
   Dripping wounds (knife)
--------------------- */
const dripSources = [];
const drips = [];

function spawnWound(x, y) {
  dripSources.push({
    x,
    y,
    rate: 0.55,
    life: 1400,
    strength: rand(0.9, 1.3),
  });
  if (dripSources.length > 12) dripSources.shift();
}

function spawnDrip(x, y, strength = 1) {
  drips.push({
    x: x + rand(-10, 10),
    y: y + rand(-2, 6),
    vy: rand(3.5, 7.5) * strength,
    w: rand(2.8, 6.2) * strength,
    h: rand(14, 36) * strength,
    a: 0.95,
  });
  if (drips.length > 260) drips.shift();
}

function updateAndDrawDrips() {
  if (!ctx || !canvas) return;
  const H = canvas.clientHeight;

  // sources generate drips
  for (let i = dripSources.length - 1; i >= 0; i--) {
    const s = dripSources[i];
    if (Math.random() < s.rate) spawnDrip(s.x, s.y, s.strength);

    s.life--;
    s.rate *= 0.9992;

    if (s.life <= 0 || s.rate < 0.05) dripSources.splice(i, 1);
  }

  // drips fall + feed pool
  for (let i = drips.length - 1; i >= 0; i--) {
    const d = drips[i];
    d.y += d.vy;
    d.vy += 0.12;
    d.a -= 0.0018;

    ctx.fillStyle = `rgba(255,0,0,${d.a})`;
    ctx.fillRect(d.x, d.y, d.w, d.h);

    ctx.fillStyle = `rgba(255,255,255,${d.a * 0.08})`;
    ctx.fillRect(d.x + d.w * 0.2, d.y + d.h * 0.15, d.w * 0.25, d.h * 0.35);

    if (d.y + d.h > H - 8) {
      splats.push({ x: d.x + rand(-8, 8), y: H - rand(10, 18), r: rand(14, 26), alpha: 0.85 });
      bloodPool = Math.min(1, bloodPool + 0.006);
      drips.splice(i, 1);
      continue;
    }

    if (d.a <= 0 || d.y > H + 80) drips.splice(i, 1);
  }
}

/* ---------------------
   Blood splats + particles
--------------------- */
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

function spawnSplat(x, y) {
  const r = weapon === "hammer" ? 60 : weapon === "bat" ? 52 : 34;
  splats.push({ x, y, r, alpha: 0.98 });
  if (splats.length > 90) splats.shift();
}

function drawSplats() {
  for (const s of splats) {
    const grad = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, s.r);
    grad.addColorStop(0, `rgba(255,0,0,${s.alpha})`);
    grad.addColorStop(1, `rgba(90,0,0,${s.alpha * 0.55})`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();

    s.alpha -= 0.0008;
    if (s.alpha < 0.45) s.alpha = 0.45;
  }
}

function drawParticles() {
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
}

/* ---------------------
   Rage tags
--------------------- */
function spawnTag(text, x, y) {
  tags.push({
    text, x, y,
    vx: rand(-1.6, 1.6),
    vy: rand(-3.4, -1.8),
    rot: rand(-0.35, 0.35),
    size: rand(28, 58),
    a: 1,
    life: 220 + Math.floor(rand(0, 160))
  });
  if (tags.length > 20) tags.shift();
}

function drawTags() {
  for (let i = tags.length - 1; i >= 0; i--) {
    const t = tags[i];
    t.x += t.vx;
    t.y += t.vy;
    t.vy += 0.02;
    t.life -= 1;
    if (t.life < 80) t.a -= 0.015;
    if (t.a <= 0 || t.life <= 0) { tags.splice(i, 1); continue; }

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

/* ---------------------
   Blood pool
--------------------- */
function drawBloodPool() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  const poolH = Math.floor(h * 0.35 * bloodPool);
  if (poolH < 3) return;

  const grad = ctx.createLinearGradient(0, h - poolH, 0, h);
  grad.addColorStop(0, "rgba(255,0,0,0.65)");
  grad.addColorStop(0.55, "rgba(190,0,0,0.82)");
  grad.addColorStop(1, "rgba(80,0,0,0.98)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, h - poolH, w, poolH);
}

/* ---------------------
   HIT logic
--------------------- */
function doHit(x, y) {
  const cfg = weaponConfig[weapon] || weaponConfig.fist;

  addDamage(cfg.dmg);

  bloodPool = Math.min(1, bloodPool + (weapon === "hammer" ? 0.07 : weapon === "knife" ? 0.06 : 0.05));

  playWeaponSound();
  maybePlayGroan();
  avatarHitReact();
  showWeaponFx(x, y);
  stageShake(cfg.shake);

  spawnSplat(x, y);
  spawnDroplets(x, y);

  if (weapon === "knife") spawnWound(x, y);

  const typed = rageInput?.value?.trim();
  if (typed) spawnTag(typed, x, y);
}

/* Click/tap anywhere on the avatar card */
avatarWrap?.addEventListener("pointerdown", (e) => {
  const r = avatarWrap.getBoundingClientRect();
  doHit(e.clientX - r.left, e.clientY - r.top);
});

/* HIT button */
hitBtn?.addEventListener("click", () => {
  const x = canvas.clientWidth * 0.5;
  const y = canvas.clientHeight * 0.55;
  doHit(x, y);
});

/* Release */
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
  if (e.key === "Enter") { e.preventDefault(); releaseRage(); }
});

/* Reset -> home */
resetBtn?.addEventListener("click", () => {
  window.location.href = "index.html";
});

/* ---------------------
   Animation loop
--------------------- */
function animate() {
  if (!ctx || !canvas) return;

  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  updateAndDrawDrips();   // ✅ knife bleeding drips
  drawSplats();
  drawParticles();
  drawTags();
  drawBloodPool();

  applyStageShake();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

