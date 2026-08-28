// CRT 预现系统：场景内真实 CRT 屏幕显示「该空间的下一稳定形态」
// 实现：每帧轮询一台就近 CRT，用第二相机渲到低分辨率 RenderTarget；
// 渲染时叠加「预现层」物件（只在屏幕里存在）并隐藏「现态层」物件——
// 玩家看屏侦察，再对照现实找差异。破像期间所有屏幕转为雪花。
import * as THREE from 'three';

function makeScanlineTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 8, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  for (let y = 0; y < 64; y += 3) ctx.fillRect(0, y, 8, 1);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class CRTSystem {
  constructor(engine, world) {
    this.engine = engine;
    this.world = world;
    this.enabled = false;      // 议程开始前屏幕是暗的
    this.broken = 0;           // 破像剩余秒数（>0 → 全部雪花）
    this.time = 0;
    this.round = 0;
    this.renderBudget = 0;

    const low = engine.lowspec;
    const RW = low ? 96 : 192, RH = low ? 72 : 144;

    this.cam = new THREE.PerspectiveCamera(54, RW / RH, 0.1, 70);

    // 预现层：只在 CRT 渲染中可见的物件（story 填充）
    this.foretold = new THREE.Group();
    this.foretold.visible = false;
    engine.scene.add(this.foretold);
    this.hideInCrt = [];       // 现态物件：CRT 渲染时隐藏（例如满员人群）

    // 雪花贴图（破像/未启用时显示）
    this.staticCanvas = document.createElement('canvas');
    this.staticCanvas.width = 64; this.staticCanvas.height = 48;
    this.staticCtx = this.staticCanvas.getContext('2d');
    this.staticTex = new THREE.CanvasTexture(this.staticCanvas);
    this._staticT = 0;

    const scan = makeScanlineTexture();

    // 为每台 CRT 建 RT 与屏幕材质
    this.units = (world.dynamic.crts ?? []).map((c) => {
      const rt = new THREE.WebGLRenderTarget(RW, RH, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      });
      const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      c.screen.material = mat;
      // 扫描线覆膜
      const ov = new THREE.Mesh(c.screen.geometry.clone(), new THREE.MeshBasicMaterial({
        map: scan, transparent: true, opacity: 0.55, depthWrite: false,
      }));
      ov.material.map = scan;
      ov.position.copy(c.screen.position);
      ov.position.z += 0.002;
      ov.rotation.copy(c.screen.rotation);
      c.screen.parent.add(ov);
      // 微光辉（屏幕点亮后照亮机壳前的一小片）
      return {
        id: c.id, screen: c.screen, mat, rt,
        viewPos: c.viewPos, viewLook: c.viewLook,
        pos: new THREE.Vector3().setFromMatrixPosition(c.group.matrixWorld ?? c.group.matrix).copy(c.group.position),
        needsStatic: true, lastRender: -99,
      };
    });
  }

  /** 打开/关闭所有屏幕 */
  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      for (const u of this.units) {
        u.mat.map = null;
        u.mat.color.set(0x000000);
        u.mat.needsUpdate = true;
      }
    }
  }

  /** 破像：现实与录像不符——屏幕失效一段时间 */
  breakImage(duration = 20) {
    this.broken = Math.max(this.broken, duration);
  }

  /** 配置预现层内容（旧内容清除） */
  setForetell(objects = [], hide = []) {
    this.foretold.clear();
    for (const o of objects) this.foretold.add(o);
    this.hideInCrt = hide;
  }

  addForetell(obj) { this.foretold.add(obj); }

  drawStatic() {
    const ctx = this.staticCtx;
    const img = ctx.createImageData(64, 48);
    const d = img.data;
    for (let i = 0; i < 64 * 48; i++) {
      const v = 40 + Math.random() * 200;
      d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.staticTex.needsUpdate = true;
  }

  update(dt, playerPos) {
    this.time += dt;
    if (this.broken > 0) this.broken -= dt;
    if (!this.enabled || this.units.length === 0) return;

    // 破像/上电中：所有可见屏幕转雪花（共享一张动态噪声贴图）
    if (this.broken > 0) {
      this._staticT -= dt;
      if (this._staticT <= 0) {
        this._staticT = 0.06;
        this.drawStatic();
      }
      for (const u of this.units) {
        if (u.mat.map !== this.staticTex) {
          u.mat.map = this.staticTex;
          u.mat.color.set(0x9fb4b8);
          u.mat.needsUpdate = true;
        }
      }
      return;
    }

    // 轮询渲染：每帧最多 1 台，就近优先
    this.renderBudget += dt;
    if (this.renderBudget < 0.05) return;
    this.renderBudget = 0;

    const near = this.units.filter((u) => u.pos.distanceToSquared(playerPos) < 32 * 32);
    if (near.length === 0) return;
    // 找最久未刷新的一台
    let pick = near[0];
    for (const u of near) if (u.lastRender < pick.lastRender) pick = u;
    if (this.time - pick.lastRender < 0.12) return;
    pick.lastRender = this.time;
    this.renderUnit(pick);

    // 屏幕辉光呼吸（隔行闪烁感）
    for (const u of this.units) {
      if (u.mat.map && u.mat.map !== this.staticTex) {
        const f = 0.92 + Math.sin(this.time * 41 + u.pos.x) * 0.05 + Math.random() * 0.03;
        u.mat.color.setScalar(f);
      }
    }
  }

  renderUnit(u) {
    const { engine } = this;
    const renderer = engine.renderer;

    // 相机就位
    this.cam.position.copy(u.viewPos);
    this.cam.lookAt(u.viewLook);

    // 摄像机自动增益：监控头在暗处会拉高增益——半球光临时抬升（仅改 uniform，
    // 不触发着色器重编译）。没有这一步，夜里对着暗走廊的屏幕读成整块黑玻璃
    const gl = this.gainLight;
    const oldGain = gl ? gl.intensity : 0;
    if (gl) gl.intensity = Math.max(oldGain * 3.2, 1.6);

    // 预现态：显示预现层 / 隐藏现态层 / 隐藏所有屏幕（防反馈回路）
    this.foretold.visible = true;
    const hiddenStates = [];
    for (const o of this.hideInCrt) { hiddenStates.push(o.visible); o.visible = false; }
    const screenStates = [];
    for (const s of this.units) { screenStates.push(s.screen.visible); s.screen.visible = false; }

    const oldFogColor = engine.scene.fog?.color.getHex();
    renderer.setRenderTarget(u.rt);
    renderer.render(engine.scene, this.cam);
    renderer.setRenderTarget(null);
    if (oldFogColor !== undefined) engine.scene.fog.color.setHex(oldFogColor);

    // 复位
    if (gl) gl.intensity = oldGain;
    this.foretold.visible = false;
    this.hideInCrt.forEach((o, i) => { o.visible = hiddenStates[i]; });
    this.units.forEach((s, i) => { s.screen.visible = screenStates[i]; });

    if (u.mat.map !== u.rt.texture) {
      u.mat.map = u.rt.texture;
      u.mat.color.setScalar(1);
      u.mat.needsUpdate = true;
    }
  }
}
