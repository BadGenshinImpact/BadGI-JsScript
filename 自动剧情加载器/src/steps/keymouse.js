// 键鼠脚本指令：运行流程目录下录制的键鼠脚本文件。
// 依赖：keyMouseScript / log。

import { resolveSiblingPath } from "../common/path-utils.js";

/**
 * 执行键鼠脚本步骤。
 * @param {{data: string}} step 步骤对象，data 为相对流程目录的键鼠脚本文件名
 * @param {string} processFilePath 流程文件路径
 * @returns {Promise<void>}
 * @throws {Error} 键鼠脚本执行失败时向上抛出
 */
export async function processKeyMouseScript(step, processFilePath) {
  const fullPath = resolveSiblingPath(processFilePath, step.data);
  log.info("执行键鼠脚本: {path}", fullPath);
  try {
    await keyMouseScript.runFile(fullPath);
    log.info("键鼠脚本执行完成");
  } catch (error) {
    log.error("执行键鼠脚本时出错: {error}", error.message);
    throw error;
  }
}
