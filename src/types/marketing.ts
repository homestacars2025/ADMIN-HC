// ─── social schema types ────────────────────────────────────────────────────

export interface SmChatMessageProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface SmChatMessage {
  id: number;
  session_id: string | null;
  sender: 'cmo' | 'admin';
  message: string;
  is_read: boolean;
  is_pinned: boolean | null;
  metadata: Record<string, unknown> | null;
  user_id: string | null;
  profile_id: string | null;
  profile: SmChatMessageProfile | null;
  created_at: string;
}

export interface SmApproval {
  id: number;
  title: string;
  item_type: string; // 'social_post'|'blog_post'|'design'|'ad_campaign'|'reply'|'constitution_change'
  status: 'pending' | 'approved' | 'rejected' | 'edited' | 'expired';
  priority: 'urgent' | 'high' | 'normal' | 'low';
  bot_who_created: string;
  content: string | null;       // preview / summary of the item
  reasoning: string | null;     // why the bot created it
  notes: string | null;
  linked_item_id: number | null;
  linked_table: string | null;
  deadline_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  user_feedback: string | null;
  edits_made: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface SmBot {
  id: string;              // UUID
  bot_name: string;        // e.g. 'cmo', 'content_writer'
  display_name: string;    // human-friendly name
  description: string | null;   // short bio / one-line role summary
  constitution: string | null;  // full rulebook (long Markdown)
  avatar_url: string | null;
  is_active: boolean;
  updated_at: string | null;
  updated_by: string | null;
  notes: string | null;
  created_at: string;
}

/** @deprecated use SmBot */
export type SmConstitution = SmBot;

export interface SmDecision {
  id: number;
  decision_type: string | null;
  title: string;
  description: string | null;
  made_by: string | null;
  before_value: string | null;
  after_value: string | null;
  created_at: string;
}

export interface SmContentSocial {
  id: number;
  title: string | null;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  platform: string | null;
  scheduled_for: string | null;
  content: string | null;
  created_at: string;
}

export interface SmCoordinatorTask {
  id: number;
  to_bot: string;
  title: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  created_at: string;
}

// ─── Bot definitions ─────────────────────────────────────────────────────────

export interface BotCard {
  key: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'working';
  color: string;
}

export const MARKETING_BOTS: BotCard[] = [
  { key: 'cmo',                name: 'CMO',                role: 'Marketing Manager',   status: 'active', color: '#4ba6ea' },
  { key: 'coordinator',        name: 'Coordinator',        role: 'Task Coordinator',    status: 'active', color: '#8b5cf6' },
  { key: 'brand_guardian',     name: 'Brand Guardian',     role: 'Brand & Voice',       status: 'active', color: '#ec4899' },
  { key: 'content_writer',     name: 'Content Writer',     role: 'Copywriting',         status: 'active', color: '#f59e0b' },
  { key: 'designer',           name: 'Designer',           role: 'Visual Design',       status: 'active', color: '#10b981' },
  { key: 'competitor_monitor', name: 'Competitor Monitor', role: 'Market Intelligence', status: 'active', color: '#ef4444' },
  { key: 'performance_analyst',name: 'Performance Analyst',role: 'Analytics & KPIs',    status: 'active', color: '#06b6d4' },
  { key: 'ads_manager',        name: 'Ads Manager',        role: 'Paid Campaigns',      status: 'active', color: '#f97316' },
];

// Bot color definitions (used for list/panel accent colors)
export const BOT_DEFS: { bot_name: string; display_name: string; role: string; color: string }[] = [
  { bot_name: 'general',           display_name: 'General Constitution',          role: 'Read by all bots',    color: '#6b7280' },
  { bot_name: 'cmo',               display_name: 'CMO Constitution',              role: 'Marketing Manager',   color: '#4ba6ea' },
  { bot_name: 'coordinator',       display_name: 'Coordinator Constitution',      role: 'Task Coordinator',    color: '#8b5cf6' },
  { bot_name: 'brand_guardian',    display_name: 'Brand Guardian Constitution',   role: 'Brand & Voice',       color: '#ec4899' },
  { bot_name: 'content_writer',    display_name: 'Content Writer Constitution',   role: 'Copywriting',         color: '#f59e0b' },
  { bot_name: 'designer',          display_name: 'Designer Constitution',         role: 'Visual Design',       color: '#10b981' },
  { bot_name: 'competitor_monitor',display_name: 'Competitor Monitor Constitution',role:'Market Intelligence', color: '#ef4444' },
  { bot_name: 'performance_analyst',display_name:'Performance Analyst Constitution',role:'Analytics & KPIs',   color: '#06b6d4' },
  { bot_name: 'ads_manager',       display_name: 'Ads Manager Constitution',      role: 'Paid Campaigns',      color: '#f97316' },
];

/** @deprecated use BOT_DEFS */
export const CONSTITUTION_DEFS = BOT_DEFS;

// ─── Phase 3B: External Intelligence types ───────────────────────────────────

export interface SmCompetitor {
  id: number;
  name: string;
  name_ar: string | null;
  website: string | null;
  logo_url: string | null;
  threat_level: 'low' | 'medium' | 'high' | 'critical';
  is_active: boolean;
  founded_year: number | null;
  fleet_size_estimate: number | null;
  target_market: 'budget' | 'mid-range' | 'luxury' | 'all' | null;
  locations: string[] | null;
  target_audience: string[] | null;
  notes: string | null;
  social_profiles: Record<string, string> | null;
  added_by: string;
  created_at: string;
  updated_at: string | null;
}

export interface SmCompetitorPricing {
  id: number;
  competitor_id: number;
  car_make: string | null;
  car_model: string | null;
  car_year: number | null;
  category: string | null;
  daily_price: number | null;
  currency: string;
  source_url: string | null;
  is_current: boolean;
  notes: string | null;
  collected_at: string;
}

export interface SmCompetitorPost {
  id: number;
  competitor_id: number;
  platform: string | null;
  post_url: string | null;
  caption: string | null;
  media_urls: string[] | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement_rate: number | null;
  is_winning: boolean;
  posted_at: string | null;
  collected_at: string;
  bot_analysis: string | null;
  detected_strategy: string | null;
  learning_notes: string | null;
  related_content_id: number | null;
}

export interface SmCompetitorReport {
  id: number;
  competitor_id: number | null;
  title: string;
  report_type: string | null;
  period_start: string | null;
  period_end: string | null;
  summary: string | null;
  key_findings: string[] | null;
  threats: string[] | null;
  opportunities: string[] | null;
  recommendations: string[] | null;
  metrics: Record<string, unknown> | null;
  full_report: string | null;
  generated_at: string;
}

export interface SmPerformanceAnalysis {
  id: number;
  title: string;
  analysis_type: string | null;
  period_start: string | null;
  period_end: string | null;
  total_reach: number | null;
  total_engagements: number | null;
  avg_engagement_rate: number | null;
  new_followers: number | null;
  posts_published: number | null;
  revenue: number | null;
  bookings_count: number | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  market_position: string | null;
  recommendations: string[] | null;
  detailed_report: string | null;
  generated_at: string;
}

export interface SmAdCampaign {
  id: number;
  name: string;
  platform: 'google_ads' | 'meta_ads' | 'tiktok_ads' | 'youtube_ads' | null;
  status: 'proposed' | 'approved' | 'launched' | 'paused' | 'completed' | 'rejected';
  objective: string | null;
  why_this_campaign: string | null;
  proposed_by: string;
  proposed_budget: number | null;
  actual_budget: number | null;
  currency: string;
  proposed_start_date: string | null;
  proposed_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  target_audience: Record<string, unknown> | null;
  ad_copies: { ar?: string; tr?: string; en?: string } | null;
  landing_page_url: string | null;
  call_to_action: string | null;
  expected_reach: number | null;
  expected_clicks: number | null;
  expected_roas: number | null;
  competitor_analysis: Record<string, unknown> | null;
  recommendations: string[] | null;
  rejection_reason: string | null;
  linked_social_post_id: number | null;
  linked_design_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface SmAdPerformance {
  id: number;
  campaign_id: number;
  date: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  spend: number;
  conversions: number;
  revenue: number | null;
  roas: number | null;
  reach: number | null;
  frequency: number | null;
  notes: string | null;
  recorded_at: string;
}

// ─── Phase 3A: Content Hub types ─────────────────────────────────────────────

export interface SmDesign {
  id: string; // UUID
  title: string;
  description: string | null;
  design_type: 'post_image' | 'story_image' | 'reel_cover' | 'ad_creative' | 'blog_featured' | 'logo_variant' | 'template' | null;
  purpose: string | null;
  image_url: string;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  file_size_kb: number | null;
  related_content_id: string | null;
  related_campaign_id: string | null;
  designer_notes: string | null;
  brand_colors_used: string[] | null;
  fonts_used: string[] | null;
  tags: string[] | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'archived';
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

// Extended social post (sm_content_social may have more columns than SmContentSocial)
export interface SmPost {
  id: number;
  title: string | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'published' | 'failed' | 'rejected';
  platform: string | null;
  scheduled_for: string | null;
  content: string | null;
  caption_ar: string | null;
  caption_tr: string | null;
  caption_en: string | null;
  hashtags: string[] | null;
  content_type: string | null;
  media_urls: string[] | null;
  design_id: string | null;
  reasoning: string | null;
  season: string | null;
  engagement_likes: number | null;
  engagement_comments: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface SmBlogPost {
  id: number;
  title_ar: string | null;
  title_tr: string | null;
  title_en: string | null;
  slug: string | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'published' | 'updated' | 'archived';
  article_type: string | null;
  content_ar: string | null;
  content_tr: string | null;
  content_en: string | null;
  meta_description_ar: string | null;
  meta_description_tr: string | null;
  meta_description_en: string | null;
  featured_image_url: string | null;
  design_id: string | null;
  target_keywords: string[] | null;
  target_questions: string[] | null;
  target_audience: string[] | null;
  seo_difficulty: string | null;
  target_ai_engines: string[] | null;
  schema_markup: Record<string, unknown> | null;
  expected_monthly_traffic: number | null;
  estimated_write_time_hours: number | null;
  word_count: number | null;
  views: number | null;
  conversions: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
}

// ─── Notification type ────────────────────────────────────────────────────────

export interface SmNotification {
  id: string; // UUID
  type: string;
  title: string;
  message: string | null;
  severity: 'info' | 'success' | 'warning' | 'error';
  link: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_read: boolean;
  user_id: string | null;
  created_at: string;
}

// ─── Page routing map ─────────────────────────────────────────────────────────

export interface MarketingPageInfo { title: string; description: string; }

export const MARKETING_PAGES: Record<string, MarketingPageInfo> = {
  '':              { title: 'Overview',          description: 'Marketing team dashboard' },
  'chat':          { title: 'CMO Chat',          description: 'Conversation with the AI marketing manager' },
  'bots':          { title: 'Bots',               description: 'Bot registry — identities, roles, and constitutions' },
  'approvals':     { title: 'Approvals',         description: 'Review and approve content from the marketing team' },
  'calendar':      { title: 'Content Calendar',  description: 'Scheduled posts and upcoming content pipeline' },
  'social-posts':  { title: 'Social Posts',      description: 'All social media content created by the team' },
  'blog-posts':    { title: 'Blog Posts',        description: 'Long-form content and articles' },
  'designs':       { title: 'Designs',           description: 'Visual assets and creative outputs' },
  'campaigns':     { title: 'Ad Campaigns',      description: 'Paid advertising campaigns and budgets' },
  'competitors':   { title: 'Competitors',       description: 'Competitor pricing, posts, and market analysis' },
  'performance':   { title: 'Performance',       description: 'Marketing KPIs, analytics, and reports' },
  'decisions':     { title: 'Decisions Log',     description: 'Logged decisions made by the marketing team' },
  'settings':      { title: 'Settings',          description: 'Bot management, integrations, and preferences' },
};
