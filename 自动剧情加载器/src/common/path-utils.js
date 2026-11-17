// 路径工具：把流程文件路径与其同目录下 relativeFile 拼成完整路径。

/**
 * 把流程文件路径与其相对脚本名拼成完整路径，并统一为正斜杠。
 * @param {string} processFilePath 流程文件路径
 * @param {string} relativeFile 相对于流程文件目录的脚本名
 * @returns {string} 可直接交给 pathingScript / keyMouseScript 的路径
 */
export function resolveSiblingPath(processFilePath, relativeFile) {
  const normalizedPath = processFilePath.replace(/\\/g, "/");
  const processDir = normalizedPath.substring(0, normalizedPath.lastIndexOf("/"));
  return `${processDir}/${relativeFile}`;
}
