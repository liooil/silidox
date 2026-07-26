// Shared game data for classic browser scripts. Keep this file side-effect free.
const PIN_IDS = ["I0", "I1", "I2", "I3", "I4", "I5", "I6", "I7"];

const LOGIC_CONSTANTS = {
  0: { value: false, zh: "常量低电平" },
  1: { value: true, zh: "常量高电平" },
};

const SIGNALS = {
  DRIVE_STALL: "DRIVE_STALL",
  FIBER_ECHO: "FIBER_ECHO",
  PICKUP_PULSE: "PICKUP_PULSE",
  ORIGIN_MARK: "ORIGIN_MARK",
  MAG_WEST: "MAG_WEST",
  LEDGER_WINDOW: "LEDGER_WINDOW",
  SETTLEMENT_ACK: "SETTLEMENT_ACK",
  CORE_LOW: "CORE_LOW",
};

const SIGNAL_INFO = {
  [SIGNALS.DRIVE_STALL]: { zh: "轨道边界", hypothesis: "前方无法继续移动" },
  [SIGNALS.FIBER_ECHO]: { zh: "碎片回波", hypothesis: "当前位置有可拾取碎片" },
  [SIGNALS.PICKUP_PULSE]: { zh: "拾取脉冲", hypothesis: "刚刚拾取过碎片" },
  [SIGNALS.ORIGIN_MARK]: { zh: "轨道零点", hypothesis: "机器人位于轨道起点" },
  [SIGNALS.MAG_WEST]: { zh: "磁向西", hypothesis: "机器人正朝西" },
  [SIGNALS.LEDGER_WINDOW]: { zh: "账本写入窗", hypothesis: "结算窗口开放" },
  [SIGNALS.SETTLEMENT_ACK]: { zh: "结算确认", hypothesis: "账本已经确认" },
  [SIGNALS.CORE_LOW]: { zh: "核心低压", hypothesis: "核心能量过低" },
};

const PIN_MAPS = [
  {
    I0: SIGNALS.DRIVE_STALL,
    I1: SIGNALS.FIBER_ECHO,
    I2: SIGNALS.PICKUP_PULSE,
    I3: SIGNALS.ORIGIN_MARK,
    I4: SIGNALS.MAG_WEST,
    I5: SIGNALS.LEDGER_WINDOW,
    I6: SIGNALS.SETTLEMENT_ACK,
    I7: SIGNALS.CORE_LOW,
  },
  {
    I0: SIGNALS.CORE_LOW,
    I1: SIGNALS.DRIVE_STALL,
    I2: SIGNALS.PICKUP_PULSE,
    I3: SIGNALS.ORIGIN_MARK,
    I4: SIGNALS.FIBER_ECHO,
    I5: SIGNALS.SETTLEMENT_ACK,
    I6: SIGNALS.LEDGER_WINDOW,
    I7: SIGNALS.MAG_WEST,
  },
];

const OUTPUTS = {
  Q0: "DRIVE",
  Q1: "REVERSE",
  Q2: "PICKUP",
  Q3: "BUS_WRITE",
  Q4: "HEART_PULSE",
};

const OUTPUT_INFO = {
  Q0: { zh: "轨道驱动" },
  Q1: { zh: "掉头" },
  Q2: { zh: "碎片拾取" },
  Q3: { zh: "总线写入" },
  Q4: { zh: "核心脉冲" },
};

const REALMS = [
  { name: "未入道", qi: 0, foundation: 0 },
  { name: "练气一层", qi: 30, foundation: 3 },
  { name: "练气二层", qi: 100, foundation: 8 },
  { name: "练气三层", qi: 220, foundation: 16 },
  { name: "筑基", qi: 520, foundation: 32 },
];

const DISCOVERY = {
  UNKNOWN: 0,
  SUSPECTED: 1,
  CONFIRMED: 2,
};

const MOTION_PRIORITY = ["Q3", "Q2", "Q1", "Q0"];

const TRACK_LENGTH = 9;
const TRACK_START = 0;
const TRACK_FRAGMENTS = [2, 5, 7];

const META_STORAGE_KEY = "silidox.meta.v1";
