import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCurrency, CURRENCIES, CURRENCY_SYMBOLS, type Currency } from '../lib/CurrencyContext';
import Logo from './shared/Logo';
import NotificationBell from './NotificationBell';
import { useNotificationCounts } from '../hooks/useNotificationCounts';

// ─── Navigation model ────────────────────────────────────────────────────────
//
// 46 destinations is too many for one flat list, so everything except Dashboard
// lives in a collapsible group. Only "Daily" opens by default; the rest stay
// shut until asked for, and the open set is remembered per browser.

export interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
}

export interface NavGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

const dashboardItem: NavItem = {
    label: 'Dashboard',
    path: '/dashboard',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  };

const dailyItems: NavItem[] = [
      {
        label: 'Bookings',
        path: '/dashboard/bookings',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Active Bookings',
        path: '/dashboard/bookings/active',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M12 21a9 9 0 100-18 9 9 0 000 18z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'Calendar',
        path: '/dashboard/calendar',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <rect x="7" y="14" width="4" height="4" rx="1" fill="currentColor" opacity="0.6"/>
            <rect x="13" y="14" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        ),
      },
      {
        label: 'Car Issues',
        path: '/dashboard/car-issues',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M10.3 3.9L2.5 17.4A2 2 0 004.2 20.4h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
            <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Operations',
        path: '/dashboard/operations',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
];

const fleetItems: NavItem[] = [
      {
        label: 'Cars',
        path: '/dashboard/cars',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="9" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <circle cx="12" cy="16" r="1.2" fill="currentColor"/>
            <circle cx="20" cy="16" r="1.2" fill="currentColor"/>
          </svg>
        ),
      },
      {
        label: 'Car Tracking',
        path: '/dashboard/cars/tracking',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M12 21s7-5.2 7-10.5A7 7 0 005 10.5C5 15.8 12 21 12 21z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="10.5" r="2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'Model Groups',
        path: '/dashboard/model-groups',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
            <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
            <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
          </svg>
        ),
      },
      {
        label: 'Sourcing',
        path: '/dashboard/sourcing',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
];

const crmItems: NavItem[] = [
      {
        label: 'Customers',
        path: '/dashboard/customers',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'Google Reviews',
        path: '/dashboard/google-reviews',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95L12 2.6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'Mail',
        path: '/dashboard/mail',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'Distribution Sources',
        path: '/dashboard/sources',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
            <circle cx="5" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
            <circle cx="19" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M12 7.5v4m0 0l-5.5 5m5.5-5l5.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Inbox',
        path: '/dashboard/inbox',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
];

const financeItems: NavItem[] = [
      {
        label: 'Accounting',
        path: '/dashboard/accounting',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M18 9l-5 5-3-3-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'Pending Invoices',
        path: '/dashboard/pending-invoices',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 11v3l2 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'Pricing',
        path: '/dashboard/pricing',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'Investors',
        path: '/dashboard/investors',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <line x1="12" y1="1" x2="12" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'Fines',
        path: '/dashboard/fines',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 12v4M12 10h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
];

const complianceItems: NavItem[] = [
      {
        label: 'KABIS',
        path: '/dashboard/kabis',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
            <path d="M14 2v6h6M9 15l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'KGM Tolls',
        path: '/dashboard/kgm',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M2 10h20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M6 14h2M10 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'HGS',
        path: '/dashboard/hgs',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M3 20V9l5-4 5 4v11" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
            <path d="M8 5V2M3 20h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M13 20v-7h5a3 3 0 013 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
          </svg>
        ),
      },
];

const cmoItems: NavItem[] = [
      {
        label: 'CMO Chat',
        path: '/dashboard/marketing/chat',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'Bots',
        path: '/dashboard/marketing/bots',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Content Calendar',
        path: '/dashboard/marketing/calendar',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M8 15h.01M12 15h.01M16 15h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Social Posts',
        path: '/dashboard/marketing/social-posts',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.8"/>
            <circle cx="6"  cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
            <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M8.59 13.51l6.83 3.98M15.41 6.51L8.59 10.49" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Blog Posts',
        path: '/dashboard/marketing/blog-posts',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M12 20h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'Designs',
        path: '/dashboard/marketing/designs',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M12 8a4 4 0 100 8 4 4 0 000-8z" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Ad Campaigns',
        path: '/dashboard/marketing/campaigns',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'Approvals',
        path: '/dashboard/marketing/approvals',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <polyline points="9 11 12 14 22 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'Decisions Log',
        path: '/dashboard/marketing/decisions',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M12 20V12M12 12l-4 4M12 12l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 4v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M5 12H3M21 12h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M6.34 6.34L4.93 4.93M19.07 19.07l-1.41-1.41M6.34 17.66L4.93 19.07M19.07 4.93l-1.41 1.41" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Performance',
        path: '/dashboard/marketing/performance',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="17 6 23 6 23 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        label: 'Competitors',
        path: '/dashboard/marketing/competitors',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8"/>
            <circle cx="12" cy="12" r="4"  stroke="currentColor" strokeWidth="1.8"/>
            <line x1="12" y1="2"  x2="12" y2="8"  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="12" y1="16" x2="12" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="2"  y1="12" x2="8"  y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="16" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
];

const marketingItems: NavItem[] = [
      {
        label: 'Overview',
        path: '/dashboard/marketing',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
            <rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
            <rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
            <rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
          </svg>
        ),
      },
      {
        label: 'Ideas',
        path: '/dashboard/media/ideas',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5a6 6 0 00-12 0c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M9 18h6M10 22h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Influencers',
        path: '/dashboard/media/influencers',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M3 11l18-5v12L3 14v-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
            <path d="M11.6 16.8a3 3 0 11-5.8-1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Media Lists',
        path: '/dashboard/media/lists',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M3 7l2 2 4-4M3 17l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M13 6h8M13 12h8M13 18h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Content Calendar',
        path: '/dashboard/media/calendar',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M17 14h-6M13 18H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Settings',
        path: '/dashboard/marketing/settings',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.8"/>
          </svg>
        ),
      },
];

const adminItems: NavItem[] = [
      {
        label: 'Users',
        path: '/dashboard/users',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.87" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Online Users',
        path: '/dashboard/online-users',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="19" cy="7" r="2" fill="#10b981"/>
          </svg>
        ),
      },
      {
        label: 'Team',
        path: '/dashboard/team',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.87" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Staff Permissions',
        path: '/dashboard/staff-permissions',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="10.5" width="16" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M8 10.5V7a4 4 0 018 0v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="12" cy="15.5" r="1.4" fill="currentColor"/>
          </svg>
        ),
      },
      {
        label: 'Notifications',
        path: '/dashboard/notifications',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M13.7 21a2 2 0 01-3.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        label: 'Reminder Rules',
        path: '/dashboard/reminder-rules',
        icon: (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M12 9.5V13l2.5 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5 3 2.5 5M19 3l2.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
      label: 'Tasks',
      path: '/dashboard/tasks',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
];

/**
 * Paths that are a prefix of another nav item's path.
 *
 * NavLink matches by prefix unless told otherwise, so without this "/dashboard"
 * would read as active on every page, and Cars / Bookings / Overview would stay
 * lit while you were on their own sub-pages. Those exact rows get `end`;
 * everything else keeps prefix matching so deeper routes
 * (/accounting/report, /accounting/customer-sheet/:id) still highlight.
 */
function needsExactMatch(path: string, all: string[]): boolean {
  return all.some((other) => other !== path && other.startsWith(`${path}/`));
}

const NAV_GROUPS: NavGroup[] = [

  { key: 'daily', label: 'Daily', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ), items: dailyItems },

  { key: 'fleet', label: 'Fleet', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M5 17H3v-4l2-5h14l2 5v4h-2M5 13h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="7.5" cy="17" r="1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="16.5" cy="17" r="1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ), items: fleetItems },

  { key: 'crm', label: 'CRM & Growth', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M22 21v-2a4 4 0 00-3-3.87" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ), items: crmItems },

  { key: 'finance', label: 'Finance', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ), items: financeItems },

  { key: 'compliance', label: 'Compliance', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ), items: complianceItems },

  { key: 'cmo', label: 'CMO', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="8" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 8V4M9 14h.01M15 14h.01M9.5 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="3" r="1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ), items: cmoItems },

  { key: 'marketing', label: 'Marketing', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M3 11l18-5v12L3 14v-3z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M11.6 16.8a3 3 0 11-5.8-1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ), items: marketingItems },

  { key: 'admin', label: 'Admin', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.63.67 1.09 1.31 1.09H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ), items: adminItems },

];

const ALL_NAV_PATHS: string[] = [
  dashboardItem.path,
  ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.path)),
];

const EXACT_MATCH_PATHS = new Set(
  ALL_NAV_PATHS.filter((p) => needsExactMatch(p, ALL_NAV_PATHS)),
);

interface UserProfile {
  full_name: string | null;
  avatar_url: string | null;
}

const EXPANDED_W = 240;   /* --sidebar-width: 15rem */
const COLLAPSED_W = 56;   /* --sidebar-width-icon: 3.5rem */

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currency, setCurrency, symbol } = useCurrency();

  const { openTasks } = useNotificationCounts();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; }
    catch { return false; }
  });

  /**
   * Which groups are open. Seeded with Daily only; after that the user's own
   * set wins, so navigating never re-collapses something they opened.
   */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('sidebar_groups');
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      // Blocked storage — the default below is a fine answer.
    }
    return { daily: true };
  });

  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    try { localStorage.setItem('sidebar_collapsed', String(collapsed)); }
    catch {}
  }, [collapsed]);

  useEffect(() => {
    try { localStorage.setItem('sidebar_groups', JSON.stringify(openGroups)); }
    catch {}
  }, [openGroups]);

  /**
   * Reveal the active item even when its group is shut.
   *
   * Longest match wins: "/dashboard/marketing" (Marketing → Overview) is a
   * prefix of "/dashboard/marketing/chat" (CMO → CMO Chat), so a first-match
   * search would open the wrong group for every CMO page.
   */
  useEffect(() => {
    let best: { key: string; len: number } | null = null;
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        const hit = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
        if (hit && (!best || item.path.length > best.len)) best = { key: group.key, len: item.path.length };
      }
    }
    if (!best) return;
    const key = best.key;
    setOpenGroups((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, [location.pathname]);

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  /** The Tasks row carries a live count; everything else is static. */
  const withBadge = (items: NavItem[]): NavItem[] =>
    items.map((item) =>
      item.path === '/dashboard/tasks' ? { ...item, badge: openTasks } : item,
    );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();
      if (!cancelled && data) setProfile(data as UserProfile);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const initials = profile?.full_name
    ? profile.full_name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const W = collapsed ? COLLAPSED_W : EXPANDED_W;

  const renderNavItems = (items: Array<{ label: string; path: string; icon: React.ReactNode; badge?: number }>) =>
    items.map(item => (
      <NavLink
        key={item.path}
        to={item.path}
        end={EXACT_MATCH_PATHS.has(item.path)}
        title={collapsed ? item.label : undefined}
        style={({ isActive }) => ({
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '10px 0' : '10px 12px',
          borderRadius: 'var(--radius-lg)',
          textDecoration: 'none',
          fontSize: 14,
          letterSpacing: '-0.011em',
          fontWeight: isActive ? 600 : 500,
          color: isActive ? 'var(--sidebar-primary)' : 'rgb(0 0 0 / 0.75)',
          background: isActive
            ? 'color-mix(in oklch, var(--sidebar-primary) 8%, transparent)'
            : 'transparent',
          transition: 'all 140ms ease',
          position: 'relative',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        })}
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <div style={{
                position: 'absolute',
                left: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 3,
                height: 20,
                borderRadius: '0 999px 999px 0',
                background: 'var(--sidebar-primary)',
              }} />
            )}
            <span style={{ color: isActive ? 'var(--sidebar-primary)' : 'rgb(0 0 0 / 0.55)', flexShrink: 0, position: 'relative' }}>
              {item.icon}
              {/* Collapsed: the count has no room, so it becomes a dot on the icon. */}
              {collapsed && !!item.badge && item.badge > 0 && (
                <span style={{
                  position: 'absolute', top: -3, right: -4,
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--sidebar-primary)', border: '1.5px solid var(--sidebar)',
                }} />
              )}
            </span>
            {!collapsed && item.label}
            {!collapsed && !!item.badge && item.badge > 0 && (
              <span style={{
                marginLeft: 'auto',
                minWidth: 19, padding: '0 6px', borderRadius: 10,
                background: 'var(--sidebar-primary)', color: 'var(--sidebar-primary-foreground)',
                fontSize: 10, fontWeight: 600, lineHeight: '20px',
                textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}>
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </>
        )}
      </NavLink>
    ));

  return (
    <aside style={{
      width: W,
      minWidth: W,
      height: '100vh',
      background: 'var(--sidebar)',
      borderRight: '1px solid var(--sidebar-border)',
      display: 'flex',
      flexDirection: 'column',
      position: 'sticky',
      top: 0,
      transition: 'width 220ms ease, min-width 220ms ease',
      overflow: 'hidden',
    }}>

      {/* Brand */}
      <div style={{
        height: 68,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 11,
        padding: collapsed ? '0' : '0 22px',
        borderBottom: '1px solid #ebebeb',
        flexShrink: 0,
        position: 'relative',
      }}>
        {/* Logo */}
        {collapsed ? (
          <Logo size={34} />
        ) : (
          <Logo size={34} wordmark />
        )}

        {/* Notification bell — beside the collapse button when expanded */}
        {!collapsed && (
          <div style={{
            position: 'absolute',
            right: 44,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
          }}>
            <NotificationBell collapsed={false} />
          </div>
        )}

        {/* Collapse button — visible only when expanded */}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 26,
              height: 26,
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgb(0 0 0 / 0.40)',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgb(0 0 0 / 0.25)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgb(0 0 0 / 0.55)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--sidebar-border)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgb(0 0 0 / 0.40)';
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Expand button + bell — visible only when collapsed */}
      {collapsed && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
          padding: '10px 0 6px',
          flexShrink: 0,
        }}>
          <NotificationBell collapsed />
          <button
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgb(0 0 0 / 0.40)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgb(0 0 0 / 0.25)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgb(0 0 0 / 0.55)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--sidebar-border)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgb(0 0 0 / 0.40)';
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: collapsed ? '12px 8px' : '16px 12px', overflowY: 'auto' }}>
        {renderNavItems([dashboardItem])}

        {collapsed
          ? /* Icon rail: a group header has nothing to render at 56px, so the
               groups flatten into separated runs of icons. */
            NAV_GROUPS.map((group) => (
              <React.Fragment key={group.key}>
                <div style={{ height: 1, background: 'var(--sidebar-border)', margin: '10px 4px' }} />
                {renderNavItems(withBadge(group.items))}
              </React.Fragment>
            ))
          : NAV_GROUPS.map((group) => {
              const open = openGroups[group.key] === true;
              return (
                <div key={group.key} style={{ marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={open}
                    aria-controls={`navgroup-${group.key}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '8px 10px', border: 'none', background: 'transparent',
                      borderRadius: 'var(--radius-lg)', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: 'rgb(0 0 0 / 0.40)',
                      transition: 'color 140ms ease, background 140ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgb(0 0 0 / 0.025)';
                      e.currentTarget.style.color = 'rgb(0 0 0 / 0.60)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'rgb(0 0 0 / 0.40)';
                    }}
                  >
                    <span style={{ display: 'flex', flexShrink: 0, color: 'rgb(0 0 0 / 0.35)' }}>
                      {group.icon}
                    </span>
                    <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap' }}>
                      {group.label}
                    </span>
                    <svg
                      width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                      style={{
                        flexShrink: 0,
                        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 180ms ease',
                      }}
                    >
                      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {open && (
                    <div id={`navgroup-${group.key}`} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {renderNavItems(withBadge(group.items))}
                    </div>
                  )}
                </div>
              );
            })}
      </nav>

      {/* Currency selector + Profile + Sign out */}
      <div style={{ padding: '12px', borderTop: '1px solid #ebebeb', flexShrink: 0 }}>

        {/* Currency selector */}
        <div style={{ marginBottom: 8 }}>
          {!collapsed && (
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'rgb(0 0 0 / 0.30)',
              textTransform: 'uppercase', letterSpacing: '0.7px',
              marginBottom: 6, paddingLeft: 2,
            }}>
              Currency
            </div>
          )}
          {collapsed ? (
            /* Collapsed: cycle through currencies on click */
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  const idx = CURRENCIES.indexOf(currency);
                  setCurrency(CURRENCIES[(idx + 1) % CURRENCIES.length]);
                }}
                title={`Currency: ${currency} — click to switch`}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: '1.5px solid #4ba6ea',
                  background: 'rgba(75,166,234,0.08)',
                  color: 'var(--sidebar-primary)',
                  fontSize: currency === 'LYD' ? 8 : 10,
                  fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {symbol}
              </button>
            </div>
          ) : (
            /* Expanded: 4 chip buttons in a row */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              {CURRENCIES.map((c: Currency) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  style={{
                    height: 28, borderRadius: 7,
                    border: currency === c ? '1.5px solid #4ba6ea' : '1.5px solid #e5e7eb',
                    background: currency === c ? 'rgba(75,166,234,0.08)' : 'var(--sidebar)',
                    color: currency === c ? 'var(--sidebar-primary)' : 'rgb(0 0 0 / 0.55)',
                    fontSize: c === 'LYD' ? 9 : 11,
                    fontWeight: currency === c ? 700 : 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 140ms ease',
                    letterSpacing: c === 'LYD' ? '-0.2px' : '0',
                  }}
                >
                  {CURRENCY_SYMBOLS[c]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Profile row */}
        <div
          title={collapsed && profile?.full_name ? profile.full_name : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: collapsed ? 0 : 10,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '8px 0' : '8px 12px',
            borderRadius: 9,
            marginBottom: 2,
          }}
        >
          {/* Avatar or initials */}
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          ) : (
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #4ba6ea 0%, #2e8fd4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'white', lineHeight: 1 }}>
                {initials}
              </span>
            </div>
          )}

          {/* Name — expanded only */}
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--sidebar-foreground)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.3,
              }}>
                {profile?.full_name || 'User'}
              </div>
            </div>
          )}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          title={collapsed ? 'Sign out' : undefined}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: collapsed ? 0 : 10,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '9px 0' : '9px 12px',
            borderRadius: 9,
            border: 'none',
            background: 'none',
            fontSize: 14,
            fontWeight: 450,
            color: 'rgb(0 0 0 / 0.40)',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
            transition: 'all 140ms ease',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in oklch, var(--sidebar-foreground) 5%, transparent)';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgb(220 38 38)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'none';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgb(0 0 0 / 0.40)';
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
