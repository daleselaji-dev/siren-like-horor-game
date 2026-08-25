// 标题画面背景：2D Canvas 程序化夜海 —— 暗浪、潮线、盐雾颗粒、电台玻璃闪断
// 低分辨率绘制 + CSS 放大，得到胶片颗粒的粗颗粒质感
export class TitleSea {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 480;
    this.H = 270;
    canvas.width = this.W;
    canvas.height = this.H;
    canvas.style.imageRendering = 'auto';
    this.t = 0;
    this.running = false;
    this.glitchT = 0;
    this._raf = 0;
    this._last = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.06, (now - this._last) / 1000);
      this._last = now;
      this.t += dt;
      this.draw(dt);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  draw(dt) {
    const { ctx, W, H, t } = this;
    const horizon = H * 0.46;

    // ---- 天：铅灰渐黑，压得很低 ----
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#05080b');
    sky.addColorStop(0.75, '#0d151a');
    sky.addColorStop(1, '#18232a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon);

    // 隔着湿布的月斑
    const mg = ctx.createRadialGradient(W * 0.62, horizon * 0.55, 2, W * 0.62, horizon * 0.55, 46);
    mg.addColorStop(0, 'rgba(150,168,172,0.20)');
    mg.addColorStop(1, 'rgba(150,168,172,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, W, horizon);

    // ---- 海：一层层向前推进的暗浪带 ----
    const seaG = ctx.createLinearGradient(0, horizon, 0, H);
    seaG.addColorStop(0, '#121e22');
    seaG.addColorStop(1, '#050a0c');
    ctx.fillStyle = seaG;
    ctx.fillRect(0, horizon, W, H - horizon);

    const rows = 26;
    for (let i = 0; i < rows; i++) {
      const f = i / rows;                       // 0 远 → 1 近
      const y0 = horizon + f * f * (H - horizon);
      const amp = 0.6 + f * 3.4;
      const speed = 0.25 + f * 0.9;
      const phase = t * speed + i * 1.7;
      const lum = 0.05 + f * 0.1 + Math.sin(phase * 1.3) * 0.02;
      ctx.strokeStyle = `rgba(${(90 + f * 40) | 0},${(120 + f * 46) | 0},${(124 + f * 44) | 0},${lum.toFixed(3)})`;
      ctx.lineWidth = 0.7 + f * 1.6;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const y = y0
          + Math.sin(x * 0.045 + phase) * amp
          + Math.sin(x * 0.013 - phase * 0.6) * amp * 0.6;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // ---- 潮线泡沫：底部一条不肯退的白线 ----
    const foamY = H * 0.9;
    ctx.strokeStyle = 'rgba(190,200,196,0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const y = foamY + Math.sin(x * 0.06 + t * 0.8) * 3 + Math.sin(x * 0.21 - t * 1.3) * 1.5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let k = 0; k < 26; k++) {
      const x = (k * 97 + ((t * 12) | 0) * 7) % W;
      const y = foamY + Math.sin(x * 0.06 + t * 0.8) * 3 + (k % 5) - 2;
      ctx.fillStyle = `rgba(200,208,204,${0.05 + (k % 4) * 0.03})`;
      ctx.fillRect(x, y, 2 + (k % 3), 1);
    }

    // ---- 海平线上的一串灯（很远，偶尔明灭：它的鳞） ----
    for (let k = 0; k < 7; k++) {
      const lx = W * 0.15 + k * W * 0.1 + Math.sin(k * 3.1) * 8;
      const on = Math.sin(t * 0.4 + k * 1.9) > 0.55 - k * 0.02;
      if (!on) continue;
      ctx.fillStyle = 'rgba(255,148,64,0.5)';
      ctx.fillRect(lx, horizon - 1.5, 1.5, 1.5);
      const lg = ctx.createRadialGradient(lx, horizon - 1, 0, lx, horizon - 1, 5);
      lg.addColorStop(0, 'rgba(255,148,64,0.22)');
      lg.addColorStop(1, 'rgba(255,148,64,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(lx - 5, horizon - 6, 10, 10);
    }

    // ---- 盐雾颗粒 ----
    for (let k = 0; k < 90; k++) {
      const v = Math.random();
      ctx.fillStyle = `rgba(200,210,208,${(v * 0.09).toFixed(3)})`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }

    // ---- 电台玻璃闪断：偶发的横向撕裂条 ----
    this.glitchT -= dt;
    if (this.glitchT <= 0 && Math.random() < 0.012) this.glitchT = 0.12 + Math.random() * 0.1;
    if (this.glitchT > 0) {
      const bands = 2 + ((Math.random() * 3) | 0);
      for (let b = 0; b < bands; b++) {
        const y = Math.random() * H;
        const h = 1 + Math.random() * 5;
        const off = (Math.random() - 0.5) * 26;
        const slice = ctx.getImageData(0, y, W, h);
        ctx.putImageData(slice, off, y);
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '180,60,50' : '90,180,190'},0.06)`;
        ctx.fillRect(0, y, W, h);
      }
    }
  }
}
