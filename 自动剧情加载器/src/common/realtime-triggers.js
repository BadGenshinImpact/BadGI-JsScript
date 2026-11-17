// 实时任务（AutoSkip / AutoPick / AutoEat）状态记录。
// 依赖：log / dispatcher / RealtimeTimer。
// 上游 Dispatcher 只有 AddTrigger（追加到启用名单）与 ClearAllTriggers（整体清空），
// 没有按名移除；所以「只关掉其中一个」只能记录状态后整体重建。
// TaskTriggerDispatcher.ScriptTriggerTypes 白名单仅含这三个名字，其它名字会抛 ArgumentException。

const TRIGGER_ORDER = ["autoSkip", "autoPick", "autoEat"];

const TRIGGER_NAMES = {
  autoSkip: "AutoSkip",
  autoPick: "AutoPick",
  autoEat: "AutoEat",
};

const TRIGGER_LABELS = {
  autoSkip: "自动剧情",
  autoPick: "自动拾取",
  autoEat: "自动吃药",
};

const state = {
  autoSkip: false,
  autoPick: false,
  autoEat: false,
};

// 按当前状态整体重建启用名单，顺序固定避免抖动
function apply() {
  dispatcher.ClearAllTriggers();
  for (const key of TRIGGER_ORDER) {
    if (!state[key]) continue;
    log.info("启用{label}", TRIGGER_LABELS[key]);
    dispatcher.AddTrigger(new RealtimeTimer(TRIGGER_NAMES[key]));
  }
}

/**
 * 以 settings 为初值初始化实时任务并立即应用。
 * 自动剧情默认开启；自动拾取/自动吃药受配置项控制。
 * @returns {void}
 */
export function initRealtimeTriggers() {
  state.autoSkip = true;
  state.autoPick = !settings.noSkip;
  state.autoEat = !settings.noEat;
  apply();
}

/**
 * 修改单个实时任务状态并重建启用名单。
 * 状态未变化时跳过；未知 key 记录错误并返回 false。
 * @param {"autoSkip"|"autoPick"|"autoEat"} key 任务键
 * @param {boolean} enabled 是否启用
 * @returns {boolean} 处理成功返回 true
 */
export function setRealtimeTrigger(key, enabled) {
  if (!TRIGGER_NAMES[key]) {
    log.error("未知的实时任务: {key}", key);
    return false;
  }
  if (state[key] === enabled) {
    log.info("{label}已处于{state}状态，跳过", TRIGGER_LABELS[key], enabled ? "开启" : "关闭");
    return true;
  }
  state[key] = enabled;
  log.info("{label}{action}", TRIGGER_LABELS[key], enabled ? "开启" : "关闭");
  apply();
  return true;
}

/**
 * 全部关闭并清空启用名单，供脚本结束时复位。
 * @returns {void}
 */
export function disableAllRealtimeTriggers() {
  for (const key of TRIGGER_ORDER) state[key] = false;
  dispatcher.ClearAllTriggers();
}

/**
 * 把流程里的任务名（如 AutoPick）映射到内部状态键（如 autoPick）。
 * @param {string} taskType 任务名
 * @returns {string|null} 状态键；未知名字返回 null
 */
export function realtimeTriggerKeyOf(taskType) {
  for (const key of TRIGGER_ORDER) {
    if (TRIGGER_NAMES[key] === taskType) return key;
  }
  return null;
}
