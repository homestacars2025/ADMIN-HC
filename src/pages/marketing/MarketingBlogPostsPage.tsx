import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../lib/supabase';
import { socialFrom } from '../../lib/socialClient';
import type { SmBlogPost } from '../../types/marketing';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  draft:            { color: '#6b7280', bg: '#f3f4f6',  border: '#e5e7eb', label: 'Draft' },
  pending_approval: { color: '#d97706', bg: '#fef3c7',  border: '#fde68a', label: 'Pending' },
  approved:         { color: '#4ba6ea', bg: '#eff8ff',  border: '#bae6fd', label: 'Approved' },
  published:        { color: '#059669', bg: '#d1fae5',  border: '#6ee7b7', label: 'Published' },
  updated:          { color: '#8b5cf6', bg: '#f5f3ff',  border: '#c4b5fd', label: 'Updated' },
  archived:         { color: '#9ca3af', bg: '#f9fafb',  border: '#e5e7eb', label: 'Archived' },
};

const ARTICLE_TYPES: Record<string, string> = {
  guide:      'Guide',
  list:       'List Article',
  comparison: 'Comparison',
  review:     'Review',
};

const SEO_DIFFICULTY: Record<string, { label: string; color: string }> = {
  easy:   { label: 'Easy',   color: '#059669' },
  medium: { label: 'Medium', color: '#d97706' },
  hard:   { label: 'Hard',   color: '#ef4444' },
};

const AI_ENGINES = ['chatgpt', 'claude', 'gemini', 'perplexity'];
const TARGET_AUDIENCES = ['arab_tourists', 'turkish_tourists', 'business_travelers', 'families', 'budget_travelers', 'expats', 'road_trip_enthusiasts'];

const STATUS_TABS = ['all', 'draft', 'pending_approval', 'approved', 'published', 'updated', 'archived'];

const AUTOSAVE_MS = 60000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function slugify(title: string): string {
  return title.toLowerCase().trim()
    .replace(/[؀-ۿ]/g, '') // strip Arabic
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').slice(0, 80);
}

function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// AEO score: 0–100 based on content quality signals
function calcAeoScore(post: Partial<SmBlogPost> & { content_ar?: string }): { score: number; tips: string[] } {
  let score = 0;
  const tips: string[] = [];
  const content = post.content_ar ?? '';
  const wc = wordCount(content);

  if (wc >= 1500) { score += 20; } else { tips.push(`Add more content (currently ${wc} words, aim for 1500+)`); }
  if ((post.target_questions ?? []).length >= 3) { score += 20; } else { tips.push('Add at least 3 target questions the article answers'); }
  if ((post.target_keywords ?? []).length >= 3) { score += 15; } else { tips.push('Add at least 3 target keywords'); }
  if ((post.target_ai_engines ?? []).length >= 2) { score += 15; } else { tips.push('Select at least 2 AI engine targets'); }
  if (content.includes('?') && content.includes('#')) { score += 15; } else { tips.push('Use Q&A format and heading structure (## headings, questions followed by answers)'); }
  if (post.meta_description_en && post.meta_description_en.length >= 100 && post.meta_description_en.length <= 160) { score += 15; } else { tips.push('Write a meta description between 100–160 characters'); }
  if (score === 0 && tips.length === 0) tips.push('Start writing content to improve your AEO score');
  return { score: Math.min(100, score), tips };
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastData { id: number; message: string; type: 'success' | 'error' | 'info'; }
const Toast: React.FC<{ t: ToastData }> = ({ t }) =>
  ReactDOM.createPortal(
    <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 3000, display: 'flex', alignItems: 'center', gap: 10, background: t.type === 'error' ? '#ef4444' : '#0f1117', color: '#fff', borderRadius: 12, padding: '12px 20px', fontSize: 14, fontWeight: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', animation: 'bpSlide 200ms ease' }}>
      {t.type === 'success' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>}
      {t.type === 'error'   && <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>}
      {t.message}
    </div>,
    document.body
  );

const Sk: React.FC<{ w?: number | string; h?: number | string; radius?: number }> = ({ w = '100%', h = 16, radius = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: radius, background: 'linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'bpPulse 1.5s ease-in-out infinite' }} />
);

// ─── Seed data ────────────────────────────────────────────────────────────────

function buildBlogSeeds() {
  const now = Date.now();
  const day = 86400000;
  return [
    {
      title_ar: 'الدليل الشامل لاستئجار سيارة في إسطنبول للسائح العربي',
      title_tr: "Arap Turistler için İstanbul'da Araç Kiralama Rehberi",
      title_en: 'Complete Guide to Renting a Car in Istanbul as an Arab Tourist',
      slug: 'guide-renting-car-istanbul-arab-tourist',
      status: 'published',
      article_type: 'guide',
      content_ar: `# الدليل الشامل لاستئجار سيارة في إسطنبول

## لماذا تستأجر سيارة في إسطنبول؟

إسطنبول مدينة رائعة تستحق الاستكشاف بسيارة خاصة. سواء كنت تزور المناطق السياحية الشهيرة أو تريد الوصول إلى أحياء أقل ازدحامًا، فإن استئجار سيارة يمنحك حرية التنقل التامة.

### الحرية والمرونة
مع سيارتك الخاصة، يمكنك التنقل في أي وقت تشاء، واستكشاف الأحياء البعيدة عن المركز، والوصول إلى المطاعم والمعالم خارج المناطق السياحية.

## ما الذي تحتاجه لاستئجار سيارة؟

1. **رخصة القيادة الدولية** — إلزامية
2. **جواز السفر** — للتحقق من الهوية
3. **بطاقة الائتمان** — لتغطية التأمين
4. **العمر المناسب** — 21 سنة فأكثر

## أفضل مناطق الاستكشاف بالسيارة

### جانب أوروبا
- السلطان أحمد والمناطق التاريخية
- بشكطاش وأورتاكوي على البوسفور
- نيشانتاشي ومناطق التسوق الفاخرة

### جانب آسيا
- كاديكوي وأسكودار
- مودا والمقاهي الجميلة
- مناطق الطبيعة والغابات

## نصائح مهمة

> **تجنب وسط المدينة أوقات الذروة**: الساعة 8-9 صباحًا و5-7 مساءً

- احتفظ دائمًا بخريطة أوفلاين
- تعلم بعض الكلمات التركية الأساسية
- استخدم تطبيق يول (Yol) لتتبع طرق السيارة

## لماذا هومستاكارز؟

نحن في هومستاكارز نقدم أسطولًا حديثًا يضم أحدث موديلات هيونداي وKGM، مع خدمة توصيل وتسليم في أي مكان بإسطنبول ودعم عربي على مدار الساعة.

## خلاصة القول

استئجار سيارة في إسطنبول تجربة رائعة تفتح لك أبواب المدينة بشكل لم تعرفه من قبل.`,
      content_tr: "Lorem ipsum dolor sit amet. Arap turistler için Istanbul'da araç kiralama rehberi...",
      content_en: 'Lorem ipsum dolor sit amet. Complete guide for renting a car in Istanbul for Arab tourists...',
      meta_description_ar: 'دليل شامل لاستئجار سيارة في إسطنبول للسائح العربي — المتطلبات والنصائح وأفضل المناطق للاستكشاف بحرية تامة.',
      meta_description_tr: "Arap turistler için İstanbul'da araç kiralama — gereksinimler, ipuçları ve en iyi rotalar.",
      meta_description_en: 'Complete guide to renting a car in Istanbul as an Arab tourist — requirements, tips, and the best areas to explore.',
      featured_image_url: 'https://picsum.photos/seed/blog-istanbul/1600/900',
      target_keywords: ['car rental istanbul arabic', 'استئجار سيارة اسطنبول', 'إيجار سيارة اسطنبول', 'car hire istanbul tourist'],
      target_questions: [
        'How to rent a car in Istanbul?',
        'What documents do I need to rent a car in Turkey?',
        'Is it safe to drive in Istanbul?',
        'What is the best car to rent in Istanbul?',
        'Where to rent a car in Istanbul for Arab tourists?',
      ],
      target_audience: ['arab_tourists', 'families', 'business_travelers'],
      seo_difficulty: 'medium',
      target_ai_engines: ['chatgpt', 'claude', 'gemini', 'perplexity'],
      expected_monthly_traffic: 2400,
      estimated_write_time_hours: 4,
      word_count: 1850,
      views: 3241,
      conversions: 48,
      published_at: new Date(Date.now() - 30 * day).toISOString(),
    },
    {
      title_ar: 'أفضل 10 طرق لقيادة السيارة حول إسطنبول',
      title_tr: "İstanbul'da Arabayla Keşfedilecek En İyi 10 Rota",
      title_en: 'Top 10 Routes to Drive Around Istanbul',
      slug: 'top-10-routes-drive-istanbul',
      status: 'draft',
      article_type: 'list',
      content_ar: `# أفضل 10 طرق لقيادة السيارة حول إسطنبول

## 1. طريق البوسفور — من بشكطاش إلى سارييه
أجمل طريق ساحلي في إسطنبول يمتد على طول البوسفور بمناظر خلابة.

## 2. طريق الأناضول — من أسكودار إلى شيلا
استمتع بمناظر البحر من الجانب الآسيوي في هذا الطريق الساحلي الرائع.

## 3. طريق الأحياء التاريخية
من السلطان أحمد إلى الفاتح — رحلة عبر التاريخ العثماني.

*(مزيد من المحتوى قيد الكتابة)*`,
      content_tr: 'Lorem ipsum — rotalar hakkında Türkçe içerik yazılıyor...',
      content_en: 'Lorem ipsum — routes content in English being written...',
      meta_description_ar: 'اكتشف أجمل 10 طرق لقيادة السيارة حول إسطنبول — من البوسفور إلى الأحياء التاريخية والمناطق الطبيعية.',
      meta_description_tr: "İstanbul'da arabayla keşfedilecek en iyi 10 rota — Boğaz'dan tarihi semtlere.",
      meta_description_en: 'Discover the top 10 routes to drive around Istanbul — from the Bosphorus to historic neighborhoods.',
      featured_image_url: 'https://picsum.photos/seed/routes/1600/900',
      target_keywords: ['routes drive istanbul', 'roads istanbul', 'drive bosphorus istanbul', 'best roads turkey'],
      target_questions: [
        'What are the best roads to drive in Istanbul?',
        'Can you drive around Istanbul?',
        'Is it worth renting a car in Istanbul?',
      ],
      target_audience: ['tourists', 'expats', 'road_trip_enthusiasts'],
      seo_difficulty: 'easy',
      target_ai_engines: ['chatgpt', 'gemini'],
      expected_monthly_traffic: 1200,
      estimated_write_time_hours: 3,
      word_count: 420,
      views: 0, conversions: 0,
    },
    {
      title_ar: 'هيونداي بايون مقابل رينو كليو: أيهما أفضل للسياح في إسطنبول؟',
      title_tr: "Hyundai Bayon vs Renault Clio: İstanbul Turistleri için Hangisi?",
      title_en: 'Hyundai Bayon vs Renault Clio: Which is Better for Istanbul Tourists?',
      slug: 'hyundai-bayon-vs-renault-clio-istanbul',
      status: 'pending_approval',
      article_type: 'comparison',
      content_ar: `# هيونداي بايون مقابل رينو كليو: أيهما أفضل؟

## ملخص سريع

| الميزة | هيونداي بايون | رينو كليو |
|--------|--------------|-----------|
| السعر اليومي | 49$ | 42$ |
| المقاعد | 5 | 5 |
| التوفير بالوقود | ممتاز | جيد |
| التقنية | متقدمة | متوسطة |

## التصميم والمظهر
هيونداي بايون يتميز بتصميم SUV عصري يلفت الأنظار في شوارع إسطنبول، بينما رينو كليو يقدم مظهرًا أنيقًا وأكثر تقليدية.

## الأداء في شوارع إسطنبول
رينو كليو أكثر رشاقة في شوارع إسطنبول الضيقة، بينما يتفوق بايون في راحة الركاب وتوفير المساحة.

## الحكم النهائي
**للعائلات والمجموعات**: اختر هيونداي بايون
**للأزواج والمسافرين المنفردين**: اختر رينو كليو`,
      content_tr: 'Lorem ipsum Türkçe karşılaştırma içeriği yazılıyor...',
      content_en: 'Lorem ipsum comparison content in English being written...',
      meta_description_ar: 'مقارنة شاملة بين هيونداي بايون ورينو كليو: أيهما أفضل للسياح في إسطنبول من حيث الأداء والتكلفة والراحة؟',
      meta_description_tr: "İstanbul turistleri için Hyundai Bayon ve Renault Clio kapsamlı karşılaştırması — hangisi daha iyi?",
      meta_description_en: 'Comprehensive comparison of Hyundai Bayon vs Renault Clio for Istanbul tourists — performance, cost, and comfort.',
      featured_image_url: 'https://picsum.photos/seed/bayon-vs-clio/1600/900',
      target_keywords: ['hyundai bayon vs renault clio', 'car comparison istanbul', 'best economy car istanbul'],
      target_questions: [
        'Is Hyundai Bayon better than Renault Clio?',
        'Which is the best economy car to rent in Istanbul?',
        'Hyundai Bayon or Renault Clio for family trips in Istanbul?',
        'Which rental car is cheaper in Istanbul?',
      ],
      target_audience: ['families', 'budget_travelers', 'arab_tourists'],
      seo_difficulty: 'easy',
      target_ai_engines: ['chatgpt', 'claude', 'gemini', 'perplexity'],
      expected_monthly_traffic: 800,
      estimated_write_time_hours: 2.5,
      word_count: 1240,
      views: 0, conversions: 0,
    },
  ];
}

// ─── Empty form ───────────────────────────────────────────────────────────────

function emptyForm(): Omit<SmBlogPost, 'id' | 'created_at' | 'updated_at'> {
  return {
    title_ar: '', title_tr: '', title_en: '',
    slug: '', status: 'draft', article_type: null,
    content_ar: '', content_tr: '', content_en: '',
    meta_description_ar: '', meta_description_tr: '', meta_description_en: '',
    featured_image_url: null, design_id: null,
    target_keywords: [], target_questions: [], target_audience: [],
    seo_difficulty: null, target_ai_engines: [], schema_markup: null,
    expected_monthly_traffic: null, estimated_write_time_hours: null,
    word_count: null, views: null, conversions: null, published_at: null,
  };
}

// ─── Article Editor Modal ─────────────────────────────────────────────────────

interface EditorModalProps {
  post: SmBlogPost | null;
  onClose: () => void;
  onSaved: (post: SmBlogPost) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const EditorModal: React.FC<EditorModalProps> = ({ post, onClose, onSaved, showToast }) => {
  const isNew = !post;
  const [langTab, setLangTab] = useState<'ar' | 'tr' | 'en'>('ar');
  const [seoOpen, setSeoOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const autosaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const draftKey = post ? `bp_draft_${post.id}` : 'bp_draft_new';

  const initForm = () => {
    if (post) {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        try { return { ...post, ...JSON.parse(saved) }; } catch {}
      }
      return {
        ...post,
        target_keywords: post.target_keywords ?? [],
        target_questions: post.target_questions ?? [],
        target_audience: post.target_audience ?? [],
        target_ai_engines: post.target_ai_engines ?? [],
      };
    }
    return emptyForm();
  };

  const [form, setForm] = useState<Omit<SmBlogPost, 'id' | 'created_at' | 'updated_at'>>(initForm);
  const [keywordInput, setKeywordInput] = useState('');
  const [questionInput, setQuestionInput] = useState('');

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(p => ({ ...p, [k]: v }));

  // Auto-slug from AR title
  useEffect(() => {
    if (!form.slug && form.title_en) set('slug', slugify(form.title_en));
  }, [form.title_en]);

  // Word count update
  const contentKey = `content_${langTab}` as 'content_ar' | 'content_tr' | 'content_en';
  const currentContent = form[contentKey] ?? '';

  useEffect(() => {
    const wc = wordCount(form.content_ar ?? '');
    if (form.word_count !== wc) set('word_count', wc);
  }, [form.content_ar]);

  // Autosave
  useEffect(() => {
    autosaveRef.current = setInterval(() => {
      localStorage.setItem(draftKey, JSON.stringify(form));
    }, AUTOSAVE_MS);
    return () => { if (autosaveRef.current) clearInterval(autosaveRef.current); };
  }, [form, draftKey]);

  const buildRow = (status: string) => ({
    ...form,
    status,
    word_count: wordCount(form.content_ar ?? ''),
    updated_at: new Date().toISOString(),
  });

  const handleSave = async (status?: string) => {
    if (!form.title_ar?.trim() && !form.title_en?.trim()) { showToast('At least one title is required', 'error'); return; }
    setSaving(true);
    try {
      let result: SmBlogPost;
      const row = buildRow(status ?? form.status);
      if (isNew) {
        const { data, error } = await socialFrom('sm_content_blog').insert(row).select().single();
        if (error) throw new Error(error.message);
        result = data as SmBlogPost;
      } else {
        const { data, error } = await socialFrom('sm_content_blog').update(row).eq('id', post!.id).select().single();
        if (error) throw new Error(error.message);
        result = data as SmBlogPost;
      }
      localStorage.removeItem(draftKey);
      showToast(isNew ? 'Article created' : 'Article saved', 'success');
      onSaved(result);
      onClose();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  const handleSubmitForApproval = async () => {
    if (!form.title_ar?.trim() && !form.title_en?.trim()) { showToast('At least one title is required', 'error'); return; }
    setSubmitting(true);
    try {
      const row = buildRow('pending_approval');
      let articleId = post?.id;
      let result: SmBlogPost;
      if (isNew) {
        const { data, error } = await socialFrom('sm_content_blog').insert(row).select().single();
        if (error) throw new Error(error.message);
        result = data as SmBlogPost;
        articleId = result.id;
      } else {
        const { data, error } = await socialFrom('sm_content_blog').update(row).eq('id', post!.id).select().single();
        if (error) throw new Error(error.message);
        result = data as SmBlogPost;
      }
      await socialFrom('sm_approvals_queue').insert({
        title: form.title_en?.trim() ?? form.title_ar?.trim(),
        item_type: 'blog_post',
        status: 'pending',
        priority: 'normal',
        bot_who_created: 'admin',
        content: `Article Type: ${form.article_type}\nSlug: ${form.slug}\nWords: ${wordCount(form.content_ar ?? '')}`,
        linked_item_id: articleId,
        linked_table: 'sm_content_blog',
      });
      localStorage.removeItem(draftKey);
      showToast('Submitted for approval', 'success');
      onSaved(result);
      onClose();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Submit failed', 'error');
    } finally { setSubmitting(false); }
  };

  const { score: aeoScore, tips: aeoTips } = useMemo(() => calcAeoScore({ ...form, content_ar: form.content_ar ?? '' }), [form]);
  const metaLen = (form[`meta_description_${langTab}` as 'meta_description_ar' | 'meta_description_tr' | 'meta_description_en'] ?? '').length;
  const rt = readingTime(form.content_ar ?? '');
  const wc = wordCount(currentContent);

  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 9, fontFamily: 'inherit', outline: 'none', color: '#0f1117', transition: 'border-color 140ms ease', background: '#fff' };

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.55)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 1040, height: '92vh', boxShadow: '0 32px 80px rgba(0,0,0,0.2)', animation: 'bpSlideUp 200ms ease', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117' }}>{isNew ? 'New Article' : (form.title_en || form.title_ar || 'Edit Article')}</div>
            {!isNew && post?.status && (
              <span style={{ padding: '3px 10px', borderRadius: 20, background: STATUS_STYLE[post.status]?.bg ?? '#f3f4f6', fontSize: 12, fontWeight: 600, color: STATUS_STYLE[post.status]?.color ?? '#6b7280' }}>
                {STATUS_STYLE[post.status]?.label ?? post.status}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>Auto-save every 60s</div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Editor (left) */}
          <div style={{ flex: '0 0 60%', borderRight: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Lang tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
              {(['ar', 'tr', 'en'] as const).map(lang => (
                <button key={lang} onClick={() => setLangTab(lang)} style={{ flex: 1, padding: '11px 0', border: 'none', background: 'none', fontSize: 13, fontWeight: 600, color: langTab === lang ? '#4ba6ea' : '#6b7280', cursor: 'pointer', borderBottom: langTab === lang ? '2px solid #4ba6ea' : '2px solid transparent', transition: 'all 140ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {lang === 'ar' ? '🇸🇦 Arabic' : lang === 'tr' ? '🇹🇷 Turkish' : '🇬🇧 English'}
                  {form[`content_${lang}` as 'content_ar' | 'content_tr' | 'content_en']?.trim() && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Title */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Title</label>
                <input
                  value={form[`title_${langTab}` as 'title_ar' | 'title_tr' | 'title_en'] ?? ''}
                  onChange={e => set(`title_${langTab}` as 'title_ar' | 'title_tr' | 'title_en', e.target.value)}
                  placeholder={`Article title in ${langTab === 'ar' ? 'Arabic' : langTab === 'tr' ? 'Turkish' : 'English'}…`}
                  dir={langTab === 'ar' ? 'rtl' : 'ltr'}
                  style={{ ...inputStyle, fontSize: 17, fontWeight: 700, padding: '10px 12px' }}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
                />
              </div>

              {/* Slug (only on EN tab) */}
              {langTab === 'en' && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Slug</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={form.slug ?? ''} onChange={e => set('slug', e.target.value)} placeholder="url-friendly-slug" style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }} onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }} onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
                    <button onClick={() => set('slug', slugify(form.title_en ?? ''))} style={{ padding: '8px 12px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 12, color: '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap' }}>Auto</button>
                  </div>
                </div>
              )}

              {/* Meta description */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Meta Description</label>
                  <span style={{ fontSize: 11, color: metaLen > 160 ? '#ef4444' : metaLen >= 100 ? '#059669' : '#9ca3af' }}>{metaLen}/160</span>
                </div>
                <textarea
                  value={form[`meta_description_${langTab}` as 'meta_description_ar' | 'meta_description_tr' | 'meta_description_en'] ?? ''}
                  onChange={e => set(`meta_description_${langTab}` as 'meta_description_ar' | 'meta_description_tr' | 'meta_description_en', e.target.value)}
                  placeholder="160-char SEO meta description…"
                  rows={2}
                  dir={langTab === 'ar' ? 'rtl' : 'ltr'}
                  style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
                  onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#4ba6ea'; }}
                  onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#e5e7eb'; }}
                />
              </div>

              {/* Content */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Content (Markdown)</label>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{wc} words · {rt} min read</span>
                </div>
                <textarea
                  value={currentContent}
                  onChange={e => set(contentKey, e.target.value)}
                  placeholder={`Write your article in ${langTab === 'ar' ? 'Arabic' : langTab === 'tr' ? 'Turkish' : 'English'}…\n\n# Heading\n## Subheading\n**Bold** *Italic*\n- List item\n\n> Blockquote`}
                  dir={langTab === 'ar' ? 'rtl' : 'ltr'}
                  style={{ flex: 1, width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 9, fontFamily: 'monospace', outline: 'none', color: '#0f1117', resize: 'none', lineHeight: 1.6, minHeight: 300, transition: 'border-color 140ms ease' }}
                  onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#4ba6ea'; }}
                  onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#e5e7eb'; }}
                />
              </div>
            </div>
          </div>

          {/* SEO / AEO Panel (right) */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* AEO Score */}
            <div style={{ background: aeoScore >= 70 ? '#d1fae5' : aeoScore >= 40 ? '#fef3c7' : '#fee2e2', border: `1.5px solid ${aeoScore >= 70 ? '#6ee7b7' : aeoScore >= 40 ? '#fde68a' : '#fca5a5'}`, borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: aeoScore >= 70 ? '#065f46' : aeoScore >= 40 ? '#92400e' : '#7f1d1d' }}>AEO Score</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: aeoScore >= 70 ? '#059669' : aeoScore >= 40 ? '#d97706' : '#ef4444' }}>{aeoScore}<span style={{ fontSize: 13, fontWeight: 600 }}>/100</span></div>
              </div>
              <div style={{ height: 6, borderRadius: 6, background: 'rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ width: `${aeoScore}%`, height: '100%', borderRadius: 6, background: aeoScore >= 70 ? '#059669' : aeoScore >= 40 ? '#d97706' : '#ef4444', transition: 'width 400ms ease' }} />
              </div>
              {aeoTips.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {aeoTips.slice(0, 3).map((tip, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, fontSize: 12, color: aeoScore >= 70 ? '#065f46' : aeoScore >= 40 ? '#92400e' : '#7f1d1d', alignItems: 'flex-start' }}>
                      <span style={{ marginTop: 1, flexShrink: 0 }}>→</span><span>{tip}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Article type */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Article Type</label>
              <select value={form.article_type ?? ''} onChange={e => set('article_type', e.target.value || null)} style={{ ...inputStyle }}>
                <option value="">Select type…</option>
                {Object.entries(ARTICLE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {/* SEO Difficulty */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>SEO Difficulty</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.entries(SEO_DIFFICULTY).map(([k, { label, color }]) => (
                  <button key={k} onClick={() => set('seo_difficulty', k)} style={{ flex: 1, padding: '7px 0', borderRadius: 9, border: `1.5px solid ${form.seo_difficulty === k ? color : '#e5e7eb'}`, background: form.seo_difficulty === k ? color + '18' : '#fff', color: form.seo_difficulty === k ? color : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 140ms ease' }}>{label}</button>
                ))}
              </div>
            </div>

            {/* Target keywords */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Target Keywords ({(form.target_keywords ?? []).length}/10)</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {(form.target_keywords ?? []).map((kw, i) => (
                  <span key={i} style={{ padding: '3px 10px', borderRadius: 20, background: '#eff8ff', border: '1px solid #bae6fd', fontSize: 12, color: '#4ba6ea', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {kw}
                    <button onClick={() => set('target_keywords', (form.target_keywords ?? []).filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93c5fd', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={keywordInput} onChange={e => setKeywordInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && keywordInput.trim() && (form.target_keywords ?? []).length < 10) { set('target_keywords', [...(form.target_keywords ?? []), keywordInput.trim()]); setKeywordInput(''); e.preventDefault(); } }} placeholder="Add keyword + Enter" style={{ ...inputStyle, flex: 1 }} onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }} onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
              </div>
            </div>

            {/* Target questions */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Target Questions (this article answers)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                {(form.target_questions ?? []).map((q, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: '#f9fafb', fontSize: 12, color: '#374151' }}>
                    <span style={{ flex: 1 }}>? {q}</span>
                    <button onClick={() => set('target_questions', (form.target_questions ?? []).filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={questionInput} onChange={e => setQuestionInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && questionInput.trim()) { set('target_questions', [...(form.target_questions ?? []), questionInput.trim()]); setQuestionInput(''); e.preventDefault(); } }} placeholder="Add question + Enter" style={{ ...inputStyle, flex: 1 }} onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }} onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
              </div>
            </div>

            {/* Target AI engines */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Target AI Engines</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {AI_ENGINES.map(engine => {
                  const checked = (form.target_ai_engines ?? []).includes(engine);
                  return (
                    <label key={engine} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 9, border: `1.5px solid ${checked ? '#4ba6ea' : '#e5e7eb'}`, background: checked ? '#eff8ff' : '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: checked ? '#4ba6ea' : '#6b7280', transition: 'all 140ms ease' }}>
                      <input type="checkbox" checked={checked} onChange={e => set('target_ai_engines', e.target.checked ? [...(form.target_ai_engines ?? []), engine] : (form.target_ai_engines ?? []).filter(x => x !== engine))} style={{ display: 'none' }} />
                      {checked
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" fill="#4ba6ea"/><path d="M7 12l4 4 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" stroke="#e5e7eb" strokeWidth="1.8"/></svg>}
                      {engine.charAt(0).toUpperCase() + engine.slice(1)}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Expected traffic */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Expected Traffic/mo</label>
                <input type="number" value={form.expected_monthly_traffic ?? ''} onChange={e => set('expected_monthly_traffic', parseInt(e.target.value) || null)} placeholder="2400" style={inputStyle} onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }} onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Write Time (hrs)</label>
                <input type="number" step="0.5" value={form.estimated_write_time_hours ?? ''} onChange={e => set('estimated_write_time_hours', parseFloat(e.target.value) || null)} placeholder="3.5" style={inputStyle} onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }} onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => handleSave()} disabled={saving || submitting} style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 600, color: '#374151', cursor: (saving || submitting) ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button onClick={handleSubmitForApproval} disabled={saving || submitting} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: (saving || submitting) ? '#e5e7eb' : '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: (saving || submitting) ? 'not-allowed' : 'pointer' }}>
            {submitting ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const MarketingBlogPostsPage: React.FC = () => {
  const [posts, setPosts] = useState<SmBlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editorPost, setEditorPost] = useState<SmBlogPost | null | undefined>(undefined);
  const [seeding, setSeeding] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const showToast = useCallback((message: string, type: ToastData['type'] = 'info') => {
    const id = Date.now();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await socialFrom('sm_content_blog').select('*').order('created_at', { ascending: false });
    if (error) { showToast('Failed to load articles', 'error'); return; }
    setPosts((data as SmBlogPost[]) ?? []);
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await socialFrom('sm_content_blog').select('*').order('created_at', { ascending: false });
      if (!cancelled) { setPosts((data as SmBlogPost[]) ?? []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const ch = supabase.channel('blog-posts-rt')
      .on('postgres_changes', { event: '*', schema: 'social', table: 'sm_content_blog' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const handleSeedData = async () => {
    setSeeding(true);
    const seeds = buildBlogSeeds();
    const { error } = await socialFrom('sm_content_blog').insert(seeds as Partial<SmBlogPost>[]);
    setSeeding(false);
    if (error) { showToast('Seed failed: ' + error.message, 'error'); return; }
    showToast('Test articles loaded!', 'success');
    load();
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: posts.length };
    posts.forEach(p => { c[p.status] = (c[p.status] ?? 0) + 1; });
    return c;
  }, [posts]);

  const filtered = useMemo(() => posts.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return ((p.title_en ?? '').toLowerCase().includes(q) || (p.title_ar ?? '').toLowerCase().includes(q) || (p.slug ?? '').toLowerCase().includes(q));
    }
    return true;
  }), [posts, statusFilter, search]);

  const handleSaved = (saved: SmBlogPost) => {
    setPosts(prev => {
      const idx = prev.findIndex(p => p.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
  };

  return (
    <div style={{ padding: '32px 40px', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`
        @keyframes bpPulse { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes bpSlide { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes bpSlideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {toasts.map(t => <Toast key={t.id} t={t} />)}
      {editorPost !== undefined && (
        <EditorModal post={editorPost} onClose={() => setEditorPost(undefined)} onSaved={handleSaved} showToast={showToast} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f1117', margin: 0 }}>Blog Posts</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '4px 0 0 0' }}>Long-form content optimized for SEO and AI search engines</p>
        </div>
        <button onClick={() => setEditorPost(null)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10, border: 'none', background: '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          New Article
        </button>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 2 }}>
        {STATUS_TABS.map(tab => {
          const active = statusFilter === tab;
          const st = STATUS_STYLE[tab];
          return (
            <button key={tab} onClick={() => setStatusFilter(tab)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: `1.5px solid ${active ? (st?.border ?? '#4ba6ea') : '#e5e7eb'}`, background: active ? (st?.bg ?? '#eff8ff') : '#fff', fontSize: 13, fontWeight: 600, color: active ? (st?.color ?? '#4ba6ea') : '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 140ms ease', flexShrink: 0 }}>
              {tab === 'all' ? 'All' : (STATUS_STYLE[tab]?.label ?? tab)}
              <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 20, background: active ? (st?.color ?? '#4ba6ea') : '#e5e7eb', color: active ? '#fff' : '#6b7280', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{counts[tab] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 400, marginBottom: 24 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search articles…" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 36px', fontSize: 14, border: '1.5px solid #e5e7eb', borderRadius: 10, fontFamily: 'inherit', outline: 'none', color: '#0f1117', transition: 'border-color 140ms ease' }} onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }} onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #f0f0f0', display: 'flex', gap: 16 }}>
              <Sk w={56} h={56} radius={8} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}><Sk h={14} /><Sk w="60%" h={12} /></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#9ca3af' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.4 }}><path d="M12 20h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>{posts.length === 0 ? 'No articles yet' : 'No matching articles'}</div>
          {posts.length === 0 && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button onClick={handleSeedData} disabled={seeding} style={{ padding: '9px 18px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: seeding ? 'not-allowed' : 'pointer' }}>
                {seeding ? 'Loading…' : 'Load test data'}
              </button>
              <button onClick={() => setEditorPost(null)} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>New Article</button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {['Article', 'Type', 'Keywords', 'Status', 'Words', 'Views', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.draft;
                const isHov = hoveredId === p.id;
                const title = p.title_en ?? p.title_ar ?? 'Untitled';
                const kw = p.target_keywords ?? [];
                const { score } = calcAeoScore({ ...p, content_ar: p.content_ar ?? '' });
                return (
                  <tr key={p.id} onClick={() => setEditorPost(p)} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f9fafb' : 'none', cursor: 'pointer', background: isHov ? '#f9fafb' : '#fff', transition: 'background 120ms ease' }} onMouseEnter={() => setHoveredId(p.id)} onMouseLeave={() => setHoveredId(null)}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 52, height: 36, borderRadius: 7, overflow: 'hidden', background: '#f3f4f6', flexShrink: 0 }}>
                          {p.featured_image_url && <img src={p.featured_image_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{p.slug ?? '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: '#6b7280' }}>{ARTICLE_TYPES[p.article_type ?? ''] ?? '—'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 160 }}>
                        {kw.slice(0, 2).map((k, j) => <span key={j} style={{ padding: '2px 7px', borderRadius: 20, background: '#f3f4f6', fontSize: 11, color: '#6b7280' }}>{k}</span>)}
                        {kw.length > 2 && <span style={{ fontSize: 11, color: '#9ca3af' }}>+{kw.length - 2}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}><span style={{ padding: '2px 9px', borderRadius: 20, background: st.bg, border: `1px solid ${st.border}`, fontSize: 11, fontWeight: 600, color: st.color }}>{st.label}</span></td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: 12, color: '#374151' }}>{(p.word_count ?? 0).toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af' }}>{readingTime(String(p.word_count ?? 0))} min</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {p.status === 'published' && p.views !== null
                        ? <span style={{ fontSize: 12, color: '#374151' }}>{p.views.toLocaleString()}</span>
                        : <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 32, height: 4, borderRadius: 4, background: '#f3f4f6', overflow: 'hidden' }}><div style={{ width: `${score}%`, height: '100%', background: score >= 70 ? '#059669' : score >= 40 ? '#d97706' : '#ef4444' }} /></div>
                            <span style={{ fontSize: 10, color: '#9ca3af' }}>AEO {score}</span>
                          </div>}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: '#9ca3af' }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MarketingBlogPostsPage;
