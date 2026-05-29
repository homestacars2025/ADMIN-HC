import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MARKETING_PAGES } from '../../types/marketing';

// Phase labels per page for the "coming in next phase" card
const PHASE_NOTES: Record<string, string> = {
  'chat':          'Full chat interface with conversation history, message threading, and file attachments.',
  'constitutions': 'Visual editor for brand voice guidelines, tone rules, and per-bot persona documents.',
  'approvals':     'Review queue with diff view, one-click approve/reject, and feedback threads.',
  'calendar':      'Drag-and-drop content calendar synced with scheduled posts across all platforms.',
  'social-posts':  'Library of all generated social posts with platform previews and publish status.',
  'blog-posts':    'Full blog content management with SEO analysis and editorial workflow.',
  'designs':       'Design asset gallery with version history and brand kit compliance check.',
  'campaigns':     'Ad campaign manager with budget tracking, targeting config, and performance charts.',
  'competitors':   'Competitor monitoring dashboard with pricing tables, post analysis, and alerts.',
  'performance':   'KPI dashboard with engagement metrics, conversion funnels, and trend analysis.',
  'decisions':     'Searchable log of decisions made by each bot, with rationale and linked outputs.',
};

const MarketingPlaceholderPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const segment = location.pathname.replace('/dashboard/marketing', '').replace(/^\//, '');
  const info  = MARKETING_PAGES[segment] ?? { title: 'Coming Soon', description: '' };
  const phase = PHASE_NOTES[segment] ?? 'This page is coming in the next phase.';

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)',
      background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)',
      padding: '44px 40px',
    }}>
      {/* Page header */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            Marketing
          </span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.7px', color: '#0f1117', marginBottom: 6 }}>
          {info.title}
        </h1>
        <p style={{ fontSize: 15, color: '#6b7280' }}>{info.description}</p>
      </div>

      {/* Coming soon card */}
      <div style={{
        background: '#fff',
        borderRadius: 18,
        border: '1px solid #f0f0f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        padding: '56px 40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        maxWidth: 560,
        margin: '0 auto',
      }}>
        {/* Hourglass / construction icon */}
        <div style={{
          width: 56, height: 56,
          background: 'linear-gradient(135deg, rgba(75,166,234,0.12) 0%, rgba(75,166,234,0.06) 100%)',
          borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20,
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ color: '#4ba6ea' }}>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
          Phase 2
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.4px', marginBottom: 10 }}>
          Coming in the next phase
        </h2>
        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.65, marginBottom: 28, maxWidth: 400 }}>
          {phase}
        </p>

        <button
          onClick={() => navigate('/dashboard/marketing')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', borderRadius: 10,
            border: '1px solid #e5e7eb', background: '#fff',
            fontSize: 13, fontWeight: 600, color: '#4b5563',
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'border-color 140ms ease, color 140ms ease',
          }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#4b5563'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to Overview
        </button>
      </div>
    </div>
  );
};

export default MarketingPlaceholderPage;
