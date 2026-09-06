import type { AITool } from '../../lib/tool-schema';

const REVIEWED = '2026-09-06';

/**
 * Public-positioning overlays for tools we have actually reviewed enough
 * to describe. No invented prices, scores, or generic “established option” copy.
 */
export const TOOL_INTELLIGENCE: Record<string, Partial<AITool>> = {
  chatgpt: {
    company: 'OpenAI',
    primary_use_cases: [
      'Everyday writing and rewriting',
      'General Q&A and explanation',
      'Light coding help',
      'Analysis of files you upload',
    ],
    free_tier: true,
    pricing_summary:
      'OpenAI publishes a free ChatGPT tier plus paid consumer, business, and API plans. Plan names, limits, and prices change. Confirm current options on OpenAI’s pricing pages before you budget.',
    pricing_url: 'https://openai.com/chatgpt/pricing',
    api_available: true,
    strengths: [
      'Broad consumer product: writing, chat, file analysis, and (on supported plans) browsing, images, and voice in one place.',
      'Large existing prompt/GPT ecosystem if you want prebuilt helpers rather than a blank chat.',
      'API access for the same model family when you outgrow the chat UI.',
    ],
    weaknesses: [
      'Not source-first. If the job is “show me the citations,” a research tool is a better default.',
      'Product surface and model names change often; a workflow you set up last quarter may look different now.',
    ],
    best_fit: [
      'People who want one general assistant for mixed writing, thinking, and light technical work.',
      'Teams already standardized on OpenAI’s API or ChatGPT workspace.',
    ],
    poor_fit: [
      'Research that must start from checkable web sources.',
      'Long, careful document work where a large-context writing specialist is the actual job.',
    ],
    alternatives: ['claude', 'grok', 'gemini', 'perplexity'],
    limitations: [
      'We are describing the public product shape, not a bake-off of model quality.',
      'Capabilities differ by plan, region, and whether you use the website, apps, or API.',
    ],
    last_verified_at: REVIEWED,
    verification_confidence: 'medium',
    sources: [
      { label: 'ChatGPT', url: 'https://chatgpt.com' },
      { label: 'OpenAI ChatGPT pricing', url: 'https://openai.com/chatgpt/pricing' },
    ],
  },
  claude: {
    company: 'Anthropic',
    primary_use_cases: [
      'Long-form writing and editing',
      'Reading and analyzing large documents',
      'Reasoning through a messy brief',
      'Coding assistance and Claude Code workflows',
    ],
    free_tier: true,
    pricing_summary:
      'Anthropic publishes free and paid Claude plans plus API pricing. Limits, context, and prices depend on the plan and model. Verify on Anthropic’s pricing page.',
    pricing_url: 'https://www.anthropic.com/pricing',
    api_available: true,
    strengths: [
      'Public positioning emphasizes long context, careful writing, and working through large materials.',
      'Projects, Artifacts, and Claude Code are first-class ways to keep work attached to files and repos rather than a one-off chat.',
      'API is widely used when you want Claude inside your own tools.',
    ],
    weaknesses: [
      'Less of a “do everything in one consumer suite” product than ChatGPT (images, voice, and browsing vary by plan and change over time).',
      'If you mainly need live web research with citations, start with a research tool.',
    ],
    best_fit: [
      'Writing, editing, or analysis where the source material is long.',
      'Developers who want an assistant that can sit on a codebase (especially via Claude Code).',
    ],
    poor_fit: [
      'People who want one assistant that is also their image generator and voice app.',
      'Quick “what’s happening on the web right now” lookups.',
    ],
    alternatives: ['chatgpt', 'grok', 'claude-code', 'cursor'],
    limitations: [
      'Long-context usefulness still depends on how you load and ask about the material.',
      'We have not scored Claude against other models on a benchmark suite.',
    ],
    last_verified_at: REVIEWED,
    verification_confidence: 'medium',
    sources: [
      { label: 'Claude', url: 'https://claude.ai' },
      { label: 'Anthropic pricing', url: 'https://www.anthropic.com/pricing' },
      { label: 'Claude Code', url: 'https://www.anthropic.com/claude-code' },
    ],
  },
  grok: {
    company: 'xAI',
    primary_use_cases: [
      'Conversational assistance',
      'Current-events questions tied to X',
      'Brainstorming in a less formal register',
    ],
    free_tier: true,
    pricing_summary:
      'Grok is offered through grok.com and X, with free and paid access that xAI and X change over time. Confirm current availability and pricing on grok.com and x.ai — do not budget from third-party recaps.',
    pricing_url: 'https://grok.com',
    api_available: true,
    strengths: [
      'Public positioning is built around real-time / X-connected information and a more informal conversational style.',
      'Useful when the job is “what are people saying about this right now,” not a polished memo.',
    ],
    weaknesses: [
      'A looser tone is a feature for some jobs and a liability for client-facing or regulated writing.',
      'X-connected answers still need the same source-checking you would do with any live feed.',
    ],
    best_fit: [
      'People already working in the X ecosystem who want an assistant that can see current posts.',
      'Drafting that should sound conversational rather than institutional.',
    ],
    poor_fit: [
      'Formal long-form writing where caution and structure matter more than freshness.',
      'Research that must produce a clean citation list.',
    ],
    alternatives: ['chatgpt', 'claude', 'perplexity'],
    limitations: [
      'Access, rate limits, and X integration depend on which Grok/X plan you have.',
      'We are not ranking Grok’s model quality against GPT or Claude.',
    ],
    last_verified_at: REVIEWED,
    verification_confidence: 'medium',
    sources: [
      { label: 'Grok', url: 'https://grok.com' },
      { label: 'xAI', url: 'https://x.ai' },
    ],
  },
  perplexity: {
    company: 'Perplexity',
    primary_use_cases: [
      'Web research with citations',
      'Comparing sources on a question',
      'Quick briefings before you write',
    ],
    free_tier: true,
    pricing_summary:
      'Perplexity publishes a free product and paid Pro/enterprise options. Search limits and model choices depend on the plan. Check Perplexity’s site for current pricing.',
    pricing_url: 'https://www.perplexity.ai/pro',
    api_available: true,
    strengths: [
      'The product is search-first: answers are built to come with sources you can open.',
      'Better default than a general chat app when the job is “look this up and show your work.”',
    ],
    weaknesses: [
      'It is not trying to be your full writing, coding, and file-analysis suite.',
      'Cited pages can still be wrong, thin, or outdated — you still have to read them.',
    ],
    best_fit: [
      'Research, due diligence, and “what do sources say” questions.',
      'A first pass before you move the notes into a writing or coding tool.',
    ],
    poor_fit: [
      'Long drafting, refactoring a repo, or turning research into a finished deliverable in one place.',
    ],
    alternatives: ['chatgpt', 'claude', 'notebooklm', 'gemini'],
    limitations: [
      'Citations are a starting point, not a guarantee the summary is complete.',
      'We have not measured Perplexity against Google, ChatGPT browsing, or Gemini on a shared query set.',
    ],
    last_verified_at: REVIEWED,
    verification_confidence: 'medium',
    sources: [
      { label: 'Perplexity', url: 'https://www.perplexity.ai' },
      { label: 'Perplexity Pro', url: 'https://www.perplexity.ai/pro' },
    ],
  },
  cursor: {
    company: 'Anysphere',
    primary_use_cases: [
      'Editing and navigating a codebase in an AI-first editor',
      'Inline and chat-based coding help',
      'Agent-style changes across files',
    ],
    free_tier: true,
    pricing_summary:
      'Cursor publishes free and paid plans. Limits, model access, and agent usage are plan-specific and change. Confirm on cursor.com before you buy seats.',
    pricing_url: 'https://www.cursor.com',
    api_available: null,
    strengths: [
      'The editor is the product: AI sits on the repo, not in a separate browser tab.',
      'Public positioning is pair-programming and agentic edits across a project.',
    ],
    weaknesses: [
      'You still need to review diffs. An agent that can edit many files can also waste an afternoon.',
      'Not a general writing/research assistant outside the coding job.',
    ],
    best_fit: [
      'Developers who want AI inside the editor they already work in all day.',
    ],
    poor_fit: [
      'Non-developers who need a chat assistant, or people who only want autocomplete in an existing IDE.',
    ],
    alternatives: ['github-copilot', 'claude-code', 'windsurf'],
    limitations: [
      'Editor features and model routing change quickly; treat vendor docs as the source of truth.',
    ],
    last_verified_at: REVIEWED,
    verification_confidence: 'medium',
    sources: [{ label: 'Cursor', url: 'https://www.cursor.com' }],
  },
  'github-copilot': {
    company: 'GitHub',
    primary_use_cases: [
      'Inline code completion in existing IDEs',
      'Chat and agent help attached to GitHub repos',
    ],
    free_tier: true,
    pricing_summary:
      'GitHub publishes Copilot Free, Pro, and business/enterprise plans. Confirm current prices and included models on GitHub’s Copilot pages.',
    pricing_url: 'https://github.com/features/copilot',
    api_available: null,
    strengths: [
      'Lives where many teams already work: VS Code, JetBrains, and GitHub.',
      'Individual and org billing is a known path if you already pay GitHub.',
    ],
    weaknesses: [
      'It is an assistant inside your existing tools, not a full replacement for a dedicated AI editor or a terminal agent.',
    ],
    best_fit: [
      'Teams standardized on GitHub who want completion and chat without changing editors.',
    ],
    poor_fit: [
      'People who want a standalone general assistant, or who are not working in a GitHub-centric workflow.',
    ],
    alternatives: ['cursor', 'claude-code', 'windsurf'],
    limitations: [
      'What Copilot can do depends on the plan, IDE, and whether chat/agent features are enabled for the org.',
    ],
    last_verified_at: REVIEWED,
    verification_confidence: 'medium',
    sources: [{ label: 'GitHub Copilot', url: 'https://github.com/features/copilot' }],
  },
  'claude-code': {
    company: 'Anthropic',
    primary_use_cases: [
      'Agentic coding from the terminal',
      'Working through a local codebase with files and tools',
    ],
    free_tier: null,
    pricing_summary:
      'Claude Code is an Anthropic coding agent. Access and cost follow Claude/API plans, not a separate price we can safely quote here. Check Anthropic’s Claude Code and pricing pages.',
    pricing_url: 'https://www.anthropic.com/claude-code',
    api_available: true,
    strengths: [
      'Built to operate on a real repo from the terminal: files, commands, and multi-step changes.',
      'Same model family as Claude if you already like Claude for reasoning through code.',
    ],
    weaknesses: [
      'A terminal agent is the wrong shape if you want inline completions in an IDE you will not leave.',
      'Autonomy means you need review habits and a way to undo bad edits.',
    ],
    best_fit: [
      'Developers comfortable in the terminal who want an agent on the working tree.',
    ],
    poor_fit: [
      'Writers, researchers, or anyone who just needs a chat box.',
    ],
    alternatives: ['cursor', 'github-copilot', 'claude'],
    limitations: [
      'We are describing the published product role, not a head-to-head coding benchmark.',
    ],
    last_verified_at: REVIEWED,
    verification_confidence: 'medium',
    sources: [
      { label: 'Claude Code', url: 'https://www.anthropic.com/claude-code' },
      { label: 'Anthropic pricing', url: 'https://www.anthropic.com/pricing' },
    ],
  },
};
