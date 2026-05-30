import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock,
  FileText,
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
  heritageElements: string[];
  tourismElements: string[];
  coverImageUrl: string;
};

type BailianStatus = {
  configured: boolean;
  textModel: string;
  imageModel: string;
  imageSize: string;
};

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

const stageLabels: Record<ProgressStage, string> = {
  understanding: "理解灵感",
  story: "创编故事",
  prompts: "规划插图",
  images: "生成图片",
  archive: "保存作品"
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
  "会发光的壮锦带我去桂林山水",
  "德天瀑布边的小小文旅推荐官",
  "铜鼓机器人守护龙脊梯田",
  "北海银滩上的非遗集市",
  "刘三姐山歌变成了魔法地图"
];

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

function pickWarmChineseVoice(voices: SpeechSynthesisVoice[]) {
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
    .split(/(?<=[。！？!?])/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function speakWithBrowser(text: string) {
  if (!window.speechSynthesis) {
    return;
  }

  window.speechSynthesis.cancel();
  const voice = pickWarmChineseVoice(await getBrowserVoices());
  for (const [index, chunk] of splitSpeechText(text).entries()) {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = voice?.lang || "zh-CN";
    utterance.voice = voice;
    utterance.rate = 1.12;
    utterance.pitch = 1.03;
    window.speechSynthesis.speak(utterance);
    await new Promise<void>((resolve) => {
      utterance.onend = () => window.setTimeout(resolve, index < splitSpeechText(text).length - 1 ? 80 : 0);
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
  const [idea, setIdea] = useState("我想写一个小朋友在三月三歌圩上遇到会唱山歌的绣球。");
  const [books, setBooks] = useState<PictureBookSummary[]>([]);
  const [activeBook, setActiveBook] = useState<PictureBook | null>(null);
  const [notice, setNotice] = useState("说一句灵感，桂小灵会帮我创编广西非遗文旅绘本");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [shouldGenerateImage, setShouldGenerateImage] = useState(true);
  const [activeTab, setActiveTab] = useState<"book" | "prompts">("book");
  const [bailianStatus, setBailianStatus] = useState<BailianStatus | null>(null);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    void refreshBooks();
    fetch("/api/bailian/status")
      .then((response) => response.json())
      .then((data: BailianStatus) => setBailianStatus(data))
      .catch(() => setBailianStatus(null));
  }, []);

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

  async function refreshBooks() {
    const response = await fetch("/api/picture-books");
    const data = (await response.json()) as { books?: PictureBookSummary[] };
    setBooks(data.books || []);
    return data.books || [];
  }

  async function openBook(id: string) {
    const response = await fetch(`/api/picture-books/${encodeURIComponent(id)}`);
    const data = (await response.json()) as { book?: PictureBook; error?: string };
    if (!response.ok || !data.book) {
      throw new Error(data.error || "作品不存在");
    }
    setActiveBook(data.book);
    setActiveTab("book");
    setGenerationProgress(null);
    setNotice("已打开作品，可以继续生成插图或查看 Prompt 记录");
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
      makeProgress("understanding", "正在理解我的灵感", "桂小灵正在提取故事主角、广西非遗元素和文旅场景。")
    );
    setNotice("第 1 步：正在理解灵感，还没有开始生成图片");
    try {
      setGenerationProgress((current) =>
        current
          ? {
              ...current,
              stage: "story",
              title: "正在创编故事",
              detail: "正在调用百炼文本模型，生成标题、4 页故事、非遗小知识和小学生讲解词。"
            }
          : current
      );
      const response = await fetch("/api/picture-books/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: cleanIdea, generateImage: false })
      });
      const data = (await response.json()) as { book?: PictureBook; books?: PictureBookSummary[]; error?: string };
      if (!response.ok || !data.book) {
        throw new Error(data.error || "绘本生成失败");
      }
      setActiveBook(data.book);
      setBooks(data.books || []);
      setGenerationProgress((current) =>
        current
          ? {
              ...current,
              stage: shouldGenerateImage ? "prompts" : "archive",
              title: shouldGenerateImage ? "正在规划 4 页插图" : "正在保存故事作品",
              detail: shouldGenerateImage
                ? "故事骨架已经出现，正在把 4 页画面整理成连贯角色设定和图片 Prompt。"
                : "故事、Prompt 记录和创作档案正在保存。"
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
                title: "正在并行生成 4 页连贯插图",
                detail: "4 个图片任务已经同时发给百炼图片模型，回来一张就更新一页。",
                imageTasks: runningTasks
              }
            : current
        );
        setNotice("第 4 步：故事已生成，正在并行生成 4 页图片");

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
                title: failedCount ? "绘本已保存，部分图片可重试" : "绘本创编完成",
                detail: failedCount
                  ? `有 ${failedCount} 页图片请求没有成功，已保留故事和可重试按钮。`
                  : "4 页故事、连贯插图、非遗小知识和 Prompt 记录都已保存。",
                error: failedCount ? "部分图片生成失败" : undefined
              }
            : current
        );
        await refreshBooks();
        setNotice(failedCount ? "创编完成：部分图片可点击重试" : "创编完成：可以朗读、看插图，也可以查看 Prompt 记录");
      } else {
        setGenerationProgress((current) =>
          current
            ? {
                ...current,
                active: false,
                stage: "archive",
                title: "故事创编完成",
                detail: "已保存故事、非遗小知识和 Prompt 记录；需要插图时可以单页生成。"
              }
            : current
        );
        setNotice("故事创编完成：可以单页生成插图或查看 Prompt 记录");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "绘本生成失败";
      setGenerationProgress((current) =>
        current
          ? {
              ...current,
              active: false,
              title: "创编遇到问题",
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
            title: mode === "batch" ? "正在并行生成 4 页连贯插图" : `正在生成第 ${pageNumber} 页插图`,
            detail: `第 ${pageNumber} 页正在调用百炼图片模型。`,
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
      throw new Error(data.error || "插图生成失败");
    }

    setActiveBook((current) => mergePictureBook(current, data.book!));
    setGenerationProgress((current) =>
      current
        ? {
            ...current,
            detail: `第 ${pageNumber} 页插图已返回，正在继续等待其他页面。`,
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
      makeProgress("images", `正在生成第 ${pageNumber} 页插图`, `第 ${pageNumber} 页正在调用百炼图片模型。`, {
        ...emptyImageTasks,
        [pageNumber]: "running"
      })
    );
    setNotice(`正在为第 ${pageNumber} 页生成插图`);
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
              detail: "图片已保存到创编档案馆，可以继续重绘其他页面。"
            }
          : current
      );
      setNotice("插图已更新");
    } catch (error) {
      const message = error instanceof Error ? error.message : "插图生成失败";
      setGenerationProgress((current) =>
        current
          ? {
              ...current,
              active: false,
              title: "插图生成遇到问题",
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
    setNotice("作品已删除");
  }

  function startListening() {
    if (!speechSupported || isGenerating) {
      setNotice("当前浏览器暂不支持语音识别，可以直接打字创编");
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
    setNotice("我在听，请说出你的广西非遗文旅故事灵感");
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
    setNotice("已停止语音输入，可以点击生成绘本");
  }

  const readText = activeBook
    ? [activeBook.title, ...activeBook.pages.map((page) => `第${page.pageNumber}页，${page.text}`), activeBook.tourGuideScript].join("。")
    : "";

  return (
    <main className="app-shell">
      <section className="studio-layout">
        <aside className="left-panel">
          <div className="brand-row">
            <span className="brand-mark" aria-hidden="true">
              <Sparkles size={18} />
            </span>
            <div>
              <p className="eyebrow">广西非遗文旅绘本</p>
              <h1>桂韵创想家</h1>
              <p className="subtitle">用 AI 创编广西非遗文旅绘本</p>
            </div>
          </div>

          <div className="mascot-stage">
            <img src={companionRobot} alt="桂小灵" />
            <div className="mascot-badge">
              <Bot size={16} />
              <span>{isGenerating ? "桂小灵创编中" : "桂小灵在这里"}</span>
            </div>
          </div>

          <div className={`model-status ${bailianStatus?.configured ? "ready" : "missing"}`}>
            <strong>{bailianStatus?.configured ? "百炼正式模型已启用" : "未配置百炼 Key"}</strong>
            <span>文本：{bailianStatus?.textModel || "qwen3.7-max"}</span>
            <span>图片：{bailianStatus?.imageModel || "wan2.7-image-pro"} · {bailianStatus?.imageSize || "2K"}</span>
          </div>

          <form className="idea-box" onSubmit={generateBook}>
            <label htmlFor="idea">我的创编灵感</label>
            <textarea
              id="idea"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              disabled={isGenerating}
              placeholder="说一句：我想写一个小朋友在三月三歌圩上遇到会唱山歌的绣球。"
            />
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
                并行生成 4 页插图
              </label>
              <button className="primary-button" type="submit" disabled={!idea.trim() || isGenerating}>
                {isGenerating ? <LoaderCircle size={18} /> : <Send size={18} />}
                桂小灵创编绘本
              </button>
            </div>
          </form>

          <div className="inspiration-list">
            <p className="eyebrow">灵感提示</p>
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
                <p className="eyebrow">创编档案馆</p>
                <h2>我的作品</h2>
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
                        <strong>{book.title}</strong>
                        <small>{formatDate(book.updatedAt)}</small>
                        <em>{book.heritageElements.concat(book.tourismElements).slice(0, 4).join(" · ")}</em>
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
                <p className="empty-state">还没有作品。生成第一本绘本后会自动保存。</p>
              )}
            </div>
          </div>
        </aside>

        <section className="workbench">
          <header className="topbar">
            <div>
              <p className="eyebrow">广西非遗 · 文旅 · 学生创编能力</p>
              <h2>{activeBook?.title || "创编工作台"}</h2>
            </div>
            <div className="topbar-actions">
              <button className="secondary-button" type="button" onClick={() => void speakWithBrowser(readText)} disabled={!activeBook}>
                <Volume2 size={18} />
                朗读绘本
              </button>
              <button className="secondary-button" type="button" onClick={() => setActiveTab(activeTab === "book" ? "prompts" : "book")} disabled={!activeBook}>
                <FileText size={18} />
                {activeTab === "book" ? "Prompt 记录" : "返回绘本"}
              </button>
            </div>
          </header>

          <div className="notice-line">
            <Sparkles size={16} />
            <span>{notice}</span>
          </div>

          <div className="workbench-body">
            {generationProgress ? <GenerationProgressPanel progress={generationProgress} /> : null}
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
                <p>输入或说出一个广西非遗文旅故事，桂小灵会帮我生成 4 页绘本、连贯插图 Prompt、非遗小知识和小学生讲解词。</p>
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
    return "生成中";
  }
  if (status === "done") {
    return "已完成";
  }
  if (status === "error") {
    return "可重试";
  }
  if (status === "queued") {
    return "排队中";
  }
  return "未开始";
}

function getImageSourceLabel(page: PictureBookPage, taskStatus: ImageTaskStatus) {
  if (taskStatus === "running") {
    return "生成中";
  }
  if (taskStatus === "error") {
    return "可重试";
  }
  return page.imageSource === "bailian" ? "百炼图片" : "演示插图";
}

function GenerationProgressPanel({ progress }: { progress: GenerationProgress }) {
  const percent = getProgressPercent(progress);

  return (
    <section className={`progress-panel ${progress.error ? "has-error" : ""}`} aria-live="polite">
      <div className="progress-head">
        <div>
          <p className="eyebrow">创编进度</p>
          <h3>{progress.title}</h3>
          <p>{progress.detail}</p>
        </div>
        <div className="progress-timer">
          <Clock size={18} />
          <span>已用 {progress.elapsedSeconds} 秒</span>
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
    </section>
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
  return (
    <div className="book-view">
      <section className="book-hero">
        <div>
          <p className="eyebrow">AI 生成内容约 {book.aiContentRatio}%</p>
          <h2>{book.title}</h2>
          <p>{book.subtitle}</p>
        </div>
        <div className="tag-cluster">
          {book.heritageElements.map((item) => (
            <span className="heritage-tag" key={item}>
              {item}
            </span>
          ))}
          {book.tourismElements.map((item) => (
            <span className="tourism-tag" key={item}>
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="guide-grid">
        <article>
          <h3>AI 追问我的创编问题</h3>
          <ul>
            {book.guidingQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </article>
        <article>
          <h3>故事大纲</h3>
          <p>{book.outline}</p>
        </article>
        <article>
          <h3>小小文旅推荐官</h3>
          <p>{book.tourGuideScript}</p>
        </article>
      </section>

      <section className="page-grid">
        {book.pages.map((page) => {
          const taskStatus = imageTasks?.[page.pageNumber] || "idle";
          return (
            <article className={`page-card ${taskStatus === "running" ? "is-drawing" : ""}`} key={page.pageNumber}>
              <div className="page-image">
                {page.imageUrl ? (
                  <img src={page.imageUrl} alt={`第 ${page.pageNumber} 页插图`} />
                ) : (
                  <div className="image-waiting">
                    {taskStatus === "running" ? <LoaderCircle size={34} /> : <Image size={34} />}
                    <span>{taskStatus === "running" ? "正在生成本页图片" : "等待生成插图"}</span>
                  </div>
                )}
                <span>{getImageSourceLabel(page, taskStatus)}</span>
              </div>
              <div className="page-copy">
                <p className="eyebrow">第 {page.pageNumber} 页</p>
                <h3>{page.title}</h3>
                <p>{page.text}</p>
                <div className="culture-note">
                  <strong>非遗小知识</strong>
                  <span>{page.cultureNote}</span>
                </div>
                <button className="secondary-button" type="button" onClick={() => void onGenerateImage(page.pageNumber)} disabled={taskStatus === "running"}>
                  {taskStatus === "running" ? <LoaderCircle size={16} /> : <RefreshCw size={16} />}
                  {taskStatus === "running" ? "正在生成" : "生成本页插图"}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="reflection">
        <h3>我的创作反思</h3>
        <p>{book.studentReflection}</p>
      </section>
    </div>
  );
}

function PromptView({ records }: { records: PromptRecord[] }) {
  return (
    <section className="prompt-view">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Prompt 记录</p>
          <h2>我的 AI 创作过程</h2>
        </div>
      </div>
      {records.map((record) => (
        <article className="prompt-card" key={record.id}>
          <div>
            <span>{record.type}</span>
            <strong>{record.label}</strong>
            <small>{formatDate(record.createdAt)}</small>
          </div>
          <p className="prompt-text">{record.prompt}</p>
          <p className="prompt-output">{record.output}</p>
        </article>
      ))}
    </section>
  );
}
