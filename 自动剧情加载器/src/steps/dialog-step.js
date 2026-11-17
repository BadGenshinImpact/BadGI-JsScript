// 对话步骤：解析步骤的 skipCount 后交由统一对话引擎执行。
// 依赖：log / dialog-processor.executeOptimizedAutoTalk。

import { executeOptimizedAutoTalk } from "./dialog-processor.js";

/**
 * 处理对话步骤。
 * @param {{data: number|{skipCount?: number}}} step 步骤对象
 * @param {string[]} priorityOptions 优先选项列表
 * @param {string[]} npcWhiteList NPC 白名单
 * @param {() => boolean} isInMainUI 主界面判断函数
 * @returns {Promise<void>}
 */
export async function processDialogStep(step, priorityOptions, npcWhiteList, isInMainUI) {
  log.info("执行对话");
  let skipCount = 2; // 默认跳过 2 次

  // data 为数字时作为 skipCount；为对象时读取其中的 skipCount
  if (typeof step.data === "number") {
    skipCount = step.data;
  } else if (typeof step.data === "object" && step.data.skipCount) {
    skipCount = step.data.skipCount;
  }

  await executeOptimizedAutoTalk(
    skipCount,
    priorityOptions,
    npcWhiteList,
    isInMainUI
  );
}
