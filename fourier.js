// The loader's 3D Fourier drawing of the desk and chair (same data, same projection idea), drawn on a 2D canvas so the
// page needs no three.js. The camera swings slowly around the drawing so it reads as 3D.
(() => {
const D = window.EPICYCLES3D, N = D.n, PARTS = [D.parts.desk, D.parts.chair];
const INK = '#23302e', GHOST = 'rgba(93,107,104,0.30)', ARM = 'rgba(35,48,46,0.42)', ORANGE = '#ec7a3c';
const SHOWN = 24, SEG = 36;            // ellipses drawn (the largest) and their vertices; fewer than the desktop: small screen
const DRAW_MS = 9000, HOLD_MS = 2500, TURN_MS = 18000;      // first drawing; pause; one turn of the mechanism afterwards
const SWING = 0.36, SWING_MS = 30000;  // camera: radians either side of the loader's portrait view, and its period
const FILL = 0.78;                     // the drawing's share of the space it is given: the rest is air
const FOV = 35 * Math.PI / 180;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let visible = true;   // stop drawing while the drawing is scrolled out of view (saves battery)

// the whole path of each part, once (rotation stepping instead of cos/sin per sample)
const paths = PARTS.map((p) => {
    const X = new Float32Array(N).fill(p.centre[0]), Y = new Float32Array(N).fill(p.centre[1]), Z = new Float32Array(N).fill(p.centre[2]);
    for (const e of p.ell) {
        const d = 2 * Math.PI * e[0] / N, cd = Math.cos(d), sd = Math.sin(d); let c = 1, s = 0;
        for (let i = 0; i < N; i++) { X[i] += e[1] * c + e[4] * s; Y[i] += e[2] * c + e[5] * s; Z[i] += e[3] * c + e[6] * s; const c2 = c * cd - s * sd; s = s * cd + c * sd; c = c2; }
    }
    return { X, Y, Z, pen: p.pen };
});
// centre of the drawing
let cx = 0, cy = 0, cz = 0, cnt = 0;
for (const p of paths) for (let i = 0; i < N; i += 8) if (p.pen[i] === '1') { cx += p.X[i]; cy += p.Y[i]; cz += p.Z[i]; cnt++; }
const C = [cx / cnt, cy / cnt, cz / cnt];
// the loader's portrait view (the idle camera at its start), as a direction and distance from the drawing
const P0 = [Math.sin(33000 * 0.00008) * 14500 - 5500, Math.sin(15000 * 0.000004) * 4000 + 9000, 20000];
const off = [P0[0] - C[0], P0[1] - C[1], P0[2] - C[2]];
const yaw0 = Math.atan2(off[0], off[2]), flat = Math.hypot(off[0], off[2]), lift = off[1];

// camera basis for a yaw around the drawing
const cam = { p: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0], f: [0, 0, 0] };
function setCamera(yaw) {
    const p = [C[0] + Math.sin(yaw) * flat, C[1] + lift, C[2] + Math.cos(yaw) * flat];
    let f = [C[0] - p[0], C[1] - p[1], C[2] - p[2]]; const fl = Math.hypot(...f); f = f.map((v) => v / fl);
    let r = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0]; const rl = Math.hypot(...r); r = r.map((v) => v / rl);   // f x up
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    Object.assign(cam, { p, r, u, f });
}
const out = [0, 0];
function project(x, y, z) {
    const dx = x - cam.p[0], dy = y - cam.p[1], dz = z - cam.p[2];
    const k = 1 / (Math.tan(FOV / 2) * (dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2]));
    out[0] = (dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2]) * k; out[1] = -(dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2]) * k;
    return out;
}
// one fixed scale that fits the drawing at every angle of the swing
let ext = [0, 0];
for (let a = -1; a <= 1.001; a += 0.25) {
    setCamera(yaw0 + a * SWING);
    for (const p of paths) for (let i = 0; i < N; i += 16) { project(p.X[i], p.Y[i], p.Z[i]); ext[0] = Math.max(ext[0], Math.abs(out[0])); ext[1] = Math.max(ext[1], Math.abs(out[1])); }
}

const canvas = document.getElementById('fourier'), ctx = canvas.getContext('2d');
let W = 0, H = 0, S = 1, dpr = 1;
function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    S = FILL * Math.min(W * 0.5 / ext[0], H * 0.5 / ext[1]);
}
addEventListener('resize', resize); resize();
const sx = (v) => W / 2 + v * S, sy = (v) => H / 2 + v * S;

// ink between samples a and b (pen-down steps only); alpha for the trail
function ink(p, a, b) {
    ctx.beginPath(); let down = false;
    for (let i = a; i < b; i++) {
        const j = i % N, k = (i + 1) % N;
        if (p.pen[j] !== '1' || p.pen[k] !== '1') { down = false; continue; }
        if (!down) { project(p.X[j], p.Y[j], p.Z[j]); ctx.moveTo(sx(out[0]), sy(out[1])); down = true; }
        project(p.X[k], p.Y[k], p.Z[k]); ctx.lineTo(sx(out[0]), sy(out[1]));
    }
    ctx.stroke();
}
// the mechanism at sample s: the largest ellipses around their joints, the arm, the pen
function rig(part, s) {
    const t = 2 * Math.PI * s / N; let x = part.centre[0], y = part.centre[1], z = part.centre[2];
    const joints = [];
    ctx.strokeStyle = GHOST; ctx.lineWidth = 0.8; ctx.beginPath();
    for (let i = 0; i < part.ell.length; i++) {
        const e = part.ell[i];
        if (i < SHOWN) {
            joints.push([x, y, z]);
            for (let v = 0; v <= SEG; v++) {
                const th = 2 * Math.PI * v / SEG, c = Math.cos(th), sn = Math.sin(th);
                project(x + e[1] * c + e[4] * sn, y + e[2] * c + e[5] * sn, z + e[3] * c + e[6] * sn);
                v ? ctx.lineTo(sx(out[0]), sy(out[1])) : ctx.moveTo(sx(out[0]), sy(out[1]));
            }
        }
        const c = Math.cos(e[0] * t), sn = Math.sin(e[0] * t);
        x += e[1] * c + e[4] * sn; y += e[2] * c + e[5] * sn; z += e[3] * c + e[6] * sn;
    }
    ctx.stroke();
    joints.push([x, y, z]);
    ctx.strokeStyle = ARM; ctx.lineWidth = 1; ctx.beginPath();
    joints.forEach((j, i) => { project(...j); i ? ctx.lineTo(sx(out[0]), sy(out[1])) : ctx.moveTo(sx(out[0]), sy(out[1])); });
    ctx.stroke();
    project(x, y, z); ctx.fillStyle = ORANGE; ctx.beginPath(); ctx.arc(sx(out[0]), sy(out[1]), 2.8, 0, 2 * Math.PI); ctx.fill();
}

const t0 = performance.now();
function frame(now) {
    const ms = reduce ? DRAW_MS + 1 : now - t0;
    setCamera(yaw0 + (reduce ? 0 : SWING * Math.sin(2 * Math.PI * ms / SWING_MS)));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = ctx.lineCap = 'round';

    // the first drawing, a pause, then the circles keep tracing over the finished drawing with a short orange trail
    const drawn = Math.min(1, ms / DRAW_MS), k = ms - DRAW_MS - HOLD_MS;
    const tracing = k > 0, s = ms < DRAW_MS ? drawn * N : tracing ? (k % TURN_MS) / TURN_MS * N : 0;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.15;
    for (const p of paths) if (drawn > 0) ink(p, 0, Math.floor(drawn * N));
    if (tracing) {
        ctx.strokeStyle = ORANGE; ctx.lineWidth = 1.5;
        for (const p of paths) ink(p, Math.floor(s - N * 0.03 + N), Math.floor(s + N));
    }
    // the circles never leave: during the pause they rest where the pen started
    if (!reduce) PARTS.forEach((part) => rig(part, Math.min(s, N - 1e-3)));
    if (!reduce && visible) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
new IntersectionObserver(([e]) => {
    const was = visible; visible = e.isIntersecting;
    if (visible && !was && !reduce) requestAnimationFrame(frame);
}).observe(canvas);
})();
