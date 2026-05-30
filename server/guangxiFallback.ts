import {
  makeBookId,
  makePromptRecord,
  nowIso,
  type BookLanguage,
  type PictureBook,
  type PictureBookPage,
  type ProtagonistGender
} from "./bookStore.js";

type SceneOption = {
  name: string;
  keywords: string[];
};

const overusedDefaultHeritage = new Set(["壮锦", "壮锦织造技艺", "铜鼓", "铜鼓习俗", "铜鼓铸造技艺"]);

const heritageCatalog: SceneOption[] = [
  { name: "壮族绣球", keywords: ["绣球", "抛绣球", "三月三", "歌圩", "embroidered ball"] },
  { name: "壮族山歌", keywords: ["山歌", "唱歌", "歌圩", "对歌", "三月三", "song"] },
  { name: "刘三姐歌谣", keywords: ["刘三姐", "桂林", "阳朔", "漓江", "山歌", "sanjie"] },
  { name: "壮族三月三", keywords: ["三月三", "歌圩", "节日", "赶歌圩", "festival"] },
  { name: "五色糯米饭", keywords: ["五色糯米饭", "糯米饭", "美食", "三月三", "rice"] },
  { name: "北海贝雕", keywords: ["北海", "银滩", "贝壳", "贝雕", "大海", "沙滩", "beihai", "shell"] },
  { name: "合浦南珠制作技艺", keywords: ["合浦", "南珠", "珍珠", "北海", "银滩", "pearl"] },
  { name: "疍家渔歌", keywords: ["疍家", "渔歌", "渔船", "海边", "北海", "银滩", "fishing"] },
  { name: "侗族大歌", keywords: ["侗族", "三江", "程阳", "风雨桥", "鼓楼", "大歌", "dong"] },
  { name: "侗族木构建筑营造技艺", keywords: ["三江", "程阳", "风雨桥", "鼓楼", "木构", "桥"] },
  { name: "侗族刺绣", keywords: ["侗族", "三江", "服饰", "刺绣", "衣饰"] },
  { name: "瑶族盘王节", keywords: ["瑶族", "盘王", "金秀", "大瑶山", "瑶山"] },
  { name: "毛南族花竹帽编织技艺", keywords: ["毛南", "环江", "花竹帽", "竹帽", "编织"] },
  { name: "天琴弹唱", keywords: ["天琴", "崇左", "龙州", "凭祥", "德天", "瀑布", "waterfall"] },
  { name: "花山岩画", keywords: ["花山", "岩画", "崇左", "宁明", "左江", "cliff"] },
  { name: "柳州螺蛳粉制作技艺", keywords: ["柳州", "螺蛳粉", "美食", "酸笋", "luosifen"] },
  { name: "广西彩调", keywords: ["柳州", "桂林", "戏曲", "彩调", "集市", "舞台"] },
  { name: "融水苗族芦笙斗马节", keywords: ["柳州", "融水", "苗族", "芦笙", "斗马"] },
  { name: "桂林米粉制作技艺", keywords: ["桂林", "米粉", "美食", "早餐", "rice noodle"] },
  { name: "龙脊梯田农耕文化", keywords: ["龙脊", "梯田", "农耕", "稻田", "春耕", "terrace"] },
  { name: "瑶族服饰", keywords: ["龙脊", "梯田", "瑶族", "红瑶", "服饰", "长发村"] },
  { name: "钦州坭兴陶烧制技艺", keywords: ["钦州", "坭兴陶", "陶", "陶器", "泥"] },
  { name: "壮锦织造技艺", keywords: ["壮锦", "织锦", "织造", "织布", "锦", "纹样", "brocade"] },
  { name: "铜鼓习俗", keywords: ["铜鼓", "鼓声", "鼓", "东兰", "河池", "bronze drum"] }
];

const tourismCatalog: SceneOption[] = [
  { name: "桂林山水", keywords: ["桂林", "漓江", "象鼻山", "阳朔", "guilin"] },
  { name: "阳朔漓江", keywords: ["桂林", "阳朔", "漓江", "竹筏", "遇龙河"] },
  { name: "德天跨国瀑布", keywords: ["德天", "瀑布", "大新", "崇左", "waterfall"] },
  { name: "崇左明仕田园", keywords: ["德天", "瀑布", "大新", "崇左", "明仕"] },
  { name: "北海银滩", keywords: ["北海", "银滩", "大海", "沙滩", "beihai"] },
  { name: "合浦海丝首港", keywords: ["北海", "合浦", "南珠", "珍珠", "海丝"] },
  { name: "三江程阳风雨桥", keywords: ["三江", "程阳", "风雨桥", "鼓楼", "侗族"] },
  { name: "三江鼓楼侗寨", keywords: ["三江", "侗族", "鼓楼", "侗寨", "大歌"] },
  { name: "龙脊梯田", keywords: ["龙脊", "梯田", "稻田", "terrace"] },
  { name: "河池东兰铜鼓文化景区", keywords: ["铜鼓", "东兰", "河池", "鼓声"] },
  { name: "南宁青秀山", keywords: ["南宁", "青秀山", "绿城", "三月三", "歌圩", "绣球", "山歌"] },
  { name: "南宁三街两巷", keywords: ["三街两巷", "南宁", "老街", "骑楼", "三月三", "歌圩"] },
  { name: "黄姚古镇", keywords: ["黄姚", "古镇", "贺州"] },
  { name: "柳州百里柳江", keywords: ["柳州", "柳江", "窑埠", "螺蛳粉"] },
  { name: "柳州窑埠古镇", keywords: ["柳州", "窑埠", "螺蛳粉", "集市", "夜市"] },
  { name: "崇左花山岩画景区", keywords: ["花山", "岩画", "崇左", "左江"] }
];

const cultureNotes: Record<string, string> = {
  壮族绣球: "壮族绣球常出现在节庆和歌圩中，既是手工艺品，也能成为故事里的祝福信物。",
  壮族山歌: "壮族山歌讲究即兴对唱，常在节庆、劳动和生活场景中表达心情。",
  刘三姐歌谣: "刘三姐歌谣和桂林山水、壮族山歌联系很深，适合放在漓江、阳朔等故事场景里。",
  壮族三月三: "壮族三月三是广西重要民族节庆，人们会赶歌圩、唱山歌、做五色糯米饭。",
  五色糯米饭: "五色糯米饭是广西节庆美食，颜色来自天然植物，常和三月三等节日相连。",
  北海贝雕: "北海贝雕利用贝壳天然光泽创作图案，很适合海边、银滩和寻宝故事。",
  合浦南珠制作技艺: "合浦南珠以温润光泽闻名，和北海、合浦的海洋文化联系紧密。",
  疍家渔歌: "疍家渔歌来自海上生活，适合表现渔船、海风和渔民劳动场景。",
  侗族大歌: "侗族大歌是多声部民歌，常在三江侗寨、鼓楼和风雨桥旁唱响。",
  侗族木构建筑营造技艺: "侗族风雨桥和鼓楼多用木构营造，体现不用钉铆的建筑智慧。",
  侗族刺绣: "侗族刺绣常见于服饰和生活用品，图案细密，适合描写三江侗寨里的手作细节。",
  瑶族盘王节: "瑶族盘王节承载祭祀、歌舞和族群记忆，适合大瑶山、金秀等场景。",
  毛南族花竹帽编织技艺: "毛南族花竹帽轻巧精美，图案和编织工序都很适合细节描写。",
  天琴弹唱: "天琴弹唱多见于桂西南，琴声清亮，适合瀑布、边关和山水夜色场景。",
  花山岩画: "花山岩画位于左江流域，红色图像记录了古老的祭祀与生活想象。",
  柳州螺蛳粉制作技艺: "柳州螺蛳粉制作技艺融合米粉、汤料和酸笋风味，适合美食旅行故事。",
  广西彩调: "广西彩调节奏活泼、生活气息浓，适合集市、戏台和民间表演故事。",
  融水苗族芦笙斗马节: "融水苗族芦笙斗马节热闹欢快，能表现芦笙声、民族服饰和节庆气氛。",
  桂林米粉制作技艺: "桂林米粉是桂林日常美食代表，能把城市味道自然带进绘本。",
  龙脊梯田农耕文化: "龙脊梯田体现山地农耕智慧，适合稻田、春耕和丰收故事。",
  瑶族服饰: "瑶族服饰色彩鲜明、刺绣精细，和龙脊梯田、红瑶村寨等场景很贴近。",
  钦州坭兴陶烧制技艺: "钦州坭兴陶以陶土、烧制和窑变见长，适合手作体验类故事。",
  壮锦织造技艺: "壮锦织造技艺图案鲜明、色彩丰富，适合织布、纹样和家传手艺故事。",
  铜鼓习俗: "铜鼓习俗和节庆、仪式、鼓声有关，适合真正出现鼓声或铜鼓线索的故事。"
};

function ideaIncludesAny(idea: string, keywords: string[]) {
  const normalizedIdea = idea.toLowerCase();
  return keywords.some((keyword) => normalizedIdea.includes(keyword.toLowerCase()));
}

function hashText(text: string) {
  return [...text].reduce((hash, char) => (hash * 31 + char.codePointAt(0)!) % 9973, 17);
}

function scoreOption(idea: string, option: SceneOption) {
  let score = ideaIncludesAny(idea, [option.name]) ? 10 : 0;
  for (const keyword of option.keywords) {
    if (ideaIncludesAny(idea, [keyword])) {
      score += Math.min(6, Math.max(2, keyword.length));
    }
  }
  return score;
}

function rotateOptions<T>(items: T[], seed: string) {
  if (!items.length) {
    return items;
  }
  const start = hashText(seed) % items.length;
  return items.slice(start).concat(items.slice(0, start));
}

function pickSceneFirstElements(idea: string, catalog: SceneOption[], count: number) {
  const scored = catalog
    .map((option, index) => ({ option, index, score: scoreOption(idea, option) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = scored.filter((item) => item.score > 0).map((item) => item.option);
  const selectedNames = new Set(selected.map((item) => item.name));
  const supplement = rotateOptions(
    scored
      .filter((item) => !selectedNames.has(item.option.name))
      .map((item) => item.option)
      .filter((option) => !overusedDefaultHeritage.has(option.name) || ideaIncludesAny(idea, [option.name, ...option.keywords])),
    idea
  );

  return selected
    .concat(supplement)
    .slice(0, count)
    .map((option) => option.name);
}

export function chooseHeritageElements(idea: string, count = 3) {
  return pickSceneFirstElements(idea, heritageCatalog, count);
}

export function chooseTourismElements(idea: string, count = 2) {
  return pickSceneFirstElements(idea, tourismCatalog, count);
}

export function buildSceneFirstHeritageGuide(idea: string, language: BookLanguage = "zh") {
  const heritage = chooseHeritageElements(idea, 4);
  const tourism = chooseTourismElements(idea, 3);
  if (language === "en") {
    return [
      "Scene-first heritage rule: choose Guangxi heritage elements by reading the student's place, festival, food, sound, character, and action first.",
      "Do not use Zhuang brocade or bronze drum as default Guangxi symbols. Use them only when the idea mentions brocade, weaving, patterns, bronze drums, drum sounds, or a clearly related custom.",
      "Examples: Beihai/Silver Beach/sea -> Beihai shell carving, Hepu pearls, Tanka fishing songs; Sanyuesan/song fair/mountain songs/embroidered ball -> Zhuang Sanyuesan, Zhuang mountain songs, Zhuang embroidered ball, five-color sticky rice; Sanjiang/wind-rain bridge -> Dong grand song and Dong wooden architecture; Liuzhou/food -> Luosifen making craft; Guilin/Lijiang/Liu Sanjie -> Liu Sanjie ballads and Guilin rice noodles.",
      `For this idea, prefer heritage such as: ${heritage.join(", ")}. Prefer travel scenes such as: ${tourism.join(", ")}.`
    ].join("\n");
  }

  return [
    "非遗选择原则：先读学生灵感里的地点、节日、食物、声音、人物和动作，再选择最应景的广西非遗/民族文化元素。",
    "不要把壮锦、铜鼓当作默认广西符号；只有学生提到织锦、纹样、铜鼓、鼓声，或故事场景确实相关时才使用。",
    "示例：北海/银滩/海边 -> 北海贝雕、合浦南珠制作技艺、疍家渔歌；三月三/歌圩/山歌/绣球 -> 壮族三月三、壮族山歌、壮族绣球、五色糯米饭；三江/风雨桥 -> 侗族大歌、侗族木构建筑营造技艺；柳州/美食 -> 柳州螺蛳粉制作技艺；桂林/漓江/刘三姐 -> 刘三姐歌谣、桂林米粉制作技艺。",
    `本次灵感优先考虑这些非遗：${heritage.join("、")}。文旅场景优先考虑：${tourism.join("、")}。`
  ].join("\n");
}

function guiXiaolingVisualSpec(language: BookLanguage) {
  if (language === "en") {
    return [
      "Gui Xiaoling visual lock: Gui Xiaoling is the picture-book companion robot, a cute glossy white-and-blue round robot mascot with a glowing cyan face and heart, headset microphone, friendly childlike smile, blue cape, and toy-like proportions.",
      "Guangxi details: indigo ethnic-inspired headscarf with teal, white, red, and gold geometric trim, small silver-inspired charm, and subtle Guangxi ethnic pattern accents on the cuffs, cape, and notebook. Do not treat these costume details as mandatory story heritage themes."
    ].join(" ");
  }

  return [
    "桂小灵视觉锁定：桂小灵是画册里的固定机器人伙伴，可爱的白蓝配色圆润机器人吉祥物，黑色发光屏幕脸、青蓝色笑脸和爱心灯、耳麦、蓝色披风，整体像柔和精致的玩具机器人。",
    "广西特色细节：靛蓝民族风格头巾，带青蓝、白、红、金色几何边纹，头巾结旁有轻巧银饰小挂件；袖口、披风和本子有少量广西民族纹样点缀。不要把这些装饰当成故事必须出现的非遗主题。"
  ].join(" ");
}

function protagonistVisualSpec(language: BookLanguage, gender: ProtagonistGender) {
  if (language === "en") {
    return gender === "boy"
      ? "Student protagonist: one 8-10 year-old Guangxi elementary-school boy, bright eyes, friendly expression, simple red-blue jacket with subtle Guangxi ethnic pattern accents, small backpack."
      : "Student protagonist: one 8-10 year-old Guangxi elementary-school girl, inspired by Xiaoyuxi as the default girl role, bright eyes, friendly expression, simple red-blue jacket with subtle Guangxi ethnic pattern accents, small backpack.";
  }

  return gender === "boy"
    ? "小学生主角设定：一位 8-10 岁广西小学生男孩，明亮眼睛、友好表情，穿红蓝相间、带少量广西民族纹样点缀的小外套，背一个小书包。"
    : "小学生主角设定：一位 8-10 岁广西小学生女孩，默认以肖予曦女生角色为原型，明亮眼睛、友好表情，穿红蓝相间、带少量广西民族纹样点缀的小外套，背一个小书包。";
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

function getCultureNote(name: string, language: BookLanguage) {
  const note = cultureNotes[name] || `${name}是广西文化元素，适合和相关地点、人物或行动自然连在一起。`;
  if (language === "en") {
    return `${name} is a Guangxi cultural element. Use it when it fits the place, action, and mood of the story.`;
  }
  return note;
}

function makeFallbackTitle(idea: string, language: BookLanguage) {
  if (language === "en") {
    if (ideaIncludesAny(idea, ["北海", "银滩", "beihai", "sea"])) {
      return "The Shell-Carving Treasure on Silver Beach";
    }
    if (ideaIncludesAny(idea, ["三江", "风雨桥", "侗族", "dong"])) {
      return "The Dong Grand Song by the Wind-Rain Bridge";
    }
    if (ideaIncludesAny(idea, ["柳州", "螺蛳粉", "liuzhou", "luosifen"])) {
      return "A Heritage Market Scented with Luosifen";
    }
    if (ideaIncludesAny(idea, ["德天", "瀑布", "waterfall"])) {
      return "The Tianqin Echo Beside Detian Waterfall";
    }
    if (ideaIncludesAny(idea, ["桂林", "漓江", "刘三姐", "guilin"])) {
      return "The Mountain-Song Map on the Li River";
    }
    if (ideaIncludesAny(idea, ["三月三", "歌圩", "绣球", "song fair", "embroidered ball"])) {
      return "The Singing Embroidered Ball at the Song Fair";
    }
    return "My Scene-First Guangxi Story";
  }

  if (ideaIncludesAny(idea, ["北海", "银滩", "大海", "贝壳"])) {
    return "银滩上的贝雕寻宝记";
  }
  if (ideaIncludesAny(idea, ["三江", "风雨桥", "侗族", "鼓楼"])) {
    return "风雨桥边的侗族大歌";
  }
  if (ideaIncludesAny(idea, ["柳州", "螺蛳粉"])) {
    return "螺蛳粉香气里的非遗集市";
  }
  if (ideaIncludesAny(idea, ["德天", "瀑布", "崇左"])) {
    return "瀑布边的天琴回声";
  }
  if (ideaIncludesAny(idea, ["桂林", "漓江", "刘三姐", "阳朔"])) {
    return "漓江上的山歌地图";
  }
  if (ideaIncludesAny(idea, ["三月三", "歌圩", "绣球", "山歌"])) {
    return "歌圩里的会唱歌绣球";
  }
  return "我的广西应景小故事";
}

export function createFallbackBook(idea: string, language: BookLanguage = "zh", protagonistGender: ProtagonistGender = "girl"): PictureBook {
  const id = makeBookId();
  const timestamp = nowIso();
  const heritage = chooseHeritageElements(idea, 3);
  const tourism = chooseTourismElements(idea, 2);
  if (language === "en") {
    const title = makeFallbackTitle(idea, language);
    const pageTexts = [
      `I shared my idea with Gui Xiaoling, and ${heritage[0]} became the first clue because it matched the place and mood of my story.`,
      `We arrived at ${tourism[0]}. The sounds, colors, and people there naturally led us to ${heritage[1]}, so the journey felt truly local.`,
      `On the road, I met a friend who wanted to know Guangxi better. With Gui Xiaoling's help, I introduced ${heritage[0]} and ${heritage[2]} in my own words.`,
      `At the end, I turned the journey into a picture book and shared ${tourism[1]} with classmates, letting each heritage detail appear only where it belonged.`
    ];
    const titles = ["A Bright Idea", "Into Guangxi", "Little Culture Guide", "My Picture Book"];
    const pages: PictureBookPage[] = pageTexts.map((text, index) => ({
      pageNumber: index + 1,
      title: titles[index],
      text,
      imagePrompt: makeIllustrationPrompt(titles[index], text, heritage, tourism, language, protagonistGender),
      imageUrl: "",
      imageSource: "placeholder",
      cultureNote: getCultureNote(heritage[index % heritage.length], language)
    }));
    const storyPrompt = `Turn the student's idea "${idea}" into a 4-page Guangxi intangible heritage and cultural tourism picture book in English.`;

    return {
      id,
      title,
      subtitle: "A picture book where the scene chooses the heritage clue",
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
      outline: `The main character starts from one idea, travels through ${tourism.join(" and ")}, follows scene-matched clues such as ${heritage.join(", ")}, and finishes an original Guangxi picture book.`,
      pages,
      tourGuideScript: `Hello, I am a little cultural tourism guide. Today I want to introduce ${tourism.join(" and ")}. I chose ${heritage.join(", ")} because they fit this story scene. Welcome to Guangxi, and turn travel discoveries into your own stories.`,
      studentReflection: "I learned that heritage should grow from the place, characters, and action in my story, not be added just because it is famous.",
      aiContentRatio: 88,
      promptRecords: [
        makePromptRecord("story", "Story Generation Prompt", storyPrompt, "Generated a 4-page picture book, outline, guide script, and heritage notes."),
        ...pages.map((page) => makePromptRecord("image", `Page ${page.pageNumber} Image Prompt`, page.imagePrompt, "Waiting for image generation or using a local demo illustration."))
      ]
    };
  }

  const title = makeFallbackTitle(idea, language);

  const pageTexts = [
    `我把自己的灵感说给桂小灵听，${heritage[0]}成了第一条线索，因为它和这个地点、人物、心情最合拍。`,
    `我们来到了${tourism[0]}，这里的声音、颜色和人们的生活，自然而然把我们带向${heritage[1]}。`,
    `路上，我遇到一个想了解广西文化的小伙伴。我用桂小灵帮我整理的词语，向他介绍${heritage[0]}和${heritage[2]}。`,
    `最后，我把今天的冒险创编成一本绘本，也把${tourism[1]}介绍给更多同学。每个非遗小发现都出现在最适合它的地方。`
  ];

  const pages: PictureBookPage[] = pageTexts.map((text, index) => ({
    pageNumber: index + 1,
    title: ["灵感发光", "走进广西", "小小讲解员", "我的创编绘本"][index],
    text,
    imagePrompt: makeIllustrationPrompt(["灵感发光", "走进广西", "小小讲解员", "我的创编绘本"][index], text, heritage, tourism, language, protagonistGender),
    imageUrl: "",
    imageSource: "placeholder",
    cultureNote: getCultureNote(heritage[index % heritage.length], language)
  }));

  const storyPrompt = `请把小学生灵感“${idea}”创编成 4 页广西非遗文旅绘本。`;

  return {
    id,
    title,
    subtitle: "一本让场景先说话的广西非遗绘本",
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
    outline: `主角从一句灵感出发，在${tourism.join("、")}之间冒险，根据地点和情节认识${heritage.join("、")}，最后完成自己的广西非遗文旅绘本。`,
    pages,
    tourGuideScript: `大家好，我是小小文旅推荐官。今天我想介绍${tourism.join("和")}。我选择${heritage.join("、")}，是因为它们和这个故事的地点、声音、味道或行动最贴近。欢迎大家来广西，把旅途中的发现也创编成自己的故事。`,
    studentReflection: "我发现非遗不是硬塞进故事里的标签，而是要从地点、人物和情节里自然长出来。",
    aiContentRatio: 88,
    promptRecords: [
      makePromptRecord("story", "故事生成 Prompt", storyPrompt, "已生成 4 页绘本故事、大纲、文旅讲解和非遗知识。"),
      ...pages.map((page) => makePromptRecord("image", `第 ${page.pageNumber} 页图片 Prompt`, page.imagePrompt, "等待图片生成或使用本地演示插图。"))
    ]
  };
}
