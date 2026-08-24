export class Input {
  private keys = new Set<string>();
  private onRestart: () => void;

  constructor(onRestart: () => void) {
    this.onRestart = onRestart;
    window.addEventListener("keydown", this.handleDown);
    window.addEventListener("keyup", this.handleUp);
  }

  private handleDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
      e.preventDefault();
    }
    if (k === "r") this.onRestart();
    this.keys.add(k);
  };

  private handleUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  /** Movement direction from WASD / arrow keys, not normalized. */
  moveAxis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    return { x, y };
  }

  sneaking(): boolean {
    return this.keys.has("shift");
  }

  dispose() {
    window.removeEventListener("keydown", this.handleDown);
    window.removeEventListener("keyup", this.handleUp);
  }
}
