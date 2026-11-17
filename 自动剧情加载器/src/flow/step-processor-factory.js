// 步骤处理器工厂：JSON 对象步骤统一交给指令执行器分发，并支持运行时注册新类型。
// 依赖：instruction-executor；log。

import { executeInstruction } from "./instruction-executor.js";

// 运行时注册的自定义步骤处理器（步骤类型 → 处理函数），用于覆盖内置指令
const customProcessors = {};

/**
 * 注册一个新的步骤处理器；同名时会覆盖内置指令。
 * @param {string} stepType 步骤类型名
 * @param {(step: Object, context: Object) => Promise<*>} processor 处理器函数
 * @returns {void}
 */
export function registerStepProcessor(stepType, processor) {
  customProcessors[stepType] = processor;
  log.info("注册新的步骤处理器: {type}", stepType);
}

/**
 * 执行一个对象步骤：优先使用注册的自定义处理器，否则交给统一的指令执行器。
 * @param {{type: string, data?: *}} step 步骤对象
 * @param {Object} context 执行上下文
 * @returns {Promise<"OK"|"DONE">} “任务完成”类指令返回 DONE，其余返回 OK
 */
export async function processRegisteredStep(step, context) {
  const processor = customProcessors[step.type];
  if (processor) {
    return await processor(step, context);
  }
  return await executeInstruction(step, context);
}
