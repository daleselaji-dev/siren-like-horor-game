// HUD / UI：字幕队列、目标提示、互动提示、文书阅读、暂停、死亡、结局、危险与共鸣指示
export class HUD {
  constructor() {
    this.el = {
      subtitles: document.getElementById('subtitles'),
      objToast: document.getElementById('objective-toast'),
      objText: document.querySelector('#objective-toast .obj-text'),
      prompt: document.getElementById('interact-prompt'),
      promptText: document.querySelector('#interact-prompt span'),
      danger: document.getElementById('danger-vignette'),
      resonance: document.getElementById('resonance-vignette'),
      stealth: document.getElementById('stealth-indicator'),
      noteOverlay: document.getElementById('note-overlay'),
      noteTitle: document.getElementById('note-title'),
      noteBody: document.getElementById('note-body'),
      pause: document.getElementById('pause-overlay'),
      pauseNotes: document.getElementById('pause-notes'),
      death: document.getElementById('death-overlay'),
      deathSub: document.getElementById('death-sub'),
      ending: document.getElementById('ending-overlay'),
      endingText: document.getElementById('ending-text'),
      endingCredit: document.getElementById('ending-credit'),
      fader: document.getElementById('fader'),
      drown: document.getElementById('drown-overlay'),
      crosshair: document.getElementById('crosshair'),
    };
    this.subQueue = [];
    this.subActive = null;
    this.subTimer = 0;
    this.objTimer = 0;
  }

  /** 字幕（顺序队列） speaker: null|'radio'|'song' */
  subtitle(text, dur = 3.5, speaker = null) {
    this.subQueue.push({ text, dur, speaker });
  }
  clearSubtitles() {
    this.subQueue.length = 0;
    if (this.subActive) { this.subActive.remove(); this.subActive = null; }
  }

  objective(text) {
    this.el.objText.textContent = text;
    this.el.objToast.classList.add('show');
    this.objTimer = 5;
    this.currentObjective = text;
  }

  prompt(text) {
    if (text) {
      this.el.promptText.textContent = text;
      this.el.prompt.classList.add('show');
    } else {
      this.el.prompt.classList.remove('show');
    }
  }

  showNote(note) {
    this.el.noteTitle.textContent = note.title;
    this.el.noteBody.textContent = note.body;
    this.el.noteOverlay.classList.remove('hidden');
  }
  hideNote() { this.el.noteOverlay.classList.add('hidden'); }
  get noteOpen() { return !this.el.noteOverlay.classList.contains('hidden'); }

  setPause(on, notesFound, notesTotal) {
    this.el.pause.classList.toggle('hidden', !on);
    if (on) {
      this.el.pauseNotes.textContent =
        `已拾获文书 ${notesFound} / ${notesTotal} · 当前目标：${this.currentObjective ?? '—'}`;
    }
  }

  setDeath(on, text) {
    if (text) this.el.deathSub.textContent = text;
    this.el.death.classList.toggle('show', on);
  }

  showEnding(lines, credit) {
    this.el.endingText.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    this.el.endingCredit.innerHTML = credit;
    this.el.ending.classList.add('show');
  }

  fade(toBlack, instant = false) {
    this.el.fader.style.transition = instant ? 'none' : 'opacity 1.5s ease';
    this.el.fader.style.opacity = toBlack ? '1' : '0';
  }

  setCrosshair(on) { this.el.crosshair.classList.toggle('hidden', !on); }

  update(dt, state) {
    // 字幕队列
    if (this.subActive) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) {
        this.subActive.remove();
        this.subActive = null;
      }
    }
    if (!this.subActive && this.subQueue.length) {
      const s = this.subQueue.shift();
      const div = document.createElement('div');
      div.className = 'subtitle-line' + (s.speaker ? ` speaker-${s.speaker}` : '');
      div.textContent = s.text;
      this.el.subtitles.appendChild(div);
      this.subActive = div;
      this.subTimer = s.dur;
    }
    // 目标 toast 自动隐藏
    if (this.objTimer > 0) {
      this.objTimer -= dt;
      if (this.objTimer <= 0) this.el.objToast.classList.remove('show');
    }
    // 危险边缘
    if (state) {
      this.el.danger.style.opacity = Math.min(1, state.danger * 0.9).toFixed(2);
      this.el.resonance.style.opacity = Math.min(1, state.resonance * 1.1).toFixed(2);
      this.el.stealth.classList.toggle('show', !!state.crouching);
      this.el.drown.style.opacity = Math.min(1, (state.drown ?? 0)).toFixed(2);
    }
  }
}
