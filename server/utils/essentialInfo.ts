import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { saveFile } from "../storage.js";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

export function isAllowedScrapeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && /^(www\.)?siteguide\.org\.au$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

export async function extractEssentialInfo($: cheerio.CheerioAPI, siteId: string, baseUrl: string): Promise<{ images: string[]; text: string }> {
  const siteMapImgs: string[] = [];
  const essentialTextParts: string[] = [];

  $('img[src*="/Site%20Maps/"], img[src*="/Site Maps/"]').each((_i, el) => {
    const src = $(el).attr('src') || '';
    if (src) siteMapImgs.push(src);
  });

  $('h2, h3').each((_i, el) => {
    const heading = $(el).text().trim();
    if (/map\s+information/i.test(heading)) {
      let next = $(el).next();
      while (next.length && !next.is('h2, h3')) {
        next.find('img').each((_j, imgEl) => {
          const src = $(imgEl).attr('src') || '';
          if (src && !siteMapImgs.includes(src)) siteMapImgs.push(src);
        });
        if (next.is('img')) {
          const src = next.attr('src') || '';
          if (src && !siteMapImgs.includes(src)) siteMapImgs.push(src);
        }
        next = next.next();
      }
    }
  });

  const savedPaths: string[] = [];
  for (let i = 0; i < siteMapImgs.length; i++) {
    const imgSrc = siteMapImgs[i];
    const isGoogleMap = imgSrc.includes('maps.google.com') || imgSrc.includes('maps.googleapis.com');
    const fullUrl = imgSrc.startsWith('http') ? imgSrc : `https://siteguide.org.au${imgSrc}`;
    if (!isGoogleMap && !isAllowedScrapeUrl(fullUrl)) continue;
    try {
      const imgRes = await fetch(fullUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const ext = fullUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || (isGoogleMap ? 'png' : 'jpg');
        const filename = `essential-${siteId}-${i + 1}.${ext}`;
        const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
        const savedUrl = await saveFile(buf, filename, contentType);
        savedPaths.push(savedUrl);
      }
    } catch (e) {
      console.log(`  Failed to download essential info image: ${fullUrl}`);
    }
  }

  $('h3').each((_i, el) => {
    const heading = $(el).text().trim();
    if (/takeoff|landing|flight|hazard|safety|restricted|no.fly/i.test(heading)) {
      let textContent = heading + ': ';
      let next = $(el).next();
      const parts: string[] = [];
      while (next.length && !next.is('h3, h2, h1')) {
        const t = next.text().trim();
        if (t && !next.is('img') && t.length > 5) {
          parts.push(t);
        }
        next = next.next();
      }
      if (parts.length > 0) {
        textContent += parts.join(' ');
        essentialTextParts.push(textContent);
      }
    }
  });

  const essentialText = essentialTextParts.join('\n\n').substring(0, 5000);

  return { images: savedPaths, text: essentialText };
}
