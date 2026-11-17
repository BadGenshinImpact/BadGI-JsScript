// 地图追踪与追踪委托指令：运行流程目录下的地图追踪脚本，或按图标类型自动寻路到委托目标。
// 依赖：pathingScript / log；路径拼接来自 common/path-utils，追踪委托依赖 navigator.autoNavigateToTalk。

import { autoNavigateToTalk } from "./navigator.js";
import { resolveSiblingPath } from "../common/path-utils.js";

/**
 * 执行地图追踪步骤。
 * @param {{data: string}} step 步骤对象，data 为相对流程目录的地图追踪文件名
 * @param {string} processFilePath 流程文件路径
 * @returns {Promise<void>}
 * @throws {Error} 地图追踪脚本执行失败时向上抛出
 */
export async function processMapTracking(step, processFilePath) {
  const fullPath = resolveSiblingPath(processFilePath, step.data);
  log.info("执行地图追踪: {path}", fullPath);
  try {
    await pathingScript.runFile(fullPath);
    log.info("地图追踪执行完成");
  } catch (error) {
    log.error("执行地图追踪时出错: {error}", error.message);
    throw error;
  }
}

/**
 * 执行追踪委托步骤：按 NPC 名与图标类型自动寻路到可对话位置。
 * data 为字符串时作为 NPC 名，为对象时读取 npc / iconType，缺省图标类型为 Bigmap。
 * @param {{data: string|{npc?: string, iconType?: string}}} step 步骤对象
 * @returns {Promise<void>}
 * @throws {Error} 寻路失败时向上抛出
 */
export async function processCommissionTracking(step) {
  try {
    let targetNpc = "";
    let iconType = "Bigmap";

    if (typeof step.data === "string") {
      targetNpc = step.data;
    } else if (typeof step.data === "object") {
      if (step.data.npc) targetNpc = step.data.npc;
      if (step.data.iconType) iconType = step.data.iconType;
    }

    log.info(
      "执行追踪委托，目标NPC: {target}，图标类型: {type}",
      targetNpc,
      iconType
    );
    await autoNavigateToTalk(targetNpc, iconType);
    log.info("追踪委托执行完成");
  } catch (error) {
    log.error("执行追踪委托时出错: {error}", error.message);
    throw error;
  }
}
