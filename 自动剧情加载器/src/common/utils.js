// 通用工具：OCR 封装、文本清理与相似度、角色别名读取。
// 依赖：log / captureGameRegion / RecognitionObject / file。

/**
 * 在指定区域内做 OCR，返回识别到的文本区域列表。
 * 出错时记录日志并返回空列表 { count: 0 }。
 * @param {{X: number, Y: number, WIDTH: number, HEIGHT: number}} region 识别区域
 * @returns {Promise<Object>} 文本区域列表（含 count 与按索引访问的项）
 */
export async function easyOCR({ X, Y, WIDTH, HEIGHT }) {
  let captureRegion = null;
  try {
    // 创建OCR识别对象
    const locationOcrRo = RecognitionObject.Ocr(X, Y, WIDTH, HEIGHT);

    // 截图识别；返回的 Region 列表不含 Mat，可在 finally 释放截图
    captureRegion = captureGameRegion();
    return await captureRegion.findMulti(locationOcrRo);
  } catch (error) {
    log.error("easyOCR识别出错: {error}", error.message);
    return { count: 0 };
  } finally {
    if (captureRegion) captureRegion.dispose();
  }
}
/**
 * 去除文本中的标点与空白，只保留中文、字母与数字。
 * @param {string} text 原始文本
 * @returns {string} 清理后的文本；空输入返回空串
 */
export function cleanText(text) {
  if (!text) return "";
  // 去除标点符号和特殊字符
  return text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "").trim();
}
/**
 * 规范化文本：先清理再转小写，用于描述相似度比较。
 * @param {*} text 原始文本
 * @returns {string} 规范化后的文本
 */
export function normalizeText(text) {
  return cleanText(String(text || "")).toLowerCase();
}
/**
 * 计算两个字符串的 Levenshtein 编辑距离。
 * @param {string} a 字符串一
 * @param {string} b 字符串二
 * @returns {number} 编辑距离
 */
export function levenshteinDistance(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  const n = s.length;
  const m = t.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    const si = s.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const tj = t.charCodeAt(j - 1);
      const cost = si === tj ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[n][m];
}
/**
 * 计算两段文本的相似度（0~1），基于规范化后的 Levenshtein 距离。
 * @param {*} a 文本一
 * @param {*} b 文本二
 * @returns {number} 相似度，1 表示完全相同
 */
export function similarity(a, b) {
  const s1 = normalizeText(a);
  const s2 = normalizeText(b);
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  const dist = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - dist / maxLen;
}

/**
 * 读取角色别名文件，构建“别名 → 正式角色名”的映射。
 * 文件缺失或解析失败时记录日志并返回空对象。
 * @returns {Object<string, string>} 别名映射
 */
export function readAliases() {
  try {
    const combatText = file.ReadTextSync("Data/avatar/combat_avatar.json");
    const combatData = JSON.parse(combatText);
    const aliases = {};
    for (const character of combatData) {
      if (character.alias && character.name) {
        for (const alias of character.alias) {
          aliases[alias] = character.name;
        }
      }
    }
    return aliases;
  } catch (error) {
    log.error("读取角色别名文件失败: {error}", error.message);
    return {};
  }
}
