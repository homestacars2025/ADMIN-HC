import React from 'react';

/** Upload slot for one customer document, showing what's already on file. */
export const DocUploadField: React.FC<{
  label:       string;
  existingUrl?: string | null;
  file:        File | null;
  onChange:    (f: File | null) => void;
}> = ({ label, existingUrl, file, onChange }) => {
  const [preview, setPreview] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isImage = (url: string) => /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url);

  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
        {label}
      </label>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,.pdf" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0] ?? null; onChange(f); e.target.value = ''; }} />

      {/* Existing file row */}
      {existingUrl && !file && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '6px 10px', borderRadius: 8, background: '#f8faff', border: '1px solid rgba(75,166,234,0.18)' }}>
          {isImage(existingUrl) ? (
            <img src={existingUrl} alt="doc" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: 6, background: '#e0edfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          )}
          <a href={existingUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 12, color: '#3A74C2', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            View current file
          </a>
          <button type="button" onClick={() => inputRef.current?.click()} style={{ minHeight: 44, fontSize: 11, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            Replace
          </button>
        </div>
      )}

      {/* New file preview */}
      {file && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, border: '1.5px solid #4ba6ea', background: 'rgba(75,166,234,0.04)', marginBottom: 0 }}>
          {preview ? (
            <img src={preview} alt="preview" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: '1px solid rgba(75,166,234,0.2)' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: 6, background: 'rgba(75,166,234,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f1117', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
            <div style={{ fontSize: 11, color: '#3A74C2', marginTop: 1 }}>Ready · {(file.size / 1024).toFixed(0)} KB</div>
          </div>
          <button type="button" onClick={() => onChange(null)}
            aria-label="Remove file"
            style={{ width: 44, height: 44, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', flexShrink: 0 }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.color = '#ef4444'; b.style.borderColor = '#fca5a5'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.color = '#9ca3af'; b.style.borderColor = '#e5e7eb'; }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      )}

      {/* Upload zone — only when no new file */}
      {!file && (
        <button type="button" onClick={() => inputRef.current?.click()}
          style={{ width: '100%', height: existingUrl ? 44 : 68, borderRadius: 9, border: '1.5px dashed #e5e7eb', background: '#fafafa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', color: '#9ca3af', transition: 'all 140ms ease' }}
          onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = '#4ba6ea'; b.style.color = '#3A74C2'; b.style.background = 'rgba(75,166,234,0.04)'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; b.style.background = '#fafafa'; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          {!existingUrl && <span style={{ fontSize: 11, fontWeight: 500 }}>Upload file</span>}
        </button>
      )}
    </div>
  );
};
