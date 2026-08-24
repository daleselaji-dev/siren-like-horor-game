// 输入系统：键盘状态 + 指针锁定鼠标增量 + 单帧动作边沿检测
export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();        // 当前按下
    this.pressed = new Set();     // 本帧按下（边沿）
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const c = e.code;
      if (!this.keys.has(c)) this.pressed.add(c);
      this.keys.add(c);
      // 防止 Tab 切焦点 / 空格滚动
      if (c === 'Tab' || c === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || !this.enabled) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.dom;
    });
  }

  requestLock() {
    if (document.pointerLockElement !== this.dom) {
      this.dom.requestPointerLock?.();
    }
  }
  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  down(code) { return this.keys.has(code); }
  justPressed(code) { return this.pressed.has(code); }

  /** 每帧末尾调用：清除边沿与鼠标增量 */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0; this.mouseDY = 0;
    return d;
  }
}
