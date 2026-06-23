import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Settings, Loader2, Download } from 'lucide-react';
import { db } from '../../../firebase.js';
import { doc, getDoc } from 'firebase/firestore';
import ChartBlock from './ChartBlock';
import FSAStatements from '../../fsa/components/FSAStatements.jsx';
import IMPrintSettingsModal from './IMPrintSettingsModal.jsx';

// ─── HARDCODED TYPOGRAPHY ────────────────────────────────────────────────────
const FONT_FAMILY        = "'Open Sans', Arial, sans-serif";
const FONT_SIZE_BODY     = '10pt';   // body text
const FONT_SIZE_HEADING  = '12pt';   // h2 section titles (Bold)
const FONT_SIZE_SUBHEAD  = '11pt';   // h3 subsection   (Bold)
const LINE_SPACING_BODY  = '1.5';    // body text & regular tables
const LINE_SPACING_NUM   = '1.0';    // numeric/financial tables
// ─────────────────────────────────────────────────────────────────────────────

const ensureArray = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length > 0 && keys.every(k => !isNaN(Number(k)))) return Object.values(data);
    return [data];
  }
  return [data];
};

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
  } catch {
    return '';
  }
};

const stripPrintHighlights = (html) => {
  if (!html || typeof html !== 'string') return html;
  let clean = html;
  clean = clean.replace(/class="[^"]*(im-comment-highlight|im-search-highlight-quill)[^"]*"/gi, 'class=""');
  clean = clean.replace(/data-comment-id="[^"]*"/gi, '');
  clean = clean.replace(/data-search-id="[^"]*"/gi, '');
  clean = clean.replace(/background(-color)?\s*:\s*[^;"]+;?/gi, '');
  clean = clean.replace(/text-decoration\s*:\s*underline[^;"]*/gi, 'text-decoration: none');
  clean = clean.replace(/border-bottom\s*:[^;"]*;?/gi, '');
  clean = clean.replace(/<\/?mark[^>]*>/gi, '');
  clean = clean.replace(/<p>\s*<br\s*\/?><\/p>/gi, '');
  clean = clean.replace(/<p>(?:\s|&nbsp;)*<\/p>/gi, '');
  clean = clean.replace(/(<br\s*\/?>\s*){2,}/gi, '<br/>');
  return clean.trim();
};

const formatGlobalDate = (val) => {
  if (!val || typeof val !== 'string') return val;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-');
    return `${d}/${m}/${y}`;
  }
  return val;
};

// Detect if a table block is numeric/financial (pricing, balance sheet, P&L, etc.)
const isNumericTable = (block) => {
  if (!block) return false;
  const label = (block.label || block.heading || '').toLowerCase();
  const numericKeywords = [
    'price','pricing','balance','sheet','profit','loss','p&l','income',
    'revenue','cost','expense','financial','cash','flow','budget','forecast',
    'projection','capex','opex','ebitda','margin','fund','quantum',
    'investment','valuation','equity','debt',
  ];
  if (numericKeywords.some(k => label.includes(k))) return true;
  const headers = ensureArray(block.colHeaders || []);
  const numericHeaderCount = headers.filter(h =>
    /amount|value|cost|price|total|₹|rs\.|inr|lakh|crore|%|ratio|qty|quantity|number|count/i.test(String(h))
  ).length;
  return headers.length > 0 && numericHeaderCount / headers.length >= 0.4;
};

const PrintFSALinkWrapper = ({ fsaId, projectId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fsaId) return;
    const fetchFSA = async () => {
      let docSnap = null;
      if (projectId) docSnap = await getDoc(doc(db, 'projects', projectId, 'fsa', fsaId));
      if (!docSnap || !docSnap.exists()) docSnap = await getDoc(doc(db, 'fsas', fsaId));
      if (docSnap && docSnap.exists()) {
        const fetchedData = docSnap.data();
        if (fetchedData.configSchemas && fetchedData.configSchemas.documents) {
          fetchedData.configSchemas.documents = fetchedData.configSchemas.documents.filter(d => d.key !== 'cashflow');
        }
        setData(fetchedData);
      }
      setLoading(false);
    };
    fetchFSA();
  }, [fsaId, projectId]);

  if (loading) return <div style={{ padding: '10px', color: '#64748b' }}>Loading Financial Data...</div>;
  if (!data) return <div style={{ padding: '10px', color: '#ef4444' }}>Financial Document Not Found.</div>;

  return (
    <div className="fsa-print-container">
      <FSAStatements
        projectData={data.financialData || data.data || {}}
        configSchemas={data.configSchemas || {}}
        reclassMap={data.reclassMap || {}}
        activeEntityType={data.activeEntityType || data.entityType || 'pvtLtd'}
        activeYearsList={data.activeYearsList || data.years || []}
        activeItemsMap={data.activeItemsMap || {}}
        isPrintMode={true}
      />
    </div>
  );
};

export default function IMPrintPreview({
  schema,
  imData,
  excludedSections,
  customNames = {},
  projectName,
  onClose,
  projectId,
  logoUrl: passedLogoUrl
}) {
  const [mounted, setMounted]       = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);


  const [printConfig, setPrintConfig] = useState({
    brandName: 'Redwood Partners',
    brandColor: '#8A1538',
    brandNameColor: '#8A1538',
    logoUrl: passedLogoUrl || '',
    coverAlignment: 'center',
    sectionTitleColor: '#2563eb',
    headerLeft: 'INVESTMENT MEMORANDUM',
    headerLeftColor: '#000000',
    headerCenter: '',
    headerCenterColor: '#000000',
    headerRight: 'REDWOOD PARTNERS',
    headerRightColor: '#8A1538',
    footerLeft: '',
    footerLeftColor: '#000000',
    footerCenter: 'Confidential',
    footerCenterColor: '#000000',
    footerRight: '',
    footerRightColor: '#000000',
    evalParametersText: 'This Investment Memorandum ("IM") has been commissioned and prepared by Redwood Partners based on information, documents and management discussions available as of the date of this report.',
  });

  const visibleSchema = useMemo(
    () => ensureArray(schema).filter(s => !ensureArray(excludedSections).includes(s.id)),
    [schema, excludedSections]
  );

  const parentSections = useMemo(
    () => visibleSchema.filter(s => !s.parentId).sort((a, b) => (a.order || 0) - (b.order || 0)),
    [visibleSchema]
  );

  useEffect(() => {
    setMounted(true);
    const loadSettings = async () => {
      if (!projectId) return;
      const d = await getDoc(doc(db, 'projects', projectId, 'settings', 'print'));
      if (d.exists()) setPrintConfig(prev => ({ ...prev, ...d.data() }));
    };
    loadSettings();
  }, [projectId]);

  const sectionNumberMap = useMemo(() => {
    const map = {};
    let parentCounter = 1;
    parentSections.forEach(p => {
      map[p.id] = `${parentCounter}`;
      let childCounter = 1;
      visibleSchema
        .filter(s => s.parentId === p.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .forEach(c => {
          map[c.id] = `${parentCounter}.${childCounter}`;
          childCounter++;
        });
      parentCounter++;
    });
    return map;
  }, [visibleSchema, parentSections]);

  const cleanTitle = (text) => (text ? text.replace(/^([0-9]+\.)+\s*/, '') : '');

  const getValue = (path, contextData = null, parentDataPath = null) => {
    if (contextData !== null) {
      let relativePath = path;
      if (parentDataPath && path.startsWith(`${parentDataPath}.`)) {
        relativePath = path.replace(new RegExp(`^${parentDataPath}\\.`), '');
      }
      return relativePath.split('.').reduce((obj, key) => obj?.[key], contextData);
    }
    if (!path) return undefined;
    return path.split('.').reduce((obj, key) => obj?.[key], imData);
  };

  const flatItems = useMemo(() => {
    const items = [];
    items.push({ id: 'cover', type: 'cover' });
    items.push({ id: 'eval',  type: 'eval'  });
    items.push({ id: 'toc',   type: 'toc'   });

    parentSections.forEach(pSec => {
      items.push({ id: `header-${pSec.id}`, type: 'section-header', section: pSec });

      const blocks = ensureArray(pSec.blocks)
        .filter(b => !ensureArray(excludedSections).includes(b.id))
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      blocks.forEach(b => items.push({ id: `block-${b.id}`, type: 'block', block: b }));

      const children = visibleSchema
        .filter(s => s.parentId === pSec.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      children.forEach(cSec => {
        items.push({ id: `header-${cSec.id}`, type: 'subsection-header', section: cSec });
        const cBlocks = ensureArray(cSec.blocks)
          .filter(b => !ensureArray(excludedSections).includes(b.id))
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        cBlocks.forEach(b => items.push({ id: `block-${b.id}`, type: 'block', block: b }));
      });
    });

    return items;
  }, [parentSections, visibleSchema, excludedSections]);

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

    const hasSchema  = runtimeSchemaRows.length > 0;
    const numCols    = headers.length || block.cols || 2;
    const numRows    = Math.max(dbRows.length, runtimeSchemaRows.length, block.baseRowCount || 1);
    const occupied   = Array.from({ length: numRows }, () => new Array(numCols).fill(false));
    const numeric    = isNumericTable(block);

    return (
      <div
        key={`table_${isRepeated ? 'rep' : 'main'}_${instanceIdx}`}
        className={`table-wrapper-block${numeric ? ' numeric-table' : ''}`}
      >
        {isRepeated && (
          <div className="table-repeat-header">
            Copy {instanceIdx}{instanceData?.instanceName ? ` - ${instanceData.instanceName}` : ''}
          </div>
        )}
        <table className="im-print-table">
          <thead>
            <tr>
              {block.showSno && <th style={{ width: '40px', textAlign: 'center' }}>#</th>}
              {headers.map((h, i) => <th key={i}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: numRows }).map((_, rIdx) => {
              const rec       = dbRows[rIdx] || {};
              const schemaRow = hasSchema ? (runtimeSchemaRows[rIdx] || runtimeSchemaRows[runtimeSchemaRows.length - 1]) : null;
              return (
                <tr key={rIdx}>
                  {block.showSno && <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{rIdx + 1}</td>}
                  {hasSchema ? (
                    schemaRow?.cells?.map((cell, cIdx) => {
                      if (occupied[rIdx]?.[cIdx]) return null;
                      const cs = Math.min(Math.max(1, cell.colspan || 1), numCols - cIdx);
                      const rs = Math.min(Math.max(1, cell.rowspan || 1), numRows - rIdx);
                      for (let r = rIdx; r < rIdx + rs; r++)
                        for (let c = cIdx; c < cIdx + cs; c++)
                          if (r < numRows && c < numCols) occupied[r][c] = true;

                      const rawVal = rec?.[cell.id];
                      let displayValue = rawVal ?? '-';

                      if (cell.cellType === 'fixed') displayValue = formatGlobalDate(cell.text) || '';
                      else if (cell.cellType === 'computed') displayValue = evaluateFormula(cell.formula, rIdx, dbRows, runtimeSchemaRows);
                      else if (cell.cellType === 'smart-select') {
                        if (rawVal && typeof rawVal === 'object') {
                          const activeCondition = (cell.conditions || []).find(c => c.label === rawVal.selected);
                          if (activeCondition?.template && activeCondition.thenMode === 'template') {
                            const parts = activeCondition.template.split(/(\[[^\]]+\])/g);
                            const inputs = Array.isArray(rawVal.inputs) ? rawVal.inputs : [];
                            let ii = 0;
                            const rendered = parts.map((p, pi) => (
                              <span key={pi}>{/^\[.+\]$/.test(p) ? <strong>{formatGlobalDate(inputs[ii++]) || '____'}</strong> : p}</span>
                            ));
                            displayValue = <div><strong>{rawVal.selected}</strong> - {rendered}</div>;
                          } else if (rawVal.richtext) {
                            displayValue = <div className="ql-editor" dangerouslySetInnerHTML={{ __html: stripPrintHighlights(rawVal.richtext) }} />;
                          } else {
                            displayValue = rawVal.selected
                              ? `${rawVal.selected}${rawVal.inputs?.length ? ` - ${rawVal.inputs.map(formatGlobalDate).join(' ')}` : ''}`
                              : '-';
                          }
                        } else { displayValue = rawVal || '-'; }
                      } else if (cell.cellType === 'mixed') {
                        const parts = (cell.template || '').split(/(\[[^\]]+\])/g);
                        const inputs = Array.isArray(rawVal) ? rawVal : [];
                        let ii = 0;
                        displayValue = parts.map((p, pi) => (
                          <span key={pi}>{/^\[.+\]$/.test(p) ? <strong>{formatGlobalDate(inputs[ii++]) || '____'}</strong> : p}</span>
                        ));
                      } else if (cell.inputType === 'quill') {
                        displayValue = <div className="ql-editor" dangerouslySetInnerHTML={{ __html: stripPrintHighlights(rawVal || '-') }} />;
                      } else if (typeof rawVal === 'string' && rawVal.startsWith('__custom__:')) {
                        displayValue = rawVal.replace('__custom__:', '');
                      } else if (cell.inputType === 'date') {
                        displayValue = formatGlobalDate(rawVal);
                      }

                      return (
                        <td key={cIdx} colSpan={cs} rowSpan={rs}
                          style={{ background: cell.cellType === 'fixed' ? '#f8fafc' : 'transparent' }}>
                          {displayValue || '-'}
                        </td>
                      );
                    })
                  ) : (
                    Array.from({ length: numCols }).map((_, cIdx) => <td key={cIdx}>{rec[`col_${cIdx}`] || '-'}</td>)
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
    if (!block || ensureArray(excludedSections).includes(block.id) || block.type === 'instruction') return null;
    const dataKey    = block.dataPath || block.id;
    const val        = getValue(dataKey, contextData, parentDataPath);
    const blockLabel = customNames[block.id] || block.label;

    return (
      <div key={block.id} className="im-print-block">
        {blockLabel && !['fixed-text'].includes(block.type) && <h4 className="block-title">{blockLabel}</h4>}
        {block.type === 'fixed-text' && <div className="content-text">{block.content}</div>}
        {['text','textarea','number','currency','percentage','email','date'].includes(block.type) && (
          <div className="content-text">{block.type === 'date' ? formatGlobalDate(val) : (val || '-')}</div>
        )}
        {block.type === 'quill' && (
          <div className="ql-editor" dangerouslySetInnerHTML={{ __html: stripPrintHighlights(val || '<span style="color:#94a3b8">-</span>') }} />
        )}
        {block.type === 'table' && (
          <>
            {renderTableInstance(block, val, false, 0)}
            {val?.repeatedTables && ensureArray(val.repeatedTables).map((rt, i) => renderTableInstance(block, rt, true, i + 1))}
          </>
        )}
        {block.type === 'fsa-link' && val && (
          <div className="fsa-block-wrapper">
            {typeof val === 'object' && val.financialData ? (
              <FSAStatements
                projectData={val.financialData || {}}
                configSchemas={{ ...val.configSchemas, documents: (val.configSchemas?.documents || []).filter(d => d.key !== 'cashflow') }}
                reclassMap={val.reclassMap || {}}
                activeEntityType={val.activeEntityType || 'pvtLtd'}
                activeYearsList={val.activeYearsList || []}
                activeItemsMap={val.activeItemsMap || {}}
                isPrintMode={true}
              />
            ) : (
              <PrintFSALinkWrapper fsaId={val} projectId={projectId} />
            )}
          </div>
        )}
        {block.type === 'conditional-switch' && (() => {
          const selectedBranchId = val?.activeBranch;
          if (!selectedBranchId) return null;
          const branch = ensureArray(block.branches).find(b => b.id === selectedBranchId);
          if (!branch?.blocks) return null;
          const visibleBranchBlocks = ensureArray(branch.blocks).filter(b => !ensureArray(excludedSections).includes(b.id));
          return (
            <div style={{ marginTop: '8px' }}>
              {visibleBranchBlocks.map(b =>
                compileBlock(b, val[selectedBranchId] || {},
                  parentDataPath ? `${parentDataPath}.${dataKey}.${selectedBranchId}` : `${dataKey}.${selectedBranchId}`)
              )}
            </div>
          );
        })()}
        {block.type === 'repeating-block-set' && (() => {
          const instances = val?.instances ? ensureArray(val.instances) : (Array.isArray(val) ? val : []);
          return (
            <div className="repeating-set-wrapper">
              {instances.map((inst, i) => (
                <div key={inst._setId || i} className="repeating-set-instance"
                  style={{ borderLeft: `3px solid ${printConfig.brandColor}` }}>
                  
                  {(inst.name || inst._setLabel) && (
                     <div className="repeating-set-title">{inst.name || inst._setLabel}</div>
                  )}
                  
                  {ensureArray(block.blocks || block.templateBlocks)
                    .filter(b => !ensureArray(excludedSections).includes(b.id))
                    .map(b => compileBlock(b, inst,
                      parentDataPath ? `${parentDataPath}.${dataKey}.instances.${i}` : `${dataKey}.instances.${i}`))}
                </div>
              ))}
            </div>
          );
        })()}

        {block.type === 'repeating-group' && (() => {
          const items = Array.isArray(val) ? val : [];
          if (items.length === 0) return null;
          
          const template = block.template || [
            { id: 'title', label: 'Title / Name', type: 'text' },
            { id: 'desc',  label: 'Description', type: 'textarea' },
          ];

          return (
            <div className="repeating-group-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
              {items.map((item, idx) => (
                <div key={item._id || idx} className="repeating-group-item" style={{ borderLeft: `3px solid ${printConfig.brandColor}`, paddingLeft: '12px' }}>
                  {template.map(field => {
                    const fieldVal = item[field.id];
                    if (!fieldVal || (Array.isArray(fieldVal) && fieldVal.length === 0)) return null;

                    return (
                      <div key={field.id} style={{ marginBottom: '6px' }}>
                        <span style={{ fontWeight: 700, fontSize: '9pt', color: '#64748b', textTransform: 'uppercase', marginRight: '6px' }}>
                          {field.label}:
                        </span>
                        
                        {field.type === 'image' ? (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                            {Array.isArray(fieldVal) && fieldVal.map((img, i) => (
                              <div key={i} style={{ width: '150px' }}>
                                <img src={img.url} alt={img.caption || ''} style={{ width: '100%', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                                {img.caption && <div style={{ fontSize: '8pt', color: '#64748b', marginTop: '4px' }}>{img.caption}</div>}
                              </div>
                            ))}
                          </div>
                        ) : field.type === 'file' ? (
                          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px', verticalAlign: 'top' }}>
                            {Array.isArray(fieldVal) && fieldVal.map((f, i) => (
                              <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '9pt', color: '#3b82f6', textDecoration: 'none' }}>
                                {f.name}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: '10pt', whiteSpace: 'pre-wrap', color: '#0f172a' }}>
                            {fieldVal}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })()}
        {block.type === 'image' && (
          <div className="image-block-wrapper">
            {ensureArray(val).map((img, i) => (
              <div key={i} className="image-instance">
                <img src={img.url || img} alt="" className="constrained-print-image" />
                {img.caption && <span className="image-caption">{img.caption}</span>}
              </div>
            ))}
          </div>
        )}
        {block.type === 'chart' && (
          <div className="print-chart-container">
            <ChartBlock block={{ ...block, label: blockLabel }} value={val} isPrintMode={true} />
          </div>
        )}
      </div>
    );
  };

  const renderItem = (item) => {
    if (item.type === 'cover') return (
      <div className="special-page cover-page cover-container">
        <div className="cover-logo-area">
          {printConfig.logoUrl && <img src={printConfig.logoUrl} alt="logo" />}
        </div>
        <div
          className="cover-text-area"
          style={{
            justifyContent: printConfig.coverAlignment === 'left' ? 'flex-start' : printConfig.coverAlignment === 'right' ? 'flex-end' : 'center',
            textAlign: printConfig.coverAlignment,
          }}
        >
          <h2 className="cover-title">INVESTMENT MEMORANDUM</h2>
          {printConfig.brandName && (
            <h3 className="cover-brand" style={{ color: printConfig.brandNameColor || printConfig.brandColor }}>
              {printConfig.brandName}
            </h3>
          )}
          <p className="cover-date">Date: {formatGlobalDate(new Date().toISOString().split('T')[0])}</p>
        </div>
      </div>
    );

    if (item.type === 'eval') return (
      <div className="special-page eval-page">
        <h2 className="section-main-title" style={{ color: printConfig.sectionTitleColor, borderBottomColor: printConfig.brandColor }}>
          EVALUATION PARAMETERS
        </h2>
        <div className="eval-text-content">{printConfig.evalParametersText}</div>
      </div>
    );

    if (item.type === 'toc') return (
      <div className="special-page toc-page">
        <h2 className="section-main-title" style={{ color: printConfig.sectionTitleColor, borderBottomColor: printConfig.brandColor }}>
          Table of Contents
        </h2>
        <div className="toc-list">
          {parentSections.map(pSec => {
            const children = visibleSchema
              .filter(s => s.parentId === pSec.id)
              .sort((a, b) => (a.order || 0) - (b.order || 0));
            return (
              <div key={pSec.id} style={{ marginBottom: '8px' }}>
                <div className="toc-row">
                  <strong className="toc-title">
                    {sectionNumberMap[pSec.id]}. {cleanTitle(customNames[pSec.id] || pSec.heading)}
                  </strong>
                  <div className="toc-dots" />
                      <span className="toc-page-num" id={`toc-pg-${pSec.id}`}>-</span>
                </div>
                <div className="toc-sub-list">
                  {children.map(cSec => (
                    <div key={cSec.id} className="toc-row toc-sub-row">
                      <span className="toc-title">
                        {sectionNumberMap[cSec.id]}. {cleanTitle(customNames[cSec.id] || cSec.heading)}
                      </span>
                      <div className="toc-dots" />
                      <span className="toc-page-num" id={`toc-pg-${cSec.id}`}>-</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );

    if (item.type === 'section-header') {
      return (
        <h2 id={`section-header-${item.section.id}`} data-toc-id={item.section.id} className="section-main-title"
          style={{ color: printConfig.sectionTitleColor, borderBottomColor: `${printConfig.sectionTitleColor}40` }}>
          {sectionNumberMap[item.section.id]}. {cleanTitle(customNames[item.section.id] || item.section.heading || item.section.navLabel)}
        </h2>
      );
    }

    if (item.type === 'subsection-header') {
      return (
        <h3 id={`subsection-header-${item.section.id}`} data-toc-id={item.section.id} className="section-sub-title">
          {sectionNumberMap[item.section.id]}. {cleanTitle(customNames[item.section.id] || item.section.heading || item.section.navLabel)}
        </h3>
      );
    }

    if (item.type === 'block') return compileBlock(item.block);
    return null;
  };

  const Header = () => (
    <div className="sheet-header" style={{ borderBottomColor: printConfig.brandColor }}>
      <div className="hf-zone" style={{ textAlign: 'left',   color: printConfig.headerLeftColor   }}>{printConfig.headerLeft}</div>
      <div className="hf-zone" style={{ textAlign: 'center', color: printConfig.headerCenterColor }}>{printConfig.headerCenter}</div>
      <div className="hf-zone" style={{ textAlign: 'right',  color: printConfig.headerRightColor  }}>{printConfig.headerRight}</div>
    </div>
  );

  const Footer = () => (
    <div className="sheet-footer">
      <div className="hf-zone" style={{ textAlign: 'left',   color: printConfig.footerLeftColor   }}>{printConfig.footerLeft}</div>
      <div className="hf-zone" style={{ textAlign: 'center', color: printConfig.footerCenterColor }}>{printConfig.footerCenter}</div>
      <div className="hf-zone" style={{ textAlign: 'right' }}></div>
    </div>
  );

  const handleGeneratePDF = async () => {
    setPdfLoading(true);
    try {
      const contentElement = document.getElementById('pdf-source-content');
      if (!contentElement) throw new Error('Could not find the document content on the screen.');
      const contentHtml = contentElement.innerHTML;

      const styleElement = document.getElementById('im-print-styles');
      const cssString    = styleElement ? styleElement.innerHTML : '';

      const fullHtml = `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: ${FONT_FAMILY};
              color: #000;
              font-size: ${FONT_SIZE_BODY};
              line-height: ${LINE_SPACING_BODY};
              text-align: left;
              background: #fff;
              margin: 0; padding: 0;
            }
            ${cssString}
            .sheet-footer { display: none !important; }
          </style>
        </head>
        <body>
          <div class="im-print-wrapper">
            ${contentHtml}
          </div>
        </body>
        </html>`;

const response = await fetch('https://pdf-engine-1088344936506.us-central1.run.app/generate-pdf', {
  method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/pdf' },
        body: JSON.stringify({ html: fullHtml, brandColor: printConfig.brandColor }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Backend PDF generation failed');
      }

      const blob = await response.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${projectName ? projectName.replace(/\s+/g, '_') : 'Document'}_Memo.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      alert(`Failed to generate PDF: ${err.message}`);
    } finally {
      setPdfLoading(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="im-print-wrapper">
      <div className="no-print control-bar">
        <button onClick={onClose} className="btn-icon"><X size={20} /></button>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={() => setShowSettings(true)} className="btn-secondary">
            <Settings size={16} /> Print Settings
          </button>
          <button onClick={() => window.print()} className="btn-secondary">
            <Printer size={16} /> Quick Print
          </button>
          <button
            onClick={handleGeneratePDF}
            disabled={pdfLoading}
            className="btn-primary"
            style={{ backgroundColor: printConfig.brandColor, opacity: pdfLoading ? 0.6 : 1 }}
          >
            {pdfLoading ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
            {pdfLoading ? 'Building PDF...' : 'Download HD PDF'}
          </button>
        </div>
      </div>

      <div id="pdf-source-content" className="print-canvas-container">
        <div className="a4-sheet-container">

          {/* ── Page 1: Cover (standalone, outside the header/footer table) ── */}
          <div className="standalone-page cover-container">
            {renderItem(flatItems.find(i => i.type === 'cover'))}
          </div>

          {/* ── Pages 2+: repeating header/footer via CSS table trick ── */}
          <table className="master-print-table" style={{ pageBreakBefore: 'always' }}>
            <thead><tr><td><div className="page-header-space"><Header /></div></td></tr></thead>
            <tbody>
              <tr><td>
                <div className="page-content">

                  {/* ── Page 2: Evaluation Parameters ──
                      forced-page adds page-break-after:always so TOC starts fresh on page 3.
                      No min-height here — the content itself fills the page naturally. ── */}
                  <div className="forced-page">
                    {renderItem(flatItems.find(i => i.type === 'eval'))}
                  </div>

                  {/* ── Page 3: Table of Contents ──
                      forced-page pushes first real section to page 4. ── */}
                  <div className="forced-page">
                    {renderItem(flatItems.find(i => i.type === 'toc'))}
                  </div>

                  {/* ── Page 4+: Document body ── */}
                  {flatItems
                    .filter(item => !['cover', 'eval', 'toc'].includes(item.type))
                    .map((item, idx) => (
                      <div key={idx} className="item-renderer">
                        {renderItem(item)}
                      </div>
                    ))}

                </div>
              </td></tr>
            </tbody>
            <tfoot><tr><td><div className="page-footer-space"><Footer /></div></td></tr></tfoot>
          </table>

        </div>
      </div>

      <style id="im-print-styles">{`
        @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');

        * { box-sizing: border-box; }

        .im-print-wrapper {
          font-family: ${FONT_FAMILY};
          color: #000;
          font-size: ${FONT_SIZE_BODY};
          line-height: ${LINE_SPACING_BODY};
          text-align: left;
          background: #e2e8f0;
          position: fixed;
          inset: 0;
          z-index: 9999;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .control-bar {
          height: 60px; background: #ffffff; display: flex; align-items: center;
          justify-content: space-between; padding: 0 32px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1); position: sticky; top: 0; z-index: 100; flex-shrink: 0;
        }
        .btn-icon { background: #f1f5f9; border: none; padding: 8px; border-radius: 8px; cursor: pointer; color: #475569; }
        .btn-secondary { padding: 10px 16px; background: #f8fafc; color: #475569; border: 1px solid #cbd5e1; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .btn-primary { padding: 10px 20px; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: opacity 0.3s; }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }

        .print-canvas-container { padding: 40px 0; display: flex; flex-direction: column; align-items: center; width: 100%; }
        .a4-sheet-container { width: 210mm; background: white; box-shadow: 0 10px 30px rgba(0,0,0,0.3); padding: 15mm; min-height: 297mm; }

        /* Header / Footer */
        .sheet-header { display: flex; width: 100%; border-bottom: 2px solid; padding-bottom: 10px; margin-bottom: 20px; }
        .sheet-footer { display: flex; width: 100%; border-top: 1px solid #cbd5e1; padding-top: 10px; margin-top: 20px; }
        .hf-zone { flex: 1; font-size: 9pt; font-weight: bold; line-height: 1.2; word-wrap: break-word; }
        .page-header-space { padding-bottom: 5px; }
        .page-footer-space { padding-top: 5px; }

        /* Master table */
        .master-print-table { width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }
        .page-content, .im-print-block, .table-wrapper-block { max-width: 100%; overflow: hidden; }

        /* Data tables — default body line-height */
        .im-print-table, .fsa-print-container table, .fsa-block-wrapper table {
          width: 100% !important; max-width: 100% !important; table-layout: fixed !important;
          border-collapse: collapse !important; margin: 10px 0 !important;
          font-size: 9pt !important;
          line-height: ${LINE_SPACING_BODY} !important;
        }
        /* Numeric / financial tables → tight line spacing */
        .numeric-table .im-print-table,
        .numeric-table.im-print-table,
        .fsa-print-container table, .fsa-block-wrapper table {
          line-height: ${LINE_SPACING_NUM} !important;
        }
        .im-print-table th, .im-print-table td,
        .fsa-print-container table th, .fsa-print-container table td,
        .fsa-block-wrapper table th, .fsa-block-wrapper table td {
          border: 1px solid #94a3b8 !important; padding: 6px 8px !important;
          white-space: normal !important; overflow-wrap: break-word !important;
          word-break: break-word !important; line-height: inherit !important;
        }
        .im-print-table th { background-color: #f1f5f9; font-weight: 700; text-align: left; }
        .fsa-print-container table th, .fsa-block-wrapper table th { background-color: #f1f5f9; font-weight: 700; line-height: ${LINE_SPACING_NUM} !important; }
        .fsa-print-container table td, .fsa-block-wrapper table td { line-height: ${LINE_SPACING_NUM} !important; }

        /* FINAL FIX: ONLY lock the THEAD column, let standard table-layout: fixed size the rest! */
        .fsa-print-container table thead th:first-child,
        .fsa-block-wrapper table thead th:first-child {
          width: 38% !important;
          min-width: 38% !important;
          max-width: 38% !important;
        }

        /* Quill */
        .ql-editor { padding: 0 !important; max-width: 100%; overflow-wrap: break-word; line-height: ${LINE_SPACING_BODY}; }
        .ql-editor, .ql-editor * { white-space: normal !important; word-break: break-word !important; }
        .ql-editor p { margin: 0 0 8px 0; text-align: left; }
        .ql-editor ul, .ql-editor ol { padding-left: 24px; margin: 8px 0; }
        .ql-editor table { width: 100% !important; border-collapse: collapse !important; margin: 10px 0 !important; line-height: ${LINE_SPACING_NUM} !important; }
        .ql-editor th, .ql-editor td { border: 1px solid #cbd5e1 !important; padding: 6px 8px !important; line-height: ${LINE_SPACING_NUM} !important; }

        /* Cover */
        .cover-container { display: flex; flex-direction: column; justify-content: center; min-height: 250mm; }
        .cover-logo-area { display: flex; justify-content: flex-end; height: 80px; margin-bottom: 40px; }
        .cover-logo-area img { max-width: 200px; max-height: 80px; object-fit: contain; }
        .cover-text-area { flex: 1; display: flex; flex-direction: column; }
        .cover-title { font-size: 26pt; font-weight: 700; letter-spacing: 2px; margin: 0 0 16px 0; }
        .cover-brand { font-size: 18pt; margin: 0 0 24px 0; }
        .cover-date { color: #64748b; font-size: 12pt; margin: 0; }

        /* Section titles */
        .section-main-title {
          font-size: ${FONT_SIZE_HEADING};
          font-weight: 700;
          margin-bottom: 16px;
          border-bottom: 2px solid;
          padding-bottom: 8px;
          text-align: left;
          line-height: 1.3;
        }
        .section-sub-title {
          font-size: ${FONT_SIZE_SUBHEAD};
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 12px;
          margin-top: 10px;
          text-align: left;
          line-height: 1.3;
        }

        /* Eval page */
        .eval-text-content { white-space: pre-wrap; font-size: ${FONT_SIZE_BODY}; line-height: ${LINE_SPACING_BODY}; text-align: left; }

        /* TOC */
        .toc-list { margin-top: 20px; }
        .toc-row { display: flex; align-items: baseline; margin-bottom: 8px; }
        .toc-title { font-size: 11pt; padding-right: 8px; max-width: 85%; text-align: left; }
        .toc-dots { flex: 1; border-bottom: 2px dotted #cbd5e1; margin: 0 12px; position: relative; top: -4px; min-width: 20px; }
        .toc-page-num { font-size: 11pt; font-weight: 700; color: #475569; }
        .toc-sub-list { padding-left: 24px; display: flex; flex-direction: column; margin-top: 6px; }
        .toc-sub-row .toc-title { font-size: 10pt; color: #334155; }

        /* Body blocks */
        .im-print-block { margin-bottom: 16px; width: 100%; text-align: left; }
        .block-title { margin: 0 0 6px 0; font-size: ${FONT_SIZE_SUBHEAD}; font-weight: 700; text-align: left; }
        .content-text { white-space: pre-wrap; overflow-wrap: break-word; line-height: ${LINE_SPACING_BODY}; text-align: left; }
        .content-list { margin: 4px 0; padding-left: 24px; }
        .repeating-set-wrapper { display: flex; flex-direction: column; gap: 16px; margin-top: 8px; }
        .repeating-set-instance { padding: 12px; border: 1px solid #e2e8f0; }
        .repeating-set-title { font-size: 10pt; text-transform: uppercase; margin-bottom: 8px; font-weight: 700; }
        .table-repeat-header { font-size: 10pt; font-weight: 700; margin-bottom: 8px; text-transform: uppercase; }

        /* Images / Charts */
        .image-block-wrapper { text-align: center; width: 100%; }
        .image-instance { margin: 15px 0; }
        .constrained-print-image { max-height: 650px !important; width: auto !important; max-width: 100% !important; object-fit: contain !important; display: block; margin: 0 auto; }
        .image-caption { display: block; font-size: 9pt; color: #64748b; margin-top: 5px; }

        /*
         * standalone-page — ONLY used for the Cover (sits OUTSIDE master-print-table).
         * Sets min-height so it fills a full A4 sheet in the screen preview.
         * page-break-after is added in @media print below.
         */
        .standalone-page { min-height: 250mm; }

        /*
         * forced-page — used for Eval and TOC inside the master-print-table.
         * NO min-height. Just forces next sibling to start on a new page.
         * This is what fixes the ghost blank page 3:
         *   Before: standalone-page had min-height:250mm + page-break-after:always,
         *           combined with the master-table's own pageBreakBefore:always it
         *           produced an extra blank page between TOC and content.
         *   After:  forced-page only carries the break directive, no min-height.
         */
        .forced-page { page-break-after: always; break-after: page; }

        @media print {
          @page { size: A4 portrait; margin: 15mm 15mm 25mm 15mm !important; }

          html, body {
            margin: 0 !important; padding: 0 !important; background: white !important;
            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          }

          body > *:not(.im-print-wrapper) { display: none !important; }
          .no-print { display: none !important; }

          .im-print-wrapper { position: static !important; display: block !important; overflow: visible !important; background: transparent !important; }
          .print-canvas-container { padding: 0 !important; }
          .a4-sheet-container { width: 100% !important; box-shadow: none !important; padding: 0 !important; }

          thead { display: table-header-group !important; }
          tfoot { display: table-footer-group !important; }

          .im-print-block, .table-wrapper-block, .ql-editor { page-break-inside: auto !important; break-inside: auto !important; }

          .section-main-title, .section-sub-title, .block-title, .repeating-set-title, .table-repeat-header {
            break-after: avoid !important; page-break-after: avoid !important;
            break-inside: avoid !important; page-break-inside: avoid !important;
          }

          .fsa-block-wrapper, .image-instance, .print-chart-container, .repeating-set-instance {
            break-inside: avoid !important; page-break-inside: avoid !important;
          }

          .standalone-page { page-break-after: always !important; break-after: page !important; }
          .forced-page { page-break-after: always !important; break-after: page !important; }
        }
      `}</style>

      {showSettings && (
        <IMPrintSettingsModal
          projectId={projectId || (imData && imData.projectId)}
          currentConfig={printConfig}
          onSave={(newCfg) => setPrintConfig(newCfg)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>,
    document.body
  );
}
