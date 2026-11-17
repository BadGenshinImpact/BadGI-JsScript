// 通用 UI 工具：角色选择界面滚动。
// 依赖：log / moveMouseTo / moveMouseBy / leftButtonDown / leftButtonUp / sleep。

/**
 * 在角色选择界面按住左键拖动，按总距离分步滚动。
 * @param {number} totalDistance 需要滚动的总距离
 * @param {number} [stepDistance=10] 单步距离
 * @param {number} [delayMs=5] 每步之间的延时
 * @returns {Promise<boolean>} 成功返回 true，出错返回 false
 */
export async function scrollPage(totalDistance, stepDistance = 10, delayMs = 5) {
  try {
    moveMouseTo(400, 750);
    await sleep(50);
    leftButtonDown();
    const steps = Math.ceil(totalDistance / stepDistance);
    for (let j = 0; j < steps; j++) {
      const remainingDistance = totalDistance - j * stepDistance;
      const moveDistance =
        remainingDistance < stepDistance ? remainingDistance : stepDistance;
      moveMouseBy(0, -moveDistance);
      await sleep(delayMs);
    }
    await sleep(700);
    leftButtonUp();
    await sleep(100);
    return true;
  } catch (error) {
    log.error(`角色选择界面滚动操作时发生错误：${error.message}`);
    return false;
  }
}
