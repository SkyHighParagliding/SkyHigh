import type { GoogleGenAI } from "@google/genai";
import db from "../db.js";

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
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'aiTextModels'").get() as { value: string } | undefined;
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_TEXT_MODELS;
}

export async function getImageModels(): Promise<string[]> {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'aiImageModels'").get() as { value: string } | undefined;
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_IMAGE_MODELS;
}

export async function setTextModels(models: string[]): Promise<void> {
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('aiTextModels', ?)").run(JSON.stringify(models));
}

export async function setImageModels(models: string[]): Promise<void> {
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('aiImageModels', ?)").run(JSON.stringify(models));
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
      console.log(`>>> Trying text model: ${model}`);
      const result = await ai.models.generateContent({
        model,
        contents: options.contents,
        config: { ...(options.config || {}), temperature: 0 },
      });
      const text = result.text || "";
      console.log(`>>> Text model ${model} succeeded (${text.length} chars)`);
      return { text, model };
    } catch (e: any) {
      console.log(`>>> Text model ${model} failed: ${e.message}`);
      lastError = e;
    }
  }

  throw lastError || new Error(`All text models failed: ${models.join(", ")}`);
}
