// 自动任务指令：按 JSON 步骤启用或关闭实时任务（AutoSkip / AutoPick / AutoEat）。
// 依赖：log / realtime-triggers。

import { setRealtimeTrigger, disableAllRealtimeTriggers, realtimeTriggerKeyOf } from "../common/realtime-triggers.js";

/**
 * 执行自动任务步骤。
 * action 为 enable 时按 taskType 打开单个实时任务，为 disable 时关闭全部；
 * taskType 必须在宿主白名单内，其余名字会被拒绝。
 * @param {{data: {action: string, taskType?: string, config?: Object}}} step 步骤对象
 * @returns {Promise<boolean>} 参数非法或类型不支持时返回 false
 */
export async function processAutoTask(step) {
  try {
    const { action, taskType, config } = step.data;

    if (!action) {
      log.error("自动任务参数不完整，需要 action 参数");
      return false;
    }

    log.info("执行自动任务操作: {action}", action);

    switch (action) {
      case "enable": {
        if (!taskType) {
          log.error("启用自动任务需要指定 taskType");
          return false;
        }

        // 只有 AutoSkip/AutoPick/AutoEat 在宿主白名单内，其它名字会抛 ArgumentException
        const triggerKey = realtimeTriggerKeyOf(taskType);
        if (!triggerKey) {
          log.error("不支持的自动任务类型: {type}，仅支持 AutoSkip/AutoPick/AutoEat", taskType);
          return false;
        }

        if (config && typeof config === "object") {
          log.warn("实时任务不支持附加配置，已忽略: {config}", JSON.stringify(config));
        }
        setRealtimeTrigger(triggerKey, true);
        break;
      }

      case "disable":
        log.info("取消所有自动任务");
        disableAllRealtimeTriggers();
        break;

      default:
        log.error("未知的自动任务操作: {action}", action);
        return false;
    }

    return true;
  } catch (error) {
    log.error("处理自动任务步骤时出错: {error}", error.message);
    return false;
  }
}
