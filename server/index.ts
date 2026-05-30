import "dotenv/config";
import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPictureBookDraft,
  generateAllPageImages,
  generatePageImage,
  generateSeasonalInspirationChips,
  getBailianRuntimeStatus
} from "./bailian.js";
import { synthesizeBailianSpeech } from "./bailianTts.js";
import { deleteBook, getBook, listBookSummaries, saveBook, toBookSummary, updateBook } from "./bookStore.js";
import { buildSystemPrompt, chatWithMiniMax, synthesizeSpeech, type ChatMessage } from "./minimax.js";
import { extractMemoriesFromText, loadMemory, rememberFacts } from "./memoryStore.js";
import {
  appendTransactionTurn,
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactionSummaries,
  toTransactionSummary
} from "./transactionStore.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

app.use(express.json({ limit: "1mb" }));
app.use("/generated", express.static(join(rootDir, "data", "generated")));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "xiaoyuan-ai-companion" });
});

app.get("/api/bailian/status", (_request, response) => {
  response.json(getBailianRuntimeStatus());
});

app.post("/api/speech", async (request, response, next) => {
  try {
    const text = String(request.body?.text || "").trim();
    const protagonistGender = request.body?.protagonistGender === "boy" ? "boy" : "girl";
    if (!text) {
      response.status(400).json({ error: "text is required" });
      return;
    }

    const audio = await synthesizeBailianSpeech(text, protagonistGender);
    response.json(audio);
  } catch (error) {
    next(error);
  }
});

app.post("/api/inspiration-chips", async (request, response, next) => {
  try {
    const language = request.body?.language === "en" ? "en" : "zh";
    const currentIdea = String(request.body?.currentIdea || "").trim().slice(0, 120);
    const currentDate = String(request.body?.currentDate || "").trim();
    const refreshCount = Number(request.body?.refreshCount || 1);
    const existingChips = Array.isArray(request.body?.existingChips)
      ? request.body.existingChips.map((chip: unknown) => String(chip || "").trim()).filter(Boolean).slice(0, 12)
      : [];
    const result = await generateSeasonalInspirationChips({ currentDate, currentIdea, existingChips, language, refreshCount });
    response.json(result);
  } catch (error) {
    next(error);
  }
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

app.get("/api/transactions", async (_request, response, next) => {
  try {
    response.json({ transactions: await listTransactionSummaries() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/transactions", async (request, response, next) => {
  try {
    const transaction = await createTransaction(String(request.body?.id || ""));
    response.json({ transaction, transactions: await listTransactionSummaries() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/transactions/:id", async (request, response, next) => {
  try {
    const transaction = await getTransaction(request.params.id);
    if (!transaction) {
      response.status(404).json({ error: "transaction not found" });
      return;
    }
    response.json({ transaction });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/transactions/:id", async (request, response, next) => {
  try {
    const deleted = await deleteTransaction(request.params.id);
    response.json({ ok: true, deleted, transactions: await listTransactionSummaries() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/picture-books", async (_request, response, next) => {
  try {
    response.json({ books: await listBookSummaries() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/picture-books/:id", async (request, response, next) => {
  try {
    const book = await getBook(request.params.id);
    if (!book) {
      response.status(404).json({ error: "picture book not found" });
      return;
    }
    response.json({ book });
  } catch (error) {
    next(error);
  }
});

app.post("/api/picture-books/generate", async (request, response, next) => {
  try {
    const idea = String(request.body?.idea || "").trim();
    const language = request.body?.language === "en" ? "en" : "zh";
    const protagonistGender = request.body?.protagonistGender === "boy" ? "boy" : "girl";
    const shouldGenerateImage = request.body?.generateImage !== false;
    if (!idea) {
      response.status(400).json({ error: "idea is required" });
      return;
    }

    let book = await createPictureBookDraft(idea, language, protagonistGender);
    if (shouldGenerateImage) {
      const result = await generateAllPageImages(book);
      book = {
        ...book,
        pages: result.pages,
        promptRecords: book.promptRecords.concat(result.records)
      };
    }

    const savedBook = await saveBook(book);
    response.json({ book: savedBook, summary: toBookSummary(savedBook), books: await listBookSummaries() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/picture-books/:id/pages/:pageNumber/image", async (request, response, next) => {
  try {
    const book = await getBook(request.params.id);
    if (!book) {
      response.status(404).json({ error: "picture book not found" });
      return;
    }

    const pageNumber = Number(request.params.pageNumber);
    const result = await generatePageImage(book, pageNumber);
    const nextBook = await updateBook(book.id, (currentBook) => {
      return {
        ...currentBook,
        pages: currentBook.pages.map((page) => (page.pageNumber === result.page.pageNumber ? result.page : page)),
        promptRecords: currentBook.promptRecords.concat(result.record)
      };
    });
    if (!nextBook) {
      response.status(404).json({ error: "picture book not found" });
      return;
    }

    response.json({ book: nextBook, page: result.page });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/picture-books/:id", async (request, response, next) => {
  try {
    const deleted = await deleteBook(request.params.id);
    response.json({ ok: true, deleted, books: await listBookSummaries() });
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
    const transaction = await getTransaction(sessionId);

    const promptMessages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(memory.facts) },
      ...(transaction?.messages || []).slice(-10).map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: message }
    ];

    const ai = await chatWithMiniMax(promptMessages);
    const updatedTransaction = await appendTransactionTurn(sessionId, message, ai.text);

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
      transaction: toTransactionSummary(updatedTransaction),
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
