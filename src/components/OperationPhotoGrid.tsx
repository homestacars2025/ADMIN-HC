import React, { useEffect, useState } from 'react';

// ─── Slot definitions ─────────────────────────────────────────────────────────
// The `key` values are the exact JSONB keys written to operations.photos.
// Order here is the order shown in the grid — keep both stable so delivery and
// pickup photos can be compared position-by-position later.

export interface PhotoSlotDef { key: string; label: string; }

export const OPERATION_PHOTO_SLOTS: PhotoSlotDef[] = [
  { key: 'front',       label: 'Front' },
  { key: 'right_side',  label: 'Right side' },
  { key: 'left_side',   label: 'Left side' },
  { key: 'rear',        label: 'Rear' },
  { key: 'corner_1',    label: 'Corner 1' },
  { key: 'corner_2',    label: 'Corner 2' },
  { key: 'corner_3',    label: 'Corner 3' },
  { key: 'corner_4',    label: 'Corner 4' },
  { key: 'trunk',       label: 'Trunk' },
  { key: 'rear_seats',  label: 'Rear seats' },
  { key: 'front_seats', label: 'Front seats' },
  { key: 'odometer',    label: 'Odometer' },
  { key: 'dashboard',   label: 'Dashboard' },
];

export const MAX_EXTRA_SCRATCHES = 5;

export type SlotFiles = Record<string, File | undefined>;

export function capturedSlotCount(files: SlotFiles): number {
  return OPERATION_PHOTO_SLOTS.filter(s => !!files[s.key]).length;
}

export function missingSlotLabels(files: SlotFiles): string[] {
  return OPERATION_PHOTO_SLOTS.filter(s => !files[s.key]).map(s => s.label);
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const CameraIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = '#9ca3af' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ color }}>
    <path d="M3 8.5A2.5 2.5 0 015.5 6h1.2a1.5 1.5 0 001.29-.73l.62-1.04A1.5 1.5 0 019.9 3.5h4.2a1.5 1.5 0 011.29.73l.62 1.04A1.5 1.5 0 0017.3 6h1.2A2.5 2.5 0 0121 8.5v8A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5v-8z"
      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="12" cy="12.5" r="3.4" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── Shared styles ────────────────────────────────────────────────────────────

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.7px',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))',
  gap: 10,
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  slotFiles: SlotFiles;
  onSlotChange: (key: string, file: File) => void;
  scratches: File[];
  onScratchAdd: (file: File) => void;
  onScratchRemove: (index: number) => void;
  disabled?: boolean;
}

const OperationPhotoGrid: React.FC<Props> = ({
  slotFiles, onSlotChange, scratches, onScratchAdd, onScratchRemove, disabled = false,
}) => {
  const [slotUrls, setSlotUrls]       = useState<Record<string, string>>({});
  const [scratchUrls, setScratchUrls] = useState<string[]>([]);

  // Blob previews for the mandatory slots — revoked on change / unmount
  useEffect(() => {
    const created: Record<string, string> = {};
    for (const slot of OPERATION_PHOTO_SLOTS) {
      const file = slotFiles[slot.key];
      if (file) created[slot.key] = URL.createObjectURL(file);
    }
    setSlotUrls(created);
    return () => { Object.keys(created).forEach(k => URL.revokeObjectURL(created[k])); };
  }, [slotFiles]);

  // Blob previews for the optional scratch photos
  useEffect(() => {
    const created = scratches.map(f => URL.createObjectURL(f));
    setScratchUrls(created);
    return () => { created.forEach(u => URL.revokeObjectURL(u)); };
  }, [scratches]);

  const captured = capturedSlotCount(slotFiles);
  const total    = OPERATION_PHOTO_SLOTS.length;
  const complete = captured === total;

  const tileBase: React.CSSProperties = {
    position: 'relative', aspectRatio: '1', minHeight: 96,
    borderRadius: 10, overflow: 'hidden', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 6, padding: 8, textAlign: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'border-color 140ms ease, background 140ms ease',
  };

  return (
    <div>
      {/* Header + live counter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={sectionLabelStyle}>
          Required Photos <span style={{ color: '#ef4444' }}>*</span>
        </div>
        <div style={{
          fontSize: 11.5, fontWeight: 700, letterSpacing: '0.2px',
          color: complete ? '#16a34a' : '#4ba6ea',
          background: complete ? 'rgba(22,163,74,0.10)' : 'rgba(75,166,234,0.10)',
          borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
        }}>
          {captured} / {total} photos captured
        </div>
      </div>

      {/* Mandatory slot grid */}
      <div style={gridStyle}>
        {OPERATION_PHOTO_SLOTS.map((slot, i) => {
          const url    = slotUrls[slot.key];
          const filled = !!url;
          return (
            <label
              key={slot.key}
              title={filled ? `${slot.label} — tap to replace` : slot.label}
              style={{
                ...tileBase,
                border: filled ? '1.5px solid #16a34a' : '1.5px dashed #d1d5db',
                background: filled ? '#0f1117' : '#fafafa',
              }}
              onMouseEnter={e => { if (!disabled && !filled) { const l = e.currentTarget; l.style.borderColor = '#4ba6ea'; l.style.background = 'rgba(75,166,234,0.04)'; } }}
              onMouseLeave={e => { if (!filled) { const l = e.currentTarget; l.style.borderColor = '#d1d5db'; l.style.background = '#fafafa'; } }}
            >
              {filled ? (
                <>
                  <img
                    src={url}
                    alt={slot.label}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {/* Captured badge */}
                  <span style={{
                    position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: '50%',
                    background: '#16a34a', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <CheckIcon />
                  </span>
                  {/* Label + replace affordance */}
                  <span style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0))',
                    padding: '14px 6px 6px', display: 'flex', flexDirection: 'column', gap: 2,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{slot.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Tap to retake</span>
                  </span>
                </>
              ) : (
                <>
                  <span style={{
                    position: 'absolute', top: 6, left: 8,
                    fontSize: 10, fontWeight: 700, color: '#d1d5db',
                  }}>
                    {i + 1}
                  </span>
                  <CameraIcon />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#6b7280', lineHeight: 1.25 }}>{slot.label}</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={disabled}
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) onSlotChange(slot.key, file);
                  e.target.value = '';
                }}
              />
            </label>
          );
        })}
      </div>

      {/* Optional extra scratches */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={sectionLabelStyle}>
            Extra Scratches <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#9ca3af', whiteSpace: 'nowrap' }}>
            {scratches.length} / {MAX_EXTRA_SCRATCHES}
          </div>
        </div>

        <div style={gridStyle}>
          {scratchUrls.map((url, i) => (
            <div
              key={i}
              style={{
                ...tileBase, cursor: 'default',
                border: '1.5px solid #e5e7eb', background: '#0f1117',
              }}
            >
              <img
                src={url}
                alt={`Extra scratch ${i + 1}`}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <button
                type="button"
                onClick={() => onScratchRemove(i)}
                disabled={disabled}
                aria-label={`Remove extra scratch ${i + 1}`}
                style={{
                  position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%',
                  border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: 0,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
              <span style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0))',
                padding: '14px 6px 6px', fontSize: 11, fontWeight: 700, color: '#fff',
              }}>
                Scratch {i + 1}
              </span>
            </div>
          ))}

          {scratches.length < MAX_EXTRA_SCRATCHES && (
            <label
              style={{ ...tileBase, border: '1.5px dashed #d1d5db', background: '#fafafa' }}
              onMouseEnter={e => { if (!disabled) { const l = e.currentTarget; l.style.borderColor = '#4ba6ea'; l.style.background = 'rgba(75,166,234,0.04)'; } }}
              onMouseLeave={e => { const l = e.currentTarget; l.style.borderColor = '#d1d5db'; l.style.background = '#fafafa'; }}
            >
              <CameraIcon />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#6b7280', lineHeight: 1.25 }}>Add scratch</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={disabled}
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) onScratchAdd(file);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );
};

export default OperationPhotoGrid;
