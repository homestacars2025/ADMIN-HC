import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { CarAvailabilityRow, CarStatus, CarStatusCounts } from '../types';
import AlertSection from '../components/AlertSection';
import { Button } from '../components/media/MediaUI';
import { ComplianceTriangle } from '../components/shared/ComplianceBits';
import { StatusImage, type StatusArt } from '../components/shared/StatusImage';
import { StatusTile } from '../components/shared/StatusTile';
import { useUrlFilter } from '../hooks/useUrlFilter';
import { buildCompliance, toneOf, type CarCompliance, type ComplianceDoc } from '../lib/carCompliance';
import { publishCompliance, signInAlertActive } from '../lib/complianceStore';
import { cn } from '../lib/media/badgeColor';
import {
  ComplianceAlertCard,
  ComplianceBanner,
  ComplianceErrorBanner,
  ComplianceModal,
  ExpiryCell,
} from './cars/ComplianceAlert';
import { EditCarSheet } from './cars/EditCarSheet';
import { matchesSpareKey, parseSpareKeyFilter, SPARE_KEY_PARAM, type SpareKeyFilter } from '../lib/carEditor';

// ─── Car Table Types ──────────────────────────────────────────────────────────

interface CarTableRow {
  id: number;
  plate_number: string;
  model: string;
  current_km: number | string;
  year: number | string;
  status: string;
  contract_url:  string | null;
  invoice_url:   string | null;
  insurance_url: string | null;
  ruhsat_url:    string | null;
  kasko_url:     string | null;
  insurance_expiry:  string | null;
  inspection_expiry: string | null;
  has_spare_key:     boolean;
}

type CarTableStatus = 'working' | 'parking' | 'maintenance' | 'selling' | 'replacement';

const STATUS_FILTERS: readonly CarTableStatus[] = ['working', 'parking', 'maintenance', 'selling', 'replacement'];

const STATUS_CONFIG: Record<CarTableStatus, { label: string; color: string; bg: string }> = {
  working:     { label: 'Working',     color: '#16a34a', bg: 'rgba(34,197,94,0.1)'  },
  parking:     { label: 'Parking',     color: '#ea580c', bg: 'rgba(249,115,22,0.1)' },
  maintenance: { label: 'Maintenance', color: '#6b7280', bg: 'rgba(107,114,128,0.1)'},
  selling:     { label: 'Selling',     color: '#ca8a04', bg: 'rgba(234,179,8,0.1)'  },
  replacement: { label: 'Replacement', color: '#0891b2', bg: 'rgba(6,182,212,0.1)'  },
};

const CarStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status as CarTableStatus];
  if (!cfg) return <span style={{ fontSize: 12, color: '#9ca3af' }}>{status || '—'}</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      color: cfg.color, background: cfg.bg,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
};

/** Shown after the plate when the car has a spare key. */
const SpareKeyGlyph: React.FC = () => (
  <span title="Spare key" aria-label="Spare key" role="img" style={{ display: 'inline-flex', color: '#3A74C2' }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3L21 2M16 7l3 3M18.5 4.5l2 2" />
    </svg>
  </span>
);

// ─── Stat Card Types ───────────────────────────────────────────────────────────

interface StatCard {
  key: 'all' | CarStatus;
  label: string;
  description: string;
  accentColor: string;
  iconBg: string;
  art: StatusArt;
}

const CARDS: StatCard[] = [
  {
    key: 'all',
    label: 'Total Fleet',
    description: 'All registered vehicles',
    accentColor: '#4ba6ea',
    iconBg: 'rgba(75,166,234,0.1)',
    art: 'fleet',
  },
  {
    key: 'working',
    label: 'Working',
    description: 'Active on the road',
    accentColor: '#22c55e',
    iconBg: 'rgba(34,197,94,0.1)',
    art: 'working',
  },
  {
    key: 'parking',
    label: 'Parking',
    description: 'Parked at branch',
    accentColor: '#ef4444',
    iconBg: 'rgba(239,68,68,0.1)',
    art: 'parking',
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    description: 'Under service',
    accentColor: '#6b7280',
    iconBg: 'rgba(107,114,128,0.1)',
    art: 'maintenance',
  },
  {
    key: 'selling',
    label: 'Selling',
    description: 'Listed for sale',
    accentColor: '#eab308',
    iconBg: 'rgba(234,179,8,0.1)',
    art: 'selling',
  },
  {
    key: 'replacement',
    label: 'Replacement',
    description: 'Replacement vehicles',
    accentColor: '#06b6d4',
    iconBg: 'rgba(6,182,212,0.1)',
    art: 'replacement',
  },
];

const SkeletonCard: React.FC = () => (
  <div style={{
    background: 'var(--surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
  }}>
    <div style={{ height: 4, background: '#f3f4f6' }} />
    <div style={{ padding: '24px' }}>
      <div style={{ width: 42, height: 42, borderRadius: 11, background: '#f3f4f6', marginBottom: 20, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: '50%', height: 52, borderRadius: 8, background: '#f3f4f6', marginBottom: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: '65%', height: 15, borderRadius: 6, background: '#f3f4f6', marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: '45%', height: 13, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
  </div>
);

// ─── Add Car Modal ────────────────────────────────────────────────────────────

interface ModelGroupOption { id: number; name: string; }
interface InvestorOption   { id: string; full_name: string; }

const AddCarModal: React.FC<{ onClose: () => void; onAdded: () => void }> = ({ onClose, onAdded }) => {
  const [modelGroups, setModelGroups]   = useState<ModelGroupOption[]>([]);
  const [investors,   setInvestors]     = useState<InvestorOption[]>([]);
  const [loadingData, setLoadingData]   = useState(true);

  const [modelGroupId, setModelGroupId] = useState('');
  const [plate,        setPlate]        = useState('');
  const [investorId,   setInvestorId]   = useState('');
  const [saving,       setSaving]       = useState(false);
  const [formError,    setFormError]    = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [mgRes, invRes] = await Promise.all([
        supabase.from('model_group').select('id, name').order('name'),
        supabase.from('investors').select('id, profiles!fk_investor_profile(full_name)'),
      ]);
      if (cancelled) return;
      setModelGroups((mgRes.data ?? []) as ModelGroupOption[]);
      const raw = (invRes.data ?? []) as unknown as { id: string; profiles: { full_name: string } | null }[];
      setInvestors(raw.map(r => ({ id: String(r.id), full_name: r.profiles?.full_name ?? '—' })));
      setLoadingData(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async () => {
    setFormError(null);
    if (!modelGroupId) { setFormError('Please select a model group.'); return; }
    if (!plate.trim()) { setFormError('Plate number is required.'); return; }
    if (!investorId)   { setFormError('Please select an investor.'); return; }

    setSaving(true);
    const { error } = await supabase.from('cars').insert({
      plate_number:    plate.trim().toUpperCase(),
      model_group_id:  Number(modelGroupId),
      investor_id:     investorId || null,
    });
    setSaving(false);

    if (error) { setFormError(error.message); return; }
    onAdded();
    onClose();
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: '#374151', marginBottom: 5, letterSpacing: '0.1px',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: 14,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    color: '#0f1117', background: '#fff', boxSizing: 'border-box',
    fontFamily: 'inherit', appearance: 'none',
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

  return ReactDOM.createPortal(
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 160ms ease',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460,
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        animation: 'slideUp 200ms ease',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 24px 18px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#0f1117', letterSpacing: '-0.3px' }}>
              Add New Car
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              Register a new vehicle in the fleet
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb',
              background: '#fff', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#9ca3af',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Model Group */}
          <div>
            <label style={labelStyle}>Model Group <span style={{ color: '#ef4444' }}>*</span></label>
            <select
              value={modelGroupId}
              onChange={e => setModelGroupId(e.target.value)}
              disabled={loadingData}
              style={selectStyle}
            >
              <option value="">
                {loadingData ? 'Loading…' : 'Select model group'}
              </option>
              {modelGroups.map(mg => (
                <option key={mg.id} value={String(mg.id)}>{mg.name}</option>
              ))}
            </select>
          </div>

          {/* Plate Number */}
          <div>
            <label style={labelStyle}>Plate Number <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              type="text"
              placeholder="34 ABC 123"
              value={plate}
              onChange={e => setPlate(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              style={inputStyle}
            />
          </div>

          {/* Investor */}
          <div>
            <label style={labelStyle}>Investor <span style={{ color: '#ef4444' }}>*</span></label>
            <select
              value={investorId}
              onChange={e => setInvestorId(e.target.value)}
              disabled={loadingData}
              style={selectStyle}
            >
              <option value="">
                {loadingData ? 'Loading…' : 'Select investor'}
              </option>
              {investors.map(inv => (
                <option key={inv.id} value={String(inv.id)}>{inv.full_name}</option>
              ))}
            </select>
          </div>

          {/* Error */}
          {formError && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 9, padding: '10px 12px',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
                <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: 13, color: '#dc2626' }}>{formError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #f0f0f0',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px', borderRadius: 9, border: '1px solid #EBEBEB',
              background: '#fff', fontSize: 14, fontWeight: 500, color: 'var(--foreground)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <Button
            onClick={handleSubmit}
            disabled={saving || loadingData}
            style={{ padding: '9px 20px', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {saving && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.6s linear infinite' }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56" />
              </svg>
            )}
            {saving ? 'Creating…' : 'Create Car'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastState { message: string; type: 'success' | 'error'; }
const Toast: React.FC<ToastState> = ({ message, type }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: type === 'success' ? '#0f1117' : '#ef4444',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    }}>
      {type === 'success'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
      }
      {message}
    </div>,
    document.body,
  );

// ─── Page ─────────────────────────────────────────────────────────────────────

const CarsPage: React.FC = () => {
  const [counts, setCounts]         = useState<CarStatusCounts | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showAddCar, setShowAddCar] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [cars, setCars]             = useState<CarTableRow[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [tableSearch, setTableSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const spareKey = parseSpareKeyFilter(searchParams.get(SPARE_KEY_PARAM));
  const setSpareKey = (value: SpareKeyFilter | null) => setSearchParams((params) => {
    const next = new URLSearchParams(params);
    if (value) next.set(SPARE_KEY_PARAM, value); else next.delete(SPARE_KEY_PARAM);
    return next;
  }, { replace: true });
  const { filter: statusFilter, toggle: toggleStatus, clear: clearStatus } = useUrlFilter(STATUS_FILTERS);
  const { key: locationKey } = useLocation();
  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setTableSearch(q);
  }, [searchParams]);

  // "Fix now" arrives with ?issues=1, and an expiry notification with ?car=<id>.
  const wantsIssues = searchParams.get('issues') === '1';
  const targetCar = Number(searchParams.get('car')) || null;

  const [editingCarId, setEditingCarId] = useState<number | null>(null);
  const [editFocusDocs, setEditFocusDocs] = useState<ComplianceDoc[]>([]);
  const [compliance, setCompliance] = useState<CarCompliance[]>([]);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [onlyIssues, setOnlyIssues] = useState(wantsIssues);
  const [highlightCar, setHighlightCar] = useState<number | null>(null);
  // Someone sent here to act on a car shouldn't have the modal put in front of it.
  const alertShown = useRef(wantsIssues || targetCar !== null);
  const [sortCol,  setSortCol]  = useState<'plate_number' | 'model' | 'year' | 'current_km' | 'status' | null>(null);
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>('asc');
  const [totalCars, setTotalCars] = useState(0);
  const [toast, setToast]       = useState<ToastState | null>(null);
  const toastTimer              = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const handleSort = (col: 'plate_number' | 'model' | 'year' | 'current_km' | 'status') => {
    if (sortCol !== col) { setSortCol(col); setSortDir('asc'); }
    else if (sortDir === 'asc') { setSortDir('desc'); }
    else { setSortCol(null); setSortDir('asc'); }
  };

  useEffect(() => {
    let cancelled = false;

    const fetchCars = async () => {
      setLoading(true);
      setError(null);

      const [activeCarsRes, { data: availabilityAll, error: availError }] = await Promise.all([
        supabase.from('cars').select('id', { count: 'exact' }).eq('is_active', true),
        supabase.from('car_availability').select('id, status'),
      ]);

      if (cancelled) return;

      const countError = activeCarsRes.error;
      if (countError || availError) {
        setError((countError ?? availError)!.message);
        setLoading(false);
        return;
      }

      const activeIds = new Set((activeCarsRes.data ?? []).map(c => c.id));
      setTotalCars(activeCarsRes.count ?? 0);

      const availability = (availabilityAll ?? []).filter(c => activeIds.has(c.id));
      const working     = availability.filter(c => c.status?.toLowerCase() === 'working').length;
      const parking     = availability.filter(c => c.status?.toLowerCase() === 'parking').length;
      const maintenance = availability.filter(c => c.status?.toLowerCase() === 'maintenance').length;
      const selling     = availability.filter(c => c.status?.toLowerCase() === 'selling').length;
      const replacement = availability.filter(c => c.status?.toLowerCase() === 'replacement').length;

      setCounts({ working, parking, maintenance, selling, replacement });
      setLoading(false);
    };

    fetchCars();
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCarsLoading(true);
      const [carsRes, trackingRes, registrationsRes, availabilityRes, modelGroupsRes] = await Promise.all([
        supabase.from('cars').select('id, plate_number, model_group_id').eq('is_active', true).order('id', { ascending: false }),
        supabase.from('car_tracking').select('car_id, current_km, updated_at').order('updated_at', { ascending: false }),
        supabase.from('cars_registration').select('car_id, manufacture_year, purchase_contract_url, purchase_invoice_url, insurance_file_url, ruhsat_url, kasko, insurance_expiry, inspection_expiry, has_spare_key'),
        supabase.from('car_availability').select('id, status'),
        supabase.from('model_group').select('id, name'),
      ]);
      if (cancelled) return;

      const rawCars        = (carsRes.data         ?? []) as { id: number; plate_number: string; model_group_id: number | null }[];
      const rawTracking    = (trackingRes.data      ?? []) as { car_id: number; current_km: number; updated_at: string }[];
      const rawRegs        = (registrationsRes.data ?? []) as { car_id: number; manufacture_year: number | null; purchase_contract_url: string | null; purchase_invoice_url: string | null; insurance_file_url: string | null; ruhsat_url: string | null; kasko: string | null; insurance_expiry: string | null; inspection_expiry: string | null; has_spare_key: boolean | null }[];
      const rawAvailability= (availabilityRes.data  ?? []) as { id: number; status: string }[];
      const rawModels      = (modelGroupsRes.data   ?? []) as { id: number; name: string }[];

      // Deduplicate tracking — keep only the first (latest) record per car_id
      const seenCarIds = new Set<number>();
      const latestTracking = rawTracking.filter(t => {
        if (seenCarIds.has(t.car_id)) return false;
        seenCarIds.add(t.car_id);
        return true;
      });

      const combined: CarTableRow[] = rawCars.map(car => {
        const reg = rawRegs.find(r => r.car_id === car.id);
        return {
          id:            car.id,
          plate_number:  car.plate_number,
          model:         rawModels.find(m => m.id === car.model_group_id)?.name ?? '—',
          current_km:    latestTracking.find(t => t.car_id === car.id)?.current_km ?? '—',
          year:          reg?.manufacture_year ?? '—',
          status:        rawAvailability.find(a => a.id === car.id)?.status ?? '—',
          contract_url:  reg?.purchase_contract_url ?? null,
          invoice_url:   reg?.purchase_invoice_url ?? null,
          insurance_url: reg?.insurance_file_url ?? null,
          ruhsat_url:    reg?.ruhsat_url ?? null,
          kasko_url:     reg?.kasko ?? null,
          insurance_expiry:  reg?.insurance_expiry ?? null,
          inspection_expiry: reg?.inspection_expiry ?? null,
          has_spare_key:     reg?.has_spare_key === true,
        };
      });

      setCars(combined);
      const readError = carsRes.error ?? registrationsRes.error;
      setComplianceError(readError ? readError.message : null);
      const affected = readError ? [] : buildCompliance(combined, rawRegs);
      setCompliance(affected);
      if (!readError) publishCompliance(affected);
      setCarsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Once per visit. After "Got it" it stays closed until the page is opened again.
  useEffect(() => {
    if (carsLoading || alertShown.current || compliance.length === 0) return;
    alertShown.current = true;
    if (!signInAlertActive()) setAlertOpen(true);
  }, [carsLoading, compliance]);

  useEffect(() => {
    setOnlyIssues(wantsIssues);
    if (targetCar !== null) setTableSearch('');
  }, [wantsIssues, targetCar, locationKey]);

  useEffect(() => {
    if (carsLoading || (!wantsIssues && targetCar === null)) return undefined;
    const selector = targetCar !== null ? `[data-car-id="${targetCar}"]` : '[data-fleet-table]';
    document.querySelector(selector)?.scrollIntoView({ block: targetCar !== null ? 'center' : 'start', behavior: 'smooth' });
    if (targetCar === null) return undefined;
    setHighlightCar(targetCar);
    const timer = setTimeout(() => setHighlightCar(null), 4000);
    return () => clearTimeout(timer);
  }, [carsLoading, wantsIssues, targetCar, locationKey]);

  const issuesByCar = useMemo(() => new Map(compliance.map(car => [car.id, car])), [compliance]);

  const fixCar = (car: CarCompliance) => {
    setEditFocusDocs(car.issues.map(issue => issue.doc));
    setEditingCarId(car.id);
  };

  const closeEdit = () => {
    setEditingCarId(null);
    setEditFocusDocs([]);
  };

  const total = totalCars;

  const pickStatus = (key: StatCard['key']) => {
    if (key === 'all') { clearStatus(); return; }
    if (statusFilter !== key) document.querySelector('[data-fleet-table]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    toggleStatus(key);
  };

  const countFor = (key: StatCard['key']): number => {
    if (!counts) return 0;
    if (key === 'all') return total;
    return counts[key];
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-11" style={{
      minHeight: '100vh',
      background: 'var(--surface)',
    }}>
      {/* Page header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#4ba6ea',
            }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#3A74C2', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              Fleet Overview
            </span>
          </div>
          <h1 style={{
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: '-0.8px',
            color: '#0f1117',
            marginBottom: 6,
            lineHeight: 1.1,
          }}>
            Cars
          </h1>
          <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>
            Real-time availability across all branches.
          </p>
        </div>
        <Button
          onClick={() => setShowAddCar(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', fontSize: 14, fontFamily: 'inherit', flexShrink: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          Add Car
        </Button>
      </div>

      {compliance.length > 0 && <ComplianceBanner cars={compliance} onView={() => setAlertOpen(true)} />}
      {complianceError && <ComplianceErrorBanner message={complianceError} />}

      {/* Error state */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#fff',
          border: '1px solid rgba(239,68,68,0.2)',
          borderLeft: '4px solid #ef4444',
          borderRadius: 12,
          padding: '14px 18px',
          marginBottom: 32,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
            <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1117', marginBottom: 2 }}>Failed to load fleet data</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{error}</div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="status-tiles six" style={{ maxWidth: 'none', marginBottom: 36 }}>
        {loading
          ? CARDS.map(c => <SkeletonCard key={c.key} />)
          : CARDS.map(card => (
              <StatusTile
                key={card.key}
                accent={card.accentColor}
                art={<StatusImage status={card.art} size={72} />}
                label={card.label}
                value={String(countFor(card.key))}
                sub={card.description}
                pct={total > 0 && card.key !== 'all' ? { value: Math.round((countFor(card.key) / total) * 100), tint: card.iconBg } : null}
                active={statusFilter === card.key}
                onClick={() => pickStatus(card.key)}
              />
            ))
        }
      </div>

      {/* Alert sections */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#f97316', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            Alerts
          </span>
        </div>
        <div className={cn('grid grid-cols-1', compliance.length > 0 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3')} style={{ gap: 14 }}>
          {compliance.length > 0 && <ComplianceAlertCard cars={compliance} onView={() => setAlertOpen(true)} />}
          <AlertSection
            viewName="upcoming_returns"
            title="Upcoming Returns"
            accentColor="#4ba6ea"
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M3 10h13M3 10l4-4M3 10l4 4" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 14H8M21 14l-4-4M21 14l-4 4" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <AlertSection
            viewName="upcoming_insurance"
            title="Insurance Expiry"
            accentColor="#f97316"
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <AlertSection
            viewName="upcoming_inspection"
            title="Inspection Expiry"
            accentColor="#8b5cf6"
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M9 11l3 3L22 4" stroke="#8b5cf6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="#8b5cf6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
        </div>
      </div>

      {/* Fleet Table */}
      <div data-fleet-table style={{ marginTop: 32 }}>
        {/* Section header + search */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#3A74C2', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              {statusFilter === 'all' ? 'All Vehicles' : `${STATUS_CONFIG[statusFilter].label} Vehicles`}
            </span>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {compliance.length > 0 && (
            <button
              type="button"
              aria-pressed={onlyIssues}
              onClick={() => setOnlyIssues(value => !value)}
              className={cn(
                'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[9px] border px-3 text-[13px] font-semibold transition-colors md:h-9',
                onlyIssues ? 'border-[#DC2626] bg-[#DC2626] text-white' : 'border-[#DC2626]/30 bg-[#DC2626]/[0.06] text-[#B91C1C]',
              )}
            >
              Missing or expired
              <span className="tabular-nums">{compliance.length}</span>
            </button>
          )}
          <select
            aria-label="Spare key"
            value={spareKey ?? ''}
            onChange={e => setSpareKey(parseSpareKeyFilter(e.target.value))}
            className={cn(
              'h-11 shrink-0 rounded-[9px] border-[1.5px] bg-white px-2.5 text-[13px] font-medium outline-none md:h-9',
              spareKey ? 'border-[#4ba6ea] text-[#3A74C2]' : 'border-[#e5e7eb] text-[#374151]',
            )}
          >
            <option value="">Spare key: All</option>
            <option value="yes">Spare key: Yes</option>
            <option value="no">Spare key: No</option>
          </select>
          {/* Search */}
          <div className="relative min-w-0 flex-1 sm:w-[220px] sm:flex-none">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Search plate or model…"
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              style={{
                paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 9,
                outline: 'none', color: '#0f1117', background: '#fff',
                width: '100%', fontFamily: 'inherit',
              }}
            />
          </div>
          </div>
        </div>

        {/* Table card */}
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border-subtle)', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1120 }}>
              <thead>
                <tr>
                  {([
                    { label: 'Plate Number', col: 'plate_number' },
                    { label: 'Model',        col: 'model'        },
                    { label: 'Year',         col: 'year'         },
                    { label: 'Current KM',   col: 'current_km'   },
                    { label: 'Status',       col: 'status'       },
                  ] as const).map(({ label, col }) => {
                    const active = sortCol === col;
                    return (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        style={{
                          padding: '9px 14px', fontSize: 11, fontWeight: 600,
                          color: active ? '#3A74C2' : '#9ca3af',
                          textTransform: 'uppercase', letterSpacing: '0.7px',
                          textAlign: 'left', background: '#fff',
                          borderBottom: '1.5px solid #f0f0f0',
                          whiteSpace: 'nowrap', userSelect: 'none',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLTableCellElement).style.color = '#6b7280'; }}
                        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLTableCellElement).style.color = '#9ca3af'; }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {label}
                          {active ? (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                              {sortDir === 'asc'
                                ? <path d="M12 19V5M5 12l7-7 7 7" stroke="#4ba6ea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                                : <path d="M12 5v14M5 12l7 7 7-7" stroke="#4ba6ea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                              }
                            </svg>
                          ) : (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ opacity: 0 }} className="sort-hint">
                              <path d="M12 5v14M7 9l5-5 5 5M7 15l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                      </th>
                    );
                  })}
                  {['Insurance until', 'Inspection until'].map(label => (
                    <th key={label} style={{
                      padding: '9px 14px', fontSize: 11, fontWeight: 600,
                      color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px',
                      textAlign: 'left', background: '#fff',
                      borderBottom: '1.5px solid #f0f0f0',
                      whiteSpace: 'nowrap', userSelect: 'none',
                    }}>
                      {label}
                    </th>
                  ))}
                  {([
                    { key: 'contract_url',  label: 'Contract'  },
                    { key: 'invoice_url',   label: 'Invoice'   },
                    { key: 'insurance_url', label: 'Insurance' },
                    { key: 'ruhsat_url',    label: 'Ruhsat'    },
                    { key: 'kasko_url',     label: 'Kasko'     },
                  ] as const).map(col => {
                    const have = cars.filter(c => !!c[col.key]).length;
                    const tot  = cars.length;
                    return (
                      <th key={col.key} style={{
                        padding: '9px 14px', fontSize: 11, fontWeight: 600,
                        color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px',
                        textAlign: 'center', background: '#fff',
                        borderBottom: '1.5px solid #f0f0f0',
                        whiteSpace: 'nowrap', userSelect: 'none',
                      }}>
                        <div>{col.label}</div>
                        {!carsLoading && tot > 0 && (
                          <div style={{ fontSize: 10, fontWeight: 500, color: '#c0c4cc', marginTop: 1, letterSpacing: 0 }}>
                            ({have}/{tot})
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th style={{
                    padding: '9px 14px', fontSize: 11, fontWeight: 600,
                    color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px',
                    textAlign: 'center', background: '#fff',
                    borderBottom: '1.5px solid #f0f0f0',
                    whiteSpace: 'nowrap', userSelect: 'none',
                  }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {carsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 13 }).map((__, j) => (
                        <td key={j} style={{ padding: '12px 14px' }}>
                          <div style={{ height: 14, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', width: j === 0 ? '80px' : j >= 7 ? '20px' : '60%', margin: j >= 7 ? '0 auto' : undefined }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (() => {
                  const q = tableSearch.trim().toLowerCase();
                  const filtered = cars.filter(car => {
                    if (onlyIssues && !issuesByCar.has(car.id)) return false;
                    if (statusFilter !== 'all' && car.status?.toLowerCase() !== statusFilter) return false;
                    if (!matchesSpareKey(car.has_spare_key, spareKey)) return false;
                    if (!q) return true;
                    return car.plate_number.toLowerCase().includes(q) || car.model.toLowerCase().includes(q);
                  });

                  if (sortCol) {
                    filtered.sort((a, b) => {
                      let av: string | number;
                      let bv: string | number;
                      if (sortCol === 'year' || sortCol === 'current_km') {
                        av = a[sortCol] === '—' ? 0 : Number(a[sortCol]);
                        bv = b[sortCol] === '—' ? 0 : Number(b[sortCol]);
                      } else {
                        av = String(a[sortCol]).toLowerCase();
                        bv = String(b[sortCol]).toLowerCase();
                      }
                      if (av < bv) return sortDir === 'asc' ? -1 : 1;
                      if (av > bv) return sortDir === 'asc' ? 1 : -1;
                      return 0;
                    });
                  }

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={13} style={{ padding: '36px 14px', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
                          {statusFilter !== 'all' && <StatusImage status={statusFilter} size={96} className="mx-auto mb-2" />}
                          {tableSearch ? 'No cars match your search.' : spareKey ? `No cars ${spareKey === 'yes' ? 'with' : 'without'} a spare key here.` : statusFilter !== 'all' ? `No cars in ${STATUS_CONFIG[statusFilter].label}.` : 'No cars found.'}
                        </td>
                      </tr>
                    );
                  }

                  return filtered.map((car, idx) => {
                    const affected = issuesByCar.get(car.id);
                    const stripe = affected ? (affected.severity === 'expired' ? '#DC2626' : '#F59E0B') : null;
                    return (
                    <tr
                      key={car.plate_number + idx}
                      data-car-id={car.id}
                      style={{
                        borderTop: idx === 0 ? 'none' : '1px solid #f7f7f7',
                        background: highlightCar === car.id ? 'rgba(75,166,234,0.16)' : undefined,
                        transition: 'background 400ms ease',
                      }}
                    >
                      <td style={{ padding: '12px 14px', boxShadow: stripe ? `inset 3px 0 0 ${stripe}` : undefined }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span className="font-mono tabular-nums" style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', letterSpacing: '0.3px' }}>
                            {car.plate_number}
                          </span>
                          {car.has_spare_key && <SpareKeyGlyph />}
                          {affected && <ComplianceTriangle tone={toneOf(affected.severity)} size={18} alt={affected.severity === 'expired' ? 'Expired' : 'Date not recorded'} />}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151' }}>
                        {car.model}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                        {car.year}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                        {car.current_km !== '—' ? Number(car.current_km).toLocaleString() + ' km' : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {car.status && car.status !== '—' ? <CarStatusBadge status={car.status} /> : <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <ExpiryCell date={car.insurance_expiry} car={affected} doc="insurance" checked={!complianceError} />
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <ExpiryCell date={car.inspection_expiry} car={affected} doc="inspection" checked={!complianceError} />
                      </td>
                      {([car.contract_url, car.invoice_url, car.insurance_url, car.ruhsat_url, car.kasko_url] as (string | null)[]).map((url, di) => (
                        <td key={di} style={{ padding: '12px 14px', textAlign: 'center' }}>
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" title="Open document" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#3A74C2' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" opacity="0.15"/>
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#4ba6ea" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M14 2v6h6" stroke="#4ba6ea" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M9 13h6M9 17h4" stroke="#4ba6ea" strokeWidth="1.4" strokeLinecap="round"/>
                              </svg>
                            </a>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                              </svg>
                            </span>
                          )}
                        </td>
                      ))}
                      {/* Actions */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <button
                          onClick={() => setEditingCarId(car.id)}
                          title="Edit car"
                          style={{
                            width: 30, height: 30, borderRadius: 7, border: '1px solid #e5e7eb',
                            background: '#fff', cursor: 'pointer', display: 'inline-flex',
                            alignItems: 'center', justifyContent: 'center', color: '#9ca3af',
                            transition: 'all 140ms ease',
                          }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#3A74C2'; b.style.background = 'rgba(75,166,234,0.06)'; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; b.style.background = '#fff'; }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        th:hover .sort-hint { opacity: 0.4 !important; }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {showAddCar && (
        <AddCarModal
          onClose={() => setShowAddCar(false)}
          onAdded={() => setRefreshKey(k => k + 1)}
        />
      )}
      {editingCarId !== null && (
        <EditCarSheet
          carId={editingCarId}
          focusDocs={editFocusDocs}
          onClose={(changed) => { closeEdit(); if (changed) setRefreshKey(k => k + 1); }}
          showToast={showToast}
        />
      )}
      {alertOpen && compliance.length > 0 && (
        <ComplianceModal
          cars={compliance}
          paused={editingCarId !== null}
          onFix={fixCar}
          onClose={() => setAlertOpen(false)}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
};

export default CarsPage;
