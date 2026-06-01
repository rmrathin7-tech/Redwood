import React, { useMemo } from 'react';
import { X, Printer } from 'lucide-react';

export default function IMPrintPreview({ schema, imData, excludedSections, projectName, onClose }) {
  // 1. Calculate Visible Schema (Respect Exclusions)
  const visibleSchema = useMemo(() => {
    return schema.filter(s => !excludedSections.includes(s.id));
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

  // 3. Data Retrieval Helper (Supports global imData OR local repeating context)
  const getValue = (path, contextData = null) => {
    if (contextData !== null) return contextData[path]; // For Repeating Block Sets
    if (!path) return undefined;
    return path.split('.').reduce((obj, key) => obj?.[key], imData);
  };

  // 4. Smart Table Parser
  const renderTable = (block, blockData) => {
    const dataRows = blockData?.rows || block.rows || [];
    
    return (
      <div style={{ overflowX: 'auto', marginBottom: '24px', pageBreakInside: 'avoid' }}>
        {/* Table Subheading (If enabled) */}
        {block.enableTableSubheading && blockData?.tableSubheadingRichText && (
          <div 
            style={{ fontSize: '13px', color: '#475569', marginBottom: '10px', fontStyle: 'italic' }} 
            dangerouslySetInnerHTML={{ __html: blockData.tableSubheadingRichText }} 
          />
        )}
        
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #e2e8f0' }}>
          <thead>
            <tr>
              {block.showSno && <th style={{ border: '1px solid #cbd5e1', padding: '10px', background: '#f8fafc', textAlign: 'center', width: '40px', color: '#0f172a' }}>#</th>}
              {(block.colHeaders || []).map((h, i) => (
                <th key={i} style={{ border: '1px solid #cbd5e1', padding: '10px', background: '#f8fafc', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, rIdx) => (
              <tr key={row.id || rIdx}>
                {block.showSno && <td style={{ border: '1px solid #e2e8f0', padding: '10px', textAlign: 'center', color: '#64748b' }}>{rIdx + 1}</td>}
                {(row.cells || []).map((cell, cIdx) => {
                  const cellData = blockData?.rows?.[rIdx]?.cells?.[cIdx]?.value;
                  let displayValue = cellData ?? cell.text ?? '-';

                  // Handle Specific Cell Types safely
                  if (cell.cellType === 'fixed') displayValue = cell.text;
                  if (cell.cellType === 'computed') displayValue = cellData || cell.formula || '-'; 
                  if (cell.inputType === 'quill') displayValue = <div dangerouslySetInnerHTML={{ __html: cellData || '-' }} />;
                  if (cell.cellType === 'smart-select') displayValue = cellData || '-';
                  if (cell.cellType === 'mixed') displayValue = cellData?.compiledText || cellData || '-';

                  return (
                    <td key={cIdx} colSpan={cell.colspan || 1} rowSpan={cell.rowspan || 1} style={{ border: '1px solid #e2e8f0', padding: '10px', verticalAlign: 'top', color: '#334155' }}>
                      {displayValue}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // 5. Ultimate Block Compiler Engine (Covers all 16 Schema Types)
  const compileBlock = (block, contextData = null) => {
    if (!block) return null;
    
    // Skip instruction notes completely for print
    if (block.type === 'instruction') return null;

    // Get value safely (respecting if we are inside a repeating loop)
    const dataKey = block.dataPath || block.id; 
    const val = getValue(dataKey, contextData);

    return (
      <div key={block.id} style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
        {/* Standard Block Label */}
        {block.label && !['fixed-text', 'instruction'].includes(block.type) && (
          <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{cleanTitle(block.label)}</h4>
        )}
        
        {/* 1. Fixed Text */}
        {block.type === 'fixed-text' && (
          <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{block.content}</div>
        )}
        
        {/* 2. Text / Textarea / Generic Inputs */}
        {['text', 'textarea', 'number', 'currency', 'percentage', 'email', 'date'].includes(block.type) && (
          <div style={{ fontSize: '13px', color: '#0f172a', background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap' }}>
            {val || '-'}
          </div>
        )}

        {/* 3. Quill (Rich Text) */}
        {block.type === 'quill' && (
          <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: val || '<span style="color:#94a3b8">-</span>' }} />
        )}

        {/* 4. Table */}
        {block.type === 'table' && renderTable(block, val)}

        {/* 5. Boolean & Compliance */}
        {(block.type === 'boolean' || block.type === 'compliance') && (
          <div style={{ fontSize: '13px', color: '#0f172a', background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'inline-block' }}>
            {val || '-'}
          </div>
        )}

        {/* 6. List (Bullet points) */}
        {block.type === 'list' && (
          <ul style={{ fontSize: '13px', color: '#334155', margin: 0, paddingLeft: '24px', lineHeight: 1.6 }}>
            {(val || []).map((item, i) => (
              <li key={i} style={{ marginBottom: '6px' }}>{typeof item === 'object' ? item.value : item}</li>
            ))}
            {(!val || val.length === 0) && <li style={{ color: '#94a3b8', listStyleType: 'none', marginLeft: '-24px' }}>-</li>}
          </ul>
        )}

        {/* 7. Image */}
        {block.type === 'image' && (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
            {(Array.isArray(val) ? val : (val ? [val] : [])).map((img, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <img src={img.url || img} alt="" style={{ maxWidth: block.imageWidth || '300px', height: block.imageHeight || 'auto', objectFit: block.objectFit || 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
                {img.caption && <span style={{ fontSize: '11px', color: '#64748b' }}>{img.caption}</span>}
              </div>
            ))}
            {(!val || val.length === 0) && <div style={{ fontSize: '13px', color: '#94a3b8' }}>No images uploaded</div>}
          </div>
        )}

        {/* 8. File */}
        {block.type === 'file' && (
          <div style={{ fontSize: '12px', color: '#3b82f6', background: '#eff6ff', padding: '10px 14px', borderRadius: '6px', border: '1px dashed #bfdbfe' }}>
            {(Array.isArray(val) ? val : (val ? [val] : [])).map((f, i) => (
               <div key={i}>📄 {f.name || 'Attached File'}</div>
            ))}
            {(!val || val.length === 0) && <span style={{color: '#94a3b8'}}>-</span>}
          </div>
        )}

        {/* 9. Conditional Switcher */}
        {block.type === 'conditional-switch' && (() => {
          const selectedBranchId = val?.selectedBranch;
          if (!selectedBranchId) return null;
          
          const branch = block.branches?.find(b => b.id === selectedBranchId);
          if (!branch || !branch.blocks) return null;

          return (
            <div style={{ paddingLeft: '16px', borderLeft: '2px solid #cbd5e1', marginTop: '12px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 700 }}>Condition: {branch.label}</div>
              {branch.blocks.map(b => compileBlock(b, contextData))}
            </div>
          );
        })()}

        {/* 10. Repeating Block Set */}
        {block.type === 'repeating-block-set' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '12px' }}>
            {(val || []).map((instanceData, i) => (
              <div key={i} style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', borderLeft: '3px solid #ef4444', background: '#f8fafc' }}>
                <div style={{ fontSize: '11px', color: '#ef4444', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 800 }}>Set #{i + 1}</div>
                {/* Recursively compile sub-blocks passing the instanceData as the new context */}
                {(block.blocks || []).map(subBlock => compileBlock(subBlock, instanceData))}
              </div>
            ))}
            {(!val || val.length === 0) && <div style={{ fontSize: '13px', color: '#94a3b8' }}>-</div>}
          </div>
        )}

        {/* 11. Repeating Group (Founders, Testimonials, etc) */}
        {block.type === 'repeating-group' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
            {(val || []).map((item, i) => (
              <div key={i} style={{ padding: '14px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#ffffff' }}>
                {(block.template || []).map(field => (
                  <div key={field.id} style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>{field.label}</div>
                    <div style={{ fontSize: '13px', color: '#0f172a' }}>{item[field.id] || '-'}</div>
                  </div>
                ))}
              </div>
            ))}
            {(!val || val.length === 0) && <div style={{ fontSize: '13px', color: '#94a3b8' }}>-</div>}
          </div>
        )}

        {/* 12. Chart (Fallback to Data Table for Print safety) */}
        {block.type === 'chart' && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', fontStyle: 'italic' }}>Chart Data Representation</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #e2e8f0', pageBreakInside: 'avoid' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #cbd5e1', padding: '8px', background: '#f8fafc', textAlign: 'left' }}>{block.xAxisLabel || 'Category'}</th>
                  {(block.series || []).map((s, i) => <th key={i} style={{ border: '1px solid #cbd5e1', padding: '8px', background: '#f8fafc', textAlign: 'left' }}>{s}</th>)}
                </tr>
              </thead>
              <tbody>
                {(val?.rows || block.rowLabels || []).map((row, rIdx) => (
                  <tr key={rIdx}>
                    <td style={{ border: '1px solid #e2e8f0', padding: '8px', fontWeight: 600 }}>{row.label || row || `Row ${rIdx+1}`}</td>
                    {(block.series || []).map((s, cIdx) => (
                      <td key={cIdx} style={{ border: '1px solid #e2e8f0', padding: '8px', color: '#334155' }}>{row.values?.[cIdx] ?? val?.[`${rIdx}_${cIdx}`] ?? '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 13. Mixed (Fill-in-the-blanks) */}
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#cbd5e1', display: 'flex', flexDirection: 'column' }}>
      
      {/* ── TOP ACTION BAR (Hidden in Print) ── */}
      <div className="no-print" style={{ height: '60px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: '#475569' }}><X size={20} /></button>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Print Preview: {projectName}</h2>
        </div>
        <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(239,68,68,0.2)' }}>
          <Printer size={16} /> Print / Save as PDF
        </button>
      </div>

      {/* ── SCROLLABLE PREVIEW CANVAS ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px 0' }} className="print-canvas">
        
        {/* THE DOCUMENT PAPER */}
        <div id="print-document" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', background: '#ffffff', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '25mm 20mm' }}>
          
          {/* COVER PAGE */}
          <div style={{ height: '240mm', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', borderBottom: '2px solid #e2e8f0', pageBreakAfter: 'always' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', letterSpacing: '4px', margin: '0 0 40px 0' }}>REDWOOD <span style={{color: '#ef4444'}}>PARTNERS</span></h1>
            <h2 style={{ fontSize: '36px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0' }}>INVESTMENT MEMORANDUM</h2>
            <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#475569', margin: '0 0 40px 0' }}>Brand Name: {projectName}</h3>
            <p style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600 }}>Generated on: {new Date().toLocaleDateString('en-GB')}</p>
          </div>

          {/* PRETEXT PAGE */}
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

          {/* TABLE OF CONTENTS */}
          <div style={{ pageBreakAfter: 'always', paddingTop: '20mm' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginBottom: '24px', borderBottom: '2px solid #ef4444', paddingBottom: '8px' }}>Table of Contents</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {parentSections.map(pSec => (
                <div key={pSec.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                    <span>{sectionNumberMap[pSec.id]}. {cleanTitle(pSec.heading || pSec.navLabel)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '24px', marginTop: '8px' }}>
                    {visibleSchema.filter(s => s.parentId === pSec.id).sort((a,b) => (a.order||0) - (b.order||0)).map(cSec => (
                      <div key={cSec.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569' }}>
                        <span>{sectionNumberMap[cSec.id]}. {cleanTitle(cSec.heading || cSec.navLabel)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ACTUAL CONTENT */}
          <div style={{ paddingTop: '10mm' }}>
            {parentSections.map(pSec => {
              const children = visibleSchema.filter(s => s.parentId === pSec.id).sort((a,b) => (a.order||0) - (b.order||0));
              return (
                <div key={pSec.id} style={{ marginBottom: '40px' }}>
                  
                  {/* Parent Section Header */}
                  <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '16px', pageBreakAfter: 'avoid' }}>
                    <span style={{ color: '#ef4444', marginRight: '8px' }}>{sectionNumberMap[pSec.id]}.</span>
                    {cleanTitle(pSec.heading || pSec.navLabel)}
                  </h2>

                  {/* Parent Blocks */}
                  <div style={{ marginBottom: '24px' }}>
                    {(pSec.blocks || []).sort((a,b) => (a.order||0)-(b.order||0)).map(block => compileBlock(block))}
                  </div>

                  {/* Child Subsections */}
                  {children.map(cSec => (
                    <div key={cSec.id} style={{ marginBottom: '24px', paddingLeft: '16px' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginBottom: '12px', pageBreakAfter: 'avoid' }}>
                        {sectionNumberMap[cSec.id]}. {cleanTitle(cSec.heading || cSec.navLabel)}
                      </h3>
                      <div>
                        {(cSec.blocks || []).sort((a,b) => (a.order||0)-(b.order||0)).map(block => compileBlock(block))}
                      </div>
                    </div>
                  ))}

                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* ── GLOBAL PRINT CSS INJECTION ── */}
      <style>{`
        @media print {
          /* 1. RESET HTML/BODY TO ALLOW FULL SCROLL PRINTING */
          html, body, #root {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* 2. HIDE REACT ROOT & WORKSPACE APP */
          aside, header, main, .no-print {
            display: none !important;
          }

          /* 3. FORMAT THE PRINT MOUNT POINT */
          #print-mount-point {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* 4. STRIP BACKGROUNDS & SHADOWS FROM DOCUMENT */
          #print-document {
            box-shadow: none !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .print-canvas {
            overflow: visible !important;
            padding: 0 !important;
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
