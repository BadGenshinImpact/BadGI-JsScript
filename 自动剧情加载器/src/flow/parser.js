// 流程文件解析器：读取流程文件，并统一解析为 JSON 步骤数组、扩展简单格式脚本或旧逐行格式。
// 依赖：file / log；文本规范化依赖 common/utils.normalizeText。

import { normalizeText } from "../common/utils.js";
import { DEFAULT_WAIT_MS, DEFAULT_WAIT_MAIN_UI_SECONDS } from "../common/constants.js";

// 被视为默认块的任务描述，命中后即使没有匹配到描述也执行
const DEFAULT_BLOCK_PATTERN = /^(默认|無任務描述字符串|无任务描述字符串|nomatch|default|超时)$/i;

/**
 * 读取流程文件并依次尝试三种格式：JSON 数组、扩展简单格式、旧逐行格式。
 * 空文件或读取失败返回 false；解析成功返回步骤数组或带 __simpleScript 标记的结果。
 * @param {string} processPath 流程文件路径
 * @returns {Promise<Array|{__simpleScript: boolean, script: Object}|false>}
 */
export async function loadAndParseProcessFile(processPath) {
  const processFilePath = processPath;
  let processContent;
  let processSteps;
  processContent = await file.readText(processFilePath);
  if (!processContent || !processContent.trim()) {
    log.error("流程文件为空或读取失败: {path}", processFilePath);
    return false;
  }
  log.info("找到流程文件: {path}", processFilePath);
  const pauseCount = (processContent.match(/^暂停/gm) || []).length;
  log.info(`共有 ${pauseCount} 个暂停`);

  try {
    const jsonData = JSON.parse(processContent);
    if (Array.isArray(jsonData)) {
      processSteps = jsonData;
      log.debug("JSON流程解析成功");
      return processSteps;
    } else {
      log.error("JSON流程格式错误，应为数组");
      return false;
    }
  } catch (jsonError) {
    // 非 JSON 时尝试扩展的简单格式脚本
    try {
      const simpleScript = parseExtendedSimpleScript(processContent);
      if (simpleScript && simpleScript.blocks && simpleScript.blocks.length > 0) {
        log.info("检测到简单格式脚本，共{count}个步骤块", simpleScript.blocks.length);
        return { __simpleScript: true, script: simpleScript };
      }
    } catch (e) {
      log.error("简单格式脚本解析出错: {error}", e.message);
    }
    // 回退到旧的按行简单格式
    const lines = processContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    processSteps = lines;
    return processSteps;
  }
}

/**
 * 解析扩展的简单格式脚本：作者/描述元数据、任务描述块与指令行。
 * 未出现块头前的指令行自动归入默认的“默认”块。
 * @param {string} content 流程文件文本
 * @returns {{meta: {author: string, description: string}, blocks: Array}}
 */
function parseExtendedSimpleScript(content) {
  const lines = content.split("\n");
  const blocks = [];
  const meta = { author: "", description: "" };
  let currentBlock = null;

  // 空行与注释行不构成指令
  const isComment = (line) => {
    const t = line.trim();
    return t === "" || t.startsWith("#") || t.startsWith("//");
  };

  // 以中英文冒号结尾且非 URL 的行视为块头（任务描述）
  const isHeaderLine = (line) => {
    const trimmed = line.trim();
    return /[:：]$/.test(trimmed) && !/^https?:\/\//i.test(trimmed);
  };

  // 取最靠前的中英文冒号作为键值分隔
  const extractHeaderKeyValue = (line) => {
    const idxCN = line.indexOf("：");
    const idxEN = line.indexOf(":");
    let idx;
    if (idxCN === -1) idx = idxEN;
    else if (idxEN === -1) idx = idxCN;
    else idx = Math.min(idxCN, idxEN);
    if (idx === -1) return { key: "", value: "" };
    return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
  };

  for (const raw of lines) {
    // 去掉行内注释：只把前置空白之后的 # 或 // 视作注释起始，
    // 这样 https:// 之类的 // 与紧贴文本的 # 不会被误截断；整行 # / // 仍由 isComment 处理
    let line = raw.replace(/\s+(?:\/\/|#).*$/, "").trim();
    if (isComment(line)) continue;

    // 元数据：作者/描述
    const { key, value } = extractHeaderKeyValue(line);
    if (/^作者$/i.test(key)) {
      meta.author = value;
      continue;
    }
    if (/^描述$/i.test(key)) {
      meta.description = value;
      continue;
    }

    // 块头：任务描述行
    if (isHeaderLine(line)) {
      const header = line.slice(0, line.length - 1).trim();
      const descNorm = normalizeText(header);
      currentBlock = {
        description: header,
        descriptionNorm: descNorm,
        isDefault: DEFAULT_BLOCK_PATTERN.test(header),
        instructions: [],
      };
      blocks.push(currentBlock);
      continue;
    }

    // 指令行；未出现块头前自动创建“默认”块
    if (!currentBlock) {
      currentBlock = { description: "默认", descriptionNorm: normalizeText("默认"), isDefault: true, instructions: [] };
      blocks.push(currentBlock);
    }

    const parts = line.trim().split(/\s+/);
    const cmd = parts.shift();
    const arg = parts.join(" ").trim();

    const pushInstr = (type, data = null) => {
      currentBlock.instructions.push({ type, data });
    };

    switch (cmd) {
      case "地图追踪":
        pushInstr("地图追踪", arg);
        break;
      case "调时间":
        pushInstr("调时间", arg);
        break;
      case "提示":
        pushInstr("提示", arg);
        break;
      case "键鼠脚本":
        pushInstr("键鼠脚本", arg);
        break;
      case "对话":
        pushInstr("对话", arg);
        break;
      case "交互":
        pushInstr("交互", arg);
        break;
      case "等待返回主界面": {
        // 仅接受正数秒；缺省或非法值按默认秒数处理
        const waitSeconds = parseInt(arg, 10);
        pushInstr("等待返回主界面", waitSeconds > 0 ? waitSeconds : DEFAULT_WAIT_MAIN_UI_SECONDS);
        break;
      }
      case "追踪图标":
        pushInstr("追踪图标", arg);
        break;
      case "追踪委托":
        pushInstr("追踪委托", arg);
        break;
      case "按键":
        pushInstr("按键", arg || "F");
        break;
      case "等待":
        pushInstr("等待", parseInt(arg || String(DEFAULT_WAIT_MS), 10) || DEFAULT_WAIT_MS);
        break;
      case "任务完成":
        pushInstr("任务完成", null);
        break;
      case "暂停":
        pushInstr("暂停", arg);
        break;
      case "战斗":
        pushInstr("战斗", null);
        break;
      case "自动拾取": {
        pushInstr("自动拾取", arg);
        break;
      }
      case "切换":
        pushInstr("切换", arg);
        break;
      case "点击":
        pushInstr("点击", arg);
        break;
      case "切换队伍":
        pushInstr("切换队伍", arg);
        break;
      case "图像匹配":
        pushInstr("图像匹配", arg);
        break;
      case "切换角色体型":
        pushInstr("切换角色体型", arg);
        break;
      case "点击文字":
        pushInstr("点击文字", arg);
        break;
      case "返回主界面":
        pushInstr("返回主界面", null);
        break;
      default: {
        // F 前缀指令按对话处理
        if (/^F$/i.test(cmd) && arg) {
          pushInstr("对话", arg);
          break;
        }
        // .json 结尾的裸指令按地图追踪处理
        if (/\.json$/i.test(cmd)) {
          pushInstr("地图追踪", line);
          break;
        }
        // 仅 F 且无参数时按空对话处理
        if (/^F$/i.test(cmd)) {
          pushInstr("对话", "");
          break;
        }
        log.warn("未识别的指令行: {line}", line);
        break;
      }
    }
  }

  return { meta, blocks };
}
