import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronUp, ChevronDown, Replace, ReplaceAll, MapPin, GripHorizontal } from 'lucide-react';

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const flattenData = (obj, prefix = '') => {
  let res = {};
  for (const [key, val] of Object.entries(obj || {})) {
    const newPrefix = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      res = { ...res, ...flattenData(val, newPrefix) };
    } else if (Array.isArray(val)) {
      val.forEach((item, index) => {
        if (item !== null && typeof item === 'object') {
          res = { ...res, ...flattenData(item, `${newPrefix}.${index}`) };
        } else {
          res[`${newPrefix}.${index}`] = item;
        }
      });
    } else {
      res[newPrefix] = val;
    }
  }
  return res;
};

// SCHEMA-AWARE GLOBAL INDEXER (DYNAMIC DATA ONLY)
const buildIndex = (schema, imData, customNames, sectionNumberMap) => {
  let index = [];
  const getValue = (path) => path?.split('.').reduce((o, k) => o?.[k], imData);

  (schema || []).forEach(section => {
    const secName = customNames[section.id] || section.navLabel || section.heading || 'Section';
    const secNum = sectionNumberMap[section.id] || '';
    const breadcrumbBase = `${secNum ? secNum + '. ' : ''}${secName}`;

    const traverseBlocks = (blocks, parentBreadcrumb) => {
      (blocks || []).forEach(block => {
        const blockName = customNames[block.id] || block.label || 'Unnamed Block';
        const currentBreadcrumb = `${parentBreadcrumb} > ${blockName}`;

        // 1. Index Dynamic User Data ONLY (Static instructions skipped)
        if (block.dataPath) {
          const val = getValue(block.dataPath);
          if (val !== undefined && val !== null) {
            const flatVal = typeof val === 'object' ? flattenData(val) : { '': val };
            Object.entries(flatVal).forEach(([subPath, strVal]) => {
              if (typeof strVal === 'string' && strVal.trim()) {
                const fullPath = subPath ? `${block.dataPath}.${subPath}` : block.dataPath;
                index.push({ text: strVal, path: fullPath, readablePath: currentBreadcrumb, isStatic: false, blockId: block.id, sectionId: section.id });
              }
            });
          }
        }

        // 2. Traverse Nested Blocks
        if (block.blocks) traverseBlocks(block.blocks, currentBreadcrumb);
        if (block.branches) {
          block.branches.forEach(branch => traverseBlocks(branch.blocks, `${currentBreadcrumb} > ${branch.label || 'Branch'}`));
        }
      });
    };
    traverseBlocks(section.blocks, breadcrumbBase);
  });
  return index;
};

export default function IMSearchWidget({ 
  imData, schema = [], customNames = {}, sectionNumberMap = {}, onClose, isDark = true, onSingleReplace, onBatchReplace 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [matches, setMatches] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Drag State
  const [position, setPosition] = useState({ x: window.innerWidth - 360, y: 60 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const inputRef = useRef(null);
  const prevSearchTerm = useRef('');

  const T = {
    bg: isDark ? '#1e2431' : '#ffffff',
    border: isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb',
    text: isDark ? '#f1f5f9' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    accent: '#3b82f6',
    inputBg: isDark ? '#0d1117' : '#f8fafc',
  };

// JUMP DISPATCHER: Safely prepares global state and fires event
  const dispatchJump = (matchList, matchIndex) => {
    if (matchList.length > 0 && matchList[matchIndex]) {
       const match = matchList[matchIndex];
       const detail = {
         dataPath: match.path,
         matchText: match.matchText,
         occurrenceIndex: match.occurrenceIndex,
         sectionId: match.sectionId,
         blockId: match.blockId,
         isStatic: match.isStatic
       };
       
       window.imActiveSearchTerm = match.matchText; 
       window.imActiveSearchDataPath = match.path; // Track the exact cell globally
       window.imPendingSearchJump = detail; 
       window.dispatchEvent(new CustomEvent('im-search-jump', { detail }));
    }
  };

  useEffect(() => {
    if (!searchTerm.trim()) {
      setMatches([]);
      setCurrentIndex(0);
      prevSearchTerm.current = '';
      // FIX: Ensure global highlights vanish the millisecond the box is emptied
      window.imActiveSearchTerm = null;
      window.imActiveSearchDataPath = null;
      window.dispatchEvent(new CustomEvent('im-clear-search'));
      return;
    }

    const results = [];
    const blockOccurrences = {}; 
    const safeRegex = new RegExp(`(${escapeRegExp(searchTerm)})(?![^<]*>)`, 'gi');
    const searchableItems = buildIndex(schema, imData, customNames, sectionNumberMap);

    searchableItems.forEach(item => {
      const found = [...item.text.matchAll(safeRegex)];
      found.forEach((match) => {
        const occKey = `${item.blockId}_${item.path || 'static'}`;
        if (blockOccurrences[occKey] === undefined) blockOccurrences[occKey] = 0;

        const snippetStart = Math.max(0, match.index - 25);
        const snippetEnd = Math.min(item.text.length, match.index + searchTerm.length + 25);
        let preview = item.text.substring(snippetStart, snippetEnd).replace(/<[^>]+>/g, ' '); 
        
        results.push({
          path: item.path,
          readablePath: item.readablePath,
          originalString: item.text,
          matchText: match[0],
          index: match.index,
          occurrenceIndex: blockOccurrences[occKey],
          preview: `...${preview.trim()}...`,
          sectionId: item.sectionId,
          blockId: item.blockId,
          isStatic: item.isStatic
        });

        blockOccurrences[occKey]++;
      });
    });

    setMatches(results);
    
    // Memory Tracker: ONLY reset to 1 if the user actively typed a different search word.
    // Prevents violent jumping if the data simply autosaved in the background.
    if (searchTerm !== prevSearchTerm.current) {
      prevSearchTerm.current = searchTerm;
      if (results.length > 0) {
        setCurrentIndex(0);
        dispatchJump(results, 0);
      } else {
        setCurrentIndex(0);
      }
    } else {
      // Background data changed, keep the user on their current search index!
      setCurrentIndex(prev => Math.min(prev, Math.max(0, results.length - 1)));
    }
  }, [searchTerm, imData, schema, customNames, sectionNumberMap]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleNext = () => {
    const nextIndex = currentIndex < matches.length - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(nextIndex);
    dispatchJump(matches, nextIndex); // Fired safely outside of the state updater
  };

  const handlePrev = () => {
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : matches.length - 1;
    setCurrentIndex(prevIndex);
    dispatchJump(matches, prevIndex); // Fired safely outside of the state updater
  };

  const activeMatch = matches[currentIndex];
  const isCurrentStatic = activeMatch?.isStatic;

  const handleReplace = () => {
    if (matches.length === 0 || isCurrentStatic) return;
    const before = activeMatch.originalString.substring(0, activeMatch.index);
    const after = activeMatch.originalString.substring(activeMatch.index + activeMatch.matchText.length);
    onSingleReplace(activeMatch.path, before + replaceTerm + after);
  };

  const handleReplaceAll = () => {
    if (matches.length === 0) return;
    const replaceableMatches = matches.filter(m => !m.isStatic);
    
    if (replaceableMatches.length === 0) {
      alert('No dynamic data matches available to replace.');
      return;
    }
    
    if (!window.confirm(`Replace ${replaceableMatches.length} dynamic occurrences? (Static schema text cannot be replaced)`)) return;

    const updates = {};
    const safeRegex = new RegExp(`(${escapeRegExp(searchTerm)})(?![^<]*>)`, 'gi');
    const flat = flattenData(imData);
    
    const replaceablePaths = new Set(replaceableMatches.map(m => m.path));
    
    Object.entries(flat).forEach(([path, value]) => {
      if (typeof value === 'string' && safeRegex.test(value) && replaceablePaths.has(path)) {
        updates[path] = value.replace(safeRegex, replaceTerm);
      }
    });
    
    if (Object.keys(updates).length > 0) onBatchReplace(updates);
  };

// ── DRAG HANDLERS ──
  const handlePointerDown = (e) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    document.body.style.userSelect = 'none'; // Prevent text highlighting while dragging
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    
    // Calculate new position while clamping to screen boundaries
    let newX = e.clientX - dragStart.current.x;
    let newY = e.clientY - dragStart.current.y;
    
    const maxX = window.innerWidth - 340; // 340 is widget width
    const maxY = window.innerHeight - 50; 
    
    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));
    
    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = () => {
    isDragging.current = false;
    document.body.style.userSelect = '';
  };

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  return (
    <div style={{
      position: 'fixed', left: position.x, top: position.y, zIndex: 2147483647, width: 340, 
      background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, 
      boxShadow: '0 10px 40px rgba(0,0,0,0.5)', overflow: 'hidden', fontFamily: 'inherit'
    }}>
      {/* DRAG HANDLE BAR */}
      <div 
        onPointerDown={handlePointerDown}
        style={{ 
          padding: '8px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', 
          justifyContent: 'space-between', alignItems: 'center', cursor: 'grab', 
          backgroundColor: isDark ? '#1e293b' : '#f8fafc' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.text, fontSize: 13, fontWeight: 700, pointerEvents: 'none' }}>
          <GripHorizontal size={14} style={{ color: T.textMuted }}/> Search Engine
        </div>
        <button 
          onPointerDown={(e) => e.stopPropagation()} // Prevent dragging when clicking close
          onClick={() => {
            // FIX: Ensure complete eradication of global search state before closing
            window.imActiveSearchTerm = null;
            window.imActiveSearchDataPath = null;
            window.dispatchEvent(new CustomEvent('im-clear-search'));
            onClose();
          }} 
          style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', display: 'flex' }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ padding: '12px 14px' }}>
        <input
          ref={inputRef}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Find in document..."
          style={{ width: '100%', background: T.inputBg, border: `1px solid ${T.border}`, color: T.text, padding: '8px 10px', borderRadius: 4, outline: 'none', fontSize: 12, marginBottom: 8 }}
          onKeyDown={e => { if(e.key === 'Enter') handleNext(); }}
        />
        <input
          value={replaceTerm}
          onChange={e => setReplaceTerm(e.target.value)}
          placeholder="Replace with..."
          disabled={isCurrentStatic}
          style={{ width: '100%', background: T.inputBg, border: `1px solid ${T.border}`, color: T.text, padding: '8px 10px', borderRadius: 4, outline: 'none', fontSize: 12, marginBottom: 12, opacity: isCurrentStatic ? 0.5 : 1 }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>
            {matches.length > 0 ? `${currentIndex + 1} of ${matches.length} matches` : 'No matches'}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={handlePrev} disabled={matches.length===0} style={btnStyle(T)}><ChevronUp size={14} /></button>
            <button onClick={handleNext} disabled={matches.length===0} style={btnStyle(T)}><ChevronDown size={14} /></button>
          </div>
        </div>

        {matches.length > 0 && activeMatch && (
          <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', padding: '10px', borderRadius: 6, marginTop: 12 }}>
             <div style={{ fontSize: 11, color: T.text, fontStyle: 'italic', wordBreak: 'break-word', marginBottom: 8 }}>
                 {activeMatch.preview}
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: T.accent, fontWeight: 700, textTransform: 'uppercase' }}>
                <MapPin size={10} /> {activeMatch.readablePath}
             </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={handleReplace} disabled={matches.length===0} style={actionBtn(T, false)}>
            <Replace size={13} /> Replace
          </button>
          <button onClick={handleReplaceAll} disabled={matches.length===0} style={actionBtn(T, true)}>
            <ReplaceAll size={13} /> Replace All
          </button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(T) { return { background: T.inputBg, border: `1px solid ${T.border}`, color: T.text, padding: '4px', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center' }; }
function actionBtn(T, isSecondary = false) { return { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, background: isSecondary ? T.inputBg : T.accent, color: isSecondary ? T.text : '#fff', border: isSecondary ? `1px solid ${T.border}` : 'none', padding: '6px 0', borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: isSecondary ? 'not-allowed' : 'pointer', opacity: isSecondary ? 0.6 : 1 }; }