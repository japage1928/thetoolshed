export const TASK_KINDS = ['Writing', 'Research', 'Code', 'Build', 'Automate', 'Create', 'Cost'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export type TaskChip = {
  slug: string;
  label: string;
  job: string;
  kind: TaskKind;
  href: string;
  links: Array<{ label: string; href: string }>;
};

export const TASKS: TaskChip[] = [
  {
    slug: 'write-client-content',
    label: 'Write client content',
    job: 'Draft, rewrite, or edit something someone else will read.',
    kind: 'Writing',
    href: '/compare/chatgpt-vs-claude-vs-grok',
    links: [
      { label: 'ChatGPT vs Claude vs Grok', href: '/compare/chatgpt-vs-claude-vs-grok' },
      { label: 'ChatGPT', href: '/tools/chatgpt' },
      { label: 'Claude', href: '/tools/claude' },
    ],
  },
  {
    slug: 'research-a-topic',
    label: 'Research a topic',
    job: 'Look it up, keep the sources, then decide.',
    kind: 'Research',
    href: '/compare/perplexity-vs-chatgpt',
    links: [
      { label: 'Perplexity vs ChatGPT', href: '/compare/perplexity-vs-chatgpt' },
      { label: 'Perplexity', href: '/tools/perplexity' },
      { label: 'NotebookLM', href: '/tools/notebooklm' },
    ],
  },
  {
    slug: 'analyze-documents',
    label: 'Analyze documents',
    job: 'Make sense of a long brief, PDF pile, or notes you already have.',
    kind: 'Research',
    href: '/compare/chatgpt-vs-claude',
    links: [
      { label: 'ChatGPT vs Claude', href: '/compare/chatgpt-vs-claude' },
      { label: 'Claude', href: '/tools/claude' },
      { label: 'NotebookLM', href: '/tools/notebooklm' },
    ],
  },
  {
    slug: 'write-code',
    label: 'Write or review code',
    job: 'Get help in chat, in the editor, or on the repo.',
    kind: 'Code',
    href: '/compare/chatgpt-vs-claude',
    links: [
      { label: 'Coding / analysis compare', href: '/compare/chatgpt-vs-claude' },
      { label: 'Cursor', href: '/tools/cursor' },
      { label: 'Claude Code', href: '/tools/claude-code' },
      { label: 'GitHub Copilot', href: '/tools/github-copilot' },
    ],
  },
  {
    slug: 'build-a-web-app',
    label: 'Build a web app',
    job: 'Turn a description into a working interface or prototype.',
    kind: 'Build',
    href: '/tools/category/app-builders',
    links: [
      { label: 'App builders', href: '/tools/category/app-builders' },
      { label: 'Cursor', href: '/tools/cursor' },
      { label: 'Lovable', href: '/tools/lovable' },
      { label: 'Replit', href: '/tools/replit' },
    ],
  },
  {
    slug: 'automate-a-workflow',
    label: 'Automate a workflow',
    job: 'Connect apps and stop doing the same click path by hand.',
    kind: 'Automate',
    href: '/tools/category/automation',
    links: [
      { label: 'Automation tools', href: '/tools/category/automation' },
      { label: 'n8n', href: '/tools/n8n' },
      { label: 'How to manage n8n', href: '/how-to/manage-n8n-with-chatgpt' },
    ],
  },
  {
    slug: 'generate-images',
    label: 'Generate images',
    job: 'Get a concept, graphic, or visual draft out of a prompt.',
    kind: 'Create',
    href: '/tools/category/image-generation',
    links: [
      { label: 'Image tools', href: '/tools/category/image-generation' },
      { label: 'Midjourney', href: '/tools/midjourney' },
      { label: 'Ideogram', href: '/tools/ideogram' },
    ],
  },
  {
    slug: 'cut-api-cost',
    label: 'Cut AI API cost',
    job: 'Stop a meter you do not understand from eating the budget.',
    kind: 'Cost',
    href: '/how-to/stop-wasting-money-on-ai-apis',
    links: [
      { label: 'How to stop wasting API money', href: '/how-to/stop-wasting-money-on-ai-apis' },
      { label: 'OpenRouter', href: '/tools/openrouter' },
      { label: 'Groq', href: '/tools/groq' },
    ],
  },
  {
    slug: 'create-a-presentation',
    label: 'Create a presentation',
    job: 'Turn notes into slides or a visual explanation.',
    kind: 'Create',
    href: '/tools/category/presentations',
    links: [
      { label: 'Presentation tools', href: '/tools/category/presentations' },
      { label: 'Gamma', href: '/tools/gamma' },
      { label: 'Canva', href: '/tools/canva' },
    ],
  },
  {
    slug: 'edit-audio-video',
    label: 'Edit audio or video',
    job: 'Transcribe, cut, narrate, or generate a clip.',
    kind: 'Create',
    href: '/tools/category/audio-voice',
    links: [
      { label: 'Audio & voice', href: '/tools/category/audio-voice' },
      { label: 'Descript', href: '/tools/descript' },
      { label: 'ElevenLabs', href: '/tools/elevenlabs' },
    ],
  },
  {
    slug: 'run-an-agent',
    label: 'Run a multi-step agent',
    job: 'Hand off a sequence of steps — and keep a kill switch.',
    kind: 'Automate',
    href: '/tools/category/ai-agents',
    links: [
      { label: 'AI agents', href: '/tools/category/ai-agents' },
      { label: 'Claude Code', href: '/tools/claude-code' },
      { label: 'How-to guides', href: '/how-to' },
    ],
  },
  {
    slug: 'compare-assistants',
    label: 'Compare assistants',
    job: 'You already know the job. You need a side-by-side, not another list.',
    kind: 'Writing',
    href: '/compare',
    links: [
      { label: 'All comparisons', href: '/compare' },
      { label: 'Browse the directory', href: '/tools' },
    ],
  },
];
