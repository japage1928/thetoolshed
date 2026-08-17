const GITHUB_API = 'https://api.github.com';

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export class GitHubContentError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, status?: number, code = 'github_error') {
    super(message);
    this.name = 'GitHubContentError';
    this.status = status;
    this.code = code;
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'thetoolshed-blog-publisher',
  };
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function githubError(res: Response, operation: string): Promise<GitHubContentError> {
  let message = '';
  try {
    const body = (await res.text()).slice(0, 500);
    if (body) {
      try {
        const parsed = JSON.parse(body) as { message?: string; documentation_url?: string };
        message = parsed.message || body;
      } catch {
        message = body;
      }
    }
  } catch {
    // Ignore response-body read failures and return the HTTP status below.
  }

  return new GitHubContentError(
    `${operation} failed (GitHub HTTP ${res.status}${message ? `: ${message}` : ''})`,
    res.status,
    'github_api_error',
  );
}

/** Verify that the configured repository and target branch are accessible. */
export async function verifyRepository(config: GitHubConfig): Promise<void> {
  const repoUrl = `${GITHUB_API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  const repoRes = await fetch(repoUrl, { headers: authHeaders(config.token) });

  if (!repoRes.ok) {
    throw await githubError(repoRes, 'GitHub repository check');
  }

  const branchUrl = `${repoUrl}/branches/${encodeURIComponent(config.branch)}`;
  const branchRes = await fetch(branchUrl, { headers: authHeaders(config.token) });

  if (!branchRes.ok) {
    throw await githubError(branchRes, 'GitHub branch check');
  }
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

  throw await githubError(res, 'GitHub duplicate check');
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
    throw await githubError(res, 'GitHub Contents commit');
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
