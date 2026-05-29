import  { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Plus, Trash2, UploadCloud, X, FileText } from 'lucide-react';
import BlockWrapper from './BlockWrapper';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const storage = getStorage();

export default function RepeatingGroupBlock({ block, value, onChange, lockedBy, onFocus, onBlur, isDark = true }) {
  const [isFocused, setIsFocused] = useState(false);
  const typingTimeout = useRef(null);
  const fileRefs = useRef({});   // keyed by `${itemIndex}-${fieldId}`

  const t = {
    bg:          isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
    border:      isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
    borderFocus: '#ef4444',
    text:        isDark ? '#e2e8f0' : '#111827',
    textMuted:   isDark ? '#94a3b8' : '#6b7280',
    surface:     isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb',
    card:        isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
    cardBorder:  isDark ? 'rgba(255,255,255,0.07)' : '#e5e7eb',
    accent:      '#ef4444',
    numBg:       isDark ? 'rgba(255,255,255,0.06)' : '#f3f4f6',
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: '8px',
    background: t.bg, border: `1px solid ${t.border}`,
    color: t.text, fontSize: '0.875rem', fontFamily: 'inherit',
    outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box',
  };

  // Default template if schema doesn't provide one
  const template = useMemo(() => block.template || [
    { id: 'title', label: 'Title / Name', type: 'text' },
    { id: 'desc',  label: 'Description', type: 'textarea' },
  ], [block.template]);

  const generateEmptyItem = useCallback(() => {
    const item = { _id: crypto.randomUUID() };
    template.forEach(f => { item[f.id] = f.type === 'image' || f.type === 'file' ? [] : ''; });
    return item;
  }, [template]);

  const [items, setItems] = useState(() => {
    if (Array.isArray(value) && value.length > 0) return value;
    return [generateEmptyItem()];
  });

  // ── INCOMING FIREBASE SYNC ────────────────────────────────────────────────
  useEffect(() => {
    if (!isFocused && Array.isArray(value) && JSON.stringify(value) !== JSON.stringify(items)) {
      setItems(value.length > 0 ? value : [generateEmptyItem()]);
    }
  }, [value, isFocused, generateEmptyItem, items]);

  // ── DEBOUNCED SAVE ────────────────────────────────────────────────────────
  const debouncedSave = useCallback((newItems) => {
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      if (onChange) onChange(block.dataPath, newItems);
    }, 800);
  }, [onChange, block.dataPath]);

  // ── MUTATIONS ─────────────────────────────────────────────────────────────
  const updateField = (itemIdx, fieldId, val) => {
    const next = items.map((item, i) => i === itemIdx ? { ...item, [fieldId]: val } : item);
    setItems(next);
    debouncedSave(next);
  };

  const addItem = () => {
    const next = [...items, generateEmptyItem()];
    setItems(next);
    debouncedSave(next);
  };

  const removeItem = (idx) => {
    const next = items.filter((_, i) => i !== idx);
    const final = next.length > 0 ? next : [generateEmptyItem()];
    setItems(final);
    debouncedSave(final);
  };

  const handleFocus = () => { setIsFocused(true); if (onFocus) onFocus(block.id); };
  const handleBlur  = () => {
    setIsFocused(false); if (onBlur) onBlur(block.id);
    clearTimeout(typingTimeout.current);
    if (onChange) onChange(block.dataPath, items);
  };

  // ── IMAGE / FILE UPLOAD per field per item ────────────────────────────────
  const handleUpload = async (itemIdx, field, files) => {
    const uploaded = await Promise.all(Array.from(files).map(async (file) => {
      const path = `im-uploads/${block.dataPath}/${itemIdx}-${field.id}-${Date.now()}-${file.name}`;
      const snap = await uploadBytes(storageRef(storage, path), file);
      const url  = await getDownloadURL(snap.ref);
      return { url, name: file.name, type: file.type };
    }));
    const current  = Array.isArray(items[itemIdx]?.[field.id]) ? items[itemIdx][field.id] : [];
    const newFiles = field.multiple ? [...current, ...uploaded] : uploaded;
    updateField(itemIdx, field.id, newFiles);
  };

  const removeUpload = (itemIdx, fieldId, fileIdx) => {
    const current  = Array.isArray(items[itemIdx]?.[fieldId]) ? items[itemIdx][fieldId] : [];
    const newFiles = current.filter((_, i) => i !== fileIdx);
    updateField(itemIdx, fieldId, newFiles);
  };

  // ── FIELD RENDERER ────────────────────────────────────────────────────────
  const renderField = (field, item, itemIdx) => {
    const val = item[field.id] ?? '';
    const refKey = `${itemIdx}-${field.id}`;

    // Image upload
    if (field.type === 'image') {
      const files = Array.isArray(val) ? val : [];
      return (
        <div key={field.id} style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: t.textMuted, display: 'block', marginBottom: '6px' }}>
            {field.label}
          </label>
          <input
            type="file" accept="image/*" multiple={!!field.multiple}
            style={{ display: 'none' }}
            ref={el => fileRefs.current[refKey] = el}
            onChange={e => { handleUpload(itemIdx, field, e.target.files); e.target.value = ''; }}
          />
          <div
            onClick={() => fileRefs.current[refKey]?.click()}
            style={{
              border: `2px dashed ${t.border}`, borderRadius: '8px', padding: '16px',
              textAlign: 'center', cursor: 'pointer', background: t.bg,
              color: t.textMuted, fontSize: '0.8rem', transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = t.accent}
            onMouseLeave={e => e.currentTarget.style.borderColor = t.border}
          >
            <UploadCloud size={16} style={{ margin: '0 auto 4px', display: 'block' }} />
            Click to upload {field.multiple ? 'images' : 'image'}
          </div>
          {/* Caption input — fixes site photos issue */}
          {files.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
              {files.map((f, fi) => (
                <div key={fi} style={{ width: '90px' }}>
                  <div style={{ position: 'relative', width: '90px', height: '90px' }}>
                    <img src={f.url} alt={f.caption || f.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px', border: `1px solid ${t.border}` }}
                    />
                    <button onClick={() => removeUpload(itemIdx, field.id, fi)}
                      style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                      <X size={10} />
                    </button>
                  </div>
                  {/* Editable caption per image */}
                  <input
                    type="text"
                    placeholder="Caption…"
                    value={f.caption || ''}
                    onChange={e => {
                      const current = [...(Array.isArray(val) ? val : [])];
                      current[fi] = { ...current[fi], caption: e.target.value };
                      updateField(itemIdx, field.id, current);
                    }}
                    style={{ ...inputStyle, marginTop: '4px', fontSize: '0.75rem', padding: '5px 8px' }}
                    onFocus={handleFocus} onBlur={handleBlur}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // File upload (PDFs, docs)
    if (field.type === 'file') {
      const files = Array.isArray(val) ? val : [];
      return (
        <div key={field.id} style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: t.textMuted, display: 'block', marginBottom: '6px' }}>
            {field.label}
          </label>
          <input
            type="file" multiple={!!field.multiple}
            style={{ display: 'none' }}
            ref={el => fileRefs.current[refKey] = el}
            onChange={e => { handleUpload(itemIdx, field, e.target.files); e.target.value = ''; }}
          />
          <button onClick={() => fileRefs.current[refKey]?.click()}
            style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UploadCloud size={13} /> Attach File
          </button>
          {files.map((f, fi) => (
            <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', padding: '6px 10px', borderRadius: '6px', background: t.surface, border: `1px solid ${t.border}` }}>
              <FileText size={12} style={{ color: t.textMuted }} />
              <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: '#3b82f6', fontSize: '0.8rem', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</a>
              <button onClick={() => removeUpload(itemIdx, field.id, fi)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={12} /></button>
            </div>
          ))}
        </div>
      );
    }

    // Textarea
    if (field.type === 'textarea') {
      return (
        <div key={field.id} style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: t.textMuted, display: 'block', marginBottom: '6px' }}>{field.label}</label>
          <textarea
            value={val} rows={field.rows || 3}
            onChange={e => updateField(itemIdx, field.id, e.target.value)}
            onFocus={e => { handleFocus(); e.currentTarget.style.borderColor = t.borderFocus; }}
            onBlur={e =>  { handleBlur();  e.currentTarget.style.borderColor = t.border; }}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}…`}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>
      );
    }

    // Dropdown / select
    if (field.type === 'select' || field.type === 'dropdown') {
      return (
        <div key={field.id} style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: t.textMuted, display: 'block', marginBottom: '6px' }}>{field.label}</label>
          <select value={val} onChange={e => updateField(itemIdx, field.id, e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur}
            style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">Select…</option>
            {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
      );
    }

    // Default: text input
    return (
      <div key={field.id} style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: t.textMuted, display: 'block', marginBottom: '6px' }}>{field.label}</label>
        <input
          type="text" value={val}
          onChange={e => updateField(itemIdx, field.id, e.target.value)}
          onFocus={e => { handleFocus(); e.currentTarget.style.borderColor = t.borderFocus; }}
          onBlur={e =>  { handleBlur();  e.currentTarget.style.borderColor = t.border; }}
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}…`}
          style={inputStyle}
        />
      </div>
    );
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <BlockWrapper block={block} lockedBy={lockedBy} isDark={isDark}>


      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {items.map((item, idx) => (
          <div key={item._id || idx} style={{
            display: 'flex', gap: '12px', alignItems: 'flex-start',
            background: t.card, border: `1px solid ${t.cardBorder}`,
            borderRadius: '10px', padding: '16px',
          }}>
            {/* Auto S.No — not editable, fixes "can't change S.No" feedback */}
            <div style={{
              minWidth: '28px', height: '28px', borderRadius: '6px',
              background: t.numBg, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800,
              color: t.textMuted, flexShrink: 0, marginTop: '2px',
            }}>
              {idx + 1}
            </div>

            {/* Fields */}
            <div style={{ flex: 1 }}>
              {template.map(field => renderField(field, item, idx))}
            </div>

            {/* Remove — won't remove the last entry, just clears it */}
            <button
              onClick={() => removeItem(idx)}
              title="Remove entry"
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.5, transition: 'opacity 0.2s', paddingTop: '2px', flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {/* Add entry */}
      <button
        onClick={addItem}
        style={{
          marginTop: '12px', width: '100%', padding: '10px',
          borderRadius: '8px', border: `1px dashed ${t.border}`,
          background: 'transparent', color: t.textMuted,
          fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '6px', transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.color = t.accent; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.textMuted; }}
      >
        <Plus size={14} /> Add {block.addLabel || 'New Entry'}
      </button>
    </BlockWrapper>
  );
}