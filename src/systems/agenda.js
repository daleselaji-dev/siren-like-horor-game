// 核册议程钟：报数员的声音推进全镇与酒店的状态
// 起雾 → 收港 → 归屋 → 验户(返潮点火) → 熄灯 → 还地
// 玩家可拖延（破像），不可取消。每次切换前有一拍「收声」——全镇同时安静。
export const AGENDA_STAGES = [
  { id: 'qiwu', name: '起雾', line: '……蚀湾广播站。今夜有雾。各家落卷帘，渔火不出港……' },
  { id: 'shougang', name: '收港', line: '……收港。船回桩位，缆绳加一道。岸上的人，不要看水……' },
  { id: 'guiwu', name: '归屋', line: '……归屋。核册设在南方大酒店一楼宴会厅。各家闭户，全镇同往，灯留一盏……' },
  { id: 'yanhu', name: '验户', line: '……验户。念到名字的，把手放在册上。没念到的，不要应……' },
  { id: 'xideng', name: '熄灯', line: '……熄灯。核对无误的，可以睡了。窗帘拉严——梦里也不要应名……' },
  { id: 'huandi', name: '还地', line: '……还地。蚀湾，一九九八年借，二〇〇一年清。多谢诸位，多谢配合……' },
];

export class Agenda {
  constructor(game) {
    this.g = game;
    this.stage = -1;        // 尚未开始
    this.silence = 0;       // 收声剩余秒数（音频总闸读取）
    this.pendingLine = null;
    this.onStage = null;    // 回调(story 挂接)
    this.delayed = 0;       // 破像拖延的秒数（叙事用）
  }

  get name() { return this.stage >= 0 ? AGENDA_STAGES[this.stage].name : ''; }
  /** 验户之后=返潮已点火 */
  get leaked() { return this.stage >= 3; }

  /** 推进到下一项（附带收声一拍 → 广播） */
  advance() {
    if (this.stage >= AGENDA_STAGES.length - 1) return;
    this.stage++;
    const st = AGENDA_STAGES[this.stage];
    // 收声：全镇声音同时按下去两拍——比任何响声都吓人
    this.silence = 2.4;
    this.g.audio.hushAll?.(2.4);
    this.pendingLine = st;
    this.g.hud.agenda?.(this.stage, st.name);
  }

  advanceTo(idx) {
    while (this.stage < idx) {
      this.stage++;
      this.g.hud.agenda?.(this.stage, AGENDA_STAGES[this.stage].name);
      this.onStage?.(this.stage, true);
    }
  }

  /** 破像成功等原因拖延议程（叙事时间） */
  delay(sec) { this.delayed += sec; }

  update(dt) {
    if (this.silence > 0) {
      this.silence -= dt;
      if (this.silence <= 0 && this.pendingLine) {
        const st = this.pendingLine;
        this.pendingLine = null;
        // 报数员广播：全镇喇叭同步
        this.g.audio.broadcast?.();
        this.g.hud.subtitle(st.line, 6, 'radio');
        // 规则一判定窗口：广播在响的这几秒里，不许看向海的方向
        this.g.story?.onBroadcast?.(8);
        this.onStage?.(this.stage, false);
      }
    }
  }
}
