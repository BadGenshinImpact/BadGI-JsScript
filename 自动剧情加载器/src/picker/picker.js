// htmlMask 剧情选择器：枚举 process 目录、与遮罩页面收发选择消息。
// 依赖：file / log / htmlMask（BetterGI 注入的引擎全局，模块内直接可用）。

// 递归读取目录下的文件清单，按需只保留 .json 文件
async function readFolder(folderPath, onlyJson) {
  const folderStack = [folderPath];
  const files = [];

  while (folderStack.length > 0) {
    const currentPath = folderStack.pop();
    const items = file.ReadPathSync(currentPath);
    const subFolders = [];

    for (const itemPath of items) {
      if (file.IsFolder(itemPath)) {
        subFolders.push(itemPath);
      } else if (!onlyJson || itemPath.toLowerCase().endsWith(".json")) {
        const pathParts = itemPath.split(/[\\\/]/).filter(Boolean);
        const fileName = pathParts.pop();
        files.push({
          fullPath: itemPath,
          fileName: fileName,
          folderPathArray: pathParts
        });
      }
    }

    // 保持原始顺序添加子文件夹
    folderStack.push(...subFolders.reverse());
  }

  return files;
}

const PICKER_ROOT = "process";
const PICKER_PAGE = "assets/process-picker.html";
const PICKER_ID = "process-picker";

function toSlash(path) {
  return String(path).replace(/\\/g, "/");
}

function dirOf(path) {
  const parts = toSlash(path).split("/");
  parts.pop();
  return parts.join("/");
}

function baseName(path) {
  const parts = toSlash(path).split("/");
  return parts[parts.length - 1];
}

// 剧情名：process 之后的路径段用 - 连接
function processLabel(fullPath) {
  const segments = toSlash(fullPath).split("/").filter(Boolean);
  const index = segments.indexOf("process");
  if (index === -1) return baseName(fullPath);
  const rest = segments.slice(index + 1);
  rest.pop();
  return rest.length > 0 ? rest.join("-") : baseName(fullPath);
}

function listDir(dir) {
  const folders = [];
  const files = [];
  for (const itemPath of file.ReadPathSync(dir)) {
    if (file.IsFolder(itemPath)) {
      folders.push(toSlash(itemPath));
    } else {
      files.push(toSlash(itemPath));
    }
  }
  folders.sort();
  files.sort();
  return { folders, files };
}

function isProcessFile(name) {
  return name.toLowerCase() === "process.json";
}

function buildView(cwd) {
  const { folders, files } = listDir(cwd);
  const up = cwd.includes("/") ? dirOf(cwd) : null;

  return {
    cwd: cwd,
    canUp: cwd !== PICKER_ROOT,
    upTo: up,
    folders: folders.map(path => ({
      name: baseName(path),
      path: path
    })),
    files: files.map(path => {
      const name = baseName(path);
      const selectable = isProcessFile(name);
      return {
        name: name,
        path: path,
        selectable: selectable,
        label: selectable ? processLabel(path) : ""
      };
    })
  };
}

async function countProcesses() {
  const all = await readFolder(PICKER_ROOT + "/", true);
  return all
    .filter(item => isProcessFile(item.fileName) && toSlash(item.fullPath) !== "process/process.json")
    .map(item => ({ name: processLabel(item.fullPath), path: toSlash(item.fullPath) }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

/**
 * 弹出 htmlMask 剧情选择器，返回用户选中的流程文件。
 * 用户取消、关闭窗口或 process 目录不存在时返回 null。
 * @returns {Promise<{name: string, path: string}|null>} 选中项的名称与路径
 */
export async function chooseProcess() {
  if (!file.IsFolder(PICKER_ROOT)) {
    log.warn("未找到剧情目录 process/，无法弹出选择器");
    return null;
  }

  const winId = htmlMask.show(PICKER_PAGE, PICKER_ID);
  htmlMask.setClickThrough(winId, false);

  // 全量剧情清单要遍历整棵 process 树，只在打开与显式刷新时重扫，换目录不重扫
  let processes = [];
  async function pushState(view, rescan) {
    let payload;
    try {
      if (rescan) {
        processes = await countProcesses();
      }
      payload = { ok: true, view: view, processes: processes };
    } catch (error) {
      payload = { ok: false, error: String(error && error.message ? error.message : error) };
    }

    if (!htmlMask.exists(winId)) return;
    try {
      htmlMask.send(winId, "/picker/state", JSON.stringify(payload));
    } catch {
      // 发送期间用户已关窗，属正常竞态，由外层循环收尾
    }
  }

  let result = null;
  try {
    await pushState(buildView(PICKER_ROOT), true);

    while (htmlMask.exists(winId)) {
      const raw = await htmlMask.receive(winId, 1000);
      if (!raw) continue;

      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        log.warn("收到无效消息: {raw}", raw);
        continue;
      }

      const data = msg.data || {};
      switch (msg.url) {
        case "/picker/choose":
          if (data.path) {
            result = { name: data.name || processLabel(data.path), path: toSlash(data.path) };
          }
          break;
        case "/picker/enter":
          if (data.path && file.IsFolder(toSlash(data.path))) {
            await pushState(buildView(toSlash(data.path)), false);
          }
          break;
        case "/picker/up": {
          const target = data.path ? toSlash(data.path) : PICKER_ROOT;
          await pushState(buildView(file.IsFolder(target) ? target : PICKER_ROOT), false);
          break;
        }
        case "/picker/refresh":
          await pushState(buildView(data.path ? toSlash(data.path) : PICKER_ROOT), true);
          break;
        case "/picker/cancel":
          break;
        default:
          break;
      }

      if (result || msg.url === "/picker/cancel") break;
    }
  } finally {
    htmlMask.close(winId);
  }

  return result;
}
