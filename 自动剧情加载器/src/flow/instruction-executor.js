// 指令执行器：按指令类型分发到对应步骤处理函数，供简单格式流程执行器调用。
// 依赖：各步骤模块；log / sleep / dispatcher / SoloTask / keyMouseScript。

import { processMapTracking, processCommissionTracking } from "../steps/map-tracking.js";
import { processKeyMouseScript } from "../steps/keymouse.js";
import { processKeyPress } from "../steps/key-commands.js";
import { processWaitMainUI } from "../steps/timers.js";
import { executeAutoTalk } from "../steps/dialog-processor.js";
import { autoNavigateToIcon } from "../steps/navigator.js";
import { interactWithTarget, clickAtCoordinates, clickByImageMatch, clickByOcrText, returnToMainUI } from "../steps/ui-actions.js";
import { switchPartyCharacters, switchPartyByName, switchCharacterBodyType, processSwitchRole } from "../steps/party-actions.js";
import { processAutoTask } from "../steps/auto-task.js";
import { processDialogStep } from "../steps/dialog-step.js";
import { waitForPauseKey } from "../steps/pause.js";
import { setRealtimeTrigger } from "../common/realtime-triggers.js";
import { DEFAULT_WAIT_MS } from "../common/constants.js";

const TIME_ADJUST_FILE = "Data/time.json";
const TIME_ADJUST_LEAD_MS = 1000;

/**
 * 执行一条流程指令。
 * @param {{type: string, data: *}} instruction 指令对象
 * @param {{processPath: string, team: string, elementTeam: string,
 *          teamState: {originalTeam: Array|null}}} context 执行上下文；
 *        teamState 需在同一流程执行期间保持同一对象引用
 * @returns {Promise<"OK"|"DONE">} “任务完成”指令返回 DONE，其余返回 OK
 */
export async function executeInstruction(instruction, context) {
  const type = instruction.type;
  const data = instruction.data;
  switch (type) {
    case "地图追踪":
      await processMapTracking({ data }, context.processPath);
      break;
    case "键鼠脚本":
      await processKeyMouseScript({ data }, context.processPath);
      break;
    case "对话":
      // JSON 对象步骤的上下文带 isInMainUI/优先选项，沿用其原语义；
      // 简单格式的上下文没有这些字段，按 NPC 名走 executeAutoTalk
      if (context && typeof context.isInMainUI === "function") {
        await processDialogStep(instruction, context.priorityOptions, context.npcWhiteList, context.isInMainUI);
      } else {
        await executeAutoTalk(data);
      }
      break;
    case "交互":
      await interactWithTarget(data);
      break;
    case "等待返回主界面":
      await processWaitMainUI(data);
      break;
    case "追踪图标": {
      const iconType = data || "Bigmap";
      await autoNavigateToIcon(iconType);
      break;
    }
    case "追踪委托": {
      if (data !== undefined && data !== null) {
        await processCommissionTracking({ data });
      }
      break;
    }
    case "提示": {
      if (data) {
        log.info("提示: {data}", data);
      }
      break;
    }
    case "调时间": {
      // 等待任务弹出后再执行键鼠脚本
      await sleep(TIME_ADJUST_LEAD_MS);
      await keyMouseScript.runFile(TIME_ADJUST_FILE);
      break;
    }
    case "按键":
      await processKeyPress({ data });
      break;
    case "等待":
      log.info("等待{data}毫秒", data);
      await sleep(typeof data === "number" ? data : DEFAULT_WAIT_MS);
      break;
    case "自动拾取":
      // 只切换自动拾取本身，不影响自动剧情/自动吃药
      if (data === "关闭") {
        setRealtimeTrigger("autoPick", false);
      } else {
        setRealtimeTrigger("autoPick", true);
      }
      break;
    case "任务完成":
      return "DONE";
    case "暂停":
      await waitForPauseKey(data);
      break;
    case "战斗":
      await dispatcher.runTask(new SoloTask("AutoFight"));
      break;
    case "切换":
      await switchPartyCharacters(data, context.teamState);
      break;
    case "切换角色":
      await processSwitchRole(instruction);
      break;
    case "自动任务":
      await processAutoTask(instruction);
      break;
    case "点击":
      await clickAtCoordinates(data);
      break;
    case "切换队伍":
      // 简单格式由调用方传入队名；JSON 对象步骤不带队名时回退到脚本设置
      await switchPartyByName(
        data,
        context.team ?? settings.team ?? "",
        context.elementTeam ?? settings.elementTeam ?? ""
      );
      break;
    case "图像匹配":
      await clickByImageMatch(data, context.processPath);
      break;
    case "切换角色体型":
      await switchCharacterBodyType(data);
      break;
    case "点击文字":
      await clickByOcrText(data);
      break;
    case "返回主界面":
      await returnToMainUI();
      break;
    default:
      log.warn("未实现的指令类型: {type}", type);
  }
  return "OK";
}
