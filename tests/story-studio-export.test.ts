import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { buildPublisherPackage } from '../src/lib/story-studio/export';

const tinyPng = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZrK0AAAAASUVORK5CYII=', 'base64'));

test('Story Studio builds a structurally valid 24-page Premium Color package', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(tinyPng, { status: 200, headers: { 'content-type': 'image/png' } })) as typeof fetch;

  try {
    const pages = Array.from({ length: 24 }, (_, i) => ({
      page_number: i + 1,
      page_type: i === 0 ? 'title' : i === 1 ? 'copyright' : i === 23 ? 'endmatter' : 'story',
      title: i === 0 ? 'Milo and the Moon Lantern' : i === 1 ? 'Copyright' : `Page ${i + 1}`,
      content: i === 1 ? 'Copyright © Author. All rights reserved.' : `Short test content for page ${i + 1}.`,
      illustrate: i >= 2 && i < 14,
    }));
    const illustrations = pages.filter((p) => p.illustrate).map((p) => ({
      page_number: p.page_number,
      url: `https://example.test/page-${p.page_number}.png`,
      qa: { passed: true, score: 96, issues: [] },
      attempts: 1,
    }));

    const bundle = await buildPublisherPackage({
      title: 'Milo and the Moon Lantern',
      idea: 'A mouse finds a moonlit lantern.',
      project_type: 'childrens_book',
      status: 'layout_qa_pending',
      export_status: 'not_ready',
      cover_image_url: 'https://example.test/cover.png',
      manuscript: pages,
      illustrations,
      metadata: { author: 'Test Author', description: 'Test description', keywords: ['bedtime'], categories: ['Children'], language: 'English', back_cover_copy: 'A gentle bedtime adventure.' },
      qa_history: [],
      last_qa: { passed: true, score: 96 },
    });

    assert.equal(bundle.pageCount, 24);
    assert.equal(bundle.illustrationCount, 12);
    assert.equal(bundle.metadata.interior_color, 'Premium Color');
    assert.equal(bundle.metadata.spine_width_in, 0.056328);
    assert.deepEqual(bundle.metadata.interior_pdf_size_in, [8.625, 8.75]);
    assert.deepEqual(bundle.metadata.cover_pdf_size_in, [17.306328, 8.75]);
    assert.equal(bundle.prepressValidation.passed, true);

    const zip = await JSZip.loadAsync(bundle.archive);
    const names = Object.keys(zip.files);
    assert(names.some((n) => n.endsWith('-interior-kdp.pdf')));
    assert(names.some((n) => n.endsWith('-cover-kdp.pdf')));
    assert(names.some((n) => n.endsWith('-qa-report.json')));
    assert(names.some((n) => n.endsWith('-project-manifest.json')));
    assert(names.includes('UPLOAD-CHECKLIST.txt'));
    assert(names.includes('assets/cover-art.png'));
    assert.equal(names.filter((n) => /^assets\/page-\d{2}\.png$/.test(n)).length, 12);

    const interiorName = names.find((n) => n.endsWith('-interior-kdp.pdf'))!;
    const coverName = names.find((n) => n.endsWith('-cover-kdp.pdf'))!;
    const interior = await PDFDocument.load(await zip.file(interiorName)!.async('uint8array'));
    const cover = await PDFDocument.load(await zip.file(coverName)!.async('uint8array'));
    assert.equal(interior.getPageCount(), 24);
    assert.equal(cover.getPageCount(), 1);
    const interiorSize = interior.getPage(0).getSize();
    assert(Math.abs(interiorSize.width / 72 - 8.625) < 0.001);
    assert(Math.abs(interiorSize.height / 72 - 8.75) < 0.001);
    const coverSize = cover.getPage(0).getSize();
    assert(Math.abs(coverSize.width / 72 - 17.306328) < 0.001);
    assert(Math.abs(coverSize.height / 72 - 8.75) < 0.001);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Story Studio refuses missing illustration assets instead of silently making blank pages', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('page-7.png')) return new Response('missing', { status: 404 });
    return new Response(tinyPng, { status: 200, headers: { 'content-type': 'image/png' } });
  }) as typeof fetch;

  try {
    const pages = Array.from({ length: 24 }, (_, i) => ({ page_number: i + 1, page_type: i === 0 ? 'title' : i === 1 ? 'copyright' : 'story', title: `Page ${i + 1}`, content: 'Test', illustrate: i >= 2 && i < 14 }));
    const illustrations = pages.filter((p) => p.illustrate).map((p) => ({ page_number: p.page_number, url: `https://example.test/page-${p.page_number}.png`, qa: { passed: true, score: 95, issues: [] } }));
    await assert.rejects(() => buildPublisherPackage({ title: 'Milo', idea: 'Test', project_type: 'childrens_book', cover_image_url: 'https://example.test/cover.png', manuscript: pages, illustrations, metadata: {} }), /could not be downloaded/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
