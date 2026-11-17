// 队伍与角色指令：按号位切换角色、按角色列表切换队伍、按体型切换角色、按配置切换队伍。
// 依赖：file / log / genshin / getAvatars / RecognitionObject / captureGameRegion / click / keyPress / sleep。

import { readAliases } from "../common/utils.js";
import { scrollPage } from "../common/ui.js";
import { switchPartyIfNeeded } from "./switch-party.js";

// 1~4 号位在队伍配置界面中的头像坐标（1920×1080 基准）
const POSITION_COORDINATES = [
  [460, 538],
  [792, 538],
  [1130, 538],
  [1462, 538],
];
// 角色选择列表最多滚动轮数，以及仍允许滚动的前置轮数
const MAX_PAGE_TRIES = 20;
const SCROLLABLE_PAGE_TRIES = 15;
// 打开配对界面连续失败时，先传送到固定锚点再重试的最大累计次数
const MAX_PAIRING_ATTEMPTS = 6;
const PAIRING_ANCHOR_X = "2297.630859375";
const PAIRING_ANCHOR_Y = "-824.5517578125";

/**
 * 截图并查找目标，查找结束后立即释放截图。
 * 返回的 Region 不含 Mat，可继续使用其坐标与文本。
 * @param {Object} ro 识别对象
 * @returns {Object} 查找结果 Region
 */
function findInGameScreen(ro) {
  const captureRegion = captureGameRegion();
  try {
    return captureRegion.find(ro);
  } finally {
    captureRegion.dispose();
  }
}

/**
 * 按号位切换角色：打开配对界面、选中号位、在角色列表中匹配头像并确认更换。
 * @param {{data: {position: number, character: string}}} step 步骤对象；
 *        position 仅接受 1–4，character 可为别名
 * @returns {Promise<boolean>} 切换成功返回 true；参数不全、找不到角色图像或角色已在队伍中返回 false
 */
export async function processSwitchRole(step) {
  // 模板图在函数结束统一释放（见 finally），避免每次切换角色都泄漏
  let roTeamConfig = null;
  let roReplace = null;
  let roJoin = null;
  try {
    const { position, character } = step.data;
    const positionNumber = Number(position);

    // 号位只能是 1~4，否则 POSITION_COORDINATES 越界会抛 TypeError
    if (!Number.isInteger(positionNumber) || positionNumber < 1 || positionNumber > 4 || !character) {
      log.error("角色切换参数不完整或号位非法，需要 position(1-4) 和 character");
      return false;
    }

    log.info(`开始切换角色：第${positionNumber}号位 -> ${character}`);

    // 别名先还原为正式角色名，后续按正式名匹配头像文件
    const aliases = readAliases();
    const actualName = aliases[character] || character;
    log.info(`设置对应号位为【${character}】，切换角色为【${actualName}】`);

    roTeamConfig = RecognitionObject.TemplateMatch(
      file.ReadImageMatSync(`Data/RecognitionObject/队伍配置.png`),
      0,
      0,
      1920,
      1080
    );
    roReplace = RecognitionObject.TemplateMatch(
      file.ReadImageMatSync(`Data/RecognitionObject/更换.png`),
      0,
      0,
      1920,
      1080
    );
    roJoin = RecognitionObject.TemplateMatch(
      file.ReadImageMatSync(`Data/RecognitionObject/加入.png`),
      0,
      0,
      1920,
      1080
    );

    let openPairingTries = 0;
    let totalOpenPairingTries = 0;

    // 连续三次识别不到队伍配置界面即视为打开失败，累计超过上限后传送到锚点重试
    const openPairingInterface = async () => {
      while (openPairingTries < 3) {
        keyPress("l");
        await sleep(3500);
        const teamConfigResult = findInGameScreen(roTeamConfig);
        if (teamConfigResult.isExist()) {
          openPairingTries = 0;
          return true;
        }
        openPairingTries++;
        totalOpenPairingTries++;
      }
      if (totalOpenPairingTries < MAX_PAIRING_ATTEMPTS) {
        await genshin.tp(PAIRING_ANCHOR_X, PAIRING_ANCHOR_Y);
        openPairingTries = 0;
        return openPairingInterface();
      } else {
        log.error("无法打开配对界面，任务结束");
        return false;
      }
    };

    if (!(await openPairingInterface())) {
      return false;
    }

    const rolenum = positionNumber;
    const selectedCharacter = actualName;
    const [x, y] = POSITION_COORDINATES[positionNumber - 1];
    click(x, y);
    log.info(`开始设置${rolenum}号位角色`);
    await sleep(1000);
    let characterFound = false;
    let pageTries = 0;

    // 角色图像以角色名开头（如 可莉.png、可莉01.png、琴02.png），先按前缀筛选出候选文件，
    // 避免用无上界数字循环探测不存在的文件；ReadImageMatSync 读失败只返回空 Mat 不抛异常
    const imageDir = "Data/characterimage/";
    const characterImagePaths = Array.from(file.ReadPathSync(imageDir))
      .filter((imagePath) => {
        const fileName = imagePath.split(/[\\/]/).pop();
        return fileName.startsWith(selectedCharacter);
      });

    if (characterImagePaths.length === 0) {
      log.error(`未找到【${selectedCharacter}】的角色图像，无法切换`);
      return false;
    }
    log.info(`角色【${selectedCharacter}】共 ${characterImagePaths.length} 张候选图像`);

    while (pageTries < MAX_PAGE_TRIES) {
      // 依次比对候选图像，命中即点击并结束
      for (const imagePath of characterImagePaths) {
        const characterRo = RecognitionObject.TemplateMatch(
          file.ReadImageMatSync(imagePath),
          0,
          0,
          1920,
          1080
        );
        let characterResult;
        try {
          characterResult = findInGameScreen(characterRo);
        } finally {
          // 每次匹配都会读入一张模板图，用完立即释放，避免逐轮累积
          characterRo.TemplateImageMat?.dispose();
          characterRo.TemplateImageGreyMat?.dispose();
        }
        if (!characterResult.isExist()) {
          continue;
        }
        log.info(`已找到角色${selectedCharacter}`);
        // 头像命中后点击其右下偏移位置，避免点到头像中心的选中态
        const targetX = characterResult.x + 35;
        const targetY = characterResult.y + 35;

        // 边界检查，确保坐标在屏幕范围内
        const safeX = Math.min(Math.max(targetX, 0), 1920);
        const safeY = Math.min(Math.max(targetY, 0), 1080);

        click(safeX, safeY);
        await sleep(500);
        characterFound = true;
        break;
      }

      if (characterFound) {
        break;
      }

      // 列表可能未加载完目标角色，滚动后继续查找
      if (pageTries < SCROLLABLE_PAGE_TRIES) {
        log.info("当前页面没有目标角色，滚动页面");
        await scrollPage(200);
      }
      pageTries++;
    }

    if (!characterFound) {
      log.error(`未找到【${selectedCharacter}】`);
      return false;
    }

    // 识别"更换"或"加入"按钮：命中说明可切换，否则角色已在队伍中
    const replaceResult = findInGameScreen(roReplace);
    const joinResult = findInGameScreen(roJoin);

    if (replaceResult.isExist() || joinResult.isExist()) {
      await sleep(300);
      click(68, 1020);
      keyPress("VK_LBUTTON");
      await sleep(500);
      log.info(`角色切换完成：${character} -> ${actualName}`);
      return true;
    } else {
      log.error(`该角色已在队伍中，无需切换`);
      await sleep(300);
      keyPress("VK_ESCAPE");
      await sleep(500);
      return false;
    }
  } catch (error) {
    log.error("角色切换过程中出错: {error}", error.message);
    return false;
  } finally {
    // 三张模板图用完统一释放，避免每轮调用累积 Mat
    for (const ro of [roTeamConfig, roReplace, roJoin]) {
      ro?.TemplateImageMat?.dispose?.();
      ro?.TemplateImageGreyMat?.dispose?.();
    }
  }
}

// 角色体型对应的队伍槽位按键，索引 0~3 对应 1~4 号位
const SLOT_KEYS = ["1", "2", "3", "4"];
// 切换指令最多处理 4 个角色（一队上限）
const MAX_PARTY_SIZE = 4;
const ESCAPE_SETTLE_MS = 500;

/**
 * 按目标角色列表依次切换；首次切换前记录原始队伍，可用“原来队伍”恢复。
 * teamState 需在同一流程执行期间保持同一对象引用。
 * @param {string} data 以空白分隔的角色名；首项为“原来队伍”时执行恢复
 * @param {{originalTeam: Array|null}} teamState 跨指令共享的队伍状态
 * @returns {Promise<void>}
 */
export async function switchPartyCharacters(data, teamState) {
  // 已在队伍中的角色跳过，只对缺失的号位执行切换
  const switchToCharacters = async (targetChars) => {
    const currentTeam = Array.from(getAvatars() || []);
    const aliases = readAliases();
    for (let i = 0; i < targetChars.length; i++) {
      const char = targetChars[i];
      const name = aliases[char] || char;
      if (currentTeam.includes(name)) {
        log.info(`${name} 已在队伍中，跳过`);
        continue;
      }
      if (!await processSwitchRole({ data: { position: i + 1, character: char } })) {
        log.error(`切换失败：第${i + 1}号位 ${char}`);
        return false;
      }
    }
    return true;
  };

  const args = data.trim().split(/\s+/);
  if (args[0] === "原来队伍") {
    if (!teamState.originalTeam || teamState.originalTeam.length === 0) {
      log.warn("未记录原始队伍，无法恢复");
      return;
    }
    log.info("开始恢复原始队伍");
    if (!await switchToCharacters(teamState.originalTeam)) log.warn("恢复失败");
    teamState.originalTeam = null;
    log.info("已恢复原始队伍");
  } else {
    if (!teamState.originalTeam) {
      teamState.originalTeam = Array.from(getAvatars() || []);
      log.info(`记录原始队伍: ${teamState.originalTeam.join(", ")}`);
    }
    if (!await switchToCharacters(args.slice(0, MAX_PARTY_SIZE))) log.warn("切换失败");
    log.info("角色切换完成");
  }
  keyPress("VK_ESCAPE");
  await sleep(ESCAPE_SETTLE_MS);
  keyPress("VK_ESCAPE");
  await sleep(ESCAPE_SETTLE_MS);
}

/**
 * 按队伍类型选择配置中的队伍并切换；可先传送到七天神像再切换。
 * @param {string} data “队伍类型 [是否前往神像]”，队伍类型为“元素采集”时使用元素采集队伍
 * @param {string} team 战斗队伍配置名
 * @param {string} elementTeam 元素采集队伍配置名
 * @returns {Promise<void>}
 */
export async function switchPartyByName(data, team, elementTeam) {
  const teamArgs = String(data).trim().split(/\s+/);
  const teamType = teamArgs[0] || "战斗";
  const needStatue = teamArgs[1] === "是";
  const partyName = teamType === "元素采集" ? elementTeam : team;
  if (!partyName) {
    log.warn("未配置{teamType}队伍名称", teamType);
    return;
  }
  if (needStatue) {
    log.info("前往神像切换队伍: {partyName}", partyName);
    await genshin.tpToStatueOfTheSeven();
  }
  await switchPartyIfNeeded(partyName);
}

/**
 * 在当前队伍中按体型查找角色，选中对应槽位三次完成切换。
 * 角色体型来自 Data/avatar/combat_avatar.json 的 name/alias/bodyType 字段。
 * @param {string} data 目标体型名称
 * @returns {Promise<void>}
 */
export async function switchCharacterBodyType(data) {
  const targetBodyType = String(data);
  log.info("切换角色体型: {bodyType}", targetBodyType);
  try {
    const currentTeam = Array.from(getAvatars() || []);
    if (currentTeam.length === 0) {
      log.warn("无法识别当前队伍");
      return;
    }
    let avatarData;
    try {
      avatarData = JSON.parse(file.readTextSync("Data/avatar/combat_avatar.json"));
    } catch {
      log.warn("未找到角色数据文件 Data/avatar/combat_avatar.json");
      return;
    }
    const getBodyType = (charName) => {
      for (const entry of avatarData) {
        if (entry.name === charName || (entry.alias && entry.alias.includes(charName))) {
          return entry.bodyType;
        }
      }
      return null;
    };
    let targetIndex = -1;
    for (let i = 0; i < currentTeam.length; i++) {
      const bt = getBodyType(currentTeam[i]);
      if (bt === targetBodyType) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex === -1) {
      log.warn("队伍中没有体型为{bodyType}的角色", targetBodyType);
      return;
    }
    const slotKey = SLOT_KEYS[targetIndex];
    log.info("切换到第{idx}号位: {name}", targetIndex + 1, currentTeam[targetIndex]);
    keyPress(slotKey);
    await sleep(200);
    keyPress(slotKey);
    await sleep(200);
    keyPress(slotKey);
    await sleep(5000);
  } catch (e) {
    log.error("切换角色体型失败: {e}", e);
  }
}
