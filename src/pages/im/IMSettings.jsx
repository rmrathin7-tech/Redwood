import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useThemePreference } from '../../hooks/useThemePreference.js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Save, Plus, Settings2, Type, AlignLeft,
  Image as ImageIcon, Table, Copy, Trash2, ArrowUp, ArrowDown,
  Info, Layers, PanelLeft, PanelRight, Grid3X3, X, AlignJustify,
  Sun, Moon, ToggleRight, CheckSquare, FileText, List, GitBranch, BarChart3, Upload, Download, Link
} from 'lucide-react';
import { db } from '../../firebase.js';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const BLOCK_TYPES = [
  { id: 'instruction',     icon: <Info size={15} />,         label: 'Instruction Note',   desc: 'Read-only guidance text' },
  { id: 'fixed-text',      icon: <AlignLeft size={15} />,    label: 'Fixed Text',         desc: 'Static text display block' },
  { id: 'text',            icon: <Type size={15} />,         label: 'Short Text',          desc: 'Single line input' },
  { id: 'textarea',        icon: <AlignLeft size={15} />,    label: 'Long Text',           desc: 'Multi-line text box' },
  { id: 'quill',           icon: <Layers size={15} />,       label: 'Rich Text Editor',    desc: 'Formatted text with toolbar' },
  { id: 'conditional-switch', icon: <GitBranch size={15} />, label: 'Conditional Switcher',desc: 'Multi-branching Logic' },
  { id: 'repeating-block-set',icon: <Copy size={15} />,      label: 'Repeating Block Set', desc: 'Group & repeat multiple blocks' },
  { id: 'chart',           icon: <BarChart3 size={15} />,    label: 'Data Chart',          desc: 'Interactive data chart (Bar, Line, Pie)' },
  { id: 'mixed',           icon: <AlignJustify size={15} />, label: 'Fill-in-the-Blanks',  desc: 'Template with inline inputs' },
  { id: 'image',           icon: <ImageIcon size={15} />,    label: 'Image Upload',        desc: 'Single or multiple images' },
  { id: 'file',            icon: <FileText size={15} />,     label: 'File Attachment',     desc: 'PDF, doc, or any file' },
  { id: 'boolean',         icon: <ToggleRight size={15} />,  label: 'Yes / No Toggle',     desc: 'Binary yes/no choice' },
  { id: 'compliance',      icon: <CheckSquare size={15} />,  label: 'Compliance Field',    desc: 'Yes / No / NA options' },
  { id: 'table',           icon: <Table size={15} />,        label: 'Smart Table',         desc: 'Fixed or dynamic table' },
  { id: 'repeating-group', icon: <Copy size={15} />,         label: 'Repeating Group',     desc: 'Founders, testimonials, awards…' },
  { id: 'list',            icon: <List size={15} />,         label: 'Bullet List',         desc: 'Editable list with auto S.No' },
  { id: 'fsa-link',        icon: <Link size={15} />,         label: 'FSA Link',            desc: 'Live financial dashboard link' },
];

const BLOCK_DEFAULTS = {
table: {
  cols: 2,
  numRows: 1,
  baseRowCount: 1,
  editableHeaders: true,
  hasTotalsRow: false,
  showSno: false,
  showColumnTotals: false,
  allowNA: false,
  allowAddRows: true,
  allowInsertRows: false,
  allowInsertCols: false,
  allowDeleteCols: true,
  allowRepeatTable: false,
  allowInstanceNames: false,
  protectTotalsRow: true,
  colHeaders: ['Column 1', 'Column 2'],
  rows: [],
  enableTableSubheading: false,
  tableSubheadingRichText: '',
},
chart: {
  title: 'Revenue by Quarter',
  chartType: 'bar',
  xAxisLabel: 'Quarter',
  series: ['Actual', 'Projected'],
  colors: ['3b82f6', '10b981'],
  showLegend: true,
  allowAddRows: true,
  baseRowCount: 1,
  pieSeriesIndex: 0,
  pieColors: ['3b82f6', '10b981', 'f59e0b', '8b5cf6', 'ec4899'],
},
  'conditional-switch': {
    triggerQuestion: 'Select format to proceed:',
    branches: [
      { id: 'branchA', label: 'Option A', blocks: [] },
      { id: 'branchB', label: 'Option B', blocks: [] }
    ]
  },
  'repeating-block-set': {
    addLabel: 'Add Set',
    blocks: [],
  },
  'repeating-group': {
    template: [
      { id: 'title', label: 'Name',        type: 'text'     },
      { id: 'desc',  label: 'Description', type: 'textarea' },
    ],
    addLabel: 'Add Entry',
    allowImage: false,
  },
  'fixed-text': { content: 'Enter fixed text...' },
  mixed:      { template: 'Example [text] and [number]', options: [] },
  boolean:    { options: ['Yes', 'No'] },
  compliance: { options: ['Yes', 'No', 'NA'] },
  currency:   { placeholder: '0', prefix: '₹' },
  percentage: { placeholder: '0', suffix: '%' },
  number:     { placeholder: '0' },
  list:       { allowReorder: true, autoSno: true },
image: {
  multiple: false,
  allowCaption: true,
  imageWidth: '100%',
  imageHeight: '180px',
  objectFit: 'cover',
},
  file:       { multiple: false },
  'fsa-link': { desc: 'Select a Financial Statement Analysis to display a live summary dashboard.' },
};

// ── ANTI-CURSOR-JUMP ENGINE ──────────────────────────────────────────────
// This prevents React from ripping the cursor to the end of the input when 
// dealing with heavy schema re-renders.
function DebouncedInput({ value, onChange, placeholder, style, readOnly }) {
  const [localVal, setLocalVal] = useState(value || '');
  const timerRef = useRef(null);

  useEffect(() => { setLocalVal(value || ''); }, [value]);

  const handleChange = (e) => {
    const newVal = e.target.value;
    setLocalVal(newVal); // Instant UI update protects the cursor
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(newVal), 300); // Background sync
  };

  return (
    <input 
      style={style} type="text" value={localVal} 
      placeholder={placeholder} onChange={handleChange} readOnly={readOnly} 
    />
  );
}

export default function IMSettings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const imId = searchParams.get('im');
  const mode = searchParams.get('mode') || 'master'; // <-- NEW: Catch the routing mode
  const [sections, setSections] = useState([]);
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [theme, setTheme] = useThemePreference();
  const isDark = theme === 'dark';
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  
  const [showTableModal, setShowTableModal] = useState(false);
  const [activeCellRow, setActiveCellRow] = useState(0);
  const [activeCellCol, setActiveCellCol] = useState(0);
  const [matrixPath, setMatrixPath] = useState('root');

  const [inspectorTab, setInspectorTab] = useState('branchA');
  const fileInputRef = useRef(null);
  // Tailor Template overlay - lets the dossier schema editor show which sections
  // were excluded/renamed via the quick in-workspace "Tailor Template" modal,
  // so editing structure here doesn't silently conflict with those choices.
  const [tailorOverlay, setTailorOverlay] = useState({ excludedSections: [], customNames: {} });

  useEffect(() => {
    const loadSchema = async () => {
      // 1. If in Dossier Mode, check if a local schema already exists
      if (mode === 'dossier' && imId) {
        const imSnap = await getDoc(doc(db, 'investment-memos', imId));
        // Capture the Tailor Template overlay regardless of whether a dossierSchema
        // exists yet, so the editor can show "excluded" / "renamed" continuity.
        if (imSnap.exists()) {
          setTailorOverlay({
            excludedSections: imSnap.data().excludedSections || [],
            customNames: imSnap.data().customNames || {},
          });
        }
        if (imSnap.exists() && imSnap.data().dossierSchema) {
          const data = imSnap.data().dossierSchema;
          setSections(data || []);
          if (data?.length > 0) setActiveSectionId(data[0].id);
          return; // Stop here if local schema is found
        }
      }
      
      // 2. Fallback to Master Schema (if mode is master, OR if it's the first time tailoring this dossier)
      const snap = await getDoc(doc(db, 'config', 'im-schema'));
      if (snap.exists()) {
        const data = snap.data();
        setSections(data.sections || []);
        if (data.sections?.length > 0) setActiveSectionId(data.sections[0].id);
      }
    };
    loadSchema();
  }, [mode, imId]);

  // Title Cleaner Helper (Removes hardcoded "1." from DB titles)
  const cleanTitle = (text) => {
    if (!text) return '';
    return text.replace(/^([0-9]+\.)+\s*/, '');
  };

  // ── DYNAMIC NUMBERING ENGINE ──
  const sectionNumberMap = useMemo(() => {
    const map = {};
    let parentCounter = 1;
    const parents = sections.filter(s => !s.parentId).sort((a,b) => (a.order||0) - (b.order||0));
    
    parents.forEach(p => {
      map[p.id] = `${parentCounter}`;
      let childCounter = 1;
      const children = sections.filter(s => s.parentId === p.id).sort((a,b) => (a.order||0) - (b.order||0));
      
      children.forEach(c => {
        map[c.id] = `${parentCounter}.${childCounter}`;
        childCounter++;
      });
      parentCounter++;
    });
    return map;
  }, [sections]);

  const generateId = () => crypto.randomUUID().split('-')[0];

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sections, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `im_schema_${projectId || 'export'}.json`);
    dlAnchorElem.click();
  };

  const handleImportJSON = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (Array.isArray(imported)) {
          setSections(imported);
          setActiveBlockId(null);
          if (imported.length > 0) setActiveSectionId(imported[0].id);
          setSaveMsg('✓ Imported');
          setTimeout(() => setSaveMsg(''), 3000);
        }
      } catch (err) {
        alert("Invalid JSON file. Please ensure it's a valid schema export.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddSection = (parentId = null) => {
    const id = generateId();
    const safeParentId = typeof parentId === 'string' ? parentId : null;
    const newSection = {
      id, parentId: safeParentId, heading: safeParentId ? 'New Subsection' : 'New Section', navLabel: safeParentId ? 'New Subsection' : 'New Section',
      key: `sec_${id}`, order: sections.length, blocks: [],
    };
    setSections([...sections, newSection]);
    setActiveSectionId(newSection.id);
    setActiveBlockId(null);
    setLeftPanelOpen(true);
  };

  const deleteSection = (sectionId) => {
    if (!window.confirm('Delete this section and all its contents?')) return;
    const remaining = sections.filter(s => s.id !== sectionId && s.parentId !== sectionId);
    setSections(remaining);
    const activeExists = remaining.some(s => s.id === activeSectionId);
    if (!activeExists) {
      setActiveSectionId(remaining[0]?.id || null);
      setActiveBlockId(null);
    }
  };

  // Clear a Tailor Template exclusion directly from the schema editor, so the
  // two customization surfaces (quick Tailor modal vs full schema editor) stay
  // in sync instead of silently disagreeing about what's excluded.
  const clearTailorExclusion = async (e, sectionId) => {
    e.stopPropagation();
    if (mode !== 'dossier' || !imId) return;
    const next = tailorOverlay.excludedSections.filter(id => id !== sectionId);
    setTailorOverlay(prev => ({ ...prev, excludedSections: next }));
    try {
      await updateDoc(doc(db, 'investment-memos', imId), { excludedSections: next });
    } catch { /* best-effort - local state already reflects the change */ }
  };

  // ── NEW: SECTION REORDERING LOGIC ──
  const moveSection = (sectionId, direction) => {
    setSections(prevSections => {
      const targetSection = prevSections.find(s => s.id === sectionId);
      if (!targetSection) return prevSections;

      // Get siblings (sections sharing the same parentId)
      const siblings = prevSections
        .filter(s => s.parentId === targetSection.parentId)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      const idx = siblings.findIndex(s => s.id === sectionId);
      if (idx === -1) return prevSections;

      // Prevent moving out of bounds
      if (direction === 'up' && idx === 0) return prevSections;
      if (direction === 'down' && idx === siblings.length - 1) return prevSections;

      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      
      // We create a new array to force re-render, and swap their orders
      const newSections = [...prevSections];
      
      const targetDbIdx = newSections.findIndex(s => s.id === siblings[idx].id);
      const swapDbIdx = newSections.findIndex(s => s.id === siblings[swapIdx].id);

      // Swap the physical order values so the sorting logic picks it up
      const tempOrder = newSections[targetDbIdx].order;
      newSections[targetDbIdx].order = newSections[swapDbIdx].order;
      newSections[swapDbIdx].order = tempOrder;

      return newSections;
    });
  };

  const updateActiveSection = (updates) =>
    setSections(sections.map(sec => sec.id === activeSectionId ? { ...sec, ...updates } : sec));

  const handleAddBlock = (typeId) => {
    if (!activeSectionId) return;
    const uid = generateId();
    const typeDef = BLOCK_TYPES.find(t => t.id === typeId);
    if (!typeDef) return;
    const section = sections.find(s => s.id === activeSectionId);
    const extra = BLOCK_DEFAULTS[typeId] || {};
    
    const seedTableRows = () => [{
      id: generateId(),
      cells: [
        { id: generateId(), cellType: 'input', inputType: 'text', colspan: 1, rowspan: 1 },
        { id: generateId(), cellType: 'input', inputType: 'text', colspan: 1, rowspan: 1 },
      ],
    }];

    let extraConfig = { ...extra };
    if (typeId === 'table') {
      extraConfig.rows = seedTableRows();
    }

    const newBlock = {
      id: uid, type: typeId, label: `New ${typeDef.label}`,
      desc: '', dataPath: `block_${uid}`, order: section.blocks.length,
      ...extraConfig,
    };

    setSections(sections.map(sec =>
      sec.id === activeSectionId ? { ...sec, blocks: [...sec.blocks, newBlock] } : sec
    ));
    setActiveBlockId(newBlock.id);
    setRightPanelOpen(true);
  };

  const updateActiveBlock = (updates) =>
    setSections(sections.map(sec => {
      if (sec.id !== activeSectionId) return sec;
      return { ...sec, blocks: sec.blocks.map(b => b.id === activeBlockId ? { ...b, ...updates } : b) };
    }));

  const replaceActiveBlock = (newBlock) => {
    setSections(sections.map(sec => {
      if (sec.id !== activeSectionId) return sec;
      return { ...sec, blocks: sec.blocks.map(b => b.id === activeBlockId ? newBlock : b) };
    }));
  };

  const moveBlock = (blockId, direction) =>
    setSections(sections.map(sec => {
      if (sec.id !== activeSectionId) return sec;
      const blocks = [...sec.blocks];
      const idx = blocks.findIndex(b => b.id === blockId);
      if (direction === 'up' && idx > 0) [blocks[idx - 1], blocks[idx]] = [blocks[idx], blocks[idx - 1]];
      else if (direction === 'down' && idx < blocks.length - 1) [blocks[idx + 1], blocks[idx]] = [blocks[idx], blocks[idx + 1]];
      blocks.forEach((b, i) => { b.order = i; });
      return { ...sec, blocks };
    }));

  const deleteBlock = (blockId) => {
    setSections(sections.map(sec =>
      sec.id === activeSectionId ? { ...sec, blocks: sec.blocks.filter(b => b.id !== blockId) } : sec
    ));
    if (activeBlockId === blockId) setActiveBlockId(null);
  };

  const duplicateBlock = (block) => {
    const uid = generateId();
    const copy = JSON.parse(JSON.stringify(block));
    copy.id = uid;
    copy.dataPath = `block_${uid}`;
    copy.label = `${copy.label} (copy)`;
    copy.order = block.order + 0.5;
    
    setSections(sections.map(sec => {
      if (sec.id !== activeSectionId) return sec;
      const blocks = [...sec.blocks, copy].sort((a, b) => a.order - b.order);
      blocks.forEach((b, i) => { b.order = i; });
      return { ...sec, blocks };
    }));
    setActiveBlockId(uid);
  };

  const moveBlockToSection = (blockId, targetSectionId) => {
    if (targetSectionId === activeSectionId) return;
    let movedBlock = null;
    
    setSections(prev => {
      // 1. Find and extract the block from current section
      const newSections = prev.map(sec => {
        if (sec.id === activeSectionId) {
          movedBlock = sec.blocks.find(b => b.id === blockId);
          return { ...sec, blocks: sec.blocks.filter(b => b.id !== blockId) };
        }
        return sec;
      });
      
      // 2. Add block to target section
      if (movedBlock) {
        return newSections.map(sec => {
          if (sec.id === targetSectionId) {
            const newBlocks = [...sec.blocks, { ...movedBlock, order: sec.blocks.length }];
            return { ...sec, blocks: newBlocks };
          }
          return sec;
        });
      }
      return prev;
    });
    
    // 3. Switch active section so user follows the block
    setActiveSectionId(targetSectionId);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMsg('');
    try {
      if (mode === 'dossier' && imId) {
        // Save ONLY to this specific IM Document
        await setDoc(doc(db, 'investment-memos', imId), { 
          dossierSchema: sections 
        }, { merge: true });
      } else {
        // Save to the Global Master Blueprint
        await setDoc(doc(db, 'config', 'im-schema'), { sections });
      }
      
      setSaveMsg('✓ Saved');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) {
      console.error(e);
      setSaveMsg('✗ Save failed');
    }
    setIsSaving(false);
  };

  const activeSection  = sections.find(s => s.id === activeSectionId);
  const activeBlock    = activeSection?.blocks.find(b => b.id === activeBlockId);

  const getNestedData = (obj, path) => {
    if (!path || path === 'root') return obj;
    const keys = path.startsWith('root.') ? path.replace('root.', '').split('.') : path.split('.');
    return keys.reduce((o, k) => (o || {})[k], obj);
  };

  const setNestedData = (obj, path, updates) => {
    if (!path || path === 'root') return { ...obj, ...updates };
    const newObj = JSON.parse(JSON.stringify(obj));
    const keys = path.startsWith('root.') ? path.replace('root.', '').split('.') : path.split('.');
    let cur = newObj;
    for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
    cur[keys[keys.length - 1]] = { ...cur[keys[keys.length - 1]], ...updates };
    return newObj;
  };

  const activeContextData = activeBlock ? getNestedData(activeBlock, matrixPath) : null;
  const activeCellData = activeContextData?.rows?.[activeCellRow]?.cells?.[activeCellCol];

  const updateTableCell = (keyOrUpdates, value) => {
    const rows = activeContextData?.rows;
    if (!rows) return;
    
    const updates = typeof keyOrUpdates === 'object' ? keyOrUpdates : { [keyOrUpdates]: value };

    const newRows = rows.map((row, r) =>
      r === activeCellRow
        ? { ...row, cells: row.cells.map((cell, c) => c === activeCellCol ? { ...cell, ...updates } : cell) }
        : row
    );
    const newBlock = setNestedData(activeBlock, matrixPath, { rows: newRows });
    replaceActiveBlock(newBlock);
  };

  const adjustMatrixDimensions = (pathPrefix, newCols, newRows, baseConfig, onChangeConfig) => {
    let currentRows = [...(baseConfig.rows || [])];
    while (currentRows.length < newRows) {
      currentRows.push({
        id: generateId(),
        cells: Array.from({ length: newCols }, () => ({ id: generateId(), cellType: 'input', inputType: 'text', colspan: 1, rowspan: 1 })),
      });
    }
    currentRows = currentRows.slice(0, newRows);
    currentRows = currentRows.map(row => {
      let cells = [...(row.cells || [])];
      while (cells.length < newCols) cells.push({ id: generateId(), cellType: 'input', inputType: 'text', colspan: 1, rowspan: 1 });
      cells = cells.slice(0, newCols);
      return { ...row, cells };
    });
    let headers = [...(baseConfig.colHeaders || [])];
    while (headers.length < newCols) headers.push(`Col ${headers.length + 1}`);
    headers = headers.slice(0, newCols);
    
    onChangeConfig({ cols: newCols, numRows: newRows, baseRowCount: newRows, rows: currentRows, colHeaders: headers });
  };

  const T = {
    bg:            isDark ? '#04060a'                : '#f8fafc',
    text:          isDark ? '#e2e8f0'                : '#0f172a',
    panelBg:       isDark ? 'rgba(10,14,24,0.7)'     : 'rgba(255,255,255,0.95)',
    headerBg:      isDark ? 'rgba(10,14,24,0.95)'    : 'rgba(255,255,255,0.95)',
    border:        isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)',
    inputBg:       isDark ? 'rgba(0,0,0,0.35)'       : '#ffffff',
    selectBg:      isDark ? '#1e293b'                : '#ffffff',
    mutedText:     isDark ? '#94a3b8'                : '#64748b',
    primary:       isDark ? '#00f0ff'                : '#0ea5e9',
    primaryLight:  isDark ? 'rgba(0,240,255,0.08)'   : 'rgba(14,165,233,0.08)',
    primaryBorder: isDark ? 'rgba(0,240,255,0.25)'   : 'rgba(14,165,233,0.3)',
    danger:        '#ef4444',
    surface2:      isDark ? 'rgba(255,255,255,0.03)' : '#f1f5f9',
  };

  const inp = {
    width: '100%', background: T.inputBg, border: `1px solid ${T.border}`,
    color: T.text, padding: '8px 12px', borderRadius: '6px',
    fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const lbl = {
    display: 'block', fontSize: '0.72rem', fontWeight: 700,
    color: T.mutedText, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px',
  };

  const renderTableConfigUI = (baseConfig, onChangeConfig, pathPrefix) => {
    return (
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: T.primary, textTransform: 'uppercase', letterSpacing: '1px' }}>
          Table Configuration
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Columns</label>
            <input
              style={inp} type="number" min={1} max={10}
              value={baseConfig.cols ?? 2}
              onChange={e => {
                const raw = e.target.value;
                if (raw === '') return onChangeConfig({ cols: '' });
                const cols = Math.max(1, Math.min(10, Number(raw)));
                const rows = baseConfig.baseRowCount || baseConfig.numRows || 1;
                adjustMatrixDimensions(pathPrefix, cols, rows, baseConfig, onChangeConfig);
              }}
              onBlur={e => {
                const cols = Math.max(1, Number(e.target.value) || 1);
                const rows = baseConfig.baseRowCount || baseConfig.numRows || 1;
                adjustMatrixDimensions(pathPrefix, cols, rows, baseConfig, onChangeConfig);
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Base Rows</label>
            <input
              style={inp} type="number" min={1} max={50}
              value={baseConfig.baseRowCount ?? baseConfig.numRows ?? 1}
              onChange={e => {
                const raw = e.target.value;
                if (raw === '') return onChangeConfig({ baseRowCount: '', numRows: '' });
                const count = Math.max(1, Math.min(50, Number(raw)));
                adjustMatrixDimensions(pathPrefix, baseConfig.cols || 2, count, baseConfig, onChangeConfig);
              }}
              onBlur={e => {
                const count = Math.max(1, Number(e.target.value) || 1);
                adjustMatrixDimensions(pathPrefix, baseConfig.cols || 2, count, baseConfig, onChangeConfig);
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ ...lbl, color: T.primary }}>Options</label>
          {[
            { key: 'showSno',              label: 'Show S.No column' },
            { key: 'allowAddRows',         label: 'Allow adding rows',              defaultTrue: true },
            { key: 'allowInsertRows',      label: 'Allow inserting rows in between' },
            { key: 'allowInsertCols',      label: 'Allow inserting columns in between' },
            { key: 'allowDeleteCols',      label: 'Allow deleting columns',         defaultTrue: true },
            { key: 'allowRepeatTable',     label: 'Allow repeating table (empty copy)' },
            { key: 'hasTotalsRow',         label: 'Show totals row' },
            { key: 'showColumnTotals',     label: 'Auto-calc column totals' },
            { key: 'editableHeaders',      label: 'Allow editing headers in workspace' },
            { key: 'allowNA',              label: 'Add NA option in select cells' },
            { key: 'allowAddSideHeadings', label: 'Allow side headings between rows' },
            { key: 'allowInstanceNames',   label: 'Allow per-copy subheading input' },
          ].map(opt => {
            const isChecked = opt.defaultTrue ? baseConfig[opt.key] !== false : !!baseConfig[opt.key];
            return (
              <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: T.text }}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={e => onChangeConfig({ [opt.key]: e.target.checked })}
                />
                {opt.label}
              </label>
            );
          })}
        </div>

        <div style={{ marginTop: '12px', marginBottom: '8px' }}>
          {baseConfig.enableTableSubheading || baseConfig.tableSubheadingRichText ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: T.surface2, padding: '12px', borderRadius: '8px', border: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ ...lbl, color: T.primary, margin: 0 }}>Table Subheading (Supports Tags)</label>
                <button
                  onClick={() => onChangeConfig({ enableTableSubheading: false, tableSubheadingRichText: '' })}
                  style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', padding: '0 4px', display: 'flex', alignItems: 'center' }}
                  title="Remove Subheading"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <textarea
                style={{ ...inp, minHeight: '86px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                value={baseConfig.tableSubheadingRichText || ''}
                onChange={e => onChangeConfig({ tableSubheadingRichText: e.target.value })}
                placeholder="e.g. As of [date], the [text:Company] reported [currency:Revenue]..."
              />
              <div style={{ fontSize: '0.65rem', color: T.mutedText, marginTop: '2px' }}>
                Type <strong style={{color: T.text}}>{"[text]"}</strong>, <strong style={{color: T.text}}>{"[date]"}</strong>, <strong style={{color: T.text}}>{"[number]"}</strong>, or <strong style={{color: T.text}}>{"[currency]"}</strong> to create inline inputs.
              </div>
            </div>
          ) : (
            <button
              onClick={() => onChangeConfig({ enableTableSubheading: true })}
              style={{
                background: T.surface2, border: `1px dashed ${T.border}`, color: T.mutedText,
                padding: '8px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer',
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.primaryBorder; e.currentTarget.style.color = T.primary; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.mutedText; }}
            >
              <Plus size={14} /> Add Table Subheading
            </button>
          )}
        </div>
        <div style={{ marginTop: '4px', marginBottom: '4px' }}>
          <label style={{ ...lbl, color: T.text }}>Configure Headers & Widths</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(baseConfig.colHeaders || []).map((headerText, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: T.mutedText, width: '35px', flexShrink: 0 }}>
                  Col {idx + 1}
                </span>
                <input
                  style={{ ...inp, flex: 2 }} type="text" value={headerText} placeholder={`Column ${idx + 1}`}
                  onChange={e => {
                    const newHeaders = [...(baseConfig.colHeaders || [])];
                    newHeaders[idx] = e.target.value;
                    onChangeConfig({ colHeaders: newHeaders });
                  }}
                />
                <input
                  style={{ ...inp, flex: 1 }} type="text" value={baseConfig.colWidths?.[idx] || ''} placeholder="Width (e.g. 30%, 150px)"
                  onChange={e => {
                    const newWidths = [...(baseConfig.colWidths || [])];
                    newWidths[idx] = e.target.value;
                    onChangeConfig({ colWidths: newWidths });
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => {
          if (!activeBlockId) return;
          const targetCols = baseConfig.cols || 2;
          const targetRows = baseConfig.baseRowCount || baseConfig.numRows || 1;
          adjustMatrixDimensions(pathPrefix, targetCols, targetRows, baseConfig, onChangeConfig);
          setActiveCellRow(0);
          setActiveCellCol(0);
          setMatrixPath(pathPrefix);
          setShowTableModal(true);
        }}
          style={{
            marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px',
            background: 'none', border: `1px solid ${T.border}`, color: T.text,
            padding: '7px 10px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer',
            width: '100%', justifyContent: 'center',
          }}
        >
          <Grid3X3 size={14} /> Open Cell Matrix Designer
        </button>
      </div>
    );
  };

  const renderRepeatingGroupConfigUI = (baseConfig, onChangeConfig) => {
    const updateTemplateField = (fi, key, value) => {
      const tpl = [...(baseConfig.template || [])];
      tpl[fi] = { ...tpl[fi], [key]: value };
      onChangeConfig({ template: tpl });
    };

    return (
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: T.primary, textTransform: 'uppercase', letterSpacing: '1px' }}>
          Repeating Group Config
        </div>
        <div>
          <label style={lbl}>Add Button Label</label>
          <input style={inp} type="text" value={baseConfig.addLabel || 'Add Entry'} 
            onChange={e => onChangeConfig({ addLabel: e.target.value })} placeholder="e.g. Add Founder" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: T.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!baseConfig.allowImage} onChange={e => onChangeConfig({ allowImage: e.target.checked })} />
          Include image upload field
        </label>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ ...lbl, margin: 0 }}>Template Fields</label>
            <button onClick={() => {
                const uid = generateId();
                const tpl = [...(baseConfig.template || []), { id: uid, label: 'New Field', type: 'text' }];
                onChangeConfig({ template: tpl });
              }}
              style={{ background: T.primaryLight, border: `1px solid ${T.primaryBorder}`, color: T.primary, padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
              + Add Field
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(baseConfig.template || []).map((field, fi) => (
              <div key={field.id || fi} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '7px', padding: '10px' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <input style={{ ...inp, flex: 1 }} type="text" value={field.label || ''} onChange={e => updateTemplateField(fi, 'label', e.target.value)} placeholder="Field label" />
                  <select style={{ ...inp, width: '90px', flex: 'none', background: T.selectBg }} value={field.type || 'text'} onChange={e => updateTemplateField(fi, 'type', e.target.value)}>
                    <option value="text">Text</option>
                    <option value="textarea">Textarea</option>
                    <option value="image">Image</option>
                    <option value="file">File</option>
                    <option value="select">Select</option>
                    <option value="date">Date</option>
                    <option value="number">Number</option>
                    <option value="email">Email</option>
                    <option value="currency">Currency</option>
                    <option value="boolean">Yes/No</option>
                  </select>
                </div>

                {field.type === 'select' && (
                  <div style={{ marginBottom: '6px' }}>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                      <input
                        style={{ ...inp, flex: 1, fontSize: '0.75rem' }} type="text" id={`newTplOpt_${baseConfig.id}_${fi}`} placeholder="Type an option…"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = e.target.value.trim();
                            if (!val) return;
                            updateTemplateField(fi, 'options', [...(field.options || []), val]);
                            e.target.value = '';
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          const input = document.getElementById(`newTplOpt_${baseConfig.id}_${fi}`);
                          const val = input.value.trim();
                          if (!val) return;
                          updateTemplateField(fi, 'options', [...(field.options || []), val]);
                          input.value = '';
                        }}
                        style={{ background: T.primaryLight, border: `1px solid ${T.primaryBorder}`, color: T.primary, padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                        + Add
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {(field.options || []).map((opt, oi) => (
                        <div key={oi} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '4px 8px' }}>
                          <span style={{ fontSize: '0.75rem', color: T.text }}>{opt}</span>
                          <button onClick={() => updateTemplateField(fi, 'options', (field.options || []).filter((_, idx) => idx !== oi))}
                            style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', lineHeight: 1 }}>×</button>
                        </div>
                      ))}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: T.text, cursor: 'pointer', marginTop: '8px' }}>
                      <input type="checkbox" checked={!!field.allowCustom} onChange={e => updateTemplateField(fi, 'allowCustom', e.target.checked)} />
                      Allow custom additions
                    </label>
                  </div>
                )}

                <input style={{ ...inp, fontSize: '0.75rem', marginBottom: '6px' }} type="text"
                  value={field.placeholder || ''} onChange={e => updateTemplateField(fi, 'placeholder', e.target.value)} placeholder="Placeholder text (optional)" />
                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                  <button onClick={() => {
                    const tpl = [...(baseConfig.template || [])];
                    if (fi > 0) { [tpl[fi], tpl[fi-1]] = [tpl[fi-1], tpl[fi]]; onChangeConfig({ template: tpl }); }
                  }} style={{ background: 'none', border: 'none', color: T.mutedText, cursor: 'pointer', padding: '2px 4px' }}><ArrowUp size={12} /></button>
                  <button onClick={() => {
                    const tpl = [...(baseConfig.template || [])];
                    if (fi < tpl.length - 1) { [tpl[fi], tpl[fi+1]] = [tpl[fi+1], tpl[fi]]; onChangeConfig({ template: tpl }); }
                  }} style={{ background: 'none', border: 'none', color: T.mutedText, cursor: 'pointer', padding: '2px 4px' }}><ArrowDown size={12} /></button>
                  <button onClick={() => {
                    const tpl = (baseConfig.template || []).filter((_, i) => i !== fi);
                    onChangeConfig({ template: tpl });
                  }} style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', padding: '2px 4px' }}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderChartConfigUI = (baseConfig, onChangeConfig) => {
    return (
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: T.primary, textTransform: 'uppercase', letterSpacing: '1px' }}>
          Chart Configuration
        </div>
        
        <div>
          <label style={lbl}>Chart Type</label>
          <select style={{ ...inp, background: T.selectBg }} value={baseConfig.chartType || 'bar'} onChange={e => onChangeConfig({ chartType: e.target.value })}>
            <option value="bar">Bar Chart</option>
            <option value="line">Line Chart</option>
            <option value="area">Area Chart</option>
            <option value="pie">Pie Chart</option>
          </select>
        </div>

        <div>
          <label style={lbl}>Chart Title</label>
          <input style={inp} type="text" value={baseConfig.title || ''} onChange={e => onChangeConfig({ title: e.target.value })} placeholder="e.g. Revenue by Quarter" />
        </div>
        
        <div>
          <label style={lbl}>X-Axis Label</label>
          <input style={inp} type="text" value={baseConfig.xAxisLabel || ''} onChange={e => onChangeConfig({ xAxisLabel: e.target.value })} placeholder="e.g. Quarter or Category" />
        </div>

        <div>
          <label style={lbl}>Base Row Count</label>
          <input
            style={inp} type="number" min={1} max={50}
            value={baseConfig.baseRowCount ?? 1}
            onChange={e => onChangeConfig({ baseRowCount: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })}
          />
        </div>

        {baseConfig.chartType === 'pie' && (
          <div>
            <label style={lbl}>Pie Chart Series</label>
            <select
              style={{ ...inp, background: T.selectBg }}
              value={baseConfig.pieSeriesIndex ?? 0}
              onChange={e => onChangeConfig({ pieSeriesIndex: Number(e.target.value) })}
            >
              {(baseConfig.series || []).map((name, i) => (
                <option key={i} value={i}>{name || `Series ${i + 1}`}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label style={lbl}>Pre-set Row Labels (Categories)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(baseConfig.rowLabels || []).map((rName, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '6px' }}>
                <input style={{ ...inp, flex: 1 }} type="text" value={rName} onChange={e => {
                  const newLabels = [...(baseConfig.rowLabels || [])];
                  newLabels[idx] = e.target.value;
                  onChangeConfig({ rowLabels: newLabels });
                }} placeholder="Row Label (e.g. TAM)" />
                
                <button onClick={() => {
                  const newLabels = (baseConfig.rowLabels || []).filter((_, i) => i !== idx);
                  onChangeConfig({ rowLabels: newLabels });
                }} style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', padding: '0 4px' }}><Trash2 size={14} /></button>
              </div>
            ))}
            <button onClick={() => {
              const newLabels = [...(baseConfig.rowLabels || []), `Category ${(baseConfig.rowLabels || []).length + 1}`];
              onChangeConfig({ rowLabels: newLabels });
            }} style={{ background: T.surface2, border: `1px dashed ${T.border}`, color: T.mutedText, padding: '6px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', marginTop: '4px' }}>
              + Add Row Label
            </button>
          </div>
        </div>

        <div>
          <label style={lbl}>Data Series & Colors</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(baseConfig.series || []).map((sName, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '6px' }}>
                <input type="color" value={(baseConfig.colors || [])[idx] || '#3b82f6'} onChange={e => {
                  const newColors = [...(baseConfig.colors || [])];
                  newColors[idx] = e.target.value;
                  onChangeConfig({ colors: newColors });
                }} style={{ width: '32px', height: '32px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }} />
                
                <input style={{ ...inp, flex: 1 }} type="text" value={sName} onChange={e => {
                  const newSeries = [...(baseConfig.series || [])];
                  newSeries[idx] = e.target.value;
                  onChangeConfig({ series: newSeries });
                }} placeholder="Series Name (e.g. Actual)" />
                
                <button onClick={() => {
                  const newSeries = baseConfig.series.filter((_, i) => i !== idx);
                  const newColors = baseConfig.colors.filter((_, i) => i !== idx);
                  onChangeConfig({ series: newSeries, colors: newColors });
                }} style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', padding: '0 4px' }}><Trash2 size={14} /></button>
              </div>
            ))}
            <button onClick={() => {
              const newSeries = [...(baseConfig.series || []), `Series ${(baseConfig.series || []).length + 1}`];
              const newColors = [...(baseConfig.colors || []), '#8b5cf6'];
              onChangeConfig({ series: newSeries, colors: newColors });
            }} style={{ background: T.surface2, border: `1px dashed ${T.border}`, color: T.mutedText, padding: '6px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', marginTop: '4px' }}>
              + Add Series
            </button>
          </div>
        </div>

        {baseConfig.chartType === 'pie' && (
          <div>
            <label style={{ ...lbl, color: T.primary }}>Pie Slice Colors</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '6px' }}>
              {(baseConfig.pieColors || ['3b82f6', '10b981', 'f59e0b', '8b5cf6', 'ec4899']).map((hex, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    type="color" value={`#${hex}`}
                    onChange={e => {
                      const newPieColors = [...(baseConfig.pieColors || ['3b82f6', '10b981', 'f59e0b', '8b5cf6', 'ec4899'])];
                      newPieColors[idx] = e.target.value.replace('#', '');
                      onChangeConfig({ pieColors: newPieColors });
                    }}
                    style={{ width: '32px', height: '32px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: '0.78rem', color: T.mutedText }}>Slice {idx + 1}</span>
                  <button
                    onClick={() => {
                      const newPieColors = (baseConfig.pieColors || ['3b82f6', '10b981', 'f59e0b', '8b5cf6', 'ec4899']).filter((_, i) => i !== idx);
                      onChangeConfig({ pieColors: newPieColors });
                    }}
                    style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', padding: '0 4px' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const newPieColors = [...(baseConfig.pieColors || ['3b82f6', '10b981', 'f59e0b', '8b5cf6', 'ec4899']), '94a3b8'];
                onChangeConfig({ pieColors: newPieColors });
              }}
              style={{ background: T.surface2, border: `1px dashed ${T.border}`, color: T.mutedText, padding: '6px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', width: '100%' }}
            >
              + Add Slice Color
            </button>
          </div>
        )}  
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: T.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={baseConfig.showLegend !== false} onChange={e => onChangeConfig({ showLegend: e.target.checked })} />
            Show Legend
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: T.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={baseConfig.allowAddRows !== false} onChange={e => onChangeConfig({ allowAddRows: e.target.checked })} />
            Allow adding rows
          </label>
        </div>
      </div>
    );
  };

  const renderBlockSettings = (blockConfig, onChangeConfig, pathPrefix) => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Universal Instruction & Placeholder Routing */}
        {blockConfig.type === 'instruction' || blockConfig.type === 'fixed-text' ? (
          <div>
            <label style={{ ...lbl, color: T.primary }}>{blockConfig.type === 'fixed-text' ? 'Fixed Text Content' : 'Instruction Text'}</label>
            <textarea style={{ ...inp, resize: 'vertical', minHeight: '80px', lineHeight: 1.5 }}
              value={blockConfig.content || ''}
              onChange={e => onChangeConfig({ content: e.target.value })}
              placeholder={blockConfig.type === 'fixed-text' ? 'Type fixed text to display in workspace...' : 'Type the guidance text here...'} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <label style={lbl}>Placeholder / Description</label>
              <textarea style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} value={blockConfig.desc || ''} onChange={e => onChangeConfig({ desc: e.target.value })} rows={3} />
            </div>
            {['text', 'textarea', 'quill'].includes(blockConfig.type) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: T.text, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!blockConfig.showPlaceholderAsGuide} onChange={e => onChangeConfig({ showPlaceholderAsGuide: e.target.checked })} />
                Show placeholder as a guide in workspace
              </label>
            )}
          </div>
        )}

        {(blockConfig.type === 'boolean' || blockConfig.type === 'compliance') && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '16px' }}>
            <label style={{ ...lbl, color: T.primary }}>Options (comma separated)</label>
            <input style={inp} type="text"
              value={(blockConfig.options || []).join(', ')}
              onChange={e => onChangeConfig({ options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              placeholder="Yes, No, NA" />
          </div>
        )}

        {blockConfig.type === 'mixed' && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '16px' }}>
            <label style={{ ...lbl, color: T.primary }}>Template Blueprint</label>
            <textarea style={{ ...inp, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }}
              rows={4} value={blockConfig.template || ''}
              onChange={e => onChangeConfig({ template: e.target.value })}
              placeholder="e.g. Total [number] employees as of [date]" />
            <div style={{ fontSize: '0.68rem', color: T.mutedText, marginTop: '4px' }}>
              Tags: [text] [number] [date] [select] <br />
              Add placeholder: [text:Company name] [number:Revenue in ₹]
            </div>
          </div>
        )}

{blockConfig.type === 'image' && (
  <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
    <label style={{ ...lbl, color: T.primary }}>Image Options</label>

    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: T.text, cursor: 'pointer' }}>
      <input type="checkbox" checked={!!blockConfig.multiple} onChange={e => onChangeConfig({ multiple: e.target.checked })} />
      Allow multiple images
    </label>
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: T.text, cursor: 'pointer' }}>
      <input type="checkbox" checked={blockConfig.allowCaption !== false} onChange={e => onChangeConfig({ allowCaption: e.target.checked })} />
      Show caption / name field
    </label>

    <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, display: 'flex', gap: 10 }}>
      <div style={{ flex: 1 }}>
        <label style={lbl}>Display Width</label>
        <input
          style={inp}
          type="text"
          value={blockConfig.imageWidth || '100%'}
          onChange={e => onChangeConfig({ imageWidth: e.target.value })}
          placeholder="e.g. 100% or 300px"
        />
      </div>
      <div style={{ flex: 1 }}>
        <label style={lbl}>Display Height</label>
        <input
          style={inp}
          type="text"
          value={blockConfig.imageHeight || '180px'}
          onChange={e => onChangeConfig({ imageHeight: e.target.value })}
          placeholder="e.g. 180px or auto"
        />
      </div>
    </div>

    <div>
      <label style={lbl}>Image Fit</label>
      <select
        style={{ ...inp, background: T.selectBg }}
        value={blockConfig.objectFit || 'cover'}
        onChange={e => onChangeConfig({ objectFit: e.target.value })}
      >
        <option value="cover">Cover — crop to fill (default)</option>
        <option value="contain">Contain — letterbox, show full image</option>
        <option value="fill">Fill — stretch to fit</option>
      </select>
    </div>
  </div>
)}

        {blockConfig.type === 'file' && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '16px' }}>
            <label style={{ ...lbl, color: T.primary }}>File Options</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: T.text, cursor: 'pointer', marginTop: '6px' }}>
              <input type="checkbox" checked={!!blockConfig.multiple} onChange={e => onChangeConfig({ multiple: e.target.checked })} /> Allow multiple files
            </label>
            <div style={{ marginTop: '10px' }}>
              <label style={lbl}>Accepted file types (e.g. .pdf,.xlsx)</label>
              <input style={inp} type="text" value={blockConfig.accept || ''} onChange={e => onChangeConfig({ accept: e.target.value })} placeholder=".pdf,.xlsx,.docx" />
            </div>
          </div>
        )}

        {blockConfig.type === 'list' && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ ...lbl, color: T.primary }}>List Options</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: T.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!blockConfig.autoSno} onChange={e => onChangeConfig({ autoSno: e.target.checked })} /> Auto-number rows
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: T.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!blockConfig.allowReorder} onChange={e => onChangeConfig({ allowReorder: e.target.checked })} /> Allow drag-to-reorder
            </label>
          </div>
        )}

        {blockConfig.type === 'table' && renderTableConfigUI(blockConfig, onChangeConfig, pathPrefix)}
        {blockConfig.type === 'chart' && renderChartConfigUI(blockConfig, onChangeConfig)}
        {blockConfig.type === 'repeating-group' && renderRepeatingGroupConfigUI(blockConfig, onChangeConfig)}
        
        {blockConfig.type === 'repeating-block-set' && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '16px' }}>
            <label style={{ ...lbl, color: T.primary }}>Repeating Set Config</label>
            <label style={lbl}>Add Button Label</label>
            <input style={{...inp, marginBottom: '16px'}} value={blockConfig.addLabel || 'Add Set'} onChange={e => onChangeConfig({ addLabel: e.target.value })} />
            <label style={lbl}>Blocks in Set</label>
            {renderSubBlockList(blockConfig.blocks || [], (arr) => onChangeConfig({ blocks: arr }), `${pathPrefix}.blocks`)}
          </div>
        )}

        {blockConfig.type === 'conditional-switch' && (() => {
          const branches = blockConfig.branches || [
            { id: 'branchA', label: blockConfig.branchA_label || 'Option A', blocks: blockConfig.branchA_blocks || [] },
            { id: 'branchB', label: blockConfig.branchB_label || 'Option B', blocks: blockConfig.branchB_blocks || [] }
          ];

          const activeTab = branches.find(b => b.id === inspectorTab) ? inspectorTab : branches[0]?.id;
          const activeBranchIdx = branches.findIndex(b => b.id === activeTab);
          const activeBranch = branches[activeBranchIdx];

          return (
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '16px' }}>
              <label style={{ ...lbl, color: T.primary }}>Branching Logic</label>
              <label style={lbl}>Trigger Question</label>
              <input style={inp} type="text" value={blockConfig.triggerQuestion || ''} onChange={e => onChangeConfig({ triggerQuestion: e.target.value })} placeholder="e.g. Do you want to use a table or text?" />
              
              <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginTop: '14px', flexWrap: 'wrap', gap: '4px', paddingBottom: '8px' }}>
                {branches.map((b, i) => (
                  <button key={b.id} onClick={() => setInspectorTab(b.id)}
                    style={{
                      padding: '6px 12px', border: 'none', borderRadius: '4px',
                      background: activeTab === b.id ? T.primaryLight : 'transparent',
                      color: activeTab === b.id ? T.primary : T.mutedText,
                      fontWeight: activeTab === b.id ? 800 : 600, fontSize: '0.75rem', cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}>
                    {b.label || `Option ${i + 1}`}
                  </button>
                ))}
                <button onClick={() => {
                  const newId = `branch_${generateId()}`;
                  const newBranches = [...branches, { id: newId, label: 'New Option', blocks: [] }];
                  onChangeConfig({ branches: newBranches });
                  setInspectorTab(newId);
                }}
                  style={{ padding: '6px 10px', border: `1px dashed ${T.border}`, background: 'transparent', color: T.mutedText, borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Plus size={12}/> Add Option
                </button>
              </div>

              {activeBranch && (
                <div style={{ background: T.surface2, padding: '12px', borderRadius: '0 0 8px 8px', border: `1px solid ${T.border}`, borderTop: 'none', animation: 'imFadeIn 0.2s ease' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ ...lbl, color: T.primary, margin: 0 }}>Button Mapping</label>
                    {branches.length > 2 && (
                      <button onClick={() => {
                        const newBranches = branches.filter(b => b.id !== activeBranch.id);
                        onChangeConfig({ branches: newBranches });
                        setInspectorTab(newBranches[0]?.id);
                      }} style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                        <Trash2 size={10} /> Delete Option
                      </button>
                    )}
                  </div>
                  <input style={{ ...inp, marginBottom: '16px' }} type="text" value={activeBranch.label || ''} onChange={e => {
                    const newBranches = [...branches];
                    newBranches[activeBranchIdx] = { ...activeBranch, label: e.target.value };
                    onChangeConfig({ branches: newBranches });
                  }} placeholder="Button Label" />
                  <label style={lbl}>Sub-Blocks inside this option</label>
                  {renderSubBlockList(activeBranch.blocks || [], (arr) => {
                    const newBranches = [...branches];
                    newBranches[activeBranchIdx] = { ...activeBranch, blocks: arr };
                    onChangeConfig({ branches: newBranches });
                  }, `${pathPrefix}.branches.${activeBranchIdx}.blocks`)}
                </div>
              )}
            </div>
          );
        })()}

      </div>
    );
  };

  const renderSubBlockList = (blocksArray, onChangeArray, pathPrefix) => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {blocksArray.map((sb, idx) => (
          <div key={sb.id} style={{ padding: '12px', background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: '8px', borderLeft: `3px solid ${T.primary}` }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <select style={{ ...inp, flex: 1, fontWeight: 700 }} value={sb.type} onChange={e => {
                const next = [...blocksArray];
                const tDef = BLOCK_TYPES.find(t => t.id === e.target.value);
                next[idx] = { ...sb, type: e.target.value, label: `New ${tDef.label}`, ...(BLOCK_DEFAULTS[e.target.value] || {}) };
                onChangeArray(next);
              }}>
                {BLOCK_TYPES.filter(t => t.id !== 'repeating-block-set' && t.id !== 'conditional-switch').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <button onClick={() => onChangeArray(blocksArray.filter((_, i) => i !== idx))}
                style={{ background: 'rgba(239,68,68,0.1)', border: 'none', color: T.danger, cursor: 'pointer', padding: '0 8px', borderRadius: '4px' }}>
                <Trash2 size={15}/>
              </button>
            </div>
            
            <input style={{ ...inp, marginBottom: '8px' }} value={sb.label || ''} onChange={e => {
              const next = [...blocksArray]; next[idx] = { ...next[idx], label: e.target.value }; onChangeArray(next);
            }} placeholder="Block Label" />

            <input style={{ ...inp, marginBottom: '12px', fontFamily: 'monospace', fontSize: '0.75rem', color: T.textMuted }} value={sb.dataPath || ''} onChange={e => {
              const next = [...blocksArray]; next[idx] = { ...next[idx], dataPath: e.target.value }; onChangeArray(next);
            }} placeholder="data_path_namespace" />

            {renderBlockSettings(sb, (updates) => {
              const next = [...blocksArray];
              next[idx] = { ...next[idx], ...updates };
              onChangeArray(next);
            }, `${pathPrefix}.${idx}`)}
          </div>
        ))}

        <button onClick={() => {
          const uid = generateId();
          onChangeArray([...blocksArray, { id: uid, type: 'text', label: 'New Text Block', dataPath: `sub_${uid}` }]);
        }} style={{ background: T.primaryLight, color: T.primary, border: `1px dashed ${T.primaryBorder}`, padding: '10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <Plus size={14} /> Add Sub-Block
        </button>
      </div>
    );
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: T.bg, color: T.text, fontFamily: '"Inter", sans-serif', overflow: 'hidden' }}>

      <header style={{ height: '60px', flexShrink: 0, background: T.headerBg, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => { if (projectId && imId) navigate(`/im?project=${projectId}&im=${imId}`); else navigate('/module-hub'); }}
            style={{ background: 'none', border: 'none', color: T.mutedText, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
            <ArrowLeft size={15} /> Exit
          </button>
          <div style={{ width: 1, height: 20, background: T.border }} />
          <h1 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: mode === 'dossier' ? '#f59e0b' : T.primary, letterSpacing: '1px' }}>
            {mode === 'dossier' ? 'LOCAL DOSSIER SCHEMA' : 'MASTER SCHEMA BUILDER'}
          </h1>
          <button
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
            style={{ background: leftPanelOpen ? T.primaryLight : 'none', border: `1px solid ${leftPanelOpen ? T.primaryBorder : T.border}`, color: leftPanelOpen ? T.primary : T.mutedText, padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem' }}>
            <PanelLeft size={13} /> {leftPanelOpen ? 'Hide' : 'Structure'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {saveMsg && <span style={{ fontSize: '0.8rem', color: saveMsg.startsWith('✓') ? '#10b981' : T.danger, fontWeight: 700 }}>{saveMsg}</span>}
          
          <button onClick={() => setTheme(isDark ? 'light' : 'dark')} style={{ background: 'none', border: 'none', color: T.mutedText, cursor: 'pointer', padding: '5px' }}>
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button onClick={() => setRightPanelOpen(!rightPanelOpen)}
            style={{ background: rightPanelOpen ? T.primaryLight : 'none', border: `1px solid ${rightPanelOpen ? T.primaryBorder : T.border}`, color: rightPanelOpen ? T.primary : T.mutedText, padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem' }}>
            <PanelRight size={13} /> {rightPanelOpen ? 'Hide' : 'Inspector'}
          </button>
          
          <div style={{ width: 1, height: 16, background: T.border, margin: '0 4px' }} />

          <input type="file" ref={fileInputRef} accept=".json" onChange={handleImportJSON} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} style={{ background: 'none', border: `1px solid ${T.border}`, color: T.textMuted, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Upload size={13} /> Import JSON
          </button>
          <button onClick={handleExportJSON} style={{ background: 'none', border: `1px solid ${T.border}`, color: T.textMuted, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Download size={13} /> Export JSON
          </button>

          <button onClick={() => handleAddSection(null)}
            style={{ background: T.surface2, border: `1px dashed ${T.border}`, color: T.text, padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> Add Section
          </button>
          <button onClick={handleSave} disabled={isSaving}
            style={{ background: T.primary, border: 'none', color: isDark ? '#000' : '#fff', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', opacity: isSaving ? 0.7 : 1 }}>
            <Save size={14} /> {isSaving ? 'Saving…' : 'Save Schema'}
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        <aside style={{ width: leftPanelOpen ? '240px' : '0px', opacity: leftPanelOpen ? 1 : 0, background: T.panelBg, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', transition: 'all 0.25s', flexShrink: 0, overflow: 'hidden' }}>
          <div style={{ width: '240px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px', fontSize: '0.7rem', fontWeight: 800, color: T.mutedText, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: `1px solid ${T.border}` }}>
              Document Sections
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
              {(() => {
                const parentSections = sections.filter(s => !s.parentId).sort((a,b) => (a.order||0) - (b.order||0));
                if (sections.length === 0) return (
                  <div style={{ color: T.mutedText, fontSize: '0.8rem', padding: '20px 12px', textAlign: 'center' }}>
                    No sections yet. Click "Add Section" above.
                  </div>
                );
                return parentSections.map(sec => {
                  const children = sections.filter(s => s.parentId === sec.id).sort((a,b) => (a.order||0) - (b.order||0));
                  const isActiveParent = activeSectionId === sec.id;
                  const secNum = sectionNumberMap[sec.id]; // Dynamic Num
                  const isExcludedByTailor = tailorOverlay.excludedSections.includes(sec.id);
                  const tailorCustomName = tailorOverlay.customNames[sec.id];
                  return (
                    <React.Fragment key={sec.id}>
                      <div
                        onClick={() => { setActiveSectionId(sec.id); setActiveBlockId(null); }}
                        style={{ padding: '10px 12px', marginBottom: '4px', borderRadius: '7px', cursor: 'pointer', background: isActiveParent ? T.primaryLight : 'transparent', border: `1px solid ${isActiveParent ? T.primaryBorder : 'transparent'}`, color: isActiveParent ? T.primary : T.mutedText, display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.15s', opacity: isExcludedByTailor ? 0.5 : 1 }}
                        onMouseEnter={e => { if (!isActiveParent) e.currentTarget.style.background = T.surface2; }}
                        onMouseLeave={e => { if (!isActiveParent) e.currentTarget.style.background = 'transparent'; }}>
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isExcludedByTailor ? 'line-through' : 'none' }}>
                            <span style={{color: T.primary, marginRight: '6px', fontWeight: 800}}>{secNum}.</span>
                            {cleanTitle(sec.heading || sec.navLabel || 'Untitled Section')}
                          </div>
                          {tailorCustomName && (
                            <div style={{ fontSize: '0.65rem', color: '#f59e0b', marginTop: '2px', marginLeft: '16px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              ✎ Tailored → "{tailorCustomName}"
                            </div>
                          )}
                          {isExcludedByTailor && (
                            <div
                              onClick={(e) => clearTailorExclusion(e, sec.id)}
                              title="Click to un-exclude this section"
                              style={{ fontSize: '0.65rem', color: '#ef4444', marginTop: '2px', marginLeft: '16px', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                            >
                              ⊘ Excluded via Tailor Template (click to restore)
                            </div>
                          )}
                          <div style={{ fontSize: '0.68rem', color: T.mutedText, marginTop: '2px', marginLeft: '16px' }}>{sec.blocks?.length || 0} blocks</div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          
                          {/* NEW: REORDER BUTTONS FOR PARENT SECTIONS */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginRight: '2px' }}>
                            <button onClick={e => { e.stopPropagation(); moveSection(sec.id, 'up'); }} style={{ background: 'none', border: 'none', color: T.mutedText, cursor: 'pointer', padding: '0px' }}>
                              <ArrowUp size={11} />
                            </button>
                            <button onClick={e => { e.stopPropagation(); moveSection(sec.id, 'down'); }} style={{ background: 'none', border: 'none', color: T.mutedText, cursor: 'pointer', padding: '0px' }}>
                              <ArrowDown size={11} />
                            </button>
                          </div>

                          <button onClick={e => { e.stopPropagation(); handleAddSection(sec.id); }} title="Add Subsection"
                            style={{ background: 'none', border: 'none', color: T.primary, cursor: 'pointer', opacity: 0.8, padding: '2px' }}>
                            <Plus size={14} />
                          </button>
                          <button onClick={e => { e.stopPropagation(); deleteSection(sec.id); }} title="Delete Section"
                            style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', opacity: 0.6, padding: '2px', flexShrink: 0 }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      {children.map(child => {
                        const isActiveChild = activeSectionId === child.id;
                        const childNum = sectionNumberMap[child.id]; // Dynamic Num
                        const childExcluded = tailorOverlay.excludedSections.includes(child.id);
                        const childCustomName = tailorOverlay.customNames[child.id];
                        return (
                          <div
                            key={child.id}
                            onClick={() => { setActiveSectionId(child.id); setActiveBlockId(null); }}
                            style={{ padding: '8px 10px 8px 16px', margin: '0 0 4px 12px', borderRadius: '0 7px 7px 0', borderLeft: `2px solid ${isActiveChild ? T.primary : T.border}`, cursor: 'pointer', background: isActiveChild ? T.primaryLight : 'transparent', color: isActiveChild ? T.primary : T.mutedText, display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.15s', opacity: childExcluded ? 0.5 : 1 }}
                            onMouseEnter={e => { if (!isActiveChild) e.currentTarget.style.background = T.surface2; }}
                            onMouseLeave={e => { if (!isActiveChild) e.currentTarget.style.background = 'transparent'; }}>
                            <div style={{ overflow: 'hidden' }}>
                              <div style={{ fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: childExcluded ? 'line-through' : 'none' }}>
                                <span style={{color: T.primary, marginRight: '6px', fontWeight: 800}}>{childNum}.</span>
                                {cleanTitle(child.heading || child.navLabel || 'Untitled Subsection')}
                              </div>
                              {childCustomName && (
                                <div style={{ fontSize: '0.62rem', color: '#f59e0b', marginTop: '2px', marginLeft: '22px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  ✎ Tailored → "{childCustomName}"
                                </div>
                              )}
                              {childExcluded && (
                                <div
                                  onClick={(e) => clearTailorExclusion(e, child.id)}
                                  title="Click to un-exclude this section"
                                  style={{ fontSize: '0.62rem', color: '#ef4444', marginTop: '2px', marginLeft: '22px', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                                >
                                  ⊘ Excluded via Tailor Template (click to restore)
                                </div>
                              )}
                              <div style={{ fontSize: '0.65rem', color: T.mutedText, marginTop: '2px', marginLeft: '22px' }}>{child.blocks?.length || 0} blocks</div>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              
                              {/* NEW: REORDER BUTTONS FOR CHILD SUBSECTIONS */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginRight: '2px' }}>
                                <button onClick={e => { e.stopPropagation(); moveSection(child.id, 'up'); }} style={{ background: 'none', border: 'none', color: T.mutedText, cursor: 'pointer', padding: '0px' }}>
                                  <ArrowUp size={11} />
                                </button>
                                <button onClick={e => { e.stopPropagation(); moveSection(child.id, 'down'); }} style={{ background: 'none', border: 'none', color: T.mutedText, cursor: 'pointer', padding: '0px' }}>
                                  <ArrowDown size={11} />
                                </button>
                              </div>

                              <button onClick={e => { e.stopPropagation(); deleteSection(child.id); }} title="Delete Subsection"
                                style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', opacity: 0.6, padding: '2px', flexShrink: 0 }}>
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                });
              })()}
            </div>
          </div>
        </aside>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg, overflow: 'hidden', minWidth: 0 }}>
          {activeSection ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ padding: '12px 20px', borderBottom: `1px solid ${T.border}`, background: isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.02)', display: 'flex', gap: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
                {BLOCK_TYPES.map(type => (
                  <button key={type.id} onClick={() => handleAddBlock(type.id)} title={type.desc}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', background: T.surface2, border: `1px solid ${T.border}`, color: T.mutedText, padding: '5px 10px', borderRadius: '5px', fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.primaryBorder; e.currentTarget.style.color = T.primary; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.mutedText; }}>
                    {type.icon} {type.label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px', borderBottom: `1px solid ${T.border}`, paddingBottom: '10px' }}>
                  <span style={{ fontSize: '1.8rem', fontWeight: 800, color: T.primary }}>{sectionNumberMap[activeSection.id]}.</span>
                  <DebouncedInput
                    value={activeSection.heading}
                    onChange={val => updateActiveSection({ heading: val })}
                    style={{ background: 'transparent', border: 'none', color: T.text, fontSize: '1.8rem', fontWeight: 300, width: '100%', outline: 'none' }}
                    placeholder="Section Heading…"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[...(activeSection.blocks || [])].sort((a, b) => (a.order || 0) - (b.order || 0)).map((block, idx) => (
                    <div key={block.id}
                      onClick={() => { setActiveBlockId(block.id); setRightPanelOpen(true); }}
                      style={{ background: activeBlockId === block.id ? T.primaryLight : T.surface2, border: `1px solid ${activeBlockId === block.id ? T.primaryBorder : T.border}`, padding: '14px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.15s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: T.mutedText, flexShrink: 0 }}>{String(idx + 1).padStart(2, '0')}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{block.label}</div>
                          <div style={{ fontSize: '0.68rem', color: T.mutedText, marginTop: '2px' }}>
                            <span style={{ color: T.primary, fontWeight: 700 }}>{block.type}</span>
                            {' · '}
                            <span style={{ fontFamily: 'monospace' }}>{block.dataPath}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '2px', flexShrink: 0, marginLeft: '8px' }}>
                        <button onClick={e => { e.stopPropagation(); moveBlock(block.id, 'up'); }} style={{ background: 'none', border: 'none', color: T.mutedText, cursor: 'pointer', padding: '4px 5px', borderRadius: '4px' }}><ArrowUp size={13} /></button>
                        <button onClick={e => { e.stopPropagation(); moveBlock(block.id, 'down'); }} style={{ background: 'none', border: 'none', color: T.mutedText, cursor: 'pointer', padding: '4px 5px', borderRadius: '4px' }}><ArrowDown size={13} /></button>
                        <button onClick={e => { e.stopPropagation(); duplicateBlock(block); }} style={{ background: 'none', border: 'none', color: T.mutedText, cursor: 'pointer', padding: '4px 5px', borderRadius: '4px' }}><Copy size={13} /></button>
                        <button onClick={e => { e.stopPropagation(); deleteBlock(block.id); }} style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', padding: '4px 5px', borderRadius: '4px', marginLeft: '4px' }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                  {activeSection.blocks?.length === 0 && (
                    <div style={{ color: T.mutedText, fontSize: '0.85rem', textAlign: 'center', padding: '40px 0' }}>
                      No blocks yet. Click a type above to add one.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.mutedText, flexDirection: 'column', gap: '12px' }}>
              <Settings2 size={32} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: '0.9rem' }}>Select or add a section to start building.</span>
            </div>
          )}
        </main>

        <aside style={{ width: rightPanelOpen ? '340px' : '0px', opacity: rightPanelOpen ? 1 : 0, background: T.panelBg, borderLeft: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', transition: 'all 0.25s', flexShrink: 0, overflow: 'hidden' }}>
          <div style={{ width: '340px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px', fontSize: '0.7rem', fontWeight: 800, color: T.mutedText, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Settings2 size={13} /> Properties Inspector
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>

              {!activeBlock && activeSection && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: T.primary, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Section Properties</div>
                  <div>
                    <label style={lbl}>Navigation Label</label>
                    <DebouncedInput style={inp} value={activeSection.navLabel || ''}
                      onChange={val => {
                        const key = val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
                        updateActiveSection({ navLabel: val, key });
                      }} />
                  </div>
                  <div>
                    <label style={lbl}>Heading Display</label>
                    <DebouncedInput style={inp} value={activeSection.heading || ''} onChange={val => updateActiveSection({ heading: val })} />
                  </div>
                  <div>
                    <label style={lbl}>Key (auto-generated)</label>
                    <DebouncedInput style={{ ...inp, background: T.surface2, color: T.mutedText, fontFamily: 'monospace', fontSize: '0.75rem' }} value={activeSection.key || ''} readOnly />
                  </div>
                </div>
              )}

              {activeBlock && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: T.primaryLight, border: `1px solid ${T.primaryBorder}`, borderRadius: '7px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: T.primary, textTransform: 'uppercase', letterSpacing: '1px' }}>{activeBlock.type}</span>
                    <span style={{ fontSize: '0.7rem', color: T.mutedText, fontFamily: 'monospace' }}>{activeBlock.dataPath}</span>
                  </div>
                  <div>
                    <label style={lbl}>Block Label</label>
                    <DebouncedInput style={inp} value={activeBlock.label || ''} onChange={val => updateActiveBlock({ label: val })} />
                  </div>
                  <div>
                    <label style={lbl}>Data Path</label>
                    <DebouncedInput style={{ ...inp, fontFamily: 'monospace', fontSize: '0.75rem' }} value={activeBlock.dataPath || ''} onChange={val => updateActiveBlock({ dataPath: val })} />
                  </div>

                  <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '16px', paddingBottom: '16px' }}>
                    <label style={lbl}>Move to Section</label>
                    <select style={{ ...inp, background: T.selectBg, cursor: 'pointer' }} value={activeSectionId} onChange={e => moveBlockToSection(activeBlock.id, e.target.value)}>
                      {sections.map(s => (
                        <option key={s.id} value={s.id}>{sectionNumberMap[s.id]}. {cleanTitle(s.navLabel || s.heading || 'Untitled Section')}</option>
                      ))}
                    </select>
                  </div>

                  {renderBlockSettings(activeBlock, updateActiveBlock, 'root')}
                </div>
              )}

              {!activeBlock && !activeSection && (
                <div style={{ color: T.mutedText, fontSize: '0.85rem', textAlign: 'center', marginTop: '40px' }}>Select a section or block to inspect.</div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {showTableModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
          <div style={{ background: T.bg, border: `1px solid ${T.primaryBorder}`, borderRadius: '14px', width: '100%', maxWidth: '1000px', height: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '18px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1rem', color: T.text, display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800 }}>
                  <Grid3X3 size={16} color={T.primary} /> Matrix Blueprint Editor
                  {matrixPath !== 'root' && <span style={{ color: '#10b981', fontSize: '0.75rem' }}>[{matrixPath}]</span>}
                </h2>
                <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: T.mutedText }}>Configure cell types, formulas, and inputs. Click a cell to select it.</p>
              </div>
              <button onClick={() => setShowTableModal(false)} style={{ background: 'none', border: 'none', color: T.mutedText, cursor: 'pointer', padding: '6px', borderRadius: '50%' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              <div style={{ flex: 1, borderRight: `1px solid ${T.border}`, padding: '20px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <tbody>
                    {activeContextData ? (() => {
                      const numRows  = activeContextData?.rows?.length || 0;
                      const numCols  = activeContextData?.cols || 2;
                      const occupied = Array.from({ length: numRows }, () => new Array(numCols).fill(false));
                      const cellBorder = isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.15)';
                      return (activeContextData?.rows || []).map((row, rIdx) => (
                        <tr key={row.id}>
                          {row.cells.map((cell, cIdx) => {
                            if (occupied[rIdx]?.[cIdx]) return null;
                            const cs = Math.min(Math.max(1, cell.colspan || 1), numCols - cIdx);
                            const rs = Math.min(Math.max(1, cell.rowspan || 1), numRows - rIdx);
                            for (let r = rIdx; r < rIdx + rs; r++)
                              for (let c = cIdx; c < cIdx + cs; c++)
                                if (r < numRows && c < numCols && occupied[r]) occupied[r][c] = true;
                            const isActive = activeCellRow === rIdx && activeCellCol === cIdx;
                            return (
                              <td key={cell.id} colSpan={cs} rowSpan={rs} style={{ border: cellBorder, padding: '3px', background: isDark ? '#070a10' : '#f8fafc' }}>
                                <div onClick={() => { setActiveCellRow(rIdx); setActiveCellCol(cIdx); }}
                                  style={{ padding: '10px', minHeight: '52px', borderRadius: '5px', cursor: 'pointer', background: isActive ? T.primaryLight : T.surface2, border: `1px solid ${isActive ? T.primary : 'transparent'}`, display: 'flex', flexDirection: 'column', gap: '3px', transition: 'all 0.15s', height: '100%' }}>
                                  <span style={{ fontSize: '0.6rem', color: T.primary, fontWeight: 800, textTransform: 'uppercase' }}>{cell.cellType}</span>
                                  <span style={{ fontSize: '0.75rem', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {cell.cellType === 'fixed' ? `"${cell.text || ''}"` :
                                     cell.cellType === 'computed' ? `ƒ: ${cell.formula || ''}` :
                                     cell.cellType === 'mixed' ? 'Mixed Template' :
                                     cell.cellType === 'smart-select' ? 'Smart Dropdown' :
                                     cell.inputType === 'quill' ? 'Rich Text' :
                                     cell.inputType || 'text'}
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ));
                    })() : (
                      <tr><td style={{ color: 'rgba(148,163,184,0.7)', padding: '60px', textAlign: 'center', fontSize: '0.82rem' }}>
                        Loading table data…
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ width: '340px', padding: '20px', overflowY: 'auto', background: T.panelBg }}>
                {activeCellData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: T.primary, letterSpacing: '1px', textTransform: 'uppercase' }}>
                      Cell R{activeCellRow + 1} C{activeCellCol + 1}
                    </div>
                    <div>
                      <label style={lbl}>Cell Type</label>
                      <select style={{ ...inp, background: T.selectBg }} value={activeCellData.cellType || 'input'} onChange={e => {
                        const val = e.target.value;
                        if (val === 'smart-select' && (!activeCellData.conditions || activeCellData.conditions.length === 0)) {
                          updateTableCell({ cellType: val, conditions: [{ label: 'Option 1', template: '' }] });
                        } else if (val === 'mixed' && !activeCellData.template) {
                          updateTableCell({ cellType: val, template: '' });
                        } else {
                          updateTableCell('cellType', val);
                        }
                      }}>
                        <option value="input">Standard Input</option>
                        <option value="fixed">Fixed Text (Label)</option>
                        <option value="computed">Computed Formula</option>
                        <option value="mixed">Mixed (Fill-in-the-blank)</option>
                        <option value="smart-select">Smart Select (Conditional)</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={lbl}>Placeholder</label>
                      <input
                        style={inp}
                        type="text"
                        value={activeCellData.placeholder || ''}
                        onChange={e => updateTableCell('placeholder', e.target.value)}
                        placeholder="e.g. Enter value…"
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: T.text, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!activeCellData.showPlaceholderAsGuide} onChange={e => updateTableCell('showPlaceholderAsGuide', e.target.checked)} />
                        Show placeholder as a guide in workspace
                      </label>
                    </div>

                    {activeCellData.cellType === 'fixed' && (
                      <div>
                        <label style={lbl}>Fixed Text</label>
                        <input style={inp} type="text" value={activeCellData.text || ''} onChange={e => updateTableCell('text', e.target.value)} />
                      </div>
                    )}

                    {activeCellData.cellType === 'input' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div>
                          <label style={lbl}>Input Type</label>
                          <select style={{ ...inp, background: T.selectBg }} value={activeCellData.inputType || 'text'} onChange={e => updateTableCell('inputType', e.target.value)}>
                            <option value="text">Short Text</option>
                            <option value="number">Number</option>
                            <option value="currency">Currency (₹)</option>
                            <option value="percentage">Percentage (%)</option>
                            <option value="date">Date</option>
                            <option value="textarea">Textarea (Multi-line)</option>
                            <option value="select">Dropdown Select</option>
                            <option value="quill">Rich Text Editor</option>
                          </select>
                        </div>

                        {activeCellData.inputType === 'select' && (
                          <div>
                            <label style={lbl}>Select Options</label>
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                              <input
                                style={{ ...inp, flex: 1 }}
                                type="text"
                                id="newCellSelectOption"
                                placeholder="Type an option…"
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const val = e.target.value.trim();
                                    if (!val) return;
                                    updateTableCell('selectOptions', [...(activeCellData.selectOptions || []), val]);
                                    e.target.value = '';
                                  }
                                }}
                              />
                              <button
                                onClick={() => {
                                  const input = document.getElementById('newCellSelectOption');
                                  const val = input.value.trim();
                                  if (!val) return;
                                  updateTableCell('selectOptions', [...(activeCellData.selectOptions || []), val]);
                                  input.value = '';
                                }}
                                style={{ background: T.primaryLight, border: `1px solid ${T.primaryBorder}`, color: T.primary, padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                + Add
                              </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {(activeCellData.selectOptions || []).map((opt, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '5px', padding: '6px 10px' }}>
                                  <span style={{ fontSize: '0.82rem', color: T.text }}>{opt}</span>
                                  <button onClick={() => updateTableCell('selectOptions', (activeCellData.selectOptions || []).filter((_, idx) => idx !== i))}
                                    style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', lineHeight: 1 }}>×</button>
                                </div>
                              ))}
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: T.text, cursor: 'pointer', marginTop: '10px' }}>
                              <input type="checkbox" checked={!!activeCellData.allowCustom} onChange={e => updateTableCell('allowCustom', e.target.checked)} />
                              Allow users to add custom options
                            </label>
                          </div>
                        )}
                      </div>
                    )}

                    {activeCellData.cellType === 'computed' && (
                      <div>
                        <label style={lbl}>Formula</label>
                        <input style={{ ...inp, fontFamily: 'monospace', borderColor: T.primaryBorder, color: T.primary }}
                          type="text" value={activeCellData.formula || ''}
                          onChange={e => updateTableCell('formula', e.target.value)}
                          placeholder="SUM(C1) or R0C1 + R0C2" />
                        <div style={{ fontSize: '0.65rem', color: T.mutedText, marginTop: '4px' }}>Use SUM(C[index]) or R[row]C[col] refs.</div>
                      </div>
                    )}

                    {activeCellData.cellType === 'mixed' && (
                      <div>
                        <label style={lbl}>Template Blueprint</label>
                        <textarea style={{ ...inp, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }}
                          rows={3} value={activeCellData.template || ''}
                          onChange={e => updateTableCell('template', e.target.value)}
                          placeholder="Total [number] due by [date]" />
                      </div>
                    )}

{activeCellData.cellType === 'smart-select' && (
                      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '14px' }}>
                        <label style={{ ...lbl, color: '#f472b6' }}>Smart Conditions (IF → THEN)</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                          {(activeCellData.conditions || []).map((cond, i) => (
                            <div key={i} style={{ padding: '8px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '6px' }}>
                              
                              {/* IF Row */}
                              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: T.mutedText }}>IF</span>
                                <input style={{ ...inp, flex: 1 }} type="text" value={cond.label || ''} onChange={e => {
                                  const c = [...(activeCellData.conditions || [])]; c[i] = { ...c[i], label: e.target.value }; updateTableCell('conditions', c);
                                }} placeholder="Dropdown option" />
                                <button onClick={() => updateTableCell('conditions', activeCellData.conditions.filter((_, idx) => idx !== i))}
                                  style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontWeight: 'bold' }}>×</button>
                              </div>
                              
                              {/* THEN Row */}
                              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderTop: `1px dashed ${T.border}`, paddingTop: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: T.mutedText }}>THEN</span>
                                  
                                  {/* Segmented Mode Toggle */}
                                  <div style={{ display: 'flex', gap: '2px', background: T.bg, padding: '2px', borderRadius: '6px', border: `1px solid ${T.border}` }}>
                                    <button
                                      onClick={() => {
                                        const c = [...(activeCellData.conditions || [])];
                                        c[i] = { ...c[i], thenMode: 'template' };
                                        updateTableCell('conditions', c);
                                      }}
                                      style={{ background: cond.thenMode !== 'richtext' ? T.primaryLight : 'transparent', color: cond.thenMode !== 'richtext' ? T.primary : T.mutedText, border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                                    >
                                      Fill-in-the-Blanks
                                    </button>
                                    <button
                                      onClick={() => {
                                        const c = [...(activeCellData.conditions || [])];
                                        c[i] = { ...c[i], thenMode: 'richtext' };
                                        updateTableCell('conditions', c);
                                      }}
                                      style={{ background: cond.thenMode === 'richtext' ? T.primaryLight : 'transparent', color: cond.thenMode === 'richtext' ? T.primary : T.mutedText, border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                                    >
                                      Rich Text Editor
                                    </button>
                                  </div>
                                </div>

                                {/* Dynamic Content based on Toggle */}
                                {cond.thenMode === 'richtext' ? (
                                  <div style={{ background: T.bg, border: `1px dashed ${T.border}`, padding: '12px', borderRadius: '6px', fontSize: '0.75rem', color: T.mutedText, textAlign: 'center' }}>
                                    <Layers size={14} style={{ marginBottom: '4px', opacity: 0.7 }} />
                                    <br />
                                    A multi-line Rich Text Editor will be displayed for this option.
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <textarea style={{ ...inp, flex: 1, resize: 'vertical' }} rows={2} value={cond.template || ''} onChange={e => {
                                      const c = [...(activeCellData.conditions || [])]; c[i] = { ...c[i], template: e.target.value }; updateTableCell('conditions', c);
                                    }} placeholder="Total [number] employees..." />
                                    <div style={{ fontSize: '0.62rem', color: T.mutedText, marginTop: '6px' }}>
                                      Tags: [text] [number] [date] [select]
                                    </div>
                                  </div>
                                )}

                              </div>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => updateTableCell('conditions', [...(activeCellData.conditions || []), { label: 'New Option', template: '', thenMode: 'template' }])}
                          style={{ background: 'none', border: 'none', color: '#f472b6', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                          + Add Condition
                        </button>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '10px', borderTop: `1px solid ${T.border}`, paddingTop: '14px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={lbl}>Col Span</label>
                        <input type="number" min="1" style={inp} value={activeCellData.colspan || 1} onChange={e => updateTableCell('colspan', parseInt(e.target.value))} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={lbl}>Row Span</label>
                        <input type="number" min="1" style={inp} value={activeCellData.rowspan || 1} onChange={e => updateTableCell('rowspan', parseInt(e.target.value))} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: T.mutedText, fontSize: '0.82rem', textAlign: 'center', marginTop: '40px' }}>
                    Select a cell from the grid to configure it.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

