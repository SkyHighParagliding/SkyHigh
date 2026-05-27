import createLogger from "./logger.js";

const log = createLogger("ai-json-parser");

export function parseAiJsonResponse(responseText: string): any {
  let cleaned = responseText.replace(/```json\n?|```/g, "").trim();

  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, (ch) =>
    ch === "\n" || ch === "\r" || ch === "\t" ? ch : ""
  );

  function basicClean(text: string): string {
    let t = text;
    t = t.replace(/,\s*([\]}])/g, "$1");
    t = t.replace(/(\{|,)\s*(\w+)\s*:/g, '$1 "$2":');
    return t;
  }

  try {
    return JSON.parse(basicClean(cleaned));
  } catch (e1) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extracted = basicClean(jsonMatch[0]);
      try {
        return JSON.parse(extracted);
      } catch {
        log.warn("extracted JSON parse failed, trying fixBrokenJson");
        const fixed = fixBrokenJson(extracted);
        try {
          return JSON.parse(fixed);
        } catch {
          log.warn("fixBrokenJson parse failed, trying rebuildJson");
          const rebuilt = rebuildJson(responseText);
          if (rebuilt) {
            try {
              return JSON.parse(rebuilt);
            } catch {
              log.warn("rebuildJson parse failed after fixBrokenJson");
            }
          }
        }
      }
    }

    const rebuilt = rebuildJson(responseText);
    if (rebuilt) {
      try {
        return JSON.parse(rebuilt);
      } catch {
        log.warn("rebuildJson parse failed in outer fallback");
      }
    }

    console.error("[aiJsonParser] All parse attempts failed. Raw response (first 2000 chars):", responseText.substring(0, 2000));
    throw new Error("Generation returned invalid JSON");
  }
}

function fixBrokenJson(text: string): string {
  let result = "";
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];

    if (ch === '"') {
      const before = result.trimEnd();
      const isKeyOrValueStart = before.endsWith(':') || before.endsWith(',') || before.endsWith('{') || before.endsWith('[');

      if (isKeyOrValueStart) {
        const closingIdx = findStringEnd(text, i + 1);
        if (closingIdx >= 0) {
          const inner = text.substring(i + 1, closingIdx);
          const escaped = inner
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
          result += '"' + escaped + '"';
          i = closingIdx + 1;
          continue;
        }
      }
    }

    result += ch;
    i++;
  }

  result = result.replace(/,\s*([\]}])/g, "$1");

  const openBraces = (result.match(/\{/g) || []).length;
  const closeBraces = (result.match(/\}/g) || []).length;
  const openBrackets = (result.match(/\[/g) || []).length;
  const closeBrackets = (result.match(/\]/g) || []).length;
  for (let j = 0; j < openBrackets - closeBrackets; j++) result += ']';
  for (let j = 0; j < openBraces - closeBraces; j++) result += '}';

  return result;
}

function findStringEnd(text: string, start: number): number {
  let i = start;
  const len = text.length;

  while (i < len) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"') {
      const after = text.substring(i + 1).trimStart();
      if (after.length === 0 || /^[,}\]:]/.test(after)) {
        return i;
      }
    }
    i++;
  }
  return -1;
}

function rebuildJson(raw: string): string | null {
  const obj: Record<string, any> = {};

  const stringFieldPattern = /"(\w+)"\s*:\s*"((?:[^"\\]|\\"|\\.)*)"/g;
  let m;
  while ((m = stringFieldPattern.exec(raw)) !== null) {
    obj[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }

  const arrayPattern = /"(\w+)"\s*:\s*\[([\s\S]*?)\]/g;
  while ((m = arrayPattern.exec(raw)) !== null) {
    const items: string[] = [];
    const itemPattern = /"((?:[^"\\]|\\"|\\.)*)"/g;
    let im;
    while ((im = itemPattern.exec(m[2])) !== null) {
      items.push(im[1].replace(/\\"/g, '"'));
    }
    obj[m[1]] = items;
  }

  const numPattern = /"(\w+)"\s*:\s*(-?\d+(?:\.\d+)?)\s*[,}\]]/g;
  while ((m = numPattern.exec(raw)) !== null) {
    obj[m[1]] = parseFloat(m[2]);
  }

  if (Object.keys(obj).length < 3) return null;

  return JSON.stringify(obj);
}
