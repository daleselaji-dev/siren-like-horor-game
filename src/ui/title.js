// 标题画面背景：2D Canvas 程序化「迎宾楼」前庭夜景
// 海雾、灯箱招牌的钠光、两扇不该亮的窗、湿沥青上的倒影。
// 禁则：无 VHS 撕裂、无噪点 glitch——只有镇流器老化的明灭。
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
    this._raf = 0;
    this._last = 0;
    // 雾带
    this.fogBands = [];
    for (let i = 0; i < 5; i++) {
      this.fogBands.push({
        y: 0.45 + i * 0.11, speed: 3 + i * 2.2, ph: i * 2.1,
        h: 12 + i * 8, op: 0.05 + i * 0.02,
      });
    }
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

  draw() {
    const { ctx, W, H, t } = this;
    const groundY = H * 0.78;

    // ---- 天：铅灰阴夜 ----
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#05080b');
    sky.addColorStop(0.6, '#0c1318');
    sky.addColorStop(1, '#1a2226');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // 隔雾的月
    const mg = ctx.createRadialGradient(W * 0.18, H * 0.18, 2, W * 0.18, H * 0.18, 40);
    mg.addColorStop(0, 'rgba(150,168,172,0.16)');
    mg.addColorStop(1, 'rgba(150,168,172,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, W, groundY);

    // ---- 迎宾楼剪影 ----
    const bx = W * 0.24, bw = W * 0.52, byTop = H * 0.24, byBot = groundY;
    ctx.fillStyle = '#0a0e11';
    ctx.fillRect(bx, byTop, bw, byBot - byTop);
    // 檐口线
    ctx.fillStyle = '#12181c';
    ctx.fillRect(bx - 6, byTop - 5, bw + 12, 6);

    // 招牌灯箱：迎宾楼（镇流器老化的明灭——整体亮度缓变，偶尔哑一下）
    const buzz = Math.sin(t * 0.7) + Math.sin(t * 3.1 + 2);
    const signOn = buzz > 1.93 ? 0.25 : 1;
    const glow = (0.75 + Math.sin(t * 9) * 0.04) * signOn;
    const sx = W * 0.5, sy = byTop + 16;
    const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
    sg.addColorStop(0, `rgba(255,170,110,${0.30 * glow})`);
    sg.addColorStop(1, 'rgba(255,170,110,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 90, sy - 60, 180, 120);
    ctx.fillStyle = `rgba(20,14,10,0.9)`;
    ctx.fillRect(sx - 58, sy - 12, 116, 26);
    ctx.font = '18px "Songti SC","Noto Serif SC",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(255,196,140,${0.9 * glow})`;
    ctx.fillText('迎 宾 楼', sx, sy + 1);
    // 右下角一个小小的红囍
    ctx.fillStyle = `rgba(190,50,40,${0.8 * glow})`;
    ctx.font = '9px serif';
    ctx.fillText('囍', sx + 66, sy + 2);

    // 窗格：大部分黑着，两扇亮着不该亮的灯
    ctx.textAlign = 'left';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        const wx = bx + 14 + c * (bw - 28) / 8;
        const wy = byTop + 40 + r * 26;
        const lit = (r === 1 && c === 2) || (r === 0 && c === 6);
        ctx.fillStyle = lit
          ? `rgba(255,190,120,${0.5 + Math.sin(t * 1.1 + c) * 0.08})`
          : 'rgba(16,22,26,0.9)';
        ctx.fillRect(wx, wy, 12, 16);
      }
    }

    // 门廊：玻璃门里一线暖光
    const dx = W * 0.5;
    ctx.fillStyle = '#0d1114';
    ctx.fillRect(dx - 30, groundY - 44, 60, 44);
    ctx.fillStyle = `rgba(255,200,140,${0.28 + Math.sin(t * 0.9) * 0.04})`;
    ctx.fillRect(dx - 9, groundY - 40, 18, 40);
    // 门廊柱
    ctx.fillStyle = '#141a1e';
    ctx.fillRect(dx - 44, groundY - 52, 9, 52);
    ctx.fillRect(dx + 35, groundY - 52, 9, 52);

    // ---- 海雾带：从右往左爬 ----
    for (const f of this.fogBands) {
      const y = f.y * H;
      const off = (t * f.speed + f.ph * 40) % (W + 160) - 80;
      const fg = ctx.createRadialGradient(W - off, y, 4, W - off, y, 110);
      fg.addColorStop(0, `rgba(170,185,182,${f.op})`);
      fg.addColorStop(1, 'rgba(170,185,182,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, y - f.h, W, f.h * 2);
    }

    // ---- 湿沥青前庭：招牌与门灯的倒影被拉长 ----
    const gg = ctx.createLinearGradient(0, groundY, 0, H);
    gg.addColorStop(0, '#121517');
    gg.addColorStop(1, '#07090b');
    ctx.fillStyle = gg;
    ctx.fillRect(0, groundY, W, H - groundY);
    // 倒影条
    const refl = (x, w, col, a) => {
      const rg = ctx.createLinearGradient(0, groundY, 0, H);
      rg.addColorStop(0, `rgba(${col},${a})`);
      rg.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = rg;
      for (let i = 0; i < 5; i++) {
        const wob = Math.sin(t * 1.4 + i * 1.7) * 2;
        ctx.fillRect(x - w / 2 + wob, groundY + i * (H - groundY) / 5, w * (1 - i * 0.13), (H - groundY) / 5 - 1);
      }
    };
    refl(sx, 60, '255,170,110', 0.10 * glow);
    refl(dx, 16, '255,200,140', 0.12);

    // 水洼高光点
    for (let k = 0; k < 14; k++) {
      const x = (k * 137) % W;
      const y = groundY + ((k * 53) % (H - groundY));
      ctx.fillStyle = `rgba(180,195,195,${0.02 + (k % 3) * 0.015})`;
      ctx.fillRect(x, y, 8 + (k % 4) * 4, 1);
    }

    // ---- 空气里的水汽颗粒 ----
    for (let k = 0; k < 60; k++) {
      const v = Math.random();
      ctx.fillStyle = `rgba(190,205,202,${(v * 0.07).toFixed(3)})`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }
  }
}
