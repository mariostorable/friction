// Database types matching Supabase schema

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  company_domain: string | null;
  created_at: string;
  updated_at: string;
}

export interface Integration {
  id: string;
  user_id: string;
  integration_type: 'salesforce' | 'zendesk' | 'gong' | 'slack';
  status: 'active' | 'expired' | 'error';
  instance_url: string | null;
  metadata: Record<string, any>;
  connected_at: string;
  last_synced_at: string | null;
  error_message: string | null;
}

export interface Account {
  id: string;
  user_id: string;
  salesforce_id: string;
  name: string;
  arr: number | null;
  vertical: 'storage' | 'marine' | 'rv' | null;
  segment: 'smb' | 'mid_market' | 'enterprise' | null;
  customer_since: string | null;
  owner_name: string | null;
  owner_email: string | null;
  status: 'active' | 'cancelled' | 'churned' | 'prospect';
  metadata: Record<string, any>;
  last_synced_at: string;
  created_at: string;
}

export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  portfolio_type: 'top_25' | 'random_sample' | 'custom';
  criteria: PortfolioCriteria;
  account_ids: string[];
  refresh_frequency: 'daily' | 'weekly' | 'monthly' | 'manual';
  last_refreshed_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PortfolioCriteria {
  min_arr?: number;
  max_arr?: number;
  vertical?: string;
  segment?: string;
  top_n?: number;
}

export interface RawInput {
  id: string;
  user_id: string;
  account_id: string | null;
  source_type: 'salesforce_case' | 'salesforce_note' | 'manual' | 'zendesk' | 'gong' | 'slack';
  source_id: string | null;
  source_url: string | null;
  text_content: string;
  metadata: Record<string, any>;
  processed: boolean;
  created_at: string;
}

export interface FrictionCard {
  id: string;
  user_id: string;
  account_id: string;
  raw_input_id: string | null;

  // Core analysis
  summary: string;
  theme_key: string;
  product_area: string | null;
  severity: 1 | 2 | 3 | 4 | 5;
  sentiment: 'frustrated' | 'confused' | 'angry' | 'neutral' | 'satisfied' | null;

  // Explainability - KEY for user trust
  root_cause_hypothesis: string | null;
  evidence_snippets: string[];
  confidence_score: number; // 0-1
  reasoning: string | null; // How Claude arrived at this conclusion

  // Metadata
  lifecycle_stage: 'onboarding' | 'active' | 'renewal' | 'churned' | null;
  is_new_theme: boolean;
  created_at: string;

  // Optional joined data from raw_inputs
  raw_input?: {
    source_url: string | null;
    metadata: Record<string, any>;
    created_at: string;
  };
}

export interface Theme {
  theme_key: string;
  label: string;
  description: string | null;
  category: 'product' | 'process' | 'training' | 'integration';
  severity_weight: number;
  is_active: boolean;
  created_at: string;
}

export interface AccountSnapshot {
  id: string;
  account_id: string;
  snapshot_date: string;

  // Core metrics
  ofi_score: number; // 0-100
  friction_card_count: number;
  high_severity_count: number;
  case_volume?: number; // Number of support cases in the analysis period

  // Top themes
  top_themes: ThemeSummary[];

  // Explainability for the score
  score_breakdown: ScoreBreakdown;

  // Trend indicators
  trend_vs_prior_period: number | null;
  trend_direction: 'improving' | 'stable' | 'worsening';

  created_at: string;
}

export interface ThemeSummary {
  theme_key: string;
  count: number;
  avg_severity: number;
}

export interface ScoreBreakdown {
  severity_weighted?: number;
  card_count?: number;
  base_score?: number;
  friction_density?: number;
  density_multiplier?: number;
  high_severity_boost?: number;
  // Legacy fields (deprecated)
  trend_factor?: number;
  recency_boost?: number;
  explanation?: string;
}

export interface Alert {
  id: string;
  user_id: string;
  account_id: string | null;
  alert_type: 'friction_spike' | 'new_theme' | 'critical_severity' | 'churn_risk';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  
  // Explainability
  evidence: Record<string, any>;
  recommended_action: string | null;
  
  // Status
  is_read: boolean;
  is_dismissed: boolean;
  resolved_at: string | null;
  
  created_at: string;
}

export interface SharedLink {
  id: string;
  user_id: string;
  account_id: string | null;
  token: string;
  access_level: 'read_only' | 'comment';
  expires_at: string | null;
  access_count: number;
  last_accessed_at: string | null;
  is_active: boolean;
  created_at: string;
}

// Frontend-specific types

export interface AccountWithMetrics extends Account {
  current_snapshot?: AccountSnapshot;
  recent_friction_cards?: FrictionCard[];
  alert_count?: number;
}

export interface DashboardData {
  top_25: AccountWithMetrics[];
  random_sample: AccountWithMetrics[];
  alerts: Alert[];
  portfolio_summary: {
    total_accounts: number;
    avg_ofi_score: number;
    trending_up: number;
    trending_down: number;
  };
}

// Salesforce types

export interface SalesforceAccount {
  Id: string;
  Name: string;
  AnnualRevenue?: number;
  Industry?: string;
  Type?: string;
  CreatedDate: string;
  Owner?: {
    Name: string;
    Email: string;
  };
}

export interface SalesforceCase {
  Id: string;
  CaseNumber: string;
  Subject: string;
  Description: string;
  Status: string;
  Priority: string;
  CreatedDate: string;
  AccountId: string;
  Comments?: Array<{
    CommentBody: string;
    CreatedDate: string;
  }>;
}
