// Interactive NMPC demo: simulation loop, rendering and interaction.
// Needs nmpc.js (window.DIPC). Physics runs at 400 Hz, the controller re-plans at 40 Hz.
(function () {
  "use strict";
  const D = window.DIPC;
  const canvas = document.getElementById("mpc-canvas");
  if (!D || !canvas) return;
  const chart = document.getElementById("mpc-chart");
  const ctx = canvas.getContext("2d"), cctx = chart.getContext("2d");
  const statusBox = document.querySelector(".mpc-status"), statusText = document.getElementById("mpc-status-text");
  const hint = document.getElementById("mpc-hint");
  const solveEl = document.getElementById("mpc-solve"), forceEl = document.getElementById("mpc-force");
  const showPlanEl = document.getElementById("mpc-show-plan"), ctrlOnEl = document.getElementById("mpc-ctrl-on");
  const pauseBtn = document.getElementById("mpc-pause");

  const css = getComputedStyle(document.documentElement);
  const C = {
    ink: css.getPropertyValue("--ink").trim() || "#16181b",
    text: css.getPropertyValue("--text").trim() || "#34332f",
    muted: css.getPropertyValue("--muted").trim() || "#77736b",
    rule: css.getPropertyValue("--rule").trim() || "#e5e0d6",
    blue: css.getPropertyValue("--accent").trim() || "#1d5f8a",
    rust: css.getPropertyValue("--warm").trim() || "#b0502b",
    sans: css.getPropertyValue("--sans").trim() || "sans-serif",
  };

  // ---- simulation state ---------------------------------------------------------------
  const mpc = new D.NMPC({ N: 60, dt: 0.025, umax: 200, iters: 4 });
  const SUB = 10, H = mpc.dt / SUB;            // physics step 2.5 ms
  const TRACK = 2.0;                            // hard end stops (the controller's soft wall is at 1.5 m)
  let s = new Float64Array(6), u = 0, tSim = 0, ctrlClock = 0;
  let pushes = [];                              // active pushes {bob, Fx, until}
  let flashes = [];                             // push arrows to draw {bob, dir, t0}
  let drag = null;                              // {bob, wx, wy}
  let paused = false, started = false, everBalanced = false, solveAvg = 0;
  const trail = [], hist = [];                  // tip trail, force history {t,u}
  const marks = [];                             // disturbance times for the chart
  const out = new Float64Array(6);

  function hangDown() {
    s = new Float64Array([0, Math.PI - 0.06, Math.PI + 0.04, 0, 0, 0]);
    mpc.reset(); u = 0; pushes = []; everBalanced = false; trail.length = 0; firstSolve = true;
  }
  let firstSolve = true;
  hangDown();

  function physicsStep() {
    // controller (zero-order hold at 40 Hz)
    if (ctrlClock <= 1e-9) {
      if (ctrlOnEl.checked) {
        u = mpc.step(s, firstSolve ? 25 : undefined);
        firstSolve = false;
        solveAvg = solveAvg ? 0.9 * solveAvg + 0.1 * mpc.lastSolveMs : mpc.lastSolveMs;
      } else { u = 0; mpc.pred = null; mpc.reset(); firstSolve = true; }
      ctrlClock += mpc.dt;
      hist.push({ t: tSim, u });
    }
    // external forces: pushes and the mouse spring
    let Fq = [0, 0, 0];
    pushes = pushes.filter(p => p.until > tSim);
    for (const p of pushes) addF(Fq, D.bobForce(s, p.bob, p.Fx, 0));
    if (drag) {
      const P = D.points(s), bx = P[drag.bob * 2], by = P[drag.bob * 2 + 1];
      const v = bobVel(drag.bob);
      let Fx = 90 * (drag.wx - bx) - 6 * v[0], Fy = 90 * (drag.wy - by) - 6 * v[1];
      const m = Math.hypot(Fx, Fy), cap = 70;
      if (m > cap) { Fx *= cap / m; Fy *= cap / m; }
      addF(Fq, D.bobForce(s, drag.bob, Fx, Fy));
    }
    D.rk4(s, u, H, out, Fq); s.set(out);
    // end stops: inelastic bump
    if (Math.abs(s[0]) > TRACK) { s[0] = Math.sign(s[0]) * TRACK; if (s[0] * s[3] > 0) s[3] *= -0.3; }
    tSim += H; ctrlClock -= H;
  }
  function addF(a, b) { a[0] += b[0]; a[1] += b[1]; a[2] += b[2]; }
  function bobVel(k) {
    const l1 = D.P.l1, l2 = D.P.l2;
    let vx = s[3] + l1 * Math.cos(s[1]) * s[4], vy = -l1 * Math.sin(s[1]) * s[4];
    if (k === 2) { vx += l2 * Math.cos(s[2]) * s[5]; vy += -l2 * Math.sin(s[2]) * s[5]; }
    return [vx, vy];
  }

  // a push = horizontal force on a bob for 60 ms (impulse = Fx * 0.06 N s)
  function push(bob, Fx) {
    pushes.push({ bob, Fx, until: tSim + 0.06 });
    flashes.push({ bob, dir: Math.sign(Fx), big: Math.abs(Fx) > 15, t0: performance.now() });
    marks.push(tSim);
    hideHint();
  }
  const NUDGE = 6.5, SHOVE = 30;   // 0.4 N s (caught directly) and 1.8 N s (too hard to catch: it swings round)

  // ---- status ---------------------------------------------------------------------------
  let lastState = "";
  function updateStatus() {
    let st, label;
    const dev = 2 - Math.cos(s[1]) - Math.cos(s[2]);
    const calm = dev < 0.03 && Math.abs(s[4]) < 1 && Math.abs(s[5]) < 1;
    if (!ctrlOnEl.checked) { st = "off"; label = "Controller off"; }
    else if (calm) { st = "balancing"; label = "Balancing"; everBalanced = true; }
    else if (!everBalanced) { st = "swinging"; label = "Swinging up"; }
    else { st = "recovering"; label = drag ? "Fighting back" : "Recovering"; }
    if (paused) label += " (paused)";
    if (label !== lastState) { statusBox.dataset.state = st; statusText.textContent = label; lastState = label; }
  }

  // ---- drawing ------------------------------------------------------------------------
  let W = 0, Hh = 0, dpr = 1, scale = 100, ox = 0, oy = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    W = r.width; Hh = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    scale = Math.min(W / 4.5, Hh / 2.75);
    ox = W / 2; oy = Hh * 0.5 + 0.05 * scale;
    const rc = chart.getBoundingClientRect();
    chart.width = Math.round(rc.width * dpr); chart.height = Math.round(rc.height * dpr);
  }
  const X = x => ox + x * scale, Y = y => oy - y * scale;
  const toWorld = (px, py) => [(px - ox) / scale, (oy - py) / scale];

  function drawPendulum(st, alpha, ghost) {
    const P = D.points(st);
    const cw = 0.42, ch = 0.15, r = 0.06;
    ctx.globalAlpha = alpha;
    // cart
    if (!ghost) {   // planned poses are drawn without the cart, which would otherwise outline the real one
      ctx.fillStyle = C.ink;
      roundRect(X(P[0] - cw / 2), Y(ch / 2), cw * scale, ch * scale, 0.025 * scale); ctx.fill();
      ctx.fillStyle = "#fff";
      for (const wx of [-0.12, 0.12]) { ctx.beginPath(); ctx.arc(X(P[0] + wx), Y(-ch / 2), 0.035 * scale, 0, 7); ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke(); }
    }
    // links
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = ghost ? C.muted : C.ink; ctx.lineWidth = ghost ? 1.5 : Math.max(3, 0.03 * scale);
    ctx.beginPath(); ctx.moveTo(X(P[0]), Y(P[1])); ctx.lineTo(X(P[2]), Y(P[3])); ctx.lineTo(X(P[4]), Y(P[5])); ctx.stroke();
    // bobs
    const rr = (ghost ? 0.6 : 1) * r * scale;
    for (const [i, col] of [[1, C.blue], [2, C.rust]]) {
      ctx.beginPath(); ctx.arc(X(P[2 * i]), Y(P[2 * i + 1]), rr, 0, 7);
      if (ghost) { ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { ctx.fillStyle = col; ctx.fill(); }
    }
    if (!ghost) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X(P[0]), Y(P[1]), 0.022 * scale, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function arrow(x0, y0, x1, y1, col, w) {
    const a = Math.atan2(y1 - y0, x1 - x0), hl = 4 + 2.5 * w;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * hl * 0.6, y1 - Math.sin(a) * hl * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - hl * Math.cos(a - 0.45), y1 - hl * Math.sin(a - 0.45));
    ctx.lineTo(x1 - hl * Math.cos(a + 0.45), y1 - hl * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
  }

  function draw() {
    const want = Math.round(canvas.getBoundingClientRect().width * Math.min(window.devicePixelRatio || 1, 2));
    if (want && want !== canvas.width) resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    // track
    const ty = Y(-0.075 - 0.035);
    ctx.strokeStyle = C.rule; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(-TRACK - 0.25), ty); ctx.lineTo(X(TRACK + 0.25), ty); ctx.stroke();
    ctx.fillStyle = C.muted;
    for (const e of [-1, 1]) ctx.fillRect(X(e * (TRACK + 0.21)) - 2, ty - 0.12 * scale, 4, 0.12 * scale);
    ctx.font = `600 11px ${C.sans}`; ctx.textAlign = "center";
    for (let x = -2; x <= 2; x += 0.5) {
      ctx.fillStyle = C.rule; ctx.fillRect(X(x) - 0.5, ty + 3, 1, Math.abs(x) % 1 === 0 ? 7 : 4);
    }
    ctx.fillStyle = C.muted; ctx.fillText("0", X(0), ty + 22);
    // goal: faint upright ghost at the centre
    ctx.setLineDash([3, 5]); ctx.strokeStyle = C.rule; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(0), Y(1.06)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.muted; ctx.font = `600 10.5px ${C.sans}`; ctx.fillText("GOAL", X(0), Y(1.1));

    // the plan
    const pred = mpc.pred;
    if (showPlanEl.checked && pred && ctrlOnEl.checked) {
      for (let k = 6; k < pred.length; k += 6) drawPendulum(pred[k], 0.42 * (1 - k / pred.length) + 0.08, true);
      ctx.setLineDash([5, 5]); ctx.strokeStyle = C.rust; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.75;
      ctx.beginPath();
      pred.forEach((p, k) => { const q = D.points(p); k ? ctx.lineTo(X(q[4]), Y(q[5])) : ctx.moveTo(X(q[4]), Y(q[5])); });
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    // trail of the upper ball
    for (let i = 1; i < trail.length; i++) {
      ctx.globalAlpha = 0.5 * (i / trail.length) ** 2; ctx.strokeStyle = C.rust; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X(trail[i - 1][0]), Y(trail[i - 1][1])); ctx.lineTo(X(trail[i][0]), Y(trail[i][1])); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    drawPendulum(s, 1, false);

    // force on the cart
    if (Math.abs(u) > 0.5) {
      const L = (u / mpc.umax) * 0.6 * scale, cy = Y(0), x0 = X(s[0]) + Math.sign(u) * 0.24 * scale;
      const sat = Math.abs(u) > mpc.umax - 1;
      arrow(x0, cy, x0 + L, cy, sat ? C.rust : C.muted, 2.5);
    }
    // drag rubber band
    if (drag) {
      const P = D.points(s);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(P[drag.bob * 2]), Y(P[drag.bob * 2 + 1])); ctx.lineTo(X(drag.wx), Y(drag.wy)); ctx.stroke();
      ctx.setLineDash([]); ctx.beginPath(); ctx.arc(X(drag.wx), Y(drag.wy), 5, 0, 7); ctx.fillStyle = C.ink; ctx.fill();
    }
    // push flashes
    const now = performance.now();
    flashes = flashes.filter(f => now - f.t0 < 550);
    for (const f of flashes) {
      const P = D.points(s), bx = X(P[f.bob * 2]), by = Y(P[f.bob * 2 + 1]);
      const a = 1 - (now - f.t0) / 550, len = (f.big ? 70 : 42), gap = 14;
      ctx.globalAlpha = a;
      arrow(bx - f.dir * (gap + len), by, bx - f.dir * gap, by, C.rust, f.big ? 4 : 2.5);
      ctx.globalAlpha = 1;
    }
    drawChart();
  }

  function drawChart() {
    const w = chart.width / dpr, h = chart.height / dpr, span = 8;
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0); cctx.clearRect(0, 0, w, h);
    const padL = 64, padR = 10, y0 = h / 2, ys = (h / 2 - 10) / 220;
    const t1 = tSim, t0 = t1 - span, tx = t => padL + (t - t0) / span * (w - padL - padR);
    cctx.font = `600 10.5px ${C.sans}`; cctx.fillStyle = C.muted; cctx.textAlign = "left";
    cctx.fillText("CART FORCE", 10, 18);
    cctx.font = `10.5px ${C.sans}`; cctx.fillText("±200 N limit", 10, h - 10);
    cctx.strokeStyle = C.rule; cctx.lineWidth = 1;
    cctx.beginPath(); cctx.moveTo(padL, y0); cctx.lineTo(w - padR, y0); cctx.stroke();
    cctx.setLineDash([3, 4]);
    for (const lim of [-200, 200]) { cctx.beginPath(); cctx.moveTo(padL, y0 - lim * ys); cctx.lineTo(w - padR, y0 - lim * ys); cctx.stroke(); }
    cctx.setLineDash([]);
    // disturbance markers
    cctx.strokeStyle = C.rust; cctx.globalAlpha = 0.5;
    for (const m of marks) if (m > t0) { cctx.beginPath(); cctx.moveTo(tx(m), 6); cctx.lineTo(tx(m), h - 6); cctx.stroke(); }
    cctx.globalAlpha = 1;
    while (hist.length && hist[0].t < t0 - 0.1) hist.shift();
    while (marks.length && marks[0] < t0) marks.shift();
    cctx.strokeStyle = C.ink; cctx.lineWidth = 1.5; cctx.beginPath();
    let first = true, prevU = 0;
    for (const p of hist) {
      const x = Math.max(padL, tx(p.t)), y = y0 - p.u * ys;
      if (first) { cctx.moveTo(x, y); first = false; } else { cctx.lineTo(x, y0 - prevU * ys); cctx.lineTo(x, y); }
      prevU = p.u;
    }
    if (!first) cctx.lineTo(tx(t1), y0 - prevU * ys);
    cctx.stroke();
  }

  // ---- main loop ------------------------------------------------------------------------
  let last = 0, frame = 0, visible = true;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!visible) { last = ts; return; }
    let dt = last ? (ts - last) / 1000 : 0; last = ts;
    if (!paused && started) {
      dt = Math.min(dt, 0.05);                 // after a stall, slow down rather than jump
      const n = Math.round(dt / H);
      for (let i = 0; i < n; i++) physicsStep();
      const P = D.points(s); trail.push([P[4], P[5]]); if (trail.length > 45) trail.shift();
    }
    draw();
    if (++frame % 6 === 0) {
      if (ctrlOnEl.checked && solveAvg) solveEl.textContent = solveAvg < 10 ? solveAvg.toFixed(1) : solveAvg.toFixed(0);
      else solveEl.textContent = "–";
      forceEl.textContent = Math.round(u);
    }
    updateStatus();
  }

  // ---- interaction --------------------------------------------------------------------
  function hideHint() { if (hint) hint.classList.add("gone"); }
  function pointerWorld(e) { const r = canvas.getBoundingClientRect(); return toWorld(e.clientX - r.left, e.clientY - r.top); }
  canvas.addEventListener("pointerdown", e => {
    const [wx, wy] = pointerWorld(e), P = D.points(s);
    const d1 = Math.hypot(wx - P[2], wy - P[3]), d2 = Math.hypot(wx - P[4], wy - P[5]);
    const grab = Math.min(d1, d2) < 0.16 ? (d2 <= d1 ? 2 : 1) : 0;
    if (grab) {
      drag = { bob: grab, wx, wy }; canvas.setPointerCapture(e.pointerId); canvas.classList.add("dragging");
      marks.push(tSim); hideHint();
    } else {
      // push the nearer ball away from the click
      const bob = d2 <= d1 ? 2 : 1, bx = P[bob * 2];
      push(bob, (wx < bx ? 1 : -1) * NUDGE);
    }
    if (!started) start();
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", e => { if (drag) { const [wx, wy] = pointerWorld(e); drag.wx = wx; drag.wy = wy; } });
  const endDrag = () => { drag = null; canvas.classList.remove("dragging"); };
  canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);

  document.querySelector(".mpc-buttons").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    act(b.dataset.act);
  });
  function act(a) {
    if (a === "reset") { hangDown(); marks.length = 0; }
    else if (a === "nudge-left") push(2, -NUDGE);
    else if (a === "nudge-right") push(2, NUDGE);
    else if (a === "shove") push(2, (Math.random() < 0.5 ? -1 : 1) * SHOVE);
    else if (a === "pause") { paused = !paused; pauseBtn.textContent = paused ? "Resume" : "Pause"; }
    if (a !== "pause" && !started) start();
  }
  document.addEventListener("keydown", e => {
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    const r = canvas.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;            // only when the demo is on screen
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      push(2, dir * (e.shiftKey ? SHOVE : NUDGE)); if (!started) start(); e.preventDefault();
    } else if (e.key === " " && e.target === document.body) { act("pause"); e.preventDefault(); }
    else if (e.key === "r" || e.key === "R") act("reset");
  });
  ctrlOnEl.addEventListener("change", () => { everBalanced = false; });

  function start() { started = true; }
  // start the swing-up when the demo scrolls into view; pause the work when it is off screen
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(es => {
      for (const en of es) { visible = en.isIntersecting; if (visible && !started) setTimeout(start, 500); }
    }, { threshold: 0.35 }).observe(canvas);
  } else start();

  // Size the canvas backing stores from their laid-out size. Measuring once at start-up can catch
  // the page before its stylesheets/fonts have settled (a tiny canvas then gets stretched and looks
  // blurry), so re-measure whenever the elements change size or the pixel ratio changes.
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas); ro.observe(chart);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("load", resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
  resize();
  requestAnimationFrame(loop);
})();
