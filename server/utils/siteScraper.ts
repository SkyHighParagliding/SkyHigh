import * as cheerio from 'cheerio';

export interface ScrapeResult {
  allText: string;
  isSiteClosed: boolean;
  $: cheerio.CheerioAPI;
  title: string;
}

export function extractResponsibleClub(html: string): string {
  const $ = cheerio.load(html);
  const sidebarContainer = $('.col-md-4 h3').first().parent();
  if (!sidebarContainer.length) return '';

  const nodes = sidebarContainer.contents();
  let currentHeading = '';
  let currentParts: string[] = [];
  let responsibleClub = '';

  nodes.each((_i, node) => {
    const tagName = node.type === 'tag' ? (node as any).tagName?.toUpperCase() : '';
    if (tagName === 'H3') {
      if (currentHeading && currentParts.length > 0) {
        const headingLower = currentHeading.toLowerCase();
        if (headingLower.includes('responsible') || headingLower.includes('contact/responsible')) {
          responsibleClub = currentParts.join(' ').replace(/\s+/g, ' ').trim();
        }
      }
      currentHeading = $(node).text().trim();
      currentParts = [];
    } else if (currentHeading && (tagName === 'TABLE' || tagName === 'DIV')) {
    } else if (currentHeading) {
      const t = $(node).text().trim();
      if (t) currentParts.push(t);
    }
  });
  if (currentHeading && currentParts.length > 0) {
    const headingLower = currentHeading.toLowerCase();
    if (headingLower.includes('responsible') || headingLower.includes('contact/responsible')) {
      responsibleClub = currentParts.join(' ').replace(/\s+/g, ' ').trim();
    }
  }

  return responsibleClub;
}

export function scrapeSiteguidePage(html: string): ScrapeResult {
  const $ = cheerio.load(html);
  const title = $('title').text().trim();
  const bodyText = $('.col-md').text().trim();
  const tableText = $('.col-md-4 table').text().trim();

  const sidebarMeta: string[] = [];
  const sidebarContainer = $('.col-md-4 h3').first().parent();
  if (sidebarContainer.length) {
    const nodes = sidebarContainer.contents();
    let currentHeading = '';
    let currentParts: string[] = [];
    nodes.each((_i, node) => {
      const tagName = node.type === 'tag' ? (node as any).tagName?.toUpperCase() : '';
      if (tagName === 'H3') {
        if (currentHeading && currentParts.length > 0) {
          sidebarMeta.push(`${currentHeading}: ${currentParts.join(' ').replace(/\s+/g, ' ').trim()}`);
        }
        currentHeading = $(node).text().trim();
        currentParts = [];
      } else if (currentHeading && (tagName === 'TABLE' || tagName === 'DIV')) {
      } else if (currentHeading) {
        const t = $(node).text().trim();
        if (t) currentParts.push(t);
      }
    });
    if (currentHeading && currentParts.length > 0) {
      sidebarMeta.push(`${currentHeading}: ${currentParts.join(' ').replace(/\s+/g, ' ').trim()}`);
    }
  }
  const sidebarSection = sidebarMeta.length > 0 ? `\n\nSIDEBAR METADATA:\n${sidebarMeta.join('\n')}` : '';

  const closedBadge = $('span.badge-danger, .badge-danger, .alert-danger, .badge').filter((_i, el) => {
    const text = $(el).text().trim().toLowerCase();
    return text === 'closed' || text.includes('closed');
  }).length > 0;
  const closedText = $('body').text().toLowerCase();
  const isSiteClosed = closedBadge ||
    /\bsite\s+(is\s+)?closed\b/.test(closedText) ||
    /\boperations\s+have\s+been\s+suspended\b/.test(closedText) ||
    /\bflying\s+(at\s+this\s+site\s+)?has\s+been\s+suspended\b/.test(closedText) ||
    /\bsite\s+(is\s+)?not\s+operational\b/.test(closedText) ||
    /\bprohibited\s+for\s+use\b/.test(closedText) ||
    /\btemporarily\s+prohibited\b/.test(closedText);
  const closedNotice = isSiteClosed ? '\n\nSITE STATUS: This site is marked as CLOSED on siteguide.org.au. Set status to "closed".' : '';

  const links: string[] = [];
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    const linkText = $(el).text().trim();
    if (href && (href.includes('google.com/maps') || href.includes('maps.google') || href.includes('goo.gl/maps') || href.includes('what3words') || href.includes('bom.gov.au') || href.includes('navigate') || linkText.toLowerCase().includes('navigate'))) {
      links.push(`[${linkText}](${href})`);
    }
  });
  const linksSection = links.length > 0 ? `\n\nIMPORTANT LINKS FOUND ON PAGE:\n${links.join('\n')}` : '';

  const allText = `Page Title: ${title}\n\n${tableText}\n\n${bodyText}${sidebarSection}${linksSection}${closedNotice}`.trim();

  return { allText, isSiteClosed, $, title };
}
