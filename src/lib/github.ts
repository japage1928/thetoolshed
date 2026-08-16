const GITHUB_API = 'https://api.github.com';

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export class GitHubContentError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GitHubContentError';
    this.status = status;
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** True if `path` already exists on `config.branch`. */
export async function fileExists(
  config: GitHubConfig,
  path: string,
): Promise<boolean> {
  const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(config.branch)}`;
  const res = await fetch(url, { headers: authHeaders(config.token) });

  if (res.status === 404) return false;
  if (res.ok) return true;

  throw new GitHubContentError(
    `GitHub API error checking file existence (status ${res.status})`,
    res.status,
  );
}

/**
 * Creates a new file at `path` on `config.branch` via the GitHub Contents
 * API. This is a real commit — Netlify's GitHub integration picks it up
 * and triggers a normal deploy, exactly as if a human had pushed it.
 */
export async function createFile(
  config: GitHubConfig,
  path: string,
  content: string,
  commitMessage: string,
): Promise<{ commitSha: string; htmlUrl: string }> {
  const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${encodePath(path)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...authHeaders(config.token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch: config.branch,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new GitHubContentError(
      `GitHub API error creating file (status ${res.status}): ${errText.slice(0, 300)}`,
      res.status,
    );
  }

  const data = (await res.json()) as {
    commit?: { sha?: string };
    content?: { html_url?: string };
  };

  return {
    commitSha: data.commit?.sha ?? '',
    htmlUrl: data.content?.html_url ?? '',
  };
}
