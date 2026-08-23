import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';

const INCH = 72;
const TRIM = 8.5 * INCH;
const BLEED = 0.125 * INCH;
const PAGE_W = TRIM + BLEED;
const PAGE_H = TRIM + BLEED * 2;
const SAFE = 0.375 * INCH;

function clean(value: unknown) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'book'; }
function wrap(text: string, max = 44) {
  const words = clean(text).split(' ').filter(Boolean); const lines: string[] = []; let line = '';
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (next.length > max && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line); return lines;
}
async function imageBytes(url?: string | null) { if (!url) return null; const r = await fetch(url); if (!r.ok) return null; return new Uint8Array(await r.arrayBuffer()); }
async function embedImage(pdf: PDFDocument, bytes: Uint8Array) { try { return await pdf.embedPng(bytes); } catch { return await pdf.embedJpg(bytes); } }

export async function buildPublisherPackage(project: Record<string, any>) {
  const pages = Array.isArray(project.manuscript) ? project.manuscript.slice(0, 24) : [];
  if (project.project_type !== 'childrens_book') throw Object.assign(new Error('KDP export currently supports children’s books first.'), { status: 422 });
  if (pages.length !== 24) throw Object.assign(new Error('KDP export requires exactly 24 finished interior pages.'), { status: 422 });

  const illustrations = Array.isArray(project.illustrations) ? project.illustrations : [];
  const imageByPage = new Map<number, string>();
  for (const item of illustrations) if (item?.page_number && item?.url) imageByPage.set(Number(item.page_number), String(item.url));

  const interior = await PDFDocument.create();
  const font = await interior.embedFont(StandardFonts.Helvetica);
  const bold = await interior.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < 24; i++) {
    const source = pages[i] || {};
    const page = interior.addPage([PAGE_W, PAGE_H]);
    const imgUrl = imageByPage.get(i + 1);
    const bytes = await imageBytes(imgUrl);
    if (bytes) {
      const img = await embedImage(interior, bytes); const scale = Math.max(PAGE_W / img.width, PAGE_H / img.height);
      const w = img.width * scale, h = img.height * scale;
      page.drawImage(img, { x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, width: w, height: h });
      page.drawRectangle({ x: SAFE, y: SAFE, width: PAGE_W - SAFE * 2, height: 1.55 * INCH, color: rgb(1, 1, 1), opacity: 0.88 });
    }
    const title = clean(source.title || `Page ${i + 1}`);
    const content = clean(source.content || '');
    let y = bytes ? SAFE + 1.2 * INCH : PAGE_H - SAFE - 0.5 * INCH;
    page.drawText(title, { x: SAFE + 8, y, size: 15, font: bold, color: rgb(0.08, 0.08, 0.08) }); y -= 24;
    for (const line of wrap(content, 58).slice(0, 10)) { page.drawText(line, { x: SAFE + 8, y, size: 11.5, font, color: rgb(0.1, 0.1, 0.1) }); y -= 16; }
  }
  interior.setTitle(clean(project.title)); interior.setCreator('The Tool Shed Story Studio'); interior.setProducer('The Tool Shed Story Studio');
  const interiorBytes = await interior.save();

  const pageCount = 24;
  const spine = pageCount * 0.002252 * INCH;
  const coverW = TRIM * 2 + spine + BLEED * 2;
  const coverH = TRIM + BLEED * 2;
  const cover = await PDFDocument.create();
  const cpage = cover.addPage([coverW, coverH]);
  const cfont = await cover.embedFont(StandardFonts.Helvetica);
  const cbold = await cover.embedFont(StandardFonts.HelveticaBold);
  cpage.drawRectangle({ x: 0, y: 0, width: coverW, height: coverH, color: rgb(0.96, 0.94, 0.9) });
  const coverBytes = await imageBytes(project.cover_image_url);
  if (coverBytes) {
    const img = await embedImage(cover, coverBytes); const frontX = BLEED + TRIM + spine; const scale = Math.max(TRIM / img.width, coverH / img.height); const w = img.width * scale, h = img.height * scale;
    cpage.drawImage(img, { x: frontX + (TRIM - w) / 2, y: (coverH - h) / 2, width: w, height: h });
    cpage.drawRectangle({ x: frontX + SAFE, y: SAFE, width: TRIM - SAFE * 2, height: 1.45 * INCH, color: rgb(1, 1, 1), opacity: 0.88 });
  }
  const frontX = BLEED + TRIM + spine;
  cpage.drawText(clean(project.title), { x: frontX + SAFE, y: SAFE + 0.9 * INCH, size: 24, font: cbold, maxWidth: TRIM - SAFE * 2, color: rgb(0.08, 0.08, 0.08) });
  cpage.drawText(clean(project.metadata?.author || 'Author'), { x: frontX + SAFE, y: SAFE + 0.55 * INCH, size: 12, font: cfont, color: rgb(0.15, 0.15, 0.15) });
  cpage.drawText(clean(project.metadata?.back_cover_copy || project.idea).slice(0, 700), { x: SAFE, y: coverH - SAFE - 1.1 * INCH, size: 11, font: cfont, maxWidth: TRIM - SAFE * 2, lineHeight: 15, color: rgb(0.12, 0.12, 0.12) });
  const coverPdf = await cover.save();

  const manuscript = pages.map((p: any, i: number) => `PAGE ${i + 1}\n${clean(p.title)}\n\n${clean(p.content)}`).join('\n\n---\n\n');
  const metadata = {
    title: clean(project.title), subtitle: clean(project.metadata?.subtitle), author: clean(project.metadata?.author),
    description: clean(project.metadata?.description || project.idea), keywords: project.metadata?.keywords || [], categories: project.metadata?.categories || [],
    trim_size: '8.5 x 8.5 in', page_count: 24, bleed: true, language: clean(project.metadata?.language || 'English'),
  };
  const checklist = `STORY STUDIO — KDP / PUBLISHER DELIVERY CHECKLIST\n\n✓ Interior: 8.5 x 8.5 in trim, 24 pages, bleed-ready PDF\n✓ Cover: separate full-wrap PDF with calculated spine width\n✓ Manuscript: editable text copy\n✓ Metadata: title, description, keywords and categories\n✓ Illustration assets represented in the interior package\n\nBefore publication, open both PDFs in the destination publisher’s previewer and review every page. Amazon KDP and other publishers retain final acceptance authority. Story Studio formats files for upload but cannot guarantee approval.\n`;

  const zip = new JSZip(); const base = slug(clean(project.title));
  zip.file(`${base}-interior-kdp.pdf`, interiorBytes); zip.file(`${base}-cover-kdp.pdf`, coverPdf); zip.file(`${base}-manuscript.txt`, manuscript); zip.file(`${base}-metadata.json`, JSON.stringify(metadata, null, 2)); zip.file('UPLOAD-CHECKLIST.txt', checklist);
  const archive = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { archive, filename: `${base}-publisher-package.zip`, metadata, checklist, pageCount, illustrationCount: imageByPage.size };
}
