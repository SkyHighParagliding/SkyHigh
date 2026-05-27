import type { GoogleGenAI } from "@google/genai";
import { queryOne, execute } from "../pg.js";
import createLogger from "./logger.js";

const log = createLogger("ai-models");

const DEFAULT_TEXT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
];

const DEFAULT_IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
];

export async function getTextModels(): Promise<string[]> {
  try {
    const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'aiTextModels'");
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    log.error("Failed to fetch aiTextModels from DB");
  }
  return DEFAULT_TEXT_MODELS;
}

export async function getImageModels(): Promise<string[]> {
  try {
    const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'aiImageModels'");
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    log.error("Failed to fetch aiImageModels from DB");
  }
  return DEFAULT_IMAGE_MODELS;
}

export async function setTextModels(models: string[]): Promise<void> {
  await execute("INSERT INTO settings (key, value) VALUES ('aiTextModels', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify(models)]);
}

export async function setImageModels(models: string[]): Promise<void> {
  await execute("INSERT INTO settings (key, value) VALUES ('aiImageModels', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify(models)]);
}

export { DEFAULT_TEXT_MODELS, DEFAULT_IMAGE_MODELS };

export async function generateTextWithFallback(
  ai: InstanceType<typeof GoogleGenAI>,
  options: {
    contents: any;
    config?: any;
  }
): Promise<{ text: string; model: string }> {
  const models = await getTextModels();
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      log.info(`Trying text model: ${model}`);
      const result = await ai.models.generateContent({
        model,
        contents: options.contents,
        config: { ...(options.config || {}), temperature: 0 },
      });
      const text = result.text || "";
      log.info(`Text model ${model} succeeded (${text.length} chars)`);
      return { text, model };
    } catch (e: any) {
      log.warn(`Text model ${model} failed: ${e.message}`);
      lastError = e;
    }
  }

  throw lastError || new Error(`All text models failed: ${models.join(", ")}`);
}
