// 程序化音频引擎：零采样文件，全部 WebAudio 实时合成
// 分层：海床/风(环境) + 潮歌(塞壬) + 电台 + 脚步/互动(SFX) + 警戒/追逐(音乐层) + 心跳(视奸)
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
  }

  /** 必须在用户手势后调用 */
  init() {
    if (this.started) return;
    this.started = true;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;

    // 主链：limiter → 目的地
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);

    // 混响（生成的 IR）
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(3.2, 2.4);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.35;
    this.reverb.connect(this.reverbGain).connect(this.master);

    // 分组
    this.ambGroup = this.mkGain(0.9);
    this.sfxGroup = this.mkGain(1.0);
    this.musGroup = this.mkGain(0.9);

    this.buildOcean();
    this.buildWind();
    this.buildDrone();
    this.buildSong();
    this.buildRadio();
    this.buildHeartbeat();

    // 追逐鼓调度
    this.nextDrum = 0;
    this.chaseLevel = 0;
    this.bloodTide = 0;
  }

  mkGain(v, dest = this.master) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(dest);
    return g;
  }

  makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = rate * seconds;
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  makeNoiseBuffer(seconds = 4, brown = false) {
    const rate = this.ctx.sampleRate;
    const len = rate * seconds;
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
    return buf;
  }

  // ---------------- 环境层 ----------------

  buildOcean() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoiseBuffer(6, true);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.4;
    this.oceanGain = ctx.createGain();
    this.oceanGain.gain.value = 0.34;
    src.connect(lp).connect(this.oceanGain).connect(this.ambGroup);
    // 涌浪 LFO
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.13;
    lfo.connect(lfoG).connect(this.oceanGain.gain);
    src.start(); lfo.start();
    // 第二层浪头(带通白噪 + 快LFO)
    const src2 = ctx.createBufferSource();
    src2.buffer = this.makeNoiseBuffer(4);
    src2.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    const g2 = ctx.createGain(); g2.gain.value = 0.05;
    src2.connect(bp).connect(g2).connect(this.ambGroup);
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.11;
    const lfo2G = ctx.createGain(); lfo2G.gain.value = 0.035;
    lfo2.connect(lfo2G).connect(g2.gain);
    src2.start(); lfo2.start();
  }

  buildWind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoiseBuffer(5);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 2.2;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    src.connect(bp).connect(this.windGain).connect(this.ambGroup);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lg = ctx.createGain(); lg.gain.value = 260;
    lfo.connect(lg).connect(bp.frequency);
    src.start(); lfo.start();
  }

  buildDrone() {
    // 不安低频衬底：两只失谐低音，随危险度增强
    const ctx = this.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0;
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 58.7;
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    o1.connect(g1).connect(this.droneGain);
    o2.connect(g2).connect(this.droneGain);
    this.droneGain.connect(this.musGroup);
    o1.start(); o2.start();
  }

  // ---------------- 潮歌（塞壬） ----------------

  buildSong() {
    const ctx = this.ctx;
    // 人声：主振 + 泛音 + 颤音 + 两个共振峰
    this.songOsc = ctx.createOscillator();
    this.songOsc.type = 'sine';
    this.songOsc.frequency.value = 220;
    const harm = ctx.createOscillator();
    harm.type = 'sine';
    this.songHarm = harm;
    harm.frequency.value = 440;
    const harmG = ctx.createGain(); harmG.gain.value = 0.18;

    // 颤音
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
    const vibG = ctx.createGain(); vibG.gain.value = 4;
    vib.connect(vibG);
    vibG.connect(this.songOsc.frequency);
    vibG.connect(harmG.gain);

    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 780; f1.Q.value = 1.4;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1180; f2.Q.value = 2.2;
    const mix = ctx.createGain(); mix.gain.value = 1.6;

    this.songEnv = ctx.createGain();      // 音符包络
    this.songEnv.gain.value = 0;
    this.songGain = ctx.createGain();     // 距离/剧情总量
    this.songGain.gain.value = 0.0;

    this.songOsc.connect(this.songEnv);
    harm.connect(harmG).connect(this.songEnv);
    this.songEnv.connect(f1).connect(mix);
    this.songEnv.connect(f2).connect(mix);
    mix.connect(this.songGain);
    this.songGain.connect(this.musGroup);
    // 大混响
    const send = ctx.createGain(); send.gain.value = 0.9;
    this.songGain.connect(send).connect(this.reverb);

    this.songOsc.start(); harm.start(); vib.start();

    // 旋律：羽调式(近似小调五声)，绵长哀婉
    // A3 220 | C4 261.6 | D4 293.7 | E4 329.6 | G4 392 | A4 440
    this.melody = [
      [220.0, 2.4], [261.6, 1.6], [293.7, 3.2], [0, 1.2],
      [329.6, 2.0], [293.7, 1.2], [261.6, 3.4], [0, 1.6],
      [220.0, 1.6], [293.7, 2.2], [261.6, 1.2], [196.0, 3.8], [0, 2.2],
      [329.6, 1.6], [392.0, 2.6], [440.0, 3.2], [392.0, 1.4], [329.6, 3.6], [0, 2.8],
    ];
    this.melodyIdx = 0;
    this.noteEnd = 0;
  }

  /** 每帧推进旋律 */
  scheduleSong(now) {
    if (now < this.noteEnd) return;
    const [freq, dur] = this.melody[this.melodyIdx];
    this.melodyIdx = (this.melodyIdx + 1) % this.melody.length;
    const g = this.songEnv.gain;
    if (freq === 0) {
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0, now, 0.4);
    } else {
      this.songOsc.frequency.setTargetAtTime(freq, now, 0.06);
      this.songHarm.frequency.setTargetAtTime(freq * 2, now, 0.06);
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0.5, now + 0.05, 0.3);
      g.setTargetAtTime(0.32, now + dur * 0.6, 0.5);
    }
    this.noteEnd = now + dur;
  }

  // ---------------- 电台 ----------------

  buildRadio() {
    const ctx = this.ctx;
    this.radioGain = ctx.createGain();
    this.radioGain.gain.value = 0;
    // 底噪
    const st = ctx.createBufferSource();
    st.buffer = this.makeNoiseBuffer(3);
    st.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8;
    const stG = ctx.createGain(); stG.gain.value = 0.16;
    st.connect(bp).connect(stG).connect(this.radioGain);
    // 含混人声(方波经共振峰+随机调幅)——听不清内容,只有语调
    const voice = ctx.createOscillator();
    voice.type = 'square'; voice.frequency.value = 170;
    const vf = ctx.createBiquadFilter(); vf.type = 'bandpass'; vf.frequency.value = 900; vf.Q.value = 3;
    this.radioVoiceG = ctx.createGain(); this.radioVoiceG.gain.value = 0.0;
    voice.connect(vf).connect(this.radioVoiceG).connect(this.radioGain);
    this.radioVoice = voice;
    this.radioGain.connect(this.ambGroup);
    st.start(); voice.start();
    this.radioTalkT = 0;
  }

  // ---------------- 心跳（视奸） ----------------

  buildHeartbeat() {
    const ctx = this.ctx;
    // 合成一个 0.95s 心跳循环 buffer
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * 0.95);
    const buf = ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    const thump = (at, f, amp, dur) => {
      const start = Math.floor(at * rate);
      const n = Math.floor(dur * rate);
      for (let i = 0; i < n && start + i < len; i++) {
        const t = i / rate;
        const env = Math.exp(-t * 22);
        d[start + i] += Math.sin(2 * Math.PI * f * t) * env * amp;
      }
    };
    thump(0.0, 55, 0.9, 0.25);
    thump(0.28, 48, 0.6, 0.22);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    this.heartGain = ctx.createGain();
    this.heartGain.gain.value = 0;
    src.connect(this.heartGain).connect(this.sfxGroup);
    src.start();
  }

  setSightjack(on) {
    if (!this.started) return;
    this.heartGain.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.3);
  }
  sightjackEnter() { this.blip(880, 0.06, 0.12); this.blip(1320, 0.05, 0.1, 0.05); }
  sightjackTune() { this.blip(660 + Math.random() * 800, 0.05, 0.1); }
  sightjackExit() { this.blip(440, 0.08, 0.1); }

  blip(freq, gain, dur, delay = 0) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxGroup);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------------- SFX ----------------

  footstep(intensity = 1, wet = false) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoiseBuffer(0.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = wet ? 2400 : 900 + Math.random() * 400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.11 * intensity, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (wet ? 0.22 : 0.13));
    src.connect(lp).connect(g).connect(this.sfxGroup);
    src.start(t); src.stop(t + 0.25);
    if (wet) {
      const sp = ctx.createBufferSource();
      sp.buffer = this.makeNoiseBuffer(0.15);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.2;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.06 * intensity, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      sp.connect(bp).connect(g2).connect(this.sfxGroup);
      sp.start(t); sp.stop(t + 0.2);
    }
  }

  /** 潮尸起疑：喉咙灌水声(低频含水颤音) */
  suspect(dist) {
    if (!this.started) return;
    const vol = Math.max(0, 1 - dist / 25) * 0.4;
    if (vol <= 0.01) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t);
    o.frequency.linearRampToValueAtTime(65, t + 0.7);
    const am = ctx.createOscillator(); am.frequency.value = 11;
    const amG = ctx.createGain(); amG.gain.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    am.connect(amG).connect(g.gain);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    o.connect(lp).connect(g).connect(this.sfxGroup);
    g.connect(this.reverb);
    o.start(t); am.start(t); o.stop(t + 1); am.stop(t + 1);
  }

  /** 警报嘶吼：变形人声下滑 + 不协和弦刺 */
  alertShout(dist) {
    if (!this.started) return;
    const vol = Math.max(0.1, 1 - dist / 40);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // 嘶吼
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(340, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 1.1);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    o.connect(f).connect(g).connect(this.sfxGroup);
    g.connect(this.reverb);
    o.start(t); o.stop(t + 1.4);
    // 弦刺（小二度）
    [466.2, 493.9].forEach((fr, i) => {
      const s = ctx.createOscillator();
      s.type = 'triangle'; s.frequency.value = fr;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.001, t);
      sg.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.25 + i * 0.05);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
      s.connect(sg).connect(this.musGroup);
      sg.connect(this.reverb);
      s.start(t); s.stop(t + 2.3);
    });
  }

  /** 小钟/喉铃 */
  bellSmall() {
    this.bell(1240, 0.9, 0.25);
    this.bell(1860, 0.5, 0.18, 0.01);
  }
  /** 灯塔大铜铃(终局) */
  bellBig() {
    this.bell(196, 5.5, 0.7);
    this.bell(392.5, 4.0, 0.4, 0.02);
    this.bell(590, 2.5, 0.22, 0.05);
  }
  bell(freq, dur, amp, delay = 0) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const m = ctx.createOscillator();
    m.frequency.value = freq * 2.76; // 非整数比 → 金属感
    const mg = ctx.createGain(); mg.gain.value = freq * 0.6;
    m.connect(mg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxGroup);
    g.connect(this.reverb);
    o.start(t); m.start(t);
    o.stop(t + dur + 0.1); m.stop(t + dur + 0.1);
  }

  /** 门吱呀 */
  doorCreak() {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.linearRampToValueAtTime(320, t + 0.5);
    o.frequency.linearRampToValueAtTime(240, t + 1.0);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    o.connect(f).connect(g).connect(this.sfxGroup);
    o.start(t); o.stop(t + 1.3);
  }

  /** 纸张 */
  paper() {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoiseBuffer(0.3);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(hp).connect(g).connect(this.sfxGroup);
    src.start(t); src.stop(t + 0.32);
  }

  /** 点香 */
  incense() { this.blip(2400, 0.04, 0.3); this.paper(); }
  /** 谜题错误 */
  wrong() {
    this.bell(180, 1.2, 0.3);
    this.blip(160, 0.15, 0.5, 0.05);
  }

  /** 溺毙 */
  drown() {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // 咕噜气泡
    for (let i = 0; i < 14; i++) {
      const o = ctx.createOscillator();
      const f0 = 180 + Math.random() * 500;
      o.frequency.setValueAtTime(f0, t + i * 0.13);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.8, t + i * 0.13 + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.13);
      g.gain.linearRampToValueAtTime(0.1, t + i * 0.13 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.13 + 0.12);
      o.connect(g).connect(this.sfxGroup);
      o.start(t + i * 0.13); o.stop(t + i * 0.13 + 0.15);
    }
    // 低鸣下沉
    const d = ctx.createOscillator();
    d.frequency.setValueAtTime(90, t);
    d.frequency.exponentialRampToValueAtTime(35, t + 2.5);
    const dg = ctx.createGain();
    dg.gain.setValueAtTime(0.25, t);
    dg.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
    d.connect(dg).connect(this.sfxGroup);
    d.start(t); d.stop(t + 3);
  }

  /** 追逐鼓（渔鼓/太鼓感） */
  chaseDrum(strong) {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(strong ? 82 : 66, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(strong ? 0.5 : 0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.musGroup);
    o.start(t); o.stop(t + 0.3);
    // 鼓皮拍
    const n = ctx.createBufferSource();
    n.buffer = this.makeNoiseBuffer(0.1);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.1, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    n.connect(bp).connect(ng).connect(this.musGroup);
    n.start(t); n.stop(t + 0.1);
  }

  /**
   * 每帧更新
   * st: { playerPos, danger, chase, singer:{x,z,on}, radio:{x,z,on}, blood, resonance }
   */
  update(dt, st) {
    if (!this.started) return;
    const now = this.ctx.currentTime;

    // 危险衬底
    this.droneGain.gain.setTargetAtTime(0.03 + st.danger * 0.12 + this.bloodTide * 0.04, now, 0.8);

    // 追逐鼓
    if (st.chase > 0) {
      if (now >= this.nextDrum) {
        this.beatCount = (this.beatCount ?? 0) + 1;
        this.chaseDrum(this.beatCount % 4 === 1);
        this.nextDrum = now + 0.42;
      }
    } else {
      this.nextDrum = Math.max(this.nextDrum, now + 0.4);
    }

    // 潮歌：按剧情/距离控制
    this.scheduleSong(now);
    let songVol = st.songBase ?? 0;
    if (st.singer?.on) {
      const d = Math.hypot(st.singer.x - st.playerPos.x, st.singer.z - st.playerPos.z);
      songVol = Math.max(songVol, Math.min(0.55, Math.max(0, 1 - d / 55) * 0.7));
    }
    songVol += (st.resonance ?? 0) * 0.35;
    this.songGain.gain.setTargetAtTime(songVol, now, 0.6);

    // 电台
    if (st.radio?.on) {
      const d = Math.hypot(st.radio.x - st.playerPos.x, st.radio.z - st.playerPos.z);
      const v = Math.min(0.5, Math.max(0, 1 - d / 26) * 0.75);
      this.radioGain.gain.setTargetAtTime(v, now, 0.3);
      // 断续讲话
      this.radioTalkT -= dt;
      if (this.radioTalkT <= 0) {
        this.radioTalkT = 0.14 + Math.random() * 0.3;
        const talking = Math.random() < 0.65;
        this.radioVoiceG.gain.setTargetAtTime(talking ? 0.12 : 0.0, now, 0.05);
        if (talking) this.radioVoice.frequency.setValueAtTime(140 + Math.random() * 90, now);
      }
    } else {
      this.radioGain.gain.setTargetAtTime(0, now, 0.3);
    }

    // 血潮
    this.oceanGain.gain.setTargetAtTime(0.34 + this.bloodTide * 0.2, now, 1.5);
  }

  setBloodTide(on) {
    this.bloodTide = on ? 1 : 0;
    if (!this.started) return;
    if (on) {
      // 血潮巨响：一记深海轰鸣
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(48, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 1.2);
      g.gain.exponentialRampToValueAtTime(0.001, t + 6);
      o.connect(g).connect(this.master);
      g.connect(this.reverb);
      o.start(t); o.stop(t + 6.2);
      this.bellBig();
    }
  }
}
