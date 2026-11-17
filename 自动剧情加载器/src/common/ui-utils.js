// UI 工具：从任务描述中提取人名、按文本点击目标。
// 依赖：log / easyOCR / keyDown / keyUp / click / leftButtonClick / sleep。

import { easyOCR } from "./utils.js";

/**
 * 从任务描述文本中提取人名（如“与某某对话”→“某某”）。
 * @param {string} text 任务描述文本
 * @returns {string|null} 提取到的人名；无匹配返回 null
 */
export function extractName(text) {
  const patterns = [
    /与(.+?)对话/,
    /与(.+?)一起/,
    /同(.+?)交谈/,
    /向(.+?)打听/,
    /向(.+?)回报/,
    /向(.+?)报告/,
    /给(.+?)听/,
    /陪同(.+?)\S+/,
    /找到(.+?)\S+/,
    /询问(.+?)\S+/,
    /拜访(.+?)\S+/,
    /寻找(.+?)\S+/,
    /告诉(.+?)\S+/,
    /带(.+?)去\S+/,
    /跟随(.+?)\S+/,
    /协助(.+?)\S+/,
    /请教(.+?)\S+/,
    /拜托(.+?)\S+/,
    /委托(.+?)\S+/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * 在区域 OCR 结果中查找包含指定文本的目标，命中后 Alt+Click 点击。
 * @param {string} text 目标文本（包含关系）
 * @param {{X: number, Y: number, WIDTH: number, HEIGHT: number}} [region] 识别区域，默认整屏
 * @returns {Promise<boolean>} 命中并点击返回 true，否则返回 false
 */
export async function clickTargetByText(text, region = { X: 0, Y: 0, WIDTH: 1920, HEIGHT: 1080 }) {
  try {
    const results = await easyOCR(region);
    for (let i = 0; i < results.count; i++) {
      const item = results[i];
      if (item && item.text && item.text.includes(text)) {
        keyDown("VK_MENU");
        await sleep(200);
        click(item.x, item.y);
        leftButtonClick();
        await sleep(200);
        keyUp("VK_MENU");
        return true;
      }
    }
    return false;
  } catch (e) {
    log.error("clickTargetByText 出错: {error}", e.message);
    return false;
  }
}
