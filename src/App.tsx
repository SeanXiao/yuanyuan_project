import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Home,
  Image,
  LoaderCircle,
  Mic,
  MicOff,
  Paintbrush,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Volume2
} from "lucide-react";
import companionRobot from "./assets/companion-robot.png";

type PromptRecord = {
  id: string;
  type: "story" | "image" | "culture" | "system";
  label: string;
  prompt: string;
  output: string;
  createdAt: string;
};

type PictureBookPage = {
  pageNumber: number;
  title: string;
  text: string;
  imagePrompt: string;
  imageUrl: string;
  imageSource: "bailian" | "placeholder";
  cultureNote: string;
};

type PictureBook = {
  id: string;
  title: string;
  subtitle: string;
  originalIdea: string;
  language?: BookLanguage;
  protagonistGender?: ProtagonistGender;
  createdAt: string;
  updatedAt: string;
  heritageElements: string[];
  tourismElements: string[];
  guidingQuestions: string[];
  outline: string;
  pages: PictureBookPage[];
  tourGuideScript: string;
  studentReflection: string;
  aiContentRatio: number;
  promptRecords: PromptRecord[];
};

type PictureBookSummary = {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  language?: BookLanguage;
  protagonistGender?: ProtagonistGender;
  heritageElements: string[];
  tourismElements: string[];
  coverImageUrl: string;
};

type BookLanguage = "zh" | "en";

type ProtagonistGender = "girl" | "boy";

type ImageTaskStatus = "idle" | "queued" | "running" | "done" | "error";

type ProgressStage = "understanding" | "story" | "prompts" | "images" | "archive";

type GenerationProgress = {
  active: boolean;
  startedAt: number;
  elapsedSeconds: number;
  stage: ProgressStage;
  title: string;
  detail: string;
  imageTasks: Record<number, ImageTaskStatus>;
  error?: string;
};

type AppRoute =
  | {
      mode: "studio";
    }
  | {
      mode: "player";
      bookId: string;
    };

const stageLabels: Record<ProgressStage, string> = {
  understanding: "写下灵感",
  story: "整理故事",
  prompts: "绘制插图",
  images: "装订成册",
  archive: "放进书架"
};

const progressStages: ProgressStage[] = ["understanding", "story", "prompts", "images", "archive"];

const emptyImageTasks: Record<number, ImageTaskStatus> = {
  1: "idle",
  2: "idle",
  3: "idle",
  4: "idle"
};

const inspirationChips = [
  "三月三歌圩上的会唱歌绣球",
  "漓江边的刘三姐山歌地图",
  "德天瀑布边的小小文旅推荐官",
  "三江风雨桥里的侗族大歌",
  "北海银滩上的贝雕寻宝记",
  "柳州螺蛳粉香气里的非遗集市"
];

function getAppRoute(): AppRoute {
  const playMatch = window.location.hash.match(/^#\/play\/([^/?#]+)/u);
  if (playMatch?.[1]) {
    return { mode: "player", bookId: decodeURIComponent(playMatch[1]) };
  }
  return { mode: "studio" };
}

function getPlayerHref(bookId: string) {
  return `#/play/${encodeURIComponent(bookId)}`;
}

function getBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) {
      resolve(voices);
      return;
    }

    window.speechSynthesis.onvoiceschanged = () => resolve(window.speechSynthesis.getVoices());
    window.setTimeout(() => resolve(window.speechSynthesis.getVoices()), 500);
  });
}

function pickWarmVoice(voices: SpeechSynthesisVoice[], language: BookLanguage) {
  if (language === "en") {
    const englishVoices = voices.filter((voice) => /^en/i.test(voice.lang) || /English/u.test(voice.name));
    return (
      englishVoices.find((voice) => /Samantha|Ava|Jenny|Aria|Google US English|English/u.test(voice.name)) ||
      englishVoices.find((voice) => voice.localService) ||
      englishVoices[0] ||
      null
    );
  }

  const chineseVoices = voices.filter((voice) => /^zh/i.test(voice.lang) || /Chinese|Mandarin|普通话|中文/u.test(voice.name));
  return (
    chineseVoices.find((voice) => /Xiaoxiao|Xiaoyi|Tingting|Meijia|普通话|Mandarin/u.test(voice.name)) ||
    chineseVoices.find((voice) => voice.localService) ||
    chineseVoices[0] ||
    null
  );
}

function splitSpeechText(text: string) {
  return text
    .replace(/\s+/gu, " ")
    .split(/(?<=[。！？!?])|(?<=\.)\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function speakWithBrowser(text: string, language: BookLanguage = "zh") {
  if (!window.speechSynthesis) {
    return;
  }

  window.speechSynthesis.cancel();
  const voice = pickWarmVoice(await getBrowserVoices(), language);
  const chunks = splitSpeechText(text);
  for (const [index, chunk] of chunks.entries()) {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = voice?.lang || (language === "en" ? "en-US" : "zh-CN");
    utterance.voice = voice;
    utterance.rate = 1.12;
    utterance.pitch = 1.03;
    window.speechSynthesis.speak(utterance);
    await new Promise<void>((resolve) => {
      utterance.onend = () => window.setTimeout(resolve, index < chunks.length - 1 ? 80 : 0);
      utterance.onerror = () => resolve();
    });
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function softenDisplayText(text = "") {
  return text
    .replace(/Prompt\s*记录/giu, "创作记录")
    .replace(/图片\s*Prompt/giu, "插图灵感")
    .replace(/故事生成\s*Prompt/giu, "故事灵感整理")
    .replace(/\bPrompt\b/giu, "灵感说明")
    .replace(/AI\s*生成内容约\s*\d+%/giu, "故事内容已整理")
    .replace(/AI\s*生成/giu, "桂小灵整理")
    .replace(/AI\s*追问/giu, "灵感小问题")
    .replace(/AI\s*小助手|AI\s*助手/giu, "桂小灵")
    .replace(/\bAI\b/giu, "桂小灵")
    .replace(/并行/gu, "一起")
    .replace(/生成率/gu, "完成度")
    .replace(/生成图片/gu, "绘制插图")
    .replace(/重新生成/gu, "重新画一版")
    .replace(/生成插图/gu, "绘制插图")
    .replace(/生成绘本/gu, "制作绘本")
    .replace(/模型/gu, "画笔")
    .replace(/任务/gu, "小步骤")
    .replace(/工作流/gu, "创作路线")
    .replace(/调试|Debug/giu, "查看")
    .replace(/\bStep\b/giu, "步骤");
}

function softenRecordText(text = "") {
  return softenDisplayText(text)
    .replace(/百炼/gu, "桂小灵")
    .replace(/OpenAI/giu, "创作伙伴")
    .replace(/DashScope/giu, "创作伙伴")
    .replace(/system/giu, "创作设定")
    .replace(/user/giu, "我的灵感");
}

function getRecordTypeLabel(type: PromptRecord["type"]) {
  const labels: Record<PromptRecord["type"], string> = {
    story: "故事整理",
    image: "插图灵感",
    culture: "文化小知识",
    system: "书桌记录"
  };
  return labels[type];
}

function cleanSpeechPart(text: string) {
  return text
    .replace(/第\s*\d+\s*页[，,：:\s]*/gu, "")
    .replace(/[·•]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[。！？!?.,，、；;：:]+$/gu, "");
}

function buildReadText(book: PictureBook) {
  const language = book.language || "zh";
  const parts = [book.title, ...book.pages.map((page) => page.text), book.tourGuideScript]
    .map(softenDisplayText)
    .map(cleanSpeechPart)
    .filter(Boolean);
  if (!parts.length) {
    return "";
  }

  const separator = language === "en" ? ". " : "。";
  const endMark = language === "en" ? "." : "。";
  return `${parts.join(separator)}${endMark}`;
}

function buildPageReadText(book: PictureBook, page: PictureBookPage, includeCultureNote = false) {
  const language = book.language || "zh";
  const parts = [page.title, page.text, includeCultureNote ? page.cultureNote : ""]
    .map(softenDisplayText)
    .map(cleanSpeechPart)
    .filter(Boolean);
  const separator = language === "en" ? ". " : "。";
  const endMark = language === "en" ? "." : "。";
  return `${parts.join(separator)}${endMark}`;
}

function mergePictureBook(current: PictureBook | null, incoming: PictureBook) {
  if (!current || current.id !== incoming.id) {
    return incoming;
  }

  const currentPages = new Map(current.pages.map((page) => [page.pageNumber, page]));
  const mergedRecords = new Map<string, PromptRecord>();
  [...current.promptRecords, ...incoming.promptRecords].forEach((record) => mergedRecords.set(record.id, record));

  return {
    ...incoming,
    pages: incoming.pages.map((page) => {
      const currentPage = currentPages.get(page.pageNumber);
      if (currentPage?.imageUrl && !page.imageUrl) {
        return currentPage;
      }
      return page;
    }),
    promptRecords: [...mergedRecords.values()]
  };
}

function makeProgress(stage: ProgressStage, title: string, detail: string, imageTasks = emptyImageTasks): GenerationProgress {
  return {
    active: true,
    startedAt: Date.now(),
    elapsedSeconds: 0,
    stage,
    title,
    detail,
    imageTasks: { ...imageTasks }
  };
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => getAppRoute());
  const [idea, setIdea] = useState("我想写一个小朋友在三月三歌圩上遇到会唱山歌的绣球。");
  const [books, setBooks] = useState<PictureBookSummary[]>([]);
  const [activeBook, setActiveBook] = useState<PictureBook | null>(null);
  const [notice, setNotice] = useState("写下一句灵感，桂小灵陪你做一本广西非遗绘本");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [shouldGenerateImage, setShouldGenerateImage] = useState(true);
  const [bookLanguage, setBookLanguage] = useState<BookLanguage>("zh");
  const [protagonistGender, setProtagonistGender] = useState<ProtagonistGender>("girl");
  const [activeTab, setActiveTab] = useState<"book" | "prompts">("book");
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const workbenchRef = useRef<HTMLElement | null>(null);
  const workbenchBodyRef = useRef<HTMLDivElement | null>(null);
  const speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    document.title = route.mode === "player" ? "桂小灵绘本剧场 - 肖予曦开发" : "桂小灵绘本工坊 - 肖予曦开发";
  }, [route.mode]);

  useEffect(() => {
    const handleHashChange = () => setRoute(getAppRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    void refreshBooks();
  }, []);

  useEffect(() => {
    if (route.mode !== "player" || activeBook?.id === route.bookId) {
      return;
    }
    void loadBook(route.bookId, { silent: true }).catch((error) => {
      const message = error instanceof Error ? error.message : "绘本剧场打开失败";
      setNotice(message);
    });
  }, [activeBook?.id, route]);

  useEffect(() => {
    if (!generationProgress?.active) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setGenerationProgress((current) => {
        if (!current?.active) {
          return current;
        }
        return {
          ...current,
          elapsedSeconds: Math.max(0, Math.floor((Date.now() - current.startedAt) / 1000))
        };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [generationProgress?.active]);

  useEffect(() => {
    workbenchBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    if (activeBook) {
      workbenchRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [activeBook?.id, activeTab]);

  async function refreshBooks() {
    const response = await fetch("/api/picture-books");
    const data = (await response.json()) as { books?: PictureBookSummary[] };
    setBooks(data.books || []);
    return data.books || [];
  }

  async function loadBook(id: string, options?: { silent?: boolean }) {
    const response = await fetch(`/api/picture-books/${encodeURIComponent(id)}`);
    const data = (await response.json()) as { book?: PictureBook; error?: string };
    if (!response.ok || !data.book) {
      throw new Error(data.error || "作品不存在");
    }
    setActiveBook(data.book);
    if (!options?.silent) {
      setNotice("已打开绘本，可以继续换插图或查看创作记录");
    }
    return data.book;
  }

  async function openBook(id: string) {
    await loadBook(id);
    setActiveTab("book");
    setGenerationProgress(null);
  }

  async function generateBook(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const cleanIdea = idea.trim();
    if (!cleanIdea || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setActiveTab("book");
    setActiveBook(null);
    setGenerationProgress(
      makeProgress("understanding", "正在把灵感写进故事本", "桂小灵正在找主角、广西非遗和旅行地点。")
    );
    setNotice("桂小灵正在读你的灵感，马上开始整理故事");
    try {
      setGenerationProgress((current) =>
        current
          ? {
              ...current,
              stage: "story",
              title: "正在整理故事",
              detail: "桂小灵正在整理标题、4 页故事、非遗小知识和小学生讲解词。"
            }
          : current
      );
      const response = await fetch("/api/picture-books/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: cleanIdea, language: bookLanguage, protagonistGender, generateImage: false })
      });
      const data = (await response.json()) as { book?: PictureBook; books?: PictureBookSummary[]; error?: string };
      if (!response.ok || !data.book) {
        throw new Error(data.error || "绘本制作失败");
      }
      setActiveBook(data.book);
      setBooks(data.books || []);
      setGenerationProgress((current) =>
        current
          ? {
              ...current,
              stage: shouldGenerateImage ? "prompts" : "archive",
              title: shouldGenerateImage ? "正在为绘本分镜" : "正在放进我的书架",
              detail: shouldGenerateImage
                ? "故事路线已经出现，正在整理 4 页画面和角色样子。"
                : "故事、创作记录和绘本档案正在放进书架。"
            }
          : current
      );

      if (shouldGenerateImage) {
        const runningTasks = data.book.pages.reduce<Record<number, ImageTaskStatus>>(
          (tasks, page) => ({ ...tasks, [page.pageNumber]: "running" }),
          { ...emptyImageTasks }
        );
        setGenerationProgress((current) =>
          current
            ? {
                ...current,
                stage: "images",
                title: "正在为故事页绘制插图",
                detail: "桂小灵会把 4 个故事页一页页画好，完成后自动放回绘本。",
                imageTasks: runningTasks
              }
            : current
        );
        setNotice("故事已经整理好，桂小灵正在绘制插图");

        const results = await Promise.allSettled(
          data.book.pages.map((page) => generateImageForBook(data.book!.id, page.pageNumber, "batch"))
        );
        const failedCount = results.filter((result) => result.status === "rejected").length;

        setGenerationProgress((current) =>
          current
            ? {
                ...current,
                active: false,
                stage: "archive",
                title: failedCount ? "故事书已装订完成，部分插图可再画" : "故事书已装订完成",
                detail: failedCount
                  ? `有 ${failedCount} 页插图还没画好，故事已先放进绘本。`
                  : "4 页故事、插图和非遗小知识都已经放进绘本里了。",
                error: failedCount ? "部分插图还没画好" : undefined
              }
            : current
        );
        await refreshBooks();
        setNotice(failedCount ? "绘本已经准备好啦：有几页插图可以再画一版" : "绘本已经准备好啦：可以朗读、看插图，也可以查看创作记录");
      } else {
        setGenerationProgress((current) =>
          current
            ? {
                ...current,
                active: false,
                stage: "archive",
                title: "故事书已装订完成",
                detail: "已保存故事、非遗小知识和创作记录；需要插图时可以单页补画。"
              }
            : current
        );
        setNotice("故事书已装订完成：可以单页补画插图或查看创作记录");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "绘本制作失败";
      setGenerationProgress((current) =>
        current
          ? {
              ...current,
              active: false,
              title: "创作路上遇到一点问题",
              detail: message,
              error: message
            }
          : current
      );
      setNotice(message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function generateImageForBook(bookId: string, pageNumber: number, mode: "batch" | "single") {
    setGenerationProgress((current) =>
      current
        ? {
            ...current,
            stage: "images",
            title: mode === "batch" ? "正在为故事页绘制插图" : `桂小灵正在画第 ${pageNumber} 页`,
            detail: `第 ${pageNumber} 页插图马上就好啦。`,
            imageTasks: { ...current.imageTasks, [pageNumber]: "running" }
          }
        : current
    );

    const response = await fetch(`/api/picture-books/${bookId}/pages/${pageNumber}/image`, { method: "POST" });
    const data = (await response.json()) as { book?: PictureBook; error?: string };
    if (!response.ok || !data.book) {
      setGenerationProgress((current) =>
        current
          ? {
              ...current,
              imageTasks: { ...current.imageTasks, [pageNumber]: "error" }
            }
          : current
      );
      throw new Error(data.error || "插图暂时没画好");
    }

    setActiveBook((current) => mergePictureBook(current, data.book!));
    setGenerationProgress((current) =>
      current
        ? {
            ...current,
            detail: `第 ${pageNumber} 页插图已经放进绘本，桂小灵继续整理其他页面。`,
            imageTasks: { ...current.imageTasks, [pageNumber]: "done" }
          }
        : current
    );
    return data.book;
  }

  async function generatePageImage(pageNumber: number) {
    if (!activeBook) {
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(
      makeProgress("images", `桂小灵正在画第 ${pageNumber} 页`, `第 ${pageNumber} 页插图马上就好啦。`, {
        ...emptyImageTasks,
        [pageNumber]: "running"
      })
    );
    setNotice(`桂小灵正在为第 ${pageNumber} 页绘制插图`);
    try {
      await generateImageForBook(activeBook.id, pageNumber, "single");
      await refreshBooks();
      setGenerationProgress((current) =>
        current
          ? {
              ...current,
              active: false,
              stage: "archive",
              title: `第 ${pageNumber} 页插图已更新`,
              detail: "插图已保存到我的绘本书架，可以继续换其他页面。"
            }
          : current
      );
      setNotice("插图已更新");
    } catch (error) {
      const message = error instanceof Error ? error.message : "插图暂时没画好";
      setGenerationProgress((current) =>
        current
          ? {
              ...current,
              active: false,
              title: "这一页暂时没画好",
              detail: message,
              error: message
            }
          : current
      );
      setNotice(message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function deleteBook(id: string) {
    const response = await fetch(`/api/picture-books/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = (await response.json()) as { books?: PictureBookSummary[] };
    setBooks(data.books || []);
    if (activeBook?.id === id) {
      setActiveBook(null);
    }
    setGenerationProgress(null);
    setNotice("绘本已从书架移走");
  }

  function startListening() {
    if (!speechSupported || isGenerating) {
      setNotice("当前浏览器暂不支持语音输入，可以直接打字做绘本");
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;
        if (event.results[index].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      setIdea((finalText || interim).trim());
    };
    recognition.onerror = (event) => {
      setNotice(`语音识别遇到问题：${event.error}`);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setNotice("我在听，请说出你的广西非遗旅行故事灵感");
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
    setNotice("已收好声音灵感，可以开始做绘本");
  }

  const readText = activeBook ? buildReadText(activeBook) : "";

  if (route.mode === "player") {
    return <PictureBookPlayer book={activeBook?.id === route.bookId ? activeBook : null} />;
  }

  return (
    <main className="app-shell">
      <section className="studio-layout">
        <aside className="left-panel">
          <div className="brand-row">
            <span className="brand-mark" aria-hidden="true">
              <Sparkles size={18} />
            </span>
            <div>
              <p className="eyebrow">桂小灵的创作书桌</p>
              <h1>桂韵创想家 <span>和桂小灵一起发现广西故事</span></h1>
            </div>
          </div>

          <div className="mascot-stage">
            <img src={companionRobot} alt="桂小灵" />
            <div className="mascot-badge">
              <Bot size={16} />
              <span>{isGenerating ? "桂小灵正在整理故事页" : "桂小灵陪你做绘本"}</span>
            </div>
          </div>

          <form className="idea-box" onSubmit={generateBook}>
            <label htmlFor="idea">今天的故事灵感</label>
            <textarea
              id="idea"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              disabled={isGenerating}
              placeholder="写下你想去的地方、想看的非遗，或一个小小的故事开头……"
            />
            <div className="language-switch" aria-label="绘本语言">
              <span>绘本语言</span>
              <div>
                <button
                  type="button"
                  className={bookLanguage === "zh" ? "active" : ""}
                  onClick={() => setBookLanguage("zh")}
                  disabled={isGenerating}
                >
                  中文
                </button>
                <button
                  type="button"
                  className={bookLanguage === "en" ? "active" : ""}
                  onClick={() => setBookLanguage("en")}
                  disabled={isGenerating}
                >
                  English
                </button>
              </div>
            </div>
            <div className="language-switch" aria-label="主角角色">
              <span>主角小朋友</span>
              <div>
                <button
                  type="button"
                  className={protagonistGender === "girl" ? "active" : ""}
                  onClick={() => setProtagonistGender("girl")}
                  disabled={isGenerating}
                >
                  女孩
                </button>
                <button
                  type="button"
                  className={protagonistGender === "boy" ? "active" : ""}
                  onClick={() => setProtagonistGender("boy")}
                  disabled={isGenerating}
                >
                  男孩
                </button>
              </div>
            </div>
            <div className="composer-actions">
              <button
                className={`round-button ${isListening ? "active" : ""}`}
                type="button"
                onClick={isListening ? stopListening : startListening}
                aria-label={isListening ? "停止语音输入" : "开始语音输入"}
              >
                {isListening ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
              <label className="toggle-line">
                <input
                  type="checkbox"
                  checked={shouldGenerateImage}
                  onChange={(event) => setShouldGenerateImage(event.target.checked)}
                />
                一起画好 4 页插图
              </label>
              <button className="primary-button" type="submit" disabled={!idea.trim() || isGenerating}>
                {isGenerating ? <LoaderCircle size={18} /> : <Send size={18} />}
                {isGenerating ? "正在做绘本" : "开始做绘本"}
              </button>
            </div>
          </form>

          <div className="inspiration-list">
            <p className="eyebrow">灵感锦囊</p>
            <div>
              {inspirationChips.map((chip) => (
                <button type="button" key={chip} onClick={() => setIdea(chip)}>
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <div className="archive">
            <div className="section-heading">
              <div>
                <p className="eyebrow">我的绘本书架</p>
                <h2>我的绘本书架</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => {
                  setActiveBook(null);
                  setGenerationProgress(null);
                }}
                aria-label="新建作品"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="book-list">
              {books.length ? (
                books.map((book) => (
                  <article className={`book-list-item ${activeBook?.id === book.id ? "active" : ""}`} key={book.id}>
                    <button type="button" className="book-open" onClick={() => void openBook(book.id)}>
                      <BookOpen size={16} />
                      <span>
                        <strong>{softenDisplayText(book.title)}</strong>
                        <small>{formatDate(book.updatedAt)}</small>
                        <em>{book.heritageElements.concat(book.tourismElements).slice(0, 4).map(softenDisplayText).join(" · ")}</em>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => void deleteBook(book.id)}
                      aria-label={`删除作品：${book.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </article>
                ))
              ) : (
                <p className="empty-state">还没有绘本。做完第一本后会自动放进书架。</p>
              )}
            </div>
          </div>
        </aside>

        <section className="workbench" ref={workbenchRef}>
          <header className="topbar">
            <div>
              <p className="eyebrow">桂小灵绘本工坊</p>
              <h2>{activeBook ? softenDisplayText(activeBook.title) : "桂小灵的绘本工坊"}</h2>
            </div>
            <div className="topbar-actions">
              <button className="secondary-button" type="button" onClick={() => void speakWithBrowser(readText, activeBook?.language || "zh")} disabled={!activeBook}>
                <Volume2 size={18} />
                朗读绘本
              </button>
              {activeBook ? (
                <a className="primary-button" href={getPlayerHref(activeBook.id)} target="_blank" rel="noreferrer">
                  <ExternalLink size={18} />
                  打开故事书
                </a>
              ) : null}
              <button className="secondary-button" type="button" onClick={() => setActiveTab(activeTab === "book" ? "prompts" : "book")} disabled={!activeBook}>
                <FileText size={18} />
                {activeTab === "book" ? "创作记录" : "返回绘本"}
              </button>
            </div>
          </header>

          <div className="notice-line">
            <Sparkles size={16} />
            <span>{notice}</span>
          </div>

          <div className="workbench-body" ref={workbenchBodyRef}>
            {generationProgress ? <GenerationProgressPanel progress={generationProgress} /> : null}
            {generationProgress && activeBook && !generationProgress.active ? (
              <PostGenerateActions book={activeBook} onDismiss={() => setGenerationProgress(null)} />
            ) : null}
            {activeBook ? (
              activeTab === "book" ? (
                <BookView book={activeBook} onGenerateImage={generatePageImage} imageTasks={generationProgress?.imageTasks} />
              ) : (
                <PromptView records={activeBook.promptRecords} />
              )
            ) : generationProgress ? null : (
              <section className="empty-workbench">
                <Paintbrush size={42} />
                <h2>从一句灵感开始</h2>
                <p>输入或说出一个广西非遗旅行故事，桂小灵会帮你整理成 4 页绘本、插图和小小讲解词。</p>
              </section>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function getProgressPercent(progress: GenerationProgress) {
  if (!progress.active && !progress.error) {
    return 100;
  }
  if (progress.error) {
    return 100;
  }

  const stageIndex = progressStages.indexOf(progress.stage);
  const base = [10, 26, 44, 58, 92][stageIndex] || 10;
  if (progress.stage !== "images") {
    return base;
  }

  const tasks = Object.values(progress.imageTasks).filter((status) => status !== "idle");
  const completedCount = tasks.filter((status) => status === "done" || status === "error").length;
  const totalCount = Math.max(tasks.length, 4);
  return Math.min(92, 58 + Math.round((completedCount / totalCount) * 34));
}

function getStepState(stage: ProgressStage, progress: GenerationProgress) {
  const stepIndex = progressStages.indexOf(stage);
  const currentIndex = progressStages.indexOf(progress.stage);
  if (progress.error && stage === progress.stage) {
    return "error";
  }
  if (!progress.active && !progress.error) {
    return "done";
  }
  if (stepIndex < currentIndex) {
    return "done";
  }
  if (stepIndex === currentIndex) {
    return "active";
  }
  return "pending";
}

function getStepIcon(state: string) {
  if (state === "done") {
    return <CheckCircle2 size={16} />;
  }
  if (state === "error") {
    return <AlertCircle size={16} />;
  }
  if (state === "active") {
    return <LoaderCircle size={16} />;
  }
  return <span className="pending-dot" />;
}

function getImageTaskLabel(status: ImageTaskStatus) {
  if (status === "running") {
    return "绘制中";
  }
  if (status === "done") {
    return "已放入绘本";
  }
  if (status === "error") {
    return "可再画";
  }
  if (status === "queued") {
    return "等画纸";
  }
  return "待开始";
}

function getImageSourceLabel(page: PictureBookPage, taskStatus: ImageTaskStatus) {
  if (taskStatus === "running") {
    return "绘制中";
  }
  if (taskStatus === "error") {
    return "可再画";
  }
  return page.imageSource === "bailian" ? "绘本插图" : "示意插图";
}

function getCulturePanelCopy(language: BookLanguage) {
  if (language === "en") {
    return {
      title: "Culture Mini-Guide",
      subtitle: "Small discoveries pasted into the picture book",
      guideLabel: "Student Guide Script",
      noteLabel: "Page Notes"
    };
  }

  return {
    title: "广西文化小知识",
    subtitle: "贴在绘本里的非遗小发现",
    guideLabel: "小小文旅推荐官",
    noteLabel: "每页的小发现"
  };
}

function GenerationProgressPanel({ progress }: { progress: GenerationProgress }) {
  const percent = getProgressPercent(progress);
  const hasImageTasks = Object.values(progress.imageTasks).some((status) => status !== "idle");

  return (
    <section className={`progress-panel ${progress.error ? "has-error" : ""}`} aria-live="polite">
      <div className="progress-head">
        <div>
          <p className="eyebrow">绘本制作进度</p>
          <h3>{softenDisplayText(progress.title)}</h3>
          <p>{softenDisplayText(progress.detail)}</p>
        </div>
        <div className="progress-timer">
          <Clock size={18} />
          <span>陪伴 {progress.elapsedSeconds} 秒</span>
        </div>
      </div>

      <div className="progress-bar" aria-label={`当前进度 ${percent}%`}>
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="step-track">
        {progressStages.map((stage) => {
          const state = getStepState(stage, progress);
          return (
            <div className={`step-pill ${state}`} key={stage}>
              {getStepIcon(state)}
              <span>{stageLabels[stage]}</span>
            </div>
          );
        })}
      </div>

      {hasImageTasks ? (
        <div className="image-task-grid">
          {[1, 2, 3, 4].map((pageNumber) => {
            const status = progress.imageTasks[pageNumber] || "idle";
            return (
              <div className={`image-task ${status}`} key={pageNumber}>
                <strong>第 {pageNumber} 页</strong>
                <span>{getImageTaskLabel(status)}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function PostGenerateActions({ book, onDismiss }: { book: PictureBook; onDismiss: () => void }) {
  return (
    <section className="post-generate-actions">
      <div>
        <p className="eyebrow">绘本已经准备好啦</p>
        <h3>故事书已装订完成</h3>
        <p>可以继续慢慢读，也可以打开绘本剧场，适合比赛现场讲故事。</p>
      </div>
      <div>
        <button className="secondary-button" type="button" onClick={onDismiss}>
          <BookOpen size={18} />
          继续看这本书
        </button>
        <a className="primary-button" href={getPlayerHref(book.id)} target="_blank" rel="noreferrer">
          <ExternalLink size={18} />
          打开故事书
        </a>
      </div>
    </section>
  );
}

function PictureBookPlayer({ book }: { book: PictureBook | null }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [includeCultureNote, setIncludeCultureNote] = useState(true);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const autoPlayRef = useRef(false);

  useEffect(() => {
    setPageIndex(0);
  }, [book?.id]);

  useEffect(() => {
    return () => {
      autoPlayRef.current = false;
      window.speechSynthesis?.cancel();
    };
  }, []);

  if (!book) {
    return (
      <main className="player-shell">
        <section className="player-loading">
          <LoaderCircle className="loading-spinner" size={34} />
          <h1>正在打开绘本剧场</h1>
          <p>如果作品刚刚装订完成，请稍等片刻。</p>
          <a className="secondary-button" href="#/">
            <Home size={18} />
            返回书桌
          </a>
        </section>
      </main>
    );
  }

  const currentBook = book;
  const language = book.language || "zh";
  const pages = book.pages.length ? book.pages : [];
  const page = pages[Math.min(pageIndex, Math.max(pages.length - 1, 0))];
  const pageCount = pages.length;
  const currentPageNumber = page ? pageIndex + 1 : 0;

  async function playAllPages() {
    if (!pages.length || isAutoPlaying) {
      return;
    }

    autoPlayRef.current = true;
    setIsAutoPlaying(true);
    try {
      await speakWithBrowser(cleanSpeechPart(softenDisplayText(currentBook.title)), language);
      for (const [index, item] of pages.entries()) {
        if (!autoPlayRef.current) {
          break;
        }
        setPageIndex(index);
        await new Promise((resolve) => window.setTimeout(resolve, 260));
        await speakWithBrowser(buildPageReadText(currentBook, item, includeCultureNote), language);
        await new Promise((resolve) => window.setTimeout(resolve, 360));
      }
    } finally {
      autoPlayRef.current = false;
      setIsAutoPlaying(false);
    }
  }

  function stopAutoPlay() {
    autoPlayRef.current = false;
    setIsAutoPlaying(false);
    window.speechSynthesis?.cancel();
  }

  return (
    <main className="player-shell">
      <header className="player-header">
        <a className="secondary-button player-back-button" href="#/">
          <Home size={18} />
          返回书桌
        </a>
        <div>
          <p className="eyebrow">桂小灵绘本剧场</p>
          <h1>{softenDisplayText(book.title)}</h1>
          <p>{softenDisplayText(book.subtitle)}</p>
        </div>
        <div className="player-header-actions">
          <label className="player-knowledge-toggle">
            <input
              type="checkbox"
              checked={includeCultureNote}
              onChange={(event) => setIncludeCultureNote(event.target.checked)}
            />
            显示文化小贴士
          </label>
          <button className="primary-button player-read-button" type="button" onClick={isAutoPlaying ? stopAutoPlay : () => void playAllPages()}>
            <Volume2 size={18} />
            {isAutoPlaying ? "停一下" : "朗读全书"}
          </button>
        </div>
      </header>

      {page ? (
        <section className="player-stage">
          <div className="player-image">
            {page.imageUrl ? (
              <img src={page.imageUrl} alt={`${book.title} ${page.title}`} />
            ) : (
              <div className="player-image-empty">
                <Image size={46} />
                <span>这页插图还在等待绘制</span>
              </div>
            )}
          </div>
          <article className="player-copy">
            <p className="player-page-stamp">
              {language === "en" ? `Page ${currentPageNumber} of ${pageCount}` : `第 ${currentPageNumber} 页 · 共 ${pageCount} 页`}
            </p>
            <h2>{softenDisplayText(page.title)}</h2>
            <p>{softenDisplayText(page.text)}</p>
            {includeCultureNote ? (
              <div className="player-culture-note">
                <strong>{language === "en" ? "Gui Xiaoling's Little Discovery" : "桂小灵的小发现"}</strong>
                <span>{softenDisplayText(page.cultureNote)}</span>
              </div>
            ) : null}
            <div className="player-controls">
              <button className="secondary-button" type="button" onClick={() => setPageIndex((current) => Math.max(0, current - 1))} disabled={pageIndex === 0}>
                <ChevronLeft size={18} />
                上一页
              </button>
              <button className="secondary-button" type="button" onClick={() => void speakWithBrowser(buildPageReadText(book, page, includeCultureNote), language)}>
                <Volume2 size={18} />
                听这一页
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
                disabled={pageIndex >= pageCount - 1}
              >
                下一页
                <ChevronRight size={18} />
              </button>
            </div>
          </article>
        </section>
      ) : (
        <section className="player-loading">
          <Paintbrush size={38} />
          <h1>这本绘本还没有页面</h1>
          <p>请回到创作书桌重新整理故事。</p>
        </section>
      )}

      <nav className="player-page-dots" aria-label="绘本页码">
        <span>{language === "en" ? `Page ${currentPageNumber} of ${pageCount}` : `第 ${currentPageNumber} 页 · 共 ${pageCount} 页`}</span>
        <div>
          {pages.map((item, index) => (
            <button
              type="button"
              className={index === pageIndex ? "active" : ""}
              key={item.pageNumber}
              onClick={() => setPageIndex(index)}
              aria-label={language === "en" ? `Go to page ${index + 1}` : `翻到第 ${index + 1} 页`}
              title={language === "en" ? `Page ${index + 1}` : `第 ${index + 1} 页`}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

function BookView({
  book,
  onGenerateImage,
  imageTasks
}: {
  book: PictureBook;
  onGenerateImage: (pageNumber: number) => Promise<void>;
  imageTasks?: Record<number, ImageTaskStatus>;
}) {
  const language = book.language || "zh";
  const cultureCopy = getCulturePanelCopy(language);
  const cultureNotes = book.pages
    .map((page) => ({ pageNumber: page.pageNumber, text: softenDisplayText(page.cultureNote.trim()) }))
    .filter((item) => item.text);

  return (
    <div className="book-view">
      <section className="book-hero">
        <div>
          <p className="eyebrow">故事内容已整理</p>
          <h2>{softenDisplayText(book.title)}</h2>
          <p>{softenDisplayText(book.subtitle)}</p>
        </div>
        <div className="tag-cluster">
          {book.heritageElements.map((item) => (
            <span className="heritage-tag" key={item}>
              {softenDisplayText(item)}
            </span>
          ))}
          {book.tourismElements.map((item) => (
            <span className="tourism-tag" key={item}>
              {softenDisplayText(item)}
            </span>
          ))}
          <a className="player-inline-link" href={getPlayerHref(book.id)} target="_blank" rel="noreferrer">
            <ExternalLink size={15} />
            开始读绘本
          </a>
        </div>
      </section>

      <section className="guide-grid">
        <article>
          <h3>桂小灵的小问题</h3>
          <ul>
            {book.guidingQuestions.map((question) => (
              <li key={question}>{softenDisplayText(question)}</li>
            ))}
          </ul>
        </article>
        <article>
          <h3>我的故事路线</h3>
          <p>{softenDisplayText(book.outline)}</p>
        </article>
        <article>
          <h3>小小文旅推荐官</h3>
          <p>{softenDisplayText(book.tourGuideScript)}</p>
        </article>
      </section>

      <section className="culture-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{cultureCopy.subtitle}</p>
            <h3>{cultureCopy.title}</h3>
          </div>
        </div>
        <article className="culture-guide-card">
          <strong>{cultureCopy.guideLabel}</strong>
          <p>{softenDisplayText(book.tourGuideScript)}</p>
        </article>
        {cultureNotes.length ? (
          <div className="culture-note-list">
            <strong>{cultureCopy.noteLabel}</strong>
            {cultureNotes.map((item) => (
              <p key={item.pageNumber}>
                <span>{language === "en" ? `Page ${item.pageNumber}` : `第 ${item.pageNumber} 页`}</span>
                {item.text}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="page-grid">
        {book.pages.map((page) => {
          const taskStatus = imageTasks?.[page.pageNumber] || "idle";
          const imageButtonLabel =
            taskStatus === "running" ? "桂小灵在画" : page.imageUrl ? "换一张插图" : "补画这一页";
          return (
            <article className={`page-card ${taskStatus === "running" ? "is-drawing" : ""}`} key={page.pageNumber}>
              <div className="page-image">
                {page.imageUrl ? (
                  <img src={page.imageUrl} alt={`第 ${page.pageNumber} 页插图`} />
                ) : (
                  <div className="image-waiting">
                    {taskStatus === "running" ? <LoaderCircle size={34} /> : <Image size={34} />}
                    <span>{taskStatus === "running" ? "桂小灵正在画这一页……" : "这页还在等插图"}</span>
                  </div>
                )}
                <span>{getImageSourceLabel(page, taskStatus)}</span>
              </div>
              <div className="page-copy">
                <p className="eyebrow">第 {page.pageNumber} 页</p>
                <h3>{softenDisplayText(page.title)}</h3>
                <p>{softenDisplayText(page.text)}</p>
                <div className="culture-note">
                  <strong>小发现</strong>
                  <span>{softenDisplayText(page.cultureNote)}</span>
                </div>
                <button className="secondary-button" type="button" onClick={() => void onGenerateImage(page.pageNumber)} disabled={taskStatus === "running"}>
                  {taskStatus === "running" ? <LoaderCircle size={16} /> : <RefreshCw size={16} />}
                  {imageButtonLabel}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="reflection">
        <h3>我的创作小记</h3>
        <p>{softenDisplayText(book.studentReflection)}</p>
      </section>
    </div>
  );
}

function PromptView({ records }: { records: PromptRecord[] }) {
  return (
    <section className="prompt-view">
      <div className="section-heading">
        <div>
          <p className="eyebrow">灵感记录</p>
          <h2>这本书的创作记录</h2>
        </div>
      </div>
      {records.map((record) => (
        <article className="prompt-card" key={record.id}>
          <div>
            <span>{getRecordTypeLabel(record.type)}</span>
            <strong>{softenRecordText(record.label)}</strong>
            <small>{formatDate(record.createdAt)}</small>
          </div>
          <details>
            <summary>查看当时的灵感说明</summary>
            <p className="prompt-text">{softenRecordText(record.prompt)}</p>
          </details>
          <p className="prompt-output">{softenRecordText(record.output)}</p>
        </article>
      ))}
    </section>
  );
}
