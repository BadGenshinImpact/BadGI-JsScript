# 自动剧情加载器 代码审查问题清单

- 审查对象：`dev` 分支 `自动剧情加载器/`（含 `main.js`、`src/**/*.js`、`manifest.json`）
- 审查方式：静态阅读 + `node --input-type=module --check` + 与上游 `better-genshin-impact` 源码核对
- 文档性质：待修复问题的当前快照，作为逐项修复的依据
- 说明：本文件只列**尚未修复**的问题；1.46 的既有缺陷已在本分支修复完毕，见第五节

## 一、结论摘要

本分支（`main..dev`，31 个提交）完成的是“原样抽出 + 缺陷修复”两段式重构：入口 `main.js` 收口为 3 行，叶子模块拆到 `src/`，执行引擎（解析、执行、断点、切队编排）留在 `src/app/main.js`。抽取过程逐段对照原 1.46 单文件，未引入行为回归；三个会直接崩溃的缺陷（`captureRegion` 未声明、`context` 当路径传入、`extractedName` 被 `[]` 覆盖）已修复。

剩余问题分两类：

1. 1.46 就存在的缺陷（编号 1、2、3、5、6、7、8、9、10）；
2. 重构过程中暴露的可读性/一致性问题（编号 11、12、13、14）。

本清单只列本次要修复的问题；未列入的问题暂不修复，见第六节。

## 二、待修复问题

| 编号 | 位置 | 现状问题 | 修复方案 |
|---|---|---|---|
| 1 | `src/app/main.js:862-868` | `processStringStep` 引用未声明的模块级变量 `process_path`，且 `processMapTracking(step, …)` 把字符串当路径容器传入，`step.data` 恒为 `undefined` | 改为 `processMapTracking({ data: step }, context.processPath)`，删除对 `process_path` 的引用 |
| 2 | `src/steps/navigator.js:158-169` | `IconRos` 为空时 `iconRes` 保持 `undefined`，`iconRes.isEmpty()` 抛 TypeError。`Data/RecognitionObject/Icon/` 下无 `Question`/`Task`/`Into` 匹配文件，`追踪图标 Question` 等调用必崩 | 改为 `if (!iconRes \|\| iconRes.isEmpty())` |
| 3 | `src/steps/navigator.js:169-180` | 未检测到图标时先 `continue`，导致 `consecutiveFailCount > 5` 与 `i > 50` 两个退出条件均不可达，实际是无限重试 | 把计数判断移到 `continue` 之前 |
| 5 | `src/app/main.js:892-931` | `Main` 异常路径不清理实时任务，`AutoPick`/`AutoEat`/`AutoSkip` 残留到下一个脚本 | `Main` 改 `try/catch/finally`，`finally` 中复位实时任务 |
| 6 | `src/app/main.js:393-399` | `new KeyMouseHook()` 抛错时 `hook` 为 `null`，`finally` 里 `hook.dispose()` 二次抛错，掩盖原始错误 | `if (hook) hook.dispose();` |
| 7 | `src/steps/step-processor.js:283-316` | `for (let num = 1; ; num++)` 无上界，靠 `ReadImageMatSync` 对缺失文件返回空 `Mat` 后 `Cv2.CvtColor` 抛异常才退出；且漏掉 `可莉.png`、`达达利亚.png` 这类无数字后缀文件 | 改用 `file.ReadPathSync("Data/characterimage/")` 列目录，按“文件名以角色名开头”筛选后遍历 |
| 8 | `src/app/main.js:352-365` | `自动拾取 关闭` 调 `ClearAllTriggers()` 连带关掉 `AutoSkip`/`AutoEat`；`开启` 走 `AddTrigger` 重复叠加。流程文件里 23 处 `关闭`、6 处 `开启` | 引入实时任务状态记录，关闭只撤 `AutoPick` |
| 9 | `src/steps/step-processor.js:360-399` | `自动任务 disable` 全局清空触发器；`enable` 误用 `dispatcher.addTimer`（`addTimer` 会先清空全部再添加，与“叠加”语义相反） | 与第 8 项共用状态模块；`enable` 校验 `taskType` 白名单 |
| 10 | `src/steps/step-processor.js:86` | `data = String(data)` 在类型判断之前执行，`typeof data === "object"` 分支恒不可达，对象格式按键实际不支持 | 把字符串化挪进字符串分支，恢复对象分支可达 |
| 11 | `src/app/main.js:186` | `parseInt(arg \|\| "600", 10) \|\| 120`：显式写 `等待返回主界面 0` 会变 120，且 120/600 两个默认值并存 | 统一为 600，仅当解析结果为正数时采用 |
| 12 | `src/app/main.js:325-332` | `追踪委托` 的 `if/else` 两个分支代码完全相同 | 合并为单一判断 |
| 13 | `src/steps/dialog-processor.js:128-168` | `if (true) { … }` 恒真外壳包裹整段对话选项识别 | 删除外壳并降一级缩进 |
| 14 | `src/flow/step-processor-factory.js:60-63` | `registerStepProcessor` 导出但全仓库无调用点 | 保留。见第四节说明 |

## 三、关键上游核实

- `LimitedFile.ReadPathSync(dir)` 非递归列出目录内容，返回**相对脚本根**的路径；目录不存在时返回空数组（`LimitedFile.cs:22-52`）。
- `LimitedFile.ReadImageMatSync` 读取失败时**返回空 `Mat`、不抛异常**（`LimitedFile.cs:213-228`）。第 7 项正是因此改为先列目录再读图。
- `LimitedFile.ReadText` 读取失败返回空串、不抛异常（`LimitedFile.cs:170-184`）。
- `Dispatcher` 只提供 `AddTrigger`（追加到启用名单）与 `ClearAllTriggers`（整体清空），**没有按名移除**（`Dispatcher.cs:71,82`）。因此“只关 AutoPick、保留 AutoSkip/AutoEat”只能靠“记录状态 → 全清 → 按状态重建”。
- `TaskTriggerDispatcher.ScriptTriggerTypes` 白名单只有 `AutoPick`、`AutoSkip`、`AutoEat`（`TaskTriggerDispatcher.cs:59-64`），其它名字会抛 `ArgumentException`。
- `Notification` 提供 `Send`（成功）与 `Error`（错误）（`Notification.cs:68,93`）。
- `Region.Dispose` 为空实现，`Find`/`FindMulti`/`Derive` 返回的 `Region` 不含 Mat，可安全在 `finally` 中释放截图；`ImageRegion.DeriveCrop` 返回共享父 Mat 的视图，释放顺序须先子后父（`Region.cs:313-316`、`ImageRegion.cs:71-79,581-593`）。
- `ScriptProject.ExecuteAsync` 检测到代码含 `import `/`export ` 即按 ES 模块执行并 `await` 返回的 Task；ClearScript 7.4.5 的 `V8Settings.EnableTopLevelAwait` 标注为“V8 no longer supports Top-Level Await control. The feature is always enabled.”，入口的顶层 `await Main()` 可用。
- `ScriptRepoUpdater.BackupScriptFiles` 对以 `/` 结尾的 `saved_files` 走 `CopyDirectory` 递归备份，`RestoreScriptFiles` 用 `SearchOption.AllDirectories` 回填（`ScriptRepoUpdater.cs:2630-2650`）。
- `AutoPathingScript.RunFile(string)`、`KeyMouseScript.RunFile(string)` 均存在（`AutoPathingScript.cs:44`、`KeyMouseScript.cs:13`）。

## 四、关于第 14 项（保留 `registerStepProcessor`）

`registerStepProcessor` 是“运行时新增步骤类型”的注册入口，当前无调用点，原因如下：

1. `键鼠脚本` 不经过它。工厂中 `键鼠脚本` 是静态键，直接调用 `processKeyMouseScript` → 宿主对象 `keyMouseScript.runFile(路径)`，执行的是录制的键鼠 JSON，与“注册步骤类型”是两件事。
2. 本脚本没有任何地方在运行时新增步骤类型，因此注册函数自然无调用者。

结论：保留并继续导出。它是后续若要补齐 JSON 流程缺失步骤类型（`战斗`、`暂停`、`任务完成`）时的天然入口，删除后仍需加回。

## 五、已修复记录（本分支，勿重复排查）

以下 1.46 缺陷已在本分支修复完毕，保留记录仅为避免后人重复排查：

- `autoNavigateToIcon` 内 `captureRegion` 未声明（ES module 严格模式下抛 ReferenceError）。
- `processWaitMainUI()` 无参调用导致 JSON 流程“等待返回主界面”不等待。
- `executeOptimizedAutoTalk` 的 `extractedName` 形参被函数体内 `= []` 覆盖，`text.includes([])` 恒真导致误点第一个选项。
- JSON 流程 `地图追踪`/`键鼠脚本` 把 `context` 对象当 `processFilePath` 传入。
- `tp`、`长按` 两个引用不存在函数的无效步骤处理器。
- `captureGameRegion()` 结果多处不 `dispose`，`easyOCR` 高频调用持续泄漏。
- 脚本完成用 `notification.error`（错误级别）；切队错误通知未受 `settings.xiaoxitongzhi` 控制。
- `saved_files: ["resuming/*.json"]` 只匹配一层，嵌套断点不被备份。
- 流程文件读取失败返回空串不抛异常，“未找到流程文件”分支为死代码。
- `调时间` 写死小写 `data/time.json`。
- 对话日志占位符 `位置({x},{y},{h},{w})` 与实际传参顺序不符。
- `relativePath` 模块级可变外部状态（已改为显式参数 `resumeRelativePath`）。
- 重复实现：两套主界面检测、`groupMap`/`resumingMap` 重复构建、两段相同的选项点击代码、两段相同的“前进一小步”。
- 未使用的 `keyData`、注释掉的 `processAutoTask` 调用。
- `VERSION`/`BUILD_TIME` 与 `manifest.version` 双写（已改为只读 `manifest.json`）。
- Tab 与 2 空格混用、行尾空白。
- `picker.js` 位于脚本根目录、以裸说明符导入（已迁入 `src/picker/`）。

## 六、本次不修复的问题

- `manifest.json` 中 `tags`、`allow_js_notification` 不在 `Manifest` 模型里；`authors[].links` 与 `Author.Link` 不匹配，作者链接被静默丢弃。
- `manifest.json` 缺行尾换行；`saved_files` 语义变更后未提升 `version`。
- JSON 流程格式缺失 `战斗`、`暂停`、`任务完成`、`完成任务` 四个步骤类型（1.46 遗留的双分发器覆盖差异，非本次重构引入）。
- 硬编码 1920×1080。
- `easyOCR` 成功/失败返回结构不一致。
- `.gitignore`、`AGENTS.md`、`refactor-plan.md` 仍为未跟踪文件。
