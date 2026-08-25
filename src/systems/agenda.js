// 喜事议程时钟：司仪的声音推进全镇与酒店的状态
// 迎宾 → 入席 → 上菜 → 敬酒(返潮点火) → 上头 → 送入洞房
// 玩家可拖延（破像），不可取消。每次切换前有一拍「收声」——全镇同时安静。
export const AGENDA_STAGES = [
  { id: 'yingbin', name: '迎宾', line: '……各位来宾，里边请。今夜潮平，海也来吃酒……' },
  { id: 'ruxi', name: '入席', line: '……吉时已到，诸位入席。按桌牌坐，坐下了就不要换位……' },
  { id: 'shangcai', name: '上菜', line: '……上菜——头道，全家福。动筷之前，先敬海一杯……' },
  { id: 'jingjiu', name: '敬酒', line: '……满上。为周家小姐，也为等了五十年的那一位——敬酒——' },
  { id: 'shangtou', name: '上头', line: '……请全福人上楼，为新娘上头。一梳梳到尾——不许回头……' },
  { id: 'dongfang', name: '送入洞房', line: '……吉时——送入洞房。空着的那把椅子，也该有人坐了……' },
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
  /** 敬酒之后=返潮已点火 */
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
        // 司仪广播：全镇喇叭同步
        this.g.audio.broadcast?.();
        this.g.hud.subtitle(st.line, 6, 'radio');
        this.onStage?.(this.stage, false);
      }
    }
  }
}
