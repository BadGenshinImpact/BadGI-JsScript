// 切换队伍：按配置名切换队伍，失败时前往七天神像重试。
// 依赖：log / genshin / notification / settings。

/**
 * 切换到指定队伍；队伍名为空时仅返回主界面。
 * 首次切换失败会前往七天神像重试一次，异常时提示可能的联机原因。
 * @param {string} partyName 队伍配置名
 * @returns {Promise<void>}
 */
export async function switchPartyIfNeeded(partyName) {
  if (!partyName) {
    await genshin.returnMainUi();
    return;
  }
  try {
    log.info("正在尝试切换至" + partyName);
    if (!await genshin.switchParty(partyName)) {
      log.info("切换队伍失败，前往七天神像重试");
      await genshin.tpToStatueOfTheSeven();
      await genshin.switchParty(partyName);
    }
  } catch {
    log.error("队伍切换失败，可能处于联机模式或其他不可切换状态");
    if (settings.xiaoxitongzhi) notification.error(`切换失败，可能处于联机模式或其他不可切换状态`);
    await genshin.returnMainUi();
  }
}
