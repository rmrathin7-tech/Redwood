/**
 * fsa/components/FSADataEntry.jsx
 * * DYNAMIC MULTI-COLUMN SPREADSHEET MATRIX (EXCEL-GRADE)
 * Fully upgraded to support Global SaaS Theme Variables (Light/Dark Mode)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../firebase.js';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  FileText,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  X,
  Sparkles,
  ArrowUpDown,
  Layers,
  Zap,
  Download,
  Upload,
  Printer,
  FileSpreadsheet,
  Edit2,
  Eye,
  ScanLine,
  Wand2
} from 'lucide-react';
import { usePDFExtraction } from './PDFExtractionHook.jsx';
import { applyLiveIndianFormat, formatIN, formatValue } from '../utils/fsaFormatters.js';
import { buildFinancialModel } from '../core/fsaEngine.js';

export default function FSADataEntry({ 
  projectData, 
  configSchemas, 
  activeEntityType, 
  updateDataPath, 
  forceSave,
  setActiveTab
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const fsaId = searchParams.get('fsa');

  const availableDocs = configSchemas?.documents || [];
  const [activeDocKey, setActiveDocKey] = useState(availableDocs[0]?.key || 'pnl');
  const [expandedSections, setExpandedSections] = useState({});
  // ── CORE REAL-TIME EXTENSION STATES ──
  const [activeYearsList, setActiveYearsList] = useState([]);
  const [yearSortOrder, setYearSortOrder] = useState('asc'); 
  const [activeItemsMap, setActiveItemsMap] = useState({});
  const [loadingMetadata, setLoadingMetadata] = useState(true);
  
  // ── SAAS BULK EXTRACTION INJECTOR & REVIEW STATES ──
  const [reviewPayload, setReviewPayload] = useState(null); 
  const [conflictYears, setConflictYears] = useState(null);
  const [itemMappings, setItemMappings] = useState({});
  const [rowStatuses, setRowStatuses] = useState({}); // { [rowId]: 'reviewed' | 'deleted' | 'pending' }
  const [viewMode, setViewMode] = useState('split'); // 'split', 'pdf-only', 'data-only'
  
  // ── FIX: MEMOIZE PDF BLOB URL TO PREVENT IFRAME REFRESHING ──
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);

  const pdfCtx = usePDFExtraction(updateDataPath, configSchemas) || {};
  const currentCoA = configSchemas?.chartOfAccounts?.shared?.[activeDocKey] || [];

  const handleOpenReadOnlyMode = () => {
    setActiveTab('statements');
  };

  // Manage PDF URL Lifecycle
  useEffect(() => {
    if (pdfCtx.selectedPdfFile) {
      const url = URL.createObjectURL(pdfCtx.selectedPdfFile);
      setPdfBlobUrl(url);
      return () => URL.revokeObjectURL(url); // Cleanup to prevent memory leaks
    } else {
      setPdfBlobUrl(null);
    }
  }, [pdfCtx.selectedPdfFile]);

  // ── 1. REAL-TIME SYNCHRONIZATION OF METRIC LAYOUTS ──
  useEffect(() => {
    if (!projectId || !fsaId) {
      setLoadingMetadata(false);
      return;
    }

    const docRef = doc(db, 'projects', projectId, 'fsa', fsaId);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        
        if (data.activeYearsList && data.activeYearsList.length > 0) {
          setActiveYearsList(data.activeYearsList);
        } else {
          setActiveYearsList([]); 
        }

        if (data.activeItemsMap && Object.keys(data.activeItemsMap).length > 0) {
          setActiveItemsMap(data.activeItemsMap);
        } else {
          const initialMap = {};
          Object.entries(configSchemas?.chartOfAccounts?.shared || {}).forEach(([docKey, nodes]) => {
            initialMap[docKey] = {};
            nodes.forEach(node => {
              if (node.type === 'section') initialMap[docKey][node.key] = []; 
              if (node.dynamic && node.key === 'equity_placeholder') initialMap[docKey]['equity'] = [];
            });
          });
          setActiveItemsMap(initialMap);
          updateDoc(docRef, { activeItemsMap: initialMap }).catch(console.error);
        }
      }
      setLoadingMetadata(false);
    }, (err) => {
      console.error("Error loading layout metadata:", err);
      setLoadingMetadata(false);
    });

    return () => unsubscribe();
  }, [projectId, fsaId, configSchemas, activeEntityType]);

  // ── 2. YEAR SORTER & MULTI-ADD MANAGER ──
  const sortedActiveYears = useMemo(() => {
    const sorted = [...activeYearsList].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    return yearSortOrder === 'asc' ? sorted : sorted.reverse();
  }, [activeYearsList, yearSortOrder]);

  const handleAddYear = () => {
    const input = prompt("Enter Fiscal Year(s) to Add (comma separated, e.g., 2024, 2025, 2026):");
    if (!input || !input.trim()) return;
    
    const newYears = input.split(',')
      .map(y => y.trim())
      .filter(y => !isNaN(y) && y.length === 4); 

    if (newYears.length === 0) return;

    const updatedYears = Array.from(new Set([...activeYearsList, ...newYears]));
    setActiveYearsList(updatedYears);

    if (projectId && fsaId) {
      const docRef = doc(db, 'projects', projectId, 'fsa', fsaId);
      updateDoc(docRef, { activeYearsList: updatedYears }).catch(console.error);
    }
  };

  const handleRemoveYear = (targetYear) => {
    if (!window.confirm(`Are you sure you want to delete FY ${targetYear}? This permanently wipes all inputs for this column.`)) return;

    const updatedYears = activeYearsList.filter(y => y !== targetYear);
    setActiveYearsList(updatedYears);

    if (projectId && fsaId) {
      const docRef = doc(db, 'projects', projectId, 'fsa', fsaId);
      const clearedData = JSON.parse(JSON.stringify(projectData || {}));
      Object.keys(clearedData).forEach(docKey => {
        Object.keys(clearedData[docKey] || {}).forEach(secKey => {
          if (clearedData[docKey][secKey][targetYear]) delete clearedData[docKey][secKey][targetYear];
        });
      });
      setDoc(docRef, { activeYearsList: updatedYears, financialData: clearedData }, { merge: true }).catch(console.error);
    }
  };

  // ── 3. PRE-COMPUTE HOURLY FINANCIAL MODELS ──
  const multiYearModels = useMemo(() => {
    const models = {};
    sortedActiveYears.forEach(year => {
      models[year] = buildFinancialModel(projectData, year, {}, configSchemas, activeEntityType)[year] || {};
    });
    return models;
  }, [projectData, sortedActiveYears, configSchemas, activeEntityType]);

  // ── 4. LINE ITEMS INJECTION & REMOVALS ──
  const handleActivateLineItem = (secKey, itemValue) => {
    if (!itemValue) return;

    let finalItem = itemValue;
    if (itemValue === '__CUSTOM__') {
      const customName = prompt("Enter custom line item title:");
      if (!customName || !customName.trim()) return;
      finalItem = customName.trim();
    }

    const currentDocItems = activeItemsMap[activeDocKey] || {};
    const sectionItems = currentDocItems[secKey] || [];

    if (sectionItems.includes(finalItem)) {
      alert("This line item is already active in this section.");
      return;
    }

    const updatedMap = {
      ...activeItemsMap,
      [activeDocKey]: { ...(activeItemsMap[activeDocKey] || {}), [secKey]: [...sectionItems, finalItem] }
    };

    setActiveItemsMap(updatedMap);
    if (projectId && fsaId) {
      const docRef = doc(db, 'projects', projectId, 'fsa', fsaId);
      updateDoc(docRef, { activeItemsMap: updatedMap }).catch(console.error);
    }
  };

  const handleAddSubItem = (secKey, parentName) => {
    const subName = prompt(`Enter custom sub-item name under '${parentName}':`);
    if (!subName || !subName.trim()) return;
    
    handleActivateLineItem(secKey, `${parentName}||${subName.trim()}`);

    if (projectId && fsaId) {
      const docRef = doc(db, 'projects', projectId, 'fsa', fsaId);
      const clearedData = JSON.parse(JSON.stringify(projectData || {}));
      let dataModified = false;
      
      sortedActiveYears.forEach(year => {
        const safeParentKey = parentName.replace(/\./g, '');
        if (clearedData[activeDocKey]?.[secKey]?.[year]?.[safeParentKey] !== undefined) {
          delete clearedData[activeDocKey][secKey][year][safeParentKey];
          dataModified = true;
        }
      });

      if (dataModified) {
        setDoc(docRef, { financialData: clearedData }, { merge: true }).catch(console.error);
      }
    }
  };

  const handleDeactivateLineItem = (secKey, itemValue) => {
    if (!window.confirm(`Are you sure you want to remove '${itemValue.replace('||', ' ➔ ')}'?`)) return;

    const currentDocItems = activeItemsMap[activeDocKey] || {};
    const sectionItems = currentDocItems[secKey] || [];
    const updatedItems = sectionItems.filter(itm => itm !== itemValue && !itm.startsWith(`${itemValue}||`));

    const updatedMap = {
      ...activeItemsMap,
      [activeDocKey]: { ...(activeItemsMap[activeDocKey] || {}), [secKey]: updatedItems }
    };

    setActiveItemsMap(updatedMap);

    if (projectId && fsaId) {
      const docRef = doc(db, 'projects', projectId, 'fsa', fsaId);
      const clearedData = JSON.parse(JSON.stringify(projectData || {}));
      
      sortedActiveYears.forEach(year => {
        sectionItems.filter(itm => itm === itemValue || itm.startsWith(`${itemValue}||`)).forEach(targetItm => {
          const safeKey = targetItm.replace(/\./g, '');
          if (clearedData[activeDocKey]?.[secKey]?.[year]?.[safeKey] !== undefined) {
            delete clearedData[activeDocKey][secKey][year][safeKey];
          }
        });
      });

      setDoc(docRef, { activeItemsMap: updatedMap, financialData: clearedData }, { merge: true }).catch(console.error);
    }
  };

  const handleEditLineItem = (secKey, oldItemValue) => {
    const isSubItem = oldItemValue.includes('||');
    const currentDisplay = isSubItem ? oldItemValue.split('||')[1] : oldItemValue;
    const parentPrefix = isSubItem ? oldItemValue.split('||')[0] + '||' : '';
    
    const newDisplayName = prompt(`Enter new name for '${currentDisplay}':`, currentDisplay);
    if (!newDisplayName || !newDisplayName.trim() || newDisplayName.trim() === currentDisplay) return;
    
    const newItemValue = parentPrefix + newDisplayName.trim();

    const currentDocItems = activeItemsMap[activeDocKey] || {};
    const sectionItems = currentDocItems[secKey] || [];
    
    if (sectionItems.includes(newItemValue)) {
      alert("An item with this exact name already exists.");
      return;
    }

    const updatedItems = sectionItems.map(itm => {
      if (itm === oldItemValue) return newItemValue;
      if (!isSubItem && itm.startsWith(oldItemValue + '||')) {
         return newItemValue + '||' + itm.split('||')[1];
      }
      return itm;
    });

    const updatedMap = {
      ...activeItemsMap,
      [activeDocKey]: { ...(activeItemsMap[activeDocKey] || {}), [secKey]: updatedItems }
    };

    setActiveItemsMap(updatedMap);

    if (projectId && fsaId) {
      const docRef = doc(db, 'projects', projectId, 'fsa', fsaId);
      const modifiedData = JSON.parse(JSON.stringify(projectData || {}));
      
      sortedActiveYears.forEach(year => {
        const oldSafeKey = oldItemValue.replace(/\./g, '');
        const newSafeKey = newItemValue.replace(/\./g, '');
        
        if (modifiedData[activeDocKey]?.[secKey]?.[year]?.[oldSafeKey] !== undefined) {
          modifiedData[activeDocKey][secKey][year][newSafeKey] = modifiedData[activeDocKey][secKey][year][oldSafeKey];
          delete modifiedData[activeDocKey][secKey][year][oldSafeKey];
        }

        if (!isSubItem) {
          const oldChildPrefix = oldSafeKey + '||';
          const newChildPrefix = newSafeKey + '||';
          Object.keys(modifiedData[activeDocKey]?.[secKey]?.[year] || {}).forEach(k => {
            if (k.startsWith(oldChildPrefix)) {
              const newChildKey = k.replace(oldChildPrefix, newChildPrefix);
              modifiedData[activeDocKey][secKey][year][newChildKey] = modifiedData[activeDocKey][secKey][year][k];
              delete modifiedData[activeDocKey][secKey][year][k];
            }
          });
        }
      });

      setDoc(docRef, { activeItemsMap: updatedMap, financialData: modifiedData }, { merge: true }).catch(console.error);
    }
  };

  const toggleSection = (secKey) => {
    setExpandedSections(prev => ({ ...prev, [secKey]: prev[secKey] === false }));
  };

  const getInputValue = (docKey, secKey, itemKey, year) => {
    const safeKey = itemKey.replace(/\./g, '');
    const val = projectData?.financialData?.[docKey]?.[secKey]?.[year]?.[safeKey] || projectData?.data?.[docKey]?.[secKey]?.[year]?.[safeKey];
    return val !== undefined && val !== null ? val : 0;
  };

  const getParentSum = (docKey, secKey, parentName, year) => {
    let sum = 0;
    const safeParentPrefix = parentName.replace(/\./g, '') + '||';
    const yearData = projectData?.financialData?.[docKey]?.[secKey]?.[year] || projectData?.data?.[docKey]?.[secKey]?.[year] || {};
    Object.keys(yearData).forEach(k => {
      if (k.startsWith(safeParentPrefix)) sum += parseFloat(yearData[k]) || 0;
    });
    return sum;
  };

  const handleInputBlur = (e, docKey, secKey, rawItemKey, year) => {
    const safeKey = rawItemKey.replace(/\./g, '');
    let rawVal = e.target.value.replace(/,/g, '').trim();
    if (!rawVal || rawVal === '') rawVal = '0';
    
    const numericValue = parseFloat(rawVal);
    if (!isNaN(numericValue)) {
      updateDataPath(docKey, secKey, safeKey, numericValue, year);
      e.target.value = formatIN(numericValue, 2); 
    }
  };

  // ── 5. IMPORT & EXPORT HANDLERS ──
  const handleExportJSON = () => {
    const exportData = { activeYearsList, activeItemsMap, financialData: projectData };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `FSA_Data_${projectId || 'export'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        if (projectId && fsaId) {
          const docRef = doc(db, 'projects', projectId, 'fsa', fsaId);
          const payload = {};
          
          if (importedData.activeYearsList) {
            payload.activeYearsList = [...new Set([...(activeYearsList || []), ...importedData.activeYearsList])];
          }
          
          if (importedData.activeItemsMap) {
            const mergedItemsMap = JSON.parse(JSON.stringify(activeItemsMap || {}));
            Object.keys(importedData.activeItemsMap).forEach(docKey => {
              if (!mergedItemsMap[docKey]) mergedItemsMap[docKey] = {};
              Object.keys(importedData.activeItemsMap[docKey]).forEach(secKey => {
                 const existingItems = mergedItemsMap[docKey][secKey] || [];
                 const importedItems = importedData.activeItemsMap[docKey][secKey] || [];
                 mergedItemsMap[docKey][secKey] = [...new Set([...existingItems, ...importedItems])];
              });
            });
            payload.activeItemsMap = mergedItemsMap;
          }
          
          if (importedData.financialData) {
            payload.financialData = importedData.financialData; 
          }

          setDoc(docRef, payload, { merge: true }).then(() => {
            alert("Data successfully merged without breaking your settings!");
          }).catch(err => {
            console.error("Import error:", err);
            alert("Failed to sync imported data to the database.");
          });
        }
      } catch (err) {
        console.error("Parse error:", err);
        alert("Invalid JSON format.");
      }
    };
    reader.readAsText(file);
    event.target.value = null; 
  };


  // ── 6. NEW SAAS BULK EXTRACTION INJECTOR & REVIEW STATES ──
  const handleBulkInjection = (payload) => {
    if (!payload || Object.keys(payload).length === 0) {
      alert("No extracted data found in the payload.");
      return;
    }

    // 1. Check for Conflicts
    const extractedYears = new Set();
    Object.values(payload).forEach(stmt => {
      Object.keys(stmt?.data || {}).forEach(yr => {
        const cleanYr = yr.replace(/\D/g, '').slice(0, 4);
        if (cleanYr.length === 4) extractedYears.add(cleanYr);
      });
    });

    const conflicts = Array.from(extractedYears).filter(y => activeYearsList.includes(y));
    
    if (conflicts.length > 0) {
      setConflictYears(conflicts);
      setReviewPayload(payload);
    } else {
      initializeMappings(payload);
      setReviewPayload(payload);
    }
  };

  const handleConflictDecision = (decisionMap) => {
    // In a full implementation, you'd filter out skipped years here.
    // For now, we proceed to mapping phase and overwrite conflicts on save.
    initializeMappings(reviewPayload);
    setConflictYears(null);
  };

  const initializeMappings = (payload) => {
    const initialMappings = {};
    const initialStatuses = {};
    
    // Pre-populate mappings based on exact matches
    Object.keys(payload).forEach(stmtType => {
      const frontendDocMap = { 'profit_and_loss': 'pnl', 'balance_sheet': 'bs', 'cash_flow': 'cashflow' };
      const docKey = frontendDocMap[stmtType] || 'pnl';
      
      Object.values(payload[stmtType]?.data || {}).forEach(yearData => {
        Object.entries(yearData).forEach(([extractedSec, items]) => {
          Object.keys(items).forEach(extractedItem => {
            const rowId = `${stmtType}_${extractedSec}_${extractedItem}`;
            
            // Fuzzy match logic to find best schema fit
            const schemaSections = configSchemas?.chartOfAccounts?.shared?.[docKey] || [];
            let bestSecMatch = schemaSections[0]?.key || extractedSec;
            
            initialMappings[rowId] = {
              section: bestSecMatch,
              item: extractedItem // Default to creating a custom item if no exact match
            };
            initialStatuses[rowId] = 'pending';
          });
        });
      });
    });

    setItemMappings(initialMappings);
    setRowStatuses(initialStatuses);
  };

  // ── FIX: ALLOW INLINE EDITING OF DATA IN REVIEW MODAL ──
  const handleReviewEdit = (stmtType, secKey, itemKey, cleanYearToFind, newValue) => {
    setReviewPayload(prev => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const stmtData = next[stmtType]?.data;
      if (!stmtData) return prev;

      for (const origYear of Object.keys(stmtData)) {
        if (origYear.replace(/\D/g, '').slice(0, 4) === cleanYearToFind) {
          if (stmtData[origYear]?.[secKey]?.[itemKey] !== undefined) {
            stmtData[origYear][secKey][itemKey] = newValue;
          }
          break;
        }
      }
      return next;
    });
  };

  const confirmAndInject = async () => {
    // Check if any rows are still pending
    const unreviewed = Object.values(rowStatuses).filter(s => s === 'pending').length;
    if (unreviewed > 0) {
      if (!window.confirm(`⚠️ You have ${unreviewed} unreviewed items.\n\nAre you sure you want to save and inject them into the matrix?`)) return;
    }

    try {
      const updatedData = { ...(projectData?.financialData || projectData?.data || {}) };
      const newItemsMap = JSON.parse(JSON.stringify(activeItemsMap || {}));
      let yearsSet = new Set(activeYearsList || []);
      
      Object.keys(reviewPayload).forEach(stmtType => {
        const frontendDocMap = { 'profit_and_loss': 'pnl', 'balance_sheet': 'bs', 'cash_flow': 'cashflow' };
        const targetDocKey = frontendDocMap[stmtType] || 'pnl';
        
        Object.entries(reviewPayload[stmtType]?.data || {}).forEach(([extractedYear, yearData]) => {
          const cleanYear = extractedYear.replace(/\D/g, '').slice(0, 4);
          if (cleanYear.length !== 4) return;
          yearsSet.add(cleanYear);
          
          Object.entries(yearData).forEach(([extractedSec, items]) => {
            Object.entries(items).forEach(([extractedItem, val]) => {
              const rowId = `${stmtType}_${extractedSec}_${extractedItem}`;
              
              if (rowStatuses[rowId] === 'deleted') return; // Skip deleted rows

              const mapping = itemMappings[rowId];
              const sectionKey = mapping?.section || extractedSec;
              const finalItemKey = mapping?.item || extractedItem;
              const parsedVal = parseFloat(val);

              if (!isNaN(parsedVal)) {
                if (!updatedData[targetDocKey]) updatedData[targetDocKey] = {};
                if (!updatedData[targetDocKey][sectionKey]) updatedData[targetDocKey][sectionKey] = {};
                if (!updatedData[targetDocKey][sectionKey][cleanYear]) updatedData[targetDocKey][sectionKey][cleanYear] = {};
                
                const safeKey = finalItemKey.replace(/\./g, '');
                updatedData[targetDocKey][sectionKey][cleanYear][safeKey] = parsedVal;
                
                if (!newItemsMap[targetDocKey]) newItemsMap[targetDocKey] = {};
                if (!newItemsMap[targetDocKey][sectionKey]) newItemsMap[targetDocKey][sectionKey] = [];
                if (!newItemsMap[targetDocKey][sectionKey].includes(finalItemKey)) {
                    newItemsMap[targetDocKey][sectionKey].push(finalItemKey);
                }
              }
            });
          });
        });
      });

      const projectRef = doc(db, 'projects', projectId, 'fsa', fsaId);
      await setDoc(projectRef, { 
        financialData: updatedData,
        activeYearsList: Array.from(yearsSet).sort(),
        activeItemsMap: newItemsMap
      }, { merge: true });

      setReviewPayload(null);
      if (pdfCtx.pdfDrawerOpen) pdfCtx.togglePdfDrawer();
      pdfCtx.resetExtractionState();
      
    } catch (error) {
      console.error("Injection Error:", error);
      alert("Failed to inject data.");
    }
  };

  const renderReviewModal = () => {
    if (!reviewPayload) return null;

    // IF CONFLICT: Render Conflict UI First
    if (conflictYears) {
      return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="fade-in-up" style={{ width: 500, background: 'var(--bg-primary)', padding: 32, borderRadius: 16, border: '1px solid var(--border-strong)' }}>
            <h3 style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px 0' }}><AlertCircle /> Data Conflict Detected</h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
              The extracted document contains data for years that already exist in your matrix ({conflictYears.join(', ')}). 
              Proceeding will overwrite those specific years with the newly extracted values.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
               <button onClick={() => setReviewPayload(null)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' }}>Cancel Import</button>
               <button onClick={() => handleConflictDecision({})} style={{ padding: '8px 16px', background: '#f59e0b', border: 'none', color: '#000', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Force Overwrite All</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex' }}>
        
        {/* LEFT PANE: PDF Viewer (Hide if Data-Only) */}
        {pdfBlobUrl && viewMode !== 'data-only' && (
          <div style={{ width: viewMode === 'pdf-only' ? '100%' : '42%', borderRight: '1px solid var(--border-strong)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', transition: 'width 0.3s' }}>
            <div style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>📄 Extracted Document</span>
              <button onClick={() => setViewMode(viewMode === 'split' ? 'pdf-only' : 'split')} style={{ padding: '4px 12px', background: 'var(--bg-hover)', border: 'none', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' }}>
                {viewMode === 'split' ? '⛶ Expand PDF' : '◩ Split View'}
              </button>
            </div>
            <iframe src={pdfBlobUrl} style={{ flex: 1, width: '100%', border: 'none' }} title="PDF Review" />
          </div>
        )}

        {/* RIGHT PANE: Data Mapper (Hide if PDF-Only) */}
        {viewMode !== 'pdf-only' && (
          <div style={{ flex: 1, padding: 36, background: 'var(--bg-primary)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}><Sparkles color="var(--accent-color)" /> AI Schema Mapping Review</h2>
                <p style={{ color: 'var(--text-muted)', margin: '8px 0 0 0' }}>Verify, edit, and map extracted line items into your chart of accounts.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
                {pdfBlobUrl && <button onClick={() => setViewMode(viewMode === 'split' ? 'data-only' : 'split')} style={{ padding: '6px 12px', background: 'var(--bg-hover)', border: 'none', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' }}>
                  {viewMode === 'split' ? '⛶ Expand Data' : '◩ Split View'}
                </button>}
              </div>
            </div>

            {/* MAPPING TABLE */}
            <div style={{ flex: 1 }}>
              {Object.keys(reviewPayload).map(stmtType => {
                const stmtData = reviewPayload[stmtType]?.data || {};
                if (Object.keys(stmtData).length === 0) return null;

                const frontendDocMap = { 'profit_and_loss': 'pnl', 'balance_sheet': 'bs', 'cash_flow': 'cashflow' };
                const docKey = frontendDocMap[stmtType] || 'pnl';
                const schemaNodes = configSchemas?.chartOfAccounts?.shared?.[docKey] || [];

                // Reformat (Year -> Section -> Item) into (Section -> Item -> Year) for UI
                const uiTable = {};
                const extractedYears = new Set();
                Object.entries(stmtData).forEach(([year, sections]) => {
                  const cleanYear = year.replace(/\D/g, '').slice(0, 4);
                  extractedYears.add(cleanYear);
                  Object.entries(sections || {}).forEach(([sec, items]) => {
                    if (!uiTable[sec]) uiTable[sec] = {};
                    Object.entries(items || {}).forEach(([itm, val]) => {
                      if (!uiTable[sec][itm]) uiTable[sec][itm] = {};
                      uiTable[sec][itm][cleanYear] = val;
                    });
                  });
                });

                return (
                  <div key={stmtType} style={{ marginBottom: 32 }}>
                    <h3 style={{ background: 'var(--bg-tertiary)', padding: '16px', margin: 0, borderTopLeftRadius: 8, borderTopRightRadius: 8, border: '1px solid var(--border-subtle)', textTransform: 'uppercase', fontSize: 14 }}>
                      📄 {stmtType.replace(/_/g, ' ')}
                    </h3>
                    
                    <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderTop: 'none' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>Extracted Line Item ➔ Target Schema</th>
                          {Array.from(extractedYears).sort().map(y => (
                            <th key={y} style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>{y}</th>
                          ))}
                          <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(uiTable).map(([secKey, items]) => (
                          <React.Fragment key={secKey}>
                            <tr>
                              <td colSpan={Array.from(extractedYears).length + 2} style={{ padding: '8px 16px', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700 }}>
                                📁 Extracted Group: {secKey}
                              </td>
                            </tr>
                            
                            {Object.entries(items).map(([itemKey, yearVals]) => {
                              const rowId = `${stmtType}_${secKey}_${itemKey}`;
                              const status = rowStatuses[rowId];
                              const isDeleted = status === 'deleted';
                              const isReviewed = status === 'reviewed';

                              return (
                                <tr key={rowId} style={{ opacity: isDeleted ? 0.3 : 1, background: isReviewed ? 'rgba(16,185,129,0.05)' : 'transparent', borderBottom: '1px solid var(--border-subtle)', transition: 'all 0.2s' }}>
                                  <td style={{ padding: '16px', width: '40%' }}>
                                    <div style={{ fontWeight: 600, marginBottom: 8, color: isDeleted ? '#ef4444' : 'var(--text-primary)' }}>↳ {itemKey}</div>
                                    <select 
                                      disabled={isDeleted}
                                      value={itemMappings[rowId]?.item || '__NEW__'}
                                      onChange={(e) => setItemMappings(prev => ({ ...prev, [rowId]: { ...prev[rowId], item: e.target.value } }))}
                                      className="styled-select"
                                    >
                                      <option value="__NEW__" style={{ color: '#ef4444' }}>+ Create Custom Item: "{itemKey}"</option>
                                      {schemaNodes.filter(n => n.type === 'section').map(secNode => (
                                        <optgroup key={secNode.key} label={`📁 ${secNode.title || secNode.key}`}>
                                          {(secNode.items || []).map(schemaItem => {
                                            const label = typeof schemaItem === 'string' ? schemaItem : schemaItem.label || schemaItem.dataKey;
                                            return <option key={label} value={label}>↳ Map to: {label}</option>
                                          })}
                                        </optgroup>
                                      ))}
                                    </select>
                                  </td>
                                  
                                  {Array.from(extractedYears).sort().map(y => (
                                    <td key={y} style={{ padding: '16px', textAlign: 'right' }}>
                                      <input
                                          type="text"
                                          disabled={isDeleted}
                                          className="glow-input"
                                          style={{ minWidth: '80px', width: '100%', fontSize: '13px' }}
                                          defaultValue={yearVals[y] !== undefined ? formatIN(yearVals[y], 2) : ''}
                                          onFocus={e => {
                                              const val = e.target.value.replace(/,/g, '');
                                              if (parseFloat(val) === 0 || val === '') e.target.value = '';
                                              else e.target.select();
                                          }}
                                          onBlur={(e) => {
                                              let rawVal = e.target.value.replace(/,/g, '').trim();
                                              if (!rawVal || rawVal === '') rawVal = '0';
                                              const numericValue = parseFloat(rawVal);
                                              if (!isNaN(numericValue)) {
                                                  e.target.value = formatIN(numericValue, 2);
                                                  handleReviewEdit(stmtType, secKey, itemKey, y, numericValue);
                                              }
                                          }}
                                      />
                                    </td>
                                  ))}
                                  
                                  <td style={{ padding: '16px', textAlign: 'center' }}>
                                    {isDeleted ? (
                                      <button onClick={() => setRowStatuses(prev => ({...prev, [rowId]: 'pending'}))} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 20, fontSize: 11, cursor: 'pointer' }}>Undo Delete</button>
                                    ) : (
                                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                        <button 
                                          onClick={() => setRowStatuses(prev => ({...prev, [rowId]: isReviewed ? 'pending' : 'reviewed'}))}
                                          style={{ padding: '6px 12px', background: isReviewed ? 'rgba(16,185,129,0.1)' : 'var(--bg-hover)', border: isReviewed ? '1px solid #10b981' : '1px solid var(--border-strong)', color: isReviewed ? '#10b981' : 'var(--text-primary)', borderRadius: 20, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                        >
                                          {isReviewed ? <CheckCircle2 size={14}/> : <div style={{width:12, height:12, borderRadius:'50%', border:'1px solid currentColor'}}/>}
                                          {isReviewed ? 'Reviewed' : 'Review'}
                                        </button>
                                        {isReviewed && (
                                          <button onClick={() => setRowStatuses(prev => ({...prev, [rowId]: 'deleted'}))} style={{ padding: '6px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 20, cursor: 'pointer' }} title="Delete this line">
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>

            {/* ACTION FOOTER */}
            <div style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={14} /> Values mapped to existing fields will overwrite current inputs.
              </span>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setReviewPayload(null)} style={{ padding: '12px 24px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>Cancel Extraction</button>
                <button onClick={confirmAndInject} style={{ padding: '12px 24px', borderRadius: 8, background: 'var(--accent-color)', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={18} /> Confirm & Save to Matrix
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loadingMetadata) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
         <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
         <span>Synchronizing multi-column spreadsheet matrix...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24, position: 'relative' }}>
      
      {/* ── CLEAN SAAS THEME CSS ── */}
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');

        .fsa-matrix-wrapper {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-secondary);
          position: relative;
          z-index: 10;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }
        
        .fsa-matrix-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          min-width: max-content;
        }

        .sticky-col {
          position: sticky;
          left: 0;
          background: var(--bg-secondary);
          z-index: 20;
          box-shadow: inset -1px 0 0 var(--border-subtle);
          transition: background 0.2s ease;
        }

        .sticky-header {
          position: sticky;
          top: 0;
          background: var(--bg-tertiary);
          z-index: 30;
          box-shadow: inset 0 -1px 0 var(--border-subtle);
        }

        .sticky-col.sticky-header {
          z-index: 40;
        }

        .glass-row {
          transition: background 0.15s ease;
        }
        
        .glass-row:hover .sticky-col {
          background: var(--bg-hover);
          box-shadow: inset -1px 0 0 var(--border-strong), inset 3px 0 0 var(--accent-color);
        }

        .glass-row:hover td {
          background: var(--bg-hover);
        }

        .glow-input {
          width: 100%;
          max-width: 180px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          text-align: right;
          outline: none;
          font-family: 'JetBrains Mono', monospace;
          transition: all 0.2s ease;
        }

        .glow-input:focus {
          background: var(--bg-secondary);
          border-color: var(--accent-color);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
          z-index: 50;
          position: relative;
        }

        .glow-input:disabled {
          background: transparent !important;
          border: none !important;
          color: var(--text-muted) !important;
          box-shadow: none !important;
        }

        /* ── NEW: DROPDOWN CSS FIX ── */
        .styled-select {
          background: var(--bg-tertiary);
          border: 1px dashed var(--border-strong);
          color: var(--text-primary);
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          outline: none;
          cursor: pointer;
          width: 100%;
          transition: all 0.2s ease;
          appearance: none;
          background-image: url('data:image/svg+xml;utf8,<svg fill="%23999" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>');
          background-repeat: no-repeat;
          background-position: right 8px center;
        }
        .styled-select:hover, .styled-select:focus {
          border-color: var(--accent-color);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }

        .empty-state-pulse {
          background: linear-gradient(90deg, rgba(239,68,68,0) 0%, rgba(239,68,68,0.05) 50%, rgba(239,68,68,0) 100%);
          background-size: 200% 100%;
          animation: wavePulse 3s infinite linear;
        }

        @keyframes wavePulse {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }

        .sub-btn-styled {
          background: rgba(16, 185, 129, 0.1);
          border: 1px dashed rgba(16, 185, 129, 0.4);
          color: #10b981;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .sub-btn-styled:hover {
          background: #10b981;
          color: #fff;
        }

        .fsa-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
        .fsa-scroll::-webkit-scrollbar-track { background: transparent; }
        .fsa-scroll::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }
        .fsa-scroll::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

        @media print {
          body * { visibility: hidden; }
          .fsa-matrix-wrapper, .fsa-matrix-wrapper * { visibility: visible; }
          .fsa-matrix-wrapper { position: absolute; left: 0; top: 0; overflow: visible !important; box-shadow: none !important; border: none !important; background: transparent !important; }
          .glow-input { border: none !important; color: #000 !important; background: transparent !important; }
          .sticky-col, .sticky-header { position: static !important; background: transparent !important; color: #000 !important; }
        }
      `}} />

      {/* ── TOP NAV BAR: DOCUMENT TABS & MANAGERS ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, background: 'var(--bg-secondary)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-subtle)', position: 'relative', zIndex: 10 }}>
        
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, flex: '1 1 auto' }}>
          {availableDocs.map(doc => (
            <button
              key={doc.id}
              onClick={() => setActiveDocKey(doc.key)}
              style={{
                background: activeDocKey === doc.key ? 'var(--accent-color)' : 'var(--bg-tertiary)',
                border: activeDocKey === doc.key ? '1px solid var(--accent-color)' : '1px solid var(--border-subtle)',
                color: activeDocKey === doc.key ? '#fff' : 'var(--text-muted)',
                padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', transition: 'all 0.2s ease',
              }}
            >
              <FileText size={16} /> {doc.name}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          <button
            onClick={handleOpenReadOnlyMode}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.28)',
              color: '#3b82f6',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
            title="Open statements in read only mode"
          >
            <Eye size={14} /> Read Only Mode
          </button>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
            {/* File Operations */}
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <button onClick={pdfCtx.togglePdfDrawer} style={{ background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.08)', color: '#10b981', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }} title="AI PDF Extraction">
                <ScanLine size={15} /> Scan PDF
              </button>
              <button onClick={handleExportJSON} style={{ background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }} title="Export Schema to JSON">
                <Download size={15} /> Export JSON
              </button>
              <label style={{ background: 'transparent', border: 'none', color: '#e2e8f0', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', margin: 0, gap: 6 }} title="Import Schema from JSON">
                <Upload size={15} /> Import JSON
                <input type="file" accept=".json" onChange={handleImportJSON} style={{ display: 'none' }} />
              </label>
            </div>

            <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
              <button
                onClick={() => setYearSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                style={{ background: 'transparent', border: 'none', borderRight: '1px solid var(--border-subtle)', color: 'var(--accent-text)', padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <ArrowUpDown size={14} /> {yearSortOrder.toUpperCase()}
              </button>
              <button
                onClick={handleAddYear}
                style={{ background: 'rgba(16, 185, 129, 0.1)', border: 'none', color: '#10b981', padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={14} /> Add Years
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── EXCEL-GRADE SPREADSHEET INPUT MATRIX ── */}      
      <div className="fsa-matrix-wrapper fsa-scroll">
        <table className="fsa-matrix-table">
          <thead>
            <tr>
              <th className="sticky-header sticky-col" style={{ padding: '16px 24px', fontSize: 12, color: 'var(--accent-text)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: '280px', minWidth: '220px', maxWidth: '350px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} /> Particulars
                </div>
              </th>
              {sortedActiveYears.map(year => (
                <th key={year} className="sticky-header" style={{ padding: '16px 24px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, textTransform: 'uppercase', textAlign: 'right', minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
                    <span style={{ background: 'var(--bg-hover)', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)' }}>FY {year} (₹)</span>
                    <button 
                      onClick={() => handleRemoveYear(year)}
                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: 6, cursor: 'pointer', display: 'flex', padding: 4 }}
                      title={`Delete FY ${year} Column`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {currentCoA.map((node, nodeIndex) => {

              // ── 1. RENDER STRUCTURAL GROUP HEADS ──
              if (node.type === 'group') {
                return (
                  <tr key={`grp_${nodeIndex}`}>
                    <td className="sticky-col" style={{ padding: '16px 24px', fontSize: 13, fontWeight: 800, color: 'var(--accent-text)', borderBottom: '1px solid var(--border-subtle)', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}>
                      {node.title}
                    </td>
                    {sortedActiveYears.map(year => (
                      <td key={year} style={{ borderBottom: '1px solid var(--border-subtle)', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}></td>
                    ))}
                  </tr>
                );
              }

              // ── 2. RENDER ENGINE TOTALS/FORMULAS (READ-ONLY) ──
              if (node.type === 'total') {
                return (
                  <tr key={`tot_${nodeIndex}`}>
                    <td className="sticky-col" style={{ padding: '14px 24px', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', background: 'var(--bg-tertiary)', borderBottom: '2px solid var(--border-strong)' }}>
                      Σ {node.title}
                    </td>
                    {sortedActiveYears.map(year => {
                      const calculatedValue = multiYearModels[year]?.[node.key] || 0;
                      return (
                        <td key={year} style={{ padding: '14px 24px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", background: 'var(--bg-tertiary)', borderBottom: '2px solid var(--border-strong)' }}>
                          {formatValue(node.key, calculatedValue, configSchemas)}
                        </td>
                      );
                    })}
                  </tr>
                );
              }

              // ── 3. RENDER DYNAMIC EQUITIES INJECTION NODE ──
              if (node.dynamic && node.key === 'equity_placeholder') {
                const equitySchema = configSchemas?.entityTypes?.[activeEntityType]?.equitySchema?.[0];
                if (!equitySchema) return null;

                const isEqExpanded = expandedSections['equity'] !== false;
                const activeLines = activeItemsMap[activeDocKey]?.['equity'] || [];
                const unselectedLines = (equitySchema.items || []).filter(definedItm => !activeLines.includes(definedItm.label));

                return (
                  <React.Fragment key={`dyn_equity_${nodeIndex}`}>
                    <tr onClick={() => toggleSection('equity')} style={{ cursor: 'pointer' }}>
                      <td className="sticky-col" style={{ padding: '12px 24px', fontSize: 13, fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-hover)', borderBottom: '1px solid var(--border-subtle)' }}>
                        {isEqExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span>{equitySchema.title} <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginLeft: 8 }}>({activeEntityType} node)</span></span>
                      </td>
                      {sortedActiveYears.map(year => (
                        <td key={year} style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border-subtle)' }}></td>
                      ))}
                    </tr>

                    {isEqExpanded && (
                      <>
                        {activeLines.map((eqItemLabel, eqIdx) => {
                          const originalItem = (equitySchema.items || []).find(itm => itm.label === eqItemLabel);
                          const itemKey = originalItem ? originalItem.dataKey : eqItemLabel.toLowerCase().replace(/[^a-z0-9]/g, '');
                          
                          return (
                            <tr className="glass-row" key={`eq_${itemKey}_${eqIdx}`}>
                              <td className="sticky-col" style={{ padding: '10px 24px 10px 48px', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, borderBottom: '1px solid var(--border-subtle)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button onClick={() => handleEditLineItem('equity', eqItemLabel)} style={{ background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--text-muted)', padding: 4, cursor: 'pointer', display: 'flex' }}>
                                      <Edit2 size={12} />
                                    </button>
                                    <button onClick={() => handleDeactivateLineItem('equity', eqItemLabel)} style={{ background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 4, color: '#ef4444', padding: 4, cursor: 'pointer', display: 'flex' }}>
                                      <X size={12} />
                                    </button>
                                  </div>
                                  <span>{eqItemLabel}</span>
                                </div>
                              </td>
                              {sortedActiveYears.map(year => {
                                const rawVal = getInputValue(activeDocKey, 'equity', itemKey, year);
                                return (
                                  <td key={year} style={{ padding: '8px 24px', textAlign: 'right', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <input 
                                      type="text"
                                      className="glow-input"
                                      key={`eq-${activeDocKey}-${node.key}-${itemKey}-${year}`}
                                      defaultValue={rawVal ? formatIN(rawVal, 2) : '0.00'}
                                      onInput={applyLiveIndianFormat}
                                      onFocus={e => {
                                        const val = e.target.value.replace(/,/g, '');
                                        if (parseFloat(val) === 0 || val === '') e.target.value = '';
                                        else e.target.select();
                                      }}
                                      onBlur={(e) => handleInputBlur(e, activeDocKey, 'equity', itemKey, year)}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}

                        <tr>
                          <td className="sticky-col" style={{ padding: '10px 24px 10px 48px', borderBottom: '1px solid var(--border-subtle)' }}>
                            <select 
                              value=""
                              onChange={e => handleActivateLineItem('equity', e.target.value)}
                              className="styled-select"
                            >
                              <option value="" disabled>+ Add Item...</option>
                              <option value="__CUSTOM__">⚡ Create Custom Line...</option>
                              {unselectedLines.map(line => (
                                <option key={line.dataKey} value={line.label}>{line.label}</option>
                              ))}
                            </select>
                          </td>
                          {sortedActiveYears.map(year => (
                            <td key={year} style={{ borderBottom: '1px solid var(--border-subtle)' }}></td>
                          ))}
                        </tr>
                      </>
                    )}
                  </React.Fragment>
                );
              }

              // ── 4. RENDER STANDARD CHANNELS & INPUT SECTIONS ──
              if (node.type === 'section') {
                const isExpanded = expandedSections[node.key] !== false;
                const activeLines = activeItemsMap[activeDocKey]?.[node.key] || [];

                const unselectedLines = (node.items || []).filter(definedItm => {
                  const labelStr = typeof definedItm === 'string' ? definedItm : (definedItm.label || definedItm.dataKey);
                  return !activeLines.includes(labelStr);
                });

                const hierarchyMap = new Map();
                activeLines.forEach(itemLabel => {
                  if (itemLabel.includes('||')) {
                    const [parent, sub] = itemLabel.split('||');
                    if (!hierarchyMap.has(parent)) hierarchyMap.set(parent, { isParent: true, dataKey: parent, subs: [] });
                    hierarchyMap.get(parent).subs.push({ label: sub, fullValue: itemLabel });
                  } else {
                    hierarchyMap.set(itemLabel, { isParent: false, dataKey: itemLabel, subs: [] });
                  }
                });

                return (
                  <React.Fragment key={`sec_${nodeIndex}`}>
                    <tr onClick={() => toggleSection(node.key)} style={{ cursor: 'pointer' }}>
                      <td className="sticky-col" style={{ padding: '14px 24px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
                        {isExpanded ? <ChevronDown size={14} color="var(--accent-color)" /> : <ChevronRight size={14} color="var(--accent-color)" />}
                        {node.title}
                      </td>
                      {sortedActiveYears.map(year => (
                        <td key={year} style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}></td>
                      ))}
                    </tr>

                    {isExpanded && (
                      <>
                        {/* TRUE EMPTY STATE PULSE */}
                        {activeLines.length === 0 && (
                          <tr className="empty-state-pulse">
                            <td className="sticky-col" style={{ padding: '20px 48px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', borderBottom: '1px solid var(--border-subtle)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Zap size={14} color="#ef4444" /> No inputs active.
                              </div>
                            </td>
                            {sortedActiveYears.map(year => <td key={year} style={{ borderBottom: '1px solid var(--border-subtle)' }}></td>)}
                          </tr>
                        )}

                        {/* Active Items */}
                        {Array.from(hierarchyMap.entries()).map(([parentLabel, data], pIdx) => (
                          <React.Fragment key={`itm_${nodeIndex}_${pIdx}`}>
                            
                            {/* Parent Input Row */}
                            <tr className="glass-row">
                              <td className="sticky-col" style={{ padding: '10px 24px 10px 48px', fontSize: 13, color: data.subs.length > 0 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: data.subs.length > 0 ? 700 : 500, borderBottom: '1px solid var(--border-subtle)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button onClick={() => handleEditLineItem(node.key, parentLabel)} style={{ background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--text-muted)', padding: 4, cursor: 'pointer', display: 'flex' }}>
                                        <Edit2 size={12} />
                                      </button>
                                      <button 
                                        onClick={() => handleDeactivateLineItem(node.key, parentLabel)}
                                        style={{ background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 4, color: '#ef4444', padding: 4, cursor: 'pointer', display: 'flex' }}
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                    <span>{parentLabel}</span>
                                  </div>
                                  
                                  <button onClick={() => handleAddSubItem(node.key, parentLabel)} className="sub-btn-styled" title="Add nested breakdown lines">
                                    <Plus size={12} strokeWidth={3} /> Sub
                                  </button>
                                </div>
                              </td>
                              {sortedActiveYears.map(year => {
                                const rawVal = data.subs.length > 0 
                                  ? getParentSum(activeDocKey, node.key, parentLabel, year)
                                  : getInputValue(activeDocKey, node.key, data.dataKey, year);

                                return (
                                <td key={year} style={{ padding: '8px 24px', textAlign: 'right', borderBottom: '1px solid var(--border-subtle)' }}>
                                  <input 
                                    type="text"
                                    className="glow-input"
                                    key={`${activeDocKey}-${node.key}-${data.dataKey}-${year}`} 
                                    defaultValue={rawVal ? formatIN(rawVal, 2) : '0.00'}
                                    onInput={data.subs.length === 0 ? applyLiveIndianFormat : undefined}
                                    onFocus={e => {
                                      if (data.subs.length > 0) return;
                                      const val = e.target.value.replace(/,/g, '');
                                      if (parseFloat(val) === 0 || val === '') e.target.value = '';
                                      else e.target.select();
                                    }}
                                    onBlur={(e) => {
                                      if (data.subs.length === 0) handleInputBlur(e, activeDocKey, node.key, data.dataKey, year);
                                    }}
                                    disabled={data.subs.length > 0} 
                                  />
                                </td>
                                );
                              })}
                            </tr>

                            {/* Child Sub-Items Rows */}
                            {data.subs.map((sub, sIdx) => (
                              <tr className="glass-row" key={`sub_${nodeIndex}_${pIdx}_${sIdx}`}>
                                <td className="sticky-col" style={{ padding: '8px 24px 8px 72px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button onClick={() => handleEditLineItem(node.key, sub.fullValue)} style={{ background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--text-muted)', padding: 2, cursor: 'pointer', display: 'flex' }}>
                                        <Edit2 size={10} />
                                      </button>
                                      <button 
                                        onClick={() => handleDeactivateLineItem(node.key, sub.fullValue)}
                                        style={{ background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 4, color: '#ef4444', padding: 2, cursor: 'pointer', display: 'flex' }}
                                      >
                                        <X size={10} />
                                      </button>
                                    </div>
                                    <span style={{ borderLeft: '1px solid var(--border-strong)', borderBottom: '1px solid var(--border-strong)', width: 8, height: 10, display: 'inline-block', transform: 'translateY(-4px)', borderRadius: '0 0 0 4px' }}></span>
                                    <span>{sub.label}</span>
                                  </div>
                                </td>
                                {sortedActiveYears.map(year => {
                                  const rawVal = getInputValue(activeDocKey, node.key, sub.fullValue, year);
                                  return (
                                    <td key={year} style={{ padding: '6px 24px', textAlign: 'right', borderBottom: '1px solid var(--border-subtle)' }}>
                                      <input
                                          type="text"
                                          className="glow-input"
                                          style={{ padding: '6px 10px', fontSize: 13 }}
                                          key={`sub-${activeDocKey}-${node.key}-${sub.fullValue}-${year}`}
                                          defaultValue={rawVal ? formatIN(rawVal, 2) : '0.00'}
                                          onInput={applyLiveIndianFormat}
                                          onFocus={e => {
                                            const val = e.target.value.replace(/,/g, '');
                                            if (parseFloat(val) === 0 || val === '') e.target.value = '';
                                            else e.target.select();
                                          }}
                                          onBlur={(e) => handleInputBlur(e, activeDocKey, node.key, sub.fullValue, year)}
                                      />
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}

                          </React.Fragment>
                        ))}

                        {/* Section Dropdown Appender */}
                        <tr>
                          <td className="sticky-col" style={{ padding: '10px 24px 10px 48px', borderBottom: '1px solid var(--border-subtle)' }}>
                            <select 
                              value=""
                              onChange={e => handleActivateLineItem(node.key, e.target.value)}
                              className="styled-select"
                            >
                              <option value="" disabled>+ Add Item...</option>
                              <option value="__CUSTOM__">⚡ Create Custom Line...</option>
                              {unselectedLines.map(line => {
                                const labelStr = typeof line === 'string' ? line : (line.label || line.dataKey);
                                const displayLabel = labelStr.includes('||') ? labelStr.replace('||', ' ➔ ') : labelStr;
                                return (
                                  <option key={labelStr} value={labelStr}>{displayLabel}</option>
                                );
                              })}
                            </select>
                          </td>
                          {sortedActiveYears.map(year => (
                            <td key={year} style={{ borderBottom: '1px solid var(--border-subtle)' }}></td>
                          ))}
                        </tr>

                      </>
                    )}
                  </React.Fragment>
                );
              }

              return null;
            })}
          </tbody>   
        </table>
      </div>

      {/* ── SAAS PDF EXTRACTION DRAWER ── */}
      {pdfCtx.pdfDrawerOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          
          <div className="fade-in-up" style={{ width: 450, height: '100%', boxSizing: 'border-box', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-strong)', boxShadow: '-10px 0 30px rgba(0,0,0,0.5)', padding: 32, display: 'flex', flexDirection: 'column', color: 'var(--text-primary)', overflowY: 'auto' }}>            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: 'rgba(99,102,241,0.1)', padding: 8, borderRadius: 8 }}><Zap size={20} color="var(--accent-color)" /></div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>AI Data Extractor</h3>
              </div>
              <button onClick={pdfCtx.togglePdfDrawer} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Upload a scanned or native PDF. The Async Enterprise Engine will classify pages and extract structured numerical values matching your current schema.
              </div>

              {!pdfCtx.selectedPdfFile ? (
                <label style={{ border: '2px dashed var(--border-strong)', borderRadius: 12, padding: 40, textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: 'var(--bg-tertiary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <UploadCloud size={32} color="var(--accent-color)" />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Click to Upload Annual Report</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>PDF up to 50MB</span>
                  <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => {
                    pdfCtx.resetExtractionState();
                    pdfCtx.setSelectedPdfFile(e.target.files[0]);
                    e.target.value = null;
                  }} />
                </label>
              ) : (
                <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', padding: 16, borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FileText size={20} color="#10b981" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>{pdfCtx.selectedPdfFile.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(pdfCtx.selectedPdfFile.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                  </div>
                  <button onClick={pdfCtx.resetExtractionState} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                </div>
              )}

              {pdfCtx.isExtracting && (
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <RefreshCw size={32} color="var(--accent-color)" className="spin-animation" style={{ animation: 'spin 2s linear infinite', marginBottom: 16 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Connecting to Hugging Face...</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Analyzing pages and extracting LLM vectors...</div>
                </div>
              )}

              {pdfCtx.extractionResult && (
                <div className="fade-in-up" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 20 }}>
                  {pdfCtx.extractionResult.status === 'ERROR' ? (
                    <div style={{ color: '#ef4444', display: 'flex', gap: 10 }}>
                      <AlertCircle size={20} />
                      <span style={{ fontSize: 13, lineHeight: 1.5 }}>{pdfCtx.extractionResult.message}</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 10, color: '#10b981', marginBottom: 16 }}>
                        <CheckCircle2 size={20} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{pdfCtx.extractionResult.message}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
                        <span>Confidence: <strong style={{ color: 'var(--text-primary)' }}>{(pdfCtx.extractionResult.confidence * 100).toFixed(1)}%</strong></span>
                        <span>Documents Parsed: <strong style={{ color: 'var(--text-primary)' }}>{pdfCtx.extractionResult.parsedNodes}</strong></span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
                        <button 
                          onClick={() => handleBulkInjection(pdfCtx.extractionResult.payload)} 
                          style={{ width: '100%', background: 'var(--accent-color)', color: '#fff', border: 'none', padding: 16, borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
                        >
                          <Wand2 size={18} /> Review & Map Extracted Data
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {!pdfCtx.isExtracting && !pdfCtx.extractionResult && pdfCtx.selectedPdfFile && (
               <button onClick={async () => {
                  try {
                    await pdfCtx.executePdfExtraction();
                  } catch (err) {
                    alert(`Extraction failed: ${err.message}`);
                  }
               }} 
                style={{ 
                  width: '100%', 
                  background: 'var(--text-primary)', 
                  color: 'var(--bg-primary)', 
                  border: 'none', 
                  padding: 16, 
                  borderRadius: 8, 
                  fontSize: 14, 
                  fontWeight: 700, 
                  cursor: 'pointer', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  gap: 8,
                  marginTop: 24,
                  flexShrink: 0
                }}
               >
                 <ScanLine size={18} /> Begin LLM Extraction
               </button>
            )}

            <style dangerouslySetInnerHTML={{__html: `@keyframes spin { 100% { transform: rotate(360deg); } }`}} />
          </div>
        </div>
      )}

      {/* ── NEW: DATA REVIEW MODAL (MIDDLE STEP) ── */}
      {renderReviewModal()}

    </div>
  );
}
