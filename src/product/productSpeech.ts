import { synthesizePictureBookSpeech } from "./pictureBookApi";
import type { BookLanguage, ProtagonistGender } from "./types";

let speechRunId = 0;
let activeAudio: HTMLAudioElement | null = null;
let resolveActiveAudio: (() => void) | null = null;
let resolveActiveUtterance: (() => void) | null = null;

function splitSpeechText(text: string) {
  return text
    .replace(/\s+/gu, " ")
    .split(/(?<=[。！？!?])|(?<=\.)\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanSpeechText(text: string) {
  return text
    .replace(/第\s*\d+\s*页[，,：:\s]*/gu, "")
    .replace(/[·•]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function playAudio(audioUrl: string, runId: number) {
  return new Promise<void>((resolve, reject) => {
    if (runId !== speechRunId) {
      resolve();
      return;
    }

    const audio = new Audio(audioUrl);
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (activeAudio === audio) {
        activeAudio = null;
      }
      if (resolveActiveAudio === finish) {
        resolveActiveAudio = null;
      }
      callback();
    };
    const finish = () => settle(resolve);

    activeAudio = audio;
    resolveActiveAudio = finish;
    audio.onended = () => {
      settle(resolve);
    };
    audio.onerror = () => {
      settle(() => reject(new Error("音频播放失败")));
    };
    void audio.play().catch((error) => settle(() => reject(error)));
  });
}

export function stopProductSpeech() {
  speechRunId += 1;
  const audio = activeAudio;
  const finishAudio = resolveActiveAudio;
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    activeAudio = null;
  }
  window.speechSynthesis?.cancel();
  finishAudio?.();
  resolveActiveUtterance?.();
  resolveActiveUtterance = null;
}

export async function speakProductText(
  text: string,
  language: BookLanguage,
  protagonistGender: ProtagonistGender,
  audioUrl?: string
) {
  const cleanText = cleanSpeechText(text);
  if (!cleanText) {
    return;
  }

  stopProductSpeech();
  const runId = speechRunId;

  if (audioUrl) {
    await playAudio(audioUrl, runId);
    return;
  }

  if (language === "zh") {
    try {
      const generatedAudioUrl = await synthesizePictureBookSpeech(cleanText, protagonistGender);
      await playAudio(generatedAudioUrl, runId);
      return;
    } catch {
      if (runId !== speechRunId) {
        return;
      }
    }
  }

  if (!window.speechSynthesis || runId !== speechRunId) {
    return;
  }

  const chunks = splitSpeechText(cleanText);
  for (const chunk of chunks) {
    if (runId !== speechRunId) {
      break;
    }

    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      const finishUtterance = () => {
        if (resolveActiveUtterance === finishUtterance) {
          resolveActiveUtterance = null;
        }
        resolve();
      };
      utterance.lang = language === "en" ? "en-US" : "zh-CN";
      utterance.rate = language === "en" ? 0.98 : 1.08;
      utterance.pitch = 1.03;
      utterance.onend = finishUtterance;
      utterance.onerror = finishUtterance;
      resolveActiveUtterance = finishUtterance;
      window.speechSynthesis.speak(utterance);
    });
  }
}
