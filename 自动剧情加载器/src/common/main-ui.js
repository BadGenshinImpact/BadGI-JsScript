// 主界面识别：用派蒙菜单与退出按钮的模板图判断是否处于游戏主界面。
// 依赖：file / genshin / RecognitionObject / captureGameRegion。

// 识别对象：派蒙菜单图标
const paimonMenuRo = RecognitionObject.TemplateMatch(
  file.ReadImageMatSync("Data/RecognitionObject/paimon_menu.png"),
  0,
  0,
  genshin.width / 3.0,
  genshin.width / 5.0
);
// 识别退出按钮
const exitBtnRo = RecognitionObject.TemplateMatch(
  file.ReadImageMatSync("Data/RecognitionObject/exitbtn.png"),
  0,
  0,
  genshin.width / 3.0,
  genshin.width / 5.0
);

/**
 * 判断当前是否处于游戏主界面：派蒙菜单或退出按钮任一命中即视为在主界面。
 * @returns {boolean} 在主界面返回 true
 */
export const isInMainUI = () => {
  let captureRegion = captureGameRegion();
  try {
    let res = captureRegion.Find(paimonMenuRo);
    let res2 = captureRegion.Find(exitBtnRo);
    return !res.isEmpty() || !res2.isEmpty();
  } finally {
    captureRegion.dispose();
  }
};
