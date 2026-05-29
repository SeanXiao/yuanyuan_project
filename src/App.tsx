import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BookHeart,
  Brain,
  Eraser,
  LoaderCircle,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Volume2
} from "lucide-react";
import companionRobot from "./assets/companion-robot.png";

type Role = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
};

type MemoryFact = {
  id: string;
  text: string;
  createdAt: string;
  lastMentionedAt: string;
  source: string;
};

type RobotMood = "idle" | "listening" | "thinking" | "speaking" | "remember" | "error";

type ChatResponse = {
  reply: string;
  audioUrl: string | null;
  ttsError: string | null;
  storedMemories: MemoryFact[];
  memory: MemoryFact[];
  model?: string;
};

const starterMessages: ChatMessage[] = [
  {
    id: "hello",
    role: "assistant",
    content: "你好，我是小圆。你可以按麦克风和我聊天，也可以告诉我你的名字、喜欢的事情，我会努力记住。",
    createdAt: new Date().toISOString()
  }
];

const robotMoodText: Record<RobotMood, string> = {
  idle: "准备好啦",
  listening: "我在听",
  thinking: "思考中",
  speaking: "正在说",
  remember: "记住啦",
  error: "需要帮助"
};

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getSessionId() {
  const key = "xiaoyuan-session-id";
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

function getBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) {
      resolve(voices);
      return;
    }

    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
    window.setTimeout(() => resolve(window.speechSynthesis.getVoices()), 500);
  });
}

function pickWarmChineseVoice(voices: SpeechSynthesisVoice[]) {
  const chineseVoices = voices.filter((voice) => /^zh/i.test(voice.lang) || /Chinese|Mandarin|普通话|中文/u.test(voice.name));
  const preferredNames = [
    "Xiaoxiao",
    "Xiaoyi",
    "Tingting",
    "Meijia",
    "Sinji",
    "Google 普通话",
    "Mandarin",
    "Chinese"
  ];

  return (
    preferredNames
      .map((name) => chineseVoices.find((voice) => voice.name.toLowerCase().includes(name.toLowerCase())))
      .find(Boolean) ||
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
  const chunks = splitSpeechText(text);
  if (!chunks.length) {
    return;
  }

  for (const [index, chunk] of chunks.entries()) {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = voice?.lang || "zh-CN";
    utterance.voice = voice;
    utterance.rate = 1.14;
    utterance.pitch = 1.03;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);

    await new Promise<void>((resolve) => {
      utterance.onend = () => window.setTimeout(resolve, index < chunks.length - 1 ? 120 : 0);
      utterance.onerror = () => resolve();
    });
  }
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [draft, setDraft] = useState("");
  const [memories, setMemories] = useState<MemoryFact[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [notice, setNotice] = useState("点击麦克风，说一句话试试看");
  const [model, setModel] = useState("MiniMax-M2.7");
  const [robotMood, setRobotMood] = useState<RobotMood>("idle");
  const sessionId = useMemo(getSessionId, []);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const moodTimerRef = useRef<number | null>(null);

  const speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    fetch("/api/memory")
      .then((response) => response.json())
      .then((data: { facts?: MemoryFact[] }) => setMemories(data.facts || []))
      .catch(() => setNotice("记忆读取失败，但仍然可以继续聊天"));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    return () => {
      if (moodTimerRef.current) {
        window.clearTimeout(moodTimerRef.current);
      }
    };
  }, []);

  function showRobotMood(mood: RobotMood, duration = 0) {
    if (moodTimerRef.current) {
      window.clearTimeout(moodTimerRef.current);
      moodTimerRef.current = null;
    }

    setRobotMood(mood);
    if (duration > 0) {
      moodTimerRef.current = window.setTimeout(() => {
        setRobotMood("idle");
        moodTimerRef.current = null;
      }, duration);
    }
  }

  async function playReplyAudio(reply: string, audioUrl: string | null) {
    showRobotMood("speaking");
    if (!audioUrl) {
      await speakWithBrowser(reply);
      showRobotMood("idle", 1800);
      return;
    }

    try {
      const audio = new Audio(audioUrl);
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("audio playback failed"));
        audio.play().catch(reject);
      });
    } catch {
      await speakWithBrowser(reply);
    }
    showRobotMood("idle", 1800);
  }

  async function sendMessage(text: string) {
    const cleanText = text.trim();
    if (!cleanText || isThinking) {
      return;
    }

    setDraft("");
    setNotice("小圆正在认真听懂你的意思");
    setIsThinking(true);
    showRobotMood("thinking");
    setMessages((current) => [
      ...current,
      { id: makeId(), role: "user", content: cleanText, createdAt: new Date().toISOString() }
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: cleanText, sessionId, speak: true })
      });
      const data = (await response.json()) as ChatResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "聊天请求失败");
      }

      setMessages((current) => [
        ...current,
        { id: makeId(), role: "assistant", content: data.reply, createdAt: new Date().toISOString() }
      ]);
      setMemories(data.memory || []);
      setModel(data.model || model);
      const firstReplyMood: RobotMood = data.storedMemories?.length ? "remember" : "speaking";
      showRobotMood(firstReplyMood, data.storedMemories?.length ? 1400 : 0);
      setNotice(
        data.ttsError
          ? "MiniMax 语音暂不可用，已切换为更自然的本机朗读"
          : data.storedMemories?.length
            ? "我已经把这件事放进记忆卡片啦"
            : "可以继续说，我在听"
      );
      window.setTimeout(() => void playReplyAudio(data.reply, data.audioUrl), data.storedMemories?.length ? 900 : 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content: `我刚刚没有连上大脑：${message}`,
          createdAt: new Date().toISOString()
        }
      ]);
      setNotice("请检查后端是否启动，以及 MiniMax key 是否正确");
      showRobotMood("error", 3600);
    } finally {
      setIsThinking(false);
    }
  }

  function startListening() {
    if (!speechSupported || isThinking) {
      setNotice("这个浏览器暂不支持语音识别，可以先用打字对话");
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
      setDraft((finalText || interim).trim());
      if (finalText.trim()) {
        recognition.stop();
        void sendMessage(finalText);
      }
    };

    recognition.onerror = (event) => {
      setNotice(`语音识别遇到问题：${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    showRobotMood("listening");
    setNotice("我在听，你可以开始说话");
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
    showRobotMood("idle", 1000);
    setNotice("已停止收音");
  }

  async function clearMemory() {
    await fetch("/api/memory/clear", { method: "POST" });
    setMemories([]);
    showRobotMood("idle", 1200);
    setNotice("长期记忆已经清空");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="companion-panel" aria-label="AI 伙伴状态">
          <div className="brand-row">
            <span className="brand-mark" aria-hidden="true">
              <Sparkles size={18} />
            </span>
            <div>
              <p className="eyebrow">小学 AI 项目大赛</p>
              <h1>小圆 AI 陪伴机器人</h1>
            </div>
          </div>

          <div className={`robot-stage robot-${robotMood}`}>
            <img src={companionRobot} alt="小圆机器人" />
            <div className="expression-bubble" aria-label={`机器人表情：${robotMoodText[robotMood]}`}>
              <span className="expression-face" aria-hidden="true">
                <span className="face-eye face-eye-left" />
                <span className="face-eye face-eye-right" />
                <span className="face-mouth" />
              </span>
              <span className="expression-text">{robotMoodText[robotMood]}</span>
            </div>
            <div className="voice-waves" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className="status-strip">
            <Brain size={18} />
            <span>{notice}</span>
          </div>

          <div className="memory-header">
            <div>
              <p className="eyebrow">长期记忆</p>
              <h2>记忆卡片</h2>
            </div>
            <button className="icon-button" type="button" onClick={clearMemory} aria-label="清空记忆">
              <Eraser size={18} />
            </button>
          </div>

          <div className="memory-list">
            {memories.length ? (
              memories.slice(0, 7).map((memory) => (
                <article className="memory-item" key={memory.id}>
                  <BookHeart size={16} />
                  <span>{memory.text}</span>
                </article>
              ))
            ) : (
              <p className="empty-memory">还没有记忆。试试说：“我叫圆圆，我喜欢画画。”</p>
            )}
          </div>
        </aside>

        <section className="chat-panel" aria-label="对话区域">
          <header className="chat-header">
            <div>
              <p className="eyebrow">Minimax 大脑 · {model}</p>
              <h2>语音陪聊</h2>
            </div>
            <button className="speak-button" type="button" onClick={() => void speakWithBrowser(messages.at(-1)?.content || "")}>
              <Volume2 size={18} />
              重播
            </button>
          </header>

          <div className="conversation" role="log" aria-live="polite">
            {messages.map((message) => (
              <article className={`bubble ${message.role}`} key={message.id}>
                <span className="speaker">{message.role === "assistant" ? "小圆" : "我"}</span>
                <p>{message.content}</p>
              </article>
            ))}
            {isThinking && (
              <article className="bubble assistant thinking">
                <span className="speaker">小圆</span>
                <p>
                  <LoaderCircle size={16} />
                  正在想一个适合你的回答
                </p>
              </article>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <button
              className={`mic-button ${isListening ? "active" : ""}`}
              type="button"
              onClick={isListening ? stopListening : startListening}
              aria-label={isListening ? "停止语音输入" : "开始语音输入"}
            >
              {isListening ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={speechSupported ? "按麦克风说话，或在这里打字" : "当前浏览器不支持语音识别，可直接打字"}
              disabled={isThinking}
            />
            <button className="send-button" type="submit" disabled={!draft.trim() || isThinking}>
              <Send size={18} />
              发送
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
