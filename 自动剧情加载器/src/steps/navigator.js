// 自动寻路：调整视野朝目标前进，分别用于追踪 NPC 对话与追踪地图图标。
// 依赖：log / file / RecognitionObject / captureGameRegion / keyPress / keyDown / keyUp / moveMouseBy / middleButtonClick / sleep。

// 前进一小步（W + 两次空格），供追踪对话与追踪图标复用
async function advanceStep() {
  keyDown("w");
  await sleep(200);
  keyPress("VK_SPACE");
  await sleep(200);
  keyPress("VK_SPACE");
  await sleep(200);
  keyUp("w");
  await sleep(200);
}

/**
 * 自动导航到 NPC 对话位置：按图标类型选取识别对象，调整视野并前进直到到达。
 * @param {string} [npcName=""] 目标 NPC 名称，用于到达判定
 * @param {string} [iconType=""] 图标类型（Bigmap / Question，其它按任务图标）
 * @returns {Promise<void>}
 * @throws {Error} 前进或视野调整超时时抛出
 */
export async function autoNavigateToTalk(npcName = "", iconType = "") {
  try {
    // 设置目标NPC名称
    const textArray = npcName;

    // 根据图标类型选择不同的识别对象
    // 图标类型大小写不敏感，兼容 "bigmap"/"Bigmap"/"question" 等写法
    const normalizedIconType = String(iconType || "").toLowerCase();
    let boxIconRo;
    if (normalizedIconType === "bigmap") {
      boxIconRo = RecognitionObject.TemplateMatch(
        file.ReadImageMatSync(
          "Data/RecognitionObject/Commission/IconBigmapCommission.jpg"
        )
      );
      log.info("使用大地图图标");
    }
    else if (normalizedIconType === "question") {
      boxIconRo = RecognitionObject.TemplateMatch(
        file.ReadImageMatSync(
          "Data/RecognitionObject/Commission/IconQuestionCommission.png"
        )
      );
      log.info("使用问号任务图标");
    }
    else {
      // 默认使用任务图标
      boxIconRo = RecognitionObject.TemplateMatch(
        file.ReadImageMatSync(
          "Data/RecognitionObject/Commission/IconTaskCommission.png"
        )
      );
      log.info("使用任务图标");
    }

    let advanceNum = 0; //前进次数

    middleButtonClick();
    await sleep(800);

    while (true) {
      // 1. 优先检查是否已到达
      await sleep(500);// 等待0.5秒
      let captureRegion = captureGameRegion();
      let rewardTextArea = null;
      try {
        rewardTextArea = captureRegion.DeriveCrop(1210, 515, 200, 50);
        let rewardResult = rewardTextArea.find(RecognitionObject.ocrThis);
        log.debug("检测到文字: " + rewardResult.text);
        // 检测到特点文字则结束！！！
        if (rewardResult.text == textArray) {
          log.info("已到达指定位置，检测到文字: " + rewardResult.text);
          return;
        } else if (advanceNum > 80) {
          throw new Error("前进时间超时");
        }
      } finally {
        if (rewardTextArea) rewardTextArea.dispose();
        captureRegion.dispose();
      }
      // 2. 未到达领奖点，则调整视野
      for (let i = 0; i < 100; i++) {
        const adjustRegion = captureGameRegion();
        try {
          let iconRes = adjustRegion.Find(boxIconRo);
          // 未识别到图标时 Find 返回空 Region(0,0,0,0)，先判空避免用 0 坐标乱调视角
          if (!iconRes || iconRes.isEmpty()) {
            if (i > 50) throw new Error("视野调整超时");
            keyPress("V");
            await sleep(1000);
            continue;
          }
          log.info("检测到委托图标位置 ({x}, {y})", iconRes.x, iconRes.y);
          if (iconRes.x >= 920 && iconRes.x <= 980 && iconRes.y <= 540) {
            advanceNum++;
            log.info(`视野已调正，前进第${advanceNum}次`);
            break;
          } else {
            // 小幅度调整
            if (iconRes.y >= 520) moveMouseBy(0, 920);
            let adjustAmount = iconRes.x < 920 ? -20 : 20;
            let distanceToCenter = Math.abs(iconRes.x - 920); // 计算与920的距离
            let scaleFactor = Math.max(1, Math.floor(distanceToCenter / 50)); // 根据距离缩放，最小为1
            let adjustAmount2 = iconRes.y < 540 ? scaleFactor : 10;
            moveMouseBy(adjustAmount * adjustAmount2, 0);
            await sleep(100);
          }
        } finally {
          adjustRegion.dispose();
        }
        if (i > 50) throw new Error("视野调整超时");
      }
      // 3. 前进一小步
      await advanceStep();
    }
  } catch (error) {
    log.error("自动导航到NPC对话位置时出错: {error}", error.message);
    throw error;
  }
}

/**
 * 追踪地图图标并前进，直到进入对话或连续多次未检测到图标。
 * @param {string} [iconType="Bigmap"] 图标类型，用于筛选模板图文件名
 * @returns {Promise<void>}
 * @throws {Error} 视野调整超时时抛出
 */
export async function autoNavigateToIcon(iconType = "Bigmap") {
  try {
    const iconLogMap = {
      Question: "问号",
      Task: "感叹号",
      Into: "进入",
      Bigmap: "菱形"
    };
    const _log = iconLogMap[iconType] ? iconLogMap[iconType] : iconType;
    log.info(`追踪图标：{logMsg}`, _log);

    //读取所有图标路径并转为数组
    let allIconPaths = file.readPathSync("Data/RecognitionObject/Icon/");
    allIconPaths = Array.from(allIconPaths);

    //筛选包含iconType的路径
    const filteredPaths = allIconPaths.filter(path => {
      const fileName = path.split(/[\\/]/).pop();
      return fileName.includes(iconType);
    });
    //批量创建包含指定iconType图标的RO
    const IconRos = filteredPaths.map(iconPath => {
      let ro = RecognitionObject.TemplateMatch(
        //icon只会出现在这个范围，且避免识别到委托描述的Icon
        file.ReadImageMatSync(iconPath), 300, 100, 1300, 800
      );
      ro.Threshold = 0.8
      return ro
    });

    let inTalkRO = RecognitionObject.TemplateMatch(
      file.ReadImageMatSync("Data/RecognitionObject/IconInTalk.png"),
      0, 0, 500, 200
    );

    let advanceNum = 0; //前进次数
    let consecutiveFailCount = 0; //未检测到图标次数,
    middleButtonClick();
    await sleep(800);

    while (true) {
      // 调整视野
      for (let i = 0; i < 100; i++) {
        const captureRegion = captureGameRegion();
        try {
          // 检测进入对话
          let inTalk = captureRegion.Find(inTalkRO);
          if (inTalk.isExist()) {
            log.info("已进入对话，停止前进");
            return;
          }

          let iconRes;
          for (let boxIconRo of IconRos) {
            iconRes = captureRegion.Find(boxIconRo);
            if (iconRes.isEmpty()) {
              continue;
            } else {
              iconRes.DrawSelf("debug");
              consecutiveFailCount = 0;
              break;
            }
          }
          // IconRos 为空时 iconRes 仍为 undefined，不能直接调用 isEmpty
          if (!iconRes || iconRes.isEmpty()) {
            consecutiveFailCount++;
            //连续多次未检测到图标，停止前进；必须在 continue 之前判断，否则永远不可达
            if (consecutiveFailCount > 5) {
              log.info("连续5次未检测到图标，停止前进");
              return;
            }
            log.info("未检测到图标，重试");
            keyPress("V");
            await sleep(1000);
            continue;
          }
          if (iconRes.x >= 920 && iconRes.x <= 980 && iconRes.y <= 540) {
            advanceNum++;
            break;
          } else {
            // 小幅度调整
            if (iconRes.y >= 520) moveMouseBy(0, 920);
            let adjustAmount = iconRes.x < 920 ? -20 : 20;
            let distanceToCenter = Math.abs(iconRes.x - 920); // 计算与920的距离
            let scaleFactor = Math.max(1, Math.floor(distanceToCenter / 20)); // 根据距离缩放，最小为1
            let adjustAmount2 = iconRes.y < 540 ? scaleFactor : 10;
            moveMouseBy(adjustAmount * adjustAmount2, 0);
            await sleep(100);
          }
        } finally {
          captureRegion.dispose();
        }
        if (i > 50) throw new Error("视野调整超时");
      }
      // 3. 前进一小步
      await advanceStep();
    }
  } catch (error) {
    log.error("追踪Icon时出错: {error}", error.message);
    throw error;
  }
}
