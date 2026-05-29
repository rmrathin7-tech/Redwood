import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import BlockWrapper from './BlockWrapper.jsx';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  MessageSquarePlus, Table2, Trash2, Plus,
  ArrowDown, ArrowRight, X, Maximize2, Minimize2,
  FileText, Hash, AlignLeft, CheckSquare, Save, Info
} from 'lucide-react';

const storage = getStorage();

// ── COMMENT BLOT ──────────────────────────────────────────────────────────────
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
  CommentBlot.tagName = 'span';
  Quill.register(CommentBlot);
}

// ── FONT WHITELIST ─────────────────────────────────────────────────────────────
if (!Quill.imports['formats/font']?.whitelist) {
  const Font = Quill.import('formats/font');
  Font.whitelist = ['dm-sans', 'arial', 'georgia', 'courier'];
  Quill.register(Font, true);
}

// ── GLOBAL STYLES ─────────────────────────────────────────────────────────────
const STYLE_ID = 'im-rte-global-styles-v4';
if (!document.getElementById(STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    .im-comment-highlight {
      background-color: rgba(245,158,11,0.28) !important;
      border-bottom: 2px solid #f59e0b !important;
      border-radius: 0 !important; padding: 0 !important; margin: 0 !important;
      display: inline !important; line-height: inherit !important;
      cursor: pointer !important; transition: background-color 0.15s;
    }
    .im-comment-highlight:hover { background-color: rgba(245,158,11,0.45) !important; }
    .im-comment-highlight[data-comment-status="resolved"] {
      background-color: rgba(148,163,184,0.18) !important;
      border-bottom: 2px solid #94a3b8 !important;
    }
    #im-comment-bubble {
      position: absolute; z-index: 9999; display: none; align-items: center;
      background: #1e2431; border: 1px solid rgba(245,158,11,0.4);
      border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      animation: bubblePop 0.15s cubic-bezier(0.34,1.56,0.64,1);
    }
    #im-comment-bubble.visible { display: flex; }
    #im-comment-bubble button {
      display: flex; align-items: center; gap: 6px; padding: 7px 13px;
      background: none; border: none; color: #f59e0b; font-size: 12px;
      font-weight: 700; cursor: pointer; font-family: inherit;
    }
    #im-comment-bubble button:hover { background: rgba(245,158,11,0.15); }
    @keyframes bubblePop {
      from { opacity: 0; transform: scale(0.85) translateY(4px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }

    /* ── FULLSCREEN EDITOR ── */
    .im-fs-shell {
      position: fixed; inset: 0; z-index: 99999;
      display: flex; flex-direction: column;
      background: #0d1117;
      animation: imFsIn 0.22s cubic-bezier(0.16,1,0.3,1);
    }
    @keyframes imFsIn {
      from { opacity: 0; transform: scale(0.98); }
      to   { opacity: 1; transform: scale(1); }
    }

    /* Top bar */
    .im-fs-topbar {
      display: flex; align-items: center; gap: 12px;
      padding: 0 20px; height: 52px; flex-shrink: 0;
      background: #161b22;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    /* Body = sidebar + canvas */
    .im-fs-body {
      flex: 1; display: flex; overflow: hidden;
    }

    /* Left sidebar */
    .im-fs-sidebar {
      width: 240px; flex-shrink: 0;
      background: #161b22;
      border-right: 1px solid rgba(255,255,255,0.06);
      display: flex; flex-direction: column;
      overflow-y: auto;
      padding: 20px 0;
    }

    /* Right canvas area */
    .im-fs-canvas-wrap {
      flex: 1; overflow-y: auto;
      background: #ffffff; /* Solid white background for true edge-to-edge feel */
      display: flex; flex-direction: column;
    }

    /* The white document "paper" - NOW TRULY FULL SCREEN */
    .im-fs-paper {
      width: 100%; 
      max-width: none; /* Removed width limits */
      margin: 0; /* Removed margins */
      background: transparent;
      border-radius: 0;
      box-shadow: none;
      display: flex;
      flex-direction: column;
      flex: 1; /* Stretches to fill vertical space */
    }

    /* Quill toolbar inside paper top */
    .im-fs-paper .ql-toolbar.ql-snow {
      border: none !important;
      border-bottom: 1px solid #e5e7eb !important;
      background: #f9fafb;
      padding: 10px 24px;
      position: sticky; top: 0; z-index: 10;
    }
    .im-fs-paper .ql-container.ql-snow { 
      border: none !important; 
      flex: 1; 
      display: flex; 
      flex-direction: column;
    }
    .im-fs-paper .ql-editor {
      flex: 1;
      font-size: 15px;
      line-height: 1.85;
      color: #111827 !important;
      padding: 40px 8%; /* Adjust padding for ultra-wide screens */
      font-family: 'Georgia', serif;
    }
    .im-fs-paper .ql-editor.ql-blank::before {
      color: #9ca3af;
      font-style: italic;
      left: 8%;
    }

    /* Table styles inside paper */
    .im-fs-paper .ql-editor table {
      border-collapse: collapse; width: 100%; margin: 20px 0;
    }
    .im-fs-paper .ql-editor table td,
    .im-fs-paper .ql-editor table th {
      border: 1px solid #d1d5db !important;
      padding: 10px 14px; min-width: 60px;
    }
    .im-fs-paper .ql-editor table th {
      background: #f3f4f6; font-weight: 700;
    }

    /* Image resize */
    .im-fs-paper .ql-editor img {
      max-width: 100%; cursor: pointer; transition: outline 0.15s;
      border-radius: 4px;
    }
    .im-fs-paper .ql-editor img:hover {
      outline: 2px solid #ef4444; outline-offset: 2px;
    }

    /* Quill icon colors inside paper (light theme) */
    .im-fs-paper .ql-snow .ql-stroke { stroke: #6b7280 !important; }
    .im-fs-paper .ql-snow .ql-fill   { fill:   #6b7280 !important; }
    .im-fs-paper .ql-snow.ql-toolbar button:hover .ql-stroke,
    .im-fs-paper .ql-snow.ql-toolbar button.ql-active .ql-stroke { stroke: #ef4444 !important; }
    .im-fs-paper .ql-snow.ql-toolbar button:hover .ql-fill,
    .im-fs-paper .ql-snow.ql-toolbar button.ql-active .ql-fill   { fill: #ef4444 !important; }
    .im-fs-paper .ql-snow .ql-picker-label { color: #6b7280 !important; }
    .im-fs-paper .ql-snow .ql-picker-options {
      background: #ffffff !important;
      border-color: #e5e7eb !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    /* Table action bar inside paper */
    .im-fs-table-bar {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
      padding: 8px 24px;
      background: #eff6ff;
      border-bottom: 1px solid #dbeafe;
    }

    /* Font classes */
    .ql-font-dm-sans  { font-family: "DM Sans", sans-serif; }
    .ql-font-arial    { font-family: "Arial", sans-serif; }
    .ql-font-georgia  { font-family: "Georgia", serif; }
    .ql-font-courier  { font-family: "Courier New", monospace; }

    /* Inline block editor */
    .im-quill-canvas .ql-editor {
      font-size: 14px; line-height: 1.7; padding: 20px 24px;
    }
    .im-quill-canvas .ql-editor table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    .im-quill-canvas .ql-editor table td,
    .im-quill-canvas .ql-editor table th {
      border: 1px solid #64748b !important;
      padding: 7px 10px; min-width: 40px;
    }
    .im-quill-canvas .ql-editor img { max-width: 100%; border-radius: 4px; }
  `;
  document.head.appendChild(s);
}

// ── FULLSCREEN SHELL (portal) ─────────────────────────────────────────────────
function FullscreenEditor({ block, value, onChange, onClose, onFocus, onBlur }) {
  const paperRef   = useRef(null);
  const toolbarRef = useRef(null);
  const quillRef   = useRef(null);
  const [wc, setWc] = useState(0);
  const [saved, setSaved] = useState(true);

  // Escape closes
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function makeImageHandler(quill) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.click();
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const path = `im-quill/${block.dataPath}/${Date.now()}-${file.name}`;
        const snap = await uploadBytes(storageRef(storage, path), file);
        const url  = await getDownloadURL(snap.ref);
        const range = quill.getSelection(true);
        quill.insertEmbed(range.index, 'image', url);
        setTimeout(() => { if (onChange) onChange(block.dataPath, quill.root.innerHTML); }, 100);
      } catch (err) { console.error('Image upload failed:', err); }
    };
  }

  useEffect(() => {
    if (!paperRef.current || !toolbarRef.current || quillRef.current) return;
    quillRef.current = new Quill(paperRef.current, {
      theme: 'snow',
      placeholder: block.showPlaceholderAsGuide ? '' : (block.placeholder || block.desc || 'Start writing…'),
      modules: {
        table: true,
        toolbar: {
          container: toolbarRef.current,
          handlers: {
            image: function () { makeImageHandler(quillRef.current); },
          },
        },
        clipboard: { matchVisual: false },
      },
    });
    if (value) quillRef.current.root.innerHTML = value;
    setTimeout(() => quillRef.current?.focus(), 80);

    quillRef.current.on('text-change', (delta, old, source) => {
      if (source !== 'user') return;
      setSaved(false);
      setWc(() => {
        const txt = quillRef.current.getText().trim();
        return txt ? txt.split(/\s+/).length : 0;
      });
      if (onChange) {
        onChange(block.dataPath, quillRef.current.root.innerHTML);
        setTimeout(() => setSaved(true), 800);
      }
    });

    quillRef.current.root.addEventListener('focus', () => { if (onFocus) onFocus(block.id); });
    quillRef.current.root.addEventListener('blur',  () => { if (onBlur)  onBlur(block.id); });

    // Seed word count
    if (value) {
      const txt = value.replace(/<[^>]*>/g, ' ').trim();
      setWc(txt ? txt.split(/\s+/).length : 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tbl = () => quillRef.current?.getModule('table');

  // Build outline from headings
  const [outline, setOutline] = useState([]);
  useEffect(() => {
    const interval = setInterval(() => {
      if (!quillRef.current) return;
      const headings = [];
      quillRef.current.root.querySelectorAll('h1,h2,h3').forEach((el, i) => {
        headings.push({ tag: el.tagName, text: el.textContent.trim().slice(0, 36), idx: i });
      });
      setOutline(headings);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return ReactDOM.createPortal(
    <div className="im-fs-shell">

      {/* ── TOP BAR ── */}
      <div className="im-fs-topbar">
        {/* Red accent stripe */}
        <div style={{ width: 3, height: 22, borderRadius: 2, background: '#ef4444', flexShrink: 0 }} />

        {/* Block label */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', letterSpacing: 0.2 }}>
            {block.label || 'Rich Text Editor'}
          </span>
          <span style={{ fontSize: 10, color: '#475569', fontWeight: 500 }}>
            {block.dataPath}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Word count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <AlignLeft size={11} color="#64748b" />
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{wc} words</span>
        </div>

        {/* Save status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: saved ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${saved ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
          <Save size={11} color={saved ? '#10b981' : '#f59e0b'} />
          <span style={{ fontSize: 11, color: saved ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
            {saved ? 'Saved' : 'Saving…'}
          </span>
        </div>

        {/* Done button */}
        <button
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 18px', borderRadius: 7,
            background: '#ef4444', border: 'none',
            color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700,
            boxShadow: '0 2px 8px rgba(239,68,68,0.35)',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#dc2626'}
          onMouseLeave={e => e.currentTarget.style.background = '#ef4444'}
        >
          <Minimize2 size={13} /> Done
        </button>
      </div>

      {/* ── BODY ── */}
      <div className="im-fs-body">

        {/* LEFT SIDEBAR */}
        <div className="im-fs-sidebar">

          {/* Field info */}
          <div style={{ padding: '0 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <FileText size={13} color="#ef4444" />
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#475569' }}>Field Info</span>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {block.desc || block.placeholder || 'No description set.'}
            </div>
          </div>

          {/* Outline */}
          <div style={{ padding: '0 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Hash size={13} color="#64748b" />
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#475569' }}>Outline</span>
            </div>
            {outline.length === 0
              ? <p style={{ fontSize: 11, color: '#334155', fontStyle: 'italic' }}>No headings yet</p>
              : outline.map((h, i) => (
                <div key={i} style={{
                  fontSize: h.tag === 'H1' ? 12 : h.tag === 'H2' ? 11 : 10,
                  fontWeight: h.tag === 'H1' ? 700 : 500,
                  color: h.tag === 'H1' ? '#94a3b8' : '#475569',
                  paddingLeft: h.tag === 'H1' ? 0 : h.tag === 'H2' ? 10 : 18,
                  marginBottom: 8, cursor: 'pointer',
                  transition: 'color 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
                  onMouseLeave={e => e.currentTarget.style.color = h.tag === 'H1' ? '#94a3b8' : '#475569'}
                >
                  {h.text || '(untitled)'}
                </div>
              ))
            }
          </div>

          {/* Tips */}
          <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 10, color: '#334155', lineHeight: 1.7 }}>
              <div style={{ marginBottom: 4, fontWeight: 700, color: '#475569' }}>Tips</div>
              <div>• Use ⌘B / Ctrl+B for bold</div>
              <div>• Use # heading for outline</div>
              <div>• Press Escape to exit</div>
            </div>
          </div>
        </div>

        {/* RIGHT CANVAS */}
        <div className="im-fs-canvas-wrap">
          <div className="im-fs-paper">

            {/* Sticky Quill toolbar inside paper */}
            <div ref={toolbarRef} style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '8px 24px' }}>
              <span className="ql-formats">
                <select className="ql-font" defaultValue="">
                  <option value="">Default</option>
                  <option value="dm-sans">DM Sans</option>
                  <option value="arial">Arial</option>
                  <option value="georgia">Georgia</option>
                  <option value="courier">Courier</option>
                </select>
                <select className="ql-header" defaultValue="">
                  <option value="1">H1</option>
                  <option value="2">H2</option>
                  <option value="3">H3</option>
                  <option value="">Normal</option>
                </select>
              </span>
              <span className="ql-formats">
                <button className="ql-bold" />
                <button className="ql-italic" />
                <button className="ql-underline" />
                <button className="ql-strike" />
              </span>
              <span className="ql-formats">
                <select className="ql-color" />
                <select className="ql-background" />
              </span>
              <span className="ql-formats">
                <select className="ql-align" />
              </span>
              <span className="ql-formats">
                <button className="ql-list" value="ordered" />
                <button className="ql-list" value="bullet" />
                <button className="ql-indent" value="-1" />
                <button className="ql-indent" value="+1" />
              </span>
              <span className="ql-formats">
                <button className="ql-blockquote" />
                <button className="ql-code-block" />
              </span>
              <span className="ql-formats">
                <button className="ql-link" />
                <button className="ql-image" />
              </span>
            </div>

            {/* Table controls */}
            <div className="im-fs-table-bar">
              <span style={{ fontSize: 10, fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Table</span>
              <button onMouseDown={e => { e.preventDefault(); tbl()?.insertTable(3, 3); }} style={tblBtn()}>
                <Table2 size={11} /> Insert
              </button>
              <button onMouseDown={e => { e.preventDefault(); tbl()?.insertRowBelow(); }} style={tblBtn()}>
                <Plus size={10} /> Row <ArrowDown size={9} />
              </button>
              <button onMouseDown={e => { e.preventDefault(); tbl()?.insertColumnRight(); }} style={tblBtn()}>
                <Plus size={10} /> Col <ArrowRight size={9} />
              </button>
              <button onMouseDown={e => { e.preventDefault(); tbl()?.deleteRow(); }} style={tblBtn('#ef4444')}>
                <Trash2 size={10} /> Row
              </button>
              <button onMouseDown={e => { e.preventDefault(); tbl()?.deleteColumn(); }} style={tblBtn('#ef4444')}>
                <Trash2 size={10} /> Col
              </button>
              <button onMouseDown={e => { e.preventDefault(); tbl()?.deleteTable(); }} style={tblBtn('#ef4444')}>
                <X size={10} /> Table
              </button>
            </div>

            {/* The actual Quill editor */}
            <div ref={paperRef} />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function tblBtn(color = '#3b82f6') {
  return {
    display: 'flex', alignItems: 'center', gap: 4,
    background: 'none', border: 'none', color,
    fontSize: 10, fontWeight: 700, cursor: 'pointer',
    padding: '3px 7px', borderRadius: 4,
    transition: 'background 0.15s',
  };
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function RichTextBlock({
  block, value, onChange, lockedBy, onFocus, onBlur, isDark = true,
}) {
  const editorRef        = useRef(null);
  const toolbarRef       = useRef(null);
  const quillInstance    = useRef(null);
  const typingTimeout    = useRef(null);
  const pendingSelection = useRef(null);

  const [isFocused,  setIsFocused]  = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const placeholderText = block.placeholder || block.desc || '';
  const usePlaceholderGuide = !!block.showPlaceholderAsGuide && !!placeholderText;
  const [hiddenGuides, setHiddenGuides] = useState({});
  const showPlaceholderGuide = usePlaceholderGuide && !hiddenGuides[block.id];

  const t = {
    bg:            isDark ? '#0d1117'                : '#ffffff',
    border:        isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
    text:          isDark ? '#e2e8f0'                : '#111827',
    toolbarBg:     isDark ? '#161b22'                : '#f9fafb',
    toolbarBorder: isDark ? 'rgba(255,255,255,0.06)' : '#e5e7eb',
    textMuted:     isDark ? '#94a3b8'                : '#6b7280',
    accent:        '#ef4444',
    subBarBg:      isDark ? '#1f242c'                : '#eff6ff',
    tableBorder:   isDark ? '#64748b'                : '#cbd5e1',
  };

  // ── COMMENT HELPERS ────────────────────────────────────────────────────────
  const showBubble = useCallback((rect, range) => {
    const bubble = document.getElementById('im-comment-bubble');
    if (!bubble) return;
    pendingSelection.current = range;
    bubble.style.top  = `${Math.max(8, rect.top + window.scrollY - 44)}px`;
    bubble.style.left = `${Math.max(8, rect.left + window.scrollX + rect.width / 2 - 60)}px`;
    bubble.classList.add('visible');
  }, []);

  const hideBubble = useCallback(() => {
    document.getElementById('im-comment-bubble')?.classList.remove('visible');
    pendingSelection.current = null;
  }, []);

  const createComment = useCallback((range) => {
    if (!quillInstance.current || !range || range.length === 0) return;
    const commentId = `cmt_${crypto.randomUUID().split('-')[0]}`;
    quillInstance.current.formatText(range.index, range.length, 'comment', { id: commentId, status: 'open' });
    const quote = quillInstance.current.getText(range.index, range.length);
    window.dispatchEvent(new CustomEvent('im-open-comments-sidebar'));
    window.dispatchEvent(new CustomEvent('im-create-comment', { detail: { commentId, blockId: block.id, quote } }));
    setTimeout(() => { if (onChange) onChange(block.dataPath, quillInstance.current.root.innerHTML); }, 100);
  }, [block.dataPath, block.id, onChange]);

  const handleCommentClick = (e) => {
    e.preventDefault();
    if (!quillInstance.current) return;
    const range = quillInstance.current.getSelection();
    if (!range || range.length === 0) {
      alert('Please highlight some text first to attach a comment thread.');
      return;
    }
    hideBubble();
    createComment(range);
  };

  // ── QUILL INIT ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorRef.current || !toolbarRef.current || quillInstance.current) return;

    function imageUploadHandler() {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.click();
      input.onchange = async () => {
        const file = input.files[0]; if (!file) return;
        try {
          const path = `im-quill/${block.dataPath}/${Date.now()}-${file.name}`;
          const snap = await uploadBytes(storageRef(storage, path), file);
          const url  = await getDownloadURL(snap.ref);
          const range = this.quill.getSelection(true);
          this.quill.insertEmbed(range.index, 'image', url);
          setTimeout(() => { if (onChange) onChange(block.dataPath, this.quill.root.innerHTML); }, 100);
        } catch (err) { console.error('Quill image upload failed:', err); }
      };
    }

    quillInstance.current = new Quill(editorRef.current, {
      theme: 'snow',
      placeholder: usePlaceholderGuide ? '' : (placeholderText || 'Start writing…'),
      modules: {
        table: true,
        toolbar: { container: toolbarRef.current, handlers: { image: imageUploadHandler } },
        clipboard: { matchVisual: false },
      },
    });

    if (value) quillInstance.current.root.innerHTML = value;

    quillInstance.current.on('selection-change', (range) => {
      if (!range || range.length === 0) { setTimeout(() => hideBubble(), 150); return; }
      const nr = quillInstance.current.selection.getNativeRange();
      if (nr) showBubble(nr.native.getBoundingClientRect(), range);
    });

    quillInstance.current.root.addEventListener('click', (e) => {
      const span = e.target.closest('[data-comment-id]');
      if (!span) return;
      window.dispatchEvent(new CustomEvent('im-open-comments-sidebar'));
      window.dispatchEvent(new CustomEvent('im-open-comment', { detail: { commentId: span.getAttribute('data-comment-id') } }));
    });

    quillInstance.current.on('text-change', (delta, old, source) => {
      if (source !== 'user') return;
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        if (onChange) onChange(block.dataPath, quillInstance.current.root.innerHTML);
      }, 800);
    });

    quillInstance.current.root.addEventListener('focus', () => { setIsFocused(true); if (onFocus) onFocus(block.id); });
    quillInstance.current.root.addEventListener('blur',  () => {
      setIsFocused(false); if (onBlur) onBlur(block.id);
      clearTimeout(typingTimeout.current);
      if (onChange) onChange(block.dataPath, quillInstance.current.root.innerHTML);
    });

    const onCommentUpdate = (e) => {
      const { commentId, status } = e.detail;
      const spans = quillInstance.current.root.querySelectorAll(`[data-comment-id="${commentId}"]`);
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
      if (status === 'deleted') setTimeout(() => { if (onChange) onChange(block.dataPath, quillInstance.current.root.innerHTML); }, 50);
    };
    window.addEventListener('im-comment-status-update', onCommentUpdate);
    return () => window.removeEventListener('im-comment-status-update', onCommentUpdate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── SYNC VALUE (skip when expanded — modal owns the content) ───────────────
  useEffect(() => {
    if (!quillInstance.current || isFocused || isExpanded) return;
    if (value !== quillInstance.current.root.innerHTML) {
      const sel = quillInstance.current.getSelection();
      quillInstance.current.root.innerHTML = value || '';
      if (sel) quillInstance.current.setSelection(sel);
    }
  }, [value, isFocused, isExpanded]);

  // ── LOCK ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!quillInstance.current) return;
    lockedBy ? quillInstance.current.disable() : quillInstance.current.enable();
  }, [lockedBy]);

  return (
    <BlockWrapper block={block} lockedBy={lockedBy} isDark={isDark}>
     

      {usePlaceholderGuide && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <button
              onClick={() => setHiddenGuides(prev => ({ ...prev, [block.id]: !prev[block.id] }))}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: t.accent, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              <Info size={12} /> {showPlaceholderGuide ? 'Hide Guide' : 'Show Guide'}
            </button>
          </div>
          {showPlaceholderGuide && (
            <div style={{ padding: '10px 14px', borderRadius: 6, fontSize: 12, color: t.text, background: t.toolbarBg, borderLeft: `3px solid ${t.accent}`, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {placeholderText}
            </div>
          )}
        </div>
      )}

      <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden', background: t.bg }}>

        {/* Inline toolbar */}
        <div ref={toolbarRef} style={{ background: t.toolbarBg, borderBottom: `1px solid ${t.toolbarBorder}`, padding: '8px 12px' }}>
          <span className="ql-formats">
            <select className="ql-font" defaultValue="">
              <option value="">Default</option>
              <option value="dm-sans">DM Sans</option>
              <option value="arial">Arial</option>
              <option value="georgia">Georgia</option>
              <option value="courier">Courier</option>
            </select>
            <select className="ql-header" defaultValue="">
              <option value="1">H1</option><option value="2">H2</option>
              <option value="3">H3</option><option value="">Normal</option>
            </select>
          </span>
          <span className="ql-formats">
            <button className="ql-bold" /><button className="ql-italic" />
            <button className="ql-underline" /><button className="ql-strike" />
          </span>
          <span className="ql-formats">
            <select className="ql-color" /><select className="ql-background" />
          </span>
          <span className="ql-formats"><select className="ql-align" /></span>
          <span className="ql-formats">
            <button className="ql-list" value="ordered" /><button className="ql-list" value="bullet" />
            <button className="ql-indent" value="-1" /><button className="ql-indent" value="+1" />
          </span>
          <span className="ql-formats">
            <button className="ql-link" /><button className="ql-image" />
          </span>
        </div>

        {/* Action bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '7px 12px', background: t.subBarBg, borderBottom: `1px solid ${t.toolbarBorder}` }}>
          <button onMouseDown={e => { e.preventDefault(); quillInstance.current?.getModule('table')?.insertTable(3,3); }} style={inlineBtn(t)}>
            <Table2 size={13} /> Insert Table
          </button>
          <div style={{ width: 1, height: 14, background: t.border }} />
          <button onMouseDown={e => { e.preventDefault(); quillInstance.current?.getModule('table')?.insertRowBelow(); }} style={inlineBtn(t)}>
            <Plus size={11} /> Row <ArrowDown size={10} />
          </button>
          <button onMouseDown={e => { e.preventDefault(); quillInstance.current?.getModule('table')?.insertColumnRight(); }} style={inlineBtn(t)}>
            <Plus size={11} /> Col <ArrowRight size={10} />
          </button>
          <div style={{ width: 1, height: 14, background: t.border }} />
          <button onMouseDown={e => { e.preventDefault(); quillInstance.current?.getModule('table')?.deleteRow(); }} style={inlineBtn(t, '#ef4444')}>
            <Trash2 size={11} /> Row
          </button>
          <button onMouseDown={e => { e.preventDefault(); quillInstance.current?.getModule('table')?.deleteColumn(); }} style={inlineBtn(t, '#ef4444')}>
            <Trash2 size={11} /> Col
          </button>
          <button onMouseDown={e => { e.preventDefault(); quillInstance.current?.getModule('table')?.deleteTable(); }} style={inlineBtn(t, '#ef4444')}>
            <X size={11} /> Table
          </button>
          <div style={{ flex: 1 }} />
          <button onMouseDown={handleCommentClick} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
            <MessageSquarePlus size={14} /> Comment
          </button>
          {/* Expand to fullscreen */}
          <button
            onMouseDown={e => { e.preventDefault(); setIsExpanded(true); }}
            title="Open fullscreen editor"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            <Maximize2 size={13} /> Expand
          </button>
        </div>

        {/* Inline editor */}
        <div ref={editorRef} className="im-quill-canvas" style={{ color: t.text }} />
      </div>

  <style>{`
        .ql-toolbar.ql-snow { border: none !important; }
        .ql-container.ql-snow { border: none !important; }
        .im-quill-canvas .ql-editor { min-height: ${block.minHeight || '160px'}; color: ${t.text} !important; }
.im-quill-canvas .ql-editor.ql-blank::before { 
  color: ${t.textMuted} !important; 
  font-style: italic; 
  /* Safe wrap restored */
  white-space: pre-wrap; 
  word-wrap: break-word;
}      .ql-snow .ql-stroke { stroke: ${t.textMuted} !important; }
        .ql-snow .ql-fill   { fill:   ${t.textMuted} !important; }
        .ql-snow.ql-toolbar button:hover .ql-stroke,
        .ql-snow.ql-toolbar button.ql-active .ql-stroke { stroke: #ef4444 !important; }
        .ql-snow.ql-toolbar button:hover .ql-fill,
        .ql-snow.ql-toolbar button.ql-active .ql-fill   { fill: #ef4444 !important; }
        .ql-snow .ql-picker-label { color: ${t.textMuted} !important; }
        .ql-snow .ql-picker-options { background: ${t.toolbarBg} !important; border-color: ${t.border} !important; }
      `}</style>

      {/* FULLSCREEN PORTAL */}
      {isExpanded && (
        <FullscreenEditor
          block={block}
          value={quillInstance.current?.root.innerHTML || value}
          onChange={onChange}
          onClose={() => setIsExpanded(false)}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      )}

      {/* Floating comment bubble */}
      <BubblePortal onComment={() => {
        const range = pendingSelection.current;
        hideBubble();
        if (range) createComment(range);
      }} />
    </BlockWrapper>
  );
}

function inlineBtn(t, color = null) {
  return {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'none', border: 'none',
    color: color || t.textMuted,
    fontSize: 11, fontWeight: 700, cursor: 'pointer',
    padding: '4px 6px', borderRadius: 4,
  };
}

function BubblePortal({ onComment }) {
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    if (document.getElementById('im-comment-bubble')) return;
    const bubble = document.createElement('div');
    bubble.id = 'im-comment-bubble';
    const btn = document.createElement('button');
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Comment`;
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); onComment(); });
    bubble.appendChild(btn);
    document.body.appendChild(bubble);
    return () => bubble.remove();
  }, [onComment]);
  return null;
}
