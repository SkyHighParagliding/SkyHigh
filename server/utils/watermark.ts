import sharp from "sharp";

const DEFAULT_SIZE_PERCENT = 10;

export type WatermarkPosition =
  | "bottom-right"
  | "bottom-left"
  | "bottom-center"
  | "top-right"
  | "top-left"
  | "top-center";

const VALID_POSITIONS: WatermarkPosition[] = [
  "bottom-right", "bottom-left", "bottom-center",
  "top-right", "top-left", "top-center",
];

export function normalizePosition(pos?: string): WatermarkPosition {
  if (pos && VALID_POSITIONS.includes(pos as WatermarkPosition)) {
    return pos as WatermarkPosition;
  }
  return "bottom-right";
}

export async function applyWatermark(
  imageBuffer: Buffer,
  photographerCredit: string,
  sizePercent: number = DEFAULT_SIZE_PERCENT,
  position: WatermarkPosition = "bottom-right"
): Promise<Buffer> {
  if (!photographerCredit || !photographerCredit.trim()) {
    return imageBuffer;
  }

  const credit = photographerCredit.trim();
  const meta = await sharp(imageBuffer).metadata();
  const imgW = meta.width!;
  const imgH = meta.height!;

  if (imgW < 100 || imgH < 60) {
    return imageBuffer;
  }

  const pct = Math.max(5, Math.min(50, sizePercent));
  const fontSize = Math.max(10, Math.round(imgW * pct / 1000));
  const margin = Math.round(fontSize * 0.8);
  const shadowOffset = Math.max(1, Math.round(fontSize * 0.04));
  const lineHeight = Math.round(fontSize * 1.2);

  const isBottom = position.startsWith("bottom");
  const isRight = position.endsWith("right");
  const isCenter = position.endsWith("center");

  const sampleW = Math.min(Math.round(imgW * 0.4), imgW);
  const sampleH = Math.min(Math.round(imgH * 0.2), imgH);
  const sampleLeft = isRight ? imgW - sampleW : isCenter ? Math.round((imgW - sampleW) / 2) : 0;
  const sampleTop = isBottom ? imgH - sampleH : 0;

  const sampleRegion = await sharp(imageBuffer)
    .extract({ left: sampleLeft, top: sampleTop, width: sampleW, height: sampleH })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = sampleRegion;
  const channels = info.channels;
  let totalLuminance = 0;
  const pixelCount = data.length / channels;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    totalLuminance += 0.299 * r + 0.587 * g + 0.114 * b;
  }
  const avgLuminance = totalLuminance / pixelCount;

  const useWhite = avgLuminance < 128;
  const textColor = useWhite ? "#FFFFFF" : "#000000";
  const shadowColor = useWhite ? "#000000" : "#FFFFFF";
  const shadowOpacity = useWhite ? 0.5 : 0.35;

  const escapedCredit = credit
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const displayText = `\u00A9 ${escapedCredit}`;

  let textAnchor: string;
  let textX: number;
  if (isRight) {
    textAnchor = "end";
    textX = imgW - margin;
  } else if (isCenter) {
    textAnchor = "middle";
    textX = Math.round(imgW / 2);
  } else {
    textAnchor = "start";
    textX = margin;
  }

  const textY = isBottom ? imgH - margin : margin + lineHeight;

  const svgOverlay = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}">
      <text 
        x="${textX + shadowOffset}" 
        y="${textY + shadowOffset}" 
        font-family="Arial, Helvetica, sans-serif" 
        font-size="${fontSize}" 
        fill="${shadowColor}" 
        fill-opacity="${shadowOpacity}"
        font-weight="600"
        text-anchor="${textAnchor}"
      >${displayText}</text>
      <text 
        x="${textX}" 
        y="${textY}" 
        font-family="Arial, Helvetica, sans-serif" 
        font-size="${fontSize}" 
        fill="${textColor}" 
        fill-opacity="0.85"
        font-weight="600"
        text-anchor="${textAnchor}"
      >${displayText}</text>
    </svg>
  `);

  return sharp(imageBuffer)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .toBuffer();
}
