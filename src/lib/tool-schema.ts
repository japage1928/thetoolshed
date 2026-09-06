export type VerificationConfidence = 'unverified' | 'low' | 'medium' | 'high';

export type ToolSource = {
  label: string;
  url: string;
};

export type AITool = {
  name: string;
  slug: string;
  description: string;
  category: string;
  bestFor: string;
  tags: string[];
  url: string;
  company?: string;
  primary_use_cases?: string[];
  free_tier?: boolean | null;
  pricing_summary?: string;
  pricing_url?: string;
  api_available?: boolean | null;
  strengths?: string[];
  weaknesses?: string[];
  best_fit?: string[];
  poor_fit?: string[];
  alternatives?: string[];
  limitations?: string[];
  affiliate?: boolean;
  last_verified_at?: string | null;
  verification_confidence?: VerificationConfidence;
  sources?: ToolSource[];
};

export type DirectoryTool = {
  name: string;
  slug: string;
  description: string;
  category: string;
  best_for: string;
  tags: string[];
  website_url: string;
  affiliate_url: string | null;
  icon_url: string | null;
  is_affiliate: boolean;
  company: string | null;
  primary_use_cases: string[];
  free_tier: boolean | null;
  pricing_summary: string | null;
  pricing_url: string | null;
  pricing_is_verified: boolean;
  api_available: boolean | null;
  strengths: string[];
  weaknesses: string[];
  best_fit: string[];
  poor_fit: string[];
  alternatives: string[];
  limitations: string[];
  last_verified_at: string | null;
  verification_confidence: VerificationConfidence;
  sources: ToolSource[];
  faq: Array<{ question: string; answer: string }>;
};
