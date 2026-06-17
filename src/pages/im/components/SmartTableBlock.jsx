import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Plus, Trash2, Copy, Clipboard, Info } from 'lucide-react';
import BlockWrapper from './BlockWrapper';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../../../firebase.js';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

const storage = getStorage();

// ── GLOBAL HIGHLIGHT STYLES ──────────────────────────────────────────────────
const STYLE_ID = 'im-smarttable-comments-styles';
if (!document.getElementById(STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    .comment-glow {
      background-color: rgba(245,158,11,0.28) !important;
      border-bottom: 2px solid #f59e0b !important;
      cursor: pointer !important;
      transition: background-color 0.15s;
      border-radius: 2px;
    }
    .comment-glow:hover {
      background-color: rgba(245,158,11,0.45) !important;
    }
  `;
  document.head.appendChild(s);
}

// ── ADDED: GLOBAL HIGHLIGHT STYLES FOR QUILL ─────────────────────────────────
const STYLE_ID_QUILL = 'im-smarttable-quill-comments';
if (!document.getElementById(STYLE_ID_QUILL)) {
  const s = document.createElement('style');
  s.id = STYLE_ID_QUILL;
  s.textContent = `
    mark.im-comment-highlight {
      background-color: rgba(245,158,11,0.28) !important;
      border-bottom: 2px solid #f59e0b !important;
      border-radius: 0 !important; padding: 0 !important; margin: 0 !important;
      display: inline !important; line-height: inherit !important;
      cursor: pointer !important; transition: background-color 0.15s;
      color: inherit !important;
    }
    mark.im-comment-highlight:hover { background-color: rgba(245,158,11,0.45) !important; }
    mark.im-comment-highlight[data-comment-status="resolved"] {
      background-color: rgba(148,163,184,0.18) !important;
      border-bottom: 2px solid #94a3b8 !important;
    }
    .active-comment-glow {
      background-color: rgba(245, 158, 11, 0.6) !important;
      transition: background-color 0.3s ease !important;
    }
  `;
  document.head.appendChild(s);
}

// ── ADDED: COMMENT BLOT FOR INLINE QUILL ──────────────────────────────────────
if (!Quill.imports['formats/comment']) {
  const Inline = Quill.import('blots/inline');
  class CommentBlot extends Inline {
    static create(value) {
      const node = super.create();
      node.setAttribute('data-comment-id', value.id || value);
      node.setAttribute('data-comment-status', value.status || 'open');
      node.className = 'im-comment-highlight';
      CommentBlot.applyStyle(node, value.status || 'open');
      node.style.cursor = 'pointer';
      return node;
    }
    static applyStyle(node, status) {
      if (status === 'resolved') {
        node.style.backgroundColor = 'rgba(148,163,184,0.18)';
        node.style.borderBottom = '2px solid #94a3b8';
      } else {
        node.style.backgroundColor = 'rgba(245,158,11,0.28)';
        node.style.borderBottom = '2px solid #f59e0b';
      }
    }
    static formats(node) {
      return {
        id: node.getAttribute('data-comment-id'),
        status: node.getAttribute('data-comment-status') || 'open',
      };
    }
  }
  CommentBlot.blotName = 'comment';
  CommentBlot.tagName = 'mark';
  Quill.register(CommentBlot, true);
}

// ── ADDED: QUILL RANGE HELPERS ────────────────────────────────────────────────
function escapeRegex(value = '') { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function findQuoteRange(quill, quote) {
  if (!quill || !quote) return null;
  const text = quill.getText() || '';
  const trimmedQuote = quote.trim();
  if (!trimmedQuote) return null;
  const exactIndex = text.indexOf(trimmedQuote);
  if (exactIndex !== -1) return { index: exactIndex, length: trimmedQuote.length };
  const ciIndex = text.toLowerCase().indexOf(trimmedQuote.toLowerCase());
  if (ciIndex !== -1) return { index: ciIndex, length: trimmedQuote.length };
  const normalizedQuote = trimmedQuote.replace(/\s+/g, ' ');
  if (!normalizedQuote) return null;
  const pattern = escapeRegex(normalizedQuote).replace(/\s+/g, '\\s+');
  const wsMatch = text.match(new RegExp(pattern));
  if (wsMatch?.[0]) return { index: wsMatch.index, length: wsMatch[0].length };
  const wsCiMatch = text.match(new RegExp(pattern, 'i'));
  if (wsCiMatch?.[0]) return { index: wsCiMatch.index, length: wsCiMatch[0].length };
  return null;
}

function ensureCommentHighlight(quill, { commentId, quote, status = 'open' }) {
  if (!quill || !commentId || !quote) return false;
  const existing = quill.root.querySelector(`[data-comment-id="${commentId}"]`);
  if (existing) return false;
  const range = findQuoteRange(quill, quote);
  if (!range || range.length === 0) return false;
  quill.formatText(range.index, range.length, 'comment', { id: commentId, status }, 'silent');
  return true;
}

// ── UNIQUE ID HELPER ─────────────────────────────────────────────────────────
const genRowId = () => `row_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
const addRowId = (r) => (r && r._rowId ? r : { ...r, _rowId: genRowId() });

// ── VALUE PARSER ─────────────────────────────────────────────────────────────
function parseValue(value, block) {
  if (value && !Array.isArray(value) && typeof value === 'object' && value.rows) {
    return {
      rows: (Array.isArray(value.rows) ? value.rows : []).map(addRowId),
      headers: value.headers || block.colHeaders || [],
      repeatedTables: (Array.isArray(value.repeatedTables) ? value.repeatedTables : []).map((tObj, i) => {
        if (tObj && typeof tObj === 'object' && tObj.rows) {
          return { ...tObj, rows: (Array.isArray(tObj.rows) ? tObj.rows : []).map(addRowId), instanceName: tObj.instanceName || '' };
        }
        return { id: tObj?.id || `table_copy_${Date.now()}_${i}`, rows: [], instanceName: '' };
      }),
      runtimeSchemaRows: Array.isArray(value.runtimeSchemaRows) ? value.runtimeSchemaRows : null,
      mainInstanceName: value.mainInstanceName || '',
      subheadingInputs: Array.isArray(value.subheadingInputs) ? value.subheadingInputs : [],
    };
  }
  let rows = value;
  if (rows && typeof rows === 'object' && !Array.isArray(rows)) {
    rows = Object.keys(rows).sort((a, b) => Number(a) - Number(b)).map(k => rows[k]);
  }
  const defaultRowCount = block.baseRowCount || block.numRows || 1;
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    rows = Array.from({ length: defaultRowCount }, () => addRowId({}));
  } else {
    rows = rows.map(addRowId);
  }
  return { rows, headers: block.colHeaders || [], repeatedTables: [], runtimeSchemaRows: null, mainInstanceName: '', subheadingInputs: [] };
}

function seedEmptyRow(schemaRows) {
  const row = { _rowId: genRowId() };
  (schemaRows || []).forEach(schemaRow => {
    (schemaRow.cells || []).forEach(cell => {
      if (cell.id && cell.cellType !== 'fixed' && cell.cellType !== 'computed') {
        row[cell.id] = cell.cellType === 'mixed' ? [] : (cell.cellType === 'smart-select' ? { selected: '', inputs: [] } : '');
      }
    });
  });
  return row;
}

// ── HYBRID TEXTAREA COMPONENT ────────────────────────────────────────────────
const HybridTextarea = ({ val, onChange, disabled, placeholder, cellInputStyle, focusHandlers, comments, isDark }) => {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [isEditing, val]);

  const handleViewClick = () => { if (!disabled) setIsEditing(true); };
  const handleBlur = (e) => { setIsEditing(false); if (focusHandlers?.onBlur) focusHandlers.onBlur(e); };

const renderHighlightedText = () => {
    if (val === undefined || val === null || val === '') {
      return <span style={{ color: isDark ? '#94a3b8' : '#6b7280', fontStyle: 'italic' }}>{placeholder || ''}</span>;
    }
    
    let text = String(val);
    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // Highlight Comments
    if (comments && comments.length > 0) {
      comments.forEach(c => {
        if (c.quote && c.status !== 'resolved') {
          const safeQuote = c.quote.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const escapedQuote = safeQuote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(${escapedQuote})`, 'gi');
          html = html.replace(regex, `<span data-comment-id="${c.id}" class="comment-glow">$1</span>`);
        }
      });
    }

    // Highlight Global Search Matches (Blue)
    if (window.imActiveSearchTerm) {
       const safeSearch = window.imActiveSearchTerm.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
       const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
       const regex = new RegExp(`(${escapedSearch})`, 'gi');
       html = html.replace(regex, `<span style="background-color: rgba(59,130,246,0.3); border-bottom: 2px solid #3b82f6;">$1</span>`);
    }

    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  };

  if (isEditing) {
    return (
      <textarea
        ref={inputRef}
        value={val}
        onChange={e => {
          onChange(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onBlur={handleBlur}
        onFocus={focusHandlers?.onFocus}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        title={placeholder || 'Enter value'} 
        style={{
          ...cellInputStyle, 
          whiteSpace: 'pre-wrap', 
          wordWrap: 'break-word',
          overflow: 'hidden',
          resize: 'none'
        }}      
      />
    );
  }

  return (
    <div 
      onClick={handleViewClick}
      style={{ 
        ...cellInputStyle, 
        cursor: disabled ? 'default' : 'text',
        minHeight: '34px',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
      }}
    >
      {renderHighlightedText()}
    </div>
  );
};

// ── HYBRID STANDARD INPUT COMPONENT ──────────────────────────────────────────
const HybridInput = ({ val, onChange, disabled, placeholder, cellInputStyle, focusHandlers, comments, isDark, iType, showPrefix, showSuffix }) => {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleViewClick = () => { if (!disabled) setIsEditing(true); };
  const handleBlur = (e) => { setIsEditing(false); if (focusHandlers?.onBlur) focusHandlers.onBlur(e); };

const renderHighlightedText = () => {
    if (val === undefined || val === null || val === '') {
      return <span style={{ color: isDark ? '#94a3b8' : '#6b7280', fontStyle: 'italic' }}>{placeholder || ''}</span>;
    }
    
    let text = String(val);

    if (iType === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [yyyy, mm, dd] = text.split('-');
      text = `${dd}/${mm}/${yyyy}`;
    }

    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // Highlight Comments
    if (comments && comments.length > 0) {
      comments.forEach(c => {
        if (c.quote && c.status !== 'resolved') {
          const safeQuote = c.quote.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const escapedQuote = safeQuote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(${escapedQuote})`, 'gi');
          html = html.replace(regex, `<span data-comment-id="${c.id}" class="comment-glow">$1</span>`);
        }
      });
    }

    // Highlight Global Search Matches (Blue)
    if (window.imActiveSearchTerm) {
       const safeSearch = window.imActiveSearchTerm.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
       const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
       const regex = new RegExp(`(${escapedSearch})`, 'gi');
       html = html.replace(regex, `<span style="background-color: rgba(59,130,246,0.3); border-bottom: 2px solid #3b82f6;">$1</span>`);
    }

    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  };

  if (isEditing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%' }}>
        {showPrefix && <span style={{ padding: '0 4px 0 10px', color: isDark ? '#94a3b8' : '#6b7280', fontSize: '0.8rem' }}>₹</span>}
        <input
          ref={inputRef}
          type={iType === 'currency' || iType === 'percentage' || iType === 'number' ? 'number' : (iType === 'lang' || iType === 'date' ? 'date' : 'text')}
          value={val}
          onChange={e => onChange(e.target.value)}
          onBlur={handleBlur}
          onFocus={focusHandlers?.onFocus}
          disabled={disabled}
          placeholder={placeholder}
          style={{ ...cellInputStyle, paddingLeft: showPrefix ? '2px' : '10px', colorScheme: isDark ? 'dark' : 'light' }}
        />
        {showSuffix && <span style={{ padding: '0 10px 0 2px', color: isDark ? '#94a3b8' : '#6b7280', fontSize: '0.8rem' }}>%</span>}
      </div>
    );
  }

  return (
    <div 
      onClick={handleViewClick}
      style={{ 
        ...cellInputStyle, 
        display: 'flex', 
        alignItems: 'center', 
        paddingLeft: showPrefix ? '2px' : '10px',
        cursor: disabled ? 'default' : 'text',
        minHeight: '34px',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
      }}
    >
      {showPrefix && val && <span style={{ padding: '0 4px 0 10px', color: isDark ? '#94a3b8' : '#6b7280', fontSize: '0.8rem' }}>₹</span>}
      {renderHighlightedText()}
      {showSuffix && val && <span style={{ padding: '0 10px 0 2px', color: isDark ? '#94a3b8' : '#6b7280', fontSize: '0.8rem' }}>%</span>}
    </div>
  );
};

// ── HYBRID MIXED (FILL IN BLANKS) INLINE INPUT ───────────────────────────────
const MixedInlineInput = ({ val, onChange, disabled, placeholder, t, focusHandlers, comments }) => {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) inputRef.current.focus();
  }, [isEditing]);

  const handleViewClick = () => { if (!disabled) setIsEditing(true); };
  const handleBlur = (e) => { setIsEditing(false); if (focusHandlers?.onBlur) focusHandlers.onBlur(e); };

  const renderHighlightedText = () => {
    if (val === undefined || val === null || val === '') {
      return <span style={{ color: t.textMuted, opacity: 0.6, fontStyle: 'italic' }}>{placeholder || ''}</span>;
    }

    let text = String(val);
    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Highlight Comments
    if (comments && comments.length > 0) {
      comments.forEach(c => {
        if (c.quote && c.status !== 'resolved') {
          const safeQuote = c.quote.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const escapedQuote = safeQuote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(${escapedQuote})`, 'gi');
          html = html.replace(regex, `<span data-comment-id="${c.id}" class="comment-glow">$1</span>`);
        }
      });
    }

    // Highlight Global Search Matches (Blue)
    if (window.imActiveSearchTerm) {
       const safeSearch = window.imActiveSearchTerm.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
       const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
       const regex = new RegExp(`(${escapedSearch})`, 'gi');
       html = html.replace(regex, `<span style="background-color: rgba(59,130,246,0.3); border-bottom: 2px solid #3b82f6;">$1</span>`);
    }

    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={val || ''}
        onChange={e => onChange(e.target.value)}
        onBlur={handleBlur}
        onFocus={focusHandlers?.onFocus}
        placeholder={placeholder}
        style={{
          display: 'inline-block', minWidth: '60px', maxWidth: '250px',
          padding: '2px 6px', margin: '0 4px', border: `1px solid ${t.border}`,
          borderRadius: '4px', fontSize: '0.8rem', color: t.text,
          background: 'transparent', outline: 'none',
        }}
      />
    );
  }

  return (
    <span
      onClick={handleViewClick}
      style={{
        display: 'inline-block', minWidth: '60px', maxWidth: '250px',
        padding: '2px 6px', margin: '0 4px', border: `1px solid transparent`,
        borderBottom: `1px dashed ${t.border}`,
        borderRadius: '4px', fontSize: '0.8rem', color: t.text,
        background: 'transparent', outline: 'none', wordBreak: 'break-word',
        whiteSpace: 'pre-wrap', cursor: disabled ? 'default' : 'text', verticalAlign: 'middle',
      }}
    >
      {renderHighlightedText()}
    </span>
  );
};

// ── INLINE QUILL CELL EDITOR ─────────────────────────────────────────────────
const TableQuillEditor = ({ val, onChange, disabled, placeholder, block, t, focusHandlers, isDark }) => {
  const editorRef      = useRef(null);
  const quillInstance  = useRef(null);
  const typingTimeout  = useRef(null);
  const pendingCommentRange = useRef(null); // <-- Tracks exact selection
  const [isFocused, setIsFocused] = useState(false);

  const latestOnChange = useRef(onChange);
  const latestFocusHandlers = useRef(focusHandlers);
  useEffect(() => {
    latestOnChange.current = onChange;
    latestFocusHandlers.current = focusHandlers;
  });

  useEffect(() => {
    if (!editorRef.current || quillInstance.current) return;
    function imageUploadHandler() {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.click();
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        try {
          const path = `im-quill/${block.dataPath}/table-${Date.now()}-${file.name}`;
          const snap = await uploadBytes(storageRef(storage, path), file);
          const url  = await getDownloadURL(snap.ref);
          const range = quillInstance.current.getSelection(true);
          quillInstance.current.insertEmbed(range.index, 'image', url);
        } catch (err) { console.error('Quill table image upload failed:', err); }
      };
    }
    quillInstance.current = new Quill(editorRef.current, {
      theme: 'snow',
      placeholder: placeholder || 'Start writing…',
      modules: {
        toolbar: {
          container: [
            [{ header: [1, 2, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link', 'image'], ['clean'],
          ],
          handlers: { image: imageUploadHandler },
        },
        clipboard: { matchVisual: false },
      },
    });
    if (val) quillInstance.current.root.innerHTML = val;
    
    quillInstance.current.root.addEventListener('click', (e) => {
      const span = e.target.closest('[data-comment-id]');
      if (!span) return;
      window.dispatchEvent(new CustomEvent('im-open-comments-sidebar'));
      window.dispatchEvent(new CustomEvent('im-open-comment', { detail: { commentId: span.getAttribute('data-comment-id') } }));
    });

    quillInstance.current.on('text-change', (delta, oldDelta, source) => {
      if (source !== 'user') return;
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        latestOnChange.current(quillInstance.current.root.innerHTML);
      }, 500);
    });

    quillInstance.current.root.addEventListener('focus', () => {
      setIsFocused(true);
      if (latestFocusHandlers.current?.onFocus) latestFocusHandlers.current.onFocus();
    });

    quillInstance.current.root.addEventListener('blur', () => {
      const html = quillInstance.current.root.innerHTML;
      clearTimeout(typingTimeout.current);
      latestOnChange.current(html);
      setTimeout(() => {
        setIsFocused(false);
        if (latestFocusHandlers.current?.onBlur) latestFocusHandlers.current.onBlur();
      }, 300);
    });

    // ── TRACK EXACT SELECTION TO PREVENT MULTI-CELL RACE CONDITIONS ──
    quillInstance.current.on('selection-change', (range) => {
      if (range && range.length > 0) {
        pendingCommentRange.current = range;
      } else {
        setTimeout(() => { pendingCommentRange.current = null; }, 400); // Buffer for external clicks
      }
    });

    // ── EVENT LISTENERS FOR SVG & HIGHLIGHTS ──
    const persistHtml = () => latestOnChange.current(quillInstance.current.root.innerHTML);

    const handleCreateComment = (e) => {
      const detail = e.detail || {};
      if (detail.dataPath !== block.dataPath) return;
      
      // PRECISION CREATION: Only the exact cell that was highlighted gets formatted!
      if (pendingCommentRange.current) {
        quillInstance.current.formatText(pendingCommentRange.current.index, pendingCommentRange.current.length, 'comment', { id: detail.commentId, status: 'open' }, 'silent');
        setTimeout(persistHtml, 50); // 50ms DOM settlement delay before saving
        pendingCommentRange.current = null;
      }
    };

    const handleJump = (e) => {
      const { dataPath, commentId, quote } = e.detail || {};
      if (dataPath !== block.dataPath) return;
      
      let target = quillInstance.current.root.querySelector(`[data-comment-id="${commentId}"]`);
      if (!target && quote) {
        const applied = ensureCommentHighlight(quillInstance.current, { commentId, quote, status: 'open' });
        if (applied) {
          target = quillInstance.current.root.querySelector(`[data-comment-id="${commentId}"]`);
          setTimeout(persistHtml, 50);
        }
      }

      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('active-comment-glow');
        setTimeout(() => target.classList.remove('active-comment-glow'), 1500);
      }
    };

    const handleStatusUpdate = (e) => {
      const { commentId, status } = e.detail;
      const spans = quillInstance.current.root.querySelectorAll(`[data-comment-id="${commentId}"]`);
      if (spans.length > 0) {
        spans.forEach((span) => {
          span.setAttribute('data-comment-status', status);
          if (status === 'resolved') {
            span.style.backgroundColor = 'rgba(148,163,184,0.18)';
            span.style.borderBottom = '2px solid #94a3b8';
          } else if (status === 'deleted') {
            span.replaceWith(document.createTextNode(span.textContent));
          } else {
            span.style.backgroundColor = 'rgba(245,158,11,0.28)';
            span.style.borderBottom = '2px solid #f59e0b';
          }
        });
        if (status === 'deleted') setTimeout(persistHtml, 50);
      }
    };

    window.addEventListener('im-create-comment', handleCreateComment);
    window.addEventListener('im-jump-to-comment', handleJump);
    window.addEventListener('im-comment-status-update', handleStatusUpdate);

    return () => {
      window.removeEventListener('im-create-comment', handleCreateComment);
      window.removeEventListener('im-jump-to-comment', handleJump);
      window.removeEventListener('im-comment-status-update', handleStatusUpdate);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!quillInstance.current || isFocused) return;
    if (val !== quillInstance.current.root.innerHTML) {
      const sel = quillInstance.current.getSelection();
      quillInstance.current.root.innerHTML = val || '';
      if (sel) quillInstance.current.setSelection(sel);
    }
  }, [val, isFocused]);

  useEffect(() => {
    if (!quillInstance.current) return;
    disabled ? quillInstance.current.disable() : quillInstance.current.enable();
  }, [disabled]);

  return (
    <div className="table-quill-wrapper" style={{ minWidth: '160px', padding: '4px' }}>
      <style>{`
        .table-quill-wrapper .ql-toolbar.ql-snow { background: ${isDark ? '#161b22' : '#f9fafb'} !important; border-color: ${t.border} !important; border-radius: 6px 6px 0 0; padding: 4px 6px; }
        .table-quill-wrapper .ql-container.ql-snow { background: transparent !important; border-color: ${t.border} !important; border-radius: 0 0 6px 6px; min-height: 80px; }
        .table-quill-wrapper .ql-editor { color: ${t.text} !important; font-size: 0.85rem; line-height: 1.6; padding: 8px; }
        .table-quill-wrapper .ql-editor [style*="color: rgb(0, 0, 0)"], .table-quill-wrapper .ql-editor [style*="color:#000"], .table-quill-wrapper .ql-editor [style*="color: #000000"] { color: ${t.text} !important; }
        .table-quill-wrapper .ql-editor.ql-blank::before { color: ${isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)'} !important; font-style: italic; }
        .table-quill-wrapper .ql-snow .ql-stroke { stroke: ${isDark ? '#94a3b8' : '#6b7280'} !important; }
        .table-quill-wrapper .ql-snow .ql-fill   { fill:   ${isDark ? '#94a3b8' : '#6b7280'} !important; }
        .table-quill-wrapper .ql-snow.ql-toolbar button:hover .ql-stroke, .table-quill-wrapper .ql-snow.ql-toolbar button.ql-active .ql-stroke { stroke: #ef4444 !important; }
        .table-quill-wrapper .ql-snow.ql-toolbar button:hover .ql-fill,   .table-quill-wrapper .ql-snow.ql-toolbar button.ql-active .ql-fill   { fill:   #ef4444 !important; }
        .table-quill-wrapper .ql-snow .ql-picker-label { color: ${isDark ? '#94a3b8' : '#6b7280'} !important; }
      `}</style>
      <div ref={editorRef} />
    </div>
  );
};

// ── CONTROLLED REPEAT TABLE INSTANCE ─────────────────────────────────────────
const RepeatTableInstance = ({
  idx, tableData, headers, runtimeSchemaRows, hasSchema, numCols,
  block, t, cellInputStyle, lockedBy, onUpdate, onRemove, isDark, renderCellContent, focusHandlers, blockComments
}) => {
  const rows = tableData?.rows || [];
  const instanceName = tableData?.instanceName || '';

  const updateRepeatedCell = (rIdx, cellId, mixedIdx, val) => {
    onUpdate(prevRows => {
      return prevRows.map((r, i) => {
        if (i !== rIdx) return r;
        if (mixedIdx !== undefined) {
          const arr = Array.isArray(r[cellId]) ? [...r[cellId]] : [];
          arr[mixedIdx] = val;
          return { ...r, [cellId]: arr };
        }
        return { ...r, [cellId]: val };
      });
    }, instanceName);
  };

  const updateInstanceName = (newName) => {
    onUpdate(rows, newName);
  };

  const addRow        = () => onUpdate(prev => [...prev, seedEmptyRow(runtimeSchemaRows)], instanceName);
  const deleteRow     = (rIdx) => onUpdate(prev => prev.filter((_, i) => i !== rIdx), instanceName);
  const insertRowBefore = (rIdx) => { onUpdate(prev => { const next = [...prev]; next.splice(rIdx, 0, seedEmptyRow(runtimeSchemaRows)); return next; }, instanceName); };
  const insertRowAfter  = (rIdx) => { onUpdate(prev => { const next = [...prev]; next.splice(rIdx + 1, 0, seedEmptyRow(runtimeSchemaRows)); return next; }, instanceName); };

  return (
    <div style={{ marginTop: '20px', borderTop: `2px dashed ${t.border}`, paddingTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
           <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: t.textMuted, letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>Copy {idx + 1}</span>
           {block.allowInstanceNames && (
             <input
               value={instanceName}
               onChange={e => updateInstanceName(e.target.value)}
               placeholder="Enter table subheading..."
               disabled={!!lockedBy}
               style={{
                 background: 'transparent',
                 border: `1px solid ${t.border}`,
                 borderRadius: '4px',
                 padding: '4px 8px',
                 color: t.text,
                 fontSize: '0.85rem',
                 width: '100%',
                 maxWidth: '300px',
                 outline: 'none'
               }}
               {...focusHandlers}
             />
           )}
        </div>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}><Trash2 size={12} /></button>
      </div>
      <div style={{ overflowX: 'auto', borderRadius: '8px', border: `1px solid ${t.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
          <thead>
            <tr>
              {block.showSno && <th style={{ padding: '10px', background: t.headerBg, borderBottom: `1px solid ${t.border}`, fontSize: '11px', fontWeight: 800, color: t.textMuted, textAlign: 'center', width: '40px' }}>#</th>}
              {headers.map((header, cIdx) => (
                <th key={cIdx} style={{ padding: '10px', background: t.headerBg, borderBottom: `1px solid ${t.border}`, borderRight: cIdx < headers.length - 1 ? `1px solid ${t.border}` : 'none', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: t.textMuted }}>{header}</th>
              ))}
              <th style={{ width: '52px', background: t.headerBg, borderBottom: `1px solid ${t.border}` }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => {
              const schemaRow = hasSchema ? (runtimeSchemaRows[rIdx] || runtimeSchemaRows[runtimeSchemaRows.length - 1]) : null;
              return (
                <tr key={row?._rowId || rIdx}>
                  {block.showSno && <td style={{ padding: '8px 10px', borderBottom: `1px solid ${t.border}`, textAlign: 'center', fontSize: '11px', color: t.textMuted, fontWeight: 700 }}>{rIdx + 1}</td>}
                  {hasSchema
                    ? schemaRow?.cells?.map((cell, cIdx) => (
                        <td key={cell.id || cIdx} style={{ padding: 0, borderBottom: `1px solid ${t.border}`, borderRight: cIdx < numCols - 1 ? `1px solid ${t.border}` : 'none', verticalAlign: cell.cellType === 'fixed' || cell.cellType === 'computed' ? 'middle' : 'top', background: cell.cellType === 'fixed' ? t.fixedBg : cell.cellType === 'computed' ? t.computedBg : 'transparent' }}>
                          {renderCellContent(cell, row[cell.id] ?? row[`col_${cIdx}`] ?? '', (newVal, mixedIdx) => updateRepeatedCell(rIdx, cell.id, mixedIdx, newVal), rIdx, false, tableData.id, rows)}
                        </td>
                      ))
                    : Array.from({ length: numCols }, (_, cIdx) => (
                        <td key={cIdx} style={{ padding: 0, borderBottom: `1px solid ${t.border}`, borderRight: cIdx < numCols - 1 ? `1px solid ${t.border}` : 'none' }}>
                          <HybridInput 
                            val={row[`col_${cIdx}`] ?? ''} 
                            onChange={newVal => updateRepeatedCell(rIdx, `col_${cIdx}`, undefined, newVal)} 
                            disabled={!!lockedBy} 
                            cellInputStyle={cellInputStyle} 
                            placeholder="" 
                            focusHandlers={focusHandlers}
                            comments={blockComments}
                            isDark={isDark}
                            iType="text"
                          />
                        </td>
                      ))
                  }
                  <td style={{ padding: 0, borderBottom: `1px solid ${t.border}`, width: '52px', textAlign: 'center', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '2px' }}>
                      {block.allowInsertRows && !lockedBy && <button onClick={() => insertRowBefore(rIdx)} title="Insert row above" style={{ background: t.headerBg, border: `1px solid ${t.border}`, color: t.textMuted, cursor: 'pointer', padding: '1px 4px', borderRadius: '3px', fontSize: '9px', lineHeight: '1.2', width: 'calc(100% - 8px)' }}>▲</button>}
                      {!lockedBy && <button onClick={() => deleteRow(rIdx)} title="Delete row" style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={13} /></button>}
                      {block.allowInsertRows && !lockedBy && <button onClick={() => insertRowAfter(rIdx)} title="Insert row below" style={{ background: t.headerBg, border: `1px solid ${t.border}`, color: t.textMuted, cursor: 'pointer', padding: '1px 4px', borderRadius: '3px', fontSize: '9px', lineHeight: '1.2', width: 'calc(100% - 8px)' }}>▼</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {block.allowAddRows !== false && !lockedBy && (
        <button onClick={addRow} style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: `1px dashed ${t.border}`, color: t.textMuted, padding: '6px 14px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', width: '100%', justifyContent: 'center' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.color = t.accent; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.textMuted; }}>
          <Plus size={13} /> Add Row
        </button>
      )}
    </div>
  );
};

// ── MAIN SMART TABLE COMPONENT ────────────────────────────────────────────────
export default function SmartTableBlock({ block, value, onChange, lockedBy, onFocus, onBlur, isDark = true }) {
  const [isFocused, setIsFocused]             = useState(false);
  const isFocusedRef                          = useRef(false);
  const [customValues, setCustomValues]       = useState({});
  const [hiddenGuides, setHiddenGuides]       = useState({});
  const [sideHeadings, setSideHeadings]       = useState([]);
  const typingTimeout                          = useRef(null);

  const initial = useMemo(() => parseValue(value, block), [value, block]);

  const [runtimeSchemaRows, setRuntimeSchemaRows] = useState(initial.runtimeSchemaRows || block.rows || []);
  const hasSchema = runtimeSchemaRows.length > 0;

  const [subheadingInputs, setSubheadingInputs] = useState(initial.subheadingInputs || []);

  const [records, setRecords] = useState(() => {
    let currentRows = initial.rows;
    if (hasSchema) {
      if (currentRows.length === 0) currentRows = runtimeSchemaRows.map(() => seedEmptyRow(runtimeSchemaRows));
      else if (currentRows.length < runtimeSchemaRows.length) {
        currentRows = [...currentRows];
        while (currentRows.length < runtimeSchemaRows.length) currentRows.push(seedEmptyRow(runtimeSchemaRows));
      }
    }
    return currentRows;
  });

  const [headers, setHeaders]               = useState(initial.headers.length ? initial.headers : (block.colHeaders || Array.from({ length: block.cols || 2 }, (_, i) => `Column ${i + 1}`)));
  const [repeatedTables, setRepeatedTables] = useState(initial.repeatedTables || []);
  const [mainInstanceName, setMainInstanceName] = useState(initial.mainInstanceName || '');

  // Active Comments for this specific block path
  const [blockComments, setBlockComments] = useState([]);
  useEffect(() => {
    if (!block?.dataPath) return;
    const q = query(collection(db, 'im-comments'), where('dataPath', '==', block.dataPath));
    const unsub = onSnapshot(q, (snap) => {
      setBlockComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [block?.dataPath]);
const [, setForceRender] = useState(0);

  useEffect(() => {
    const handleSearchJump = (e) => {
      const { dataPath, matchText, blockId } = e.detail || {};
      if (blockId === block.id || (dataPath && dataPath.startsWith(block.dataPath))) {
        window.imActiveSearchTerm = matchText;
        setForceRender(prev => prev + 1); // Force cells to re-render and highlight
      } else {
        window.imActiveSearchTerm = null;
        setForceRender(prev => prev + 1);
      }
    };
    
    // Clear highlight on escape
    const clearSearch = () => { window.imActiveSearchTerm = null; setForceRender(prev => prev + 1); };

    window.addEventListener('im-search-jump', handleSearchJump);
    window.addEventListener('im-clear-search', clearSearch);
    return () => {
      window.removeEventListener('im-search-jump', handleSearchJump);
      window.removeEventListener('im-clear-search', clearSearch);
    };
  }, [block.dataPath, block.id]);
  const t = {
    bg:           isDark ? '#04060a'                : '#f8fafc',
    surface:      isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
    border:       isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
    text:         isDark ? '#e2e8f0'                : '#111827',
    textMuted:    isDark ? '#94a3b8'                : '#6b7280',
    headerBg:     isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6',
    fixedBg:      isDark ? 'rgba(245,158,11,0.08)'  : 'rgba(245,158,11,0.06)',
    fixedText:    isDark ? '#fbbf24'                : '#d97706',
    computedBg:   isDark ? 'rgba(16,185,129,0.08)'  : 'rgba(16,185,129,0.06)',
    computedText: isDark ? '#34d399'                : '#059669',
    totalBg:      isDark ? 'rgba(239,68,68,0.06)'   : 'rgba(239,68,68,0.04)',
    totalText:    isDark ? '#ef4444'                : '#dc2626',
    sideHeadBg:   isDark ? 'rgba(99,102,241,0.08)'  : 'rgba(99,102,241,0.06)',
    sideHeadText: isDark ? '#818cf8'                : '#4f46e5',
    accent:       '#ef4444',
  };

  const cellInputStyle = {
    background: 'transparent', border: 'none', outline: 'none',
    color: t.text, fontSize: '0.875rem', width: '100%',
    padding: '8px 10px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'none',
  };

  const preserveStablePayload = (arr) => (arr || []).map(r => { 
    const copy = { ...r }; 
    delete copy._isTotal; 
    delete copy._protected; 
    return copy; 
  });
  
  const cleanRepeatedPayload = (rep) => (rep || []).map(tObj => ({ ...tObj, rows: preserveStablePayload(tObj.rows) }));

  const stateRefs = useRef({ records, headers, repeatedTables, runtimeSchemaRows, mainInstanceName, subheadingInputs });
  useEffect(() => {
    stateRefs.current = { records, headers, repeatedTables, runtimeSchemaRows, mainInstanceName, subheadingInputs };
  });

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
    setIsFocused(true);
    if (onFocus) onFocus(block.id);
  }, [onFocus, block.id]);

  const handleBlur = useCallback(() => {
    isFocusedRef.current = false;
    setIsFocused(false);
    if (onBlur) onBlur(block.id);
  }, [onBlur, block.id]);

  const focusHandlers = useMemo(() => ({
    onFocus: handleFocus,
    onBlur: handleBlur
  }), [handleFocus, handleBlur]);

  useEffect(() => {
    if (isFocusedRef.current) return;
    const parsed = parseValue(value, block);
    
    let currentSchemaRows = parsed.runtimeSchemaRows || block.rows || [];
    if (parsed.runtimeSchemaRows && block.rows && block.rows.length > 0) {
       currentSchemaRows = currentSchemaRows.map((runtimeRow) => {
          const updatedCells = (runtimeRow.cells || []).map(runtimeCell => {
             let masterCell = null;
             for (const mRow of block.rows) {
               const found = (mRow.cells || []).find(c => c.id === runtimeCell.id);
               if (found) { masterCell = found; break; }
             }
             if (masterCell) return { ...runtimeCell, ...masterCell };
             return runtimeCell; 
          });
          return { ...runtimeRow, cells: updatedCells };
       });
    }

    let newRecords = parsed.rows;

    if (currentSchemaRows.length > 0) {
       newRecords = newRecords.map((row, rIdx) => {
          const targetSchema = currentSchemaRows[rIdx] || currentSchemaRows[currentSchemaRows.length - 1];
          if (!targetSchema) return row;
          
          const rescuedRow = { ...row };
          targetSchema.cells?.forEach((cell, cIdx) => {
             if (rescuedRow[cell.id] === undefined && rescuedRow[`col_${cIdx}`] !== undefined) {
                rescuedRow[cell.id] = rescuedRow[`col_${cIdx}`];
             }
          });
          return rescuedRow;
       });
    }

    if (currentSchemaRows.length > 0 && newRecords.length < currentSchemaRows.length) {
      newRecords = [...newRecords];
      while (newRecords.length < currentSchemaRows.length) newRecords.push(seedEmptyRow(currentSchemaRows));
    }
    
    const mapStableKeys = (arr) => (arr || []).map(r => ({ ...r, _rowId: r._rowId || genRowId() }));
    
    const stableCmp = (arr) => (arr || []).map(r => { const c = {...r}; delete c._rowId; delete c._isTotal; delete c._protected; return c; });
    
    setRecords(prev => {
      const isDiff = JSON.stringify(stableCmp(newRecords)) !== JSON.stringify(stableCmp(prev));
      return isDiff ? newRecords : prev;
    });

    setHeaders(prev => JSON.stringify(parsed.headers) !== JSON.stringify(prev) ? parsed.headers : prev);
    
    setRepeatedTables(prev => {
      const incomingRep = parsed.repeatedTables.map(t => ({ ...t, rows: mapStableKeys(t.rows), instanceName: t.instanceName || '' }));
      const currentRep  = prev.map(t => ({ ...t, rows: mapStableKeys(t.rows), instanceName: t.instanceName || '' }));
      return JSON.stringify(incomingRep) !== JSON.stringify(currentRep) ? incomingRep : prev;
    });

    setRuntimeSchemaRows(prev => JSON.stringify(currentSchemaRows) !== JSON.stringify(prev) ? currentSchemaRows : prev);
    setMainInstanceName(parsed.mainInstanceName || '');
    setSubheadingInputs(prev => JSON.stringify(parsed.subheadingInputs) !== JSON.stringify(prev) ? parsed.subheadingInputs : prev);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, block]); 

  const save = useCallback((overrideRecords, overrideHeaders, overrideRepeated, overrideSchema, overrideMainName, overrideSubInputs) => {
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      if (!onChange) return;
      const curRec  = overrideRecords  !== undefined ? overrideRecords : stateRefs.current.records;
      const curHead = overrideHeaders  !== undefined ? overrideHeaders : stateRefs.current.headers;
      const curRep  = overrideRepeated !== undefined ? overrideRepeated : stateRefs.current.repeatedTables;
      const sch     = overrideSchema   !== undefined ? overrideSchema : stateRefs.current.runtimeSchemaRows;
      const mName   = overrideMainName !== undefined ? overrideMainName : stateRefs.current.mainInstanceName;
      const curSub  = overrideSubInputs !== undefined ? overrideSubInputs : stateRefs.current.subheadingInputs;
      
      const cleanRecords = preserveStablePayload(curRec);
      const cleanRep     = cleanRepeatedPayload(curRep);
      
      if (block.editableHeaders || block.allowRepeatTable || cleanRep.length > 0 || sch !== block.rows || block.allowInstanceNames || curSub.length > 0 || (block.tableSubheadingRichText && block.tableSubheadingRichText.includes('['))) {
        onChange(block.dataPath, { rows: cleanRecords, headers: curHead, repeatedTables: cleanRep, runtimeSchemaRows: sch, mainInstanceName: mName, subheadingInputs: curSub });
      } else {
        onChange(block.dataPath, cleanRecords);
      }
    }, 600);
  }, [onChange, block.dataPath, block.editableHeaders, block.allowRepeatTable, block.rows, block.allowInstanceNames, block.tableSubheadingRichText]);

  const flushSave = useCallback((overrideRecords, overrideHeaders, overrideRepeated, overrideSchema, overrideMainName, overrideSubInputs) => {
    clearTimeout(typingTimeout.current);
    if (!onChange) return;
    const curRec  = overrideRecords  !== undefined ? overrideRecords : stateRefs.current.records;
    const curHead = overrideHeaders  !== undefined ? overrideHeaders : stateRefs.current.headers;
    const curRep  = overrideRepeated !== undefined ? overrideRepeated : stateRefs.current.repeatedTables;
    const sch     = overrideSchema   !== undefined ? overrideSchema : stateRefs.current.runtimeSchemaRows;
    const mName   = overrideMainName !== undefined ? overrideMainName : stateRefs.current.mainInstanceName;
    const curSub  = overrideSubInputs !== undefined ? overrideSubInputs : stateRefs.current.subheadingInputs;
    
    const cleanRecords = preserveStablePayload(curRec);
    const cleanRep     = cleanRepeatedPayload(curRep);
    
    if (block.editableHeaders || block.allowRepeatTable || cleanRep.length > 0 || sch !== block.rows || block.allowInstanceNames || curSub.length > 0 || (block.tableSubheadingRichText && block.tableSubheadingRichText.includes('['))) {
      onChange(block.dataPath, { rows: cleanRecords, headers: curHead, repeatedTables: cleanRep, runtimeSchemaRows: sch, mainInstanceName: mName, subheadingInputs: curSub });
    } else {
      onChange(block.dataPath, cleanRecords);
    }
  }, [onChange, block.dataPath, block.editableHeaders, block.allowRepeatTable, block.rows, block.allowInstanceNames, block.tableSubheadingRichText]);

  const updateCell = useCallback((rIdx, cellId, mixedIdx, val) => {
    const nextRecords = stateRefs.current.records.map((r, i) => {
      if (i !== rIdx) return r;
      if (mixedIdx !== undefined) { 
        const arr = Array.isArray(r[cellId]) ? [...r[cellId]] : []; 
        arr[mixedIdx] = val; 
        return { ...r, [cellId]: arr }; 
      }
      return { ...r, [cellId]: val };
    });
    setRecords(nextRecords);
    save(nextRecords);
  }, [save]);

  const updateHeader = (cIdx, val) => {
    const nextHeaders = [...stateRefs.current.headers];
    nextHeaders[cIdx] = val;
    setHeaders(nextHeaders);
    save(null, nextHeaders);
  };

  const handleMainInstanceNameChange = (val) => {
    setMainInstanceName(val);
    save(undefined, undefined, undefined, undefined, val);
  }

  const addRow = () => {
    const curSchema = stateRefs.current.runtimeSchemaRows;
    let newSchema = curSchema;
    if (curSchema.length > 1) {
      newSchema = [...curSchema];
      const target = curSchema[0]; 
      newSchema.push(JSON.parse(JSON.stringify(target)));
      setRuntimeSchemaRows(newSchema);
    }
    const nextRecords = [...stateRefs.current.records, seedEmptyRow(newSchema)];
    setRecords(nextRecords);
    flushSave(nextRecords, null, null, newSchema);
  };

  const deleteRow = (rIdx) => {
    isFocusedRef.current = true;
    const curRecords = stateRefs.current.records;
    const curSchema  = stateRefs.current.runtimeSchemaRows;
    const row = curRecords[rIdx];
    if (row?._isTotal || row?._protected) return;
    if (!block.allowAddRows && rIdx < curSchema.length) return;
    let newSchema = curSchema;
    if (curSchema.length > 1) {
      newSchema = curSchema.filter((_, i) => i !== rIdx);
      setRuntimeSchemaRows(newSchema);
    }
    const nextRecords = curRecords.filter((_, i) => i !== rIdx);
    setRecords(nextRecords);
    flushSave(nextRecords, null, null, newSchema);
    setTimeout(() => { isFocusedRef.current = false; }, 4000);
  };

  const insertRowBefore = useCallback((rIdx) => {
    isFocusedRef.current = true;
    const curSchema = stateRefs.current.runtimeSchemaRows;
    let newSchema = curSchema;
    if (curSchema.length > 1) {
      newSchema = [...curSchema];
      const target = (rIdx > 0 && curSchema[rIdx - 1]) ? curSchema[rIdx - 1] : curSchema[0];
      newSchema.splice(rIdx, 0, JSON.parse(JSON.stringify(target)));
      setRuntimeSchemaRows(newSchema);
    }
    const nextRecords = [...stateRefs.current.records];
    nextRecords.splice(rIdx, 0, seedEmptyRow(newSchema));
    setRecords(nextRecords);
    flushSave(nextRecords, null, null, newSchema);
    setTimeout(() => { isFocusedRef.current = false; }, 4000);
  }, [flushSave]);

  const insertRowAfter = useCallback((rIdx) => {
    isFocusedRef.current = true;
    const curSchema = stateRefs.current.runtimeSchemaRows;
    let newSchema = curSchema;
    if (curSchema.length > 1) {
      newSchema = [...curSchema];
      const target = curSchema[rIdx] || curSchema[0];
      newSchema.splice(rIdx + 1, 0, JSON.parse(JSON.stringify(target)));
      setRuntimeSchemaRows(newSchema);
    }
    const nextRecords = [...stateRefs.current.records];
    nextRecords.splice(rIdx + 1, 0, seedEmptyRow(newSchema));
    setRecords(nextRecords);
    flushSave(nextRecords, null, null, newSchema);
    setTimeout(() => { isFocusedRef.current = false; }, 4000);
  }, [flushSave]);

  const insertColBefore = (cIdx) => {
    isFocusedRef.current = true;
    const curHeaders = stateRefs.current.headers;
    const curRecords = stateRefs.current.records;
    const curSchema  = stateRefs.current.runtimeSchemaRows;
    const curRepeated = stateRefs.current.repeatedTables;
    
    const newHeader  = `Column ${curHeaders.length + 1}`;
    const nextHeaders = [...curHeaders.slice(0, cIdx), newHeader, ...curHeaders.slice(cIdx)];
    setHeaders(nextHeaders);
    
    const newCellId  = `col_inserted_${Date.now()}`;
    
    const shiftRowsForInsert = (rows) => rows.map(r => {
      if (hasSchema) return { ...r, [newCellId]: '' };
      const nextR = { ...r };
      for (let i = curHeaders.length - 1; i >= cIdx; i--) { if (nextR[`col_${i}`] !== undefined) nextR[`col_${i+1}`] = nextR[`col_${i}`]; }
      nextR[`col_${cIdx}`] = ''; return nextR;
    });

    const nextRecords = shiftRowsForInsert(curRecords);
    setRecords(nextRecords);

    const nextRepeated = curRepeated.map(tObj => ({ ...tObj, rows: shiftRowsForInsert(tObj.rows) }));
    setRepeatedTables(nextRepeated);

    let newSchema = curSchema;
    if (hasSchema) {
      newSchema = curSchema.map(rowDef => {
        const nextCells = [...(rowDef.cells || [])];
        nextCells.splice(cIdx, 0, { id: newCellId, cellType: 'input', inputType: 'text', colspan: 1, rowspan: 1 });
        return { ...rowDef, cells: nextCells };
      });
      setRuntimeSchemaRows(newSchema);
    }
    flushSave(nextRecords, nextHeaders, nextRepeated, newSchema);
    setTimeout(() => { isFocusedRef.current = false; }, 4000);
  };

  const insertColAfter = (cIdx) => {
    isFocusedRef.current = true;
    const curHeaders = stateRefs.current.headers;
    const curRecords = stateRefs.current.records;
    const curSchema  = stateRefs.current.runtimeSchemaRows;
    const curRepeated = stateRefs.current.repeatedTables;
    
    const targetIdx  = cIdx + 1;
    const newHeader  = `Column ${curHeaders.length + 1}`;
    const nextHeaders = [...curHeaders.slice(0, targetIdx), newHeader, ...curHeaders.slice(targetIdx)];
    setHeaders(nextHeaders);
    
    const newCellId  = `col_inserted_${Date.now()}`;
    
    const shiftRowsForInsert = (rows) => rows.map(r => {
      if (hasSchema) return { ...r, [newCellId]: '' };
      const nextR = { ...r };
      for (let i = curHeaders.length - 1; i >= targetIdx; i--) { if (nextR[`col_${i}`] !== undefined) nextR[`col_${i+1}`] = nextR[`col_${i}`]; }
      nextR[`col_${targetIdx}`] = ''; return nextR;
    });

    const nextRecords = shiftRowsForInsert(curRecords);
    setRecords(nextRecords);

    const nextRepeated = curRepeated.map(tObj => ({ ...tObj, rows: shiftRowsForInsert(tObj.rows) }));
    setRepeatedTables(nextRepeated);

    let newSchema = curSchema;
    if (hasSchema) {
      newSchema = curSchema.map(rowDef => {
        const nextCells = [...(rowDef.cells || [])];
        nextCells.splice(targetIdx, 0, { id: newCellId, cellType: 'input', inputType: 'text', colspan: 1, rowspan: 1 });
        return { ...rowDef, cells: nextCells };
      });
      setRuntimeSchemaRows(newSchema);
    }
    flushSave(nextRecords, nextHeaders, nextRepeated, newSchema);
    setTimeout(() => { isFocusedRef.current = false; }, 4000);
  };

  const deleteCol = (cIdx) => {
    isFocusedRef.current = true;
    const curHeaders = stateRefs.current.headers;
    const curRecords = stateRefs.current.records;
    const curSchema  = stateRefs.current.runtimeSchemaRows;
    const curRepeated = stateRefs.current.repeatedTables;

    if (curHeaders.length <= 1) return;

    const nextHeaders = curHeaders.filter((_, i) => i !== cIdx);
    setHeaders(nextHeaders);

    const shiftRowsForDelete = (rows) => rows.map((r, rIdx) => {
      const nextR = { ...r };
      if (hasSchema) {
        const schemaRow = curSchema[rIdx] || curSchema[curSchema.length - 1];
        const cellIdToDelete = schemaRow?.cells?.[cIdx]?.id;
        if (cellIdToDelete) delete nextR[cellIdToDelete];
      } else {
        for (let i = cIdx; i < curHeaders.length - 1; i++) {
          nextR[`col_${i}`] = nextR[`col_${i+1}`];
        }
        delete nextR[`col_${curHeaders.length - 1}`];
      }
      return nextR;
    });

    const nextRecords = shiftRowsForDelete(curRecords);
    setRecords(nextRecords);

    const nextRepeated = curRepeated.map(tObj => ({ ...tObj, rows: shiftRowsForDelete(tObj.rows) }));
    setRepeatedTables(nextRepeated);

    let newSchema = curSchema;
    if (hasSchema) {
      newSchema = curSchema.map(rowDef => {
        const nextCells = [...(rowDef.cells || [])];
        nextCells.splice(cIdx, 1);
        return { ...rowDef, cells: nextCells };
      });
      setRuntimeSchemaRows(newSchema);
    }
    flushSave(nextRecords, nextHeaders, nextRepeated, newSchema);
    setTimeout(() => { isFocusedRef.current = false; }, 4000);
  };

  const repeatTable = () => {
    const curSchema   = stateRefs.current.runtimeSchemaRows;
    const curRepeated = stateRefs.current.repeatedTables;
    
    const defaultRowCount  = Math.max(1, block.baseRowCount || block.numRows || 1);
    const currentSchemaRows = curSchema.length > 0 ? curSchema : (block.rows || []);
    const initialRows       = Array.from({ length: defaultRowCount }, () => seedEmptyRow(currentSchemaRows));
    const newTable          = { id: `table_copy_${Date.now()}`, rows: initialRows, instanceName: '' };
    
    const nextRepeated = [...curRepeated, newTable];
    setRepeatedTables(nextRepeated);
    flushSave(undefined, undefined, nextRepeated);
  };

  const handleRepeatedTableUpdate = useCallback((tIdx, updater, newInstanceName) => {
    const curRepeated = stateRefs.current.repeatedTables;
    const nextRepeated = curRepeated.map((tab, i) => {
      if (i !== tIdx) return tab;
      const nextRows = typeof updater === 'function' ? updater(tab.rows) : updater;
      const name = newInstanceName !== undefined ? newInstanceName : tab.instanceName;
      return { ...tab, rows: nextRows, instanceName: name };
    });
    setRepeatedTables(nextRepeated);
    save(undefined, undefined, nextRepeated);
  }, [save]);

  const handleRepeatedTableRemove = useCallback((tIdx) => {
    const curRepeated = stateRefs.current.repeatedTables;
    const nextRepeated = curRepeated.filter((_, i) => i !== tIdx);
    setRepeatedTables(nextRepeated);
    save(undefined, undefined, nextRepeated);
  }, [save]);

  const addSideHeading    = () => setSideHeadings(prev => [...prev, { afterRow: records.length - 1, label: 'New Heading' }]);
  const updateSideHeading = (idx, key, val) => setSideHeadings(prev => prev.map((h, i) => i === idx ? { ...h, [key]: val } : h));
  const deleteSideHeading = (idx) => setSideHeadings(prev => prev.filter((_, i) => i !== idx));

  const evaluateFormula = useCallback(function innerEval(formula, rIdx, customRecordsContext, visited = new Set()) {
    if (!formula) return "";
    const activeRecords = customRecordsContext || records;
    let s = String(formula).toUpperCase();

    const getCellValue = (colIdx, rowIdx) => {
      const schemaRow = runtimeSchemaRows[rowIdx] || runtimeSchemaRows[runtimeSchemaRows.length - 1];
      const targetCell = schemaRow?.cells?.[colIdx];
      if (!targetCell) {
        const fallbackId = `col${colIdx}`;
        const fallbackVal = activeRecords[rowIdx]?.[fallbackId];
        return parseFloat(String(fallbackVal || 0).replace(/[^0-9.-]/g, "")) || 0;
      }

      if (targetCell.cellType === "computed") {
        const cellKey = `${rowIdx}-${colIdx}`;
        if (visited.has(cellKey)) return 0;
        const nextVisited = new Set(visited);
        nextVisited.add(cellKey);
        const rawVal = innerEval(targetCell.formula, rowIdx, activeRecords, nextVisited);
        return parseFloat(String(rawVal).replace(/[^0-9.-]/g, "")) || 0;
      }

      return parseFloat(String(activeRecords[rowIdx]?.[targetCell.id] || 0).replace(/[^0-9.-]/g, "")) || 0;
    };

    s = s.replace(/SUM\(\s*C(\d+)\s*\)/g, (_, c) => {
      const colIdx = parseInt(c, 10) - 1;
      return activeRecords.reduce((sum, rec, idx) => {
        if (rec?._isTotal || rec?._protected || idx === rIdx) return sum; 
        return sum + getCellValue(colIdx, idx);
      }, 0);
    });

    s = s.replace(/R(\d+)C(\d+)/g, (_, r, c) => {
      const rowI = parseInt(r, 10) - 1;
      const colI = parseInt(c, 10) - 1;
      return getCellValue(colI, rowI);
    });

    s = s.replace(/C(\d+)/g, (_, c) => {
      const colIdx = parseInt(c, 10) - 1;
      return getCellValue(colIdx, rIdx);
    });

    try {
      const clean = s.replace(/[^0-9+\-*/().]/g, "");
      if (!/^[0-9+\-*/().]+$/.test(clean)) return s;
      const result = new Function(`"use strict"; return (${clean});`)();
      return Number.isFinite(result) ? result.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "";
    } catch {
      return "";
    }
  }, [records, runtimeSchemaRows]);
  
  const copyTableAsText = () => {
    const hRow = block.showSno ? ['#', ...headers] : headers;
    const rows = records.map((rec, rIdx) => {
      let vals;
      if (hasSchema) {
        const schemaRow = runtimeSchemaRows[rIdx] || runtimeSchemaRows[runtimeSchemaRows.length - 1];
        vals = schemaRow?.cells?.map((cell, cIdx) => {
          if (cell.cellType === 'fixed') return cell.text || '';
          if (cell.cellType === 'computed') return evaluateFormula(cell.formula, rIdx) || '';
          
          const v = rec[cell.id] ?? rec[`col_${cIdx}`] ?? '';
          
          let textVal = '';
          if (cell.cellType === 'mixed') {
            textVal = Array.isArray(v) ? v.join(', ') : String(v);
          } else if (cell.cellType === 'smart-select') {
            textVal = v && typeof v === 'object' && v.selected ? `${v.selected} - ${(v.inputs || []).join(', ')}` : '';
          } else {
            textVal = Array.isArray(v) ? v.join(', ') : String(v);
            if (cell.inputType === 'quill') textVal = textVal.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
          }
          return textVal;
        });
      } else {
        vals = headers.map((_, i) => { const v = rec[`col_${i}`] ?? ''; return Array.isArray(v) ? v.join(', ') : String(v); });
      }
      return block.showSno ? [String(rIdx + 1), ...(vals || [])] : (vals || []);
    });
    const tsv = [hRow.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(tsv).catch(() => {});
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const pastedRows = text.trim().split('\n').map(line => line.split('\t'));
      let dataRows = pastedRows;
      if (pastedRows.length > 0) {
        const firstRow  = pastedRows[0];
        const hasSno    = block.showSno && firstRow[0] === '#';
        const offset    = hasSno ? 1 : 0;
        const isHeader  = headers.every((h, i) => (firstRow[i + offset] || '').trim().toLowerCase() === h.toLowerCase());
        if (isHeader) dataRows = pastedRows.slice(1);
      }
      
      const curRecords = stateRefs.current.records;
      const curSchema  = stateRefs.current.runtimeSchemaRows;
      const curHeaders = stateRefs.current.headers;
      
      const next = dataRows.map((row, dataIdx) => {
        const existing = curRecords[dataIdx] || seedEmptyRow(curSchema);
        const updated  = { ...existing };
        const dataOffset = block.showSno && row.length === curHeaders.length + 1 && !isNaN(parseInt(row[0], 10)) ? 1 : 0;
        if (hasSchema) {
          const schemaRow = curSchema[dataIdx] || curSchema[curSchema.length - 1];
          schemaRow?.cells?.forEach((cell, cIdx) => {
            if (cell.cellType !== 'fixed' && cell.cellType !== 'computed') {
              const val = row[cIdx + dataOffset];
              if (val !== undefined) updated[cell.id] = val.trim();
            }
          });
        } else {
          curHeaders.forEach((_, cIdx) => {
            const val = row[cIdx + dataOffset];
            if (val !== undefined) updated[`col_${cIdx}`] = val.trim();
          });
        }
        return updated;
      });
      const finalRows = curRecords.map((rec, i) => (rec?._isTotal || rec?._protected) ? rec : (next[i] || rec));
      if (next.length > curRecords.length) finalRows.push(...next.slice(curRecords.length));
      setRecords(finalRows);
      flushSave(finalRows);
    } catch (err) { console.error('Paste failed:', err); }
  };

  const renderTemplateInput = useCallback((part, keyIdx, inputVal, onInputChange, disabled) => {
    const inner = part.slice(1, -1);
    const colonIdx = inner.indexOf(':');
    let typeStr = colonIdx !== -1 ? inner.slice(0, colonIdx).trim().toLowerCase() : inner.trim().toLowerCase();
    let placeholderText = colonIdx !== -1 ? inner.slice(colonIdx + 1).trim() : inner.trim();

    if (!['text', 'number', 'date', 'currency', 'select'].includes(typeStr)) {
      placeholderText = inner.trim();
      typeStr = 'text';
    }

    const baseStyle = {
      display: 'inline-block', padding: '2px 6px', margin: '0 4px',
      border: `1px solid ${t.border}`, borderRadius: '4px', fontSize: '0.8rem',
      color: t.text, background: 'transparent', outline: 'none', verticalAlign: 'middle',
      cursor: disabled ? 'not-allowed' : 'text'
    };

    if (typeStr === 'date') {
      return <input key={keyIdx} type="date" value={inputVal || ''} onChange={e => onInputChange(e.target.value)} disabled={disabled} style={{ ...baseStyle, minWidth: '110px', colorScheme: isDark ? 'dark' : 'light' }} {...focusHandlers} />;
    }
    if (typeStr === 'number') {
      return <input key={keyIdx} type="number" value={inputVal || ''} onChange={e => onInputChange(e.target.value)} placeholder={placeholderText} disabled={disabled} style={{ ...baseStyle, width: '90px' }} {...focusHandlers} />;
    }
    if (typeStr === 'currency') {
      return (
        <span key={keyIdx} style={{ display: 'inline-flex', alignItems: 'center', margin: '0 4px', background: 'transparent', border: `1px solid ${t.border}`, borderRadius: '4px', overflow: 'hidden' }}>
          <span style={{ padding: '2px 6px', fontSize: '0.75rem', color: t.textMuted, borderRight: `1px solid ${t.border}`, background: t.surface2 }}>₹</span>
          <input type="number" value={inputVal || ''} onChange={e => onInputChange(e.target.value)} placeholder={placeholderText} disabled={disabled} style={{ padding: '2px 6px', border: 'none', background: 'transparent', outline: 'none', color: t.text, fontSize: '0.8rem', width: '80px' }} {...focusHandlers} />
        </span>
      );
    }
    if (typeStr === 'select') {
       const options = colonIdx !== -1 ? inner.slice(colonIdx + 1).split(',').map(s => s.trim()) : [];
       if (options.length > 0) {
          return (
            <select key={keyIdx} value={inputVal || ''} onChange={e => onInputChange(e.target.value)} disabled={disabled} style={{ ...baseStyle, cursor: disabled ? 'not-allowed' : 'pointer', backgroundColor: isDark ? '#0f172a' : '#ffffff', colorScheme: isDark ? 'dark' : 'light' }} {...focusHandlers}>
               <option value="" style={{color: t.textMuted}}>Select...</option>
               {options.map((opt, i) => <option key={i} value={opt} style={{background: t.surface, color: t.text}}>{opt}</option>)}
            </select>
          );
       }
    }

    return <MixedInlineInput key={keyIdx} val={inputVal || ''} onChange={onInputChange} disabled={disabled} placeholder={placeholderText} t={t} focusHandlers={focusHandlers} comments={blockComments} />;
  }, [t, isDark, focusHandlers, blockComments]);

const renderCellContent = useCallback((cell, val, onValChange, rIdx, isProtectedRow = false, tableInstanceId = 'main', contextRows = records) => {
    const cellPlaceholder = cell.placeholder || '';
    const usePlaceholderGuide = !!cell.showPlaceholderAsGuide && !!cellPlaceholder;
    const guideKey = `${tableInstanceId}_${rIdx}_${cell.id}`;
    const isGuideVisible = usePlaceholderGuide && !hiddenGuides[guideKey];
    
    const guideToggle = usePlaceholderGuide ? (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setHiddenGuides(prev => ({ ...prev, [guideKey]: !prev[guideKey] }))}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: t.accent, fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: '2px 0' }}
        >
          <Info size={11} /> {isGuideVisible ? 'Hide Guide' : 'Show Guide'}
        </button>
      </div>
    ) : null;
    
    const guidePanel = isGuideVisible ? (
      <div style={{ padding: '6px 8px', borderRadius: 6, fontSize: 11, color: t.text, background: t.headerBg, borderLeft: `3px solid ${t.accent}`, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {cellPlaceholder}
      </div>
    ) : null;

    // ── UNIVERSAL SEARCH MATCH DETECTOR ──
    let hasMatch = false;
    if (window.imActiveSearchTerm) {
      const term = window.imActiveSearchTerm.toLowerCase();
      if (cell.cellType === 'fixed' && cell.text && String(cell.text).toLowerCase().includes(term)) hasMatch = true;
      else if (cell.cellType === 'computed') {
        const cVal = evaluateFormula(cell.formula, rIdx, contextRows);
        if (String(cVal).toLowerCase().includes(term)) hasMatch = true;
      }
      else if (typeof val === 'string' && val.toLowerCase().includes(term)) hasMatch = true;
      else if (typeof val === 'number' && String(val).toLowerCase().includes(term)) hasMatch = true;
      else if (Array.isArray(val) && val.some(v => String(v).toLowerCase().includes(term))) hasMatch = true;
      else if (val && typeof val === 'object' && !Array.isArray(val)) {
        if (val.selected && String(val.selected).toLowerCase().includes(term)) hasMatch = true;
        if (val.richtext && String(val.richtext).toLowerCase().includes(term)) hasMatch = true;
        if (val.inputs && val.inputs.some(v => String(v).toLowerCase().includes(term))) hasMatch = true;
      }
    }

    const cellWrapperStyle = {
      display: 'flex', 
      flexDirection: 'column', 
      gap: 6, 
      padding: '4px 6px', 
      height: '100%',
      backgroundColor: hasMatch ? 'rgba(59,130,246,0.15)' : 'transparent',
      border: hasMatch ? '1px solid #3b82f6' : '1px solid transparent',
      borderRadius: '4px',
      transition: 'background-color 0.2s, border 0.2s'
    };

    switch (cell.cellType) {
      case 'fixed':
        return (
          <div style={cellWrapperStyle}>
            {guideToggle}
            {guidePanel}
            <div style={{ padding: '8px 10px', color: t.fixedText, fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center' }}>{cell.text || ''}</div>
          </div>
        );
      case 'computed':
        return (
          <div style={cellWrapperStyle}>
            {guideToggle}
            {guidePanel}
            <div style={{ padding: '8px 10px', color: t.computedText, fontSize: '0.85rem', fontWeight: 600, fontFamily: 'monospace', display: 'flex', alignItems: 'center' }}>{evaluateFormula(cell.formula, rIdx, contextRows)}</div>
          </div>
        );
      
      case 'mixed': {
        const parts  = (cell.template || '').split(/(\[[^\]]+\])/g);
        const inputs = Array.isArray(val) ? val : [];
        let inputIdx = 0;
        return (
          <div style={cellWrapperStyle}>
            {guideToggle}
            {guidePanel}
            <div style={{ padding: '8px 10px', lineHeight: 1.8 }}>
            {parts.map((part, pi) => {
              if (/^\[.+\]$/.test(part)) {
                const idx = inputIdx++;
                return renderTemplateInput(part, pi, inputs[idx], (newVal) => onValChange(newVal, idx), isProtectedRow || !!lockedBy);
              }
              return <span key={pi} style={{ color: t.textMuted, fontSize: '0.85rem' }}>{part}</span>;
            })}
            </div>
          </div>
        );
      }
      
      case 'smart-select': {
        const valObj = (val && typeof val === 'object' && !Array.isArray(val))
          ? val
          : { selected: typeof val === 'string' ? val : '', inputs: [], richtext: '' };

        const conditions = cell.conditions || [];
        const activeCondition = conditions.find(c => c.label === valObj.selected);

        const handleSelect = (e) => onValChange({ ...valObj, selected: e.target.value, inputs: [], richtext: '' });

        return (
          <div style={{ ...cellWrapperStyle, gap: 8, padding: '8px 10px' }}>
            {guideToggle}
            {guidePanel}
            <select
              value={valObj.selected}
              onChange={handleSelect}
              disabled={isProtectedRow || !!lockedBy}
              style={{
                ...cellInputStyle,
                padding: '4px 8px',
                border: `1px solid ${t.border}`,
                borderRadius: 4,
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                cursor: 'pointer',
                colorScheme: isDark ? 'dark' : 'light',
              }}
              {...focusHandlers}
            >
              <option value="" style={{ color: t.textMuted }}>{usePlaceholderGuide ? 'Select…' : (cellPlaceholder || 'Select…')}</option>
              {conditions.map((cond, i) => (
                <option key={i} value={cond.label}>{cond.label}</option>
              ))}
            </select>

            {activeCondition && (
              activeCondition.thenMode === 'richtext'
                ? (
                  <TableQuillEditor
                    val={valObj.richtext || ''}
                    onChange={(newHtml) => onValChange({ ...valObj, richtext: newHtml })}
                    disabled={isProtectedRow || !!lockedBy}
                    placeholder={activeCondition.placeholder || activeCondition.template || 'Start writing…'}
                    block={block}
                    t={t}
                    focusHandlers={focusHandlers}
                    isDark={isDark}
                  />
                ) : (
                  <div style={{ lineHeight: 1.8, paddingLeft: 6, borderLeft: `2px solid ${t.border}` }}>
                    {(activeCondition.template || '').split(/(\[[^\]]*\])/g).map((part, pi) => {
                      if (/^\[.*\]$/.test(part)) {
                        const idx = (() => { let c = 0; for (let i = 0; i < pi; i++) if (/^\[.*\]$/.test((activeCondition.template || '').split(/(\[[^\]]*\])/g)[i])) c++; return c; })();
                        return renderTemplateInput(part, pi, (valObj.inputs || [])[idx], (newVal) => {
                          const newInputs = [...(valObj.inputs || [])];
                          newInputs[idx] = newVal;
                          onValChange({ ...valObj, inputs: newInputs });
                        }, isProtectedRow || !!lockedBy);
                      }
                      return <span key={pi} style={{ color: t.textMuted, fontSize: '0.85rem' }}>{part}</span>;
                    })}
                  </div>
                )
            )}
          </div>
        );
      }
      
      case 'input':
      default: {
        const iType = cell.inputType || 'text';
        if (iType === 'quill') {
          return (
            <div style={cellWrapperStyle}>
              {guideToggle}
              {guidePanel}
              <TableQuillEditor val={val} onChange={newVal => onValChange(newVal)} disabled={isProtectedRow || !!lockedBy} placeholder={usePlaceholderGuide ? '' : cellPlaceholder} block={block} t={t} focusHandlers={focusHandlers} isDark={isDark} />
            </div>
          );
        }
        if (iType === 'textarea') {
          return (
            <div style={cellWrapperStyle}>
              {guideToggle}
              {guidePanel}
              <HybridTextarea 
                val={val} 
                onChange={e => onValChange(e)} 
                disabled={isProtectedRow || !!lockedBy} 
                placeholder={usePlaceholderGuide ? '' : cellPlaceholder} 
                cellInputStyle={cellInputStyle} 
                focusHandlers={focusHandlers} 
                comments={blockComments}
                isDark={isDark}
              />
            </div>
          );
        }
        if (iType === 'select') {
          const customKey  = `${tableInstanceId}_${rIdx}_${cell.id}`;
          const isCustom   = typeof val === 'string' && val.startsWith('__custom__');
          const customText = isCustom && val.includes(':') 
            ? val.substring(val.indexOf(':') + 1) 
            : (customValues[customKey] || '');
            
          const optionStyle = { background: isDark ? '#1f2937' : '#ffffff', color: t.text };
          return (
            <div style={{ ...cellWrapperStyle, gap: '4px' }}>
              {guideToggle}
              {guidePanel}
              <select value={isCustom ? '__custom__' : val}
                onChange={e => { if (e.target.value === '__custom__') { onValChange('__custom__'); } else { onValChange(e.target.value); setCustomValues(prev => { const n = { ...prev }; delete n[customKey]; return n; }); } }}
                disabled={isProtectedRow || !!lockedBy}
                style={{ ...cellInputStyle, cursor: 'pointer', backgroundColor: isDark ? '#0f172a' : '#ffffff', colorScheme: isDark ? 'dark' : 'light' }}
                {...focusHandlers}>
                <option value="" style={optionStyle}>{usePlaceholderGuide ? 'Select…' : (cellPlaceholder || 'Select…')}</option>
                {(cell.selectOptions || []).map(opt => <option key={opt} value={opt} style={optionStyle}>{opt}</option>)}
                {cell.allowCustom && <option value="__custom__" style={optionStyle}>Other (specify)</option>}
                {block.allowNA && <option value="N/A" style={optionStyle}>N/A</option>}
              </select>
              {isCustom && cell.allowCustom && (
                <HybridInput 
                  val={customText} 
                  onChange={v => { setCustomValues(prev => ({ ...prev, [customKey]: v })); onValChange(v ? `__custom__:${v}` : '__custom__'); }}
                  placeholder="Type your own value…" 
                  disabled={isProtectedRow || !!lockedBy}
                  cellInputStyle={{ ...cellInputStyle, padding: '4px 8px', border: `1px solid ${t.border}`, borderRadius: '4px', fontSize: '0.8rem' }}
                  focusHandlers={focusHandlers}
                  comments={blockComments}
                  isDark={isDark}
                  iType="text"
                />
              )}
            </div>
          );
        }
        const showPrefix = iType === 'currency';
        const showSuffix = iType === 'percentage';
        return (
          <div style={cellWrapperStyle}>
            {guideToggle}
            {guidePanel}
            <HybridInput
              val={val}
              onChange={newVal => onValChange(newVal)}
              disabled={isProtectedRow || !!lockedBy}
              placeholder={usePlaceholderGuide ? '' : cellPlaceholder}
              cellInputStyle={cellInputStyle}
              focusHandlers={focusHandlers}
              comments={blockComments}
              isDark={isDark}
              iType={iType}
              showPrefix={showPrefix}
              showSuffix={showSuffix}
            />
          </div>
        );
      }
    }
  }, [records, runtimeSchemaRows, t, lockedBy, isDark, block, cellInputStyle, customValues, hiddenGuides, onFocus, onBlur, evaluateFormula, renderTemplateInput, blockComments]);
  const colTotals = useMemo(() => {
    if (!block.showColumnTotals && !block.hasTotalsRow) return null;
    const allCells = runtimeSchemaRows[0]?.cells || headers.map((_, i) => ({ id: `col_${i}`, cellType: 'input', inputType: 'number' }));
    
    return allCells.map((cell, cIdx) => {
      
      if (cell.cellType === 'computed' && /SUM\(/i.test(cell?.formula || '')) {
          const totalVal = evaluateFormula(cell.formula, -1, records);
          const v = parseFloat(String(totalVal || '').replace(/[^0-9.-]/g, ''));
          return (Number.isFinite(v) && v !== 0) ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '';
      }
      
      const total = records.reduce((sum, rec, rIdx) => {
        let cellVal;
        if (cell.cellType === 'computed') {
          cellVal = evaluateFormula(cell.formula, rIdx, records);
        } else {
          cellVal = rec[cell.id] ?? rec[`col_${cIdx}`];
        }
        
        const v = parseFloat(String(cellVal || '').replace(/[^0-9.-]/g, ''));
        return sum + (Number.isFinite(v) ? v : 0);
      }, 0);
      
      return total !== 0 ? total.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '';
    });
  }, [records, runtimeSchemaRows, headers, block.showColumnTotals, block.hasTotalsRow, evaluateFormula]);

  const numCols        = headers.length || block.cols || 2;
  const hasCustomWidths = block.colWidths && block.colWidths.some(w => w && w.trim() !== '');

  return (
    <BlockWrapper block={block} lockedBy={lockedBy} isDark={isDark}>

      {(block.enableTableSubheading || block.tableSubheadingRichText) && (block.tableSubheadingRichText || '').trim() && (
        <div
          style={{
            marginBottom: '12px',
            padding: '12px 14px',
            borderRadius: '8px',
            border: `1px solid ${t.border}`,
            background: t.surface,
            color: t.text,
            lineHeight: 1.8,
            fontSize: '0.85rem',
          }}
        >
          {(() => {
            const rawText = block.tableSubheadingRichText || '';
            if (!rawText.includes('[')) {
              return <span dangerouslySetInnerHTML={{ __html: rawText }} style={{ whiteSpace: 'pre-wrap' }} />;
            }
            
            const parts = rawText.split(/(\[[^\]]+\])/g);
            let inputIdx = 0;
            return parts.map((part, pi) => {
              if (/^\[.+\]$/.test(part)) {
                const idx = inputIdx++;
                return renderTemplateInput(part, pi, subheadingInputs[idx], (newVal) => {
                  const newInputs = [...subheadingInputs];
                  newInputs[idx] = newVal;
                  setSubheadingInputs(newInputs);
                  save(undefined, undefined, undefined, undefined, undefined, newInputs);
                }, !!lockedBy);
              }
              return <span key={pi} dangerouslySetInnerHTML={{ __html: part }} style={{ whiteSpace: 'pre-wrap' }} />;
            });
          })()}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        
        <div style={{ display: 'flex', gap: '6px' }}>
          {block.allowAddSideHeadings && !lockedBy && (
            <button onClick={addSideHeading} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: `1px solid ${t.border}`, color: t.textMuted, padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer' }}><Plus size={12} /> Side Heading</button>
          )}
          <button onClick={pasteFromClipboard} title="Paste directly from Excel/Sheets" style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: `1px solid ${t.border}`, color: t.textMuted, padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer' }}><Clipboard size={12} /> Paste</button>
          <button onClick={copyTableAsText} title="Export layout contents securely" style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: `1px solid ${t.border}`, color: t.textMuted, padding: '4px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer' }}><Copy size={12} /> Copy</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: '8px', border: `1px solid ${t.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: hasCustomWidths ? 'fixed' : 'auto', minWidth: '400px' }}>
          <thead>
            <tr>
              {block.showSno && <th style={{ padding: '10px', background: t.headerBg, borderBottom: `1px solid ${t.border}`, fontSize: '11px', fontWeight: 800, color: t.textMuted, textAlign: 'center', width: '40px' }}>#</th>}
              {headers.map((header, cIdx) => (
                <th key={cIdx} style={{ padding: 0, background: t.headerBg, borderBottom: `1px solid ${t.border}`, borderRight: cIdx < headers.length - 1 ? `1px solid ${t.border}` : 'none', width: block.colWidths?.[cIdx] || 'auto', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', gap: '4px' }}>
                    {block.allowInsertCols && !lockedBy && <button onClick={() => insertColBefore(cIdx)} title="Insert column left" style={{ background: t.surface, border: `1px solid ${t.border}`, color: t.textMuted, cursor: 'pointer', padding: '1px 4px', fontSize: '9px', borderRadius: '3px', flexShrink: 0 }}>◀</button>}
                    {block.editableHeaders
                      ? <input value={header} onChange={e => updateHeader(cIdx, e.target.value)} disabled={!!lockedBy} style={{ background: 'transparent', border: 'none', outline: 'none', color: t.textMuted, fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', width: '100%', padding: '6px', fontFamily: 'inherit', textAlign: 'center' }} placeholder={`Column ${cIdx + 1}`} />
                      : <div style={{ padding: '6px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: t.textMuted, width: '100%', textAlign: 'center' }}>{header}</div>
                    }
                    {block.allowInsertCols && !lockedBy && <button onClick={() => insertColAfter(cIdx)} title="Insert column right" style={{ background: t.surface, border: `1px solid ${t.border}`, color: t.textMuted, cursor: 'pointer', padding: '1px 4px', fontSize: '9px', borderRadius: '3px', flexShrink: 0 }}>▶</button>}
                  </div>
                  {block.allowDeleteCols !== false && !lockedBy && headers.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '4px' }}>
                      <button onClick={() => deleteCol(cIdx)} title="Delete column" style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '9px', opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>
                        <Trash2 size={10} /> Delete
                      </button>
                    </div>
                  )}
                </th>
              ))}
              <th style={{ width: '52px', background: t.headerBg, borderBottom: `1px solid ${t.border}` }} />
            </tr>
          </thead>
          <tbody>
            {(() => {
              const numRows  = records.length;
              const occupied = Array.from({ length: numRows }, () => new Array(numCols).fill(false));
              return records.map((rec, rIdx) => {
                const isProtectedRow    = !!(rec?._isTotal || rec?._protected);
                const headingsBeforeRow = sideHeadings.filter(h => h.afterRow === rIdx - 1);

                const rowActionCell = (
                  <td style={{ padding: 0, borderBottom: `1px solid ${t.border}`, width: '52px', textAlign: 'center', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '2px' }}>
                      {block.allowInsertRows && !isProtectedRow && !lockedBy && <button onClick={() => insertRowBefore(rIdx)} title="Insert row above" style={{ background: t.headerBg, border: `1px solid ${t.border}`, color: t.textMuted, cursor: 'pointer', padding: '1px 4px', borderRadius: '3px', fontSize: '9px', lineHeight: '1.2', width: 'calc(100% - 8px)' }}>▲</button>}
                      {!isProtectedRow && block.allowAddRows !== false && !lockedBy && <button onClick={() => deleteRow(rIdx)} title="Delete Row" style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={13} /></button>}
                      {block.allowInsertRows && !isProtectedRow && !lockedBy && <button onClick={() => insertRowAfter(rIdx)} title="Insert row below" style={{ background: t.headerBg, border: `1px solid ${t.border}`, color: t.textMuted, cursor: 'pointer', padding: '1px 4px', borderRadius: '3px', fontSize: '9px', lineHeight: '1.2', width: 'calc(100% - 8px)' }}>▼</button>}
                    </div>
                  </td>
                );

                const rowEl = hasSchema ? (() => {
                  const schemaRow = runtimeSchemaRows[rIdx] || runtimeSchemaRows[runtimeSchemaRows.length - 1];
                  return (
                    <tr key={rec?._rowId || rIdx} style={{ background: isProtectedRow ? t.totalBg : 'transparent' }}>
                      {block.showSno && <td style={{ padding: 0, borderBottom: `1px solid ${t.border}`, textAlign: 'center', fontSize: '11px', color: t.textMuted, fontWeight: 700, width: '40px' }}>{isProtectedRow ? '∑' : rIdx + 1}</td>}
                      {schemaRow?.cells?.map((cell, cIdx) => {
                        if (occupied[rIdx]?.[cIdx]) return null;
                        const cs = Math.min(Math.max(1, cell.colspan || 1), numCols - cIdx);
                        const rs = Math.min(Math.max(1, cell.rowspan || 1), numRows - rIdx);
                        for (let r = rIdx; r < rIdx + rs; r++) for (let c = cIdx; c < cIdx + cs; c++) { if (r < numRows && c < numCols) occupied[r][c] = true; }
                        const isFixed    = cell.cellType === 'fixed';
                        const isComputed = cell.cellType === 'computed';
                        
                        return (
                          <td key={cell.id || cIdx} colSpan={cs} rowSpan={rs} style={{ padding: 0, borderBottom: `1px solid ${t.border}`, borderRight: cIdx + cs < numCols ? `1px solid ${t.border}` : 'none', verticalAlign: isFixed || isComputed ? 'middle' : 'top', background: isFixed ? t.fixedBg : isComputed ? t.computedBg : 'transparent' }}>
                            {renderCellContent(cell, rec[cell.id] ?? rec[`col_${cIdx}`] ?? '', (newVal, mixedIdx) => updateCell(rIdx, cell.id, mixedIdx, newVal), rIdx, isProtectedRow)}
                          </td>
                        );
                      })}
                      {rowActionCell}
                    </tr>
                  );
                })() : (
                  <tr key={rec?._rowId || rIdx} style={{ background: isProtectedRow ? t.totalBg : 'transparent' }}>
                    {block.showSno && <td style={{ padding: 0, borderBottom: `1px solid ${t.border}`, textAlign: 'center', fontSize: '11px', color: t.textMuted, fontWeight: 700, width: '40px' }}>{isProtectedRow ? '∑' : rIdx + 1}</td>}
                    {Array.from({ length: numCols }, (_, cIdx) => {
                      const cellId = `col_${cIdx}`;
                      const v      = rec[cellId] ?? '';
                      return (
                        <td key={cIdx} style={{ padding: 0, borderBottom: `1px solid ${t.border}`, borderRight: cIdx < numCols - 1 ? `1px solid ${t.border}` : 'none' }}>
                          {isProtectedRow
                            ? <div style={{ padding: '8px 10px', color: t.totalText, fontWeight: 700, fontSize: '0.85rem' }}>{colTotals?.[cIdx] ?? ''}</div>
                            : <HybridInput 
                                val={v} 
                                onChange={newVal => updateCell(rIdx, cellId, undefined, newVal)} 
                                disabled={!!lockedBy} 
                                cellInputStyle={cellInputStyle} 
                                placeholder="" 
                                focusHandlers={focusHandlers}
                                comments={blockComments}
                                isDark={isDark}
                                iType="text"
                              />
                          }
                        </td>
                      );
                    })}
                    {rowActionCell}
                  </tr>
                );

                return (
                  <React.Fragment key={rIdx}>
                    {headingsBeforeRow.map((h, hi) => {
                      const hIdx = sideHeadings.indexOf(h);
                      return (
                        <tr key={`sh_${hi}`} style={{ background: t.sideHeadBg }}>
                          {block.showSno && <td style={{ borderBottom: `1px solid ${t.border}` }} />}
                          <td colSpan={numCols} style={{ borderBottom: `1px solid ${t.border}`, padding: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input value={h.label} onChange={e => updateSideHeading(hIdx, 'label', e.target.value)} style={{ background: 'transparent', border: 'none', outline: 'none', color: t.sideHeadText, fontSize: '0.82rem', fontWeight: 700, padding: '8px 12px', width: '100%', fontFamily: 'inherit' }} placeholder="Side heading…" />
                              <button onClick={() => deleteSideHeading(hIdx)} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: '8px 6px', flexShrink: 0 }}><Trash2 size={12} /></button>
                            </div>
                          </td>
                          <td style={{ borderBottom: `1px solid ${t.border}`, width: '52px' }} />
                        </tr>
                      );
                    })}
                    {rowEl}
                  </React.Fragment>
                );
              });
            })()}

            {/* Totals row */}
            {colTotals && (
              <tr style={{ background: t.totalBg }}>
                {block.showSno && <td style={{ padding: '8px 10px', fontSize: '11px', fontWeight: 800, color: t.totalText, textAlign: 'center' }}>∑</td>}
                {colTotals.map((total, cIdx) => (
                  <td key={cIdx} style={{ padding: '8px 10px', borderTop: `2px solid ${t.border}`, borderRight: cIdx < colTotals.length - 1 ? `1px solid ${t.border}` : 'none', fontSize: '0.875rem', fontWeight: 700, color: t.totalText }}>{total}</td>
                ))}
                <td style={{ borderTop: `2px solid ${t.border}`, width: '52px' }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
        {block.allowAddRows !== false && !lockedBy && (
          <button onClick={addRow} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: `1px dashed ${t.border}`, color: t.textMuted, padding: '7px 14px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', width: '100%', justifyContent: 'center', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.color = t.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.textMuted; }}>
            <Plus size={13} /> Add Row
          </button>
        )}
        {block.allowRepeatTable && !lockedBy && (
          <button onClick={repeatTable} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: `1px dashed ${t.border}`, color: t.textMuted, padding: '7px 14px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', width: '100%', justifyContent: 'center', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = t.sideHeadText; e.currentTarget.style.color = t.sideHeadText; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.textMuted; }}>
            <Copy size={13} /> Repeat Table (Empty Copy)
          </button>
        )}
      </div>

      {/* Repeated table instances */}
      {repeatedTables.map((tableObj, idx) => (
        <RepeatTableInstance
          key={tableObj.id || idx}
          idx={idx}
          tableData={tableObj}
          headers={headers}
          runtimeSchemaRows={runtimeSchemaRows}
          hasSchema={hasSchema}
          numCols={numCols}
          block={block}
          t={t}
          cellInputStyle={cellInputStyle}
          lockedBy={lockedBy}
          isDark={isDark}
          renderCellContent={renderCellContent}
          focusHandlers={focusHandlers}
          blockComments={blockComments}
          onUpdate={(updater, newName) => handleRepeatedTableUpdate(idx, updater, newName)}
          onRemove={() => handleRepeatedTableRemove(idx)}
        />
      ))}

    </BlockWrapper>
  );
}