export function toolDomain(websiteUrl: string): string {
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function toolIconSrc(websiteUrl: string, iconUrl?: string | null, size = 64): string {
  if (iconUrl) return iconUrl;
  const domain = toolDomain(websiteUrl);
  if (!domain) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

export function toolInitials(name: string): string {
  const parts = name
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function toolMarkAlt(name: string): string {
  return `${name} logo`;
}
