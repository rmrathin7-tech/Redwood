import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Edit2, Check, FileText } from 'lucide-react';
import { toPng } from 'html-to-image';
import ChartBlock from './ChartBlock'; 

// BULLETPROOF ARRAY ENFORCER
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

// FORMULA ENGINE
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

// STRIP HIGHLIGHTS ENGINE
const stripPrintHighlights = (html) => {
  if (!html || typeof html !== 'string') return html;
  let clean = html;
  clean = clean.replace(/background-color:\s*(?:#fbbf24|#f59e0b|rgba?\(251,\s*191,\s*36[^)]*\)|rgba?\(245,\s*158,\s*11[^)]*\))\s*;?/gi, '');
  clean = clean.replace(/background-color:\s*(?:#2563eb|rgba?\(37,\s*99,\s*235[^)]*\))\s*;?/gi, '');
  clean = clean.replace(/class="[^"]*(im-comment-highlight|im-search-highlight-quill)[^"]*"/gi, '');
  return clean;
};
function renderMixedTemplate(template, valuesArray) {
  if (!template) return Array.isArray(valuesArray) ? valuesArray.join(', ') : valuesArray ?? '-';
  const parts = template.split(/(\[[^\]]+\])/g);
  let inputIdx = 0;
  return parts.map(part => {
    if (/^\[.+\]$/.test(part)) {
      const val = Array.isArray(valuesArray) ? valuesArray[inputIdx] : undefined;
      inputIdx++;
      return val ?? '';
    }
    return part;
  }).join('');
}
function formatPrintDate(val) {
  if (!val || typeof val !== 'string') return val ?? '-';
  return val.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => `${d}/${m}/${y}`);
}
// BRAND CONSTANTS
const BURGUNDY = '#8B1C31';
const FONT_FAMILY = "'Open Sans', sans-serif";

export default function IMPrintPreview({ schema, imData, excludedSections, customNames = {}, projectName, onClose, logoUrl }) {
  
  const [mounted, setMounted] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [brandName, setBrandName] = useState(projectName || 'Goodway');
  const [isEditingEval, setIsEditingEval] = useState(false);
  const [evalText, setEvalText] = useState(`This IM serves to project a detailed picture of the company to the Investor’s various Investment Committees, supporting meeting the investment objectives and decision-making.

The IM report addresses the following scope:

First Connect:
• Conduct initial discussions to understand the background, problem statement, services provided, team strength, etc.
• Assess the entrepreneur’s commitment to the business.
• Make a preliminary decision on the fundability of the project.

Business, Domain, and Opportunity Analysis:
• Analyse profit and loss, costing, HR costs, margins, etc.
• Assess the startup’s domain, competitive landscape, strength relative to competitors, and market opportunities.
• Evaluate claims on Unique Selling Proposition (USP) and the scalability of the solution.
• Analyse the business model, map the business plan, and reach a consensus on the need for funding in relation to the business plan.

Fund Quantum Sizing:
• Analyze capital and operational expenditures.
• Determine the funding quantum based on business plan analysis and discussions with the promoter.

The information contained in this IM is strictly confidential and is meant to serve only as an analytical document for the consideration of the Investor’s various Investment Committees, supporting preliminary decision-making with respect to in-principle investment decisions.

The final investment decision will need to be made by the Investor in conjunction with the satisfactory completion of financial and legal due diligence processes by the startup.

The Investor’s decision is final notwithstanding the recommendations that form part of this IM.`);

  useEffect(() => setMounted(true), []);

  const visibleSchema = useMemo(() => {
    return ensureArray(schema).filter(s => !ensureArray(excludedSections).includes(s.id));
  }, [schema, excludedSections]);

  const parentSections = useMemo(() => {
    return visibleSchema.filter(s => !s.parentId).sort((a,b) => (a.order||0) - (b.order||0));
  }, [visibleSchema]);

  const sectionNumberMap = useMemo(() => {
    const map = {};
    let parentCounter = 1;
    parentSections.forEach(p => {
      map[p.id] = `${parentCounter}`;
      let childCounter = 1;
      const children = visibleSchema.filter(s => s.parentId === p.id).sort((a,b) => (a.order||0) - (b.order||0));
      children.forEach(c => { map[c.id] = `${parentCounter}.${childCounter}`; childCounter++; });
      parentCounter++;
    });
    return map;
  }, [visibleSchema, parentSections]);

  const cleanTitle = (text) => text ? text.replace(/^([0-9]+\.)+\s*/, '') : '';

  const getValue = (path, contextData = null, parentDataPath = null) => {
    if (contextData !== null) {
      let relativePath = path;
      if (parentDataPath && path.startsWith(`${parentDataPath}.`)) {
        const regex = new RegExp(`^${parentDataPath}\\.`);
        relativePath = path.replace(regex, '');
      }
      return relativePath.split('.').reduce((obj, key) => obj?.[key], contextData);
    }
    if (!path) return undefined;
    return path.split('.').reduce((obj, key) => obj?.[key], imData);
  };

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

    return (
      <div key={`table_${isRepeated ? 'rep' : 'main'}_${instanceIdx}`} style={{ overflowX: 'auto', marginBottom: '20px', pageBreakInside: 'avoid' }}>
        
        {isRepeated && <div style={{ fontSize: '10pt', fontWeight: 'bold', color: BURGUNDY, marginBottom: '8px', textTransform: 'uppercase' }}>Copy {instanceIdx} {instanceData?.instanceName ? `- ${instanceData.instanceName}` : ''}</div>}
        {!isRepeated && block.enableTableSubheading && instanceData?.tableSubheadingRichText && (
          <div className="ql-editor" style={{ fontSize: '10pt', color: '#000000', marginBottom: '10px', fontStyle: 'italic', padding: 0 }} dangerouslySetInnerHTML={{ __html: instanceData.tableSubheadingRichText }} />
        )}
        
        <table className="im-print-table">
          <thead>
            <tr>
              {block.showSno && <th style={{ width: '40px', minWidth: '40px', whiteSpace: 'nowrap', textAlign: 'center' }}>#</th>}
              {headers.map((h, i) => <th key={i}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: numRows }).map((_, rIdx) => {
              const rec = dbRows[rIdx] || {};
              const schemaRow = hasSchema ? (runtimeSchemaRows[rIdx] || runtimeSchemaRows[runtimeSchemaRows.length - 1]) : null;

              return (
                <tr key={rIdx}>
                  {block.showSno && <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 'bold' }}>{rIdx + 1}</td>}
                  
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

const rawVal = rec?.[cell.id];
const normalizedVal = cell.inputType === 'date' ? formatPrintDate(rawVal) : rawVal;
                      let displayValue = normalizedVal ?? '-';

                     if (cell.cellType === 'fixed') displayValue = formatPrintDate(cell.text) || '';
                      else if (cell.cellType === 'computed') displayValue = evaluateFormula(cell.formula, rIdx, dbRows, runtimeSchemaRows);
                      else if (cell.cellType === 'smart-select') {
                        if (rawVal && typeof rawVal === 'object') {
                          displayValue = rawVal.selected ? `${rawVal.selected} ${rawVal.inputs?.length ? `- ${rawVal.inputs.join(' ')}` : ''}` : '-';
                          if (rawVal.richtext) displayValue = <div className="ql-editor" style={{padding: 0}} dangerouslySetInnerHTML={{ __html: stripPrintHighlights(rawVal.richtext) }} />;
                        } else { displayValue = rawVal || '-'; }
                      } 
else if (cell.cellType === 'mixed')
  displayValue = renderMixedTemplate(cell.template, rawVal)
                      else if (cell.inputType === 'quill') displayValue = <div className="ql-editor" style={{padding: 0}} dangerouslySetInnerHTML={{ __html: stripPrintHighlights(rawVal || '-') }} />;
                      else if (typeof rawVal === 'string' && rawVal.startsWith('__custom__:')) displayValue = rawVal.replace('__custom__:', '');

                      return (
                        <td key={cIdx} colSpan={cs} rowSpan={rs} style={{ background: cell.cellType === 'fixed' ? '#f8fafc' : 'transparent' }}>
                          {displayValue || '-'}
                        </td>
                      );
                    })
                  ) : (
                    Array.from({ length: numCols }).map((_, cIdx) => (
                      <td key={cIdx}>{rec[`col_${cIdx}`] || '-'}</td>
                    ))
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const compileBlock = (block, contextData = null, parentDataPath = null) => {
    if (!block || ensureArray(excludedSections).includes(block.id)) return null;
    if (block.type === 'instruction') return null;

    const dataKey = block.dataPath || block.id; 
    const val = getValue(dataKey, contextData, parentDataPath);
    const blockLabel = customNames[block.id] || block.label;

    return (
      <div key={block.id} style={{ marginBottom: '16px', pageBreakInside: 'avoid' }}>
        {blockLabel && !['fixed-text', 'instruction'].includes(block.type) && (
          <h4 style={{ margin: '0 0 6px 0', fontSize: '11pt', color: '#000000', fontWeight: 'bold', textAlign: 'left' }}>{blockLabel}</h4>
        )}
        {block.type === 'fixed-text' && <div style={{ fontSize: '10pt', color: '#000000', lineHeight: 1.5, whiteSpace: 'pre-wrap', textAlign: 'left' }}>{block.content}</div>}
 {['text', 'textarea', 'number', 'currency', 'percentage', 'email', 'date'].includes(block.type) && (
  <div style={{ fontSize: '10pt', color: '#000000', whiteSpace: 'pre-wrap', lineHeight: 1.5, textAlign: 'left' }}>
    {block.type === 'date' && val
      ? (() => { const [y, m, d] = val.split('-'); return `${d}/${m}/${y}`; })()
      : val || '-'}
  </div>
)}
{block.type === 'mixed' && (
  <div style={{ fontSize: '10pt', color: '#000000', whiteSpace: 'pre-wrap', lineHeight: 1.5, textAlign: 'left' }}>
    {renderMixedTemplate(block.template, val)}
  </div>
)}
        {block.type === 'quill' && (
          <div className="ql-editor" style={{ fontSize: '10pt', color: '#000000', lineHeight: 1.5, padding: 0, textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: stripPrintHighlights(val || '<span style="color:#94a3b8">-</span>') }} />
        )}
        {block.type === 'table' && (
          <>
            {renderTableInstance(block, val, false, 0)}
            {val?.repeatedTables && ensureArray(val.repeatedTables).map((repTable, i) => renderTableInstance(block, repTable, true, i + 1))}
          </>
        )}
        {(block.type === 'boolean' || block.type === 'compliance') && (
          <div style={{ fontSize: '10pt', color: '#000000', lineHeight: 1.5, textAlign: 'left' }}>{val || '-'}</div>
        )}
        {block.type === 'list' && (
          <ul style={{ fontSize: '10pt', color: '#000000', margin: '4px 0', paddingLeft: '24px', lineHeight: 1.5, textAlign: 'left' }}>
            {ensureArray(val).map((item, i) => <li key={i} style={{ marginBottom: '4px' }}>{typeof item === 'object' ? item.value : item}</li>)}
            {ensureArray(val).length === 0 && <li style={{ color: '#94a3b8', listStyleType: 'none', marginLeft: '-24px' }}>-</li>}
          </ul>
        )}
        {block.type === 'image' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '10px' }}>
            {ensureArray(val).map((img, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', pageBreakInside: 'avoid' }}>
                <img src={img.url || img} alt="" style={{ width: '100%', height: 'auto', maxHeight: '500px', objectFit: 'contain', border: '1px solid #e2e8f0' }} />
                {img.caption && <span style={{ fontSize: '10pt', color: '#000000', textAlign: 'center' }}>{img.caption}</span>}
              </div>
            ))}
          </div>
        )}
        {block.type === 'conditional-switch' && (() => {
          const selectedBranchId = val?.activeBranch;
          if (!selectedBranchId) return null;
          const branch = ensureArray(block.branches).find(b => b.id === selectedBranchId);
          if (!branch || !branch.blocks) return null;
          const visibleBranchBlocks = ensureArray(branch.blocks).filter(b => !ensureArray(excludedSections).includes(b.id));
          const branchData = val[selectedBranchId] || {};

          return (
            <div style={{ marginTop: '8px' }}>
              {visibleBranchBlocks.map(b => compileBlock(b, branchData, null))}
            </div>
          );
        })()}
        {block.type === 'repeating-block-set' && (() => {
          const instances = val?.instances ? ensureArray(val.instances) : (Array.isArray(val) ? val : []);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
              {instances.map((instanceData, i) => (
                <div key={instanceData._setId || i} style={{ padding: '12px', border: '1px solid #e2e8f0', borderLeft: `3px solid ${BURGUNDY}`, pageBreakInside: 'avoid' }}>
                  <div style={{ fontSize: '10pt', color: BURGUNDY, textTransform: 'uppercase', marginBottom: '8px', fontWeight: 'bold' }}>
                    {instanceData.name ? instanceData.name : `Set #${i + 1}`}
                  </div>
                  {ensureArray(block.blocks).map(subBlock => compileBlock(subBlock, instanceData, dataKey))}
                </div>
              ))}
            </div>
          );
        })()}
        {block.type === 'chart' && (
          <div className="print-chart-container" style={{ marginTop: '16px', pageBreakInside: 'avoid' }}>
            <ChartBlock block={{...block, label: blockLabel}} value={val} isDark={false} isPrintMode={true} onChange={() => {}} />
          </div>
        )}
      </div>
    );
  };

  const exportToWord = async () => {
    setIsExporting(true);
    try {
      const printElement = document.getElementById('print-document-content');
      if (!printElement) return;
      const clonedDoc = printElement.cloneNode(true);
      const originalCharts = printElement.querySelectorAll('.print-chart-container');
      const clonedCharts = clonedDoc.querySelectorAll('.print-chart-container');

      for (let i = 0; i < originalCharts.length; i++) {
        const dataUrl = await toPng(originalCharts[i], { backgroundColor: '#ffffff', pixelRatio: 2 });
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.width = '100%';
        img.style.maxWidth = '600px';
        img.style.height = 'auto';
        clonedCharts[i].innerHTML = ''; 
        clonedCharts[i].appendChild(img);
      }

      const styles = `
        <style>
          body { font-family: ${FONT_FAMILY}; font-size: 10pt; color: #000000; line-height: 1.5; text-align: left; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 20px; table-layout: fixed; line-height: 1.0; }
          td, th { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.0; color: #000000; }
          th { background-color: #f8fafc; font-weight: bold; }
          h1, h2 { font-size: 12pt; font-weight: bold; color: #000000; margin-top: 16px; margin-bottom: 8px; text-align: left; }
          h3, h4 { font-size: 11pt; font-weight: bold; color: #000000; margin-top: 12px; margin-bottom: 6px; text-align: left; }
          .ql-editor ul, .ql-editor ol { padding-left: 20px; margin: 8px 0; }
          .ql-editor p { margin: 0 0 8px 0; }
          a { color: #000000; text-decoration: none; }
          img { max-width: 100%; height: auto; }
          .toc-item { display: block; width: 100%; margin-bottom: 6px; }
        </style>
      `;

      let wordHtml = clonedDoc.innerHTML;
      wordHtml = wordHtml.replace(
        /<div([^>]*)class="im-preview-page"([^>]*)>/gi, 
        '<div$1class="im-preview-page"$2><br clear="all" style="mso-special-character:line-break;page-break-before:always" />'
      );

      const html = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>IM Document</title>${styles}</head>
        <body>${wordHtml}</body>
        </html>
      `;

      const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(projectName || 'Redwood_IM').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.doc`;
      
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Word export failed:', error);
      alert('Failed to convert document. Please try again.');
    } finally { setIsExporting(false); }
  };

  // Reusable Page Header and Footer Components
  const PageHeader = () => (
    <div className="doc-header" style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', marginBottom: '20px', fontSize: '10pt', fontWeight: 'bold' }}>
      <span style={{ color: '#000000' }}>INVESTMENT MEMORANDUM</span>
      <span style={{ color: BURGUNDY }}>REDWOOD PARTNERS</span>
    </div>
  );

  const PageFooter = ({ pageNum }) => (
    <div className="doc-footer" style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', marginTop: '20px', fontSize: '10pt', color: '#000000' }}>
      <span style={{ flex: 1, textAlign: 'left' }}></span>
      <span style={{ flex: 1, textAlign: 'center' }}>Confidential</span>
      <span style={{ flex: 1, textAlign: 'right' }}>Page {pageNum}</span>
    </div>
  );

  const printPreviewContent = (
    <div className="im-print-wrapper">
      <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
      
      {/* ── TOP CONTROL BAR ── */}
      <div className="no-print" style={{ height: '60px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', flexShrink: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: '#475569' }}><X size={20} /></button>
          <h2 style={{ margin: 0, fontSize: '12pt', fontWeight: 'bold', color: '#000000' }}>Preview: {projectName}</h2>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={exportToWord} disabled={isExporting} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', background: isExporting ? '#94a3b8' : '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: isExporting ? 'wait' : 'pointer' }}>
            <span style={{ fontWeight: 900, fontSize: '12pt' }}>W</span> {isExporting ? 'Converting...' : 'Export to Word'}
          </button>
          <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', background: BURGUNDY, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            <Printer size={16} /> Print / PDF
          </button>
        </div>
      </div>

      {/* ── DOCUMENT CANVAS ── */}
      <div className="print-canvas" style={{ background: '#cbd5e1' }} id="print-document-content">
        
        {/* PAGE 1: COVER (Page 1) */}
        <div className="im-preview-page cover-page" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
          
          {/* Absolute Top Right Logo Container */}
          <div style={{ position: 'absolute', top: '20mm', right: '20mm', width: '150px', display: 'flex', justifyContent: 'flex-end' }}>
            {logoUrl ? (
              <img src={logoUrl} alt="Company Logo" style={{ maxWidth: '100%', maxHeight: '80px', objectFit: 'contain' }} />
            ) : (
              <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '4px', color: '#64748b', fontSize: '9pt' }}>
                <FileText size={16} /> <span>Upload Logo in Settings</span>
              </div>
            )}
          </div>

          {/* Perfectly Centered Content via Flexbox */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            
            <h1 style={{ fontSize: '12pt', fontWeight: 'bold', color: BURGUNDY, letterSpacing: '1px', margin: '0 0 8px 0' }}>
              REDWOOD PARTNERS
            </h1>
            <h2 style={{ fontSize: '12pt', fontWeight: 'bold', color: '#000000', margin: '0 0 40px 0' }}>
              INVESTMENT MEMORANDUM
            </h2>
            
            <div className="no-print" style={{ marginBottom: '40px' }}>
              <label style={{ display: 'block', fontSize: '10pt', color: '#64748b', marginBottom: '4px' }}>Edit Brand Name:</label>
              <input 
                type="text" 
                value={brandName} 
                onChange={(e) => setBrandName(e.target.value)} 
                style={{ fontSize: '12pt', fontWeight: 'bold', textAlign: 'center', border: '1px solid #cbd5e1', padding: '8px', borderRadius: '4px', width: '300px', fontFamily: FONT_FAMILY }}
              />
            </div>
            {/* Rendered Brand Name for Print */}
            <h3 className="print-only" style={{ fontSize: '12pt', fontWeight: 'bold', color: '#000000', margin: '0 0 40px 0', display: 'none' }}>
              {brandName}
            </h3>
            
            <p style={{ fontSize: '10pt', color: '#000000' }}>
              Date: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* PAGE 2: EVALUATION PARAMETERS */}
        <div className="im-preview-page" style={{ display: 'flex', flexDirection: 'column' }}>
          <PageHeader />
          <div style={{ flex: 1, paddingBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '12pt', fontWeight: 'bold', color: BURGUNDY, margin: 0, textAlign: 'left' }}>INVESTMENT MEMORANDUM - EVALUATION PARAMETERS</h2>
              <button 
                className="no-print"
                onClick={() => setIsEditingEval(!isEditingEval)} 
                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: isEditingEval ? '#10b981' : '#f1f5f9', color: isEditingEval ? 'white' : '#475569', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '10pt', fontWeight: 'bold' }}
              >
                {isEditingEval ? <><Check size={14} /> Save</> : <><Edit2 size={14} /> Edit</>}
              </button>
            </div>

            {isEditingEval ? (
              <textarea 
                value={evalText} 
                onChange={e => setEvalText(e.target.value)} 
                style={{ width: '100%', height: '500px', padding: '16px', fontFamily: FONT_FAMILY, fontSize: '10pt', lineHeight: 1.5, border: '2px solid #3b82f6', borderRadius: '8px', outline: 'none' }}
              />
            ) : (
              <div style={{ fontSize: '10pt', lineHeight: 1.5, color: '#000000', whiteSpace: 'pre-wrap', textAlign: 'left' }}>
                {evalText}
              </div>
            )}
          </div>
          <PageFooter pageNum={2} />
        </div>

        {/* PAGE 3: TABLE OF CONTENTS */}
        <div className="im-preview-page" style={{ display: 'flex', flexDirection: 'column' }}>
          <PageHeader />
          <div style={{ flex: 1, paddingBottom: '20px' }}>
            <h2 style={{ fontSize: '12pt', fontWeight: 'bold', color: '#000000', marginBottom: '24px', textAlign: 'left' }}>Table of Contents</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {parentSections.map((pSec, index) => {
                const sectionPageNum = index + 4; // Cover=1, Eval=2, TOC=3, Dynamic starts at 4
                return (
                  <div key={pSec.id}>
                    <a href={`#sec-${pSec.id}`} className="toc-item">
                      <span className="toc-title">{sectionNumberMap[pSec.id]}. {cleanTitle(customNames[pSec.id] || pSec.heading || pSec.navLabel)}</span>
                      <span className="toc-dots"></span>
                      {/* Using calculated Page Numbers instead of "View" */}
                      <span className="toc-page">{sectionPageNum}</span> 
                    </a>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '24px', marginTop: '8px' }}>
                      {visibleSchema.filter(s => s.parentId === pSec.id).sort((a,b) => (a.order||0) - (b.order||0)).map(cSec => (
                        <a href={`#sec-${cSec.id}`} key={cSec.id} className="toc-item sub-toc">
                          <span className="toc-title">{sectionNumberMap[cSec.id]}. {cleanTitle(customNames[cSec.id] || cSec.heading || cSec.navLabel)}</span>
                          <span className="toc-dots"></span>
                          <span className="toc-page">{sectionPageNum}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <PageFooter pageNum={3} />
        </div>

        {/* PAGE 4+: DYNAMIC CONTENT CHUNKS */}
        {parentSections.map((pSec, index) => {
          const children = visibleSchema.filter(s => s.parentId === pSec.id).sort((a,b) => (a.order||0) - (b.order||0));
          const currentDynamicPageNum = index + 4; // Assigns a sequential page number to each major section

          return (
            <div key={pSec.id} className="im-preview-page content-page" style={{ display: 'flex', flexDirection: 'column' }}>
              <PageHeader />
              
              <div style={{ flex: 1, paddingBottom: '20px' }}>
                <div id={`sec-${pSec.id}`} style={{ marginBottom: '40px' }}>
<h2 style={{ fontSize: '12pt', fontWeight: 'bold', color: '#2563eb', marginBottom: '16px', pageBreakAfter: 'avoid', textAlign: 'left' }}>
  <span style={{ marginRight: '8px', color: '#2563eb' }}>{sectionNumberMap[pSec.id]}.</span>                    {cleanTitle(customNames[pSec.id] || pSec.heading || pSec.navLabel)}
                  </h2>

                  <div style={{ marginBottom: '24px' }}>
                    {ensureArray(pSec.blocks).filter(block => !ensureArray(excludedSections).includes(block.id)).sort((a,b) => (a.order||0)-(b.order||0)).map(block => compileBlock(block))}
                  </div>

                  {children.map(cSec => (
                    <div key={cSec.id} id={`sec-${cSec.id}`} style={{ marginBottom: '24px', paddingLeft: '12px' }}>
                      <h3 style={{ fontSize: '11pt', fontWeight: 'bold', color: '#000000', marginBottom: '12px', pageBreakAfter: 'avoid', textAlign: 'left' }}>
                        {sectionNumberMap[cSec.id]}. {cleanTitle(customNames[cSec.id] || cSec.heading || cSec.navLabel)}
                      </h3>
                      <div>
                        {ensureArray(cSec.blocks).filter(block => !ensureArray(excludedSections).includes(block.id)).sort((a,b) => (a.order||0)-(b.order||0)).map(block => compileBlock(block))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <PageFooter pageNum={currentDynamicPageNum} />
            </div>
          );
        })}

      </div>

      <style>{`
        /* --- GLOBAL TYPOGRAPHY --- */
        .im-print-wrapper {
          font-family: ${FONT_FAMILY};
          color: #000000;
          line-height: 1.5;
          text-align: left;
        }

        /* --- VISUAL UI PAGES (Screen View) --- */
        @media screen {
          .im-print-wrapper { position: fixed; inset: 0; z-index: 9999; display: flex; flex-direction: column; background: #cbd5e1; }
          .print-canvas { flex: 1; overflow-y: auto; padding: 40px 0; }
          
          .im-preview-page {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto 40px auto;
            background: #ffffff;
            box-shadow: 0 10px 30px rgba(0,0,0,0.15);
            padding: 20mm;
            box-sizing: border-box; /* Crucial to keep headers/footers inside page margins */
          }
          
          /* The content page expands if dynamic data is huge, but footer is pushed to bottom */
          .im-preview-page.content-page { height: auto; }
        }

        /* --- TOC DOTTED LEADERS & ANCHORS --- */
        .toc-item { display: flex; align-items: baseline; text-decoration: none; color: #000000; margin-bottom: 8px; font-size: 10pt; }
        .toc-item:hover .toc-title { color: ${BURGUNDY}; }
        .toc-item.sub-toc { color: #000000; }
        .toc-title { background: #fff; padding-right: 8px; font-weight: bold; }
        .sub-toc .toc-title { font-weight: normal; }
        .toc-dots { flex-grow: 1; border-bottom: 2px dotted #000000; margin: 0 8px; }
        .toc-page { background: #fff; padding-left: 8px; font-size: 10pt; color: #000000; font-weight: normal; }

        /* --- NATIVE TABLE & RICH TEXT FIXES (Line Spacing overrides) --- */
        .im-print-table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 10pt; line-height: 1.0; }
        .im-print-table td, .im-print-table th { border: 1px solid #000000 !important; padding: 8px 10px; line-height: 1.0; color: #000000; }
        .im-print-table th { background-color: #f8fafc; font-weight: bold; text-align: left; }
        
        .ql-editor ul, .ql-editor ol { padding-left: 20px; margin: 8px 0; }
        .ql-editor li { margin-bottom: 4px; }
        .ql-editor p { margin: 0 0 8px 0; }
        
        [data-comment-id], [data-comment-id] *, .im-comment-highlight, .im-comment-highlight *,
        mark.im-comment-highlight, mark.im-search-highlight-quill, .im-search-highlight-quill, .im-search-highlight-quill * {
          background: transparent !important; background-color: transparent !important;
          border: none !important; color: inherit !important;
          text-decoration: none !important; box-shadow: none !important;
        }

        /* --- 🖨️ THE ULTIMATE PDF PRINT ENGINE --- */
        @media print {
          /* 1. HIDE THE APP */
          body > *:not(.im-print-wrapper) { display: none !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }

          /* 2. RESET HTML TO ALLOW NATIVE PAGINATION */
          html, body { display: block !important; position: relative !important; height: auto !important; overflow: visible !important; background: white !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          
          .im-print-wrapper, .print-canvas { display: block !important; position: static !important; height: auto !important; width: 100% !important; overflow: visible !important; background: white !important; padding: 0 !important; }

          /* 3. FORMAT THE PAGES FOR PRINT */
          .im-preview-page {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            page-break-after: always; /* Force a hard page break after every container */
            border: none !important;
          }
          
          /* The content page shouldn't force a break at the end */
          .im-preview-page.content-page { page-break-after: auto; }

          /* 5. STRIP UI TABS */
          .print-chart-container button, .print-chart-container [role="tablist"], .print-chart-container .chart-tabs { display: none !important; }

          /* 6. SET STANDARD A4 MARGINS */
          @page { size: A4; margin: 20mm; }
        }
      `}</style>
    </div>
  );

  if (!mounted) return null;
  return createPortal(printPreviewContent, document.body);
}