import {
  makeBookId,
  makePromptRecord,
  nowIso,
  type BookLanguage,
  type PictureBook,
  type PictureBookPage,
  type ProtagonistGender
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

function guiXiaolingVisualSpec(language: BookLanguage) {
  if (language === "en") {
    return [
      "Gui Xiaoling visual lock: Gui Xiaoling is the picture-book companion robot, a cute glossy white-and-blue round robot mascot with a glowing cyan face and heart, headset microphone, friendly childlike smile, blue cape, and toy-like proportions.",
      "Guangxi details: indigo Zhuang-style headscarf with teal, white, red, and gold brocade trim, small silver-inspired charm, Zhuang brocade patterns on cuffs/cape/notebook, and bronze-drum medallions on the chest and notebook."
    ].join(" ");
  }

  return [
    "桂小灵视觉锁定：桂小灵是画册里的固定机器人伙伴，可爱的白蓝配色圆润机器人吉祥物，黑色发光屏幕脸、青蓝色笑脸和爱心灯、耳麦、蓝色披风，整体像柔和精致的玩具机器人。",
    "广西特色细节：靛蓝壮族风格头巾，带青蓝、白、红、金色壮锦几何边纹，头巾结旁有轻巧银饰小挂件；袖口、披风、本子有壮锦纹样，胸口和本子有铜鼓纹饰徽章。"
  ].join(" ");
}

function protagonistVisualSpec(language: BookLanguage, gender: ProtagonistGender) {
  if (language === "en") {
    return gender === "boy"
      ? "Student protagonist: one 8-10 year-old Guangxi elementary-school boy, bright eyes, friendly expression, simple red-blue jacket with subtle Zhuang brocade details, small backpack."
      : "Student protagonist: one 8-10 year-old Guangxi elementary-school girl, inspired by Xiaoyuxi as the default girl role, bright eyes, friendly expression, simple red-blue jacket with subtle Zhuang brocade details, small backpack.";
  }

  return gender === "boy"
    ? "小学生主角设定：一位 8-10 岁广西小学生男孩，明亮眼睛、友好表情，穿红蓝相间、带少量壮锦纹样的小外套，背一个小书包。"
    : "小学生主角设定：一位 8-10 岁广西小学生女孩，默认以肖予曦女生角色为原型，明亮眼睛、友好表情，穿红蓝相间、带少量壮锦纹样的小外套，背一个小书包。";
}

function makeIllustrationPrompt(
  pageTitle: string,
  pageText: string,
  heritage: string[],
  tourism: string[],
  language: BookLanguage,
  protagonistGender: ProtagonistGender
) {
  if (language === "en") {
    return [
      "Warm and bright children's picture book illustration, watercolor texture, one elementary-school protagonist, suitable for ages 6-12.",
      protagonistVisualSpec(language, protagonistGender),
      guiXiaolingVisualSpec(language),
      `Page theme: ${pageTitle}.`,
      `Story scene: ${pageText}`,
      `Guangxi intangible heritage elements: ${heritage.join(", ")}.`,
      `Guangxi cultural tourism elements: ${tourism.join(", ")}.`,
      "Layered composition, friendly expressions, Guangxi ethnic patterns, landscape and festival atmosphere, no text, no watermark, no real-person portrait."
    ].join("\n");
  }

  return [
    "儿童绘本插图，温暖明亮的水彩风格，小学生主角，画面适合 6-12 岁儿童。",
    protagonistVisualSpec(language, protagonistGender),
    guiXiaolingVisualSpec(language),
    `页面主题：${pageTitle}。`,
    `故事画面：${pageText}`,
    `广西非遗元素：${heritage.join("、")}。`,
    `广西文旅元素：${tourism.join("、")}。`,
    "画面有层次，角色表情友好，保留广西民族纹样、山水和节庆氛围，不要出现文字、水印或真实人物肖像。"
  ].join("\n");
}

export function createFallbackBook(idea: string, language: BookLanguage = "zh", protagonistGender: ProtagonistGender = "girl"): PictureBook {
  const id = makeBookId();
  const timestamp = nowIso();
  const heritage = pickElements(idea, heritageElements, 3);
  const tourism = pickElements(idea, tourismElements, 2);
  if (language === "en") {
    const title = idea.includes("德天瀑布")
      ? "The Singing Embroidered Ball by Detian Waterfall"
      : idea.includes("桂林")
        ? "The Glowing Zhuang Brocade Goes to Guilin"
        : "The Embroidered Ball That Sang Mountain Songs";
    const pageTexts = [
      `I shared my idea with Gui Xiaoling, and ${heritage[0]} suddenly began to glow like a tiny doorway into a Guangxi story.`,
      `We arrived at ${tourism[0]}, where the wind carried mountain songs and the colors of ${heritage[1]} across the path.`,
      `On the road, I met a friend who wanted to know Guangxi better. With Gui Xiaoling's help, I introduced ${heritage[0]} and ${heritage[2]} in my own words.`,
      `At the end, I turned the journey into a picture book and shared ${tourism[1]} and ${heritage.join(", ")} with more classmates.`
    ];
    const titles = ["A Bright Idea", "Into Guangxi", "Little Culture Guide", "My Picture Book"];
    const pages: PictureBookPage[] = pageTexts.map((text, index) => ({
      pageNumber: index + 1,
      title: titles[index],
      text,
      imagePrompt: makeIllustrationPrompt(titles[index], text, heritage, tourism, language, protagonistGender),
      imageUrl: "",
      imageSource: "placeholder",
      cultureNote: `${heritage[index % heritage.length]} is a Guangxi cultural element. It can become a story character, clue, or visual symbol.`
    }));
    const storyPrompt = `Turn the student's idea "${idea}" into a 4-page Guangxi intangible heritage and cultural tourism picture book in English.`;

    return {
      id,
      title,
      subtitle: "An AI picture book where travel and heritage shine together",
      originalIdea: idea,
      language,
      protagonistGender,
      createdAt: timestamp,
      updatedAt: timestamp,
      heritageElements: heritage,
      tourismElements: tourism,
      guidingQuestions: [
        "Is the heritage element a friend, a clue, or a magical object in my story?",
        "Which Guangxi place or culture do I want classmates to remember after reading?"
      ],
      outline: `The main character starts from one idea, travels through ${tourism.join(" and ")}, learns about ${heritage.join(", ")}, and finishes an original Guangxi picture book.`,
      pages,
      tourGuideScript: `Hello, I am a little cultural tourism guide. Today I want to introduce ${tourism.join(" and ")}. I also want to share Guangxi cultural elements such as ${heritage.join(", ")}. Welcome to Guangxi, and turn your travel discoveries into your own stories.`,
      studentReflection: "I shared an idea, asked questions with AI, made choices, and turned Guangxi culture into my own original picture book.",
      aiContentRatio: 88,
      promptRecords: [
        makePromptRecord("story", "Story Generation Prompt", storyPrompt, "Generated a 4-page picture book, outline, guide script, and heritage notes."),
        ...pages.map((page) => makePromptRecord("image", `Page ${page.pageNumber} Image Prompt`, page.imagePrompt, "Waiting for image generation or using a local demo illustration."))
      ]
    };
  }

  const title = idea.includes("德天瀑布")
    ? "瀑布边的会唱歌绣球"
    : idea.includes("桂林")
      ? "会发光的壮锦去桂林"
      : "会唱山歌的绣球";

  const pageTexts = [
    `我把自己的灵感说给桂小灵听，${heritage[0]}忽然亮了起来，好像在邀请我走进一个广西故事。`,
    `我们来到了${tourism[0]}，风里传来${heritage[1]}和山歌的声音，每一步都像翻开一页新的绘本。`,
    `路上，我遇到一个想了解广西文化的小伙伴。我用桂小灵帮我整理的词语，向他介绍${heritage[0]}和${heritage[2]}。`,
    `最后，我把今天的冒险创编成一本绘本，也把${tourism[1]}和${heritage.join("、")}介绍给更多同学。`
  ];

  const pages: PictureBookPage[] = pageTexts.map((text, index) => ({
    pageNumber: index + 1,
    title: ["灵感发光", "走进广西", "小小讲解员", "我的创编绘本"][index],
    text,
    imagePrompt: makeIllustrationPrompt(["灵感发光", "走进广西", "小小讲解员", "我的创编绘本"][index], text, heritage, tourism, language, protagonistGender),
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
    language,
    protagonistGender,
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
    studentReflection: "我先说出灵感，再和桂小灵一起追问、选择、修改，把广西文化变成了自己的原创绘本。",
    aiContentRatio: 88,
    promptRecords: [
      makePromptRecord("story", "故事生成 Prompt", storyPrompt, "已生成 4 页绘本故事、大纲、文旅讲解和非遗知识。"),
      ...pages.map((page) => makePromptRecord("image", `第 ${page.pageNumber} 页图片 Prompt`, page.imagePrompt, "等待图片生成或使用本地演示插图。"))
    ]
  };
}
