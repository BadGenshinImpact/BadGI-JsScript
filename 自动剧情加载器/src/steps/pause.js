// 暂停指令：注册按键钩子，等待设置的暂停键后继续，退出时释放钩子。
// 依赖：log / notification / KeyMouseHook / settings / sleep。

const PAUSE_ENTER_DELAY_MS = 1000;
const PAUSE_POLL_INTERVAL_MS = 100;
const PAUSE_RESUME_DELAY_MS = 1000;

/**
 * 暂停脚本直到按下暂停键；作者提示会随暂停日志一并输出。
 * 钩子注册失败时 hook 为空，finally 判空避免二次抛错。
 * @param {string} data 作者提示文本，可为空
 * @returns {Promise<void>}
 */
export async function waitForPauseKey(data) {
  let isPaused = true;
  let hook = null;
  const stopkey = settings.pause;
  try {
    await sleep(PAUSE_ENTER_DELAY_MS);
    log.warn("脚本已暂停，请手动操作游戏");
    if (settings.xiaoxitongzhi) notification.error("脚本已暂停，请手动操作游戏");
    if (data) {
      log.warn("作者提示：{data}", data);
    }
    log.warn(`完成后按 ${stopkey} 键继续...`);
    hook = new KeyMouseHook();
    hook.OnKeyDown(function (stopkeykey) {
      // 按下设置的暂停键时结束等待
      if (stopkeykey === stopkey) {
        isPaused = false;
        log.info(`已检测到 ${stopkey} 键，准备继续执行`);
      }
    });
    while (isPaused) {
      await sleep(PAUSE_POLL_INTERVAL_MS);
    }
    log.info("脚本继续执行...");
  } catch (error) {
    log.error("发生错误:", error);
  } finally {
    // 释放键鼠资源；new KeyMouseHook() 失败时 hook 仍为 null，直接 dispose 会二次抛错
    if (hook) {
      hook.dispose();
      log.info("已释放资源");
    }
  }
  log.info("执行后续任务...");
  await sleep(PAUSE_RESUME_DELAY_MS);
}
