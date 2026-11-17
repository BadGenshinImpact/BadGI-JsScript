// JSON 流程执行器：按步骤数组顺序执行，支持字符串步骤与对象步骤两种形态。
// 依赖：log / sleep / isInMainUI；地图追踪、对话与步骤工厂来自 steps / flow 内模块。

import { processMapTracking } from "../steps/map-tracking.js";
import { executeOptimizedAutoTalk } from "../steps/dialog-processor.js";
import { processRegisteredStep } from "./step-processor-factory.js";
import { isInMainUI } from "../common/main-ui.js";

// 每个步骤之间、以及字符串步骤内自动对话的默认跳过次数
const STEP_INTERVAL_MS = 2000;
const DEFAULT_DIALOG_SKIP_COUNT = 5;

/**
 * 执行一个 JSON 流程的步骤数组。
 * 单步失败只记录日志并继续后续步骤，不中断整个流程。
 * @param {Array} processSteps 步骤数组（字符串或对象）
 * @param {string} processPath 流程文件路径
 * @param {*} [location] 可选的定位信息，随上下文透传
 * @returns {Promise<boolean>} 步骤为空或流程出错返回 false，正常完成返回 true
 */
export async function executeUnifiedTalkProcess(processSteps, processPath, location) {
  try {
    log.info("执行统一对话委托流程: {path}", processPath);

    if (!processSteps || processSteps.length === 0) {
      log.warn("没有找到有效的流程步骤");
      return false;
    }

    let priorityOptions = [];
    let npcWhiteList = [];
    // 同一流程内共享原始队伍状态，供“切换/原来队伍”恢复
    const teamState = { originalTeam: null };

    for (let i = 0; i < processSteps.length; i++) {
      const step = processSteps[i];
      log.info("执行流程步骤 {step}: {type}", i + 1, step.type || step);

      try {
        // 用步骤自定义配置覆盖优先选项与 NPC 白名单
        const stepConfig = processStepConfiguration(step, priorityOptions, npcWhiteList);
        priorityOptions = stepConfig.priorityOptions;
        npcWhiteList = stepConfig.npcWhiteList;

        const context = {
          processPath,
          location,
          processSteps,
          currentIndex: i,
          isInMainUI,
          priorityOptions,
          npcWhiteList,
          teamState,
        };

        const stepResult = await processStep(step, context);
        if (stepResult === "DONE") {
          log.info("收到任务完成指令，任务完成");
          return true;
        }
      } catch (stepError) {
        log.error("执行步骤 {step} 时出错: {error}", i + 1, stepError.message);
        // 继续执行下一步，不中断整个流程
      }

      await sleep(STEP_INTERVAL_MS);
    }

    log.info("统一对话委托流程执行完成: {path}", processPath);
    return true;
  } catch (error) {
    log.error("执行统一对话委托流程时出错: {error}", error.message);
    return false;
  }
}

/**
 * 合并步骤自定义的优先选项与 NPC 白名单，返回新的配置对象。
 * @param {{data?: Object}} step 步骤对象
 * @param {string[]} defaultPriorityOptions 上一轮优先选项
 * @param {string[]} defaultNpcWhiteList 上一轮 NPC 白名单
 * @returns {{priorityOptions: string[], npcWhiteList: string[]}}
 */
function processStepConfiguration(step, defaultPriorityOptions, defaultNpcWhiteList) {
  let priorityOptions = [...defaultPriorityOptions];
  let npcWhiteList = [...defaultNpcWhiteList];

  if (step.data && typeof step.data === "object") {
    if (Array.isArray(step.data.priorityOptions)) {
      priorityOptions = step.data.priorityOptions;
      log.info("使用自定义优先选项: {options}", priorityOptions.join(", "));
    }
    if (Array.isArray(step.data.npcWhiteList)) {
      npcWhiteList = step.data.npcWhiteList;
      log.info("使用自定义NPC白名单: {npcs}", npcWhiteList.join(", "));
    }
  }

  return { priorityOptions, npcWhiteList };
}

/**
 * 按步骤类型分发：字符串步骤走简易处理，对象步骤走步骤处理器工厂。
 * @param {string|Object} step 步骤
 * @param {Object} context 执行上下文
 * @returns {Promise<void>}
 */
async function processStep(step, context) {
  if (typeof step === "string") {
    return await processStringStep(step, context);
  } else if (typeof step === "object") {
    return await processObjectStep(step, context);
  }
}

/**
 * 处理字符串步骤：.json 结尾按地图追踪执行，“F” 触发一次自动对话。
 * @param {string} step 字符串步骤
 * @param {Object} context 执行上下文
 * @returns {Promise<void>}
 */
async function processStringStep(step, context) {
  if (step.endsWith(".json")) {
    await processMapTracking({ data: step }, context.processPath);
  } else if (step === "F") {
    log.info("执行自动剧情");
    await executeOptimizedAutoTalk(
      DEFAULT_DIALOG_SKIP_COUNT,
      context.priorityOptions,
      context.npcWhiteList,
      context.isInMainUI
    );
  }
}

/**
 * 处理对象步骤：输出步骤说明后交由步骤处理器工厂。
 * @param {{note?: string}} step 对象步骤
 * @param {Object} context 执行上下文
 * @returns {Promise<void>}
 */
async function processObjectStep(step, context) {
  if (step.note) {
    log.info("步骤说明: {note}", step.note);
  }
  return await processRegisteredStep(step, context);
}
