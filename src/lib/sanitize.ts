import sanitizeHtml from 'sanitize-html';

/**
 * Article bodies arrive as Markdown, but CommonMark allows raw HTML
 * passthrough — so a malicious or buggy upstream payload could smuggle
 * <script>, event handlers, or javascript: URLs straight into a public
 * page. This strips anything outside a conservative allowlist while
 * leaving plain Markdown syntax (which isn't HTML) untouched.
 */
export function sanitizeArticleContent(markdown: string): string {
  return sanitizeHtml(markdown, {
    allowedTags: [
      'a', 'b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li',
      'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span',
      'sub', 'sup', 'del',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
  });
}

/** Plain-text fields (title, description, alt text, ...) get HTML stripped entirely. */
export function sanitizePlainText(value: string): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();
}
