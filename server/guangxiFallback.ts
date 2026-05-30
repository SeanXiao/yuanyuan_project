import {
  makeBookId,
  makePromptRecord,
  nowIso,
  type PictureBook,
  type PictureBookPage
} from "./bookStore.js";

const heritageElements = [
  "壮锦",
  "绣球",
  "铜鼓",
  "壮族三月三",
  "刘三姐歌谣",
  "山歌",
  "五色糯米饭",
  "壮族纹样"
];

const tourismElements = [
  "桂林山水",
  "阳朔漓江",
  "德天瀑布",
  "北海银滩",
  "青秀山",
  "三街两巷",
  "龙脊梯田",
  "黄姚古镇"
];

function pickElements(idea: string, candidates: string[], count: number) {
  const direct = candidates.filter((item) => idea.includes(item));
  const merged = [...direct, ...candidates.filter((item) => !direct.includes(item))];
  return merged.slice(0, count);
}

function makeIllustrationPrompt(pageTitle: string, pageText: string, heritage: string[], tourism: string[]) {
  return [
    "儿童绘本插图，温暖明亮的水彩风格，小学生主角，画面适合 6-12 岁儿童。",
    `页面主题：${pageTitle}。`,
    `故事画面：${pageText}`,
    `广西非遗元素：${heritage.join("、")}。`,
    `广西文旅元素：${tourism.join("、")}。`,
    "画面有层次，角色表情友好，保留广西民族纹样、山水和节庆氛围，不要出现文字、水印或真实人物肖像。"
  ].join("\n");
}

export function createFallbackBook(idea: string): PictureBook {
  const id = makeBookId();
  const timestamp = nowIso();
  const heritage = pickElements(idea, heritageElements, 3);
  const tourism = pickElements(idea, tourismElements, 2);
  const title = idea.includes("德天瀑布")
    ? "瀑布边的会唱歌绣球"
    : idea.includes("桂林")
      ? "会发光的壮锦去桂林"
      : "会唱山歌的绣球";

  const pageTexts = [
    `我把自己的灵感说给小圆听，${heritage[0]}忽然亮了起来，好像在邀请我走进一个广西故事。`,
    `我们来到了${tourism[0]}，风里传来${heritage[1]}和山歌的声音，每一步都像翻开一页新的绘本。`,
    `路上，我遇到一个想了解广西文化的小伙伴。我用 AI 帮我整理的词语，向他介绍${heritage[0]}和${heritage[2]}。`,
    `最后，我把今天的冒险创编成一本绘本，也把${tourism[1]}和${heritage.join("、")}介绍给更多同学。`
  ];

  const pages: PictureBookPage[] = pageTexts.map((text, index) => ({
    pageNumber: index + 1,
    title: ["灵感发光", "走进广西", "小小讲解员", "我的创编绘本"][index],
    text,
    imagePrompt: makeIllustrationPrompt(["灵感发光", "走进广西", "小小讲解员", "我的创编绘本"][index], text, heritage, tourism),
    imageUrl: "",
    imageSource: "placeholder",
    cultureNote: `${heritage[index % heritage.length]}是广西文化元素，可以被创编成故事角色、线索或画面符号。`
  }));

  const storyPrompt = `请把小学生灵感“${idea}”创编成 4 页广西非遗文旅绘本。`;

  return {
    id,
    title,
    subtitle: "一本文旅和非遗一起发光的 AI 绘本",
    originalIdea: idea,
    createdAt: timestamp,
    updatedAt: timestamp,
    heritageElements: heritage,
    tourismElements: tourism,
    guidingQuestions: [
      "这个非遗元素在故事里是朋友、线索，还是魔法道具？",
      "你希望读完故事的同学记住哪个广西景点或文化？"
    ],
    outline: `主角从一句灵感出发，在${tourism.join("、")}之间冒险，认识${heritage.join("、")}，最后完成自己的广西非遗文旅绘本。`,
    pages,
    tourGuideScript: `大家好，我是小小文旅推荐官。今天我想介绍${tourism.join("和")}，还想告诉大家${heritage.join("、")}这些广西文化元素。欢迎大家来广西，把旅途中的发现也创编成自己的故事。`,
    studentReflection: "我先说出灵感，再和 AI 一起追问、选择、修改，把广西文化变成了自己的原创绘本。",
    aiContentRatio: 88,
    promptRecords: [
      makePromptRecord("story", "故事生成 Prompt", storyPrompt, "已生成 4 页绘本故事、大纲、文旅讲解和非遗知识。"),
      ...pages.map((page) => makePromptRecord("image", `第 ${page.pageNumber} 页图片 Prompt`, page.imagePrompt, "等待图片生成或使用本地演示插图。"))
    ]
  };
}
