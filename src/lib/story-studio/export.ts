import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';

const INCH = 72;
const TRIM_IN = 8.5;
const BLEED_IN = 0.125;
const TRIM = TRIM_IN * INCH;
const BLEED = BLEED_IN * INCH;
// KDP bleed interiors add 0.125in to the outside edge and 0.125in to top/bottom.
const PAGE_W = (TRIM_IN + BLEED_IN) * INCH;
const PAGE_H = (TRIM_IN + BLEED_IN * 2) * INCH;
const SAFE = 0.375 * INCH;
const PAGE_COUNT = 24;
const REQUIRED_ILLUSTRATIONS = 12;
const PREMIUM_COLOR_SPINE_PER_PAGE_IN = 0.002347;

function clean(value: unknown) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'book'; }
function wrap(text: string, max = 44) {
  const words = clean(text).split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
async function imageBytes(url?: string | null) {
  if (!url) return null;
  const r = await fetch(url);
  if (!r.ok) return null;
  return new Uint8Array(await r.arrayBuffer());
}
async function embedImage(pdf: PDFDocument, bytes: Uint8Array) {
  try { return await pdf.embedPng(bytes); }
  catch { return await pdf.embedJpg(bytes); }
}
function drawWrappedText(page: any, text: string, opts: { x: number; y: number; widthChars: number; maxLines: number; size: number; lineHeight: number; font: any; color?: any }) {
  const lines = wrap(text, opts.widthChars).slice(0, opts.maxLines);
  let y = opts.y;
  for (const line of lines) {
    page.drawText(line, { x: opts.x, y, size: opts.size, font: opts.font, color: opts.color || rgb(0.1, 0.1, 0.1) });
    y -= opts.lineHeight;
  }
  return { lines, finalY: y };
}

export async function buildPublisherPackage(project: Record<string, any>) {
  const pages = Array.isArray(project.manuscript) ? project.manuscript.slice(0, PAGE_COUNT) : [];
  if (project.project_type !== 'childrens_book') throw Object.assign(new Error('KDP export currently supports children’s books first.'), { status: 422 });
  if (pages.length !== PAGE_COUNT) throw Object.assign(new Error(`KDP export requires exactly ${PAGE_COUNT} finished interior pages.`), { status: 422 });

  const illustrations = Array.isArray(project.illustrations) ? project.illustrations.filter((x: any) => x?.url && x?.qa?.passed === true) : [];
  if (illustrations.length !== REQUIRED_ILLUSTRATIONS) throw Object.assign(new Error(`KDP export requires exactly ${REQUIRED_ILLUSTRATIONS} QA-approved illustrations.`), { status: 422 });

  const imageByPage = new Map<number, { url: string; item: any }>();
  for (const item of illustrations) {
    if (item?.page_number && item?.url) imageByPage.set(Number(item.page_number), { url: String(item.url), item });
  }

  const requiredIllustrationPages = pages.filter((p: any) => p?.illustrate === true).map((p: any) => Number(p.page_number));
  if (requiredIllustrationPages.length !== REQUIRED_ILLUSTRATIONS) throw Object.assign(new Error(`Manuscript must contain exactly ${REQUIRED_ILLUSTRATIONS} illustration slots.`), { status: 422 });
  for (const pageNumber of requiredIllustrationPages) {
    if (!imageByPage.has(pageNumber)) throw Object.assign(new Error(`Missing QA-approved illustration for page ${pageNumber}.`), { status: 422 });
  }

  const assetBytes = new Map<number, Uint8Array>();
  for (const pageNumber of requiredIllustrationPages) {
    const entry = imageByPage.get(pageNumber)!;
    const bytes = await imageBytes(entry.url);
    if (!bytes) throw Object.assign(new Error(`Illustration asset for page ${pageNumber} could not be downloaded. Export stopped instead of creating a blank page.`), { status: 502 });
    assetBytes.set(pageNumber, bytes);
  }

  const coverSourceBytes = await imageBytes(project.cover_image_url);
  if (!coverSourceBytes) throw Object.assign(new Error('The cover artwork could not be downloaded. Export stopped.'), { status: 502 });

  const interior = await PDFDocument.create();
  const font = await interior.embedFont(StandardFonts.Helvetica);
  const bold = await interior.embedFont(StandardFonts.HelveticaBold);

  for (let i = 0; i < PAGE_COUNT; i++) {
    const source = pages[i] || {};
    const pageNumber = i + 1;
    const page = interior.addPage([PAGE_W, PAGE_H]);
    const bytes = assetBytes.get(pageNumber) || null;

    if (bytes) {
      const img = await embedImage(interior, bytes);
      const scale = Math.max(PAGE_W / img.width, PAGE_H / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, width: w, height: h });
      page.drawRectangle({ x: SAFE, y: SAFE, width: PAGE_W - SAFE * 2, height: 1.55 * INCH, color: rgb(1, 1, 1), opacity: 0.9 });
    }

    const pageType = clean(source.page_type || 'story');
    const title = clean(source.title || (pageType === 'copyright' ? '' : `Page ${pageNumber}`));
    const content = clean(source.content || '');
    let y = bytes ? SAFE + 1.2 * INCH : PAGE_H - SAFE - 0.5 * INCH;

    if (title) {
      page.drawText(title, { x: SAFE + 8, y, size: pageType === 'title' ? 22 : 15, font: bold, color: rgb(0.08, 0.08, 0.08) });
      y -= pageType === 'title' ? 34 : 24;
    }
    drawWrappedText(page, content, { x: SAFE + 8, y, widthChars: bytes ? 58 : 68, maxLines: bytes ? 10 : 24, size: bytes ? 11.5 : 13, lineHeight: bytes ? 16 : 19, font });
  }

  interior.setTitle(clean(project.title));
  interior.setAuthor(clean(project.metadata?.author || ''));
  interior.setCreator('The Tool Shed Story Studio');
  interior.setProducer('The Tool Shed Story Studio');
  const interiorBytes = await interior.save({ useObjectStreams: false });

  // A 24-page color picture book must use Premium Color on KDP; Standard Color starts at 72 pages.
  const spineIn = PAGE_COUNT * PREMIUM_COLOR_SPINE_PER_PAGE_IN;
  const spine = spineIn * INCH;
  const coverW = (TRIM_IN * 2 + spineIn + BLEED_IN * 2) * INCH;
  const coverH = (TRIM_IN + BLEED_IN * 2) * INCH;
  const cover = await PDFDocument.create();
  const cpage = cover.addPage([coverW, coverH]);
  const cfont = await cover.embedFont(StandardFonts.Helvetica);
  const cbold = await cover.embedFont(StandardFonts.HelveticaBold);
  cpage.drawRectangle({ x: 0, y: 0, width: coverW, height: coverH, color: rgb(0.96, 0.94, 0.9) });

  const coverImg = await embedImage(cover, coverSourceBytes);
  const frontX = BLEED + TRIM + spine;
  const scale = Math.max(TRIM / coverImg.width, coverH / coverImg.height);
  const w = coverImg.width * scale;
  const h = coverImg.height * scale;
  cpage.drawImage(coverImg, { x: frontX + (TRIM - w) / 2, y: (coverH - h) / 2, width: w, height: h });
  cpage.drawRectangle({ x: frontX + SAFE, y: SAFE, width: TRIM - SAFE * 2, height: 1.5 * INCH, color: rgb(1, 1, 1), opacity: 0.9 });
  drawWrappedText(cpage, clean(project.title), { x: frontX + SAFE + 8, y: SAFE + 0.98 * INCH, widthChars: 28, maxLines: 2, size: 22, lineHeight: 25, font: cbold, color: rgb(0.08, 0.08, 0.08) });
  const author = clean(project.metadata?.author || 'Author');
  cpage.drawText(author, { x: frontX + SAFE + 8, y: SAFE + 0.4 * INCH, size: 12, font: cfont, color: rgb(0.15, 0.15, 0.15) });

  const backCopy = clean(project.metadata?.back_cover_copy || project.idea).slice(0, 900);
  drawWrappedText(cpage, backCopy, { x: SAFE, y: coverH - SAFE - 0.7 * INCH, widthChars: 48, maxLines: 18, size: 11, lineHeight: 15, font: cfont, color: rgb(0.12, 0.12, 0.12) });
  const coverPdf = await cover.save({ useObjectStreams: false });

  const manuscript = pages.map((p: any, i: number) => `PAGE ${i + 1} — ${clean(p.page_type || 'story').toUpperCase()}\n${clean(p.title)}\n\n${clean(p.content)}`).join('\n\n---\n\n');
  const metadata = {
    title: clean(project.title),
    subtitle: clean(project.metadata?.subtitle),
    author: clean(project.metadata?.author),
    description: clean(project.metadata?.description || project.idea),
    keywords: project.metadata?.keywords || [],
    categories: project.metadata?.categories || [],
    language: clean(project.metadata?.language || 'English'),
    trim_size: '8.5 x 8.5 in',
    page_count: PAGE_COUNT,
    bleed: true,
    interior_color: 'Premium Color',
    paper: 'White',
    spine_width_in: Number(spineIn.toFixed(6)),
    interior_pdf_size_in: [TRIM_IN + BLEED_IN, TRIM_IN + BLEED_IN * 2],
    cover_pdf_size_in: [Number((TRIM_IN * 2 + spineIn + BLEED_IN * 2).toFixed(6)), TRIM_IN + BLEED_IN * 2],
  };

  const prepressValidation = {
    passed: true,
    checks: [
      { code: 'page_count', passed: pages.length === PAGE_COUNT, expected: PAGE_COUNT, actual: pages.length },
      { code: 'illustration_count', passed: imageByPage.size === REQUIRED_ILLUSTRATIONS, expected: REQUIRED_ILLUSTRATIONS, actual: imageByPage.size },
      { code: 'cover_present', passed: Boolean(project.cover_image_url) },
      { code: 'premium_color_required', passed: true, reason: 'KDP Standard Color requires at least 72 pages; this 24-page book is configured for Premium Color.' },
      { code: 'interior_bleed_dimensions', passed: true, width_in: TRIM_IN + BLEED_IN, height_in: TRIM_IN + BLEED_IN * 2 },
      { code: 'cover_spine_formula', passed: true, inches_per_page: PREMIUM_COLOR_SPINE_PER_PAGE_IN, spine_width_in: Number(spineIn.toFixed(6)) },
    ],
  };

  const qaReport = {
    generated_at: new Date().toISOString(),
    project_title: clean(project.title),
    last_qa: project.last_qa || null,
    qa_history: Array.isArray(project.qa_history) ? project.qa_history : [],
    illustration_qa: illustrations.map((x: any) => ({ page_number: x.page_number, qa: x.qa || null, attempts: x.attempts || 1, estimated_run_cost_usd: x.estimated_run_cost_usd || 0 })),
    prepress: prepressValidation,
    disclaimer: 'Story Studio prepares files for publishing, but Amazon KDP retains final acceptance authority and approval is not guaranteed.',
  };

  const projectManifest = {
    title: clean(project.title),
    project_type: project.project_type,
    status: project.status,
    export_status: project.export_status,
    page_count: PAGE_COUNT,
    illustration_count: REQUIRED_ILLUSTRATIONS,
    illustration_pages: requiredIllustrationPages,
    trim_size: metadata.trim_size,
    bleed: metadata.bleed,
    interior_color: metadata.interior_color,
    files: ['interior PDF', 'cover PDF', 'manuscript', 'metadata sheet', 'illustration assets', 'upload checklist', 'QA report', 'project manifest'],
  };

  const checklist = `STORY STUDIO — KDP / PUBLISHER DELIVERY CHECKLIST\n\n✓ Interior: 8.5 x 8.5 in trim, 24 pages, bleed-ready PDF\n✓ Interior color: Premium Color on white paper\n✓ Cover: separate full-wrap PDF using KDP Premium Color spine calculation\n✓ Manuscript: editable text copy\n✓ Metadata: title, description, keywords and categories\n✓ Illustration assets: included separately in /assets\n✓ QA report and project manifest included\n\nIMPORTANT: Open both PDFs in the destination publisher’s previewer and review every page before submission. Amazon KDP and other publishers retain final acceptance authority. Story Studio formats files for upload but cannot guarantee approval.\n`;

  const zip = new JSZip();
  const base = slug(clean(project.title));
  zip.file(`${base}-interior-kdp.pdf`, interiorBytes);
  zip.file(`${base}-cover-kdp.pdf`, coverPdf);
  zip.file(`${base}-manuscript.txt`, manuscript);
  zip.file(`${base}-metadata.json`, JSON.stringify(metadata, null, 2));
  zip.file(`${base}-qa-report.json`, JSON.stringify(qaReport, null, 2));
  zip.file(`${base}-project-manifest.json`, JSON.stringify(projectManifest, null, 2));
  zip.file('UPLOAD-CHECKLIST.txt', checklist);
  zip.file('README.txt', 'This package was generated by The Tool Shed Story Studio. Review the PDFs in the target publisher previewer before submission. KDP approval is not guaranteed.');
  for (const [pageNumber, bytes] of assetBytes.entries()) zip.file(`assets/page-${String(pageNumber).padStart(2, '0')}.png`, bytes);
  zip.file('assets/cover-art.png', coverSourceBytes);

  const archive = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { archive, filename: `${base}-publisher-package.zip`, metadata, checklist, qaReport, projectManifest, prepressValidation, pageCount: PAGE_COUNT, illustrationCount: imageByPage.size };
}
