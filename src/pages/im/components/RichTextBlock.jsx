import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import BlockWrapper from './BlockWrapper.jsx';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  MessageSquarePlus, Table2, Trash2, Plus,
  ArrowDown, ArrowRight, X, Maximize2, Minimize2,
  FileText, Hash, AlignLeft, CheckSquare, Save, Info, Eye
} from 'lucide-react';
import ImageResize from '@mgreminger/quill-image-resize-module';
Quill.register('modules/imageResize', ImageResize);

const storage = getStorage();
const COMMENT_DOM_SETTLEMENT_DELAY_MS = 50;

// ââ BASE64 IMAGE SWEEPER ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const sweepBase64Images = async (quill, dataPath) => {
  if (!quill || !quill.root) return false;
  const images = quill.root.querySelectorAll('img[src^="data:image/"]');
  if (images.length === 0) return false;

  let updatedAny = false;
  for (const img of images) {
    const b64 = img.src;
    try {
      img.style.opacity = '0.4';
      img.style.transition = 'opacity 0.3s ease';

      const res = await fetch(b64);
      const blob = await res.blob();
      const ext = blob.type.split('/')[1] || 'png';
      const path = `im-quill/${dataPath}/b64-${Date.now()}-${Math.floor(Math.random()*1000)}.${ext}`;

      const snap = await uploadBytes(storageRef(storage, path), blob);
      const url = await getDownloadURL(snap.ref);

      img.src = url; 
      img.style.opacity = '1';
      updatedAny = true;
    } catch (err) {
      console.error('Base64 sweep failed:', err);
      img.style.opacity = '1';
    }
  }
  return updatedAny;
};

// ââ WORD/DOCS TABLE-CELL NORMALIZER ââââââââââââââââââââââââââââââââââââââââ
// Word and Google Docs export table cells that contain a bulleted list (or
// any multi-line content) as MULTIPLE <p>/<li> elements inside one <td>.
// Quill's built-in table module only supports a single paragraph per cell â
// when it hits the 2nd+ paragraph inside a <td>, it pulls that content OUT
// of the table and re-inserts it as a brand new, empty-looking table. That
// is the exact bug where a clean 2-column table turns into a mess of stray
// boxes after paste.
//
// Fix: before Quill's clipboard module ever sees the pasted HTML, walk every
// <td>/<th> and collapse its paragraphs/list items into ONE paragraph
// joined by <br>, so each cell round-trips as a single block. No content is
// lost â bullets are kept as "â¢ " text markers â and nothing about the
// table module, toolbar buttons, or existing paste/image logic changes.
const normalizeWordTableCellsHTML = (html) => {
  if (!html || !/<table/i.test(html)) return html; // only touch table paste, leave everything else untouched
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('td, th').forEach((cell) => {
      const blocks = Array.from(cell.querySelectorAll(':scope > p, :scope > div, :scope > li'));
      if (blocks.length <= 1) return; // already a single block, nothing to fix

      const merged = document.createElement('p');
      blocks.forEach((block, i) => {
        if (i > 0) merged.appendChild(document.createElement('br'));
        if (block.tagName === 'LI') merged.appendChild(document.createTextNode('â¢ '));
        while (block.firstChild) merged.appendChild(block.firstChild); // keep bold/italic/underline etc. intact
        block.remove();
      });

      cell.innerHTML = '';
      cell.appendChild(merged);
    });
    return doc.body.innerHTML;
  } catch (err) {
    console.error('Table cell normalization failed, pasting original content:', err);
    return html; // fail safe: never block a paste, worst case old behavior returns
  }
};

// ââ COMMENT BLOT âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
        node.style.backgroundColor = 'transparent';
        node.style.boxShadow = 'none';
        node.style.cursor = 'inherit';
      } else {
        node.style.backgroundColor = 'rgba(245,158,11,0.22)';
        node.style.boxShadow = 'inset 0 -2px 0 0 rgba(245,158,11,0.75)';
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

// ââ FONT WHITELIST âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
if (!Quill.imports['formats/font']?.whitelist) {
  const Font = Quill.import('formats/font');
  Font.whitelist = ['dm-sans', 'arial', 'georgia', 'courier'];
  Quill.register(Font, true);
}

// ââ GLOBAL STYLES âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const STYLE_ID = 'im-rte-global-styles-v5'; // V5 forces a clean refresh
if (!document.getElementById(STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    mark.im-comment-highlight {
      background: linear-gradient(0deg, rgba(245,158,11,0.35) 0%, rgba(245,158,11,0.16) 100%) !important;
      box-shadow: inset 0 -2px 0 0 rgba(245,158,11,0.85) !important;
      border-radius: 4px !important; padding: 1px 2px !important; margin: 0 !important;
      display: inline !important; line-height: inherit !important;
      cursor: pointer !important; transition: background 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
      color: inherit !important;
    }
    mark.im-comment-highlight:hover {
      filter: brightness(1.08);
      box-shadow: inset 0 -2px 0 0 #f59e0b, 0 1px 6px rgba(245,158,11,0.35) !important;
    }
    mark.im-comment-highlight[data-comment-status="resolved"] {
      background-color: transparent !important;
      box-shadow: none !important;
      cursor: inherit !important;
    }
    .active-comment-glow {
      background-color: rgba(245, 158, 11, 0.6) !important;
      transition: background-color 0.3s ease !important;
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

    .im-fs-topbar {
      display: flex; align-items: center; gap: 12px;
      padding: 0 20px; height: 52px; flex-shrink: 0;
      background: #161b22;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .im-fs-body {
      flex: 1; display: flex; overflow: hidden;
    }

    .im-fs-sidebar {
      width: 240px; flex-shrink: 0;
      background: #161b22;
      border-right: 1px solid rgba(255,255,255,0.06);
      display: flex; flex-direction: column;
      overflow-y: auto;
      padding: 20px 0;
    }

    .im-fs-canvas-wrap {
      flex: 1; overflow-y: auto;
      background: #ffffff;
      display: flex; flex-direction: column;
    }

    .im-fs-paper {
      width: 100%; max-width: none; margin: 0; 
      background: transparent; border-radius: 0; box-shadow: none;
      display: flex; flex-direction: column; flex: 1; 
    }

    .im-fs-paper .ql-toolbar.ql-snow {
      border: none !important; border-bottom: 1px solid #e5e7eb !important;
      background: #f9fafb; padding: 10px 24px;
      position: sticky; top: 0; z-index: 10;
    }
    .im-fs-paper .ql-container.ql-snow { 
      border: none !important; flex: 1; display: flex; flex-direction: column;
    }
    .im-fs-paper .ql-editor {
      flex: 1; font-size: 15px; line-height: 1.85; color: #111827 !important;
      padding: 40px 8%; font-family: 'Georgia', serif;
    }
    .im-fs-paper .ql-editor.ql-blank::before { color: #9ca3af; font-style: italic; left: 8%; }

    .im-fs-paper .ql-snow .ql-stroke { stroke: #6b7280 !important; }
    .im-fs-paper .ql-snow .ql-fill   { fill:   #6b7280 !important; }
    .im-fs-paper .ql-snow.ql-toolbar button:hover .ql-stroke, .im-fs-paper .ql-snow.ql-toolbar button.ql-active .ql-stroke { stroke: #ef4444 !important; }
    .im-fs-paper .ql-snow.ql-toolbar button:hover .ql-fill, .im-fs-paper .ql-snow.ql-toolbar button.ql-active .ql-fill   { fill: #ef4444 !important; }
    .im-fs-paper .ql-snow .ql-picker-label { color: #6b7280 !important; }
    .im-fs-paper .ql-snow .ql-picker-options { background: #ffffff !important; border-color: #e5e7eb !important; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }

    .im-fs-table-bar {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
      padding: 8px 24px; background: #eff6ff; border-bottom: 1px solid #dbeafe;
    }

    .ql-font-dm-sans  { font-family: "DM Sans", sans-serif; }
    .ql-font-arial    { font-family: "Arial", sans-serif; }
    .ql-font-georgia  { font-family: "Georgia", serif; }
    .ql-font-courier  { font-family: "Courier New", monospace; }

    .im-quill-canvas .ql-editor { font-size: 14px; line-height: 1.7; padding: 20px 24px; }
    
    .ql-editor p { display: block; }
    .ql-editor img { display: inline; margin: 0 4px; vertical-align: bottom; max-width: 100% !important; height: auto !important; }

    /* ââ THE NUCLEAR MS WORD TABLE CRUSHER & SCROLLBAR ââ */
    
    /* 1. Prevent editor container from bursting */
    .im-quill-canvas .ql-editor, .im-fs-paper .ql-editor {
        max-width: 100% !important;
        overflow-x: auto !important;
    }

    /* 2. Turn table into a block scrollable container */
    .ql-editor table {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: auto !important;
        border-collapse: collapse !important;
        margin: 16px 0 !important;
        table-layout: auto !important; 
    }
    
    /* 3. Keep inner grid functional */
    .ql-editor table tbody {
        display: table !important;
        width: 100% !important;
    }

    /* 4. Force cells to wrap and limit max width */
    .ql-editor td, .ql-editor th {
        min-width: 120px !important;
        max-width: 300px !important; /* CRITICAL: Stops MS Word from making infinitely wide columns */
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        word-break: break-word !important;
        vertical-align: top !important;
        border: 1px solid #cbd5e1 !important;
        padding: 8px 12px !important;
    }

    /* 5. Force ALL child elements (like MS Word <p> and <span>) to comply */
    .ql-editor td *, .ql-editor th * {
        white-space: pre-wrap !important !important;
        word-wrap: break-word !important;
        word-break: break-word !important;
        max-width: 100% !important;
    }

    /* 6. High Visibility Custom Scrollbar */
    .ql-editor table::-webkit-scrollbar { height: 12px !important; }
    .ql-editor table::-webkit-scrollbar-track { background: rgba(148, 163, 184, 0.15) !important; border-radius: 6px !important; margin: 0 4px; }
    .ql-editor table::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.6) !important; border-radius: 6px !important; border: 2px solid transparent; background-clip: padding-box; }
    .ql-editor table::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.9) !important; border: 2px solid transparent; background-clip: padding-box; }

    /* General text wrapping for the whole editor */
    .ql-editor {
      word-wrap: break-word !important;
      overflow-wrap: break-word !important;
      word-break: break-word !important;
      white-space: pre-wrap !important;
      cursor: text !important; /* FORCES MOUSE POINTER TO SHOW ON HP VICTUS */
      caret-color: #ec4899 !important; /* FORCES CURSOR TO BE HOT PINK */
    }

    /* ââ WINDOWS UI SCALING FIX (PREVENTS MICROSCOPIC CURSORS) ââ */
    .ql-editor p, .ql-editor div {
      min-height: 1.6em !important;
      font-size: inherit;
    }
  `;
  document.head.appendChild(s);
}
// ââ FULLSCREEN SHELL (portal) âââââââââââââââââââââââââââââââââââââââââââââââââ
function FullscreenEditor({
  block, value, onChange, onClose, onFocus, onBlur, readOnly,
  targetCommentId, targetCommentQuote, searchJumpTrigger, onQuillReady,
  showBubble, hideBubble
}) {
  const paperRef   = useRef(null);
  const toolbarRef = useRef(null);
  const quillRef   = useRef(null);
  const [wc, setWc] = useState(0);
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef(null); 
  
  useEffect(() => {
    const h = (e) => { 
      if (e.key === 'Escape') {
        if (document.activeElement?.closest('#comments-sidebar')) return;
        onClose(); 
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

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
        quill.insertText(range.index + 1, ' ', 'user');
        quill.setSelection(range.index + 2, 'silent');
        setTimeout(() => { if (onChange) onChange(block.dataPath, quill.root.innerHTML); }, 100);
      } catch (err) { console.error('Image upload failed:', err); }
    };
  }

  useEffect(() => {
    if (!paperRef.current || !toolbarRef.current || quillRef.current) return;
    quillRef.current = new Quill(paperRef.current, {
      theme: 'snow',
      readOnly: readOnly, 
      placeholder: block.showPlaceholderAsGuide ? '' : (block.placeholder || block.desc || 'Start writingâ¦'),
      modules: {
        table: true,
        toolbar: {
          container: toolbarRef.current,
          handlers: { image: function () { makeImageHandler(quillRef.current); } },
        },
        imageResize: { modules: ['Resize', 'DisplaySize'] },
        clipboard: { matchVisual: false },
      },
    });
    
    if (value) {
      quillRef.current.root.innerHTML = value;
      if (String(value).replace(/<[^>]*>/g, '').trim().length > 0 || String(value).includes('<img') || String(value).includes('<table')) {
        quillRef.current.root.classList.remove('ql-blank');
      }
    }

    // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // ââ NEW FIX: STRIP BACKGROUND/GREY MARKS, COLORS, & WIDTHS ââ
    quillRef.current.clipboard.addMatcher(Node.ELEMENT_NODE, (node, delta) => {
      delta.ops.forEach(op => {
        if (op.attributes) {
          delete op.attributes.background; // Removes grey highlight
          delete op.attributes.color;      // Fixes invisible text in Dark Mode
          delete op.attributes.width;      // CRUSHES HIDDEN TABLE WIDTHS
          delete op.attributes.height;     // CRUSHES HIDDEN TABLE HEIGHTS
        }
      });
      return delta;
    });
    // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    
    if (!readOnly) {
      setTimeout(() => quillRef.current?.focus(), 80);
    }
    if (onQuillReady) onQuillReady(quillRef.current);

    const handleDirectUpload = async (file, quill) => {
      if (!file || !file.type.startsWith('image/')) return;
      try {
        const path = `im-quill/${block.dataPath}/${Date.now()}-${file.name}`;
        const snap = await uploadBytes(storageRef(storage, path), file);
        const url  = await getDownloadURL(snap.ref);
        const range = quill.getSelection(true) || { index: quill.getLength() };
        quill.insertEmbed(range.index, 'image', url);
        quill.insertText(range.index + 1, ' ', 'user');
        quill.setSelection(range.index + 2, 'silent');
        setTimeout(() => { if (onChange) onChange(block.dataPath, quill.root.innerHTML); }, 100);
      } catch (err) { console.error('Image paste/drop upload failed:', err); }
    };

    quillRef.current.root.addEventListener('paste', (e) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        const hasImage = Array.from(files).some(f => f.type.startsWith('image/'));
        if (hasImage) {
          e.preventDefault(); 
          Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) handleDirectUpload(file, quillRef.current);
          });
        }
      }
    });

    // ââ TABLE PASTE FIX ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // MUST be attached on the CONTAINER (an ancestor of quill.root), in the
    // CAPTURE phase. Quill's own Clipboard module attaches its paste handler
    // directly on quill.root the moment `new Quill()` runs above â if we
    // attach on that same element, ours fires SECOND (registration order),
    // by which point Quill has already parsed+inserted the broken table.
    // A capture-phase listener on an ancestor always runs before any listener
    // on the target itself, so this lets us intercept and stop the event
    // before Quill ever sees it, only for table paste (everything else is
    // untouched and still goes to Quill/the image-paste logic above).
    paperRef.current.addEventListener('paste', (e) => {
      const html = e.clipboardData?.getData('text/html');
      if (!html || !/<table/i.test(html)) return; // not a table paste, let it through untouched
      e.preventDefault();
      e.stopPropagation();
      const cleaned = normalizeWordTableCellsHTML(html);
      const range = quillRef.current.getSelection(true) || { index: quillRef.current.getLength() };
      quillRef.current.clipboard.dangerouslyPasteHTML(range.index, cleaned, 'user');
    }, true); // capture: true is required

    quillRef.current.root.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const hasImage = Array.from(files).some(f => f.type.startsWith('image/'));
        if (hasImage) {
          e.preventDefault(); 
          Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) handleDirectUpload(file, quillRef.current);
          });
        }
      }
    });

    // ââ NEW: ALLOW HIGHLIGHT & COMMENT IN FULLSCREEN & READ-ONLY ââ
    quillRef.current.on('selection-change', (range) => {
      if (!range || range.length === 0) { 
        setTimeout(() => hideBubble && hideBubble(), 150); 
        return; 
      }
      const nr = quillRef.current.selection.getNativeRange();
      if (nr && showBubble) {
        showBubble(nr.native.getBoundingClientRect(), range, true); // true = isFullscreen
      }
    });

    quillRef.current.on('text-change', (delta, old, source) => {
      if (quillRef.current.getText().trim().length > 0 || quillRef.current.root.innerHTML.includes('<img') || quillRef.current.root.innerHTML.includes('<table')) {
        quillRef.current.root.classList.remove('ql-blank');
      } else {
        quillRef.current.root.classList.add('ql-blank');
      }
      if (source !== 'user') return;
      setSaved(false);
      setWc(() => {
        const txt = quillRef.current.getText().trim();
        return txt ? txt.split(/\s+/).length : 0;
      });

      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        if (onChange && quillRef.current) {
          await sweepBase64Images(quillRef.current, block.dataPath);
          let rawHtml = quillRef.current.root.innerHTML || '';
          
          if (rawHtml.includes('quill-image-resize-module')) {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = rawHtml;
              const junkOverlays = tempDiv.querySelectorAll('div[title="image-resize-module"]');
              junkOverlays.forEach(node => node.remove());
              rawHtml = tempDiv.innerHTML;
          }

          if (!rawHtml.includes('data:image/')) {
             onChange(block.dataPath, String(rawHtml));
             setSaved(true);
          } else {
             console.warn("Base64 sweep incomplete in fullscreen, skipping save to protect Firebase.");
          }
        }
      }, 800);
    });

    quillRef.current.root.addEventListener('focus', () => { if (onFocus) onFocus(block.id); });
    quillRef.current.root.addEventListener('blur',  () => { if (onBlur)  onBlur(block.id); });

    if (value) {
      const txt = value.replace(/<[^>]*>/g, ' ').trim();
      setWc(txt ? txt.split(/\s+/).length : 0);
    }

    return () => {
      if (onQuillReady) onQuillReady(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!targetCommentId || !paperRef.current || !quillRef.current) return;

    let attempts = 0;
    let jumpTimer;

    const executeJump = () => {
      let target = paperRef.current.querySelector(`[data-comment-id="${targetCommentId}"]`);
      let appliedByQuote = false;

      if (!target && targetCommentQuote) {
        appliedByQuote = ensureCommentHighlight(quillRef.current, {
          commentId: targetCommentId,
          quote: targetCommentQuote,
          status: 'open',
        });
        if (appliedByQuote) {
          target = paperRef.current.querySelector(`[data-comment-id="${targetCommentId}"]`);
        }
      }

      if (target) {
        setTimeout(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('active-comment-glow');
          setTimeout(() => target.classList.remove('active-comment-glow'), 1500);

          if (appliedByQuote && onChange) {
            onChange(block.dataPath, quillRef.current.root.innerHTML);
          }

          window.dispatchEvent(new CustomEvent('im-active-comment-changed', {
            detail: { commentId: targetCommentId, dataPath: block.dataPath, quote: targetCommentQuote }
          }));
        }, 250); 
      } else if (attempts < 8) {
        attempts++;
        jumpTimer = setTimeout(executeJump, 50); 
      }
    };

    executeJump();

    return () => clearTimeout(jumpTimer);
  }, [block.dataPath, onChange, targetCommentId, targetCommentQuote]);

  useEffect(() => {
    if (!searchJumpTrigger || !paperRef.current || !quillRef.current) return;

    let attempts = 0;
    let jumpTimer;

    const executeSearchJump = () => {
      const range = findQuoteRange(quillRef.current, searchJumpTrigger.matchText, searchJumpTrigger.occurrenceIndex);
      
      if (range) {
        setTimeout(() => {
          quillRef.current.focus();
          quillRef.current.setSelection(range.index, range.length);
          
          const bounds = quillRef.current.getBounds(range.index, range.length);
          if (bounds) {
            const container = paperRef.current.closest('.im-fs-canvas-wrap');
            if (container) {
              container.scrollTo({ top: Math.max(0, bounds.top - 100), behavior: 'smooth' });
            }
          }
        }, 250); 
      } else if (attempts < 8) {
        attempts++;
        jumpTimer = setTimeout(executeSearchJump, 50); 
      }
    };

    executeSearchJump();

    return () => clearTimeout(jumpTimer);
  }, [searchJumpTrigger]);

  const tbl = () => quillRef.current?.getModule('table');

  return ReactDOM.createPortal(
    <div 
      className="im-fs-shell"
      data-block-label={block?.label || 'Rich Text Block'}
      data-block-path={block?.dataPath || block?.id || 'global'}
    >
      <div className="im-fs-topbar">
        <div style={{ width: 3, height: 22, borderRadius: 2, background: readOnly ? '#3b82f6' : '#ef4444', flexShrink: 0 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', letterSpacing: 0.2 }}>
            {block.label || 'Rich Text Editor'}
          </span>
          <span style={{ fontSize: 10, color: '#475569', fontWeight: 500 }}>
            {block.dataPath}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => window.dispatchEvent(new CustomEvent('im-open-comments-sidebar'))}
          title="Open Discussions"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
            color: '#f59e0b', cursor: 'pointer', fontSize: 11, fontWeight: 700, transition: 'all 0.15s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.1)'}
        >
          <MessageSquarePlus size={12} /> Comments
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <AlignLeft size={11} color="#64748b" />
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{wc} words</span>
        </div>

        {!readOnly ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: saved ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${saved ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
            <Save size={11} color={saved ? '#10b981' : '#f59e0b'} />
            <span style={{ fontSize: 11, color: saved ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
              {saved ? 'Saved' : 'Savingâ¦'}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <Eye size={11} color="#3b82f6" />
            <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>Viewing Mode</span>
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 18px', borderRadius: 7,
            background: readOnly ? '#3b82f6' : '#ef4444', border: 'none',
            color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700,
            boxShadow: `0 2px 8px ${readOnly ? 'rgba(59,130,246,0.35)' : 'rgba(239,68,68,0.35)'}`,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = readOnly ? '#2563eb' : '#dc2626'}
          onMouseLeave={e => e.currentTarget.style.background = readOnly ? '#3b82f6' : '#ef4444'}
        >
          <Minimize2 size={13} /> {readOnly ? 'Close View' : 'Done'}
        </button>
      </div>

      <div className="im-fs-body">
        <div className="im-fs-sidebar">
          <div style={{ padding: '0 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <FileText size={13} color={readOnly ? '#3b82f6' : '#ef4444'} />
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#475569' }}>Field Info</span>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {block.desc || block.placeholder || 'No description set.'}
            </div>
          </div>

          <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 10, color: '#334155', lineHeight: 1.7 }}>
              <div style={{ marginBottom: 4, fontWeight: 700, color: '#475569' }}>Tips</div>
              {readOnly ? (
                <div>â¢ Highlight text to comment</div>
              ) : (
                <>
                  <div>â¢ Use âB / Ctrl+B for bold</div>
                  <div>â¢ Use # heading for outline</div>
                </>
              )}
              <div>â¢ Press Escape to exit</div>
            </div>
          </div>
        </div>

        <div className="im-fs-canvas-wrap">
          <div className="im-fs-paper">
            <div ref={toolbarRef} style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '8px 24px', display: readOnly ? 'none' : 'block' }}>
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

            <div className="im-fs-table-bar" style={{ 
              display: readOnly ? 'none' : 'flex', position: 'sticky', top: '58px', zIndex: 9, background: '#eff6ff'
            }}>
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
    display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color,
    fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: '3px 7px', borderRadius: 4,
    transition: 'background 0.15s',
  };
}

function escapeRegex(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findQuoteRange(quill, quote, targetOccurrenceIndex = 0) {
  if (!quill || !quote) return null;
  const text = quill.getText() || '';
  const trimmedQuote = quote.trim();
  if (!trimmedQuote) return null;

  const normalizedQuote = trimmedQuote.replace(/\s+/g, ' ');
  const pattern = escapeRegex(normalizedQuote).replace(/\s+/g, '\\s+');
  const regex = new RegExp(pattern, 'gi');

  let match;
  let currentOcc = 0;
  
  while ((match = regex.exec(text)) !== null) {
      if (currentOcc === targetOccurrenceIndex) {
          return { index: match.index, length: match[0].length };
      }
      currentOcc++;
  }
  
  const fallback = text.match(new RegExp(pattern, 'i'));
  if (fallback?.[0]) return { index: fallback.index, length: fallback[0].length };
  
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

// ââ MAIN COMPONENT âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export default function RichTextBlock({
  block, value, onChange, lockedBy, onFocus, onBlur, isDark = false,
}) {
  const editorRef        = useRef(null);
  const toolbarRef       = useRef(null);
  const quillInstance    = useRef(null);
  const fullscreenQuill  = useRef(null);
  const typingTimeout    = useRef(null);
  const pendingSelection = useRef(null);
  const hasUnsavedChanges = useRef(false);

  const [isFocused,  setIsFocused]  = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [targetCommentId, setTargetCommentId] = useState(null);
  const [targetCommentQuote, setTargetCommentQuote] = useState('');
  const [searchJumpTrigger, setSearchJumpTrigger] = useState(null);
  
  useEffect(() => {
    if (document.getElementById('print-mount-point')?.contains(editorRef.current)) {
      setIsPrinting(true);
    }
  }, []);
  const placeholderText = block.placeholder || block.desc || '';
  const usePlaceholderGuide = !!block.showPlaceholderAsGuide && !!placeholderText;
  const [hiddenGuides, setHiddenGuides] = useState({});
  const showPlaceholderGuide = usePlaceholderGuide && !hiddenGuides[block.id];
  const persistCommentMarkup = useCallback((quillRef) => {
    if (!onChange || !quillRef?.current) return;
    setTimeout(() => {
      if (quillRef.current) onChange(block.dataPath, quillRef.current.root.innerHTML);
    }, COMMENT_DOM_SETTLEMENT_DELAY_MS);
  }, [block.dataPath, onChange]);

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

  useEffect(() => {
    const handleJump = (e) => {
      const { dataPath, commentId, quote, blockId } = e.detail || {};
      if (blockId === block.id || (dataPath && dataPath.startsWith(block.dataPath))) {
        setTargetCommentId(commentId);
        setTargetCommentQuote(quote || '');
        setIsExpanded(true);
      } else {
        setIsExpanded(false); 
      }
    };
    window.addEventListener('im-jump-to-comment', handleJump);
    return () => window.removeEventListener('im-jump-to-comment', handleJump);
  }, [block.dataPath, block.id]);

  useEffect(() => {
    if (window.imPendingSearchJump) {
      const { dataPath, matchText, occurrenceIndex, blockId } = window.imPendingSearchJump;
      if (blockId === block.id || (dataPath && dataPath.startsWith(block.dataPath))) {
        setSearchJumpTrigger({ matchText, occurrenceIndex, timestamp: Date.now() });
        setIsExpanded(true);
        window.imPendingSearchJump = null; 
      }
    }

    const handleSearchJump = (e) => {
      const { dataPath, matchText, occurrenceIndex, blockId } = e.detail || {};
      if (blockId === block.id || (dataPath && dataPath.startsWith(block.dataPath))) {
        setSearchJumpTrigger({ matchText, occurrenceIndex, timestamp: Date.now() });
        setIsExpanded(true);
        window.imPendingSearchJump = null; 
      } else {
        setIsExpanded(false); 
      }
    };
    
    window.addEventListener('im-search-jump', handleSearchJump);
    return () => window.removeEventListener('im-search-jump', handleSearchJump);
  }, [block.dataPath, block.id]);

  useEffect(() => {
    const handleExternalCreate = (e) => {
      const detail = e.detail || {};
      const isTargetBlock = detail.dataPath === block.dataPath || detail.blockId === block.id;
      if (!isTargetBlock || !detail.commentId || !detail.quote) return;

      const payload = { commentId: detail.commentId, quote: detail.quote, status: 'open' };
      const appliedMain = ensureCommentHighlight(quillInstance.current, payload);
      const appliedFullscreen = ensureCommentHighlight(fullscreenQuill.current, payload);

      if (onChange && quillInstance.current && appliedMain) {
        persistCommentMarkup(quillInstance);
      } else if (onChange && fullscreenQuill.current && appliedFullscreen) {
        persistCommentMarkup(fullscreenQuill);
      }
    };

    window.addEventListener('im-create-comment', handleExternalCreate);
    return () => window.removeEventListener('im-create-comment', handleExternalCreate);
  }, [block.dataPath, block.id, onChange, persistCommentMarkup]);

  const showBubble = useCallback((rect, range, isFullscreen = false) => {
    const bubble = document.getElementById('im-comment-bubble');
    if (!bubble) return;
    pendingSelection.current = { range, isFullscreen };
    bubble.style.top  = `${Math.max(8, rect.top + window.scrollY - 44)}px`;
    bubble.style.left = `${Math.max(8, rect.left + window.scrollX + rect.width / 2 - 60)}px`;
    bubble.classList.add('visible');
  }, []);

  const hideBubble = useCallback(() => {
    document.getElementById('im-comment-bubble')?.classList.remove('visible');
    pendingSelection.current = null;
  }, []);

  const createComment = useCallback((selectionData) => {
    const { range, isFullscreen } = selectionData;
    const activeQuill = isFullscreen ? fullscreenQuill.current : quillInstance.current;
    
    if (!activeQuill || !range || range.length === 0) return;
    const quote = activeQuill.getText(range.index, range.length).replace(/\s+/g, ' ').trim();
    if (!quote) return;
    
    const commentId = `cmt_${crypto.randomUUID().split('-')[0]}`;
    // formatText works programmatically even if editor is strictly read-only!
    activeQuill.formatText(range.index, range.length, 'comment', { id: commentId, status: 'open' });
    
    window.dispatchEvent(new CustomEvent('im-open-comments-sidebar'));
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('im-create-comment', {
        detail: {
          commentId,
          blockId: block.id,
          dataPath: block.dataPath,
          contextLabel: block.label || 'General',
          quote
        }
      }));
      persistCommentMarkup({ current: activeQuill });
    });
  }, [block.dataPath, block.id, block.label, persistCommentMarkup]);

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

  useEffect(() => {
    if (!editorRef.current || !toolbarRef.current) return;
    const isNewInstance = !quillInstance.current;

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
          this.quill.insertText(range.index + 1, ' ', 'user');
          this.quill.setSelection(range.index + 2, 'silent');
          setTimeout(() => { if (onChange) onChange(block.dataPath, this.quill.root.innerHTML); }, 100);
        } catch (err) { console.error('Quill image upload failed:', err); }
      };
    }

    if (isNewInstance) {
      quillInstance.current = new Quill(editorRef.current, {
      theme: 'snow',
      placeholder: usePlaceholderGuide ? '' : (placeholderText || 'Start writingâ¦'),
      modules: {
        table: true,
        toolbar: { container: toolbarRef.current, handlers: { image: imageUploadHandler } },
        imageResize: { modules: ['Resize', 'DisplaySize'] },
        clipboard: { matchVisual: false },
      },
    });

    if (value) {
      quillInstance.current.root.innerHTML = value;
      if (String(value).replace(/<[^>]*>/g, '').trim().length > 0 || String(value).includes('<img') || String(value).includes('<table')) {
        quillInstance.current.root.classList.remove('ql-blank');
      }
    }

    // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // ââ NEW FIX: STRIP BACKGROUND/GREY MARKS, COLORS, & WIDTHS ââ
    quillInstance.current.clipboard.addMatcher(Node.ELEMENT_NODE, (node, delta) => {
      delta.ops.forEach(op => {
        if (op.attributes) {
          delete op.attributes.background; // Removes grey highlight
          delete op.attributes.color;      // Fixes invisible text in Dark Mode
          delete op.attributes.width;      // CRUSHES HIDDEN TABLE WIDTHS
          delete op.attributes.height;     // CRUSHES HIDDEN TABLE HEIGHTS
        }
      });
      return delta;
    });
    // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

    const handleMainDirectUpload = async (file, quill) => {
      if (!file || !file.type.startsWith('image/')) return;
      try {
        const path = `im-quill/${block.dataPath}/${Date.now()}-${file.name}`;
        const snap = await uploadBytes(storageRef(storage, path), file);
        const url  = await getDownloadURL(snap.ref);
        const range = quill.getSelection(true) || { index: quill.getLength() };
        quill.insertEmbed(range.index, 'image', url);
        quill.insertText(range.index + 1, ' ', 'user');
        quill.setSelection(range.index + 2, 'silent');
        setTimeout(() => { if (onChange) onChange(block.dataPath, quill.root.innerHTML); }, 100);
      } catch (err) { console.error('Image paste/drop upload failed:', err); }
    };

    quillInstance.current.root.addEventListener('paste', (e) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        const hasImage = Array.from(files).some(f => f.type.startsWith('image/'));
        if (hasImage) {
          e.preventDefault(); 
          Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) handleMainDirectUpload(file, quillInstance.current);
          });
        }
      }
    });

    // ââ TABLE PASTE FIX ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // Attached on the CONTAINER (ancestor of quill.root) in the CAPTURE phase â
    // see the matching comment in the fullscreen editor above for why this has
    // to be on an ancestor, in capture phase, rather than on quill.root itself.
    editorRef.current.addEventListener('paste', (e) => {
      const html = e.clipboardData?.getData('text/html');
      if (!html || !/<table/i.test(html)) return; // not a table paste, let it through untouched
      e.preventDefault();
      e.stopPropagation();
      const cleaned = normalizeWordTableCellsHTML(html);
      const range = quillInstance.current.getSelection(true) || { index: quillInstance.current.getLength() };
      quillInstance.current.clipboard.dangerouslyPasteHTML(range.index, cleaned, 'user');
    }, true); // capture: true is required

    quillInstance.current.root.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const hasImage = Array.from(files).some(f => f.type.startsWith('image/'));
        if (hasImage) {
          e.preventDefault(); 
          Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) handleMainDirectUpload(file, quillInstance.current);
          });
        }
      }
    });

    quillInstance.current.on('selection-change', (range) => {
      if (!range || range.length === 0) { setTimeout(() => hideBubble(), 150); return; }
      const nr = quillInstance.current.selection.getNativeRange();
      if (nr) showBubble(nr.native.getBoundingClientRect(), range, false); // false = main editor
    });

    quillInstance.current.root.addEventListener('click', (e) => {
      const span = e.target.closest('[data-comment-id]');
      if (!span) return;
      window.dispatchEvent(new CustomEvent('im-open-comments-sidebar'));
      window.dispatchEvent(new CustomEvent('im-open-comment', { detail: { commentId: span.getAttribute('data-comment-id') } }));
    });

    quillInstance.current.on('text-change', (delta, old, source) => {
      if (quillInstance.current.getText().trim().length > 0 || quillInstance.current.root.innerHTML.includes('<img') || quillInstance.current.root.innerHTML.includes('<table')) {
        quillInstance.current.root.classList.remove('ql-blank');
      } else {
        quillInstance.current.root.classList.add('ql-blank');
      }
      if (source !== 'user') return;
      hasUnsavedChanges.current = true; 
      
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(async () => {
        if (onChange && quillInstance.current) {
          await sweepBase64Images(quillInstance.current, block.dataPath);
          let rawHtml = quillInstance.current.root.innerHTML || '';
          
          if (rawHtml.includes('quill-image-resize-module')) {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = rawHtml;
              const junkOverlays = tempDiv.querySelectorAll('div[title="image-resize-module"]');
              junkOverlays.forEach(node => node.remove());
              rawHtml = tempDiv.innerHTML;
          }

          if (!rawHtml.includes('data:image/')) {
             onChange(block.dataPath, String(rawHtml));
             hasUnsavedChanges.current = false; 
          } else {
             console.warn("Base64 image still present, skipping save to protect Firebase.");
          }
        }
      }, 800);
    });

    quillInstance.current.root.addEventListener('focus', () => { setIsFocused(true); if (onFocus) onFocus(block.id); });
    
    quillInstance.current.root.addEventListener('blur',  () => {
      setTimeout(() => {
        if (!editorRef.current?.contains(document.activeElement)) {
          setIsFocused(false); 
          if (onBlur) onBlur(block.id);
          clearTimeout(typingTimeout.current);
          
          if (onChange && hasUnsavedChanges.current) {
            onChange(block.dataPath, quillInstance.current.root.innerHTML);
            hasUnsavedChanges.current = false;
          }
        }
      }, 150);
    });
    } // Close isNewInstance block

    const onCommentUpdate = (e) => {
      const { commentId, status } = e.detail;
      const spans = quillInstance.current.root.querySelectorAll(`[data-comment-id="${commentId}"]`);
      spans.forEach((span) => {
        if (status === 'resolved' || status === 'deleted') {
          const textNode = document.createTextNode(span.textContent);
          span.replaceWith(textNode);
        } else {
          span.setAttribute('data-comment-status', status);
          span.style.backgroundColor = 'rgba(245,158,11,0.22)';
          span.style.boxShadow = 'inset 0 -2px 0 0 rgba(245,158,11,0.75)';
        }
      });
      if (quillInstance.current) quillInstance.current.root.normalize(); 
      if (status === 'resolved' || status === 'deleted') {
        setTimeout(() => { if (onChange) onChange(block.dataPath, quillInstance.current.root.innerHTML); }, 50);
      }
    };
    window.addEventListener('im-comment-status-update', onCommentUpdate);
    return () => window.removeEventListener('im-comment-status-update', onCommentUpdate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!quillInstance.current || isExpanded) return;
    if (isFocused || hasUnsavedChanges.current) return;

    if (value !== quillInstance.current.root.innerHTML) {
      quillInstance.current.root.innerHTML = value || '';
      if (value && (String(value).replace(/<[^>]*>/g, '').trim().length > 0 || String(value).includes('<img') || String(value).includes('<table'))) {
        quillInstance.current.root.classList.remove('ql-blank');
      } else {
        quillInstance.current.root.classList.add('ql-blank');
      }
    }
  }, [value, isFocused, isExpanded]);

  useEffect(() => {
    if (!quillInstance.current) return;
    lockedBy ? quillInstance.current.disable() : quillInstance.current.enable();
  }, [lockedBy]);

  return (
    <BlockWrapper block={block} lockedBy={lockedBy} isDark={isDark} style={{ overflowAnchor: 'none' }}>
     
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

      <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden', background: t.bg, position: 'relative' }}>

        {!isPrinting && (
          <div 
            onClick={(e) => { 
              e.preventDefault(); 
              e.stopPropagation();
              setIsExpanded(true); 
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', inset: 0, zIndex: 10,
              pointerEvents: 'auto', 
              background: isDark ? 'rgba(13,17,23,0.7)' : 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(3px)', 
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
              cursor: 'pointer', transition: 'background 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(13,17,23,0.6)' : 'rgba(255,255,255,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(13,17,23,0.7)' : 'rgba(255,255,255,0.7)' }}
          >
            {lockedBy ? (
              <>
                <button
                  onClick={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation();
                    setIsExpanded(true); 
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 8, background: '#3b82f6', color: '#fff', border: 'none',
                    fontSize: 14, fontWeight: 700, boxShadow: '0 4px 14px rgba(59,130,246,0.3)', cursor: 'pointer',
                    pointerEvents: 'auto'
                  }}>
                  <Eye size={16} /> Read Full Document
                </button>
                <div style={{ marginTop: 8, fontSize: 11, color: t.textMuted, fontWeight: 600 }}>
                  {lockedBy === 'System' || lockedBy === 'STATUS_LOCK' 
                    ? 'Document is read-only based on task status' 
                    : `Locked by ${lockedBy?.email ? lockedBy.email.split('@')[0] : (typeof lockedBy === 'string' ? lockedBy : 'another user')}`}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation();
                    setIsExpanded(true); 
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 8, background: t.accent, color: '#fff', border: 'none',
                    fontSize: 14, fontWeight: 700, boxShadow: '0 4px 14px rgba(239,68,68,0.3)', cursor: 'pointer',
                    pointerEvents: 'auto'
                  }}>
                  <Maximize2 size={16} /> Expand to Edit
                </button>
                <div style={{ marginTop: 8, fontSize: 11, color: t.textMuted, fontWeight: 600 }}>Click anywhere to open editor</div>
              </>
            )}
          </div>
        )}

        <div ref={toolbarRef} style={{ display: 'none' }}>
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

        <div style={{ display: 'none', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '7px 12px', background: t.subBarBg, borderBottom: `1px solid ${t.toolbarBorder}` }}>
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
          <button onMouseDown={handleCommentClick} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            <MessageSquarePlus size={14} /> Comment
          </button>
          <button
            onMouseDown={e => { e.preventDefault(); setIsExpanded(true); }}
            title="Open fullscreen editor"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            <Maximize2 size={13} /> Expand
          </button>
        </div>

        {/* Table Management Bar */}
        <div className="im-fs-table-bar" style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: '6px', 
          padding: '8px 12px', 
          borderBottom: `1px solid ${t.border}`,
          position: 'sticky',
          top: 0,
          zIndex: 9,
          background: t.subBarBg 
        }}>
          <button onMouseDown={e => { e.preventDefault(); quillInstance.current?.getModule('table')?.insertTable(3,3); }} style={inlineBtn(t)}>
            <Table2 size={11} /> Insert Table
          </button>
          <div style={{ width: 1, height: 14, background: t.border, margin: '0 4px' }} />
          <button onMouseDown={e => { e.preventDefault(); quillInstance.current?.getModule('table')?.insertRowBelow(); }} style={inlineBtn(t)}>
            <Plus size={10} /> Row
          </button>
          <button onMouseDown={e => { e.preventDefault(); quillInstance.current?.getModule('table')?.insertColumnRight(); }} style={inlineBtn(t)}>
            <Plus size={10} /> Col
          </button>
          <div style={{ width: 1, height: 14, background: t.border, margin: '0 4px' }} />
          <button onMouseDown={e => { e.preventDefault(); quillInstance.current?.getModule('table')?.deleteRow(); }} style={inlineBtn(t, '#ef4444')}>
            <Trash2 size={10} /> Row
          </button>
          <button onMouseDown={e => { e.preventDefault(); quillInstance.current?.getModule('table')?.deleteColumn(); }} style={inlineBtn(t, '#ef4444')}>
            <Trash2 size={10} /> Col
          </button>
          <button onMouseDown={e => { e.preventDefault(); quillInstance.current?.getModule('table')?.deleteTable(); }} style={inlineBtn(t, '#ef4444')}>
            <X size={10} /> Table
          </button>
        </div>
        
        <div 
           ref={editorRef} 
           className="im-quill-canvas" 
           style={{ 
             color: t.text,
             position: 'relative',
             contain: 'layout paint'
           }} 
        />
      </div>

      <style>{`
        .ql-toolbar.ql-snow { border: none !important; }
        .ql-container.ql-snow { border: none !important; }
        .im-quill-canvas .ql-editor { 
          min-height: ${block.minHeight || '160px'}; 
          max-height: ${isPrinting ? 'none' : '250px'};
          overflow-y: auto; 
          color: ${t.text} !important; 
          padding: ${isPrinting ? '0' : '16px 20px'};
          overflow-wrap: break-word !important;
          word-break: break-word !important;
        }
        .im-quill-canvas .ql-editor.ql-blank::before { 
          color: ${t.textMuted} !important; 
          font-style: italic; 
          white-space: pre-wrap; 
          word-wrap: break-word;
        }      
        .ql-snow .ql-stroke { stroke: ${t.textMuted} !important; }
        .ql-snow .ql-fill   { fill:   ${t.textMuted} !important; }
        .ql-snow.ql-toolbar button:hover .ql-stroke,
        .ql-snow.ql-toolbar button.ql-active .ql-stroke { stroke: #ef4444 !important; }
        .ql-snow.ql-toolbar button:hover .ql-fill,
        .ql-snow.ql-toolbar button.ql-active .ql-fill   { fill: #ef4444 !important; }
        .ql-snow .ql-picker-label { color: ${t.textMuted} !important; }
        .ql-snow .ql-picker-options { background: ${t.toolbarBg} !important; border-color: ${t.border} !important; }
      `}</style>

      {isExpanded && (
        <FullscreenEditor
          block={block}
          value={value}
          onChange={onChange}
          onClose={() => {
            setIsExpanded(false);
          }}
          onFocus={onFocus}
          onBlur={onBlur}
          readOnly={!!lockedBy}
          targetCommentId={targetCommentId}
          targetCommentQuote={targetCommentQuote}
          searchJumpTrigger={searchJumpTrigger}
          onQuillReady={(instance) => { fullscreenQuill.current = instance; }}
          showBubble={showBubble}
          hideBubble={hideBubble}
        />
      )}

      <BubblePortal onComment={() => {
        const selectionData = pendingSelection.current;
        hideBubble();
        if (selectionData) createComment(selectionData);
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
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); onComment(); });
bubble.appendChild(btn);
    document.body.appendChild(bubble);
    return () => bubble.remove();
  }, [onComment]);
  return null;
}