import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Home,
  Image as ImageIcon,
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
import companionRobot from "../assets/companion-robot.png";
import {
  createPictureBookDraft,
  deletePictureBook,
  generatePictureBookPageImage,
  getPictureBook,
  listPictureBooks,
  preloadPictureBookSpeech
} from "./pictureBookApi";
import { companionName, companionSchool, displayBook, displayBookSummary, displayText, productTitle } from "./productCopy";
import { speakProductText, stopProductSpeech } from "./productSpeech";
import type { BookLanguage, PictureBook, PictureBookPage, PictureBookSummary, PromptRecord, ProtagonistGender } from "./types";

type ProductView = "shelf" | "reader" | "records" | "theater";
type ImageTaskStatus = "idle" | "running" | "done" | "error";
type ProductStage = "input" | "analysis" | "content" | "images" | "saved";

type ProductProgress = {
  active: boolean;
  startedAt: number;
  elapsedSeconds: number;
  stage: ProductStage;
  title: string;
  detail: string;
  imageTasks: Record<number, ImageTaskStatus>;
  logs: string[];
  error?: string;
};

const defaultIdea = "我想做一本我在桂林漓江边遇见壮锦和山歌的绘本。";

const defaultInspirationChips = [
  "小壮壮的漓江之旅",
  "三月三的歌圩和绣球",
  "龙脊梯田里的五色糯米饭",
  "北海银滩上的贝雕剧场",
  "三江风雨桥边的侗族大歌",
  "德天瀑布旁的天琴故事"
];

const flowSteps = [
  { number: 1, title: "灵感输入", detail: "语音或文字" },
  { number: 2, title: "AI 灵感分析", detail: "地点、人物、文化元素" },
  { number: 3, title: "AI 生成绘本内容", detail: "故事、小百科、讲解词" },
  { number: 4, title: "生成插图 & 保存", detail: "4 页插图入库" },
  { number: 5, title: productTitle, detail: "我的作品书架" },
  { number: 6, title: "打开绘本", detail: "故事、插图、小百科" },
  { number: 7, title: "查看创作记录", detail: "灵感与生成过程" },
  { number: 8, title: "进入绘本剧场", detail: "中文或 English 朗读" },
  { number: 9, title: "展示 / 阅读", detail: "比赛展示或自己阅读" }
];

const stageStepMap: Record<ProductStage, number> = {
  input: 1,
  analysis: 2,
  content: 3,
  images: 4,
  saved: 5
};

const viewStepMap: Record<ProductView, number> = {
  shelf: 5,
  reader: 6,
  records: 7,
  theater: 8
};

const emptyImageTasks: Record<number, ImageTaskStatus> = {
  1: "idle",
  2: "idle",
  3: "idle",
  4: "idle"
};

function formatShelfDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function formatRecordTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function compactText(text = "", maxLength = 72) {
  const clean = text.replace(/\s+/gu, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

function getRecordTypeLabel(type: PromptRecord["type"]) {
  const labels: Record<PromptRecord["type"], string> = {
    story: "故事整理",
    image: "插图灵感",
    culture: "文化小百科",
    system: "系统记录"
  };
  return labels[type];
}

function cleanSpeechPart(text = "") {
  return text
    .replace(/第\s*\d+\s*页[，,：:\s]*/gu, "")
    .replace(/[·•]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[。！？!?.,，、；;：:]+$/gu, "");
}

function buildFullReadText(book: PictureBook) {
  const language = book.language || "zh";
  const parts = [book.title, ...book.pages.map((page) => page.text), book.tourGuideScript]
    .map(cleanSpeechPart)
    .filter(Boolean);
  const separator = language === "en" ? ". " : "。";
  const endMark = language === "en" ? "." : "。";
  return `${parts.join(separator)}${endMark}`;
}

function buildPageReadText(book: PictureBook, page: PictureBookPage, includeCultureNote = true) {
  const language = book.language || "zh";
  const parts = [page.title, page.text, includeCultureNote ? page.cultureNote : ""]
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
      return {
        ...page,
        imageUrl: page.imageUrl || currentPage?.imageUrl || "",
        imageSource: page.imageUrl ? page.imageSource : currentPage?.imageSource || page.imageSource,
        speechAudioText: page.speechAudioText || currentPage?.speechAudioText,
        speechAudioUrl: page.speechAudioUrl || currentPage?.speechAudioUrl
      };
    }),
    promptRecords: [...mergedRecords.values()]
  };
}

function makeProgress(stage: ProductStage, title: string, detail: string, logs: string[] = []): ProductProgress {
  return {
    active: true,
    startedAt: Date.now(),
    elapsedSeconds: 0,
    stage,
    title,
    detail,
    imageTasks: { ...emptyImageTasks },
    logs
  };
}

function appendProgressLog(progress: ProductProgress, lines: string[]) {
  const nextLogs = [...progress.logs];
  lines.map((line) => line.trim()).filter(Boolean).forEach((line) => {
    if (!nextLogs.includes(line)) {
      nextLogs.push(line);
    }
  });
  return {
    ...progress,
    logs: nextLogs.slice(-16)
  };
}

export default function ProductShelfApp() {
  const [books, setBooks] = useState<PictureBookSummary[]>([]);
  const [activeBook, setActiveBook] = useState<PictureBook | null>(null);
  const [view, setView] = useState<ProductView>("shelf");
  const [idea, setIdea] = useState(defaultIdea);
  const [bookLanguage, setBookLanguage] = useState<BookLanguage>("zh");
  const [protagonistGender, setProtagonistGender] = useState<ProtagonistGender>("girl");
  const [shouldGenerateImage, setShouldGenerateImage] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [notice, setNotice] = useState(`默认进入${productTitle}，${companionName}陪我继续阅读、朗读和展示。`);
  const [progress, setProgress] = useState<ProductProgress | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PictureBookSummary | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const creationPanelRef = useRef<HTMLDivElement | null>(null);
  const ideaInputRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const displayBooks = useMemo(() => books.map(displayBookSummary), [books]);
  const displayActiveBook = useMemo(() => (activeBook ? displayBook(activeBook) : null), [activeBook]);
  const selectedPageIndex = displayActiveBook ? Math.min(pageIndex, Math.max(displayActiveBook.pages.length - 1, 0)) : 0;
  const rawSelectedPage = activeBook?.pages[selectedPageIndex] || null;
  const selectedPage = displayActiveBook?.pages[selectedPageIndex] || null;
  const readAllText = useMemo(() => (displayActiveBook ? buildFullReadText(displayActiveBook) : ""), [displayActiveBook]);
  const latestBook = books[0] || null;
  const activeStep = progress?.active ? stageStepMap[progress.stage] : viewStepMap[view];

  useEffect(() => {
    document.title = productTitle;
    void refreshBooks({ selectLatest: true });
    return () => stopProductSpeech();
  }, []);

  useEffect(() => {
    setPageIndex(0);
  }, [activeBook?.id]);

  useEffect(() => {
    if (!progress?.active) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setProgress((current) =>
        current?.active
          ? {
              ...current,
              elapsedSeconds: Math.max(0, Math.floor((Date.now() - current.startedAt) / 1000))
            }
          : current
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [progress?.active]);

  async function refreshBooks(options?: { selectLatest?: boolean; silent?: boolean }) {
    try {
      const nextBooks = await listPictureBooks();
      setBooks(nextBooks);
      if (options?.selectLatest && nextBooks[0]) {
        void openBook(nextBooks[0].id, { silent: true, nextView: "shelf" });
      }
      return nextBooks;
    } catch (error) {
      const message = error instanceof Error ? error.message : "书架刷新失败";
      if (!options?.silent) {
        setNotice(`书架刷新失败：${message}`);
      }
      return books;
    }
  }

  async function openBook(id: string, options?: { silent?: boolean; nextView?: ProductView }) {
    try {
      const book = await getPictureBook(id);
      setActiveBook(book);
      setView(options?.nextView || "reader");
      setProgress(null);
      if (!options?.silent) {
        setNotice("绘本已经打开，可以查看故事、小百科、创作记录或进入绘本剧场。");
      }
      if ((book.language || "zh") === "zh" && book.pages.some((page) => !page.speechAudioUrl)) {
        void preloadSpeech(book.id);
      }
      return book;
    } catch (error) {
      const message = error instanceof Error ? error.message : "绘本打开失败";
      setNotice(`绘本打开失败：${message}`);
      return null;
    }
  }

  async function preloadSpeech(bookId: string) {
    try {
      const data = await preloadPictureBookSpeech(bookId);
      if (data.book) {
        setActiveBook((current) => mergePictureBook(current, data.book!));
      }
      if (data.books.length) {
        setBooks(data.books);
      }
    } catch {
      // 朗读预加载失败时仍然保留绘本阅读能力。
    }
  }

  function startNewBook() {
    setView("shelf");
    setProgress(null);
    setIdea("");
    setNotice(`可以输入新的故事灵感，作品完成后会自动回到${productTitle}。`);
    creationPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => ideaInputRef.current?.focus(), 260);
  }

  function pickIdea(chip: string) {
    setIdea(chip);
    setNotice("灵感已经放到新建绘本里，可以直接开始创作。");
    creationPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function generateBook(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const cleanIdea = idea.trim();
    if (!cleanIdea || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setView("shelf");
    setActiveBook(null);
    setProgress(makeProgress("analysis", "AI 正在分析灵感", "正在提取地点、主角、广西文化元素和故事动作。", [`收到灵感：${compactText(cleanIdea, 80)}`]));
    setNotice(`${companionName}正在分析灵感，稍后会生成绘本内容。`);

    try {
      setProgress((current) =>
        current
          ? appendProgressLog(
              {
                ...current,
                stage: "content",
                title: "AI 正在生成绘本内容",
                detail: "正在整理标题、4 页故事、小百科、讲解词和插图提示。"
              },
              ["开始生成标题、故事、讲解词和图片 Prompt。"]
            )
          : current
      );

      const draft = await createPictureBookDraft({
        idea: cleanIdea,
        language: bookLanguage,
        protagonistGender
      });
      setActiveBook(draft.book);
      setBooks(draft.books);
      setPageIndex(0);
      setView("reader");

      setProgress((current) =>
        current
          ? appendProgressLog(
              {
                ...current,
                stage: shouldGenerateImage ? "images" : "saved",
                title: shouldGenerateImage ? "正在生成 4 页插图" : "正在保存到绘本书架",
                detail: shouldGenerateImage ? "绘本内容已完成，正在把每一页画成插图。" : "故事、小百科和创作记录正在保存。"
              },
              [
                `标题：${compactText(draft.book.title, 60)}`,
                `故事路线：${compactText(draft.book.outline, 88)}`,
                shouldGenerateImage ? "4 页插图任务已经开始。" : `作品准备放入${productTitle}。`
              ]
            )
          : current
      );

      if (shouldGenerateImage) {
        const runningTasks = draft.book.pages.reduce<Record<number, ImageTaskStatus>>(
          (tasks, page) => ({ ...tasks, [page.pageNumber]: "running" }),
          { ...emptyImageTasks }
        );
        setProgress((current) =>
          current
            ? {
                ...current,
                imageTasks: runningTasks
              }
            : current
        );

        const imageResults = await Promise.allSettled(
          draft.book.pages.map(async (page) => {
            try {
              const book = await generatePictureBookPageImage(draft.book.id, page.pageNumber);
              setActiveBook((current) => mergePictureBook(current, book));
              setProgress((current) =>
                current
                  ? appendProgressLog(
                      {
                        ...current,
                        imageTasks: { ...current.imageTasks, [page.pageNumber]: "done" }
                      },
                      [`第 ${page.pageNumber} 页插图已保存。`]
                    )
                  : current
              );
              return book;
            } catch (error) {
              setProgress((current) =>
                current
                  ? appendProgressLog(
                      {
                        ...current,
                        imageTasks: { ...current.imageTasks, [page.pageNumber]: "error" }
                      },
                      [`第 ${page.pageNumber} 页插图暂时失败，可稍后重画。`]
                    )
                  : current
              );
              throw error;
            }
          })
        );

        if (bookLanguage === "zh") {
          void preloadSpeech(draft.book.id);
        }

        const failedCount = imageResults.filter((result) => result.status === "rejected").length;
        setProgress((current) =>
          current
            ? appendProgressLog(
                {
                  ...current,
                  active: false,
                  stage: "saved",
                  title: failedCount ? "绘本已保存，部分插图可重画" : "绘本已保存到书架",
                  detail: failedCount ? `有 ${failedCount} 页插图暂时没画好，作品已先入库。` : "4 页故事、插图、小百科和创作记录都已保存。",
                  error: failedCount ? "部分插图生成失败" : undefined
                },
                [failedCount ? "绘本已进入书架，失败插图可以在打开绘本后重画。" : `绘本已进入${productTitle}。`]
              )
            : current
        );
        await refreshBooks();
        setNotice(failedCount ? "绘本已保存，有几页插图可以继续重画。" : `绘本已保存到${productTitle}。`);
      } else {
        if (bookLanguage === "zh") {
          void preloadSpeech(draft.book.id);
        }
        setProgress((current) =>
          current
            ? appendProgressLog(
                {
                  ...current,
                  active: false,
                  stage: "saved",
                  title: "绘本已保存到书架",
                  detail: "故事、小百科和创作记录已保存，插图可以稍后补画。"
                },
                [`绘本已进入${productTitle}。`]
              )
            : current
        );
        await refreshBooks();
        setNotice(`绘本已保存到${productTitle}，可以打开继续补画插图。`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "绘本制作失败";
      setProgress((current) =>
        current
          ? appendProgressLog(
              {
                ...current,
                active: false,
                title: "创作遇到问题",
                detail: message,
                error: message
              },
              [`遇到问题：${message}`]
            )
          : current
      );
      setNotice(message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function regeneratePageImage(pageNumber: number) {
    if (!activeBook || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setProgress({
      ...makeProgress("images", `正在重画第 ${pageNumber} 页`, "插图完成后会自动回到这本绘本。", [`第 ${pageNumber} 页开始重画。`]),
      imageTasks: { ...emptyImageTasks, [pageNumber]: "running" }
    });
    try {
      const nextBook = await generatePictureBookPageImage(activeBook.id, pageNumber);
      setActiveBook((current) => mergePictureBook(current, nextBook));
      await refreshBooks();
      setProgress((current) =>
        current
          ? appendProgressLog(
              {
                ...current,
                active: false,
                stage: "saved",
                title: `第 ${pageNumber} 页插图已更新`,
                detail: "新插图已经保存到书架里的绘本。",
                imageTasks: { ...current.imageTasks, [pageNumber]: "done" }
              },
              [`第 ${pageNumber} 页插图已更新。`]
            )
          : current
      );
      setNotice(`第 ${pageNumber} 页插图已更新。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "插图暂时没画好";
      setProgress((current) =>
        current
          ? appendProgressLog(
              {
                ...current,
                active: false,
                detail: message,
                error: message,
                imageTasks: { ...current.imageTasks, [pageNumber]: "error" }
              },
              [`第 ${pageNumber} 页重画失败：${message}`]
            )
          : current
      );
      setNotice(message);
    } finally {
      setIsGenerating(false);
    }
  }

  function requestDeleteBook(book: PictureBookSummary) {
    setDeleteTarget(book);
    setNotice(`请确认是否删除《${displayText(book.title)}》。`);
  }

  async function confirmDeleteBook() {
    if (!deleteTarget) {
      return;
    }

    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      const nextBooks = await deletePictureBook(target.id);
      setBooks(nextBooks);
      if (activeBook?.id === target.id) {
        const nextActiveBook = nextBooks[0];
        setActiveBook(null);
        setView("shelf");
        if (nextActiveBook) {
          void openBook(nextActiveBook.id, { silent: true, nextView: "shelf" });
        }
      }
      setProgress(null);
      setNotice(`《${displayText(target.title)}》已从${productTitle}移走。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除失败";
      setNotice(`删除失败：${message}`);
    }
  }

  function startListening() {
    if (!speechSupported || isGenerating) {
      setNotice("当前浏览器暂不支持语音输入，可以直接输入文字灵感。");
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
    try {
      recognition.start();
      setIsListening(true);
      setNotice("我在听，请说出你的绘本灵感。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "语音输入启动失败";
      setIsListening(false);
      setNotice(`语音输入启动失败：${message}。可以直接输入文字灵感。`);
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
    setNotice("声音灵感已经收好，可以开始生成绘本。");
  }

  function goToPage(nextIndex: number) {
    stopProductSpeech();
    if (!activeBook) {
      return;
    }
    setPageIndex(Math.min(activeBook.pages.length - 1, Math.max(0, nextIndex)));
  }

  function readCurrentPage(languageOverride?: BookLanguage) {
    if (!activeBook || !selectedPage) {
      return;
    }
    const language = languageOverride || activeBook.language || "zh";
    const rawPageReadText = rawSelectedPage ? buildPageReadText(activeBook, rawSelectedPage, true) : "";
    const shouldReuseAudio = language === "zh" && rawPageReadText === displayText(rawPageReadText);
    void speakProductText(
      buildPageReadText(activeBook, selectedPage, true),
      language,
      activeBook.protagonistGender || "girl",
      shouldReuseAudio ? selectedPage.speechAudioUrl : undefined
    ).catch(() => setNotice("朗读暂时没有播放成功，可以再点一次试试。"));
  }

  function readFullBook() {
    if (!activeBook || !readAllText) {
      return;
    }
    void speakProductText(readAllText, activeBook.language || "zh", activeBook.protagonistGender || "girl").catch(() =>
      setNotice("朗读暂时没有播放成功，可以再点一次试试。")
    );
  }

  return (
    <main className="shelf-app">
      <header className="product-header">
        <div className="product-brand">
          <span className="product-brand-mark" aria-hidden="true">
            <BookOpen size={24} />
          </span>
          <div>
            <p className="product-eyebrow">桂韵创想家 · {companionSchool}</p>
            <h1>{productTitle}</h1>
            <span>{companionName}代表{companionSchool}，陪我完成灵感分析、绘本生成、插图保存和比赛展示。</span>
          </div>
        </div>
        <nav className="product-nav" aria-label="绘本产品导航">
          <button type="button" className={view === "shelf" ? "active" : ""} onClick={() => setView("shelf")}>
            <Home size={17} />
            我的书架
          </button>
          <button type="button" className={view === "reader" ? "active" : ""} onClick={() => setView("reader")} disabled={!activeBook}>
            <BookOpen size={17} />
            打开绘本
          </button>
          <button type="button" className={view === "records" ? "active" : ""} onClick={() => setView("records")} disabled={!activeBook}>
            <FileText size={17} />
            创作记录
          </button>
          <button type="button" className={view === "theater" ? "active" : ""} onClick={() => setView("theater")} disabled={!activeBook}>
            <Volume2 size={17} />
            绘本剧场
          </button>
        </nav>
      </header>

      <section className="product-notice" aria-live="polite">
        <Sparkles size={18} />
        <span>{notice}</span>
        <a href="#/classic">保留原界面</a>
      </section>

      <ProductFlow activeStep={activeStep} progress={progress} />

      <section className="product-shelf-grid">
        <div className="bookshelf-panel">
          <div className="product-section-head">
            <div>
              <p className="product-eyebrow">默认进入</p>
              <h2>{productTitle}</h2>
              <span>{books.length ? `已保存 ${books.length} 本作品，最近更新：${latestBook ? formatShelfDate(latestBook.updatedAt) : "暂无"}` : "还没有作品，先新建第一本绘本。"}</span>
            </div>
            <div className="section-actions">
              <button className="soft-button" type="button" onClick={() => void refreshBooks()}>
                <RefreshCw size={17} />
                刷新
              </button>
              <button className="strong-button" type="button" onClick={startNewBook}>
                <Plus size={17} />
                新建绘本
              </button>
            </div>
          </div>

          {books.length ? (
            <div className="cover-grid">
              {books.map((book, index) => {
                const displaySummary = displayBooks[index] || displayBookSummary(book);
                return (
                <article className={`cover-card ${activeBook?.id === book.id ? "active" : ""}`} key={book.id}>
                  <button type="button" className="cover-open" onClick={() => void openBook(book.id, { nextView: "reader" })}>
                    <div className="cover-art">
                      {book.coverImageUrl ? <img src={book.coverImageUrl} alt={displaySummary.title} /> : <ImageIcon size={34} />}
                    </div>
                    <div className="cover-copy">
                      <strong>{displaySummary.title}</strong>
                      <span>{formatShelfDate(book.updatedAt)}</span>
                      <p>{book.heritageElements.concat(book.tourismElements).slice(0, 3).join(" · ") || displaySummary.subtitle}</p>
                    </div>
                  </button>
                  <button className="cover-delete" type="button" onClick={() => requestDeleteBook(book)} aria-label={`删除${displaySummary.title}`}>
                    <Trash2 size={16} />
                  </button>
                </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-bookshelf">
              <BookOpen size={40} />
              <h3>{productTitle}还在等第一本作品</h3>
              <p>输入一个广西文化旅行灵感，生成后会自动保存到这里。</p>
            </div>
          )}
        </div>

        <aside className="creation-panel" ref={creationPanelRef}>
          <div className="assistant-card">
            <img src={companionRobot} alt={companionName} />
            <div>
              <p className="product-eyebrow">{companionName}</p>
              <strong>{isGenerating ? "正在整理新绘本" : `${companionSchool} AI 伙伴`}</strong>
            </div>
          </div>

          <form className="inspiration-form" onSubmit={generateBook}>
            <div className="form-head">
              <span>1</span>
              <div>
                <h2>灵感输入</h2>
                <p>输入灵感语音或文字</p>
              </div>
            </div>
            <textarea
              ref={ideaInputRef}
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              disabled={isGenerating}
              placeholder="例如：我想写一本我在漓江竹筏上发现壮锦花纹的故事……"
            />
            <div className="segmented-stack">
              <SegmentedControl
                label="绘本语言"
                options={[
                  { label: "中文", value: "zh" },
                  { label: "English", value: "en" }
                ]}
                value={bookLanguage}
                disabled={isGenerating}
                onChange={(value) => setBookLanguage(value as BookLanguage)}
              />
              <SegmentedControl
                label="主角形象"
                options={[
                  { label: "女孩主角", value: "girl" },
                  { label: "男孩主角", value: "boy" }
                ]}
                value={protagonistGender}
                disabled={isGenerating}
                onChange={(value) => setProtagonistGender(value as ProtagonistGender)}
              />
            </div>
            <div className="creation-actions">
              <button
                className={`round-tool ${isListening ? "active" : ""}`}
                type="button"
                onClick={isListening ? stopListening : startListening}
                aria-label={isListening ? "停止语音输入" : "开始语音输入"}
              >
                {isListening ? <MicOff size={21} /> : <Mic size={21} />}
              </button>
              <label className="check-tool">
                <input
                  type="checkbox"
                  checked={shouldGenerateImage}
                  onChange={(event) => setShouldGenerateImage(event.target.checked)}
                  disabled={isGenerating}
                />
                生成 4 页插图
              </label>
              <button className="strong-button submit-book" type="submit" disabled={!idea.trim() || isGenerating}>
                {isGenerating ? <LoaderCircle size={18} /> : <Send size={18} />}
                {isGenerating ? "生成中" : "生成绘本"}
              </button>
            </div>
          </form>

          <div className="idea-chip-panel">
            <div className="mini-head">
              <p className="product-eyebrow">灵感样例</p>
              <span>点击填入</span>
            </div>
            <div className="idea-chips">
              {defaultInspirationChips.map((chip) => (
                <button type="button" key={chip} onClick={() => pickIdea(chip)} disabled={isGenerating}>
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {progress ? <ProductProgressPanel progress={progress} /> : null}
        </aside>
      </section>

      <section className="product-workspace">
        <ReaderWorkspace
          activeBook={displayActiveBook}
          selectedPage={selectedPage}
          selectedPageIndex={selectedPageIndex}
          view={view}
          imageTasks={progress?.imageTasks}
          onSetView={setView}
          onGoToPage={goToPage}
          onReadCurrentPage={readCurrentPage}
          onReadFullBook={readFullBook}
          onRegeneratePage={regeneratePageImage}
          isGenerating={isGenerating}
        />
        <RecordWorkspace activeBook={displayActiveBook} expanded={view === "records"} onOpenRecords={() => setView("records")} />
      </section>

      {view === "theater" ? (
        <TheaterWorkspace
          activeBook={displayActiveBook}
          selectedPage={selectedPage}
          selectedPageIndex={selectedPageIndex}
          onGoToPage={goToPage}
          onReadCurrentPage={readCurrentPage}
          onReadFullBook={readFullBook}
        />
      ) : null}

      {deleteTarget ? (
        <div className="confirm-overlay" role="presentation" onClick={() => setDeleteTarget(null)}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-book-title" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-icon" aria-hidden="true">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="product-eyebrow">删除作品</p>
              <h2 id="delete-book-title">确定删除《{displayText(deleteTarget.title)}》吗？</h2>
              <p>删除后会从“{productTitle}”移走这本作品，不能在页面里恢复。</p>
            </div>
            <div className="confirm-actions">
              <button className="soft-button" type="button" onClick={() => setDeleteTarget(null)}>
                取消
              </button>
              <button className="danger-button" type="button" onClick={() => void confirmDeleteBook()}>
                <Trash2 size={17} />
                删除
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function SegmentedControl({
  label,
  options,
  value,
  disabled,
  onChange
}: {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented-control">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            type="button"
            className={option.value === value ? "active" : ""}
            key={option.value}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProductFlow({ activeStep, progress }: { activeStep: number; progress: ProductProgress | null }) {
  return (
    <section className="flow-board" aria-label="完整流程">
      {flowSteps.map((step) => {
        const done = !progress?.active && step.number < activeStep;
        const active = step.number === activeStep;
        return (
          <article className={`flow-step flow-step-${step.number} ${active ? "active" : ""} ${done ? "done" : ""}`} key={step.number}>
            <span>{step.number}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
            {done ? <CheckCircle2 size={17} /> : null}
          </article>
        );
      })}
    </section>
  );
}

function ProductProgressPanel({ progress }: { progress: ProductProgress }) {
  const hasImageTasks = Object.values(progress.imageTasks).some((status) => status !== "idle");
  return (
    <section className={`product-progress ${progress.error ? "has-error" : ""}`}>
      <div className="mini-head">
        <div>
          <p className="product-eyebrow">实时创作进度</p>
          <h3>{progress.title}</h3>
        </div>
        <span className="elapsed-pill">
          <Clock size={15} />
          {progress.elapsedSeconds}s
        </span>
      </div>
      <p>{progress.detail}</p>
      {hasImageTasks ? (
        <div className="task-row">
          {[1, 2, 3, 4].map((pageNumber) => (
            <span className={progress.imageTasks[pageNumber]} key={pageNumber}>
              第 {pageNumber} 页
            </span>
          ))}
        </div>
      ) : null}
      <div className="log-list">
        {progress.logs.map((log, index) => (
          <p key={`${log}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {log}
          </p>
        ))}
      </div>
    </section>
  );
}

function ReaderWorkspace({
  activeBook,
  selectedPage,
  selectedPageIndex,
  view,
  imageTasks,
  onSetView,
  onGoToPage,
  onReadCurrentPage,
  onReadFullBook,
  onRegeneratePage,
  isGenerating
}: {
  activeBook: PictureBook | null;
  selectedPage: PictureBookPage | null;
  selectedPageIndex: number;
  view: ProductView;
  imageTasks?: Record<number, ImageTaskStatus>;
  onSetView: (view: ProductView) => void;
  onGoToPage: (pageIndex: number) => void;
  onReadCurrentPage: (languageOverride?: BookLanguage) => void;
  onReadFullBook: () => void;
  onRegeneratePage: (pageNumber: number) => Promise<void>;
  isGenerating: boolean;
}) {
  if (!activeBook) {
    return (
      <section className="reader-workspace empty-reader">
        <Paintbrush size={42} />
        <h2>打开一本绘本后，这里会显示书页</h2>
        <p>默认先看书架；点击任意封面即可打开故事、插图和文化小百科。</p>
      </section>
    );
  }

  const language = activeBook.language || "zh";
  const pageCount = activeBook.pages.length;
  const taskStatus = selectedPage ? imageTasks?.[selectedPage.pageNumber] || "idle" : "idle";

  return (
    <section className={`reader-workspace ${view === "reader" ? "is-active" : ""}`}>
      <div className="product-section-head">
        <div>
          <p className="product-eyebrow">6 打开绘本</p>
          <h2>{activeBook.title}</h2>
          <span>{activeBook.subtitle}</span>
        </div>
        <div className="section-actions">
          <button className="soft-button" type="button" onClick={onReadFullBook}>
            <Volume2 size={17} />
            朗读全书
          </button>
          <button className="soft-button" type="button" onClick={() => onSetView("records")}>
            <FileText size={17} />
            创作记录
          </button>
          <button className="strong-button" type="button" onClick={() => onSetView("theater")}>
            <ExternalLink size={17} />
            进入剧场
          </button>
        </div>
      </div>

      {selectedPage ? (
        <>
          <div className="open-book">
            <button className="page-turn left" type="button" onClick={() => onGoToPage(selectedPageIndex - 1)} disabled={selectedPageIndex === 0}>
              <ChevronLeft size={22} />
            </button>
            <div className="book-page image-page">
              {selectedPage.imageUrl ? (
                <img src={selectedPage.imageUrl} alt={`${activeBook.title} 第 ${selectedPage.pageNumber} 页`} />
              ) : (
                <div className="image-placeholder">
                  {taskStatus === "running" ? <LoaderCircle className="spinner-icon" size={36} /> : <ImageIcon size={36} />}
                  <span>{taskStatus === "running" ? "插图绘制中" : "等待插图"}</span>
                </div>
              )}
            </div>
            <article className="book-page text-page">
              <div className="page-number-pill">{language === "en" ? `Page ${selectedPage.pageNumber}` : `第 ${selectedPage.pageNumber} 页`}</div>
              <h3>{selectedPage.title}</h3>
              <p>{selectedPage.text}</p>
              <div className="culture-card">
                <strong>广西文化小百科</strong>
                <span>{selectedPage.cultureNote}</span>
              </div>
              <div className="reader-actions">
                <button className="soft-button" type="button" onClick={() => onReadCurrentPage()}>
                  <Volume2 size={16} />
                  听这一页
                </button>
                <button
                  className="soft-button"
                  type="button"
                  onClick={() => void onRegeneratePage(selectedPage.pageNumber)}
                  disabled={taskStatus === "running" || isGenerating}
                >
                  {taskStatus === "running" ? <LoaderCircle size={16} /> : <RefreshCw size={16} />}
                  换一张插图
                </button>
              </div>
            </article>
            <button
              className="page-turn right"
              type="button"
              onClick={() => onGoToPage(selectedPageIndex + 1)}
              disabled={selectedPageIndex >= pageCount - 1}
            >
              <ChevronRight size={22} />
            </button>
          </div>

          <div className="page-strip" aria-label="绘本页面">
            {activeBook.pages.map((page, index) => (
              <button type="button" className={index === selectedPageIndex ? "active" : ""} key={page.pageNumber} onClick={() => onGoToPage(index)}>
                {page.imageUrl ? <img src={page.imageUrl} alt={`第 ${page.pageNumber} 页缩略图`} /> : <ImageIcon size={18} />}
                <span>{language === "en" ? `Page ${page.pageNumber}` : `第 ${page.pageNumber} 页`}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-bookshelf">
          <ImageIcon size={40} />
          <h3>这本绘本还没有页面</h3>
          <p>可以重新生成一本完整绘本。</p>
        </div>
      )}
    </section>
  );
}

function RecordWorkspace({
  activeBook,
  expanded,
  onOpenRecords
}: {
  activeBook: PictureBook | null;
  expanded: boolean;
  onOpenRecords: () => void;
}) {
  const records = activeBook?.promptRecords || [];
  const visibleRecords = expanded ? records : records.slice(0, 4);

  return (
    <section className={`record-workspace ${expanded ? "is-expanded" : ""}`}>
      <div className="product-section-head compact">
        <div>
          <p className="product-eyebrow">7 查看创作记录</p>
          <h2>创作记录</h2>
          <span>{activeBook ? `共 ${records.length} 条灵感与生成记录` : "打开绘本后显示记录"}</span>
        </div>
        <button className="soft-button" type="button" onClick={onOpenRecords} disabled={!activeBook}>
          <FileText size={17} />
          查看全部
        </button>
      </div>
      {visibleRecords.length ? (
        <div className="record-list">
          {visibleRecords.map((record) => (
            <article className="record-item" key={record.id}>
              <div>
                <span>{getRecordTypeLabel(record.type)}</span>
                <small>{formatRecordTime(record.createdAt)}</small>
              </div>
              <strong>{record.label}</strong>
              <p>{compactText(record.output, expanded ? 220 : 94)}</p>
              {expanded ? (
                <details>
                  <summary>查看原始灵感说明</summary>
                  <pre>{record.prompt}</pre>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="record-empty">
          <FileText size={30} />
          <p>还没有可查看的创作记录。</p>
        </div>
      )}
    </section>
  );
}

function TheaterWorkspace({
  activeBook,
  selectedPage,
  selectedPageIndex,
  onGoToPage,
  onReadCurrentPage,
  onReadFullBook
}: {
  activeBook: PictureBook | null;
  selectedPage: PictureBookPage | null;
  selectedPageIndex: number;
  onGoToPage: (pageIndex: number) => void;
  onReadCurrentPage: (languageOverride?: BookLanguage) => void;
  onReadFullBook: () => void;
}) {
  const [theaterMode, setTheaterMode] = useState<"showcase" | "self">("showcase");

  if (!activeBook || !selectedPage) {
    return null;
  }

  const language = activeBook.language || "zh";
  const currentReadLabel = language === "en" ? "English" : "中文朗读";

  return (
    <section className="theater-workspace">
      <div className="theater-curtain">
        <div className="theater-screen">
          {selectedPage.imageUrl ? <img src={selectedPage.imageUrl} alt={`${activeBook.title} 剧场展示`} /> : <ImageIcon size={48} />}
        </div>
        <article className="theater-script">
          <p className="product-eyebrow">8 进入绘本剧场</p>
          <h2>{activeBook.title}</h2>
          <h3>{selectedPage.title}</h3>
          <p>{selectedPage.text}</p>
          <div className="theater-mode-switch" aria-label="展示或阅读模式">
            <button type="button" className={theaterMode === "showcase" ? "active" : ""} onClick={() => setTheaterMode("showcase")}>
              比赛展示
            </button>
            <button type="button" className={theaterMode === "self" ? "active" : ""} onClick={() => setTheaterMode("self")}>
              自己阅读
            </button>
          </div>
          <div className="theater-mode-note">
            <strong>9 展示 / 阅读</strong>
            <span>{theaterMode === "showcase" ? "适合比赛现场投屏展示，保留大画面和朗读控制。" : "适合自己慢慢读，按页切换，随时听当前页。"}</span>
          </div>
          <div className="reader-actions">
            <button className="strong-button" type="button" onClick={onReadFullBook}>
              <Volume2 size={17} />
              朗读全书
            </button>
            <button className="soft-button" type="button" onClick={() => onReadCurrentPage(language)}>
              {currentReadLabel}
            </button>
          </div>
          <div className="theater-dots">
            {activeBook.pages.map((page, index) => (
              <button type="button" className={index === selectedPageIndex ? "active" : ""} key={page.pageNumber} onClick={() => onGoToPage(index)}>
                {index + 1}
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
