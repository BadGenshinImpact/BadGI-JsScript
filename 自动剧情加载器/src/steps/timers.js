// 等待返回主界面指令：轮询主界面识别，超时后记录日志并继续后续步骤。
// 依赖：log / isInMainUI / sleep。

import { isInMainUI } from "../common/main-ui.js";
import { DEFAULT_WAIT_MAIN_UI_SECONDS } from "../common/constants.js";

const MAIN_UI_POLL_INTERVAL_MS = 1000;

/**
 * 等待游戏返回主界面，最多等待 time 秒。
 * 每秒检测一次；超时不抛错，仅记录日志后继续执行。
 * @param {number} [time=600] 最长等待秒数
 * @returns {Promise<void>}
 */
export async function processWaitMainUI(time = DEFAULT_WAIT_MAIN_UI_SECONDS) {
  for (let i = 0; i < time; i++) {
    if (isInMainUI()) {
      log.info("检测到已返回主界面，结束等待");
      break;
    }
    await sleep(MAIN_UI_POLL_INTERVAL_MS);
  }
  if (!isInMainUI()) {
    log.info("等待返回主界面超时，尝试继续执行后续步骤");
  }
}
