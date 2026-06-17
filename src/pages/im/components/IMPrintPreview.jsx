import React, { useMemo } from 'react';
import { X, Printer } from 'lucide-react';
import ChartBlock from './ChartBlock'; // FIX: Bring in your actual Live Chart component

// BULLETPROOF ARRAY ENFORCER (Fixes Firebase Object-Array conversion crashes)
const ensureArray = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    const isNumericKeys = keys.length > 0 && keys.every(k => !isNaN(Number(k)));
    if (isNumericKeys) return Object.values(data);
    return [data]; 
  }
  return [data]; 
};

// FORMULA ENGINE (Ported from SmartTableBlock to calculate Math on the fly for Print)
const evaluateFormula = (formula, rIdx, activeRecords, runtimeSchemaRows) => {
  if (!formula) return '';
  let s = formula;
  const baseSchemaCells = runtimeSchemaRows[0]?.cells || [];
  
  s = s.replace(/SUM\(C(\d+)\)/gi, (_, c) => {
    const colIdx = parseInt(c, 10) - 1; 
    const cellId = baseSchemaCells[colIdx]?.id || `col_${colIdx}`;
    if (!cellId) return 0;
    return activeRecords.reduce((sum, rec) => sum + (parseFloat(String(rec[cellId]).replace(/[^0-9.-]/g, '')) || 0), 0);
  });
  
  s = s.replace(/R(\d+)C(\d+)/gi, (_, r, c) => {
    const rowI = parseInt(r, 10) - 1;
    const colI = parseInt(c, 10) - 1;
    const cellId = runtimeSchemaRows[rowI]?.cells?.[colI]?.id || `col_${colI}`;
    if (!cellId) return 0;
    return parseFloat(String(activeRecords[rowI]?.[cellId]).replace(/[^0-9.-]/g, '')) || 0;
  });
  
  s = s.replace(/C(\d+)/gi, (_, c) => {
    const colIdx = parseInt(c, 10) - 1;
    const cellId = baseSchemaCells[colIdx]?.id || `col_${colIdx}`;
    if (!cellId) return 0;
    return parseFloat(String(activeRecords[rIdx]?.[cellId]).replace(/[^0-9.-]/g, '')) || 0;
  });
  
  try {
    const clean = s.replace(/\s/g, '');
    if (!/^[0-9+\-*/().]+$/.test(clean)) return s;
    const result = new Function(`'use strict'; return (${clean})`)();
    return Number.isFinite(result) ? result.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '';
  } catch { return ''; }
};

// STRIP HIGHLIGHTS ENGINE: Forcefully rips out baked-in comment/search background styles before printing
// FIX: Moved this OUTSIDE of evaluateFormula so the rest of the file can use it!
const stripPrintHighlights = (html) => {
  if (!html || typeof html !== 'string') return html;
  let clean = html;
  // Scub out yellow/amber comment backgrounds
  clean = clean.replace(/background-color:\s*(?:#fbbf24|#f59e0b|rgba?\(251,\s*191,\s*36[^)]*\)|rgba?\(245,\s*158,\s*11[^)]*\))\s*;?/gi, '');
  // Scrub out blue search backgrounds
  clean = clean.replace(/background-color:\s*(?:#2563eb|rgba?\(37,\s*99,\s*235[^)]*\))\s*;?/gi, '');
  // Clean up any stray classes
  clean = clean.replace(/class="[^"]*(im-comment-highlight|im-search-highlight-quill)[^"]*"/gi, '');
  return clean;
};

export default function IMPrintPreview({ schema, imData, excludedSections, customNames = {}, projectName, onClose }) {
  
  // 1. Calculate Visible Schema (Respect Exclusions)
  const visibleSchema = useMemo(() => {
    return ensureArray(schema).filter(s => !ensureArray(excludedSections).includes(s.id));
  }, [schema, excludedSections]);

  // 2. Dynamic Numbering Engine
  const sectionNumberMap = useMemo(() => {
    const map = {};
    let parentCounter = 1;
    const parents = visibleSchema.filter(s => !s.parentId).sort((a,b) => (a.order||0) - (b.order||0));
    parents.forEach(p => {
      map[p.id] = `${parentCounter}`;
      let childCounter = 1;
      const children = visibleSchema.filter(s => s.parentId === p.id).sort((a,b) => (a.order||0) - (b.order||0));
      children.forEach(c => { map[c.id] = `${parentCounter}.${childCounter}`; childCounter++; });
      parentCounter++;
    });
    return map;
  }, [visibleSchema]);

  const cleanTitle = (text) => text ? text.replace(/^([0-9]+\.)+\s*/, '') : '';

  // 3. Data Retrieval Helper (NOW SUPPORTS RELATIVE PATHS FOR REPEATING SETS)
  const getValue = (path, contextData = null, parentDataPath = null) => {
    if (contextData !== null) {
      let relativePath = path;
      // Strip the parent's base path so we can look up the relative key inside the repeating array object
      if (parentDataPath && path.startsWith(`${parentDataPath}.`)) {
        const regex = new RegExp(`^${parentDataPath}\\.`);
        relativePath = path.replace(regex, '');
      }
      return relativePath.split('.').reduce((obj, key) => obj?.[key], contextData);
    }
    if (!path) return undefined;
    return path.split('.').reduce((obj, key) => obj?.[key], imData);
  };

  // 4. SMART TABLE PARSER (Exactly matches Workspace Database Mapping)
  const renderTableInstance = (block, instanceData, isRepeated = false, instanceIdx = 0) => {
    let dbRows = [];
    let runtimeSchemaRows = ensureArray(block.rows);
    let headers = ensureArray(block.colHeaders);

    if (Array.isArray(instanceData)) {
      dbRows = instanceData;
    } else if (instanceData && typeof instanceData === 'object') {
      if (instanceData.rows) dbRows = ensureArray(instanceData.rows);
      if (instanceData.runtimeSchemaRows) runtimeSchemaRows = ensureArray(instanceData.runtimeSchemaRows);
      if (instanceData.headers) headers = ensureArray(instanceData.headers);
    }

    const hasSchema = runtimeSchemaRows.length > 0;
    const numCols = headers.length || block.cols || 2;
    const numRows = Math.max(dbRows.length, runtimeSchemaRows.length, block.baseRowCount || 1);
    const occupied = Array.from({ length: numRows }, () => new Array(numCols).fill(false));

    // Calculate Column Totals if enabled
    const colTotals = (!block.showColumnTotals && !block.hasTotalsRow) ? null : (() => {
      const allCells = runtimeSchemaRows[0]?.cells || headers.map((_, i) => ({ id: `col_${i}` }));
      return allCells.map(cell => {
        const total = dbRows.reduce((sum, rec) => {
          const v = parseFloat(String(rec[cell.id] || '').replace(/[^0-9.-]/g, ''));
          return sum + (Number.isFinite(v) ? v : 0);
        }, 0);
        return total !== 0 ? total.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '';
      });
    })();

    return (
      <div key={`table_${isRepeated ? 'rep' : 'main'}_${instanceIdx}`} style={{ overflowX: 'auto', marginBottom: '24px', pageBreakInside: 'avoid' }}>
        
        {/* Subheadings and Repeated Headers */}
        {isRepeated && <div style={{ fontSize: '12px', fontWeight: 800, color: '#ef4444', marginBottom: '8px', textTransform: 'uppercase' }}>Copy {instanceIdx} {instanceData?.instanceName ? `- ${instanceData.instanceName}` : ''}</div>}
        {!isRepeated && block.enableTableSubheading && instanceData?.tableSubheadingRichText && (
          <div className="ql-editor" style={{ fontSize: '13px', color: '#475569', marginBottom: '10px', fontStyle: 'italic', padding: 0 }} dangerouslySetInnerHTML={{ __html: instanceData.tableSubheadingRichText }} />
        )}
        
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #e2e8f0' }}>
          <thead>
            <tr>
              {block.showSno && <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', background: '#f8fafc', textAlign: 'center', width: '40px', color: '#0f172a' }}>#</th>}
              {headers.map((h, i) => (
                <th key={i} style={{ border: '1px solid #cbd5e1', padding: '8px 10px', background: '#f8fafc', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: numRows }).map((_, rIdx) => {
              const rec = dbRows[rIdx] || {};
              const schemaRow = hasSchema ? (runtimeSchemaRows[rIdx] || runtimeSchemaRows[runtimeSchemaRows.length - 1]) : null;

              return (
                <tr key={rIdx}>
                  {block.showSno && <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{rIdx + 1}</td>}
                  
                  {hasSchema ? (
                    schemaRow?.cells?.map((cell, cIdx) => {
                      if (occupied[rIdx]?.[cIdx]) return null;
                      
                      const cs = Math.min(Math.max(1, cell.colspan || 1), numCols - cIdx);
                      const rs = Math.min(Math.max(1, cell.rowspan || 1), numRows - rIdx);
                      for (let r = rIdx; r < rIdx + rs; r++) {
                        for (let c = cIdx; c < cIdx + cs; c++) {
                          if (r < numRows && c < numCols) occupied[r][c] = true;
                        }
                      }

                      // EXACT VALUE MAPPING
                      const rawVal = rec[cell.id];
                      let displayValue = rawVal ?? '-';

                      if (cell.cellType === 'fixed') displayValue = cell.text || '';
                      else if (cell.cellType === 'computed') {
                        displayValue = evaluateFormula(cell.formula, rIdx, dbRows, runtimeSchemaRows);
                      } 
                      else if (cell.cellType === 'smart-select') {
                        if (rawVal && typeof rawVal === 'object') {
                          displayValue = rawVal.selected ? `${rawVal.selected} ${rawVal.inputs?.length ? `- ${rawVal.inputs.join(' ')}` : ''}` : '-';
                          if (rawVal.richtext) displayValue = <div className="ql-editor" style={{padding: 0}} dangerouslySetInnerHTML={{ __html: stripPrintHighlights(rawVal.richtext) }} />;
                        } else {
                          displayValue = rawVal || '-';
                        }
                      } 
                      else if (cell.cellType === 'mixed') displayValue = Array.isArray(rawVal) ? rawVal.join(', ') : (rawVal || '-');
                      else if (cell.inputType === 'quill') displayValue = <div className="ql-editor" style={{padding: 0}} dangerouslySetInnerHTML={{ __html: stripPrintHighlights(rawVal || '-') }} />;
                      else if (typeof rawVal === 'string' && rawVal.startsWith('__custom__:')) displayValue = rawVal.replace('__custom__:', '');

                      const isTotalOrFixed = cell.cellType === 'fixed' || cell.cellType === 'computed';
                      
                      return (
                        <td key={cIdx} colSpan={cs} rowSpan={rs} style={{ border: '1px solid #e2e8f0', padding: '8px 10px', verticalAlign: isTotalOrFixed ? 'middle' : 'top', color: isTotalOrFixed ? '#0f172a' : '#334155', fontWeight: isTotalOrFixed ? 600 : 400, background: cell.cellType === 'fixed' ? '#fef3c7' : cell.cellType === 'computed' ? '#d1fae5' : 'transparent' }}>
                          {displayValue || '-'}
                        </td>
                      );
                    })
                  ) : (
                    Array.from({ length: numCols }).map((_, cIdx) => (
                      <td key={cIdx} style={{ border: '1px solid #e2e8f0', padding: '8px 10px', verticalAlign: 'top', color: '#334155' }}>
                        {rec[`col_${cIdx}`] || '-'}
                      </td>
                    ))
                  )}
                </tr>
              );
            })}

            {/* Totals Row */}
            {colTotals && (
              <tr style={{ background: '#fee2e2' }}>
                {block.showSno && <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px', textAlign: 'center', color: '#dc2626', fontWeight: 800 }}>∑</td>}
                {colTotals.map((total, cIdx) => (
                  <td key={cIdx} style={{ border: '1px solid #e2e8f0', padding: '8px 10px', color: '#dc2626', fontWeight: 800 }}>{total}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // 5. Ultimate Block Compiler Engine
  const compileBlock = (block, contextData = null, parentDataPath = null) => {
    if (!block || ensureArray(excludedSections).includes(block.id)) return null;
    if (block.type === 'instruction') return null;

    const dataKey = block.dataPath || block.id; 
    const val = getValue(dataKey, contextData, parentDataPath);
    const blockLabel = customNames[block.id] || block.label;

    return (
      <div key={block.id} style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
        
        {blockLabel && !['fixed-text', 'instruction'].includes(block.type) && (
          <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{blockLabel}</h4>
        )}
        
        {block.type === 'fixed-text' && <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{block.content}</div>}
        
        {['text', 'textarea', 'number', 'currency', 'percentage', 'email', 'date'].includes(block.type) && (
          <div style={{ fontSize: '13px', color: '#0f172a', background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap' }}>
            {val || '-'}
          </div>
        )}

        {block.type === 'quill' && (
          <div className="ql-editor" style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, padding: 0 }} dangerouslySetInnerHTML={{ __html: stripPrintHighlights(val || '<span style="color:#94a3b8">-</span>') }} />
        )}

        {/* Render Main Table and Any User-Repeated Tables */}
        {block.type === 'table' && (
          <>
            {renderTableInstance(block, val, false, 0)}
            {val?.repeatedTables && ensureArray(val.repeatedTables).map((repTable, i) => renderTableInstance(block, repTable, true, i + 1))}
          </>
        )}

        {(block.type === 'boolean' || block.type === 'compliance') && (
          <div style={{ fontSize: '13px', color: '#0f172a', background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'inline-block' }}>
            {val || '-'}
          </div>
        )}

        {block.type === 'list' && (
          <ul style={{ fontSize: '13px', color: '#334155', margin: 0, paddingLeft: '24px', lineHeight: 1.6 }}>
            {ensureArray(val).map((item, i) => (
              <li key={i} style={{ marginBottom: '6px' }}>{typeof item === 'object' ? item.value : item}</li>
            ))}
            {ensureArray(val).length === 0 && <li style={{ color: '#94a3b8', listStyleType: 'none', marginLeft: '-24px' }}>-</li>}
          </ul>
        )}

        {block.type === 'image' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '16px' }}>
            {ensureArray(val).map((img, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', pageBreakInside: 'avoid' }}>
                <img 
                  src={img.url || img} 
                  alt="" 
                  style={{ 
                    width: '100%', 
                    height: 'auto', 
                    maxHeight: '700px',
                    objectFit: 'contain', 
                    borderRadius: '8px', 
                    border: '1px solid #e2e8f0', 
                    backgroundColor: '#f8fafc',
                    display: 'block'
                  }} 
                />
                {img.caption && (
                  <span style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', fontWeight: 600 }}>
                    {img.caption}
                  </span>
                )}
              </div>
            ))}
            {ensureArray(val).length === 0 && <div style={{ fontSize: '13px', color: '#94a3b8' }}>No images uploaded</div>}
          </div>
        )}

        {block.type === 'file' && (
          <div style={{ fontSize: '12px', color: '#3b82f6', background: '#eff6ff', padding: '10px 14px', borderRadius: '6px', border: '1px dashed #bfdbfe' }}>
            {ensureArray(val).map((f, i) => (
               <div key={i}>📄 {f.name || 'Attached File'}</div>
            ))}
            {ensureArray(val).length === 0 && <span style={{color: '#94a3b8'}}>-</span>}
          </div>
        )}

        {block.type === 'conditional-switch' && (() => {
          const selectedBranchId = val?.activeBranch;
          if (!selectedBranchId) return null;
          
          const branch = ensureArray(block.branches).find(b => b.id === selectedBranchId);
          if (!branch || !branch.blocks) return null;

          const visibleBranchBlocks = ensureArray(branch.blocks).filter(
            b => !ensureArray(excludedSections).includes(b.id)
          );

          const branchData = val[selectedBranchId] || {};

          return (
            <div style={{ paddingLeft: '16px', borderLeft: '2px solid #cbd5e1', marginTop: '12px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 700 }}>Condition: {branch.label}</div>
              {visibleBranchBlocks.map(b => compileBlock(b, branchData, null))}
            </div>
          );
        })()}

        {block.type === 'repeating-block-set' && (() => {
          const instances = val?.instances ? ensureArray(val.instances) : (Array.isArray(val) ? val : []);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '12px' }}>
              {instances.map((instanceData, i) => (
                <div key={instanceData._setId || i} style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', borderLeft: '3px solid #ef4444', background: '#f8fafc', pageBreakInside: 'avoid' }}>
                  
                  <div style={{ fontSize: '11px', color: '#ef4444', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 800 }}>
                    {instanceData.name ? instanceData.name : `Set #${i + 1}`}
                  </div>
                  
                  {ensureArray(block.blocks).map(subBlock => compileBlock(subBlock, instanceData, dataKey))}
                </div>
              ))}
              {instances.length === 0 && <div style={{ fontSize: '13px', color: '#94a3b8' }}>-</div>}
            </div>
          );
        })()}

        {block.type === 'repeating-group' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
            {ensureArray(val).map((item, i) => (
              <div key={i} style={{ padding: '14px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#ffffff' }}>
                {ensureArray(block.template).map(field => (
                  <div key={field.id} style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>{field.label}</div>
                    <div style={{ fontSize: '13px', color: '#0f172a' }}>{item[field.id] || '-'}</div>
                  </div>
                ))}
              </div>
            ))}
            {ensureArray(val).length === 0 && <div style={{ fontSize: '13px', color: '#94a3b8' }}>-</div>}
          </div>
        )}

        {/* FIX: Mount your actual Live Chart component instead of a table. Pass isPrintMode=true so it hides the UI tabs. */}
        {block.type === 'chart' && (
          <div className="print-chart-container" style={{ marginTop: '20px', pageBreakInside: 'avoid' }}>
            <ChartBlock 
              block={{...block, label: blockLabel}} 
              value={val} 
              isDark={false} 
              isPrintMode={true} 
              onChange={() => {}} // Safe dummy function so it doesn't crash on read-only
            />
          </div>
        )}

        {block.type === 'mixed' && (
          <div style={{ fontSize: '13px', color: '#0f172a', lineHeight: 1.6, background: '#f8fafc', padding: '12px 16px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            {val?.compiledText || val || '-'} 
          </div>
        )}

      </div>
    );
  };

  const parentSections = visibleSchema.filter(s => !s.parentId).sort((a,b) => (a.order||0) - (b.order||0));

  return (
    <div className="im-print-wrapper" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#cbd5e1', display: 'flex', flexDirection: 'column' }}>
      
      <div className="no-print" style={{ height: '60px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: '#475569' }}><X size={20} /></button>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Print Preview: {projectName}</h2>
        </div>
        <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(239,68,68,0.2)' }}>
          <Printer size={16} /> Print / Save as PDF
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '40px 0' }} className="print-canvas">
        
        <div id="print-document" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', background: '#ffffff', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '25mm 20mm' }}>
          
          <div style={{ height: '240mm', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', borderBottom: '2px solid #e2e8f0', pageBreakAfter: 'always' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', letterSpacing: '4px', margin: '0 0 40px 0' }}>REDWOOD <span style={{color: '#ef4444'}}>PARTNERS</span></h1>
            <h2 style={{ fontSize: '36px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0' }}>INVESTMENT MEMORANDUM</h2>
            <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#475569', margin: '0 0 40px 0' }}>Brand Name: {projectName}</h3>
            <p style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600 }}>Generated on: {new Date().toLocaleDateString('en-GB')}</p>
          </div>

          <div style={{ pageBreakAfter: 'always', paddingTop: '20mm' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>EVALUATION PARAMETERS</h3>
            <p style={{ fontSize: '12px', lineHeight: 1.6, color: '#334155', marginBottom: '16px' }}>This IM serves to project a detailed picture of the company to the Investor's various Investment Committees, supporting meeting the investment objectives and decision-making.</p>
            <p style={{ fontSize: '12px', lineHeight: 1.6, color: '#334155', fontWeight: 700, marginBottom: '8px' }}>The IM report addresses the following scope:</p>
            <ul style={{ fontSize: '12px', lineHeight: 1.6, color: '#334155', paddingLeft: '20px', marginBottom: '24px' }}>
              <li>Conduct initial discussions to understand the background, problem statement, services provided.</li>
              <li>Assess the entrepreneur's commitment to the business.</li>
              <li>Analyse profit and loss, costing, HR costs, margins, etc.</li>
              <li>Assess the startup's domain, competitive landscape, strength relative to competitors.</li>
              <li>Determine the funding quantum based on business plan analysis.</li>
            </ul>
            <p style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
              The information contained in this IM is strictly confidential and is meant solely for internal review.
            </p>
          </div>

          <div style={{ pageBreakAfter: 'always', paddingTop: '20mm' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginBottom: '24px', borderBottom: '2px solid #ef4444', paddingBottom: '8px' }}>Table of Contents</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {parentSections.map(pSec => (
                <div key={pSec.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                    <span>{sectionNumberMap[pSec.id]}. {cleanTitle(customNames[pSec.id] || pSec.heading || pSec.navLabel)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '24px', marginTop: '8px' }}>
                    {visibleSchema.filter(s => s.parentId === pSec.id).sort((a,b) => (a.order||0) - (b.order||0)).map(cSec => (
                      <div key={cSec.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569' }}>
                        <span>{sectionNumberMap[cSec.id]}. {cleanTitle(customNames[cSec.id] || cSec.heading || cSec.navLabel)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ paddingTop: '10mm' }}>
            {parentSections.map(pSec => {
              const children = visibleSchema.filter(s => s.parentId === pSec.id).sort((a,b) => (a.order||0) - (b.order||0));
              return (
                <div key={pSec.id} style={{ marginBottom: '40px' }}>
                  
                  <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '16px', pageBreakAfter: 'avoid' }}>
                    <span style={{ color: '#ef4444', marginRight: '8px' }}>{sectionNumberMap[pSec.id]}.</span>
                    {cleanTitle(customNames[pSec.id] || pSec.heading || pSec.navLabel)}
                  </h2>

                  <div style={{ marginBottom: '24px' }}>
                    {ensureArray(pSec.blocks)
                      .filter(block => !ensureArray(excludedSections).includes(block.id))
                      .sort((a,b) => (a.order||0)-(b.order||0))
                      .map(block => compileBlock(block))}
                  </div>

                  {children.map(cSec => (
                    <div key={cSec.id} style={{ marginBottom: '24px', paddingLeft: '16px' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginBottom: '12px', pageBreakAfter: 'avoid' }}>
                        {sectionNumberMap[cSec.id]}. {cleanTitle(customNames[cSec.id] || cSec.heading || cSec.navLabel)}
                      </h3>
                      <div>
                        {ensureArray(cSec.blocks)
                          .filter(block => !ensureArray(excludedSections).includes(block.id))
                          .sort((a,b) => (a.order||0)-(b.order||0))
                          .map(block => compileBlock(block))}
                      </div>
                    </div>
                  ))}

                </div>
              );
            })}
          </div>

        </div>
      </div>

      <style>{`
        /* FIX: Inject Native Quill Styles for Print */
        .ql-editor table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .ql-editor table td, .ql-editor table th { border: 1px solid #cbd5e1 !important; padding: 6px 8px; }
        .ql-editor ul, .ql-editor ol { padding-left: 20px; margin: 8px 0; }
        .ql-editor li { margin-bottom: 4px; }
        .ql-editor p { margin: 0 0 8px 0; }
        
        /* FIX: Forcefully strip comments and search highlights on print (Bulletproof) */
        [data-comment-id], 
        [data-comment-id] *,
        .im-comment-highlight, 
        .im-comment-highlight *,
        mark.im-comment-highlight, 
        mark.im-search-highlight-quill, 
        .im-search-highlight-quill,
        .im-search-highlight-quill * {
          background: transparent !important;
          background-color: transparent !important;
          border: none !important;
          color: inherit !important;
          text-decoration: none !important;
          box-shadow: none !important;
        }

        @media print {
          html, body, #root {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          aside, header, main, .no-print {
            display: none !important;
          }

          /* FIX: Release the fixed wrapper so the browser can measure all pages */
          .im-print-wrapper {
            position: static !important;
            display: block !important;
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }

          /* FIX: Ensure the canvas scrolls out to its full physical height */
          .print-canvas {
            overflow: visible !important;
            height: auto !important;
            display: block !important;
            padding: 0 !important;
          }

          #print-mount-point {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }

          #print-document {
            box-shadow: none !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        /* THE ULTIMATE CSS HAMMER: Strip all inline backgrounds from rich text on print */
        .ql-editor span, .ql-editor mark {
          background-color: transparent !important;
          background: transparent !important;
        }
        
        /* FIX: Hide the toggle tabs (Data Table / Live Chart) when printing */
        .print-chart-container button,
        .print-chart-container [role="tablist"],
        .print-chart-container .chart-tabs {
          display: none !important;
        }
          @page {
            size: A4;
            margin: 15mm;
          }
        }
      `}</style>
    </div>
  );
}
