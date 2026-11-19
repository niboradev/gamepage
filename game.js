/* 잿불의 왕관 (가제) — Stage 1 build.
 * 2D belt-scroll action: warrior + mage, local co-op, level-ups, items, score,
 * forest road -> fortress courtyard -> golem boss. Plain canvas, no libraries.
 * Logical screen 1280x720. */
(() => {
"use strict";

// ================================================================ constants
const W = 1280, H = 720;
const LANE_TOP = 478, LANE_BOT = 694;        // feet y range (belt depth)
const BG_H = 720;
const DEPTH_TOL = 46;
const GRAV = 2600;
const WORLD_W = 6720;
const FOREST_END = 3600;                     // background switches to the courtyard here

const CLASSES = {
  warrior: { name: "전사", sprite: "warrior", hp: 170, mp: 100, speed: 250, head: [0.49, 0.15, 0.22], color: "#d8463a" },
  mage:    { name: "마법사", sprite: "mage",  hp: 115, mp: 120, speed: 240, head: [0.37, 0.2, 0.26], color: "#3f6fe0" },
};

// key-pose frames cut from AI pose sheets. ax = feet anchor x (px from left), px = screen px per frame px
const FRAMES = {
  warrior: { px: 262 / 516, f: {
    idle: { src: "warrior/w_a_idle", ax: 261.3 }, wind: { src: "warrior/w_a_wind", ax: 212.9 },
    slash: { src: "warrior/w_a_slash", ax: 160.8 }, rise: { src: "warrior/w_b_rise", ax: 215.2 },
    chop: { src: "warrior/w_b_chop", ax: 227.2 },
    // walk/run anchors = torso centre + (idle feet anchor - idle torso centre) so poses don't jump
    walk1: { src: "warrior/w_walk1", ax: 266.6 }, walk2: { src: "warrior/w_walk2", ax: 204.5 }, walk3: { src: "warrior/w_walk3", ax: 258.6 },
    run1: { src: "warrior/w_run1", ax: 303.3 }, run2: { src: "warrior/w_run2", ax: 292.0 }, run3: { src: "warrior/w_run3", ax: 279.5 } } },
  mage: { px: 268 / 535, f: {
    idle: { src: "mage/m_idle", ax: 138 }, cast: { src: "mage/m_cast", ax: 188.5 }, storm: { src: "mage/m_storm", ax: 195.4 },
    walk1: { src: "mage/m_walk1", ax: 162.8 }, walk2: { src: "mage/m_walk2", ax: 130.8 }, walk3: { src: "mage/m_walk3", ax: 178.1 },
    run1: { src: "mage/m_run1", ax: 197.4 }, run2: { src: "mage/m_run2", ax: 192.1 }, run3: { src: "mage/m_run3", ax: 193.9 } } },
  orc: { px: 286 / 515, f: {
    idle: { src: "orc/o_idle", ax: 138.8 }, wind: { src: "orc/o_wind", ax: 131.7 }, strike: { src: "orc/o_strike", ax: 206.2 } } },
  archer: { px: 250 / 633, f: {
    idle: { src: "archer/a_idle", ax: 150 }, draw: { src: "archer/a_draw", ax: 171.8 }, release: { src: "archer/a_release", ax: 160.6 } } },
  golem: { px: 560 / 900, f: {
    idle: { src: "golem", ax: 424 }, wind: { src: "golem/g_wind", ax: 277.2 },
    slam: { src: "golem/g_slam", ax: 446.9 }, sweep: { src: "golem/g_sweep", ax: 228.1 } } },
};
const ALL_IMAGES = ["warrior", "mage", "orc", "golem", "background", "forest",
  ...new Set(Object.values(FRAMES).flatMap((k) => Object.values(k.f).map((f) => f.src)))];

// waves: [type, side(+1 right / -1 left), row 0..2]
const ZONES = [
  { at: 1280, wave: [["orc", 1, 0], ["orc", 1, 2], ["orc", -1, 1]] },
  { at: 2560, wave: [["orc", 1, 0], ["orc", 1, 1], ["archer", 1, 2], ["orc", -1, 2]] },
  { at: 3840, banner: ["요새 앞마당", "성벽 위로 오크의 깃발이 걸려 있다"], wave: [["orc", 1, 0], ["archer", 1, 1], ["archer", 1, 2], ["orc", -1, 0], ["orc", -1, 2]] },
  { at: 5120, wave: [["orc", 1, 0], ["orc", 1, 1], ["orc", 1, 2], ["archer", 1, 1], ["orc", -1, 1], ["archer", -1, 0]] },
  { at: 6720, boss: true },
];
const ENEMY = {
  orc:    { hp: 70, dmg: 11, speed: 135, score: 100, xp: 34, shadow: 82 },
  archer: { hp: 42, dmg: 9,  speed: 150, score: 150, xp: 30, shadow: 60 },
};

// ================================================================ canvas
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let RES = 1;
function fitCanvas() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  RES = Math.max(1, Math.min(2, (r.width * dpr) / W));
  canvas.width = Math.round(W * RES);
  canvas.height = Math.round(H * RES);
}
window.addEventListener("resize", fitCanvas);

// ================================================================ assets
const IMG = {}, SIL = {}, PORTRAIT = {};
function loadImg(name) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => { IMG[name] = im; res(); };
    im.onerror = () => res();
    im.src = "assets/" + name + ".webp";
  });
}
function makeSilhouette(name, color) {
  const im = IMG[name]; if (!im) return;
  const c = document.createElement("canvas");
  c.width = im.width; c.height = im.height;
  const g = c.getContext("2d");
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  SIL[name + color] = c;
}
function makePortrait(cls) {
  const def = CLASSES[cls], im = IMG[def.sprite]; if (!im) return;
  const s = 96, c = document.createElement("canvas"); c.width = c.height = s;
  const g = c.getContext("2d");
  const cw = im.width * def.head[2];
  const sx = im.width * def.head[0] - cw / 2, sy = im.height * def.head[1] - cw / 2;
  g.save(); g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = "#2a1c12"; g.fillRect(0, 0, s, s);
  g.drawImage(im, sx, sy, cw, cw, 0, 0, s, s);
  g.restore();
  PORTRAIT[cls] = c;
}
const FG = document.createElement("canvas");
function buildForeground() {
  FG.width = 1600; FG.height = 200;
  const g = FG.getContext("2d");
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let layer = 0; layer < 2; layer++) {
    g.fillStyle = layer ? "rgba(18,24,10,0.92)" : "rgba(40,48,20,0.55)";
    for (let i = 0; i < 260; i++) {
      const x = rnd() * FG.width, h = 40 + rnd() * (layer ? 120 : 160), w = 6 + rnd() * 10;
      const lean = (rnd() - 0.5) * 60;
      g.beginPath();
      g.moveTo(x - w, 200); g.quadraticCurveTo(x + lean * 0.4, 200 - h * 0.6, x + lean, 200 - h);
      g.quadraticCurveTo(x + lean * 0.5, 200 - h * 0.5, x + w, 200);
      g.fill();
    }
  }
}

// ================================================================ storage (best score)
function loadBest() { try { return Number(localStorage.getItem("coe_best") || 0); } catch (e) { return 0; } }
function saveBest(v) { try { localStorage.setItem("coe_best", String(v)); } catch (e) { /* storage blocked */ } }

// ================================================================ audio
let AC = null, muted = false, master = null;
function audioOn() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.9; master.connect(AC.destination);
  } catch (e) { AC = null; }
}
const outNode = () => master || (AC && AC.destination);
function noise(dur, freq, q, gain, type = "bandpass", when = 0) {
  if (!AC || muted) return;
  const len = Math.max(1, Math.floor(AC.sampleRate * dur));
  const buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = AC.createBufferSource(); src.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const gn = AC.createGain(); gn.gain.value = gain;
  src.connect(f).connect(gn).connect(outNode()); src.start(when || AC.currentTime);
}
function tone(f0, f1, dur, gain, type = "sine", when = 0) {
  if (!AC || muted) return;
  const t0 = when || AC.currentTime;
  const o = AC.createOscillator(), gn = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  gn.gain.setValueAtTime(gain, t0);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn).connect(outNode()); o.start(t0); o.stop(t0 + dur + 0.02);
}
const later = (s) => (AC ? AC.currentTime + s : 0);
const SFX = {
  swing: () => noise(0.14, 1800, 0.8, 0.25),
  hit: () => { noise(0.12, 600, 1.2, 0.5); tone(160, 60, 0.12, 0.35, "triangle"); },
  heavy: () => { noise(0.25, 300, 0.9, 0.7); tone(110, 35, 0.3, 0.5, "triangle"); },
  bolt: () => tone(900, 300, 0.18, 0.12, "sawtooth"),
  zap: () => { noise(0.3, 3000, 0.6, 0.35, "highpass"); tone(220, 80, 0.25, 0.2, "square"); },
  boom: () => { noise(0.6, 120, 0.7, 0.9, "lowpass"); tone(70, 25, 0.6, 0.6, "sine"); },
  hurt: () => tone(300, 120, 0.15, 0.2, "square"),
  bow: () => { tone(500, 180, 0.12, 0.12, "triangle"); noise(0.08, 2500, 1, 0.12); },
  coin: () => { tone(1320, 1320, 0.07, 0.12, "square"); tone(1760, 1760, 0.12, 0.1, "square", later(0.06)); },
  heal: () => { [660, 880, 1100].forEach((f, i) => tone(f, f * 1.01, 0.14, 0.1, "sine", later(i * 0.06))); },
  level: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 0.15, "triangle", later(i * 0.07))); },
  roar: () => { noise(0.9, 180, 0.5, 0.6, "lowpass"); tone(90, 50, 0.9, 0.35, "sawtooth"); },
};

// tiny step sequencer for background music
const MUSIC = {
  stage: { bpm: 112, root: 57, bass: [0, 0, 7, 0, 5, 5, 3, 2], lead: [12, 15, 19, 15, 17, 15, 14, 10], drums: "k.h.s.h.k.k.s.h." },
  boss:  { bpm: 138, root: 52, bass: [0, 0, 1, 0, 0, 0, 6, 5], lead: [12, 13, 12, 18, 17, 13, 12, 7], drums: "k.hks.hkk.hks.hs" },
};
let music = { song: null, step: 0, next: 0, timer: null };
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function playMusic(name) {
  if (music.song === name) return;
  stopMusic(); music.song = name;
  if (!AC) return;
  music.next = AC.currentTime + 0.1;
  music.timer = setInterval(() => {
    if (!AC || !music.song) return;
    const s = MUSIC[music.song], step = 60 / s.bpm / 2;
    while (music.next < AC.currentTime + 0.2) {
      const i = music.step, t = music.next;
      if (!muted) {
        const d = s.drums[i % 16];
        if (d === "k") tone(120, 40, 0.18, 0.28, "sine", t);
        if (d === "s") noise(0.12, 1800, 0.7, 0.16, "bandpass", t);
        if (d === "h") noise(0.03, 7000, 1, 0.05, "highpass", t);
        if (i % 2 === 0) { const n = midi(s.root - 12 + s.bass[(i >> 1) % 8]); tone(n, n, step * 1.8, 0.09, "sawtooth", t); }
        if (i % 4 === 2 || (music.song === "boss" && i % 2 === 1)) { const n = midi(s.root + s.lead[(i >> 1) % 8]); tone(n, n, step * 0.9, 0.035, "square", t); }
      }
      music.step++; music.next += step;
    }
  }, 30);
}
function stopMusic() { if (music.timer) clearInterval(music.timer); music = { song: null, step: 0, next: 0, timer: null }; }

// ================================================================ input
const KEYMAP = [
  { left: ["KeyA"], right: ["KeyD"], up: ["KeyW"], down: ["KeyS"], attack: ["KeyJ"], jump: ["KeyK", "Space"], special: ["KeyL"] },
  { left: ["ArrowLeft"], right: ["ArrowRight"], up: ["ArrowUp"], down: ["ArrowDown"], attack: ["Comma", "Numpad1"], jump: ["Period", "Numpad2"], special: ["Slash", "Numpad3"] },
];
const keys = new Set(), pressedOnce = new Set();
window.addEventListener("keydown", (e) => {
  audioOn();
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressedOnce.add(e.code);
  keys.add(e.code);
  if (e.code === "KeyM") muted = !muted;
  if (e.code === "Escape" || e.code === "KeyP") togglePause();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

const touch = { x: 0, y: 0, attack: false, jump: false, special: false, edge: new Set() };
const pads = [{}, {}];
function readPads() {
  const gp = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < 2; i++) {
    const p = gp && gp[i], prev = pads[i];
    if (!p) { pads[i] = {}; continue; }
    const ax = Math.abs(p.axes[0]) > 0.25 ? p.axes[0] : 0, ay = Math.abs(p.axes[1]) > 0.25 ? p.axes[1] : 0;
    const b = (n) => !!(p.buttons[n] && p.buttons[n].pressed);
    const cur = {
      x: ax || (b(15) ? 1 : 0) - (b(14) ? 1 : 0), y: ay || (b(13) ? 1 : 0) - (b(12) ? 1 : 0),
      attack: b(2), jump: b(0), special: b(1) || b(3), start: b(9),
    };
    cur.edge = new Set(["attack", "jump", "special", "start"].filter((k) => cur[k] && !prev[k]));
    if (cur.edge.size) audioOn();
    if (cur.edge.has("start")) togglePause();
    pads[i] = cur;
  }
}
function controls(idx) {
  const m = KEYMAP[idx], any = (arr) => arr.some((k) => keys.has(k)), once = (arr) => arr.some((k) => pressedOnce.has(k));
  const p = pads[idx] || {}, pe = p.edge || new Set();
  const c = {
    x: (any(m.right) ? 1 : 0) - (any(m.left) ? 1 : 0) + (p.x || 0),
    y: (any(m.down) ? 1 : 0) - (any(m.up) ? 1 : 0) + (p.y || 0),
    attack: once(m.attack) || pe.has("attack"), jump: once(m.jump) || pe.has("jump"),
    special: once(m.special) || pe.has("special"), start: pe.has("start"),
  };
  if (idx === 0) {
    c.x += touch.x; c.y += touch.y;
    c.attack ||= touch.edge.has("attack"); c.jump ||= touch.edge.has("jump"); c.special ||= touch.edge.has("special");
    if (pressedOnce.has("Enter")) c.start = true;
  }
  c.x = Math.max(-1, Math.min(1, c.x)); c.y = Math.max(-1, Math.min(1, c.y));
  return c;
}
const touchUI = document.getElementById("touch");
if (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window) touchUI.hidden = false;
const stick = document.getElementById("stick"), knob = document.getElementById("knob");
let stickId = null;
function stickMove(e) {
  const r = stick.getBoundingClientRect();
  let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
  touch.x = Math.abs(dx) > 0.2 ? dx : 0; touch.y = Math.abs(dy) > 0.2 ? dy : 0;
  knob.style.transform = `translate(calc(-50% + ${dx * r.width * 0.32}px), calc(-50% + ${dy * r.height * 0.32}px))`;
}
stick.addEventListener("pointerdown", (e) => { audioOn(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); });
stick.addEventListener("pointermove", (e) => { if (e.pointerId === stickId) stickMove(e); });
const stickEnd = (e) => { if (e.pointerId !== stickId) return; stickId = null; touch.x = touch.y = 0; knob.style.transform = "translate(-50%,-50%)"; };
stick.addEventListener("pointerup", stickEnd); stick.addEventListener("pointercancel", stickEnd);
document.querySelectorAll(".btn").forEach((b) => {
  const k = b.dataset.k;
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); audioOn(); touch[k] = true; touch.edge.add(k); b.classList.add("on"); });
  const up = () => { touch[k] = false; b.classList.remove("on"); };
  b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("pointerleave", up);
});
document.getElementById("fs").addEventListener("click", () => {
  const el = document.getElementById("screen");
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) Promise.resolve(req.call(el)).catch(() => {});
});

// ================================================================ helpers
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 1 - Math.pow(1 - t, 3);
const depthScale = (y) => 0.86 + 0.14 * (y - LANE_TOP) / (LANE_BOT - LANE_TOP);
const pad0 = (n, w) => String(Math.max(0, Math.floor(n))).padStart(w, "0");

// ================================================================ world
let G = null;
function newGame(p1Class) {
  G = {
    mode: "play", t: 0, camX: 0, lock: ZONES[0].at, zone: 0, zoneActive: false,
    players: [], enemies: [], shots: [], eshots: [], items: [], fx: [], texts: [], tele: [], dust: [],
    hitstop: 0, shake: 0, slow: 0, goT: 0, intro: true,
    banner: { title: "STAGE 1  국경의 숲", sub: "오크 군단이 국경 요새를 포위했다. 숲길을 지나 성문을 되찾아라.", t: 0, life: 4 },
    boss: null, clearT: 0, kills: 0, maxCombo: 0, continues: 0, deaths: 0, endT: 0, result: null,
  };
  G.players.push(makePlayer(0, p1Class, 300, 590));
  for (let i = 0; i < 40; i++) G.dust.push({ x: rand(0, W), y: rand(0, H * 0.75), s: rand(1, 3), v: rand(6, 18), p: rand(0, 6) });
  if (location.hash === "#boss") { // dev shortcut: start in the boss arena
    G.zone = ZONES.length - 1; G.lock = WORLD_W; G.camX = WORLD_W - W; G.players[0].x = G.camX + 300; G.banner = null; G.intro = false;
  }
  playMusic("stage");
}
function makePlayer(idx, cls, x, y) {
  const d = CLASSES[cls];
  return {
    kind: "player", idx, cls, x, y, z: 0, vz: 0, vx: 0, face: 1,
    hp: d.hp, maxHp: d.hp, mp: d.mp, maxMp: d.mp, lvl: 1, xp: 0, atk: 1, score: 0, combo: 0, comboT: 0,
    state: "idle", st: 0, hitIds: new Set(), inv: 1.2, flash: 0, lives: 3, respawn: 0, walkT: 0, airAtk: false, step: 0, combo_i: 0, running: false, tapDir: 0, tapT: -1, prevDir: 0, phase: 0, puffT: 0,
  };
}
function makeEnemy(type, x, y) {
  const d = ENEMY[type];
  const k = (1 + G.zone * 0.3) * (1 + 0.5 * (G.players.length - 1));
  const hp = Math.round(d.hp * k);
  return {
    kind: "enemy", type, x, y, z: 0, vz: 0, vx: 0, face: -1, hp, maxHp: hp, dmg: Math.round(d.dmg * (1 + G.zone * 0.2)),
    state: "enter", st: 0, cd: rand(0.8, 1.8), flash: 0, tint: 0, walkT: rand(0, 5), side: 1, hold: rand(0, 1), dead: false,
  };
}
function makeBoss(x) {
  const hp = Math.round(1500 * (1 + 0.6 * (G.players.length - 1)));
  return { kind: "boss", x, y: 585, z: 900, vz: 0, face: -1, hp, maxHp: hp, state: "drop", st: 0, cd: 2.2, flash: 0, tint: 0, walkT: 0, target: null, rage: false, dead: false };
}

// ================================================================ effects
function addFx(f) { G.fx.push(Object.assign({ t: 0 }, f)); }
function sparks(x, y, n, col, spd = 600) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), v = rand(spd * 0.4, spd);
    addFx({ type: "spark", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.18, 0.35), col, w: rand(2, 4) });
  }
}
function debris(x, y, n) {
  for (let i = 0; i < n; i++) addFx({ type: "rock", x: x + rand(-40, 40), y, vx: rand(-420, 420), vy: rand(-900, -300), life: rand(0.6, 1.1), s: rand(5, 14), gy: y + rand(0, 40) });
}
function floatText(x, y, txt, col, big = false) { G.texts.push({ x, y, txt, col, big, t: 0, life: big ? 1.4 : 0.8 }); }
function shake(a) { G.shake = Math.max(G.shake, a); }

// ================================================================ combat
const alive = (e) => !!e && !e.dead && e.state !== "dead" && !(e.kind === "boss" && e.state === "drop");
function sameLane(a, b, tol = DEPTH_TOL) { return Math.abs(a.y - b.y) < tol; }
function setState(e, s) { e.state = s; e.st = 0; if (!/[wW]ind|aim/.test(s)) e.tint = 0; }
function addScore(p, n) { if (p && p.kind === "player") p.score += n; }

function damage(target, amt, src, opt = {}) {
  if (!alive(target)) return false;
  if (target.kind === "player" && (target.inv > 0 || target.state === "down" || target.state === "getup")) return false;
  amt = Math.round(amt * rand(0.92, 1.08));
  target.hp -= amt;
  target.flash = 0.12;
  const hx = target.x, hy = target.y - (target.kind === "boss" ? 300 : 150) - target.z;
  const fromX = src ? src.x : hx;
  floatText(hx + rand(-20, 20), hy - 30, String(amt), target.kind === "player" ? "#ff6a5a" : (opt.crit ? "#ffe27a" : "#ffffff"), opt.crit);
  sparks(lerp(fromX, hx, 0.7), hy + 40, opt.heavy ? 22 : 12, opt.col || "#fff3c4", opt.heavy ? 900 : 650);
  addFx({ type: "impact", x: lerp(fromX, hx, 0.7), y: hy + 40, life: opt.heavy ? 0.16 : 0.1, r: opt.heavy ? 130 : 80, col: opt.col || "#ffffff" });
  if (opt.heavy) addFx({ type: "speed", x: hx, y: hy + 40, life: 0.22 });
  G.hitstop = Math.max(G.hitstop, opt.stop ?? (opt.heavy ? 0.11 : 0.06));
  shake(opt.heavy ? 12 : 5);
  (opt.heavy ? SFX.heavy : SFX.hit)();

  const credit = opt.owner || src;
  if (credit && credit.kind === "player" && target.kind !== "player") {
    credit.mp = Math.min(credit.maxMp, credit.mp + 3);
    credit.combo = credit.comboT > 0 ? credit.combo + 1 : 1; credit.comboT = 1.3;
    G.maxCombo = Math.max(G.maxCombo, credit.combo);
    addScore(credit, 10 + credit.combo * 2);
  }
  const dir = (src ? Math.sign(target.x - src.x) : 0) || 1;
  if (target.kind === "boss") { if (target.hp <= 0) killBoss(target, credit); return true; }
  if (target.hp <= 0) {
    target.hp = 0;
    setState(target, "dead"); target.vx = dir * 520; target.vz = 620; target.z = Math.max(target.z, 1);
    if (target.kind === "enemy") {
      G.kills++; grantXp(credit, ENEMY[target.type].xp); addScore(credit, ENEMY[target.type].score);
      dropLoot(target);
    } else { SFX.hurt(); target.respawn = 3; G.deaths++; target.combo = 0; }
    return true;
  }
  if (opt.down || target.z > 0) { setState(target, "down"); target.vx = dir * (opt.knock || 420); target.vz = 520; target.z = Math.max(target.z, 1); }
  else { setState(target, "hurt"); target.vx = dir * (opt.knock || 160); }
  if (target.kind === "player") { SFX.hurt(); target.combo = 0; }
  return true;
}
const xpNeed = (l) => 60 + l * 45;
function grantXp(src, amt) {
  for (const p of G.players) {
    if (p.state === "dead" && p.lives <= 0) continue;
    p.xp += p === src ? amt : Math.round(amt * 0.5);
    while (p.xp >= xpNeed(p.lvl)) {
      p.xp -= xpNeed(p.lvl); p.lvl++;
      p.maxHp = Math.round(CLASSES[p.cls].hp * (1 + 0.14 * (p.lvl - 1))); p.hp = p.maxHp; p.mp = p.maxMp;
      p.atk = 1 + 0.12 * (p.lvl - 1);
      floatText(p.x, p.y - 300, "LEVEL UP!", "#ffd75e", true);
      addFx({ type: "ring", x: p.x, y: p.y, life: 0.6, col: "#ffd75e", r: 160 });
      sparks(p.x, p.y - 140, 26, "#ffe9a3", 500);
      SFX.level();
    }
  }
}
function dropLoot(e) {
  const r = Math.random(), kinds = ["coin"];
  if (r < 0.24) kinds.push("potion");
  if (r > 0.85) kinds.push("gem");
  for (const kind of kinds) G.items.push({ kind, x: e.x + rand(-30, 30), y: clamp(e.y + rand(-10, 10), LANE_TOP, LANE_BOT), z: 60, vz: rand(400, 600), vx: rand(-120, 120), t: 0 });
}
function updateItems(dt) {
  for (const it of G.items) {
    it.t += dt;
    if (it.z > 0 || it.vz > 0) { it.vz -= GRAV * dt; it.z += it.vz * dt; it.x += it.vx * dt; if (it.z <= 0) { it.z = 0; it.vz = it.vz < -200 ? -it.vz * 0.35 : 0; it.vx *= 0.5; } }
    for (const p of G.players) {
      if (p.state === "dead" || it.taken || it.t < 0.4) continue;
      if (Math.abs(p.x - it.x) < 55 && Math.abs(p.y - it.y) < 34 && p.z < 60) {
        it.taken = true;
        if (it.kind === "potion") { const h = Math.round(p.maxHp * 0.35); p.hp = Math.min(p.maxHp, p.hp + h); floatText(p.x, p.y - 290, "+" + h, "#7dff8a", true); SFX.heal(); sparks(p.x, p.y - 140, 14, "#9dffb0", 360); }
        else { const v = it.kind === "gem" ? 500 : 50; addScore(p, v); floatText(it.x, it.y - 60, "+" + v, "#ffe27a"); SFX.coin(); }
      }
    }
  }
  G.items = G.items.filter((it) => !it.taken && it.t < 14);
}
function targetsInFront(p, range, back = 30, tol = DEPTH_TOL, zMax = 140) {
  const out = [];
  for (const e of G.enemies) {
    if (!alive(e)) continue;
    const dx = (e.x - p.x) * p.face;
    if (dx > -back && dx < range && sameLane(p, e, tol) && Math.abs(e.z - p.z) < zMax) out.push(e);
  }
  const b = G.boss;
  if (alive(b)) {
    const dx = (b.x - p.x) * p.face;
    if (dx > -back - 120 && dx < range + 120 && Math.abs(b.y - p.y) < tol + 40) out.push(b);
  }
  return out;
}
const everyTarget = () => [...G.enemies, G.boss].filter(alive);

// ================================================================ players
const WAR_COMBO = [
  { wind: 0.07, act: 0.15, end: 0.30, dmg: 13, range: 175, knock: 140 },
  { wind: 0.07, act: 0.15, end: 0.32, dmg: 15, range: 180, knock: 160 },
  { wind: 0.15, act: 0.25, end: 0.52, dmg: 26, range: 205, knock: 520, heavy: true, down: true },
];
const MAGE_COMBO = [
  { wind: 0.09, end: 0.30, dmg: 10, big: false },
  { wind: 0.09, end: 0.30, dmg: 10, big: false },
  { wind: 0.16, end: 0.48, dmg: 20, big: true },
];
function updatePlayer(p, dt, c) {
  const d = CLASSES[p.cls];
  p.st += dt; p.walkT += dt; p.flash = Math.max(0, p.flash - dt); p.inv = Math.max(0, p.inv - dt);
  p.mp = Math.min(p.maxMp, p.mp + dt * 5);
  p.comboT -= dt; if (p.comboT <= 0) p.combo = 0;
  if (p.state === "dead") {
    physics(p, dt);
    if (p.lives > 0) { p.respawn -= dt; if (p.respawn <= 0) { p.lives--; revive(p); } }
    return;
  }
  const grounded = p.z <= 0;
  const busy = ["attack", "special", "hurt", "down", "getup", "fall", "dash"].includes(p.state);
  if (p.state === "fall") { physics(p, dt); if (p.z <= 0) { setState(p, "idle"); shake(6); addFx({ type: "ring", x: p.x, y: p.y, life: 0.4, col: "#fff2c8", r: 120 }); } return; }
  if (p.state === "hurt") { physics(p, dt); if (p.st > 0.32) setState(p, "idle"); return; }
  if (p.state === "down") { physics(p, dt); if (p.z <= 0 && p.st > 0.9) setState(p, "getup"); return; }
  if (p.state === "getup") { if (p.st > 0.35) { setState(p, "idle"); p.inv = 1.0; } return; }
  // double-tap a direction to run
  const dirNow = c.x > 0.5 ? 1 : c.x < -0.5 ? -1 : 0;
  if (dirNow && dirNow !== p.prevDir) {
    if (dirNow === p.tapDir && G.t - p.tapT < 0.28 && grounded) p.running = true;
    p.tapDir = dirNow; p.tapT = G.t;
  }
  if (!dirNow || (p.running && dirNow !== p.face && dirNow !== 0)) p.running = false;
  p.prevDir = dirNow;
  if (!busy) {
    const sp = d.speed * (grounded ? 1 : 0.85) * (p.running ? 1.75 : 1);
    p.x += c.x * sp * dt; p.y += c.y * sp * 0.62 * dt;
    if (grounded && (c.x || c.y)) p.phase += Math.hypot(c.x * sp, c.y * sp * 0.62) * dt / (p.running ? 75 : 58);
    if (p.running && grounded) { p.puffT -= dt; if (p.puffT <= 0) { p.puffT = 0.11; addFx({ type: "puff", x: p.x - p.face * 30, y: p.y, life: 0.45, r: rand(14, 22) }); } }
    if (c.x) p.face = Math.sign(c.x);
    if (grounded) p.state = c.x || c.y ? "walk" : "idle";
    else if (p.state !== "airatk") p.state = "jump";
  }
  if (grounded && !busy && c.jump) { p.vz = 980; p.z = 1; p.state = "jump"; p.airAtk = false; }
  if (c.attack) {
    if (p.state === "attack") p.buffered = true;
    else if (!busy && grounded && p.running) startDash(p);
    else if (!busy && grounded) startAttack(p, 0);
    else if (!grounded && !p.airAtk && p.state === "jump") startAirAttack(p);
  }
  if (c.special && !busy && grounded) {
    const cost = p.cls === "warrior" ? 35 : 40;
    if (p.mp >= cost) { p.mp -= cost; setState(p, "special"); p.hitIds = new Set(); p.step = 0; p.inv = 0.7; if (p.cls === "warrior") SFX.swing(); }
    else floatText(p.x, p.y - 290, "MP 부족", "#9fd8ff");
  }
  if (p.state === "attack") updateAttack(p);
  if (p.state === "dash") updateDash(p, dt);
  if (p.state === "airatk") updateAirAttack(p);
  if (p.state === "special") updateSpecial(p);
  physics(p, dt);
  if (p.z <= 0 && (p.state === "jump" || p.state === "airatk")) { setState(p, "idle"); p.land = 0.12; }
}
function revive(p) {
  p.hp = p.maxHp; p.mp = p.maxMp; p.inv = 2.5;
  p.x = G.camX + 260 + p.idx * 80; p.y = 590; p.z = 600; p.vz = 0; p.vx = 0; setState(p, "fall");
}
function startAttack(p, i) { setState(p, "attack"); p.combo_i = i; p.buffered = false; p.hitIds = new Set(); p.fired = false; p.swung = false; }
function updateAttack(p) {
  const warrior = p.cls === "warrior";
  const a = (warrior ? WAR_COMBO : MAGE_COMBO)[p.combo_i];
  if (warrior) {
    if (p.st >= a.wind && !p.swung) {
      p.swung = true; SFX.swing();
      addFx({ type: "slash", x: p.x + p.face * (a.heavy ? 110 : 70), y: p.y - (a.heavy ? 170 : 150), face: p.face, life: a.heavy ? 0.2 : 0.16, big: !!a.heavy, flip: p.combo_i === 1, down: !!a.heavy });
      if (a.heavy) { shake(6); addFx({ type: "ring", x: p.x + p.face * 150, y: p.y, life: 0.35, col: "#ffe2a0", r: 140 }); }
      p.x += p.face * (a.heavy ? 34 : 18);
    }
    if (p.st >= a.wind && p.st <= a.act) {
      for (const e of targetsInFront(p, a.range)) {
        if (p.hitIds.has(e)) continue;
        p.hitIds.add(e);
        damage(e, a.dmg * p.atk, p, { heavy: a.heavy, down: a.down, knock: a.knock, crit: a.heavy, col: "#fff1c2" });
      }
    }
  } else if (p.st >= a.wind && !p.fired) {
    p.fired = true; SFX.bolt();
    G.shots.push({ x: p.x + p.face * 125, y: p.y, z: 192, vx: p.face * 980, face: p.face, owner: p, dmg: a.dmg * p.atk, big: a.big, life: 0.9, hit: new Set(), pierce: a.big });
    addFx({ type: "flare", x: p.x + p.face * 122, y: p.y - 192, life: 0.12, col: "#9ff6ea", r: a.big ? 70 : 45 });
  }
  if (p.st >= a.end - 0.06 && p.buffered && p.combo_i < 2) { startAttack(p, p.combo_i + 1); return; }
  if (p.st >= a.end) setState(p, "idle");
}
function startDash(p) {
  p.running = false; setState(p, "dash"); p.hitIds = new Set();
  if (p.cls === "warrior") {
    SFX.swing();
    addFx({ type: "slash", x: p.x + p.face * 90, y: p.y - 140, face: p.face, life: 0.2, big: true });
  } else {
    SFX.bolt();
    G.shots.push({ x: p.x + p.face * 125, y: p.y, z: 192, vx: p.face * 1150, face: p.face, owner: p, dmg: 22 * p.atk, big: true, life: 0.9, hit: new Set(), pierce: true });
    addFx({ type: "flare", x: p.x + p.face * 122, y: p.y - 192, life: 0.14, col: "#9ff6ea", r: 80 });
  }
}
function updateDash(p, dt) {
  if (p.cls === "warrior") {
    const k = 1 - clamp(p.st / 0.32, 0, 1);
    p.x += p.face * 620 * k * dt;
    for (const e of targetsInFront(p, 150)) {
      if (p.hitIds.has(e)) continue;
      p.hitIds.add(e);
      damage(e, 21 * p.atk, p, { heavy: true, down: true, knock: 560, crit: true, col: "#fff1c2" });
    }
    if (p.st > 0.42) setState(p, "idle");
  } else {
    p.x -= p.face * 160 * (1 - clamp(p.st / 0.2, 0, 1)) * dt;   // recoil
    if (p.st > 0.36) setState(p, "idle");
  }
}
function startAirAttack(p) {
  p.airAtk = true; setState(p, "airatk"); p.hitIds = new Set();
  if (p.cls === "warrior") {
    SFX.swing(); p.vz = Math.min(p.vz, 200);
    addFx({ type: "slash", x: p.x + p.face * 60, y: p.y - 120 - p.z, face: p.face, life: 0.2, big: true, down: true });
  } else {
    SFX.bolt();
    G.shots.push({ x: p.x + p.face * 100, y: p.y, z: p.z + 150, vz: -520, vx: p.face * 820, face: p.face, owner: p, dmg: 13 * p.atk, big: false, life: 0.8, hit: new Set() });
  }
}
function updateAirAttack(p) {
  if (p.cls !== "warrior") return;
  for (const e of targetsInFront(p, 170, 40, DEPTH_TOL, 260)) {
    if (p.hitIds.has(e)) continue;
    p.hitIds.add(e);
    damage(e, 17 * p.atk, p, { heavy: true, down: true, knock: 380, col: "#fff1c2" });
  }
}
function updateSpecial(p) {
  if (p.cls === "warrior") {
    const hits = [0.12, 0.34];
    if (p.step < hits.length && p.st >= hits[p.step]) {
      p.step++;
      addFx({ type: "spin", x: p.x, y: p.y - 120, life: 0.22, r: 190 });
      SFX.swing(); shake(8);
      for (const e of everyTarget()) {
        const reach = e.kind === "boss" ? 320 : 200;
        if (Math.abs(e.x - p.x) < reach && Math.abs(e.y - p.y) < 70) damage(e, 24 * p.atk, p, { heavy: true, down: p.step === 2, knock: 460, crit: true, col: "#ffd27a" });
      }
    }
    if (p.st > 0.6) setState(p, "idle");
  } else {
    const at = [0.2, 0.32, 0.44, 0.56];
    if (p.step < at.length && p.st >= at[p.step]) {
      const k = p.step++;
      const sx = p.x + p.face * (170 + k * 140), sy = p.y;
      addFx({ type: "bolt", x: sx, y: sy, life: 0.32 });
      addFx({ type: "ring", x: sx, y: sy, life: 0.35, col: "#9ff6ea", r: 120 });
      SFX.zap(); shake(7);
      for (const e of everyTarget()) {
        const reach = e.kind === "boss" ? 220 : 100;
        if (Math.abs(e.x - sx) < reach && Math.abs(e.y - sy) < 70) damage(e, 30 * p.atk, p, { heavy: true, down: true, knock: 300, crit: true, col: "#aaf8ff", stop: 0.07 });
      }
    }
    if (p.st > 0.85) setState(p, "idle");
  }
}
function physics(e, dt) {
  if (e.z > 0 || e.vz > 0) {
    e.vz -= GRAV * dt; e.z += e.vz * dt;
    if (e.z <= 0) { e.z = 0; e.vz = 0; if (e.state === "down" || e.state === "dead") e.vx *= 0.35; }
  }
  e.x += (e.vx || 0) * dt;
  if (e.z <= 0) e.vx = (e.vx || 0) * Math.pow(0.002, dt);
  e.y = clamp(e.y, LANE_TOP, LANE_BOT);
  if (e.kind === "player") e.x = clamp(e.x, G.camX + 50, G.camX + W - 50);
  else e.x = clamp(e.x, 40, WORLD_W - 40);
}

// ================================================================ enemies
function nearestPlayer(e) {
  let best = null, bd = 1e9;
  for (const p of G.players) {
    if (p.state === "dead") continue;
    const d = Math.abs(p.x - e.x) + Math.abs(p.y - e.y) * 1.5;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function enemyCommon(e, dt) {
  e.st += dt; e.walkT += dt; e.flash = Math.max(0, e.flash - dt); e.cd -= dt;
  if (e.state === "dead") { physics(e, dt); if (e.z <= 0 && e.st > 1.1) e.dead = true; return true; }
  if (e.state === "hurt") { physics(e, dt); if (e.st > 0.38) setState(e, "chase"); return true; }
  if (e.state === "down") { physics(e, dt); if (e.z <= 0 && e.st > 1.0) setState(e, "getup"); return true; }
  if (e.state === "getup") { if (e.st > 0.4) { setState(e, "chase"); e.cd = rand(0.3, 0.9); } return true; }
  if (e.state === "enter" && e.st > 0.2) setState(e, "chase");
  return false;
}
function moveToward(e, tx, ty, sp, dt) {
  const dx = tx - e.x, dy = ty - e.y;
  if (Math.abs(dx) > 8) e.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
  if (Math.abs(dy) > 4) e.y += Math.sign(dy) * Math.min(Math.abs(dy), sp * 0.6 * dt);
  e.moving = Math.abs(dx) > 8 || Math.abs(dy) > 4;
  return dx;
}
function updateOrc(e, dt) {
  if (enemyCommon(e, dt)) return;
  const t = nearestPlayer(e);
  if (!t) { e.moving = false; return; }
  if (e.state === "windup") {
    e.tint = Math.min(1, e.st / 0.45);
    if (e.st > 0.48) {
      setState(e, "strike"); e.x += e.face * 26; SFX.swing();
      addFx({ type: "claw", x: e.x + e.face * 90, y: e.y - 140, face: e.face, life: 0.14 });
      for (const p of G.players) {
        const dx = (p.x - e.x) * e.face;
        if (p.state !== "dead" && dx > -20 && dx < 170 && sameLane(e, p) && p.z < 90) damage(p, e.dmg, e, { knock: 220, col: "#ffb08a" });
      }
    }
    return;
  }
  if (e.state === "strike") { if (e.st > 0.45) { setState(e, "chase"); e.cd = rand(1.1, 2.0); } return; }
  const attackers = G.enemies.filter((o) => o !== e && alive(o) && o.type === "orc" && ["windup", "strike"].includes(o.state)).length;
  const side = Math.sign(e.x - t.x) || e.side; e.side = side;
  const wantDist = attackers >= 2 ? 290 + e.hold * 80 : 125;
  const dx = moveToward(e, t.x + side * wantDist, t.y + (wantDist > 200 ? (e.hold - 0.5) * 100 : 0), ENEMY.orc.speed, dt);
  e.face = Math.sign(t.x - e.x) || e.face;
  if (wantDist < 200 && Math.abs(dx) < 26 && Math.abs(e.y - t.y) < 22 && e.cd <= 0 && t.z < 60) setState(e, "windup");
  physics(e, dt);
}
function updateArcher(e, dt) {
  if (enemyCommon(e, dt)) return;
  const t = nearestPlayer(e);
  if (!t) { e.moving = false; return; }
  if (e.state === "aim") {
    e.face = Math.sign(t.x - e.x) || e.face;
    e.y += clamp(t.y - e.y, -60 * dt, 60 * dt);
    e.tint = Math.min(1, e.st / 0.7);
    if (e.st > 0.7) {
      setState(e, "release"); SFX.bow();
      G.eshots.push({ x: e.x + e.face * 90, y: e.y, z: 150, vx: e.face * 760, face: e.face, dmg: e.dmg, life: 1.6 });
    }
    return;
  }
  if (e.state === "release") { if (e.st > 0.35) { setState(e, "chase"); e.cd = rand(1.6, 2.6); } return; }
  const side = Math.sign(e.x - t.x) || e.side; e.side = side;
  const dist = Math.abs(e.x - t.x);
  const want = dist < 230 ? 520 : clamp(dist, 400, 560);
  moveToward(e, clamp(t.x + side * want, G.camX + 60, G.camX + W - 60), t.y, ENEMY.archer.speed * (dist < 230 ? 1.25 : 0.8), dt);
  e.face = Math.sign(t.x - e.x) || e.face;
  if (e.cd <= 0 && dist > 260 && Math.abs(e.y - t.y) < 60) setState(e, "aim");
  physics(e, dt);
}
function updateEShots(dt) {
  for (const s of G.eshots) {
    s.life -= dt; s.x += s.vx * dt;
    for (const p of G.players) {
      if (p.state === "dead" || s.life <= 0) continue;
      if (Math.abs(p.x - s.x) < 40 && Math.abs(p.y - s.y) < DEPTH_TOL && p.z < 150) {
        if (damage(p, s.dmg, { x: s.x - s.face * 40, kind: "enemy" }, { knock: 180, col: "#ffcf9a" })) s.life = 0;
      }
    }
  }
  G.eshots = G.eshots.filter((s) => s.life > 0 && s.x > G.camX - 60 && s.x < G.camX + W + 60);
}

// ================================================================ boss
function updateBoss(b, dt) {
  b.st += dt; b.walkT += dt; b.flash = Math.max(0, b.flash - dt);
  if (b.dead) return;
  if (b.state === "drop") {
    b.vz -= GRAV * 0.8 * dt; b.z += b.vz * dt;
    if (b.z <= 0) {
      b.z = 0; b.vz = 0; setState(b, "roar"); shake(26); G.hitstop = 0.12; SFX.boom();
      debris(b.x, b.y, 26); addFx({ type: "ring", x: b.x, y: b.y, life: 0.7, col: "#fff0c0", r: 420 });
      for (const p of G.players) if (Math.abs(p.x - b.x) < 260 && p.state !== "dead") damage(p, 12, b, { down: true, knock: 500 });
    }
    return;
  }
  if (b.state === "roar") {
    if (!b.roared) { b.roared = true; SFX.roar(); }
    if (b.st > 1.4) { setState(b, "walk"); G.banner = { title: "고대 골렘", sub: "요새의 문지기", t: 0, life: 3 }; }
    return;
  }
  const t = nearestPlayer(b);
  if (!t) return;
  b.rage = b.hp < b.maxHp * 0.5;
  const k = b.rage ? 0.72 : 1;
  if (b.state === "walk") {
    b.face = Math.sign(t.x - b.x) || b.face;
    const tx = t.x - b.face * 280;
    if (Math.abs(tx - b.x) > 20) b.x += Math.sign(tx - b.x) * 70 * dt;
    if (Math.abs(t.y - b.y) > 20) b.y += Math.sign(t.y - b.y) * 45 * dt;
    b.y = clamp(b.y, LANE_TOP + 30, LANE_BOT - 30);
    b.x = clamp(b.x, G.camX + 160, G.camX + W - 120);
    b.cd -= dt;
    if (b.cd <= 0) {
      const near = Math.abs(t.x - b.x) < 420 && Math.abs(t.y - b.y) < 90, r = Math.random();
      if (near && r < 0.45) setState(b, "sweepWind");
      else if (r < 0.8) { setState(b, "slamWind"); b.target = { x: t.x, y: t.y }; b.face = Math.sign(t.x - b.x) || b.face; G.tele.push({ x: t.x, y: t.y, r: 150, t: 0, life: 0.95 * k, kind: "slam" }); }
      else {
        setState(b, "rubble"); b.slammed = false;
        for (let i = 0; i < (b.rage ? 7 : 5); i++) {
          const pp = G.players[i % G.players.length];
          G.tele.push({ x: clamp((pp.state !== "dead" ? pp.x : b.x) + rand(-260, 260), G.camX + 60, G.camX + W - 60), y: rand(LANE_TOP + 10, LANE_BOT - 10), r: 75, t: -0.35 - i * 0.12, life: 1.0 * k, kind: "rock" });
        }
      }
    }
    return;
  }
  if (b.state === "slamWind") {
    b.tint = Math.min(1, b.st / (0.95 * k));
    const goal = clamp(b.target.x - b.face * 230, G.camX + 160, G.camX + W - 120);
    b.x = lerp(b.x, goal, 1 - Math.pow(0.05, dt));
    if (b.st > 0.95 * k) {
      setState(b, "slam");
      const T = b.target;
      shake(24); G.hitstop = 0.1; SFX.boom(); debris(T.x, T.y, 22);
      addFx({ type: "impact", x: T.x, y: T.y - 30, life: 0.2, r: 220, col: "#fff4d0" });
      addFx({ type: "ring", x: T.x, y: T.y, life: 0.5, col: "#ffe0a0", r: 280 });
      for (const p of G.players) if (p.state !== "dead" && Math.hypot(p.x - T.x, (p.y - T.y) * 1.6) < 165 && p.z < 120) damage(p, 26, { x: T.x, kind: "boss" }, { down: true, knock: 560, heavy: true });
    }
    return;
  }
  if (b.state === "slam") { if (b.st > 0.7) { setState(b, "walk"); b.cd = rand(1.4, 2.2) * k; } return; }
  if (b.state === "sweepWind") {
    b.tint = Math.min(1, b.st / (0.75 * k));
    if (b.st > 0.75 * k) {
      setState(b, "sweep"); SFX.heavy(); shake(14);
      addFx({ type: "slash", x: b.x + b.face * 220, y: b.y - 220, face: b.face, life: 0.22, big: true, huge: true });
      for (const p of G.players) {
        const dx = (p.x - b.x) * b.face;
        if (p.state !== "dead" && dx > -40 && dx < 470 && Math.abs(p.y - b.y) < 95 && p.z < 140) damage(p, 20, b, { down: true, knock: 640, heavy: true });
      }
    }
    return;
  }
  if (b.state === "sweep") { if (b.st > 0.6) { setState(b, "walk"); b.cd = rand(1.2, 2.0) * k; } return; }
  if (b.state === "rubble") {
    if (!b.slammed && b.st > 0.35) { b.slammed = true; shake(16); SFX.boom(); debris(b.x + b.face * 160, b.y, 16); }
    if (b.st > 1.7) { setState(b, "walk"); b.cd = rand(1.0, 1.8) * k; }
  }
}
function killBoss(b, credit) {
  b.dead = true; b.hp = 0; setState(b, "dead");
  G.slow = 1.6; G.hitstop = 0.25; shake(30); SFX.boom(); setTimeout(SFX.boom, 250);
  for (let i = 0; i < 6; i++) setTimeout(() => { if (!G) return; debris(b.x + rand(-120, 120), b.y, 14); sparks(b.x + rand(-120, 120), b.y - rand(100, 500), 20, "#9ff6ea", 700); }, i * 140);
  grantXp(credit, 400);
  for (const p of G.players) addScore(p, p === credit ? 5000 : 2500);
  G.tele = []; G.eshots = [];
  stopMusic();
  G.clearT = 0.001;
}
function updateTele(dt) {
  for (const t of G.tele) {
    t.t += dt;
    if (t.kind === "rock" && t.t >= t.life && !t.done) {
      t.done = true; SFX.heavy(); shake(9); debris(t.x, t.y, 8);
      addFx({ type: "impact", x: t.x, y: t.y - 20, life: 0.12, r: 110, col: "#fff0d0" });
      for (const p of G.players) if (p.state !== "dead" && Math.hypot(p.x - t.x, (p.y - t.y) * 1.6) < t.r + 20) damage(p, 16, { x: t.x, kind: "boss" }, { down: true, knock: 380 });
    }
  }
  G.tele = G.tele.filter((t) => t.t < t.life + (t.kind === "rock" ? 0.05 : 0));
}

// ================================================================ player shots
function updateShots(dt) {
  for (const s of G.shots) {
    s.life -= dt; s.x += s.vx * dt;
    if (s.vz) { s.z += s.vz * dt; if (s.z <= 10) { s.life = 0; sparks(s.x, s.y - 10, 10, "#9ff6ea", 400); } }
    if (Math.random() < 0.8) addFx({ type: "trail", x: s.x, y: s.y - s.z, life: 0.25, r: s.big ? 16 : 10 });
    for (const e of everyTarget()) {
      if (s.hit.has(e) || s.life <= 0) continue;
      const reach = e.kind === "boss" ? 150 : 55;
      const zOk = e.kind === "boss" ? true : Math.abs((e.z + 140) - s.z) < 160;
      if (Math.abs(e.x - s.x) < reach && Math.abs(e.y - s.y) < (e.kind === "boss" ? 95 : DEPTH_TOL) && zOk) {
        s.hit.add(e);
        damage(e, s.dmg, { x: s.x - s.face * 50, kind: "shot" }, { owner: s.owner, col: "#aaf8ff", heavy: s.big, down: s.big, knock: s.big ? 360 : 120, crit: s.big, stop: 0.04 });
        if (!s.pierce) { s.life = 0; break; }
      }
    }
  }
  G.shots = G.shots.filter((s) => s.life > 0 && s.x > G.camX - 100 && s.x < G.camX + W + 100);
}

// ================================================================ stage flow
function updateStage(dt) {
  const live = G.players.filter((p) => p.state !== "dead");
  const ref = live.length ? live : G.players;
  const avg = ref.reduce((s, p) => s + p.x, 0) / ref.length;
  const target = clamp(avg - W * 0.42, 0, Math.min(G.lock, WORLD_W) - W);
  G.camX = Math.max(G.camX, lerp(G.camX, target, 1 - Math.pow(0.001, dt)));
  if (G.intro && G.t > 2.4) G.intro = false;
  const z = ZONES[G.zone];
  if (!z) return;
  if (!G.zoneActive && !G.intro && G.camX + W >= z.at - 2) {
    G.zoneActive = true; G.goT = 0;
    if (z.banner) G.banner = { title: z.banner[0], sub: z.banner[1], t: 0, life: 2.6 };
    if (z.boss) { G.boss = makeBoss(G.camX + W - 330); playMusic("boss"); }
    else {
      z.wave.forEach(([type, side, row], i) => {
        const x = side > 0 ? G.camX + W + 80 + i * 70 : G.camX - 80 - i * 50;
        const y = LANE_TOP + 20 + row * ((LANE_BOT - LANE_TOP - 40) / 2);
        const e = makeEnemy(type, x, y); e.face = -side; G.enemies.push(e);
      });
    }
  }
  if (G.zoneActive && !z.boss && G.enemies.every((e) => e.dead)) {
    G.enemies = []; G.zoneActive = false; G.zone++;
    G.lock = ZONES[G.zone] ? ZONES[G.zone].at : WORLD_W;
    G.goT = 3;
  }
  G.enemies = G.enemies.filter((e) => !(e.dead && e.st > 2));
}

// ================================================================ main update
let titleSel = 0, paused = false, best = loadBest();
function togglePause() { if (G && G.mode === "play") paused = !paused; }
function finishStage() {
  const time = G.t;
  const score = G.players.reduce((s, p) => s + p.score, 0);
  const timeBonus = Math.max(0, Math.round((420 - time) * 20));
  const noDeath = G.deaths === 0 ? 3000 : 0;
  const total = score + timeBonus + noDeath;
  const rank = total > 26000 && G.continues === 0 ? "S" : total > 19000 ? "A" : total > 12000 ? "B" : "C";
  const isBest = total > best;
  if (isBest) { best = total; saveBest(best); }
  G.result = { time, score, timeBonus, noDeath, total, rank, isBest };
  G.mode = "clear"; G.endT = 0;
}
function update(dt) {
  readPads();
  if (!G) {
    const c = controls(0);
    if (Math.abs(c.x) > 0.5 && !update.lock) { titleSel = c.x > 0 ? 1 : 0; update.lock = true; }
    if (Math.abs(c.x) < 0.3) update.lock = false;
    if (c.attack || c.start || c.jump) { audioOn(); newGame(titleSel ? "mage" : "warrior"); }
    return;
  }
  if (paused) return;
  if (G.mode === "over") {
    G.endT += dt;
    const c = controls(0);
    if (G.endT > 1.2 && (c.attack || c.start)) {          // continue
      G.continues++; G.mode = "play";
      for (const p of G.players) { p.lives = 2; p.score = 0; revive(p); }
      playMusic(G.boss ? "boss" : "stage");
    } else if (G.endT > 1.2 && c.jump) { stopMusic(); G = null; }
    return;
  }
  if (G.mode === "clear") {
    G.endT += dt;
    const c = controls(0);
    if (G.endT > 1.5 && (c.attack || c.start)) G = null;
    return;
  }
  G.t += dt;
  const c2 = controls(1);
  if (G.players.length < 2 && (c2.attack || c2.start)) {
    const cls = G.players[0].cls === "warrior" ? "mage" : "warrior";
    const p = makePlayer(1, cls, G.camX + 200, 640);
    p.lvl = G.players[0].lvl; p.maxHp = Math.round(CLASSES[cls].hp * (1 + 0.14 * (p.lvl - 1))); p.hp = p.maxHp; p.atk = 1 + 0.12 * (p.lvl - 1);
    revive(p); G.players.push(p); floatText(p.x, 300, "2P 참가!", "#ffd75e", true);
  }
  let k = dt;
  if (G.slow > 0) { G.slow -= dt; k = dt * 0.3; }
  G.shake = Math.max(0, G.shake - dt * 60);
  updateFx(dt);
  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.life) G.banner = null; }
  if (G.hitstop > 0) { G.hitstop -= dt; update.held = true; return; }
  G.players.forEach((p, i) => updatePlayer(p, k, controls(i)));
  for (const e of G.enemies) (e.type === "archer" ? updateArcher : updateOrc)(e, k);
  if (G.boss) updateBoss(G.boss, k);
  updateShots(k); updateEShots(k); updateTele(k); updateItems(k); updateStage(k);
  if (G.goT > 0) G.goT -= dt;
  if (G.clearT > 0) { G.clearT += dt; if (G.clearT > 3.2) finishStage(); }
  if (G.mode === "play" && !G.players.some((p) => p.state !== "dead" || p.lives > 0)) { G.mode = "over"; G.endT = 0; stopMusic(); }
}
function updateFx(dt) {
  for (const f of G.fx) {
    f.t += dt;
    if (f.type === "spark") { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.9; f.vy = f.vy * 0.9 + 900 * dt; }
    if (f.type === "rock") { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 2200 * dt; if (f.y > f.gy) { f.y = f.gy; f.vy *= -0.3; f.vx *= 0.6; } }
  }
  G.fx = G.fx.filter((f) => f.t < f.life);
  for (const t of G.texts) { t.t += dt; t.y -= (t.big ? 30 : 70) * dt; }
  G.texts = G.texts.filter((t) => t.t < t.life);
  for (const d of G.dust) { d.y -= d.v * dt; d.x += Math.sin(G.t + d.p) * 6 * dt; if (d.y < -10) { d.y = H * 0.8; d.x = rand(0, W); } }
}

// ================================================================ rendering
const FONT = (px, w = 900) => `${w} ${px}px "Noto Sans KR", system-ui, sans-serif`;
const DFONT = (px) => `${px}px "Black Han Sans", "Noto Sans KR", system-ui, sans-serif`;
function strokeText(txt, x, y, fill, lw = 6) {
  ctx.lineJoin = "round"; ctx.lineWidth = lw; ctx.strokeStyle = "#1a0d06"; ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill; ctx.fillText(txt, x, y);
}
function drawSegment(img, from, to, camX) {
  if (!img) return;
  const bw = img.width * (BG_H / img.height);
  const x0 = Math.max(from, camX), x1 = Math.min(to, camX + W);
  if (x1 <= x0) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0 - camX, 0, x1 - x0, BG_H); ctx.clip();
  const first = Math.floor((x0 - from) / bw), last = Math.floor((x1 - from) / bw);
  for (let i = first; i <= last; i++) {
    const x = from + i * bw - camX;
    ctx.save();
    if (i % 2) { ctx.translate(x + bw, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, bw, BG_H); }
    else ctx.drawImage(img, x, 0, bw, BG_H);
    ctx.restore();
  }
  ctx.restore();
}
function drawBackground(camX) {
  const blend = 260, forest = IMG.forest || IMG.background;
  drawSegment(forest, 0, FOREST_END + blend, camX);
  if (camX + W > FOREST_END) {           // courtyard fades in over the forest
    const steps = 13;
    for (let i = 0; i < steps; i++) {
      const sx = FOREST_END + (i * blend) / steps;
      ctx.save(); ctx.globalAlpha = (i + 1) / steps;
      drawSegment(IMG.background, sx, sx + blend / steps + 1, camX);
      ctx.restore();
    }
    drawSegment(IMG.background, FOREST_END + blend, WORLD_W, camX);
  }
}
function drawGodRays(t) {
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  const sx = W * 0.62, sy = -60;
  for (let i = 0; i < 7; i++) {
    const a = 1.75 + i * 0.16 + Math.sin(t * 0.3 + i) * 0.02, len = 1100, wdt = 0.035 + (i % 3) * 0.015;
    const g = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
    g.addColorStop(0, "rgba(255,220,150,0.11)"); g.addColorStop(1, "rgba(255,200,120,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a - wdt) * len, sy + Math.sin(a - wdt) * len);
    ctx.lineTo(sx + Math.cos(a + wdt) * len, sy + Math.sin(a + wdt) * len);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawDust() {
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (const d of G.dust) { ctx.fillStyle = `rgba(255,230,170,${0.25 + 0.2 * Math.sin(G.t * 2 + d.p)})`; ctx.fillRect(d.x, d.y, d.s, d.s); }
  ctx.restore();
}

const LOOP = [1, 2, 3, 2];
function locoFrame(e) {
  if (e.state !== "walk") return "idle";
  return (e.running ? "run" : "walk") + LOOP[Math.floor(e.phase) % 4];
}
// pick the key pose for an actor
function pickFrame(e) {
  const st = e.st;
  if (e.kind === "player" && e.cls === "warrior") {
    if (e.state === "attack") {
      const pre = st < WAR_COMBO[e.combo_i].wind;
      return [["wind", "slash"], ["slash", "rise"], ["wind", "chop"]][e.combo_i][pre ? 0 : 1];
    }
    if (e.state === "airatk") return "chop";
    if (e.state === "special") return Math.floor(st / 0.07) % 2 ? "slash" : "rise";
    if (e.state === "jump" || e.state === "fall") return e.vz > 0 ? "rise" : "idle";
    if (e.state === "dash") return "slash";
    return locoFrame(e);
  }
  if (e.kind === "player") {
    if (e.state === "dash") return "cast";
    if (e.state === "attack") return st < MAGE_COMBO[e.combo_i].wind ? "idle" : "cast";
    if (e.state === "airatk") return "cast";
    if (e.state === "special") return "storm";
    return locoFrame(e);
  }
  if (e.kind === "boss") {
    if (["slamWind", "roar", "drop"].includes(e.state)) return "wind";
    if (e.state === "slam") return "slam";
    if (e.state === "sweep") return "sweep";
    if (e.state === "rubble") return st < 0.35 ? "wind" : "slam";
    return "idle";
  }
  if (e.type === "archer") return e.state === "aim" ? "draw" : e.state === "release" ? "release" : "idle";
  return e.state === "windup" ? "wind" : e.state === "strike" ? "strike" : "idle";
}
const frameSet = (e) => FRAMES[e.kind === "player" ? e.cls : e.kind === "boss" ? "golem" : e.type];

function drawActor(e, camX) {
  const set = frameSet(e);
  const fk = pickFrame(e), fr = set.f[fk] || set.f.idle;
  const img = IMG[fr.src]; if (!img) return;
  if (fk !== e.frameKey) { e.prevFrame = e.frameKey; e.frameKey = fk; e.frameT = G.t; }
  const ds = depthScale(e.y), s = set.px * ds;
  const w = img.width * s, h = img.height * s, dx0 = -fr.ax * s;
  const sx = e.x - camX, sy = e.y - e.z;
  let rot = 0, ox = 0, oy = 0, sqx = 1, sqy = 1;
  const t = e.walkT || 0, st = e.st;
  switch (e.state) {
    case "idle": case "chase": case "enter": case "walk":
      if (e.kind === "player" && e.state === "walk") { oy = -Math.abs(Math.sin(e.phase * Math.PI)) * (e.running ? 5 : 3); rot = e.running ? 0.05 : 0; }
      else if (e.state === "walk" || (e.state !== "idle" && e.moving !== false)) { oy = -Math.abs(Math.sin(t * 10)) * 6; rot = Math.sin(t * 10) * 0.03; }
      else { sqy = 1 + Math.sin(t * 3) * 0.012; sqx = 1 - Math.sin(t * 3) * 0.006; }
      break;
    case "jump": case "fall": sqy = e.vz > 0 ? 1.05 : 0.98; sqx = 2 - sqy; rot = -0.04; break;
    case "attack": rot = st < 0.08 ? -0.03 : 0.04 * (1 - clamp(st / 0.3, 0, 1)); ox = st < 0.08 ? -4 : 8 * (1 - clamp(st / 0.3, 0, 1)); break;
    case "special": if (e.cls === "mage") oy = -Math.min(st, 0.2) * 60; break;
    case "hurt": rot = -0.16; ox = -10; break;
    case "dash": rot = 0.06; break;
    case "down": case "dead": rot = -Math.min(1, st * 5) * 1.35; break;
    case "getup": rot = -1.35 * (1 - st / 0.35); break;
    case "windup": case "aim": sqy = 1.02; break;
    case "slamWind": case "sweepWind": rot = -0.06 * Math.min(1, st * 3); ox = -10; sqy = 1.03; break;
    case "strike": case "sweep": ox = 10; break;
    case "slam": sqy = 0.97; sqx = 1.03; break;
    case "roar": sqy = 1 + Math.sin(st * 30) * 0.015; break;
  }
  if (e.land > 0) { e.land -= 1 / 60; sqy *= 0.93; sqx *= 1.05; }
  if (e.kind === "boss" && e.state === "walk") { oy = -Math.abs(Math.sin(t * 3)) * 6; rot = Math.sin(t * 3) * 0.02; }
  if ((e.kind === "player" && e.inv > 0 && Math.floor(G.t * 20) % 2 && e.state !== "fall") || (e.state === "dead" && e.st > 0.6 && Math.floor(G.t * 16) % 2)) return;
  let face = e.face;
  if (e.state === "special" && e.cls === "warrior" && Math.floor(e.st / 0.14) % 2) face = -face;   // spin
  ctx.save();
  ctx.translate(sx + ox * e.face, sy + oy);
  ctx.scale(face, 1); ctx.rotate(rot); ctx.scale(sqx, sqy);
  if (e.prevFrame && G.t - e.frameT < 0.07) {           // smear between key poses
    const pf = set.f[e.prevFrame], pim = pf && IMG[pf.src];
    if (pim) { ctx.globalAlpha = 0.4 * (1 - (G.t - e.frameT) / 0.07); ctx.drawImage(pim, -pf.ax * s, -pim.height * s, pim.width * s, pim.height * s); ctx.globalAlpha = 1; }
  }
  ctx.drawImage(img, dx0, -h, w, h);
  if (e.flash > 0) { ctx.globalAlpha = Math.min(1, e.flash / 0.12); const sil = SIL[fr.src + "#ffffff"]; if (sil) ctx.drawImage(sil, dx0, -h, w, h); }
  else if (e.tint > 0) { ctx.globalAlpha = 0.25 + 0.35 * e.tint * (0.6 + 0.4 * Math.sin(G.t * 40)); const sil = SIL[fr.src + "#ff3b1f"]; if (sil) ctx.drawImage(sil, dx0, -h, w, h); }
  if (e.kind === "boss") {
    const sil = SIL[fr.src + "#5ff0dc"];
    if (sil) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.08 + 0.06 * Math.sin(G.t * 3) + (e.rage ? 0.1 : 0); ctx.drawImage(sil, dx0, -h, w, h); }
  }
  ctx.restore();
  if (e.type === "archer" && e.state === "aim") {     // aiming line telegraph
    ctx.save(); ctx.strokeStyle = `rgba(255,90,60,${0.25 + 0.4 * e.tint})`; ctx.setLineDash([10, 10]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx + e.face * 90, sy - 150 * ds); ctx.lineTo(sx + e.face * 900, sy - 150 * ds); ctx.stroke(); ctx.restore();
  }
}
function drawShadow(e, camX) {
  const base = e.kind === "boss" ? 230 : e.kind === "enemy" ? ENEMY[e.type].shadow : 70;
  const r = base * depthScale(e.y) * (1 - Math.min(0.5, e.z / 900));
  ctx.fillStyle = `rgba(40,18,6,${0.42 * (1 - Math.min(0.6, e.z / 700))})`;
  ctx.beginPath(); ctx.ellipse(e.x - camX, e.y, r, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
}
function drawItems(camX) {
  for (const it of G.items) {
    if (it.t > 11 && Math.floor(it.t * 10) % 2) continue;
    const x = it.x - camX, y = it.y - it.z, bob = it.z <= 0 ? Math.sin(it.t * 4) * 3 : 0;
    ctx.save();
    ctx.fillStyle = "rgba(40,18,6,0.35)"; ctx.beginPath(); ctx.ellipse(x, it.y, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(x, y - 16 + bob);
    ctx.lineWidth = 2.5; ctx.strokeStyle = "#2a1408";
    if (it.kind === "potion") {
      ctx.fillStyle = "#e23b3b"; ctx.beginPath(); ctx.arc(0, 4, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e9d6b0"; ctx.fillRect(-5, -16, 10, 9); ctx.strokeRect(-5, -16, 10, 9);
      ctx.fillStyle = "#8a5a2a"; ctx.fillRect(-6, -20, 12, 5);
      ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.arc(-4, 0, 4, 0, Math.PI * 2); ctx.fill();
    } else if (it.kind === "gem") {
      ctx.fillStyle = "#43e0d0"; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(12, 0); ctx.lineTo(0, 14); ctx.lineTo(-12, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(5, -2); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    } else {
      ctx.scale(Math.max(0.2, Math.abs(Math.cos(it.t * 5))), 1);
      ctx.fillStyle = "#f2c33c"; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#b07c18"; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}
function drawTele(camX) {
  for (const t of G.tele) {
    if (t.t < 0) continue;
    const k = clamp(t.t / t.life, 0, 1);
    ctx.save(); ctx.translate(t.x - camX, t.y); ctx.scale(1, 0.32);
    ctx.fillStyle = `rgba(255,60,30,${0.14 + 0.18 * k})`; ctx.beginPath(); ctx.arc(0, 0, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,120,70,${0.5 + 0.5 * Math.sin(G.t * 30)})`; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, t.r * k, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    if (t.kind === "rock" && k > 0.55) {
      const yy = t.y - (1 - (k - 0.55) / 0.45) * 700;
      ctx.fillStyle = "#6b5236"; ctx.strokeStyle = "#2a1a0e"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(t.x - camX, yy - 30, 34, 28, k * 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
}
function drawFx(camX) {
  for (const f of G.fx) {
    const k = f.t / f.life, x = f.x - camX;
    ctx.save();
    switch (f.type) {
      case "spark":
        ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = f.col; ctx.lineWidth = f.w * (1 - k); ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.moveTo(x, f.y); ctx.lineTo(x - f.vx * 0.03, f.y - f.vy * 0.03); ctx.stroke(); break;
      case "impact": {
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(x, f.y, 0, x, f.y, f.r * (0.6 + k));
        g.addColorStop(0, `rgba(255,255,255,${1 - k})`); g.addColorStop(0.35, `rgba(255,240,190,${0.6 * (1 - k)})`); g.addColorStop(1, "rgba(255,200,120,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, f.y, f.r * (0.6 + k), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${1 - k})`; ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.3, r1 = f.r * 0.9 * (1 - k * 0.3), r2 = f.r * 0.12; ctx.lineTo(x + Math.cos(a) * r1, f.y + Math.sin(a) * r1); ctx.lineTo(x + Math.cos(a + Math.PI / 8) * r2, f.y + Math.sin(a + Math.PI / 8) * r2); }
        ctx.fill(); break;
      }
      case "speed":
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`; ctx.lineWidth = 3;
        for (let i = 0; i < 18; i++) { const a = i * 0.349 + 0.1, r1 = 120 + k * 80, r2 = 260 + k * 160; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r1, f.y + Math.sin(a) * r1); ctx.lineTo(x + Math.cos(a) * r2, f.y + Math.sin(a) * r2); ctx.stroke(); }
        break;
      case "slash": {
        ctx.globalCompositeOperation = "lighter";
        ctx.translate(x, f.y); ctx.scale(f.face, f.flip ? -1 : 1);
        const R = f.huge ? 280 : f.big ? 175 : 140, a0 = f.down ? -0.4 : -1.25, a1 = f.down ? 1.6 : 1.0;
        const sweep = a0 + (a1 - a0) * Math.min(1, k * 2.2);
        ctx.globalAlpha = 1 - k * k;
        const g = ctx.createLinearGradient(-R, -R, R, R);
        g.addColorStop(0, "rgba(255,210,120,0)"); g.addColorStop(0.5, f.huge ? "rgba(255,160,80,0.9)" : "rgba(255,240,200,0.95)"); g.addColorStop(1, "rgba(255,255,255,1)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, R, a0, sweep); ctx.arc(R * 0.18, 0, R * 0.78, sweep, a0, true); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, R, a0, sweep); ctx.stroke();
        break;
      }
      case "claw":
        ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = `rgba(255,140,90,${1 - k})`; ctx.lineWidth = 7;
        ctx.translate(x, f.y); ctx.scale(f.face, 1);
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(-30, i * 26, 90, -0.9, 0.7); ctx.stroke(); }
        break;
      case "spin":
        ctx.globalCompositeOperation = "lighter"; ctx.translate(x, f.y); ctx.scale(1, 0.4);
        ctx.strokeStyle = `rgba(255,225,150,${1 - k})`; ctx.lineWidth = 22 * (1 - k);
        ctx.beginPath(); ctx.arc(0, 0, f.r * (0.7 + k * 0.4), 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, f.r * (0.6 + k * 0.4), k * 6, k * 6 + 4); ctx.stroke();
        break;
      case "ring":
        ctx.translate(x, f.y); ctx.scale(1, 0.3); ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = f.col; ctx.globalAlpha = 1 - k; ctx.lineWidth = 10 * (1 - k) + 2;
        ctx.beginPath(); ctx.arc(0, 0, f.r * ease(k), 0, Math.PI * 2); ctx.stroke(); break;
      case "flare": case "trail": {
        ctx.globalCompositeOperation = "lighter";
        const r = (f.r || 12) * (f.type === "trail" ? 1 - k : 1 + k);
        const g = ctx.createRadialGradient(x, f.y, 0, x, f.y, r);
        g.addColorStop(0, `rgba(230,255,252,${1 - k})`); g.addColorStop(0.4, `rgba(110,240,225,${0.7 * (1 - k)})`); g.addColorStop(1, "rgba(60,200,200,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, f.y, r, 0, Math.PI * 2); ctx.fill(); break;
      }
      case "bolt": {
        ctx.globalCompositeOperation = "lighter";
        const top = f.y - 720;
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass ? `rgba(255,255,255,${1 - k})` : `rgba(90,240,230,${0.8 * (1 - k)})`;
          ctx.lineWidth = pass ? 4 : 16;
          ctx.beginPath(); let yy = top, xx = x; ctx.moveTo(xx, yy);
          let s = 13; while (yy < f.y - 20) { yy += 60; xx = x + Math.sin(s++ * 7.1 + f.x) * 28; ctx.lineTo(xx, yy); }
          ctx.lineTo(x, f.y - 20); ctx.stroke();
        }
        const g = ctx.createRadialGradient(x, f.y - 20, 0, x, f.y - 20, 140);
        g.addColorStop(0, `rgba(220,255,255,${1 - k})`); g.addColorStop(1, "rgba(80,220,220,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, f.y - 20, 140, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "puff":
        ctx.fillStyle = `rgba(214,176,120,${0.45 * (1 - k)})`;
        ctx.beginPath(); ctx.ellipse(x, f.y - 8 - k * 18, f.r * (0.6 + k), f.r * (0.4 + k * 0.6), 0, 0, Math.PI * 2); ctx.fill(); break;
      case "rock":
        ctx.fillStyle = "#7a5b3a"; ctx.strokeStyle = "#2a1a0e"; ctx.lineWidth = 2; ctx.globalAlpha = 1 - Math.max(0, k - 0.7) / 0.3;
        ctx.beginPath(); ctx.rect(x - f.s / 2, f.y - f.s / 2, f.s, f.s * 0.8); ctx.fill(); ctx.stroke(); break;
    }
    ctx.restore();
  }
}
function drawShots(camX) {
  for (const s of G.shots) {
    const x = s.x - camX, y = s.y - s.z;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const r = s.big ? 46 : 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(140,250,240,0.9)"); g.addColorStop(1, "rgba(40,180,200,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(220,255,255,0.9)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - s.face * r * 2.2, y); ctx.lineTo(x + s.face * r * 0.4, y); ctx.stroke();
    ctx.restore();
  }
  for (const s of G.eshots) {   // arrows
    const x = s.x - camX, y = s.y - s.z;
    ctx.save(); ctx.translate(x, y); ctx.scale(s.face, 1);
    ctx.strokeStyle = "#3a2410"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-46, 0); ctx.lineTo(10, 0); ctx.stroke();
    ctx.strokeStyle = "#d9b77a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-46, 0); ctx.lineTo(10, 0); ctx.stroke();
    ctx.fillStyle = "#c9c9c9"; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(6, -6); ctx.lineTo(6, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#b8452c"; ctx.beginPath(); ctx.moveTo(-46, 0); ctx.lineTo(-56, -7); ctx.lineTo(-40, 0); ctx.lineTo(-56, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
function drawTexts(camX) {
  for (const t of G.texts) {
    const k = t.t / t.life;
    ctx.save();
    ctx.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4;
    const s = t.big ? 1 + 0.25 * Math.max(0, 1 - t.t * 6) : 1 + 0.4 * Math.max(0, 1 - t.t * 10);
    ctx.translate(t.x - camX, t.y); ctx.scale(s, s);
    ctx.font = t.big ? DFONT(44) : FONT(30); ctx.textAlign = "center";
    strokeText(t.txt, 0, 0, t.col, 7);
    ctx.restore();
  }
}
function drawGrade() {
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = "rgba(255,170,80,0.18)"; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  const g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, H * 0.95);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(30,12,4,0.55)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
function drawForeground(camX) {
  const off = -((camX * 1.3) % FG.width);
  for (let x = off; x < W; x += FG.width) ctx.drawImage(FG, x, H - 150, FG.width, 200);
}
function bar(x, y, w, h, k, col, back = "rgba(0,0,0,0.55)") {
  ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x + 2, y + 2, Math.max(0, (w - 4) * clamp(k, 0, 1)), h - 4);
  ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(x + 2, y + 2, Math.max(0, (w - 4) * clamp(k, 0, 1)), (h - 4) / 2.5);
}
function drawPanel(p, x, alignRight) {
  const y = 18, pw = 380, left = alignRight ? x - pw : x;
  ctx.save();
  ctx.fillStyle = "rgba(24,14,8,0.72)";
  ctx.beginPath(); ctx.moveTo(left + 20, y); ctx.lineTo(left + pw, y); ctx.lineTo(left + pw - 20, y + 92); ctx.lineTo(left, y + 92); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(240,190,110,0.75)"; ctx.lineWidth = 2; ctx.stroke();
  const px = alignRight ? left + pw - 62 : left + 62;
  ctx.beginPath(); ctx.arc(px, y + 46, 40, 0, Math.PI * 2); ctx.fillStyle = CLASSES[p.cls].color; ctx.fill();
  if (PORTRAIT[p.cls]) ctx.drawImage(PORTRAIT[p.cls], px - 37, y + 9, 74, 74);
  ctx.lineWidth = 3; ctx.strokeStyle = "#f0c070"; ctx.beginPath(); ctx.arc(px, y + 46, 38, 0, Math.PI * 2); ctx.stroke();
  const lx = px + (alignRight ? -32 : 32);
  ctx.fillStyle = "#f0a63a"; ctx.beginPath(); ctx.arc(lx, y + 78, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1a0d06"; ctx.font = FONT(15); ctx.textAlign = "center"; ctx.fillText(p.lvl, lx, y + 84);
  const bx = alignRight ? left + 22 : left + 112, bw = 236;
  ctx.textAlign = alignRight ? "right" : "left";
  ctx.font = DFONT(22); ctx.fillStyle = "#f6ead2"; ctx.fillText(`${p.idx + 1}P ${CLASSES[p.cls].name}`, alignRight ? bx + bw : bx, y + 26);
  ctx.textAlign = alignRight ? "left" : "right"; ctx.font = FONT(15, 700); ctx.fillStyle = "#ffe27a";
  ctx.fillText(pad0(p.score, 7), alignRight ? bx : bx + bw, y + 26);
  const hpK = p.hp / p.maxHp;
  bar(bx, y + 36, bw, 16, hpK, hpK > 0.3 ? "#5fd35a" : "#e8483a");
  bar(bx, y + 56, bw, 10, p.mp / p.maxMp, "#4aa7ff");
  bar(bx, y + 70, bw, 6, p.xp / xpNeed(p.lvl), "#f0c040");
  ctx.textAlign = alignRight ? "right" : "left"; ctx.font = FONT(13, 700);
  ctx.lineWidth = 4; ctx.strokeStyle = "#1a0d06";
  const lifeTxt = p.state === "dead" ? (p.lives > 0 ? "부활 중..." : "전투 불능") : "목숨 " + "●".repeat(Math.max(0, p.lives));
  strokeText(lifeTxt, alignRight ? bx + bw : bx, y + 110, "#e9c991", 4);
  if (p.combo >= 3) {
    ctx.save(); ctx.textAlign = alignRight ? "right" : "left";
    const cx = alignRight ? x : x + 4, cy = y + 152, pop = 1 + Math.max(0, p.comboT - 1.1) * 1.25;
    ctx.translate(cx, cy); ctx.scale(pop, pop);
    ctx.font = DFONT(40); strokeText(`${p.combo}`, 0, 0, "#ffd75e", 7);
    const w = ctx.measureText(`${p.combo}`).width;
    ctx.font = DFONT(20); strokeText("HIT", alignRight ? -w - 6 : w + 6, 0, "#fff3d0", 5);
    ctx.restore();
  }
  ctx.restore();
}
function drawHUD() {
  drawPanel(G.players[0], 18, false);
  if (G.players[1]) drawPanel(G.players[1], W - 18, true);
  else {
    ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(G.t * 4);
    ctx.font = FONT(16, 700); ctx.textAlign = "right";
    strokeText(isTouch() ? "2P 참가: 게임패드 연결" : "2P 참가: 쉼표(,) 키 또는 게임패드", W - 24, 44, "#f6ead2", 4);
    ctx.restore();
  }
  const b = G.boss;
  if (b && b.state !== "drop" && !b.dead) {
    const bw = 640, bx = (W - bw) / 2, by = H - 52;
    ctx.save(); ctx.font = DFONT(24); ctx.textAlign = "center";
    strokeText("고대 골렘", W / 2, by - 8, b.rage ? "#ffb08a" : "#f6ead2", 5);
    bar(bx, by, bw, 20, b.hp / b.maxHp, b.rage ? "#ff5a3a" : "#e8a63a");
    ctx.restore();
  }
  const prog = clamp((G.camX + W) / WORLD_W, 0, 1);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(W / 2 - 110, 24, 220, 8);
  ctx.fillStyle = "#f0a63a"; ctx.fillRect(W / 2 - 110, 24, 220 * prog, 8);
  ctx.font = FONT(13, 700); ctx.textAlign = "center"; strokeText(`STAGE 1  ·  ${Math.floor(G.t / 60)}:${pad0(G.t % 60, 2)}`, W / 2, 52, "#f6ead2", 4);
  ctx.restore();
  if (G.goT > 0 && Math.floor(G.goT * 3) % 2 === 0) {
    ctx.save(); ctx.font = DFONT(64); ctx.textAlign = "right"; strokeText("GO ▶", W - 40, 330, "#ffd75e", 8); ctx.restore();
  }
  if (G.banner) {
    const k = G.banner.t, L = G.banner.life, a = Math.min(1, k * 3) * Math.min(1, (L - k) * 2);
    ctx.save(); ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = "rgba(10,5,2,0.55)"; ctx.fillRect(0, 250, W, 124);
    ctx.font = DFONT(64); ctx.textAlign = "center"; ctx.fillStyle = "#ffe2a0";
    ctx.fillText(G.banner.title, W / 2 + (1 - Math.min(1, k * 2)) * 80, 322);
    ctx.font = FONT(19, 700); ctx.fillStyle = "#9ff6ea"; ctx.fillText(G.banner.sub, W / 2, 358);
    ctx.restore();
  }
}
const isTouch = () => !touchUI.hidden;
function drawTitle(t) {
  drawBackground((t * 30) % 3000);
  ctx.fillStyle = "rgba(14,8,4,0.45)"; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.textAlign = "center";
  ctx.font = DFONT(96); strokeText("잿불의 왕관", W / 2, 150, "#ffd27a", 12);
  ctx.font = FONT(18, 700); ctx.fillStyle = "#f6ead2"; ctx.fillText("CROWN OF EMBERS · 가제 · STAGE 1", W / 2, 186);
  ["warrior", "mage"].forEach((cls, i) => {
    const cx = W / 2 + (i ? 190 : -190), sel = titleSel === i, im = IMG[CLASSES[cls].sprite];
    ctx.save(); ctx.globalAlpha = sel ? 1 : 0.5;
    ctx.fillStyle = sel ? "rgba(240,166,58,0.22)" : "rgba(0,0,0,0.25)"; ctx.fillRect(cx - 150, 220, 300, 380);
    ctx.strokeStyle = sel ? "#ffd27a" : "rgba(240,200,140,0.4)"; ctx.lineWidth = sel ? 4 : 2; ctx.strokeRect(cx - 150, 220, 300, 380);
    if (im) { const h = 300, w = im.width * h / im.height, bob = sel ? Math.sin(t * 3) * 4 : 0; ctx.drawImage(im, cx - w / 2, 250 + bob, w, h); }
    ctx.font = DFONT(32); ctx.fillStyle = "#f6ead2"; ctx.fillText(CLASSES[cls].name, cx, 588);
    ctx.restore();
  });
  ctx.font = FONT(15, 500); ctx.fillStyle = "#e9d9bd";
  ctx.fillText("전사: 대검 3단 콤보 · 회전베기        마법사: 마법탄 · 번개 폭풍", W / 2, 630);
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4);
  ctx.font = DFONT(30); ctx.fillStyle = "#ffd75e";
  ctx.fillText(isTouch() ? "◀ ▶ 로 선택 · 공격 버튼으로 시작" : "A / D 로 선택 · J 로 시작", W / 2, 676);
  ctx.globalAlpha = 1;
  ctx.font = FONT(13, 500); ctx.fillStyle = "#cdb99a";
  ctx.fillText((best ? `최고 기록 ${pad0(best, 7)}   ·   ` : "") + "1P WASD·J·K·L   2P 방향키·,·.·/   게임패드 지원 · M 소리 · P 일시정지", W / 2, 706);
  ctx.restore();
}
function overlay(title, lines) {
  ctx.save();
  ctx.fillStyle = "rgba(10,5,2,0.66)"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.font = DFONT(84); strokeText(title, W / 2, H / 2 - 40, "#ffd27a", 10);
  ctx.font = FONT(21, 700); ctx.fillStyle = "#f6ead2";
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + 14 + i * 32));
  ctx.restore();
}
function drawResult() {
  const r = G.result, k = Math.min(1, G.endT * 1.5);
  ctx.save();
  ctx.fillStyle = `rgba(10,5,2,${0.7 * k})`; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = k; ctx.textAlign = "center";
  ctx.font = DFONT(76); strokeText("STAGE 1 CLEAR", W / 2, 140, "#ffd27a", 10);
  ctx.font = FONT(18, 700); ctx.fillStyle = "#9ff6ea"; ctx.fillText("국경 요새의 성문을 되찾았다. 잿불의 왕관을 쫓는 여정은 계속된다.", W / 2, 180);
  const rows = [
    ["점수", pad0(r.score, 7)], ["시간 보너스", "+" + r.timeBonus], ["무사망 보너스", "+" + r.noDeath],
    ["처치", String(G.kills)], ["최대 콤보", String(G.maxCombo)], ["클리어 시간", `${Math.floor(r.time / 60)}분 ${pad0(r.time % 60, 2)}초`],
  ];
  ctx.font = FONT(22, 700);
  rows.forEach(([a, b], i) => {
    const y = 240 + i * 40;
    ctx.textAlign = "right"; ctx.fillStyle = "#e9d9bd"; ctx.fillText(a, W / 2 - 30, y);
    ctx.textAlign = "left"; ctx.fillStyle = "#ffffff"; ctx.fillText(b, W / 2 + 30, y);
  });
  ctx.textAlign = "center"; ctx.font = DFONT(40); strokeText(`합계 ${pad0(r.total, 7)}${r.isBest ? "  NEW RECORD!" : ""}`, W / 2, 520, "#ffe27a", 7);
  const rk = Math.min(1, Math.max(0, G.endT - 0.6) * 3);
  ctx.save(); ctx.translate(W / 2 + 360, 330); ctx.scale(2.4 - 1.4 * rk, 2.4 - 1.4 * rk); ctx.globalAlpha = rk;
  ctx.font = DFONT(150); strokeText(r.rank, 0, 50, r.rank === "S" ? "#ffd75e" : r.rank === "A" ? "#ff9a5a" : "#cfd8ff", 12);
  ctx.restore();
  ctx.font = FONT(18, 700); ctx.fillStyle = "#cdb99a"; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(G.endT * 4);
  ctx.fillText("다음 스테이지는 준비 중입니다 · 공격 키로 타이틀", W / 2, 600);
  ctx.restore();
}
function render() {
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  if (!G) { drawTitle(performance.now() / 1000); return; }
  const sh = G.shake;
  const camX = G.camX + (sh ? rand(-sh, sh) : 0), camY = sh ? rand(-sh, sh) * 0.6 : 0;
  ctx.save(); ctx.translate(0, camY);
  drawBackground(camX);
  drawGodRays(G.t);
  drawTele(camX);
  drawItems(camX);
  const actors = [...G.players, ...G.enemies.filter((e) => !e.dead), ...(G.boss && !(G.boss.dead && G.boss.st > 2.5) ? [G.boss] : [])];
  for (const a of actors) drawShadow(a, camX);
  actors.sort((a, b) => a.y - b.y);
  for (const a of actors) drawActor(a, camX);
  drawShots(camX); drawFx(camX); drawDust(); drawForeground(camX); drawTexts(camX);
  ctx.restore();
  drawGrade();
  drawHUD();
  if (paused) overlay("일시정지", ["P · Esc · 게임패드 START 로 계속", "1P 이동 WASD · 공격 J · 점프 K · 마법 L · 방향 두 번: 달리기", "2P 방향키 · 공격 , · 점프 . · 마법 /   ·   M 소리 켜기/끄기"]);
  if (G.mode === "over") overlay("전멸", ["공격 키: 이어하기 (점수 초기화)", "점프 키: 타이틀로"]);
  if (G.mode === "clear") drawResult();
}

// ================================================================ loop
let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= STEP) {
    update(STEP);
    if (!update.held) { pressedOnce.clear(); touch.edge.clear(); for (const p of pads) if (p.edge) p.edge.clear(); }
    update.held = false;
    acc -= STEP;
  }
  render();
  requestAnimationFrame(frame);
}
async function start() {
  fitCanvas();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#120d0a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await Promise.all(ALL_IMAGES.map(loadImg));
  for (const set of Object.values(FRAMES)) for (const f of Object.values(set.f)) { makeSilhouette(f.src, "#ffffff"); makeSilhouette(f.src, "#ff3b1f"); }
  for (const f of Object.values(FRAMES.golem.f)) makeSilhouette(f.src, "#5ff0dc");
  makePortrait("warrior"); makePortrait("mage");
  buildForeground();
  try { await Promise.race([document.fonts.load('40px "Black Han Sans"'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* fallback font */ }
  requestAnimationFrame((t) => { last = t; frame(t); });
}
if (location.hash === "#debug") window.__dbg = { get G() { return G; }, newGame, damage };   // test hook
const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(start); else start();
})();
