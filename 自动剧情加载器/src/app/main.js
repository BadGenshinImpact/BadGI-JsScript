// 应用编排入口：读取版本与设置、选择剧情、切换队伍、执行流程并统一清理实时任务。
// 依赖：file / log / settings / notification / sleep；流程解析与执行来自 flow 模块。

import { chooseProcess } from "../picker/picker.js";
import { switchPartyIfNeeded } from "../steps/switch-party.js";
import { initRealtimeTriggers, disableAllRealtimeTriggers } from "../common/realtime-triggers.js";
import { loadAndParseProcessFile } from "../flow/parser.js";
import { executeSimpleScriptFlow } from "../flow/simple-script-runner.js";
import { executeUnifiedTalkProcess } from "../flow/json-flow-runner.js";

/**
 * 读取 manifest.json 中的版本号。
 * @returns {string} 版本号；读取失败或缺少版本时返回空字符串
 */
function readManifestVersion() {
  try {
    const manifest = JSON.parse(file.readTextSync("manifest.json"));
    return manifest.version || "";
  } catch {
    return "";
  }
}

const VERSION = readManifestVersion();

// 读取设置
const team = settings.team || "";
const elementTeam = settings.elementTeam || "";

/**
 * 输出版本信息，便于异常时定位脚本版本。
 * @returns {void}
 */
async function errorlog() {
  log.info("=".repeat(20));
  log.info("版本: {version}", VERSION);
  log.info("=".repeat(20));
}

/**
 * 执行对话委托流程：启用实时任务，按格式选择断点续跑、简单格式或 JSON 流程执行。
 * @param {string} process_path 流程文件路径
 * @param {string} resumeRelativePath 断点文件相对 resuming/ 的路径
 * @returns {Promise<boolean>} 流程正常结束返回 true
 */
async function executeTalkCommission(process_path, resumeRelativePath) {
  try {

    // 实时任务在流程真正开始时启用，而不是在脚本启动阶段
    initRealtimeTriggers();
    const processSteps = await loadAndParseProcessFile(process_path);

    // 使用统一的处理器执行流程
    if (processSteps && processSteps.__simpleScript) {
      if (settings.useBreakPoint) {
        try {
          log.info("尝试读取断点文件");
          // 拼接断点文件路径
          const breakpointFilePath = `resuming/${resumeRelativePath}`;
          const simpleScript = JSON.parse(file.readTextSync(breakpointFilePath));
          return await executeSimpleScriptFlow(simpleScript, process_path, resumeRelativePath, team, elementTeam);
        } catch (error) {
          log.debug(`读取断点文件时出错: {error}`, error.message);
          log.info("未找到断点文件，执行完整任务流程");
        }
      }
      return await executeSimpleScriptFlow(processSteps.script, process_path, resumeRelativePath, team, elementTeam);
    }
    return await executeUnifiedTalkProcess(
      processSteps,
      process_path
    );
  } catch (error) {
    log.error("执行对话委托时出错: {error}", error.message);
    if (settings.xiaoxitongzhi) notification.error("执行对话委托时出错: " + error.message);
    return false;
  }
}

/**
 * 脚本入口：校验暂停键配置、选择剧情、切换队伍并执行流程，结束时统一复位实时任务。
 * @returns {Promise<void>}
 */
export const Main = async () => {
  log.debug("版本: {version}", VERSION);
  try {
    if (!settings.pause) {
      log.error("请在JS脚本自定义配置中配置暂停键");
      log.error("");
      log.error("请在JS脚本自定义配置中配置暂停键");
      log.error("");
      log.error("请在JS脚本自定义配置中配置暂停键");
      log.error("");
      await sleep(10000);
      return;
    }
    const picked = await chooseProcess();
    if (!picked) {
      log.info("未选择剧情，脚本结束");
      return;
    }

    log.info("执行任务: {path}", picked.name);
    const resumeRelativePath = picked.path.replace(/^process[\\/]/, "");
    await switchPartyIfNeeded(team);
    const succeeded = await executeTalkCommission(picked.path, resumeRelativePath);
    if (succeeded) {
      if (settings.xiaoxitongzhi) notification.Send("脚本执行完成");
    } else {
      log.error("脚本执行未完成");
    }
  } catch (error) {
    log.error("执行出错: {error}", error.message);
    errorlog();
    if (settings.xiaoxitongzhi) notification.error("脚本执行出错: " + error.message);
  } finally {
    // 出错路径同样要复位实时任务，否则自动拾取/吃药/跳过会残留到下一个脚本
    disableAllRealtimeTriggers();
  }
};