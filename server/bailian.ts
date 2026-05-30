import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  makePromptRecord,
  nowIso,
  type BookLanguage,
  type PictureBook,
  type PictureBookPage,
  type PromptRecord
} from "./bookStore.js";
import { createFallbackBook } from "./guangxiFallback.js";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type BookDraft = Omit<PictureBook, "id" | "createdAt" | "updatedAt" | "promptRecords">;

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedDir = join(rootDir, "data", "generated");

function dashScopeKey() {
  return process.env.DASHSCOPE_API_KEY?.trim() || process.env.BAILIAN_API_KEY?.trim() || "";
}

function textBaseUrl() {
  return (process.env.BAILIAN_TEXT_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/+$/u, "");
}

function textModel() {
  return process.env.BAILIAN_TEXT_MODEL || "qwen3.7-max";
}

function imageModel() {
  return process.env.BAILIAN_IMAGE_MODEL || "wan2.7-image-pro";
}

function imageSize() {
  return process.env.BAILIAN_IMAGE_SIZE || "2K";
}

export function hasBailianKey() {
  return Boolean(dashScopeKey());
}

export function getBailianRuntimeStatus() {
  return {
    configured: hasBailianKey(),
    textModel: textModel(),
    imageModel: imageModel(),
    imageSize: imageSize()
  };
}

function extractJson(text: string) {
  const cleaned = text
    .replace(/^```json\s*/iu, "")
    .replace(/^```\s*/iu, "")
    .replace(/```$/u, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("AI response did not include JSON");
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as BookDraft;
}

function useGuiXiaolingName(text = "", language: BookLanguage = "zh") {
  if (!text) {
    return text;
  }

  if (language === "en") {
    return text
      .replace(/\bAI\s+(assistant|helper|companion|robot)\b/giu, "Gui Xiaoling")
      .replace(/\bthe\s+assistant\b/giu, "Gui Xiaoling")
      .replace(/\bmy\s+assistant\b/giu, "Gui Xiaoling")
      .replace(/\bXiaoyuan\b/giu, "Gui Xiaoling");
  }

  return text
    .replace(/AI\s*小助手/gu, "桂小灵")
    .replace(/AI\s*助手/gu, "桂小灵")
    .replace(/智能小助手/gu, "桂小灵")
    .replace(/小助手/gu, "桂小灵")
    .replace(/小圆/gu, "桂小灵");
}

async function chatCompletion(messages: ChatMessage[]) {
  if (!dashScopeKey()) {
    throw new Error("DASHSCOPE_API_KEY is missing");
  }

  const response = await fetch(`${textBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dashScopeKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: textModel(),
      messages,
      temperature: 0.78,
      max_tokens: 2600
    })
  });

  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Bailian text request failed with HTTP ${response.status}`);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Bailian text model returned empty content");
  }
  return content;
}

function normalizeDraft(idea: string, draft: BookDraft, language: BookLanguage): BookDraft {
  const fallback = createFallbackBook(idea, language);
  const pages = Array.isArray(draft.pages) && draft.pages.length ? draft.pages.slice(0, 4) : fallback.pages;

  return {
    title: useGuiXiaolingName(draft.title || fallback.title, language),
    subtitle: useGuiXiaolingName(draft.subtitle || fallback.subtitle, language),
    originalIdea: idea,
    language,
    heritageElements: (draft.heritageElements || fallback.heritageElements).slice(0, 5).map((item) => useGuiXiaolingName(item, language)),
    tourismElements: (draft.tourismElements || fallback.tourismElements).slice(0, 5).map((item) => useGuiXiaolingName(item, language)),
    guidingQuestions: (draft.guidingQuestions || fallback.guidingQuestions).slice(0, 3).map((item) => useGuiXiaolingName(item, language)),
    outline: useGuiXiaolingName(draft.outline || fallback.outline, language),
    pages: pages.map((page, index) => ({
      pageNumber: index + 1,
      title: useGuiXiaolingName(page.title || fallback.pages[index]?.title || `第 ${index + 1} 页`, language),
      text: useGuiXiaolingName(page.text || fallback.pages[index]?.text || "", language),
      imagePrompt: useGuiXiaolingName(page.imagePrompt || fallback.pages[index]?.imagePrompt || "", language),
      imageUrl: page.imageUrl || "",
      imageSource: page.imageSource || "placeholder",
      cultureNote: useGuiXiaolingName(page.cultureNote || fallback.pages[index]?.cultureNote || "", language)
    })),
    tourGuideScript: useGuiXiaolingName(draft.tourGuideScript || fallback.tourGuideScript, language),
    studentReflection: useGuiXiaolingName(draft.studentReflection || fallback.studentReflection, language),
    aiContentRatio: Number(draft.aiContentRatio || 90)
  };
}

export async function createPictureBookDraft(idea: string, language: BookLanguage = "zh") {
  const fallback = createFallbackBook(idea, language);
  if (!hasBailianKey()) {
    return fallback;
  }

  const systemPrompt =
    language === "en"
      ? [
          "You are the AI creative coach for Guiyun Creator, serving elementary-school students.",
          "Task: Turn a student's one-sentence idea into a Guangxi intangible-heritage and cultural-tourism AI picture book.",
          "Perspective: Write from the student's point of view, emphasizing 'I create together with AI'. Do not sound like an adult managing a child.",
          "Companion character: whenever the AI helper or robot helper appears in the story, its name must be Gui Xiaoling. Do not write generic names such as AI assistant, AI helper, assistant, or Xiaoyuan.",
          "Content: Combine Guangxi intangible cultural heritage, cultural tourism, ethnic culture, and creative-writing growth.",
          "Safety: Suitable for ages 6-12. Avoid danger, horror, adult content, ads, or invented policy claims.",
          "Language: All reader-facing story fields must be in natural English. Guangxi names may keep Chinese proper nouns with simple English explanation when useful.",
          "Output: JSON only. No Markdown, no extra explanation."
        ].join("\n")
      : [
          "你是“桂韵创想家”的 AI 创编导师，服务对象是小学组学生。",
          "任务：根据学生的一句话灵感，生成广西非遗文旅 AI 绘本。",
          "视角：必须使用学生视角，强调“我和 AI 一起创作”，不要写成成人管理孩子。",
          "伙伴角色：如果故事里出现帮助我的 AI 或机器人助手，名字必须是“桂小灵”，不要写“AI小助手”“AI助手”“小助手”“小圆”。",
          "内容：融合广西非遗、文旅、民族文化和创编能力训练。",
          "安全：适合 6-12 岁儿童，不出现危险、恐怖、成人化、商业广告或编造政策内容。",
          "语言：所有面向读者的故事字段必须使用自然中文。",
          "输出：只输出 JSON，不要解释，不要 Markdown。"
        ].join("\n");

  const userPrompt =
    language === "en"
      ? [
          `Student idea: ${idea}`,
          "Generate one JSON object. Required fields:",
          "title: picture book title in English",
          "subtitle: one short subtitle in English",
          "originalIdea: original idea",
          "language: exactly \"en\"",
          "If a helper robot appears in the story, call it Gui Xiaoling every time.",
          "heritageElements: 2-5 Guangxi intangible heritage / ethnic culture elements",
          "tourismElements: 2-5 Guangxi cultural tourism elements",
          "guidingQuestions: 2-3 questions that help the student continue creating, in English",
          "outline: story outline within 55 English words",
          "pages: an array of exactly 4 pages. Each page includes pageNumber, title, text, imagePrompt, cultureNote",
          "Each page text should be 35-60 English words, child-friendly and easy to read aloud.",
          "tourGuideScript: a cultural tourism guide script within 90 English words, suitable for an elementary-school student to read aloud",
          "studentReflection: student reflection within 45 English words",
          "aiContentRatio: number from 80 to 95",
          "Image prompts should be in English or bilingual, suitable for children's picture books, watercolor or new-Chinese illustration style, with clear Guangxi cultural elements. No text, watermark, or real-person portrait.",
          "The 4 image prompts must keep the same elementary-school protagonist, same outfit, same visual style, and continuous story mood. Only the scene and action change per page."
        ].join("\n")
      : [
          `学生灵感：${idea}`,
          "请生成一个 JSON 对象，字段必须包含：",
          "title: 绘本标题",
          "subtitle: 一句副标题",
          "originalIdea: 原始灵感",
          "language: 固定为 \"zh\"",
          "如果故事里出现帮助我的机器人或 AI 伙伴，请每次都称呼它为“桂小灵”。",
          "heritageElements: 2-5 个广西非遗/民族文化元素",
          "tourismElements: 2-5 个广西文旅元素",
          "guidingQuestions: 2-3 个用于启发学生继续创编的问题",
          "outline: 80 字以内故事大纲",
          "pages: 4 页数组，每页包含 pageNumber, title, text, imagePrompt, cultureNote",
          "tourGuideScript: 小学生能朗读的 120 字以内文旅讲解词",
          "studentReflection: 60 字以内学生创作反思",
          "aiContentRatio: 80 到 95 的数字",
          "图片 Prompt 要适合儿童绘本、水彩或国潮插画风格，明确广西文化元素，不要文字、水印、真实人物肖像。",
          "4 页图片 Prompt 必须保持同一位小学生主角、同一套服装、同一绘本画风和连续故事氛围，只改变每页场景与动作。"
        ].join("\n");

  try {
    const content = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]);
    const normalized = normalizeDraft(idea, extractJson(content), language);
    const timestamp = nowIso();
    return {
      ...normalized,
      id: fallback.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      promptRecords: [
        makePromptRecord("story", language === "en" ? "Bailian Story Prompt" : "百炼故事生成 Prompt", `${systemPrompt}\n\n${userPrompt}`, content),
        ...normalized.pages.map((page) =>
          makePromptRecord(
            "image",
            language === "en" ? `Page ${page.pageNumber} Image Prompt` : `第 ${page.pageNumber} 页图片 Prompt`,
            page.imagePrompt,
            language === "en" ? "Waiting for image generation." : "等待图片生成。"
          )
        )
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "百炼文本生成失败";
    fallback.promptRecords.unshift(makePromptRecord("system", "百炼文本生成失败，使用本地演示数据", userPrompt, message));
    return fallback;
  }
}

function escapeSvgText(text: string) {
  return text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").slice(0, 36);
}

async function createPlaceholderImage(book: PictureBook, page: PictureBookPage) {
  await mkdir(generatedDir, { recursive: true });
  const fileName = `${book.id}-page-${page.pageNumber}-placeholder.svg`;
  const filePath = join(generatedDir, fileName);
  const heritage = escapeSvgText(book.heritageElements.join(" / "));
  const tourism = escapeSvgText(book.tourismElements.join(" / "));
  const title = escapeSvgText(page.title);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="900" viewBox="0 0 1280 900">
  <defs>
    <linearGradient id="sky" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f8efd2"/>
      <stop offset="0.55" stop-color="#d8f1e7"/>
      <stop offset="1" stop-color="#f3d7c5"/>
    </linearGradient>
    <pattern id="zhuang" width="84" height="84" patternUnits="userSpaceOnUse">
      <path d="M0 42h84M42 0v84M14 14l56 56M70 14 14 70" stroke="#c24735" stroke-width="4" opacity=".22"/>
    </pattern>
  </defs>
  <rect width="1280" height="900" fill="url(#sky)"/>
  <rect x="0" y="0" width="1280" height="900" fill="url(#zhuang)" opacity=".36"/>
  <path d="M0 695 C190 590 300 690 448 600 C620 496 740 660 910 548 C1058 450 1150 560 1280 486 L1280 900 L0 900 Z" fill="#5ab59a" opacity=".65"/>
  <path d="M0 750 C210 650 330 760 520 665 C700 575 820 730 1010 615 C1136 540 1210 610 1280 575 L1280 900 L0 900 Z" fill="#1f7c6a" opacity=".62"/>
  <circle cx="1010" cy="190" r="96" fill="#f7c64e" opacity=".86"/>
  <g transform="translate(170 245)">
    <circle cx="132" cy="124" r="82" fill="#fffaf0" stroke="#23343a" stroke-width="8"/>
    <circle cx="104" cy="112" r="11" fill="#23343a"/>
    <circle cx="160" cy="112" r="11" fill="#23343a"/>
    <path d="M104 152 Q132 180 164 152" fill="none" stroke="#23343a" stroke-width="9" stroke-linecap="round"/>
    <rect x="62" y="222" width="140" height="182" rx="50" fill="#fffaf0" stroke="#23343a" stroke-width="8"/>
    <path d="M32 275 Q0 330 52 360" fill="none" stroke="#c24735" stroke-width="20" stroke-linecap="round"/>
    <path d="M230 275 Q276 318 232 370" fill="none" stroke="#c24735" stroke-width="20" stroke-linecap="round"/>
    <path d="M98 274 h68 l-34 48 z" fill="#e8a83b"/>
  </g>
  <g transform="translate(548 254)">
    <rect x="0" y="0" width="530" height="322" rx="28" fill="#fffaf0" opacity=".94"/>
    <text x="42" y="76" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="50" font-weight="700" fill="#23343a">${title}</text>
    <text x="42" y="150" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="28" fill="#38625d">广西非遗：${heritage}</text>
    <text x="42" y="210" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="28" fill="#38625d">文旅场景：${tourism}</text>
    <text x="42" y="270" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="24" fill="#8a4e30">等待百炼图片生成时，使用本地演示插图</text>
  </g>
</svg>`;
  await writeFile(filePath, svg, "utf8");
  return `/generated/${fileName}`;
}

async function downloadGeneratedImage(url: string, bookId: string, pageNumber: number) {
  await mkdir(generatedDir, { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image download failed with HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "image/png";
  const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
  const bytes = Buffer.from(await response.arrayBuffer());
  const fileName = `${bookId}-page-${pageNumber}.${ext}`;
  await writeFile(join(generatedDir, fileName), bytes);
  return `/generated/${fileName}`;
}

async function callBailianImage(prompt: string, bookId: string, pageNumber: number) {
  if (!dashScopeKey()) {
    throw new Error("DASHSCOPE_API_KEY is missing");
  }

  const response = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dashScopeKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: imageModel(),
      input: {
        messages: [
          {
            role: "user",
            content: [{ text: prompt }]
          }
        ]
      },
      parameters: {
        size: imageSize(),
        n: 1,
        watermark: false
      }
    })
  });

  const payload = (await response.json().catch(() => null)) as {
    output?: { choices?: Array<{ message?: { content?: Array<{ image?: string; url?: string }> } }>; results?: Array<{ url?: string }> };
    message?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.message || `Bailian image request failed with HTTP ${response.status}`);
  }

  const imageUrl =
    payload?.output?.results?.[0]?.url ||
    payload?.output?.choices?.[0]?.message?.content?.find((item) => item.image || item.url)?.image ||
    payload?.output?.choices?.[0]?.message?.content?.find((item) => item.image || item.url)?.url;

  if (!imageUrl) {
    throw new Error("Bailian image model returned no image URL");
  }

  return downloadGeneratedImage(imageUrl, bookId, pageNumber);
}

function buildCoherentImagePrompt(book: PictureBook, page: PictureBookPage) {
  const storyboard = book.pages.map((item) => `第${item.pageNumber}页《${item.title}》：${item.text}`).join("\n");
  return [
    "请生成一张高质量儿童绘本插图，必须与同一本绘本的其他页保持连贯。",
    "统一视觉设定：同一位 8-10 岁广西小学生主角贯穿四页，圆脸、明亮眼睛、友好表情，穿红蓝相间、带少量壮锦纹样的小外套，背一个小书包。",
    "统一画风：温暖明亮的儿童绘本插画，细腻水彩质感，柔和光线，广西民族纹样点缀，画面适合小学组展示。",
    "统一限制：不要出现文字、字幕、水印、Logo、真实人物肖像；不要改变主角长相、年龄、服装和整体画风。",
    `绘本标题：${book.title}`,
    `全书非遗元素：${book.heritageElements.join("、")}`,
    `全文旅元素：${book.tourismElements.join("、")}`,
    "四页连续故事板：",
    storyboard,
    "当前需要绘制的页面：",
    `第${page.pageNumber}页《${page.title}》`,
    `当前页正文：${page.text}`,
    `当前页文化提示：${page.cultureNote}`,
    "当前页原始图片 Prompt：",
    page.imagePrompt
  ].join("\n");
}

export async function generatePageImage(book: PictureBook, pageNumber: number) {
  const page = book.pages.find((item) => item.pageNumber === pageNumber) || book.pages[0];
  if (!page) {
    throw new Error("Picture book has no pages");
  }

  let imageUrl = "";
  let imageSource: PictureBookPage["imageSource"] = "placeholder";
  let record: PromptRecord;
  const coherentPrompt = buildCoherentImagePrompt(book, page);

  try {
    imageUrl = await callBailianImage(coherentPrompt, book.id, page.pageNumber);
    imageSource = "bailian";
    record = makePromptRecord("image", `第 ${page.pageNumber} 页百炼图片生成（连贯角色设定）`, coherentPrompt, imageUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片生成失败";
    imageUrl = await createPlaceholderImage(book, page);
    imageSource = "placeholder";
    record = makePromptRecord("image", `第 ${page.pageNumber} 页本地演示插图`, coherentPrompt, message);
  }

  const nextPage: PictureBookPage = {
    ...page,
    imagePrompt: coherentPrompt,
    imageUrl,
    imageSource
  };

  return { page: nextPage, record };
}

export async function generateAllPageImages(book: PictureBook) {
  const results = await Promise.all(book.pages.map((page) => generatePageImage(book, page.pageNumber)));
  return {
    pages: book.pages.map((page) => results.find((result) => result.page.pageNumber === page.pageNumber)?.page || page),
    records: results.map((result) => result.record)
  };
}
