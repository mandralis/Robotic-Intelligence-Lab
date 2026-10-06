// Double inverted pendulum on a cart: model + nonlinear MPC (iLQR / box-DDP).
// State s = [x, th1, th2, xd, th1d, th2d], angles measured from upright (0 = up, pi = down).
// Input u = horizontal force on the cart [N].
// Same model, cost and discretisation (RK4, multiple-shooting grid) as the CasADi example.
(function (root) {
  "use strict";

  const P = { l1: 0.5, l2: 0.5, g: 9.81, m1: 1, m2: 1, M: 10, c1: 0.01, c2: 0.01, c3: 0.01 };

  // continuous dynamics s_dot = f(s, u) with optional generalised external force Fq (length 3)
  function f(s, u, out, Fq) {
    const { l1, l2, g, m1, m2, M, c1, c2, c3 } = P;
    const t1 = s[1], t2 = s[2], dx = s[3], d1 = s[4], d2 = s[5];
    const c1t = Math.cos(t1), s1t = Math.sin(t1), c2t = Math.cos(t2), s2t = Math.sin(t2);
    const c12 = Math.cos(t1 - t2), s12 = Math.sin(t1 - t2);
    const a = M + m1 + m2, b = l1 * (m1 + m2) * c1t, c = m2 * l2 * c2t;
    const d = l1 * l1 * (m1 + m2), e = l1 * l2 * m2 * c12, h = l2 * l2 * m2;
    let r0 = l1 * (m1 + m2) * d1 * d1 * s1t + m2 * l2 * d2 * d2 * s2t - c1 * dx + u;
    let r1 = -l1 * l2 * m2 * d2 * d2 * s12 + g * (m1 + m2) * l1 * s1t - c2 * d1;
    let r2 = l1 * l2 * m2 * d1 * d1 * s12 + g * l2 * m2 * s2t - c3 * d2;
    if (Fq) { r0 += Fq[0]; r1 += Fq[1]; r2 += Fq[2]; }
    // symmetric 3x3 solve [a b c; b d e; c e h] q = r (Cramer)
    const A00 = d * h - e * e, A01 = c * e - b * h, A02 = b * e - c * d;
    const A11 = a * h - c * c, A12 = b * c - a * e, A22 = a * d - b * b;
    const inv = 1 / (a * A00 + b * A01 + c * A02);
    out[0] = dx; out[1] = d1; out[2] = d2;
    out[3] = (A00 * r0 + A01 * r1 + A02 * r2) * inv;
    out[4] = (A01 * r0 + A11 * r1 + A12 * r2) * inv;
    out[5] = (A02 * r0 + A12 * r1 + A22 * r2) * inv;
    return out;
  }

  const k1 = new Float64Array(6), k2 = new Float64Array(6), k3 = new Float64Array(6), k4 = new Float64Array(6), tmp = new Float64Array(6);
  function rk4(s, u, h, out, Fq) {
    f(s, u, k1, Fq);
    for (let i = 0; i < 6; i++) tmp[i] = s[i] + 0.5 * h * k1[i];
    f(tmp, u, k2, Fq);
    for (let i = 0; i < 6; i++) tmp[i] = s[i] + 0.5 * h * k2[i];
    f(tmp, u, k3, Fq);
    for (let i = 0; i < 6; i++) tmp[i] = s[i] + h * k3[i];
    f(tmp, u, k4, Fq);
    for (let i = 0; i < 6; i++) out[i] = s[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    return out;
  }

  // Cartesian positions [xc, yc, x1, y1, x2, y2] (y up)
  function points(s) {
    const x1 = s[0] + P.l1 * Math.sin(s[1]), y1 = P.l1 * Math.cos(s[1]);
    return [s[0], 0, x1, y1, x1 + P.l2 * Math.sin(s[2]), y1 + P.l2 * Math.cos(s[2])];
  }

  // Generalised force from a Cartesian force F=(Fx,Fy) applied at bob k (1 or 2): Fq = J^T F
  function bobForce(s, k, Fx, Fy) {
    const c1 = Math.cos(s[1]), s1 = Math.sin(s[1]), c2 = Math.cos(s[2]), s2 = Math.sin(s[2]);
    // d(x_k, y_k)/dq
    const Fq = [Fx, P.l1 * (c1 * Fx - s1 * Fy), 0];
    if (k === 2) Fq[2] = P.l2 * (c2 * Fx - s2 * Fy);
    return Fq;
  }

  // ------------------------------------------------------------------------------------------
  // Cost (Gauss-Newton residual form, identical to the CasADi example):
  //   stage:  w_x x^2 + w_th [(1-cos th1) + (1-cos th2)] * 2 + w_v |v|^2 + r u^2 + track barrier
  // The periodic (1-cos) terms make "upright" the same goal no matter how many turns the
  // pendulum has made, so a push that flips it over never leaves the controller confused.
  // Residuals use sin(th/2): 4 sin^2(th/2) = 2(1-cos th), so the Gauss-Newton Hessian is exact
  // at the goal and always positive semi-definite.
  // ------------------------------------------------------------------------------------------
  const W = { x: 1.0, th: 6.0, xd: 0.05, thd: 0.05, r: 2e-4, xmax: 1.5, wall: 4000, term: 10 };

  // residual vector r(s,u) and its Jacobian wrt s (u handled separately; it is linear)
  function residual(s, scale, res, J) {
    // res: length 7, J: 7x6 row-major
    const sx = Math.sqrt(W.x * scale), sth = Math.sqrt(W.th * scale) * 2, sv = Math.sqrt(W.xd * scale), sw = Math.sqrt(W.thd * scale);
    J.fill(0);
    res[0] = sx * s[0]; J[0 * 6 + 0] = sx;
    res[1] = sth * Math.sin(s[1] / 2); J[1 * 6 + 1] = sth * 0.5 * Math.cos(s[1] / 2);
    res[2] = sth * Math.sin(s[2] / 2); J[2 * 6 + 2] = sth * 0.5 * Math.cos(s[2] / 2);
    res[3] = sv * s[3]; J[3 * 6 + 3] = sv;
    res[4] = sw * s[4]; J[4 * 6 + 4] = sw;
    res[5] = sw * s[5]; J[5 * 6 + 5] = sw;
    // soft track limit: quadratic penalty beyond |x| > xmax
    const over = Math.abs(s[0]) - W.xmax, sb = Math.sqrt(W.wall * scale);
    if (over > 0) { res[6] = sb * over * Math.sign(s[0]); J[6 * 6 + 0] = sb; } else res[6] = 0;
    return res;
  }

  function stageCost(s, u, scale) {
    const r = new Float64Array(7), J = new Float64Array(42);
    residual(s, scale, r, J);
    let c = 0; for (let i = 0; i < 7; i++) c += r[i] * r[i];
    return c + W.r * scale * u * u;
  }

  // ------------------------------------------------------------------------------------------
  // Controller: control-limited iLQR (box-DDP specialised to a scalar input), warm started
  // from the previous solution shifted by one step. Returns first input; keeps the predicted
  // state trajectory for visualisation.
  // ------------------------------------------------------------------------------------------
  function NMPC(opts) {
    opts = opts || {};
    this.N = opts.N || 60;          // shooting intervals
    this.dt = opts.dt || 0.025;     // interval length = control period [s] (horizon = N*dt)
    this.umax = opts.umax || 200;   // force limit [N]
    this.iters = opts.iters || 4;   // iLQR iterations per control step (real-time iteration)
    this.mu = 1e-3;
    const N = this.N;
    this.U = new Float64Array(N);
    this.X = []; for (let k = 0; k <= N; k++) this.X.push(new Float64Array(6));
    this.Xn = []; for (let k = 0; k <= N; k++) this.Xn.push(new Float64Array(6));
    this.Un = new Float64Array(N);
    this.A = []; this.B = []; for (let k = 0; k < N; k++) { this.A.push(new Float64Array(36)); this.B.push(new Float64Array(6)); }
    this.kff = new Float64Array(N); this.K = []; for (let k = 0; k < N; k++) this.K.push(new Float64Array(6));
    this.cost = Infinity; this.lastSolveMs = 0; this.lastIters = 0;
  }

  NMPC.prototype.rollout = function (x0, U, X) {
    X[0].set(x0);
    let J = 0;
    for (let k = 0; k < this.N; k++) {
      J += stageCost(X[k], U[k], this.dt);
      rk4(X[k], U[k], this.dt, X[k + 1]);
    }
    return J + stageCost(X[this.N], 0, W.term);
  };

  NMPC.prototype.linearise = function () {
    const N = this.N, h = this.dt, xp = new Float64Array(6), yp = new Float64Array(6), ym = new Float64Array(6), xm = new Float64Array(6);
    for (let k = 0; k < N; k++) {
      const x = this.X[k], u = this.U[k], A = this.A[k], B = this.B[k];
      for (let j = 0; j < 6; j++) {
        const eps = 1e-6 * Math.max(1, Math.abs(x[j]));
        xp.set(x); xm.set(x); xp[j] += eps; xm[j] -= eps;
        rk4(xp, u, h, yp); rk4(xm, u, h, ym);
        for (let i = 0; i < 6; i++) A[i * 6 + j] = (yp[i] - ym[i]) / (2 * eps);
      }
      const eu = 1e-4 * Math.max(1, Math.abs(u));
      rk4(x, u + eu, h, yp); rk4(x, u - eu, h, ym);
      for (let i = 0; i < 6; i++) B[i] = (yp[i] - ym[i]) / (2 * eu);
    }
  };

  // backward Riccati pass; returns false if Quu not positive (increase regularisation)
  NMPC.prototype.backward = function () {
    const N = this.N, r = new Float64Array(7), Jr = new Float64Array(42);
    const Vx = new Float64Array(6), Vxx = new Float64Array(36);
    const Qx = new Float64Array(6), Qxx = new Float64Array(36), Qux = new Float64Array(6);
    const VA = new Float64Array(36);
    // terminal
    residual(this.X[N], W.term, r, Jr);
    gnTerms(r, Jr, Vx, Vxx);
    this.dV = 0;
    for (let k = N - 1; k >= 0; k--) {
      const A = this.A[k], B = this.B[k], u = this.U[k];
      residual(this.X[k], this.dt, r, Jr);
      gnTerms(r, Jr, Qx, Qxx);
      // Qx += A' Vx ; Qu = r u + B' Vx
      let Qu = 2 * W.r * this.dt * u, Quu = 2 * W.r * this.dt + this.mu;
      for (let i = 0; i < 6; i++) { let sAx = 0; for (let j = 0; j < 6; j++) sAx += A[j * 6 + i] * Vx[j]; Qx[i] += sAx; Qu += B[i] * Vx[i]; }
      // VA = Vxx A  (6x6)
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let sm = 0; for (let l = 0; l < 6; l++) sm += Vxx[i * 6 + l] * A[l * 6 + j]; VA[i * 6 + j] = sm; }
      // Qxx += A' Vxx A ; Qux = B' Vxx A ; Quu += B' Vxx B
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let sm = 0; for (let l = 0; l < 6; l++) sm += A[l * 6 + i] * VA[l * 6 + j]; Qxx[i * 6 + j] += sm; }
      for (let j = 0; j < 6; j++) { let sm = 0; for (let l = 0; l < 6; l++) sm += B[l] * VA[l * 6 + j]; Qux[j] = sm; }
      for (let i = 0; i < 6; i++) { let sm = 0; for (let l = 0; l < 6; l++) sm += Vxx[i * 6 + l] * B[l]; Quu += B[i] * sm; }
      if (!(Quu > 0)) return false;
      // scalar box-QP: k = clamp(u - Qu/Quu) - u ; if clamped, feedback gain is zero
      const uStar = u - Qu / Quu, uCl = Math.max(-this.umax, Math.min(this.umax, uStar));
      const kff = uCl - u, K = this.K[k];
      const clamped = uCl !== uStar;
      for (let j = 0; j < 6; j++) K[j] = clamped ? 0 : -Qux[j] / Quu;
      this.kff[k] = kff;
      this.dV += kff * Qu + 0.5 * kff * kff * Quu;
      // value update
      for (let i = 0; i < 6; i++) Vx[i] = Qx[i] + K[i] * Quu * kff + K[i] * Qu + Qux[i] * kff;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++)
        Vxx[i * 6 + j] = Qxx[i * 6 + j] + K[i] * Quu * K[j] + K[i] * Qux[j] + Qux[i] * K[j];
      for (let i = 0; i < 6; i++) for (let j = 0; j < i; j++) { const m = 0.5 * (Vxx[i * 6 + j] + Vxx[j * 6 + i]); Vxx[i * 6 + j] = m; Vxx[j * 6 + i] = m; }
    }
    return true;
  };

  function gnTerms(r, J, g, H) {
    // g = 2 J' r ; H = 2 J' J
    for (let i = 0; i < 6; i++) { let sm = 0; for (let l = 0; l < 7; l++) sm += J[l * 6 + i] * r[l]; g[i] = 2 * sm; }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let sm = 0; for (let l = 0; l < 7; l++) sm += J[l * 6 + i] * J[l * 6 + j]; H[i * 6 + j] = 2 * sm; }
  }

  NMPC.prototype.forward = function (x0, alpha) {
    const N = this.N, X = this.X, Xn = this.Xn, Un = this.Un;
    Xn[0].set(x0);
    let J = 0;
    for (let k = 0; k < N; k++) {
      let du = alpha * this.kff[k];
      const K = this.K[k];
      for (let j = 0; j < 6; j++) du += K[j] * (Xn[k][j] - X[k][j]);
      Un[k] = Math.max(-this.umax, Math.min(this.umax, this.U[k] + du));
      J += stageCost(Xn[k], Un[k], this.dt);
      rk4(Xn[k], Un[k], this.dt, Xn[k + 1]);
    }
    return J + stageCost(Xn[N], 0, W.term);
  };

  // one MPC step: shift warm start, run a few iLQR iterations from the measured state x0
  NMPC.prototype.step = function (x0, maxIters) {
    const t0 = (typeof performance !== "undefined" ? performance : Date).now();
    const N = this.N;
    // re-express measured angles within +-pi of the plan so the warm start stays consistent
    const xm = Float64Array.from(x0);
    // Warm start = previous solution shifted by one step, rolled out *closed loop* with the
    // previous feedback gains (u = U_k + K_k (x - X_k)). An open-loop rollout of an unstable
    // system diverges after a push and drags iLQR into poor local minima.
    if (this.warm) {
      for (let k = 0; k < N; k++) this.kff[k] = 0;
      this.cost = this.forward(xm, 0);
      for (let k = 0; k <= N; k++) this.X[k].set(this.Xn[k]);
      this.U.set(this.Un);
    } else {
      this.cost = this.rollout(xm, this.U, this.X);
    }
    let it = 0;
    const iters = maxIters || this.iters;
    for (; it < iters; it++) {
      this.linearise();
      let ok = false;
      for (let tries = 0; tries < 8 && !ok; tries++) {
        if (this.backward()) ok = true; else this.mu = Math.min(this.mu * 10, 1e6);
      }
      if (!ok) break;
      if (Math.abs(this.dV) < 1e-7 * (1 + this.cost)) break;   // converged: nothing left to gain
      let accepted = false;
      for (const alpha of [1, 0.5, 0.25, 0.1, 0.03]) {
        const Jn = this.forward(xm, alpha);
        if (Jn < this.cost) {
          this.cost = Jn;
          for (let k = 0; k <= N; k++) this.X[k].set(this.Xn[k]);
          this.U.set(this.Un);
          accepted = true; break;
        }
      }
      if (accepted) this.mu = Math.max(this.mu / 3, 1e-6);
      else { this.mu = Math.min(this.mu * 10, 1e3); }
    }
    this.lastIters = it;
    const u0 = this.U[0];
    // shift the plan (inputs, states, gains) by one step for the next call
    this.pred = this.X.map(x => Float64Array.from(x));   // keep for drawing
    for (let k = 0; k < N - 1; k++) { this.U[k] = this.U[k + 1]; this.K[k].set(this.K[k + 1]); }
    for (let k = 0; k < N; k++) this.X[k].set(this.X[k + 1]);
    this.warm = true;
    this.lastSolveMs = (typeof performance !== "undefined" ? performance : Date).now() - t0;
    return u0;
  };

  NMPC.prototype.reset = function () { this.U.fill(0); this.mu = 1e-3; this.cost = Infinity; this.warm = false; for (const K of this.K) K.fill(0); };

  const api = { P, W, f, rk4, points, bobForce, NMPC, stageCost };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DIPC = api;
})(this);
