// UI 操作指令：按文本交互、按坐标点击、模板图匹配、OCR 文本点击与返回主界面。
// 依赖：file / log / genshin / RecognitionObject / captureGameRegion / click / sleep。

import { clickTargetByText } from "../common/ui-utils.js";
import { normalizeText, similarity } from "../common/utils.js";

// 游戏画面按 1920×1080 基准匹配模板图
const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;
// 模板图匹配阈值；OCR 文本点击要求的最低相似度
const TEMPLATE_THRESHOLD = 0.8;
const OCR_TEXT_MIN_SIMILARITY = 0.6;
// 点击后等待界面响应的时间
const CLICK_SETTLE_MS = 300;

/**
 * 按文本查找目标并交互，命中后等待界面响应。
 * @param {string} data 目标文本；为空时不执行
 * @returns {Promise<void>}
 */
export async function interactWithTarget(data) {
  if (data) {
    await clickTargetByText(data);
    await sleep(CLICK_SETTLE_MS);
  }
}

/**
 * 解析“x,y”坐标并点击；坐标非法时仅记录警告。
 * @param {string} data 以半角或全角逗号分隔的坐标文本
 * @returns {Promise<void>}
 */
export async function clickAtCoordinates(data) {
  const parts = String(data).split(/[,，]/);
  const cx = parseInt(parts[0], 10);
  const cy = parseInt(parts[1], 10);
  if (!isNaN(cx) && !isNaN(cy)) {
    log.info("点击坐标: ({x}, {y})", cx, cy);
    click(cx, cy);
    await sleep(CLICK_SETTLE_MS);
  } else {
    log.warn("点击指令格式错误，应为：点击 x,y，实际：{data}", data);
  }
}

/**
 * 在流程文件所在目录读取模板图，在整屏范围内匹配并点击。
 * 截图与模板在 finally 中释放，无论是否命中。
 * @param {string} data 模板图相对文件名
 * @param {string} processPath 流程文件路径，用于定位模板所在目录
 * @returns {Promise<void>}
 */
export async function clickByImageMatch(data, processPath) {
  const imagePath = String(data);
  const dir = processPath.replace(/[^\\/]+$/, "");
  const fullPath = dir + imagePath;
  log.info("图像匹配: {path}", fullPath);
  try {
    const template = file.ReadImageMatSync(fullPath);
    const screen = captureGameRegion();
    try {
      const ro = RecognitionObject.templateMatch(template, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      ro.Threshold = TEMPLATE_THRESHOLD;
      const found = screen.find(ro);
      if (!found.isEmpty()) {
        found.click();
        log.info("图像匹配成功，已点击");
        await sleep(CLICK_SETTLE_MS);
      } else {
        log.warn("图像匹配未找到: {path}", fullPath);
      }
    } finally {
      screen.dispose();
      template.dispose();
    }
  } catch (e) {
    log.error("图像匹配失败: {e}", e);
  }
}

/**
 * 在指定区域 OCR，按文本相似度选取最佳匹配并点击。
 * 参数格式为“x,y,w,h,文字”；截图在 finally 中释放。
 * @param {string} data 区域坐标与目标文字
 * @returns {Promise<void>}
 */
export async function clickByOcrText(data) {
  const ocrParts = String(data).split(/[,，]/);
  if (ocrParts.length < 5) {
    log.warn("点击文字指令格式错误，应为：点击文字 x,y,w,h,文字，实际：{data}", data);
    return;
  }
  const ox = parseInt(ocrParts[0], 10);
  const oy = parseInt(ocrParts[1], 10);
  const ow = parseInt(ocrParts[2], 10);
  const oh = parseInt(ocrParts[3], 10);
  const targetText = ocrParts.slice(4).join(",");
  if (isNaN(ox) || isNaN(oy) || isNaN(ow) || isNaN(oh)) {
    log.warn("点击文字坐标无效: {data}", data);
    return;
  }
  log.info("点击文字: 区域({x},{y},{w},{h}) 目标文字: {text}", ox, oy, ow, oh, targetText);
  try {
    const screen = captureGameRegion();
    try {
      const ro = RecognitionObject.ocr(ox, oy, ow, oh);
      const regions = screen.findMulti(ro);
      let bestMatch = null;
      let bestSim = 0;
      for (let i = 0; i < regions.Count; i++) {
        const txt = normalizeText(regions[i].Text);
        const sim = similarity(txt, normalizeText(targetText));
        if (sim > bestSim) {
          bestSim = sim;
          bestMatch = regions[i];
        }
      }
      if (bestMatch && bestSim >= OCR_TEXT_MIN_SIMILARITY) {
        bestMatch.click();
        log.info("点击文字成功，相似度: {sim}", bestSim.toFixed(2));
        await sleep(CLICK_SETTLE_MS);
      } else {
        log.warn("点击文字未找到匹配: 目标={text}，最高相似度={sim}", targetText, bestSim.toFixed(2));
      }
    } finally {
      screen.dispose();
    }
  } catch (e) {
    log.error("点击文字失败: {e}", e);
  }
}

/**
 * 返回游戏主界面并等待界面切换完成。
 * @returns {Promise<void>}
 */
export async function returnToMainUI() {
  log.info("执行返回主界面");
  await genshin.returnMainUi();
  await sleep(500);
}
