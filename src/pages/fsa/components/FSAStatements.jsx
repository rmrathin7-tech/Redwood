/**
 * src/pages/fsa/components/FSAStatements.jsx
 * DYNAMIC CALCULATED FINANCIAL STATEMENTS REPORTING ENGINE
 * Fully upgraded to support Global SaaS Theme Variables (Light/Dark Mode)
 */

import React, { useState, useMemo } from 'react';
import { FileText, Eye, Table, Sliders, Printer, FileSpreadsheet } from 'lucide-react';
import { formatValue } from '../utils/fsaFormatters';
import { buildFinancialModel } from '../core/fsaEngine';

export default function FSAStatements({
  projectData,
  configSchemas,
  reclassMap,
  activeEntityType,
  activeYearsList,
  activeItemsMap
}) {
  const [viewMode, setViewMode] = useState('full');
  const [targetScope, setTargetScope] = useState('all');

  const availableDocs = configSchemas?.documents || [];
  const sharedCoA = configSchemas?.chartOfAccounts?.shared || {};

  // ── 1. Use activeYearsList from Firestore ──
  const visibleYears = useMemo(() => {
    return [...(activeYearsList || [])].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [activeYearsList]);

  // ── 2. Pre-compute Models for All Years ──
  const multiYearModel = useMemo(() => {
    const models = {};
    visibleYears.forEach(year => {
      const modelForYear = buildFinancialModel(projectData, year, reclassMap, configSchemas, activeEntityType);
      models[year] = modelForYear[year] || {};
    });
    return models;
  }, [projectData, visibleYears, reclassMap, configSchemas, activeEntityType]);

  // ── 3. Data Retrieval Helpers ──
  const getInputValue = (docKey, secKey, itemKey, year) => {
    const safeKey = itemKey.replace(/\./g, '');
    const val = projectData?.[docKey]?.[secKey]?.[year]?.[safeKey];
    return val !== undefined && val !== null ? parseFloat(val) : 0;
  };

  const getParentSum = (docKey, secKey, parentName, year) => {
    let sum = 0;
    const safeParentPrefix = parentName.replace(/\./g, '') + '||';
    const yearData = projectData?.[docKey]?.[secKey]?.[year] || {};
    Object.keys(yearData).forEach(k => {
      if (k.startsWith(safeParentPrefix)) sum += parseFloat(yearData[k]) || 0;
    });
    return sum;
  };

  // ── 4. Print Handler — dedicated print window ──
  const printReport = () => {
    const docsToRender = availableDocs.filter(d => targetScope === 'all' || d.key === targetScope);

    // Build rows HTML for a given doc
    const buildDocHTML = (doc) => {
      const nodes = sharedCoA[doc.key] || [];
      const yearHeaders = visibleYears.map(y => `<th>FY ${y}</th>`).join('');

      let rowsHTML = '';

      nodes.forEach((node, nodeIdx) => {
        // 1. Group Header
        if (node.type === 'group') {
          rowsHTML += `
            <tr class="row-group">
              <td class="col-label">${node.title}</td>
              ${visibleYears.map(() => '<td></td>').join('')}
            </tr>`;
          return;
        }

        // 2. Engine Total
        if (node.type === 'total') {
          const vals = visibleYears.map(year => {
            const v = multiYearModel[year]?.[node.key] || 0;
            return `<td class="col-value">${formatValue(node.key, v, configSchemas)}</td>`;
          }).join('');
          rowsHTML += `
            <tr class="row-total">
              <td class="col-label">Σ ${node.title}</td>
              ${vals}
            </tr>`;
          return;
        }

        if (viewMode === 'summary') return;

        // 3. Equity Placeholder
        if (node.dynamic && node.key === 'equity_placeholder') {
          const equitySchema = configSchemas?.entityTypes?.[activeEntityType]?.equitySchema?.[0];
          if (!equitySchema) return;
          const activeLines = activeItemsMap[doc.key]?.['equity'] || [];

          rowsHTML += `
            <tr class="row-section">
              <td class="col-label">${equitySchema.title}</td>
              ${visibleYears.map(() => '<td></td>').join('')}
            </tr>`;

          if (viewMode === 'full') {
            activeLines.forEach(eqItemLabel => {
              const originalItem = (equitySchema.items || []).find(itm => itm.label === eqItemLabel);
              const itemKey = originalItem ? originalItem.dataKey : eqItemLabel.toLowerCase().replace(/[^a-z0-9]/g, '');
              const vals = visibleYears.map(year => {
                const val = getInputValue(doc.key, 'equity', itemKey, year);
                return `<td class="col-value">${val !== 0 ? formatValue('default', val, configSchemas) : '—'}</td>`;
              }).join('');
              rowsHTML += `
                <tr class="row-item">
                  <td class="col-label col-indent-1">${eqItemLabel}</td>
                  ${vals}
                </tr>`;
            });
          }
          return;
        }

        // 4. Standard Sections
        if (node.type === 'section') {
          const activeLines = activeItemsMap[doc.key]?.[node.key] || [];

          rowsHTML += `
            <tr class="row-section">
              <td class="col-label">${node.title}</td>
              ${visibleYears.map(() => '<td></td>').join('')}
            </tr>`;

          if (viewMode === 'full') {
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

            Array.from(hierarchyMap.entries()).forEach(([parentLabel, data]) => {
              const vals = visibleYears.map(year => {
                const val = data.subs.length > 0
                  ? getParentSum(doc.key, node.key, parentLabel, year)
                  : getInputValue(doc.key, node.key, data.dataKey, year);
                return `<td class="col-value">${val !== 0 ? formatValue('default', val, configSchemas) : '—'}</td>`;
              }).join('');
              const labelClass = data.subs.length > 0 ? 'col-label col-indent-1 parent-label' : 'col-label col-indent-1';
              rowsHTML += `
                <tr class="row-item">
                  <td class="${labelClass}">${parentLabel}</td>
                  ${vals}
                </tr>`;

              data.subs.forEach(sub => {
                const subVals = visibleYears.map(year => {
                  const val = getInputValue(doc.key, node.key, sub.fullValue, year);
                  return `<td class="col-value col-value-sub">${val !== 0 ? formatValue('default', val, configSchemas) : '—'}</td>`;
                }).join('');
                rowsHTML += `
                  <tr class="row-subitem">
                    <td class="col-label col-indent-2">↳ ${sub.label}</td>
                    ${subVals}
                  </tr>`;
              });
            });
          } else if (viewMode === 'compact') {
            activeLines.forEach(lineItem => {
              const isSubItem = lineItem.includes('||');
              const displayLabel = isSubItem ? lineItem.split('||')[1] : lineItem;
              const vals = visibleYears.map(year => {
                const val = getInputValue(doc.key, node.key, lineItem, year);
                return `<td class="col-value">${val !== 0 ? formatValue('default', val, configSchemas) : '—'}</td>`;
              }).join('');
              rowsHTML += `
                <tr class="row-item">
                  <td class="col-label ${isSubItem ? 'col-indent-2' : 'col-indent-1'}">${displayLabel}</td>
                  ${vals}
                </tr>`;
            });
          }
        }
      });

      return `
        <div class="doc-block">
          <h2>${doc.name}</h2>
          <table>
            <thead>
              <tr>
                <th class="col-label-header">Particulars</th>
                ${yearHeaders}
              </tr>
            </thead>
            <tbody>${rowsHTML}</tbody>
          </table>
        </div>`;
    };

    const allDocsHTML = docsToRender.map(buildDocHTML).join('');

    const printStyles = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 9pt;
        color: #000;
        background: #fff;
        padding: 10mm;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        margin-bottom: 8mm;
        border-bottom: 1.5px solid #000;
        padding-bottom: 3mm;
      }
      .header h1 { font-size: 14pt; font-weight: 700; }
      .header .meta { font-size: 8pt; color: #444; text-align: right; }
      .doc-block { margin-bottom: 10mm; page-break-inside: avoid; }
      .doc-block h2 {
        font-size: 11pt;
        font-weight: 700;
        margin-bottom: 3mm;
        padding-bottom: 1.5mm;
        border-bottom: 1px solid #000;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      th, td {
        border-bottom: 0.5px solid #ccc;
        padding: 2.5pt 5pt;
        vertical-align: middle;
      }
      th {
        background: #f0f0f0;
        font-size: 8pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        border-bottom: 1px solid #000;
      }
      .col-label-header { text-align: left; width: 38%; }
      .col-label { text-align: left; }
      .col-value { text-align: right; font-family: 'Courier New', monospace; font-size: 8.5pt; }
      .col-value-sub { color: #555; }
      .col-indent-1 { padding-left: 12pt; }
      .col-indent-2 { padding-left: 22pt; font-size: 8pt; color: #444; }
      .parent-label { font-weight: 600; }

      /* Row types */
      .row-group td {
        font-size: 9pt;
        font-weight: 800;
        background: #e8e8e8;
        border-top: 1px solid #000;
        border-bottom: 1px solid #000;
        letter-spacing: 0.03em;
        padding: 3pt 5pt;
      }
      .row-section td {
        font-size: 8.5pt;
        font-weight: 700;
        background: #f5f5f5;
        border-top: 0.5px solid #bbb;
        padding: 3pt 5pt;
      }
      .row-total td {
        font-size: 9pt;
        font-weight: 800;
        background: #e8e8e8;
        border-top: 1.5px solid #000;
        border-bottom: 1.5px solid #000;
        padding: 3.5pt 5pt;
      }
      .row-total .col-value { font-size: 9pt; }
      .row-subitem td { font-size: 8pt; color: #444; }
      tr { page-break-inside: avoid; }
      .doc-block { page-break-before: auto; }
      @page {
        size: A4 landscape;
        margin: 10mm 12mm;
      }
      @media print {
        .no-print { display: none !important; }
      }
    `;

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const printHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Financial Statements</title>
  <style>${printStyles}</style>
</head>
<body>
  <div class="no-print" style="position:sticky;top:0;z-index:100;display:flex;justify-content:space-between;align-items:center;background:#1a1a1a;color:#fff;padding:10px 20px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
    <div style="display:flex;align-items:center;gap:10px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span style="font-weight:600;color:#fff;">Financial Statements</span>
      <span style="color:#666;font-size:11px;">— Review, then print</span>
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <span style="color:#666;font-size:11px;margin-right:4px;">${dateStr} &nbsp;·&nbsp; ${viewMode === 'full' ? 'Detailed Schedule' : viewMode === 'compact' ? 'Compact View' : 'Totals Only'}</span>
      <button onclick="window.print()" style="background:#2563eb;color:#fff;border:none;padding:7px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">🖨 Print</button>
      <button onclick="window.close()" style="background:#3f3f3f;color:#ccc;border:none;padding:7px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">✕ Close</button>
    </div>
  </div>
  <div class="header">
    <h1>Financial Statements</h1>
    <div class="meta">
      <div>Printed: ${dateStr}</div>
      <div>View: ${viewMode === 'full' ? 'Detailed Schedule' : viewMode === 'compact' ? 'Compact View' : 'Totals Only'}</div>
    </div>
  </div>
  ${allDocsHTML}
</body>
</html>`;

const printWin = window.open('', '_blank', 'width=1200,height=800');
if (!printWin) {
  alert('Pop-up blocked. Please allow pop-ups for this site and try again.');
  return;
}
printWin.document.write(printHTML);
printWin.document.close();
printWin.focus();
  };

  // ── 5. Export CSV ──
  const exportToCSV = () => {
    let csv = "Financial Statements Export\n\n";

    availableDocs.filter(d => targetScope === 'all' || d.key === targetScope).forEach(doc => {
      csv += `${doc.name.toUpperCase()}\n`;
      csv += `Particulars,${visibleYears.map(y => `FY ${y}`).join(',')}\n`;

      const nodes = sharedCoA[doc.key] || [];
      nodes.forEach(node => {
        if (node.type === 'group') {
          csv += `"${node.title}"\n`;
        } else if (node.type === 'total') {
          csv += `"TOTAL ${node.title}",${visibleYears.map(y => multiYearModel[y]?.[node.key] || 0).join(',')}\n`;
        } else if (node.type === 'section') {
          csv += `"${node.title}"\n`;
          if (viewMode === 'full') {
            const activeLines = activeItemsMap[doc.key]?.[node.key] || [];
            activeLines.forEach(line => {
              const display = line.includes('||') ? `  - ${line.split('||')[1]}` : line;
              const safeKey = line.replace(/\./g, '');
              csv += `"${display}",${visibleYears.map(y => getInputValue(doc.key, node.key, safeKey, y)).join(',')}\n`;
            });
          }
        } else if (node.dynamic && node.key === 'equity_placeholder') {
          csv += `"Shareholders Equity"\n`;
          if (viewMode === 'full') {
            const activeLines = activeItemsMap[doc.key]?.['equity'] || [];
            activeLines.forEach(line => {
              const safeKey = line.replace(/\./g, '').toLowerCase();
              csv += `"${line}",${visibleYears.map(y => getInputValue(doc.key, 'equity', safeKey, y)).join(',')}\n`;
            });
          }
        }
      });
      csv += "\n\n";
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'Financial_Statements.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── 6. Empty State ──
  if (visibleYears.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <FileText size={48} opacity={0.2} />
        <h2 style={{ fontSize: 20, color: 'var(--text-primary)', margin: 0 }}>Statements Awaiting Data</h2>
        <p style={{ maxWidth: 400, lineHeight: 1.6 }}>Populate the Financial Input Matrix with active years and inputs to generate statements.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 32, animation: 'fadeIn 0.4s ease-out' }}>

      {/* ── STYLES FOR THEME-AWARE REPORTS ── */}
      <style dangerouslySetInnerHTML={{__html: `
        .fsa-statement-wrapper {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-secondary);
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }
        .fsa-statement-table { width: 100%; border-collapse: separate; border-spacing: 0; min-width: max-content; }

        .statement-sticky-col {
          position: sticky;
          left: 0;
          background: var(--bg-secondary);
          z-index: 20;
          transition: background 0.2s;
          box-shadow: inset -1px 0 0 var(--border-subtle);
        }

        .statement-sticky-header {
          position: sticky;
          top: 0;
          background: var(--bg-tertiary);
          z-index: 30;
          box-shadow: inset 0 -1px 0 var(--border-strong);
        }

        .statement-sticky-col.statement-sticky-header { z-index: 40; }

        .statement-glass-row { transition: background 0.15s ease; }
        .statement-glass-row:hover td { background: var(--bg-hover); }
        .statement-glass-row:hover .statement-sticky-col {
          background: var(--bg-hover);
          box-shadow: inset -1px 0 0 var(--border-strong), inset 3px 0 0 var(--accent-color);
        }

        .fsa-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
        .fsa-scroll::-webkit-scrollbar-track { background: transparent; }
        .fsa-scroll::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }
        .fsa-scroll::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
      `}} />

      {/* ── TOP ACTION BAR ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, background: 'var(--bg-secondary)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} color="var(--accent-color)" />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Standard Reports</span>
          </div>

          <div style={{ height: 24, width: 1, background: 'var(--border-subtle)' }}></div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-strong)' }}>
              <Eye size={14} color="var(--text-muted)" />
              <select
                value={targetScope}
                onChange={(e) => setTargetScope(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, outline: 'none', cursor: 'pointer' }}
              >
                <option value="all">Consolidated View</option>
                {availableDocs.map(d => <option key={d.key} value={d.key}>{d.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-strong)' }}>
              <Sliders size={14} color="var(--text-muted)" />
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, outline: 'none', cursor: 'pointer' }}
              >
                <option value="full">Detailed Schedule</option>
                <option value="compact">Compact View</option>
                <option value="summary">Totals Only</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={exportToCSV} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <FileSpreadsheet size={14} /> Export CSV
          </button>
          <button onClick={printReport} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent-color)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Printer size={14} /> Print Review
          </button>
        </div>

      </div>

      {/* ── REPORTS RENDERER ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {availableDocs.filter(d => targetScope === 'all' || d.key === targetScope).map(doc => {
          const nodes = sharedCoA[doc.key] || [];

          return (
            <div key={doc.key} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 style={{ margin: '0 0 4px 8px', fontSize: 16, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Table size={16} color="var(--accent-color)" /> {doc.name}
              </h3>

              <div className="fsa-statement-wrapper fsa-scroll">
                <table className="fsa-statement-table">
                  <thead>
                    <tr>
                      <th className="statement-sticky-header statement-sticky-col" style={{ padding: '16px 24px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: '350px', minWidth: '300px', textAlign: 'left' }}>
                        Particulars
                      </th>
                      {visibleYears.map(year => (
                        <th key={year} className="statement-sticky-header" style={{ padding: '16px 24px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, textTransform: 'uppercase', textAlign: 'right', minWidth: 160 }}>
                          FY {year}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.map((node, nodeIdx) => {

                      // 1. Group Headers
                      if (node.type === 'group') {
                        return (
                          <tr key={`grp_${nodeIdx}`}>
                            <td className="statement-sticky-col" style={{ padding: '16px 24px', fontSize: 13, fontWeight: 800, color: 'var(--accent-text)', borderBottom: '1px solid var(--border-subtle)', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}>
                              {node.title}
                            </td>
                            {visibleYears.map(year => (
                              <td key={year} style={{ borderBottom: '1px solid var(--border-subtle)', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}></td>
                            ))}
                          </tr>
                        );
                      }

                      // 2. Engine Totals
                      if (node.type === 'total') {
                        return (
                          <tr key={`tot_${nodeIdx}`}>
                            <td className="statement-sticky-col" style={{ padding: '14px 24px', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', background: 'var(--bg-tertiary)', borderBottom: '2px solid var(--border-strong)' }}>
                              Σ {node.title}
                            </td>
                            {visibleYears.map(year => {
                              const calculatedValue = multiYearModel[year]?.[node.key] || 0;
                              return (
                                <td key={year} style={{ padding: '14px 24px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right', fontFamily: 'monospace', background: 'var(--bg-tertiary)', borderBottom: '2px solid var(--border-strong)' }}>
                                  {formatValue(node.key, calculatedValue, configSchemas)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      }

                      if (viewMode === 'summary') return null;

                      // 3. Dynamic Equity Placeholder
                      if (node.dynamic && node.key === 'equity_placeholder') {
                        const equitySchema = configSchemas?.entityTypes?.[activeEntityType]?.equitySchema?.[0];
                        if (!equitySchema) return null;

                        const activeLines = activeItemsMap[doc.key]?.['equity'] || [];
                        return (
                          <React.Fragment key={`eq_${nodeIdx}`}>
                            <tr>
                              <td className="statement-sticky-col" style={{ padding: '14px 24px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
                                {equitySchema.title}
                              </td>
                              {visibleYears.map(year => (
                                <td key={year} style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}></td>
                              ))}
                            </tr>

                            {viewMode === 'full' && activeLines.map((eqItemLabel, eqIdx) => {
                              const originalItem = (equitySchema.items || []).find(itm => itm.label === eqItemLabel);
                              const itemKey = originalItem ? originalItem.dataKey : eqItemLabel.toLowerCase().replace(/[^a-z0-9]/g, '');
                              return (
                                <tr className="statement-glass-row" key={`eq_i_${eqIdx}`}>
                                  <td className="statement-sticky-col" style={{ padding: '10px 24px 10px 48px', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, borderBottom: '1px solid var(--border-subtle)' }}>
                                    {eqItemLabel}
                                  </td>
                                  {visibleYears.map(year => {
                                    const val = getInputValue(doc.key, 'equity', itemKey, year);
                                    return (
                                      <td key={year} style={{ padding: '10px 24px', fontSize: 13, color: 'var(--text-primary)', textAlign: 'right', fontFamily: 'monospace', borderBottom: '1px solid var(--border-subtle)' }}>
                                        {val !== 0 ? formatValue('default', val, configSchemas) : '—'}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      }

                      // 4. Standard Sections
                      if (node.type === 'section') {
                        const activeLines = activeItemsMap[doc.key]?.[node.key] || [];

                        // Build Hierarchy for rendering
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
                          <React.Fragment key={`sec_${nodeIdx}`}>
                            <tr>
                              <td className="statement-sticky-col" style={{ padding: '14px 24px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
                                {node.title}
                              </td>
                              {visibleYears.map(year => (
                                <td key={year} style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}></td>
                              ))}
                            </tr>

                            {viewMode === 'full' && Array.from(hierarchyMap.entries()).map(([parentLabel, data], pIdx) => (
                              <React.Fragment key={`itm_${nodeIdx}_${pIdx}`}>

                                <tr className="statement-glass-row">
                                  <td className="statement-sticky-col" style={{ padding: '10px 24px 10px 48px', fontSize: 13, color: data.subs.length > 0 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: data.subs.length > 0 ? 700 : 500, borderBottom: '1px solid var(--border-subtle)' }}>
                                    {parentLabel}
                                  </td>
                                  {visibleYears.map(year => {
                                    const val = data.subs.length > 0
                                      ? getParentSum(doc.key, node.key, parentLabel, year)
                                      : getInputValue(doc.key, node.key, data.dataKey, year);

                                    return (
                                      <td key={year} style={{ padding: '10px 24px', fontSize: 13, color: 'var(--text-primary)', textAlign: 'right', fontFamily: 'monospace', borderBottom: '1px solid var(--border-subtle)' }}>
                                        {val !== 0 ? formatValue('default', val, configSchemas) : '—'}
                                      </td>
                                    );
                                  })}
                                </tr>

                                {data.subs.map((sub, sIdx) => (
                                  <tr className="statement-glass-row" key={`sub_${nodeIdx}_${pIdx}_${sIdx}`}>
                                    <td className="statement-sticky-col" style={{ padding: '8px 24px 8px 72px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ borderLeft: '1px solid var(--border-strong)', borderBottom: '1px solid var(--border-strong)', width: 8, height: 10, display: 'inline-block', transform: 'translateY(-4px)', borderRadius: '0 0 0 4px' }}></span>
                                        {sub.label}
                                      </div>
                                    </td>
                                    {visibleYears.map(year => {
                                      const val = getInputValue(doc.key, node.key, sub.fullValue, year);
                                      return (
                                        <td key={year} style={{ padding: '8px 24px', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right', fontFamily: 'monospace', borderBottom: '1px solid var(--border-subtle)' }}>
                                          {val !== 0 ? formatValue('default', val, configSchemas) : '—'}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}

                              </React.Fragment>
                            ))}

                            {/* Compact View rendering */}
                            {viewMode === 'compact' && activeLines.map((lineItem, lIdx) => {
                              const isSubItem = lineItem.includes('||');
                              const displayLabel = isSubItem ? lineItem.split('||')[1] : lineItem;
                              const lookupKey = lineItem;

                              return (
                                <tr className="statement-glass-row" key={`c_itm_${nodeIdx}_${lIdx}`}>
                                  <td className="statement-sticky-col" style={{ padding: isSubItem ? '8px 24px 8px 72px' : '10px 24px 10px 48px', fontSize: isSubItem ? 12 : 13, color: isSubItem ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      {isSubItem && (
                                        <span style={{ borderLeft: '1px dashed var(--text-muted)', borderBottom: '1px dashed var(--text-muted)', width: 8, height: 10, display: 'inline-block', transform: 'translateY(-4px)', flexShrink: 0 }} />
                                      )}
                                      {displayLabel}
                                    </div>
                                  </td>
                                  {visibleYears.map(year => {
                                    const val = getInputValue(doc.key, node.key, lookupKey, year);
                                    return (
                                      <td key={year} style={{ padding: '10px 24px', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right', fontFamily: 'monospace' }}>
                                        {val !== 0 ? formatValue('default', val, configSchemas) : '—'}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      }

                      return null;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
