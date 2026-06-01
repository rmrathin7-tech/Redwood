import React, { useMemo, useEffect } from 'react';
import { X, Printer, Download } from 'lucide-react';

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

  // 3. Data Retrieval Helper
  const getValue = (path) => {
    if (!path) return undefined;
    return path.split('.').reduce((obj, key) => obj?.[key], imData);
  };

  // 4. Smart Table Parser
  const renderTable = (block) => {
    const dataRows = getValue(block.dataPath)?.rows || block.rows || [];
    
    return (
      <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #e2e8f0', pageBreakInside: 'avoid' }}>
          <thead>
            <tr>
              {block.showSno && <th style={{ border: '1px solid #e2e8f0', padding: '10px', background: '#f8fafc', textAlign: 'center', width: '40px' }}>#</th>}
              {(block.colHeaders || []).map((h, i) => (
                <th key={i} style={{ border: '1px solid #e2e8f0', padding: '10px', background: '#f8fafc', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, rIdx) => (
              <tr key={row.id || rIdx}>
                {block.showSno && <td style={{ border: '1px solid #e2e8f0', padding: '10px', textAlign: 'center', color: '#64748b' }}>{rIdx + 1}</td>}
                {(row.cells || []).map((cell, cIdx) => {
                  const cellData = getValue(`${block.dataPath}.rows.${rIdx}.cells.${cIdx}.value`);
                  let displayValue = cellData ?? '-';

                  if (cell.cellType === 'fixed') displayValue = cell.text;
                  if (cell.cellType === 'computed') displayValue = cellData || '-'; // Assuming computed values are saved in DB
                  if (cell.inputType === 'quill') displayValue = <div dangerouslySetInnerHTML={{ __html: cellData || '-' }} />;
                  if (cell.cellType === 'smart-select') displayValue = cellData || '-';

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

  // 5. Block Compiler Engine
  const compileBlock = (block) => {
    const val = getValue(block.dataPath);

    // Skip instructions
    if (block.type === 'instruction') return null;

    return (
      <div key={block.id} style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
        {block.label && !['fixed-text', 'instruction'].includes(block.type) && (
          <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{cleanTitle(block.label)}</h4>
        )}
        
        {block.type === 'fixed-text' && <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{block.content}</div>}
        
        {(block.type === 'text' || block.type === 'textarea') && (
          <div style={{ fontSize: '13px', color: '#475569', background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>{val || 'N/A'}</div>
        )}

        {block.type === 'quill' && (
          <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: val || '<span style="color:#94a3b8">N/A</span>' }} />
        )}

        {block.type === 'table' && renderTable(block)}

        {block.type === 'conditional-switch' && (() => {
          // Find which branch was selected in the DB
          const selectedBranchId = val?.selectedBranch;
          if (!selectedBranchId) return null;
          
          const branch = block.branches?.find(b => b.id === selectedBranchId);
          if (!branch || !branch.blocks) return null;

          return (
            <div style={{ paddingLeft: '16px', borderLeft: '2px solid #e2e8f0', marginTop: '12px' }}>
              {branch.blocks.map(b => compileBlock(b))}
            </div>
          );
        })()}

        {block.type === 'mixed' && (
          <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            {/* Extremely basic fallback for mixed templates if they aren't pre-rendered in DB */}
            {val?.compiledText || val || 'N/A'} 
          </div>
        )}
      </div>
    );
  };

  const parentSections = visibleSchema.filter(s => !s.parentId).sort((a,b) => (a.order||0) - (b.order||0));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#cbd5e1', display: 'flex', flexDirection: 'column' }}>
      
      {/* ── TOP ACTION BAR (Hidden in Print) ── */}
      <div className="no-print" style={{ height: '60px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: '#475569' }}><X size={20} /></button>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Print Preview: {projectName}</h2>
        </div>
        <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(239,68,68,0.2)' }}>
          <Printer size={16} /> Print / Save as PDF
        </button>
      </div>

      {/* ── SCROLLABLE PREVIEW CANVAS ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px 0' }}>
        
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
          @page { size: A4; margin: 15mm; }
          body { background: #fff; margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
          
          /* Hide everything in the app EXCEPT the document */
          body > *:not(#print-mount-point) { display: none !important; }
          .no-print { display: none !important; }
          
          /* Reset Document bounds for printing */
          #print-document { 
            width: 100% !important; 
            margin: 0 !important; 
            padding: 0 !important; 
            box-shadow: none !important; 
          }
          
          /* Ensure headers/footers appear on every page if needed natively by browser */
        }
      `}</style>
    </div>
  );
}
