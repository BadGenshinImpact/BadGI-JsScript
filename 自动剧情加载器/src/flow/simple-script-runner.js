// 简单格式流程执行器：按任务描述 OCR 匹配对应步骤块并执行，维护断点与重试计数。
// 依赖：file / log / genshin / keyPress / sleep；解析与指令执行来自 flow 内模块。

import { normalizeText, easyOCR, similarity } from "../common/utils.js";
import { executeInstruction } from "./instruction-executor.js";

// 任务描述 OCR 区域（游戏画面左上角任务栏）
const TASK_DESC_OCR_REGION = { X: 75, Y: 240, WIDTH: 280, HEIGHT: 43 };
// 描述相似度达到该值才视为匹配成功
const DESC_MATCH_THRESHOLD = 0.9;
// 每轮最多检测次数，未匹配时按 V 再试
const DESC_DETECT_ATTEMPTS = 13;
// 同一次描述连续未变化时的最大重试次数
const MAX_RETRY = 2;
// 主循环安全上限，防止异常情况下无限运行
const SAFETY_LIMIT = 200;
// 各阶段的等待间隔
const DESC_RETRY_INTERVAL_MS = 1000;
const INSTRUCTION_INTERVAL_MS = 200;
const BLOCK_INTERVAL_MS = 500;

/**
 * 按规范化任务描述为步骤块建立索引。
 * groupMap 供执行查找，resumingMap 持有独立的数组副本供断点裁剪，二者互不影响。
 * @param {Array<{descriptionNorm: string}>} blocks 已解析的步骤块
 * @returns {{groupMap: Map<string, Array>, resumingMap: Map<string, Array>}}
 */
function buildBlockIndex(blocks) {
  const build = () => {
    const map = new Map();
    for (const block of blocks) {
      if (!map.has(block.descriptionNorm)) map.set(block.descriptionNorm, []);
      map.get(block.descriptionNorm).push(block);
    }
    return map;
  };
  return { groupMap: build(), resumingMap: build() };
}

/**
 * 执行扩展简单格式脚本。
 * 无任务描述块时直接按默认块的指令顺序逐条执行；有任务描述块时，
 * 通过 OCR 识别当前任务描述选择块执行，并在描述变化时裁剪断点文件。
 * @param {{meta: Object, blocks: Array}} simpleScript 已解析的简单格式脚本
 * @param {string} processPath 流程文件路径，供指令定位相对资源
 * @param {string} resumeRelativePath 断点文件相对 resuming/ 的路径
 * @param {string} team 战斗队伍配置名
 * @param {string} elementTeam 元素采集队伍配置名
 * @returns {Promise<boolean>} 正常结束或收到“任务完成”均返回 true
 */
export async function executeSimpleScriptFlow(simpleScript, processPath, resumeRelativePath, team, elementTeam) {
  const META = simpleScript.meta || {};
  const BLOCKS = Array.isArray(simpleScript.blocks) ? simpleScript.blocks : [];
  const defaultBlock = BLOCKS.find(b => b.isDefault) || null;
  // 指令执行上下文；teamState 在同一流程内共享，用于记录与恢复原始队伍
  const executionContext = {
    processPath,
    team,
    elementTeam,
    teamState: { originalTeam: null },
  };

  if (META.author) log.info("作者: {author}", META.author);
  if (META.description) log.info("描述: {desc}", META.description);

  // groupMap 用于执行查找，resumingMap 的独立数组副本用于断点裁剪
  const { groupMap, resumingMap } = buildBlockIndex(BLOCKS);
  const execCounter = new Map();

  // 在任务栏区域 OCR，取相似度最高的描述作为当前任务；低于阈值返回 null
  const detectCurrentDesc = async () => {
    const ocr = await easyOCR(TASK_DESC_OCR_REGION);
    let best = { sim: 0, descNorm: null };
    for (let i = 0; i < ocr.count; i++) {
      log.info("正在匹配任务区文本: {text}", ocr[i].text);
      const txt = normalizeText(ocr[i].text);
      for (const [descNorm] of groupMap) {
        if (!descNorm) continue;
        const sim = similarity(txt, descNorm);
        if (sim > best.sim) best = { sim, descNorm };
      }
    }
    if (ocr.count === 0) {
      log.info("未匹配到任务描述文本");
    }
    return best.sim >= DESC_MATCH_THRESHOLD ? best.descNorm : null;
  };

  // 检查是否有非默认块（任务描述块）
  const hasTaskBlocks = BLOCKS.some(block => !block.isDefault);

  // 只有默认块时直接顺序执行；每完成一条指令就重写断点文件
  if (!hasTaskBlocks && defaultBlock) {
    log.info("脚本中无任务描述块，直接执行默认块");
    while (0 < defaultBlock.instructions.length) {
      const instr = defaultBlock.instructions[0];
      const res = await executeInstruction(instr, executionContext);

      log.info("当前流程执行完毕，更新断点文件");
      defaultBlock.instructions.splice(0, 1);
      file.writeTextSync(`resuming/${resumeRelativePath}`, JSON.stringify(simpleScript, null, 2));
      if (res === "DONE") {
        log.info("收到任务完成指令，任务完成");
        return true;
      }
      await sleep(INSTRUCTION_INTERVAL_MS);
    }
    return true;
  }

  let safety = 0;
  let lastMatchedDescNorm = null;
  let retryCount = 0;

  while (safety++ < SAFETY_LIMIT) {
    // 在若干次按键尝试中检测当前任务描述
    let matchedDescNorm = null;
    await genshin.returnMainUi();
    for (let i = 0; i < DESC_DETECT_ATTEMPTS; i++) {
      matchedDescNorm = await detectCurrentDesc();
      if (matchedDescNorm) break;
      keyPress("V");
      await sleep(DESC_RETRY_INTERVAL_MS);
    }

    // 任务描述发生变化时，裁剪已完成的首个块并写回断点文件
    if (lastMatchedDescNorm && matchedDescNorm !== lastMatchedDescNorm) {
      try {
        log.info("流程执行完毕，更新断点文件");
        resumingMap.get(lastMatchedDescNorm).shift();
        const descriptionNorms = Array.from(resumingMap.keys());
        const blocks = descriptionNorms.flatMap(norm => resumingMap.get(norm));
        const remainingScript = { meta: META, blocks: blocks };
        file.writeTextSync(`resuming/${resumeRelativePath}`, JSON.stringify(remainingScript, null, 2));
      } catch (error) {
        log.error(`更新断点文件时出错{error}`, error.message);
        break;
      }
    }

    // 描述变化则重置重试计数并累加该描述的已执行次数
    if (matchedDescNorm !== lastMatchedDescNorm) {
      retryCount = 0;
      lastMatchedDescNorm = matchedDescNorm;
      const ran = execCounter.get(matchedDescNorm) || 0;
      execCounter.set(matchedDescNorm, ran + 1);
    } else {
      retryCount++;
    }

    if (retryCount > MAX_RETRY) {
      log.error("同一任务描述已重试2次，执行失败，结束流程");
      break;
    }

    let blockToRun = null;
    if (matchedDescNorm && groupMap.has(matchedDescNorm)) {
      const ran = execCounter.get(matchedDescNorm) || 0;
      const list = groupMap.get(matchedDescNorm);
      const idx = Math.min(ran - 1, list.length - 1);
      blockToRun = list[idx];
      log.info("匹配到任务描述块: {desc}，第{idx}次执行", blockToRun.description, idx + 1);
    } else if (defaultBlock) {
      blockToRun = defaultBlock;
      log.info("未匹配到任务描述，执行默认块: {desc}", defaultBlock.description);
    } else {
      log.warn("未匹配到任务描述且不存在默认块，结束流程");
      break;
    }

    for (const instr of blockToRun.instructions) {
      const res = await executeInstruction(instr, executionContext);
      if (res === "DONE") {
        log.info("收到任务完成指令，任务完成");
        return true;
      }
      await sleep(INSTRUCTION_INTERVAL_MS);
    }

    await sleep(BLOCK_INTERVAL_MS);
  }

  return true;
}
