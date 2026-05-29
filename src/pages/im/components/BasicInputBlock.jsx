import  { useState, useEffect, useRef, useCallback } from 'react';
import { Info, UploadCloud, X, FileText } from 'lucide-react';
import BlockWrapper from './BlockWrapper.jsx';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const storage = getStorage();

// ── MIXED (FILL IN BLANKS) INLINE INPUT ──────────────────────────────────────
const MixedInlineInput = ({ val, onChange, disabled, placeholder, t, focusHandlers }) => {
  const spanRef = useRef(null);
  useEffect(() => {
    if (spanRef.current && !spanRef.current.textContent && val) spanRef.current.textContent = val;
  }, [val]);
  useEffect(() => {
    if (spanRef.current && val !== spanRef.current.textContent) {
      if (document.activeElement !== spanRef.current) spanRef.current.textContent = val || '';
    }
  }, [val]);
  return (
    <span
      ref={spanRef}
      className="mixed-inline-input"
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={e => onChange(e.currentTarget.textContent)}
      onPaste={e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }}
      onFocus={focusHandlers?.onFocus}
      onBlur={focusHandlers?.onBlur}
      style={{
        display: 'inline-block', minWidth: '60px', maxWidth: '250px',
        padding: '2px 6px', margin: '0 4px', border: `1px solid ${t.border}`,
        borderRadius: '4px', fontSize: '0.8rem', color: t.text,
        background: 'transparent', outline: 'none', wordBreak: 'break-word',
        whiteSpace: 'pre-wrap', cursor: disabled ? 'not-allowed' : 'text', verticalAlign: 'middle',
      }}
    />
  );
};

export default function BasicInputBlock({ block, value, onChange, lockedBy, onFocus, onBlur, isDark = true }) {
  const [localValue, setLocalValue] = useState(value ?? '');
  const [isFocused, setIsFocused] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState(Array.isArray(value) ? value : []);
  const placeholderText = block.placeholder || block.desc || '';
  const usePlaceholderGuide = !!block.showPlaceholderAsGuide && !!placeholderText;
  const effectivePlaceholder = usePlaceholderGuide ? '' : placeholderText;
  const [hiddenGuides, setHiddenGuides] = useState({});
  const showFullPlaceholder = usePlaceholderGuide && !hiddenGuides[block.id];
  const typingTimeout = useRef(null);
  const fileInputRef = useRef(null);

  // ── THEME TOKENS ────────────────────────────────────────────────────────
  const t = {
    bg: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
    border: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
    borderFocus: isDark ? '#ef4444' : '#dc2626',
    text: isDark ? '#e2e8f0' : '#111827',
    textMuted: isDark ? '#94a3b8' : '#6b7280',
    surface: isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb',
    accent: '#ef4444',
    guide: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.06)',
    guideText: '#3b82f6',
    guideLeft: '#3b82f6',
    toggleOff: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
    naBtn: isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6',
    naBtnActive: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
    uploadZone: isDark ? 'rgba(255,255,255,0.02)' : '#fafafa',
    captionBg: isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6',
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '8px',
    background: t.bg,
    border: `1px solid ${t.border}`,
    color: t.text,
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box',
  };

  const focusStyle = {
    borderColor: t.borderFocus,
    boxShadow: `0 0 0 2px rgba(239,68,68,0.15)`,
  };

  // ── INCOMING DATA SYNC ──────────────────────────────────────────────────
  // isUploading blocks ALL snapshot interference while upload is in flight.
  // The 2s cooldown in finally{} covers both Firestore snapshot firings
  // (local write ack + server confirm) so the guard never expires too early.
  useEffect(() => {
    if (isFocused) return;
    if (isUploading) return; // ← key fix: ignore ANY incoming value while uploading

    if (block.type === 'image' || block.type === 'file') {
      if (Array.isArray(value)) {
        setUploadedFiles(value);
      } else if (value && typeof value === 'object') {
        setUploadedFiles([value]);
      } else if (typeof value === 'string' && value) {
        setUploadedFiles([{ url: value, name: 'Image', caption: '' }]);
      } else {
        setUploadedFiles([]);
      }
    } else if (block.type === 'mixed') {
      // Ensure mixed blocks initialize as arrays
      setLocalValue(Array.isArray(value) ? value : []);
    } else if (value !== localValue) {
      setLocalValue(value ?? '');
    }
  }, [value, isFocused, isUploading, block.type, localValue]);

  // ── DEBOUNCED SAVE ──────────────────────────────────────────────────────
  const debouncedSave = useCallback((val) => {
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      if (onChange) onChange(block.dataPath, val);
    }, 600);
  }, [onChange, block.dataPath]);

  const handleChange = (e) => {
    const val = e.target.value;
    setLocalValue(val);
    debouncedSave(val);
  };

  const handleMixedChange = (newVal, idx) => {
    const arr = Array.isArray(localValue) ? [...localValue] : [];
    arr[idx] = newVal;
    setLocalValue(arr);
    debouncedSave(arr);
  };

  const handleFocus = (e) => {
    setIsFocused(true);
    if (e?.currentTarget) {
      e.currentTarget.style.borderColor = t.borderFocus;
      e.currentTarget.style.boxShadow = focusStyle.boxShadow;
    }
    if (onFocus) onFocus(block.id);
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    if (e?.currentTarget) {
      e.currentTarget.style.borderColor = t.border;
      e.currentTarget.style.boxShadow = 'none';
    }
    if (onBlur) onBlur(block.id);
    clearTimeout(typingTimeout.current);
    if (onChange) onChange(block.dataPath, localValue);
  };

  // ── IMAGE / FILE UPLOAD ─────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setIsUploading(true);
    try {
      const uploads = await Promise.all(files.map(async (file) => {
        const path = `im-uploads/${block.dataPath}/${Date.now()}-${file.name}`;
        const snap = await uploadBytes(storageRef(storage, path), file);
        const url = await getDownloadURL(snap.ref);
        return { url, name: file.name, type: file.type, path, caption: '' };
      }));
      const newFiles = block.multiple ? [...uploadedFiles, ...uploads] : uploads;
      setUploadedFiles(newFiles);
      if (onChange) onChange(block.dataPath, newFiles);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      // Keep isUploading=true for 2s to block both Firestore snapshot firings
      // (Firestore fires once for local write ack, once for server confirmation)
      setTimeout(() => setIsUploading(false), 2000);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeFile = (idx) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== idx);
    setUploadedFiles(newFiles);
    if (onChange) onChange(block.dataPath, newFiles);
  };

  const updateFileCaption = (idx, caption) => {
    const updated = uploadedFiles.map((f, i) => i === idx ? { ...f, caption } : f);
    setUploadedFiles(updated);
    if (onChange) onChange(block.dataPath, updated);
  };

  // ── NA TOGGLE ───────────────────────────────────────────────────────────
  const isNA = localValue === '__NA__';
  const handleNAToggle = () => {
    const newVal = isNA ? '' : '__NA__';
    setLocalValue(newVal);
    if (onChange) onChange(block.dataPath, newVal);
  };

  // ── RENDER ──────────────────────────────────────────────────────────────
  const renderInput = () => {
// 1. INSTRUCTION block — read-only note
    if (block.type === 'instruction') {
      return (
        <div style={{ padding: '12px 16px', borderRadius: '8px', fontSize: '0.85rem', color: t.guideText, background: t.guide, borderLeft: `3px solid ${t.guideLeft}`, lineHeight: 1.6 }}>
          <Info size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          <span style={{ whiteSpace: 'pre-wrap' }}>{block.content || block.desc || block.label}</span>
        </div>
      );
    }

    // 2. BOOLEAN yes/no toggle
    if (block.type === 'boolean') {
      const options = block.options || ['Yes', 'No'];
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {options.map(opt => {
            const active = localValue === opt;
            return (
              <button key={opt} onClick={() => { setLocalValue(opt); if (onChange) onChange(block.dataPath, opt); }}
                style={{ padding: '9px 22px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', border: `1px solid ${active ? t.accent : t.border}`, background: active ? 'rgba(239,68,68,0.15)' : t.bg, color: active ? t.accent : t.textMuted }}>
                {opt}
              </button>
            );
          })}
        </div>
      );
    }

    // 3. COMPLIANCE block — Yes / No / NA
    if (block.type === 'compliance') {
      const opts = block.options || ['Yes', 'No', 'NA'];
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {opts.map(opt => {
            const active = localValue === opt;
            const color = opt === 'Yes' ? '#10b981' : opt === 'No' ? '#ef4444' : '#f59e0b';
            return (
              <button key={opt} onClick={() => { setLocalValue(opt); if (onChange) onChange(block.dataPath, opt); }}
                style={{ padding: '9px 22px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', border: `1px solid ${active ? color : t.border}`, background: active ? `${color}22` : t.bg, color: active ? color : t.textMuted }}>
                {opt}
              </button>
            );
          })}
        </div>
      );
    }

    // 4. IMAGE upload
    if (block.type === 'image') {
      const imgWidth = block.imageWidth || '100%';
      const imgHeight = block.imageHeight || '180px';
      const imgFit = block.objectFit || 'cover';
      const showCaption = block.allowCaption !== false;
      return (
        <div>
          {/* Hidden file input */}
          <input ref={fileInputRef} type="file" accept="image/*" multiple={!!block.multiple} style={{ display: 'none' }} onChange={handleFileUpload} />

          {/* Upload zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{ border: `2px dashed ${t.border}`, borderRadius: 10, padding: '20px 16px', textAlign: 'center', cursor: 'pointer', background: t.uploadZone, transition: 'border-color 0.2s, background 0.2s', color: t.textMuted, fontSize: '0.85rem' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.background = 'rgba(239,68,68,0.04)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.background = t.uploadZone; }}
          >
            {isUploading
              ? <span style={{ color: t.accent, fontWeight: 600 }}>Uploading…</span>
              : <>
                  <UploadCloud size={20} style={{ margin: '0 auto 8px', display: 'block', color: t.textMuted }} />
                  <span>Click to upload {block.multiple ? 'images' : 'an image'}</span>
                </>
            }
          </div>

          {/* Preview grid */}
          {uploadedFiles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
              {uploadedFiles.map((f, i) => (
                <div key={i} style={{ position: 'relative', width: imgWidth === '100%' ? '100%' : 'auto', maxWidth: imgWidth === '100%' ? '100%' : imgWidth, borderRadius: 10, border: `1px solid ${t.border}`, overflow: 'hidden', background: t.surface }}>
                  <img
                    src={f.url}
                    alt={f.caption || f.name || 'Uploaded image'}
                    style={{ display: 'block', width: '100%', height: imgHeight, objectFit: imgFit }}
                    onError={e => { e.currentTarget.style.background = t.surface; e.currentTarget.style.minHeight = imgHeight; }}
                  />
                  {/* Remove button */}
                  <button onClick={() => removeFile(i)}
                    style={{ position: 'absolute', top: 6, right: 6, background: '#ef4444', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
                    <X size={11} />
                  </button>
                  {/* Caption input */}
                  {showCaption && (
                    <div style={{ padding: '6px 10px 8px', background: t.captionBg }}>
                      <input
                        type="text"
                        placeholder="Add a caption or name…"
                        value={f.caption || ''}
                        onChange={e => updateFileCaption(i, e.target.value)}
                        style={{ ...inputStyle, padding: '6px 10px', fontSize: '0.78rem', borderRadius: 6, background: t.bg }}
                      />
                    </div>
                  )}
                  {/* File name label */}
                  <div style={{ padding: showCaption ? '0 10px 8px' : '6px 10px 8px', fontSize: '0.72rem', color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // 5. FILE upload — PDFs, docs, etc.
    if (block.type === 'file') {
      const showNA = block.allowNA !== false;
      if (isNA) {
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: '8px 18px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>NA</span>
            <button onClick={handleNAToggle} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '0.8rem' }}>Change</button>
          </div>
        );
      }
      return (
        <div>
          <input ref={fileInputRef} type="file" accept={block.accept} multiple={!!block.multiple} style={{ display: 'none' }} onChange={handleFileUpload} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => fileInputRef.current?.click()}
              style={{ padding: '9px 18px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', border: `1px solid ${t.border}`, background: t.surface, color: t.text, display: 'flex', alignItems: 'center', gap: 6 }}>
              <UploadCloud size={14} />
              {isUploading ? 'Uploading…' : 'Attach File'}
            </button>
            {showNA && (
              <button onClick={handleNAToggle}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', border: `1px solid ${t.border}`, background: t.naBtn, color: t.textMuted }}>
                Mark as NA
              </button>
            )}
          </div>
          {uploadedFiles.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {uploadedFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: t.surface, border: `1px solid ${t.border}` }}>
                  <FileText size={14} style={{ color: t.textMuted, flexShrink: 0 }} />
                  <a href={f.url} target="_blank" rel="noopener noreferrer"
                    style={{ flex: 1, color: '#3b82f6', fontSize: '0.85rem', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </a>
                  <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // 6. DROPDOWN / SELECT
    if (block.type === 'dropdown' || block.type === 'select') {
      return (
        <select value={localValue} onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur}
          style={{ ...inputStyle, color: localValue ? t.text : t.textMuted, cursor: 'pointer' }}>
          <option value="">{effectivePlaceholder || 'Select an option'}</option>
          {(block.options || []).map(opt => (
            <option key={opt} value={opt} style={{ background: isDark ? '#1f2937' : '#fff', color: t.text }}>{opt}</option>
          ))}
        </select>
      );
    }

    // 7. TEXTAREA
    if (block.type === 'textarea') {
      return (
        <textarea value={localValue} onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur}
          placeholder={effectivePlaceholder} rows={block.rows || 4}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
      );
    }

    // 8. NUMBER / CURRENCY / PERCENTAGE
    if (block.type === 'number' || block.type === 'currency' || block.type === 'percentage') {
      const prefix = block.type === 'currency' ? '₹' : null;
      const suffix = block.type === 'percentage' ? '%' : null;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {prefix && <span style={{ padding: '12px 12px', background: t.surface, border: `1px solid ${t.border}`, borderRight: 'none', borderRadius: '8px 0 0 8px', color: t.textMuted, fontSize: '0.9rem', fontWeight: 600 }}>{prefix}</span>}
          <input type="number" value={localValue} onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur}
            placeholder={effectivePlaceholder || '0'}
            style={{ ...inputStyle, borderRadius: prefix ? '0 8px 8px 0' : suffix ? '8px 0 0 8px' : '8px', borderLeft: prefix ? 'none' : `1px solid ${t.border}`, borderRight: suffix ? 'none' : `1px solid ${t.border}` }} />
          {suffix && <span style={{ padding: '12px 12px', background: t.surface, border: `1px solid ${t.border}`, borderLeft: 'none', borderRadius: '0 8px 8px 0', color: t.textMuted, fontSize: '0.9rem', fontWeight: 600 }}>{suffix}</span>}
        </div>
      );
    }

    // 9. DATE
    if (block.type === 'date') {
      return (
        <input type="date" value={localValue} onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur}
          style={{ ...inputStyle, colorScheme: isDark ? 'dark' : 'light' }} />
      );
    }

    // 10. MIXED (Fill-in-the-blanks)
    if (block.type === 'mixed') {
      const parts = (block.template || '').split(/(\[[^\]]+\])/g);
      const inputs = Array.isArray(localValue) ? localValue : [];
      let inputIdx = 0;
      
      return (
        <div 
          onClick={handleFocus}
          style={{ 
            ...inputStyle, 
            lineHeight: 1.8, 
            cursor: 'text',
            borderColor: isFocused ? t.borderFocus : t.border,
            boxShadow: isFocused ? focusStyle.boxShadow : 'none'
          }}
        >
<style>{`
  .mixed-inline-input:empty::before { 
    content: attr(data-placeholder); 
    color: ${t.textMuted}; 
    pointer-events: none; 
    opacity: 0.6; 
    /* Safe wrap restored */
    white-space: pre-wrap;
    word-wrap: break-word;
  } 
  .mixed-inline-input:focus { 
    border-color: ${t.accent} !important; 
    box-shadow: 0 0 0 2px rgba(239,68,68,0.15); 
  }
`}</style>
         {parts.map((part, pi) => {
            if (/^\[.+\]$/.test(part)) {
              const idx      = inputIdx++;
              const inner    = part.slice(1, -1);
              const colonIdx = inner.indexOf(':');
              const placeholder = colonIdx !== -1 ? inner.slice(colonIdx + 1).trim() : inner.trim();
              return (
                <MixedInlineInput 
                  key={pi} 
                  val={inputs[idx] || ''} 
                  onChange={newVal => handleMixedChange(newVal, idx)} 
                  disabled={!!lockedBy} 
                  placeholder={placeholder} 
                  t={t} 
                  focusHandlers={{ onFocus: handleFocus, onBlur: handleBlur }} 
                />
              );
            }
            return <span key={pi} style={{ color: t.text, fontSize: '0.85rem' }}>{part}</span>;
          })}
        </div>
      );
    }

    // 11. EMAIL / TEXT — default
    return (
      <input
        type={block.type === 'email' ? 'email' : 'text'}
        value={localValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={effectivePlaceholder}
        style={inputStyle}
      />
    );
  };

return (
    <BlockWrapper block={block} lockedBy={lockedBy} isDark={isDark}>
      <div style={{ marginBottom: 4 }}>
        
        {/* Toggle Button for Long Placeholders */}
        {usePlaceholderGuide && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <button 
              onClick={() => setHiddenGuides(prev => ({ ...prev, [block.id]: !prev[block.id] }))}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: t.accent, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              <Info size={12} /> {showFullPlaceholder ? 'Hide Guide' : 'Show Guide'}
            </button>
          </div>
        )}

        {/* The input */}
        {renderInput()}

        {/* The Revealable Placeholder Guide */}
        {usePlaceholderGuide && showFullPlaceholder && (
          <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 6, fontSize: 12, color: t.text, background: t.surface, borderLeft: `3px solid ${t.accent}`, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {placeholderText}
          </div>
        )}

        {/* Existing Guide text below the field */}
        {block.guide && block.type !== 'instruction' && (
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, fontSize: 12, color: t.guideText, background: t.guide, borderLeft: `3px solid ${t.guideLeft}`, lineHeight: 1.5 }}>
            {block.guide}
          </div>
        )}
      </div>
    </BlockWrapper>
  );
}