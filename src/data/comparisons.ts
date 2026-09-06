export type CompareCriterion = {
  name: string;
  notes: string;
};

export type ComparePick = {
  toolSlug: string;
  toolName: string;
  pick: string;
};

export type Comparison = {
  slug: string;
  title: string;
  eyebrow: string;
  job: string;
  summary: string;
  toolSlugs: string[];
  criteria: CompareCriterion[];
  picks: ComparePick[];
  cost: string;
  limitations: string[];
  lastReviewed: string;
  sources: Array<{ label: string; url: string }>;
};

export const COMPARISONS: Comparison[] = [
  {
    slug: 'chatgpt-vs-claude-vs-grok',
    title: 'ChatGPT vs Claude vs Grok',
    eyebrow: 'Writing / general assistant',
    job: 'You need a daily assistant for writing, explaining, and thinking out loud — not a specialized research or coding IDE.',
    summary:
      'Pick on the job, not a leaderboard. ChatGPT is the broad everyday suite. Claude is the long-document and careful-writing option. Grok is the current-events / conversational option tied to X.',
    toolSlugs: ['chatgpt', 'claude', 'grok'],
    criteria: [
      {
        name: 'The actual job',
        notes:
          'All three can draft, rewrite, and answer questions. The difference is what else is attached: ChatGPT’s broader consumer suite, Claude’s long-context writing posture, Grok’s X-connected freshness.',
      },
      {
        name: 'Writing and revision',
        notes:
          'Claude’s public positioning is long-form thinking and large materials. ChatGPT is the generalist. Grok is more conversational and informal. “Best writer” is subjective — try the same brief in two tools if the deliverable matters.',
      },
      {
        name: 'Current information',
        notes:
          'Grok is built around X/real-time context. ChatGPT browsing exists on supported plans but the product is not search-first. Claude is not the default for “what’s happening on the web this hour.”',
      },
      {
        name: 'Long documents',
        notes:
          'If the job is “read this pile and help me think,” start with Claude. ChatGPT can work from uploads too. Confirm current context limits on the vendor plan you would actually pay for.',
      },
      {
        name: 'Tone and caution',
        notes:
          'Claude tends to be the careful, structured option. Grok is the informal option. ChatGPT sits in the middle and follows whatever voice you specify — still verify anything client-facing.',
      },
    ],
    picks: [
      {
        toolSlug: 'chatgpt',
        toolName: 'ChatGPT',
        pick: 'Choose ChatGPT when you want one general assistant for mixed writing, Q&A, and light technical work, and you may also use images, voice, or file analysis in the same product.',
      },
      {
        toolSlug: 'claude',
        toolName: 'Claude',
        pick: 'Choose Claude when the work is long, careful, or document-heavy — editing, reasoning through a brief, or staying with a large source set.',
      },
      {
        toolSlug: 'grok',
        toolName: 'Grok',
        pick: 'Choose Grok when freshness and a conversational register matter more than a polished memo, especially if you already live in X.',
      },
    ],
    cost: 'All three publish free and paid consumer access; API prices are separate. We are not quoting dollar amounts here because they change. Check OpenAI, Anthropic, and xAI/Grok pricing pages before you subscribe or set a usage cap.',
    limitations: [
      'No benchmark scores. Model versions and plan features move faster than any static table.',
      'A writing sample you like today can look different after a model or UI change.',
      'If the job is research-with-citations, compare Perplexity vs ChatGPT instead of this page.',
    ],
    lastReviewed: '2026-09-06',
    sources: [
      { label: 'ChatGPT', url: 'https://chatgpt.com' },
      { label: 'OpenAI pricing', url: 'https://openai.com/chatgpt/pricing' },
      { label: 'Claude', url: 'https://claude.ai' },
      { label: 'Anthropic pricing', url: 'https://www.anthropic.com/pricing' },
      { label: 'Grok', url: 'https://grok.com' },
      { label: 'xAI', url: 'https://x.ai' },
    ],
  },
  {
    slug: 'chatgpt-vs-claude',
    title: 'ChatGPT vs Claude for coding and analysis',
    eyebrow: 'Coding / analysis',
    job: 'You need help writing or reviewing code, or analyzing a document / dataset — and you are choosing a general assistant, not only an IDE plugin.',
    summary:
      'ChatGPT is the broader analysis-and-chat option. Claude is the long-context reasoning and writing option, with Claude Code if the work should happen on a real repo. If the job is “stay in my editor,” look at Cursor or GitHub Copilot instead of forcing a chat app to be an IDE.',
    toolSlugs: ['chatgpt', 'claude'],
    criteria: [
      {
        name: 'Coding in chat vs on the repo',
        notes:
          'Both will write and explain code in a conversation. Claude Code is Anthropic’s terminal/agent path onto a working tree. ChatGPT remains a chat-and-file product unless you add a separate editor tool.',
      },
      {
        name: 'Analysis of files and data',
        notes:
          'ChatGPT’s consumer product has long offered file upload and data-analysis style work on supported plans. Claude is strong when the material is long prose or a large brief. Confirm what your plan actually allows; we are not inventing feature matrices.',
      },
      {
        name: 'Editor-native alternatives',
        notes:
          'Cursor is an AI-first editor. GitHub Copilot sits inside IDEs and GitHub. Use those when the job is daily software work, not the occasional snippet in a browser tab.',
      },
      {
        name: 'Caution vs speed',
        notes:
          'Claude’s public posture is careful reasoning. ChatGPT is the generalist that many people already have open. Neither replaces code review, tests, or reading the diff.',
      },
    ],
    picks: [
      {
        toolSlug: 'chatgpt',
        toolName: 'ChatGPT',
        pick: 'Choose ChatGPT for interactive analysis, mixed questions, and coding help when you want one familiar chat surface — then paste or upload the artifact.',
      },
      {
        toolSlug: 'claude',
        toolName: 'Claude',
        pick: 'Choose Claude when the codebase, ticket, or document is large and you want a careful pass. Use Claude Code when the agent should operate on local files.',
      },
    ],
    cost: 'ChatGPT and Claude each have free and paid plans plus APIs. Cursor and GitHub Copilot are billed separately as developer tools. Verify current prices on each vendor’s site; seat math for a team is not something we can safely hard-code.',
    limitations: [
      'We did not run a coding benchmark or claim a win rate.',
      'Agentic coding tools can edit many files. Budget time for review, not just generation.',
      'Plan features (file analysis, repo tools, model choice) change; this page describes product roles, not a versioned spec.',
    ],
    lastReviewed: '2026-09-06',
    sources: [
      { label: 'ChatGPT', url: 'https://chatgpt.com' },
      { label: 'Claude', url: 'https://claude.ai' },
      { label: 'Claude Code', url: 'https://www.anthropic.com/claude-code' },
      { label: 'Cursor', url: 'https://www.cursor.com' },
      { label: 'GitHub Copilot', url: 'https://github.com/features/copilot' },
    ],
  },
  {
    slug: 'perplexity-vs-chatgpt',
    title: 'Perplexity vs ChatGPT for research',
    eyebrow: 'Research',
    job: 'You need to look something up, see where the answer came from, and decide whether you can trust it enough to use.',
    summary:
      'Perplexity is a search product that answers with sources. ChatGPT is a general assistant that can browse on some plans but is not built first as a citation engine. Start with Perplexity when the job is research; move to ChatGPT (or Claude) when you need to turn notes into a draft.',
    toolSlugs: ['perplexity', 'chatgpt'],
    criteria: [
      {
        name: 'Sources you can open',
        notes:
          'Perplexity is designed to attach citations to answers. ChatGPT can fetch the web on supported plans, but the default experience is still a chat completion, not a source list.',
      },
      {
        name: 'What happens after the brief',
        notes:
          'Once you have sources, you still have to write, decide, or build. ChatGPT is the better place to continue a mixed workflow. Perplexity is the better place to start the lookup.',
      },
      {
        name: 'Your own documents',
        notes:
          'If the sources are files you already have, NotebookLM is often a better fit than either of these. This page is about open-web research.',
      },
      {
        name: 'Freshness vs synthesis',
        notes:
          'A citation is not the same as a correct summary. Read the linked pages for anything you will publish or spend money on.',
      },
    ],
    picks: [
      {
        toolSlug: 'perplexity',
        toolName: 'Perplexity',
        pick: 'Choose Perplexity when the job is “answer this and show the sources.” Use it for first-pass research, comparisons, and “what do public pages say.”',
      },
      {
        toolSlug: 'chatgpt',
        toolName: 'ChatGPT',
        pick: 'Choose ChatGPT when research is one step inside a larger writing, analysis, or coding session — and you already want the assistant that will draft the next artifact.',
      },
    ],
    cost: 'Both publish free tiers and paid plans. Perplexity Pro and ChatGPT paid plans change limits and model access over time. Confirm on perplexity.ai and OpenAI’s pricing pages. Do not treat a screenshot of last year’s prices as current.',
    limitations: [
      'Citations can point to weak or conflicting sources. You still have to read.',
      'We have not scored either product on a shared research quiz.',
      'For documents you already own, use NotebookLM or Claude rather than forcing a web-search tool.',
    ],
    lastReviewed: '2026-09-06',
    sources: [
      { label: 'Perplexity', url: 'https://www.perplexity.ai' },
      { label: 'Perplexity Pro', url: 'https://www.perplexity.ai/pro' },
      { label: 'ChatGPT', url: 'https://chatgpt.com' },
      { label: 'OpenAI pricing', url: 'https://openai.com/chatgpt/pricing' },
      { label: 'NotebookLM', url: 'https://notebooklm.google.com' },
    ],
  },
];

export function getComparison(slug: string): Comparison | undefined {
  return COMPARISONS.find((item) => item.slug === slug);
}
