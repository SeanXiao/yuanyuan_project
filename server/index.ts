import "dotenv/config";
import express from "express";
import { buildSystemPrompt, chatWithMiniMax, synthesizeSpeech, type ChatMessage } from "./minimax.js";
import { extractMemoriesFromText, loadMemory, rememberFacts } from "./memoryStore.js";

type SessionState = {
  messages: ChatMessage[];
};

const app = express();
const sessions = new Map<string, SessionState>();
const port = Number(process.env.PORT || 8787);

app.use(express.json({ limit: "1mb" }));

function getSession(sessionId: string) {
  const existing = sessions.get(sessionId);
  if (existing) {
    return existing;
  }
  const created = { messages: [] };
  sessions.set(sessionId, created);
  return created;
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "xiaoyuan-ai-companion" });
});

app.get("/api/memory", async (_request, response, next) => {
  try {
    response.json(await loadMemory());
  } catch (error) {
    next(error);
  }
});

app.post("/api/memory/clear", async (_request, response, next) => {
  try {
    const { saveMemory } = await import("./memoryStore.js");
    await saveMemory({ facts: [] });
    response.json({ ok: true, facts: [] });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat", async (request, response, next) => {
  try {
    const message = String(request.body?.message || "").trim();
    const sessionId = String(request.body?.sessionId || "default").slice(0, 80);
    const shouldSpeak = request.body?.speak !== false;

    if (!message) {
      response.status(400).json({ error: "message is required" });
      return;
    }

    const extractedFacts = extractMemoriesFromText(message);
    const storedMemories = extractedFacts.length ? await rememberFacts(extractedFacts, message) : [];
    const memory = await loadMemory();
    const session = getSession(sessionId);

    const promptMessages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(memory.facts) },
      ...session.messages.slice(-10),
      { role: "user", content: message }
    ];

    const ai = await chatWithMiniMax(promptMessages);

    session.messages.push({ role: "user", content: message });
    session.messages.push({ role: "assistant", content: ai.text });
    session.messages = session.messages.slice(-16);

    let audio: Awaited<ReturnType<typeof synthesizeSpeech>> | null = null;
    let ttsError: string | null = null;
    if (shouldSpeak) {
      try {
        audio = await synthesizeSpeech(ai.text);
      } catch (error) {
        ttsError = error instanceof Error ? error.message : "TTS failed";
      }
    }

    response.json({
      reply: ai.text,
      audioUrl: audio?.audioUrl || null,
      ttsError,
      storedMemories,
      memory: memory.facts,
      model: ai.rawModel
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown server error";
  response.status(500).json({ error: message });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`API server listening on http://127.0.0.1:${port}`);
});
