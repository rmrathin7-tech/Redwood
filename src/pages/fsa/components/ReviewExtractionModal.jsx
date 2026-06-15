/**
 * src/pages/fsa/components/ReviewExtractionModal.jsx
 * * SMART AI DATA CLEANING & ROUTING ENGINE
 */

import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, CheckCircle2, Trash2, Edit2, Sparkles, X } from 'lucide-react';
import { formatIN } from '../utils/fsaFormatters.js';

export default function ReviewExtractionModal({ 
  payload, 
  configSchemas, 
  activeEntityType, 
  activeYearsList, 
  onCancel, 
  onConfirm,
  pdfBlobUrl,
  viewMode,
  setViewMode
}) {
  const [conflictYears, setConflictYears] = useState(null);
  const [itemMappings, setItemMappings] = useState({});
  const [rowStatuses, setRowStatuses] = useState({});
  const [extractedData, setExtractedData] = useState({});

  // ── 1. THE SMART AUTO-MATCHER (Runs on load) ──
  useEffect(() => {
    if (!payload) return;

    const initialMappings = {};
    const initialStatuses = {};
    const cleanExtracted = {};
    const extractedYears = new Set();

    const coreData = payload.extracted_data || payload;

    Object.keys(coreData).forEach(stmtType => {
      if (['document_info', 'page_summary', 'telemetry'].includes(stmtType)) return;

      const frontendDocMap = { 'profit_and_loss': 'pnl', 'balance_sheet': 'bs', 'cash_flow': 'cashflow' };
      const docKey = frontendDocMap[stmtType] || 'pnl';
      const schemaNodes = configSchemas?.chartOfAccounts?.shared?.[docKey] || [];
      
      // Get all valid sections including dynamic equity
      const validSections = schemaNodes.filter(n => n.type === 'section' || (n.dynamic && n.key === 'equity_placeholder'));

      const stmtData = coreData[stmtType]?.data || coreData[stmtType] || {};
      cleanExtracted[stmtType] = {};

      Object.entries(stmtData).forEach(([year, sections]) => {
        const cleanYear = year.replace(/\D/g, '').slice(0, 4);
        if (cleanYear.length === 4) extractedYears.add(cleanYear);

        Object.entries(sections || {}).forEach(([aiSec, items]) => {
          if (!cleanExtracted[stmtType][aiSec]) cleanExtracted[stmtType][aiSec] = {};
          
          Object.entries(items || {}).forEach(([aiItem, val]) => {
            if (!cleanExtracted[stmtType][aiSec][aiItem]) cleanExtracted[stmtType][aiSec][aiItem] = {};
            cleanExtracted[stmtType][aiSec][aiItem][cleanYear] = val;

            const rowId = `${stmtType}_${aiSec}_${aiItem}`;
            
            // --- FUZZY MATCHING LOGIC ---
            let bestSec = aiSec;
            let bestItem = aiItem;

            // Normalize strings for comparison (remove spaces, underscores, lowercase)
            const norm = (str) => String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
            const aiSecNorm = norm(aiSec);
            const aiItemNorm = norm(aiItem);

            // Fuzzy Match Section
            let matchedSectionNode = validSections.find(s => norm(s.key) === aiSecNorm || norm(s.title || '') === aiSecNorm);
            
            // Special Equity Catch
            if (!matchedSectionNode && (aiSecNorm.includes('equity') || aiSecNorm.includes('shareholder'))) {
                matchedSectionNode = { key: 'equity', isEquity: true };
            }

            if (matchedSectionNode) {
              bestSec = matchedSectionNode.key;
              
              // Fuzzy Match Line Item inside the found section
              let targetItems = [];
              if (matchedSectionNode.isEquity) {
                  targetItems = configSchemas?.entityTypes?.[activeEntityType]?.equitySchema?.[0]?.items || [];
              } else {
                  targetItems = matchedSectionNode.items || [];
              }

              const matchedItem = targetItems.find(i => {
                  const lbl = norm(i.label || i.dataKey || i);
                  return lbl === aiItemNorm || lbl.includes(aiItemNorm) || aiItemNorm.includes(lbl);
              });

              if (matchedItem) {
                  bestItem = matchedItem.label || matchedItem.dataKey || matchedItem;
              }
            }

            // Format raw AI keys (e.g., "revenue_from_operations") into clean Title Case
            const cleanCustomName = aiItem
              .replace(/_/g, ' ')
              .replace(/\b\w/g, char => char.toUpperCase());

            initialMappings[rowId] = { section: bestSec, item: bestItem, customName: cleanCustomName };
            initialStatuses[rowId] = 'pending';
          });
        });
      });
    });

    // Check for Year Conflicts
    const conflicts = Array.from(extractedYears).filter(y => activeYearsList.includes(y));
    if (conflicts.length > 0) {
      setConflictYears(conflicts);
    }

    setExtractedData(cleanExtracted);
    setItemMappings(initialMappings);
    setRowStatuses(initialStatuses);
  }, [payload, configSchemas, activeEntityType, activeYearsList]);


  // ── 2. VALUE EDITING HANDLER ──
  const handleValueEdit = (stmtType, secKey, itemKey, targetYear, newValue) => {
    setExtractedData(prev => {
      // SAAS FIX: Deep clone the state to prevent React mutation bugs on nested objects
      const next = JSON.parse(JSON.stringify(prev));
      if (next[stmtType]?.[secKey]?.[itemKey]) {
        next[stmtType][secKey][itemKey][targetYear] = newValue;
      }
      return next;
    });
  };

  // ── 3. PACKAGE AND SEND TO MAIN MATRIX ──
  const handleSave = () => {
    const unreviewed = Object.values(rowStatuses).filter(s => s === 'pending').length;
    if (unreviewed > 0) {
      if (!window.confirm(`⚠️ You have ${unreviewed} unreviewed items.\n\nAre you sure you want to save and inject them into the matrix?`)) return;
    }

    // Transform into perfectly formatted Matrix Payload
    const formattedPayload = {};
    const newItemsMap = {};
    const yearsSet = new Set();

// fsa/components/ReviewExtractionModal.jsx
// REPLACE the handleSave function's inner loop with this:

    Object.keys(extractedData).forEach(stmtType => {
      const frontendDocMap = { 'profit_and_loss': 'pnl', 'balance_sheet': 'bs', 'cash_flow': 'cashflow' };
      const docKey = frontendDocMap[stmtType] || 'pnl';
      if (!formattedPayload[docKey]) formattedPayload[docKey] = {};
      if (!newItemsMap[docKey]) newItemsMap[docKey] = {};

      Object.entries(extractedData[stmtType]).forEach(([aiSec, items]) => {
        Object.entries(items).forEach(([aiItem, yearVals]) => {
          const rowId = `${stmtType}_${aiSec}_${aiItem}`;
          if (rowStatuses[rowId] === 'deleted') return;

          const mapping = itemMappings[rowId];
          const targetSection = mapping.section;
          const targetItem = mapping.item === '__NEW__' ? mapping.customName : mapping.item;

          if (!formattedPayload[docKey][targetSection]) formattedPayload[docKey][targetSection] = {};
          if (!newItemsMap[docKey][targetSection]) newItemsMap[docKey][targetSection] = [];
          if (!newItemsMap[docKey][targetSection].includes(targetItem)) newItemsMap[docKey][targetSection].push(targetItem);

          // ── FIX 1: RESOLVE STRICT DATAKEYS FOR DYNAMIC EQUITY ──
          let safeKey = targetItem.replace(/\./g, '');
          if (targetSection === 'equity') {
              const eqSchema = configSchemas?.entityTypes?.[activeEntityType]?.equitySchema?.[0];
              const eqItem = eqSchema?.items?.find(i => i.label === targetItem);
              if (eqItem && eqItem.dataKey) {
                  safeKey = eqItem.dataKey; // Force schema key alignment
              } else {
                  safeKey = targetItem.toLowerCase().replace(/[^a-z0-9]/g, '');
              }
          }

          Object.entries(yearVals).forEach(([year, val]) => {
            yearsSet.add(year);
            if (!formattedPayload[docKey][targetSection][year]) formattedPayload[docKey][targetSection][year] = {};
            
            const numericVal = parseFloat(val) || 0;
            
            // ── FIX 2: AGGREGATE VALUES IF MULTIPLE ITEMS ROUTE TO THE SAME DESTINATION ──
            if (formattedPayload[docKey][targetSection][year][safeKey] !== undefined) {
                formattedPayload[docKey][targetSection][year][safeKey] += numericVal;
            } else {
                formattedPayload[docKey][targetSection][year][safeKey] = numericVal;
            }
          });
        });
      });
    });
    onConfirm({
      financialData: formattedPayload,
      activeItemsMap: newItemsMap,
      yearsList: Array.from(yearsSet)
    });
  };

  // ── RENDER CONFLICT SCREEN ──
  if (conflictYears) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="fade-in-up" style={{ width: 500, background: 'var(--bg-primary)', padding: 32, borderRadius: 16, border: '1px solid var(--border-strong)' }}>
          <h3 style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px 0' }}><AlertCircle /> Data Conflict Detected</h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
            The extracted document contains data for years that already exist in your matrix ({conflictYears.join(', ')}). 
            Proceeding will intelligently merge and overwrite these specific years.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
             <button onClick={onCancel} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' }}>Cancel Import</button>
             <button onClick={() => setConflictYears(null)} style={{ padding: '8px 16px', background: '#f59e0b', border: 'none', color: '#000', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Acknowledge & Map Data</button>
          </div>
        </div>
      </div>
    );
  }

  // ── RENDER MAIN MODAL ──
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex' }}>
      
      {/* LEFT PANE: PDF Viewer */}
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

      {/* RIGHT PANE: Data Mapper */}
      {viewMode !== 'pdf-only' && (
        <div style={{ flex: 1, padding: 36, background: 'var(--bg-primary)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}><Sparkles color="var(--accent-color)" /> Smart AI Mapping Engine</h2>
              <p style={{ color: 'var(--text-muted)', margin: '8px 0 0 0' }}>The AI auto-matched your data. Verify, edit, and reroute items before injecting.</p>
            </div>
            {pdfBlobUrl && (
              <button onClick={() => setViewMode(viewMode === 'split' ? 'data-only' : 'split')} style={{ padding: '6px 12px', background: 'var(--bg-hover)', border: 'none', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer', height: 'fit-content' }}>
                {viewMode === 'split' ? '⛶ Expand Data' : '◩ Split View'}
              </button>
            )}
          </div>

          <div style={{ flex: 1 }}>
            {Object.keys(extractedData).map(stmtType => {
              const stmtData = extractedData[stmtType];
              if (Object.keys(stmtData).length === 0) return null;

              const frontendDocMap = { 'profit_and_loss': 'pnl', 'balance_sheet': 'bs', 'cash_flow': 'cashflow' };
              const docKey = frontendDocMap[stmtType] || 'pnl';
              const schemaNodes = configSchemas?.chartOfAccounts?.shared?.[docKey] || [];

              // Extract unique years for table header
              const years = new Set();
              Object.values(stmtData).forEach(items => Object.values(items).forEach(yrVals => Object.keys(yrVals).forEach(y => years.add(y))));
              const sortedYears = Array.from(years).sort();

              // 👇 NEW SCHEMA-AWARE SORTING LOGIC 👇
              const orderedSchemaKeys = schemaNodes
                .filter(n => n.type === 'section' || (n.dynamic && n.key === 'equity_placeholder'))
                .map(n => (n.dynamic && n.key === 'equity_placeholder' ? 'equity' : n.key).toLowerCase());
              
              const sortedAiSecKeys = Object.keys(stmtData).sort((a, b) => {
                const indexA = orderedSchemaKeys.indexOf(a.toLowerCase());
                const indexB = orderedSchemaKeys.indexOf(b.toLowerCase());
                
                if (indexA !== -1 && indexB !== -1) return indexA - indexB; // Both in schema: preserve schema order
                if (indexA !== -1) return -1; // Only A in schema: A moves up
                if (indexB !== -1) return 1;  // Only B in schema: B moves up
                return a.localeCompare(b);    // Neither in schema: alphabetize at the bottom
              });
              // 👆 END NEW LOGIC 👆

              return (
                <div key={stmtType} style={{ marginBottom: 32 }}>
                  <h3 style={{ background: 'var(--bg-tertiary)', padding: '16px', margin: 0, borderTopLeftRadius: 8, borderTopRightRadius: 8, border: '1px solid var(--border-subtle)', textTransform: 'uppercase', fontSize: 14 }}>
                    📄 {stmtType.replace(/_/g, ' ')}
                  </h3>
                  
                  <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderTop: 'none' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>Extracted Item ➔ Routing Destination</th>
                        {sortedYears.map(y => (
                          <th key={y} style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>{y}</th>
                        ))}
                        <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAiSecKeys.map((aiSecKey) => {
                        const items = stmtData[aiSecKey];
                        return (
                        <React.Fragment key={aiSecKey}>
                          <tr>
                            <td colSpan={sortedYears.length + 2} style={{ padding: '8px 16px', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700 }}>
                              📁 Raw AI Folder: {aiSecKey}
                            </td>
                          </tr>
                          
                          {Object.entries(items).map(([aiItemKey, yearVals]) => {
                            const rowId = `${stmtType}_${aiSecKey}_${aiItemKey}`;
                            const status = rowStatuses[rowId];
                            const isDeleted = status === 'deleted';
                            const isReviewed = status === 'reviewed';

                            return (
                              <tr key={rowId} style={{ opacity: isDeleted ? 0.3 : 1, background: isReviewed ? 'rgba(16,185,129,0.05)' : 'transparent', borderBottom: '1px solid var(--border-subtle)', transition: 'all 0.2s' }}>
                                <td style={{ padding: '16px', width: '45%' }}>
                                  
                                  {/* INLINE EDITING FOR CUSTOM NAMES */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <div style={{ fontWeight: 600, color: isDeleted ? '#ef4444' : 'var(--text-primary)' }}>↳ {itemMappings[rowId]?.customName || aiItemKey}</div>
                                    {!isDeleted && itemMappings[rowId]?.item === '__NEW__' && (
                                      <button 
                                        onClick={() => {
                                          const newName = prompt("Edit Custom Line Item Name:", itemMappings[rowId]?.customName);
                                          if (newName && newName.trim()) {
                                            setItemMappings(prev => ({...prev, [rowId]: {...prev[rowId], customName: newName.trim()}}));
                                          }
                                        }}
                                        style={{ background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 4, padding: 4, cursor: 'pointer', color: 'var(--text-muted)' }}
                                        title="Edit Custom Name"
                                      ><Edit2 size={12}/></button>
                                    )}
                                  </div>

                                  {/* CROSS-SECTION DROPDOWN ROUTER */}
                                  <select 
                                    disabled={isDeleted}
                                    value={`${itemMappings[rowId]?.section}___${itemMappings[rowId]?.item}`}
                                    onChange={(e) => {
                                      const [s, i] = e.target.value.split('___');
                                      setItemMappings(prev => ({ ...prev, [rowId]: { section: s, item: i, customName: itemMappings[rowId]?.customName } }));
                                      setRowStatuses(prev => ({...prev, [rowId]: 'pending'})); // Reset review status if changed
                                    }}
                                    className="styled-select"
                                  >
                                    <option value={`${itemMappings[rowId]?.section}_____NEW__`} style={{ color: '#ef4444' }}>+ Keep as Custom Item</option>
                                    
                                    {schemaNodes.filter(n => n.type === 'section').map(secNode => (
                                      <optgroup key={secNode.key} label={`📁 Route to: ${secNode.title || secNode.key}`}>
                                        {(secNode.items || []).map(schemaItem => {
                                          const label = typeof schemaItem === 'string' ? schemaItem : schemaItem.label || schemaItem.dataKey;
                                          return <option key={label} value={`${secNode.key}___${label}`}>↳ Map to: {label}</option>
                                        })}
                                      </optgroup>
                                    ))}

                                    {/* DYNAMIC EQUITY ROUTING */}
                                    {schemaNodes.some(n => n.dynamic && n.key === 'equity_placeholder') && configSchemas?.entityTypes?.[activeEntityType]?.equitySchema?.[0] && (
                                      <optgroup label={`📁 Route to: ${configSchemas.entityTypes[activeEntityType].equitySchema[0].title || 'Equity'}`}>
                                        {(configSchemas.entityTypes[activeEntityType].equitySchema[0].items || []).map(schemaItem => {
                                          const label = schemaItem.label || schemaItem.dataKey;
                                          return <option key={`eq_${label}`} value={`equity___${label}`}>↳ Map to: {label}</option>
                                        })}
                                      </optgroup>
                                    )}
                                  </select>
                                </td>
                                
                                {sortedYears.map(y => (
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
                                                handleValueEdit(stmtType, aiSecKey, aiItemKey, y, numericValue);
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} /> Values mapped to existing fields will merge with current inputs.
            </span>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={onCancel} style={{ padding: '12px 24px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>Cancel Extraction</button>
              <button onClick={handleSave} style={{ padding: '12px 24px', borderRadius: 8, background: 'var(--accent-color)', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={18} /> Confirm & Save to Matrix
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}