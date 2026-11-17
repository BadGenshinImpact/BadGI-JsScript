// 按键指令：解析按键参数并执行点按、按下、松开与长按。
// 依赖：log / keyPress / keyDown / keyUp / sleep。

const DEFAULT_LONG_PRESS_MS = 5000;
const MULTI_KEY_PRESS_INTERVAL_MS = 100;

/**
 * 把按键参数解析为动作、按键列表与长按时长。
 * 对象格式直接取 action/key/duration；字符串格式支持
 * "F"（点按）、"点按 F"、"按下 W"、"松开 W"、"长按 W"、"长按 Shift,W 4000"。
 * 空键会被过滤，避免把空串送进按键接口。
 * @param {string|{action: string, key: string|string[], duration?: number}|null|undefined} data 按键参数
 * @returns {{action: string, keys: string[], duration: number}}
 */
function parseKeyData(data) {
  log.info("data: {data}", data);
  let action = "press";
  let keys = [];
  let duration = DEFAULT_LONG_PRESS_MS;
  if (typeof data === "object" && data !== null) {
    // 对象格式：{ action, key, duration }
    action = data.action || "press";
    keys = Array.isArray(data.key) ? data.key : [data.key];
    if (action === "longpress") {
      duration = data.duration || DEFAULT_LONG_PRESS_MS;
    }
  } else {
    // 字符串格式；只在字符串分支内做字符串化，避免把对象提前转成 "[object Object]"
    const text = String(data === undefined || data === null ? "" : data).trim();
    const parts = text.split(/\s+/);
    if (parts[0] === "长按") {
      action = "longpress";
      keys = (parts[1] || "").split(",");
      if (parts[2] && !isNaN(parseInt(parts[2], 10))) {
        duration = parseInt(parts[2], 10);
      }
    } else if (parts[0] === "松开") {
      action = "release";
      keys = (parts[1] || "").split(",");
    } else if (parts[0] === "点按") {
      action = "press";
      keys = [parts[1]];
    } else if (parts[0] === "按下") {
      action = "down";
      keys = (parts[1] || "").split(",");
    } else {
      keys = [text];
    }
    keys = keys.map((key) => key.trim());
  }
  keys = keys.filter((key) => typeof key === "string" && key.length > 0);
  return { action, keys, duration };
}

/**
 * 执行一条按键指令；按键列表为空时仅记录警告。
 * @param {{data: *}} step 步骤对象，data 为按键参数
 * @returns {Promise<void>}
 */
export async function processKeyPress(step) {
  const { action, keys, duration } = parseKeyData(step.data);

  if (keys.length === 0) {
    log.warn("按键指令没有有效按键: {data}", step.data);
    return;
  }

  switch (action) {
    case "press":
      // 多键依次点按，间隔固定，避免同帧内连续触发被游戏丢弃
      for (const key of keys) {
        log.info(`点击按键: ${key}`);
        keyPress(key);
        await sleep(MULTI_KEY_PRESS_INTERVAL_MS);
      }
      break;
    case "down":
      for (const key of keys) {
        log.info(`按下按键: ${key}`);
        keyDown(key);
      }
      break;
    case "up":
      for (const key of keys) {
        log.info(`释放按键: ${key}`);
        keyUp(key);
      }
      break;
    case "longpress":
      // 先按下全部按键，保持 duration 后统一松开，实现多键同步长按
      log.info(`同步长按按键: ${keys.join(", ")}，时长: ${duration}毫秒`);
      for (const key of keys) {
        keyDown(key);
      }
      await sleep(duration);
      for (const key of keys) {
        keyUp(key);
      }
      log.info(`长按结束，已释放按键: ${keys.join(", ")}`);
      break;
    case "release":
      log.info(`同步释放按键: ${keys.join(", ")}`);
      for (const key of keys) {
        keyUp(key);
      }
      break;
  }
}
