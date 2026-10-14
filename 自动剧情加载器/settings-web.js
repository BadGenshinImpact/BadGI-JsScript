const token = settingsContext.cancellationToken;
const root = "process";

function currentSettings() {
    return JSON.parse(settingsContext.loadSettings());
}

function plainSettings(value) {
    return JSON.parse(JSON.stringify(value || {}));
}

function saveCurrent(patch) {
    const data = { ...plainSettings(currentSettings()), ...plainSettings(patch) };
    delete data.processOptions;
    delete data.processPaths;
    settingsContext.saveSettings(JSON.stringify(data));
}

function slash(path) { return String(path).replace(/\\/g, "/"); }
function base(path) { return slash(path).split("/").pop(); }
function parent(path) { return slash(path).split("/").slice(0, -1).join("/"); }
function label(path) {
    const parts = slash(path).split("/").filter(Boolean);
    const index = parts.indexOf(root);
    const rest = parts.slice(index + 1, -1);
    return rest.length ? rest.join("-") : base(path);
}

function view(cwd) {
    const folders = [], files = [];
    for (const item of file.ReadPathSync(cwd)) (file.IsFolder(item) ? folders : files).push(slash(item));
    folders.sort(); files.sort();
    return {
        cwd, upTo: cwd.includes("/") ? parent(cwd) : null,
        folders: folders.map(path => ({ name: base(path), path })),
        files: files.map(path => ({ name: base(path), path, selectable: base(path).toLowerCase() === "process.json", label: label(path) }))
    };
}

async function processes() {
    const pending = [root + "/"], found = [];
    while (pending.length) {
        const current = pending.pop();
        const children = [];
        for (const item of file.ReadPathSync(current)) {
            if (file.IsFolder(item)) children.push(item);
            else if (base(item).toLowerCase() === "process.json" && slash(item) !== "process/process.json") found.push({ name: label(item), path: slash(item) });
        }
        pending.push(...children.reverse());
    }
    return found.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

let cached = [];
async function publish(cwd, rescan) {
    try {
        if (!file.IsFolder(root)) throw new Error("未找到 process 目录");
        if (rescan) cached = await processes();
        settingsUi.post("/picker/state", { ok: true, view: view(cwd), processes: cached, settings: currentSettings() });
    } catch (error) {
        settingsUi.post("/picker/state", { ok: false, error: String(error && error.message ? error.message : error) });
    }
}

let cwd = root;
await publish(cwd, true);
while (settingsUi.isOpen() && !token.isCancellationRequested) {
    const raw = await settingsUi.receive(1000);
    if (!raw) continue;
    let message;
    try { message = JSON.parse(raw); } catch { continue; }
    const data = message.data || {};
    if (message.url === "/picker/enter" || message.url === "/picker/up" || message.url === "/picker/refresh") {
        cwd = data.path || cwd;
        await publish(cwd, message.url === "/picker/refresh");
    } else if (message.url === "/picker/choose") {
        saveCurrent({ process_selector: data.name || "", process_path: data.path || "" });
    } else if (message.url === "/picker/saveSettings") {
        saveCurrent(data);
    }
}
