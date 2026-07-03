/**
 * src/pages/fsa/components/FSAAnalysis.jsx
 * INTELLIGENT ANALYSIS WORKBENCH
 * Full React port of the vanilla analysis.js with all 5 modes:
 * Raw | Year-on-Year | Raw+YoY | Ratio Analysis | Statement Review (Reclass)
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  ResponsiveContainer, ComposedChart, LineChart, Bar, Line,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine
} from 'recharts';
import {
  BarChart2, Play, RotateCcw, Save, Search, Plus, Trash2,
  ChevronDown, ChevronRight, X, CheckSquare, Square,
  TrendingUp, TrendingDown, Minus, BookOpen, Divide,
  RefreshCw, ArrowRightLeft, Target, AlertCircle, Copy, Check
} from 'lucide-react';
import { formatValue } from '../utils/fsaFormatters';
import { buildFinancialModel } from '../core/fsaEngine';

// ─── Constants ────────────────────────────────────────────────────────────────
const PALETTE = [
  '#6366F1','#10B981','#F59E0B','#EF4444','#06B6D4',
  '#8B5CF6','#EC4899','#84CC16','#F97316','#14B8A6'
];

const MODES = [
  { key: 'raw',     label: 'Raw Values',        icon: BarChart2,       desc: 'Absolute figures across years' },
  { key: 'yoy',     label: 'Year-on-Year',       icon: TrendingUp,      desc: 'Period-over-period % change' },
  { key: 'both',    label: 'Raw + YoY',          icon: Target,          desc: 'Combined bars and trend line' },
  { key: 'ratios',  label: 'Ratio Analysis',     icon: Divide,          desc: 'Custom numerator ÷ denominator pairs' },
  { key: 'reclass', label: 'Statement Review',   icon: ArrowRightLeft,  desc: 'Post-reclassification view' },
];

const STEPS = [
  { key: 'mode',    label: 'Mode',    num: 1 },
  { key: 'metrics', label: 'Metrics', num: 2 },
  { key: 'years',   label: 'Years',   num: 3 },
  { key: 'ratios',  label: 'Ratios',  num: 4, onlyFor: ['ratios'] },
  { key: 'reclass', label: 'Reclass', num: 5, onlyFor: ['reclass'] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatIN(val) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 10000000) return sign + '₹' + (abs / 10000000).toFixed(2) + ' Cr';
  if (abs >= 100000)   return sign + '₹' + (abs / 100000).toFixed(2) + ' L';
  if (abs >= 1000)     return sign + '₹' + (abs / 1000).toFixed(1) + ' K';
  return sign + '₹' + abs.toFixed(0);
}

function calcYoY(val, prev) {
  return prev !== 0 ? ((val - prev) / Math.abs(prev)) * 100 : null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function YoYBadge({ value }) {
  if (value === null) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>;
  const pos = value >= 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
      background: pos ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
      color: pos ? '#10B981' : '#EF4444'
    }}>
      {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pos ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

function StepTab({ step, active, locked, onClick, badge }) {
  return (
    <button
      onClick={() => !locked && onClick(step.key)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', borderRadius: 8, border: 'none',
        cursor: locked ? 'not-allowed' : 'pointer',
        background: active ? 'var(--bg-hover)' : 'transparent',
        color: locked ? 'var(--border-strong)' : active ? 'var(--accent-color)' : 'var(--text-muted)',
        fontSize: 13, fontWeight: active ? 700 : 500,
        transition: 'all 0.15s', opacity: locked ? 0.45 : 1,
        position: 'relative', flexShrink: 0,
        borderBottom: active ? '2px solid var(--accent-color)' : '2px solid transparent',
      }}
    >
      <span style={{
        width: 20, height: 20, borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
        background: active ? 'var(--accent-color)' : 'var(--bg-tertiary)',
        color: active ? '#fff' : 'var(--text-muted)', flexShrink: 0
      }}>{step.num}</span>
      {step.label}
      {badge > 0 && (
        <span style={{
          background: 'var(--accent-color)', color: '#fff', borderRadius: 10,
          fontSize: 10, fontWeight: 700, padding: '1px 6px', minWidth: 18, textAlign: 'center'
        }}>{badge}</span>
      )}
    </button>
  );
}

function MetricTreeGroup({ title, items, selectedMetrics, onToggle, expandedGroups, onToggleGroup }) {
  const isExpanded = expandedGroups[title] !== false;
  return (
    <div>
      <button
        onClick={() => onToggleGroup(title)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', background: 'var(--bg-hover)',
          border: 'none', borderRadius: 6, cursor: 'pointer',
          fontSize: 11, fontWeight: 700, color: 'var(--accent-color)',
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4
        }}
      >
        {title}
        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {isExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 8 }}>
          {items.map(metric => {
            const selected = selectedMetrics.includes(metric.key);
            return (
              <button
                key={metric.key}
                onClick={() => onToggle(metric.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 6, border: 'none',
                  background: selected ? 'var(--bg-hover)' : 'transparent',
                  cursor: 'pointer', transition: 'all 0.12s', textAlign: 'left',
                  color: selected ? 'var(--accent-text)' : 'var(--text-primary)'
                }}
              >
                {selected
                  ? <CheckSquare size={14} color="var(--accent-color)" />
                  : <Square size={14} color="var(--text-muted)" />}
                <span style={{ fontSize: 13, fontWeight: selected ? 600 : 400 }}>{metric.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, mode, getMetricLabel, configSchemas }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)',
      borderRadius: 10, padding: '12px 16px', boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
      minWidth: 180
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {(/^\d{4}$/.test(label) ? 'FY ' : '') + label}
      </div>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{getMetricLabel(entry.dataKey)}</span>
          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'monospace' }}>
            {entry.dataKey?.endsWith('_yoy')
              ? (entry.value === null ? '—' : (entry.value >= 0 ? '+' : '') + entry.value?.toFixed(1) + '%')
              : formatIN(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function FSAAnalysis({
  projectData,
  configSchemas,
  reclassMap,
  activeEntityType,
  activeYearsList,
  activeItemsMap,
  projectId,
  fsaId,
  forceSave
}) {
  // ── Step & Mode State ──
  const [activeStep, setActiveStep]         = useState('mode');
  const [mode, setMode]                     = useState('raw');

  // ── Metric Selection ──
  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [metricSearch, setMetricSearch]       = useState('');
  const [expandedGroups, setExpandedGroups]   = useState({});
  const [activeMetricTab, setActiveMetricTab] = useState('');

  // ── Year Selection ──
  const [selectedYears, setSelectedYears]     = useState([]);

  // ── Ratio Pairs ──
  const [ratioPairs, setRatioPairs]           = useState([{ id: 1, setA: [], setB: [] }]);
  const [sharedDenomOn, setSharedDenomOn]     = useState(false);
  const [sharedDenom, setSharedDenom]         = useState([]);

  // ── Picker Modal ──
  const [pickerOpen, setPickerOpen]           = useState(false);
  const [pickerTarget, setPickerTarget]       = useState(null); // 'setA-0' | 'setB-0' | 'shared'
  const [pickerSearch, setPickerSearch]       = useState('');
  const [pickerSelected, setPickerSelected]   = useState([]);

  // ── Output ──
  const [hasRun, setHasRun]                   = useState(false);
  const [runError, setRunError]               = useState('');

  // ── Save ──
  const [saveName, setSaveName]               = useState('');
  const [savedList, setSavedList]             = useState([]);
  const [saveStatus, setSaveStatus]           = useState('');

// ── Notes ──
  const [notes, setNotes]                     = useState('');

  // ── Clipboard Engines ──
  const [copiedChart, setCopiedChart] = useState(false);
  const [copiedTable, setCopiedTable] = useState(false);

  const copyChartToClipboard = () => {
    const svgElement = document.querySelector('.recharts-wrapper svg');
    if (!svgElement) return;
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width; canvas.height = img.height;
      ctx.fillStyle = window.getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || "#0f172a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        if(blob) {
          navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(() => {
            setCopiedChart(true); setTimeout(() => setCopiedChart(false), 2000);
          });
        }
      });
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const copyRatioTableToTSV = () => {
    let tsv = "Particulars\t" + selectedYears.map(y => (/^\d{4}$/.test(y) ? 'FY ' : '') + y).join("\t") + "\n";

    const pairsToExport = ratioPairs.filter(p => p.setA.length > 0);
    pairsToExport.forEach((pair, pi) => {
      const numVals = selectedYears.map(y => pair.setA.reduce((s,k) => s+getMetricValue(k,y), 0));
      const denomKeys = sharedDenomOn ? sharedDenom : pair.setB;
      const denVals = selectedYears.map(y => denomKeys.reduce((s,k) => s+getMetricValue(k,y), 0));
      const numLabel = pair.setA.map(k=>getMetricLabel(k)).join(' + ') || 'Numerator';
      const denLabel = denomKeys.map(k=>getMetricLabel(k)).join(' + ') || 'Denominator';
      
      tsv += `[Pair ${pi+1}] Numerator: ${numLabel}\t` + numVals.map(v => v.toFixed(2)).join("\t") + "\n";
      tsv += `[Pair ${pi+1}] Denominator: ${denLabel}\t` + denVals.map(v => v.toFixed(2)).join("\t") + "\n";
      tsv += `[Pair ${pi+1}] Ratio (%)\t` + numVals.map((n,i) => denVals[i] !== 0 ? ((n/denVals[i])*100).toFixed(2) + '%' : '—').join("\t") + "\n\n";
    });
    navigator.clipboard.writeText(tsv).then(() => {
      setCopiedTable(true); setTimeout(() => setCopiedTable(false), 2000);
    });
  };

  // ─── Derived Data ─────────────────────────────────────────────────────────
  const visibleYears = useMemo(() => {
    return [...(activeYearsList || [])].sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB) && a.length === 4 && b.length === 4) {
        return numA - numB;
      }
      return 0;
    });
  }, [activeYearsList]);

  const multiYearModel = useMemo(() => {
    const models = {};
    visibleYears.forEach(year => {
      const m = buildFinancialModel(projectData, year, reclassMap, configSchemas, activeEntityType);
      models[year] = m[year] || {};
    });
    return models;
  }, [projectData, visibleYears, reclassMap, configSchemas, activeEntityType]);

  // Build full metrics dictionary from configSchemas (Hierarchical Order)
  const availableMetrics = useMemo(() => {
    const list = [];
    const seen = new Set();
    const sharedCoA = configSchemas?.chartOfAccounts?.shared || {};

    const pushMetric = (metric) => {
      if (!metric?.key || seen.has(metric.key)) return;
      seen.add(metric.key);
      list.push(metric);
    };

    // 1. Unified Document Structures (Sections -> Line Items -> Totals)
    (configSchemas?.documents || []).forEach(doc => {
      const docKey = doc.key;
      const tabCategory = doc.name || docKey.toUpperCase();
      const nodes = sharedCoA[docKey] || [];

      nodes.forEach(node => {
        // Handle Sections & Inject Line Items underneath
        if (node.type === 'section') {
          pushMetric({
            key: node.key,
            label: node.title,
            category: tabCategory,
            isSectionHeader: true
          });

          // Inject active line items directly under their parent section
          const activeLines = activeItemsMap?.[docKey]?.[node.key] || [];
          activeLines.forEach(itemLabel => {
            const metricKey = itemLabel; // <--- FIX: Using exact string for strict matching
            const isSub = itemLabel.includes('||');
            const displayLabel = isSub ? itemLabel.split('||')[1] : itemLabel;

            pushMetric({
              key: metricKey,
              label: displayLabel,
              category: tabCategory,
              isLineItem: true,
              indent: isSub ? 2 : 1,
              docKey: docKey,        // <--- FIX: Used for deep data lookup
              sectionKey: node.key   // <--- FIX: Used for deep data lookup
            });
          });
        }

        // Handle Totals
        if (node.type === 'total') {
          pushMetric({
            key: node.key,
            label: node.title,
            category: tabCategory,
            isTotal: true
          });
        }

        // Handle Dynamic Equity Placeholder
        if (node.dynamic && node.key === 'equity_placeholder') {
          pushMetric({
            key: 'equity',
            label: 'Total Equity',
            category: tabCategory,
            isSectionHeader: true
          });

          const activeEquityLines = activeItemsMap?.[docKey]?.['equity'] || [];
          activeEquityLines.forEach(itemLabel => {
            const metricKey = itemLabel; // <--- FIX
            pushMetric({
              key: metricKey,
              label: itemLabel,
              category: tabCategory,
              isLineItem: true,
              indent: 1,
              docKey: docKey,        // <--- FIX
              sectionKey: 'equity'   // <--- FIX
            });
          });
        }
      });
    });

    // 2. Core KPIs
    (configSchemas?.metricsFormulas || []).forEach(m => {
      pushMetric({ key: m.key, label: m.label, category: 'Core KPIs & Margins' });
    });

    // 3. Custom Ratios
    (configSchemas?.customRatios || []).forEach(r => {
      pushMetric({ key: 'cr__' + r.key, label: r.name || r.label, category: 'Custom Ratios' });
    });

    // 4. Custom KPI Cards
    (configSchemas?.customKPIs || []).forEach(k => {
      pushMetric({ key: k.key, label: k.label, category: 'Custom KPI Cards' });
    });

    return list;
  }, [configSchemas, activeItemsMap]);

  const getMetricLabel = useCallback((key) => {
    if (!key) return key;
    const found = availableMetrics.find(m => m.key === key);
    if (found) return found.label;
    // handle yoy suffix
    if (key.endsWith('_yoy')) return (availableMetrics.find(m => m.key === key.replace('_yoy',''))?.label || key) + ' (YoY%)';
    return key;
  }, [availableMetrics]);

  const getMetricValue = useCallback((key, year) => {
    const model = multiYearModel[year] || {};

    // ── 1. Custom Ratios ──
    if (key.startsWith('cr__')) {
      const ratioKey = key.slice(4);
      const ratio = (configSchemas?.customRatios || []).find(r => r.key === ratioKey);
      if (!ratio) return 0;

      // Inner helper to look up nested values for Ratios
      const getRawVal = (k) => {
        const mDef = availableMetrics.find(m => m.key === k);
        if (mDef && mDef.isLineItem && mDef.docKey && mDef.sectionKey) {
          const sKey = k.replace(/\./g, '');
          const rVal = projectData?.[mDef.docKey]?.[mDef.sectionKey]?.[year]?.[sKey];
          return model[sKey] ?? model[k] ?? (rVal !== undefined && rVal !== null ? parseFloat(rVal) : 0);
        }
        return model[k] ?? 0;
      };

      const sum = (arr) => (arr || []).reduce((s, k) => s + getRawVal(k), 0);
      const den = sum(ratio.denominator);
      return den !== 0 ? sum(ratio.numerator) / den : 0;
    }

    // ── 2. Custom KPI Cards ──
    const customKPI = (configSchemas?.customKPIs || []).find(k => k.key === key);
    if (customKPI?.formula) {
      try {
        const safeFormula = customKPI.formula.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (token) => {
          const mDef = availableMetrics.find(m => m.key === token);
          let val = model[token];
          // Deep fallback lookup for tokens nested in projectData
          if (val === undefined && mDef && mDef.isLineItem && mDef.docKey && mDef.sectionKey) {
            const sKey = token.replace(/\./g, '');
            const rVal = projectData?.[mDef.docKey]?.[mDef.sectionKey]?.[year]?.[sKey];
            val = model[sKey] ?? (rVal !== undefined && rVal !== null ? parseFloat(rVal) : 0);
          }
          return val !== undefined && val !== null && !Number.isNaN(val) ? String(val) : '0';
        });
        return Function(`"use strict"; return (${safeFormula});`)();
      } catch {
        return 0;
      }
    }

    // ── 3. Line Items (Deep Lookup Fallback) ──
    const metricDef = availableMetrics.find(m => m.key === key);
    if (metricDef && metricDef.isLineItem && metricDef.docKey && metricDef.sectionKey) {
      const safeKey = key.replace(/\./g, '');
      const rawVal = projectData?.[metricDef.docKey]?.[metricDef.sectionKey]?.[year]?.[safeKey];
      
      // Prioritize engine output -> raw output -> 0
      return model[safeKey] ?? model[key] ?? (rawVal !== undefined && rawVal !== null ? parseFloat(rawVal) : 0);
    }

    // ── 4. Standard Flat Metrics ──
    return model[key] ?? 0;
  }, [multiYearModel, configSchemas, availableMetrics, projectData]);

  // Filtered + grouped metrics for tree
  const groupedMetrics = useMemo(() => {
    const q = metricSearch.toLowerCase();
    const filtered = availableMetrics.filter(m =>
      !q || m.label.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)
    );
    return filtered.reduce((acc, m) => {
      if (!acc[m.category]) acc[m.category] = [];
      acc[m.category].push(m);
      return acc;
    }, {});
  }, [availableMetrics, metricSearch]);

  const metricTabs = useMemo(() => Object.keys(groupedMetrics), [groupedMetrics]);

  const activeTabMetrics = useMemo(() => {
    if (!activeMetricTab && metricTabs.length > 0) return groupedMetrics[metricTabs[0]] || [];
    return groupedMetrics[activeMetricTab] || [];
  }, [groupedMetrics, activeMetricTab, metricTabs]);

  useEffect(() => {
    if (!activeMetricTab && metricTabs.length > 0) {
      setActiveMetricTab(metricTabs[0]);
    } else if (activeMetricTab && !metricTabs.includes(activeMetricTab) && metricTabs.length > 0) {
      setActiveMetricTab(metricTabs[0]);
    }
  }, [metricTabs, activeMetricTab]);

  // Picker filtered metrics
  const pickerGrouped = useMemo(() => {
    const q = pickerSearch.toLowerCase();
    const filtered = availableMetrics.filter(m =>
      !q || m.label.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)
    );
    return filtered.reduce((acc, m) => {
      if (!acc[m.category]) acc[m.category] = [];
      acc[m.category].push(m);
      return acc;
    }, {});
  }, [availableMetrics, pickerSearch]);

  // Chart data for raw/yoy/both modes
  const chartData = useMemo(() => {
    if (!hasRun || !selectedYears.length || !selectedMetrics.length) return [];
    return selectedYears.map((year, yearIndex) => {
      const point = { year };
      
      // 1. Plot Raw Values
      selectedMetrics.forEach(k => {
        point[k] = getMetricValue(k, year);
      });
      
      // 2. Plot YoY % (Mathematically requires a previous year to exist)
      selectedMetrics.forEach(k => {
        if (yearIndex > 0) {
          const prevYear = selectedYears[yearIndex - 1];
          const prev = getMetricValue(k, prevYear);
          point[k + '_yoy'] = calcYoY(point[k], prev);
        } else {
          // Year 1 ALWAYS has a null YoY
          point[k + '_yoy'] = null; 
        }
      });
      
      return point;
    });
  }, [hasRun, selectedYears, selectedMetrics, getMetricValue]);

  // Ratio chart data
  const ratioChartData = useMemo(() => {
    if (!hasRun || mode !== 'ratios') return [];
    const pairs = ratioPairs.filter(p => p.setA.length > 0);
    return selectedYears.map(year => {
      const point = { year };
      pairs.forEach((pair, pi) => {
        const denom = sharedDenomOn ? sharedDenom : pair.setB;
        const num = pair.setA.reduce((s, k) => s + getMetricValue(k, year), 0);
        const den = denom.reduce((s, k) => s + getMetricValue(k, year), 0);
        point[`pair_${pi}`] = den !== 0 ? (num / den) * 100 : null;
      });
      return point;
    });
  }, [hasRun, mode, ratioPairs, sharedDenomOn, sharedDenom, selectedYears, getMetricValue]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const toggleYear = (y) => {
    setSelectedYears(prev =>
      prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y].sort((a, b) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB) && a.length === 4 && b.length === 4) {
          return numA - numB;
        }
        return 0;
      })
    );
  };

  const selectAllYears = () => {
    if (selectedYears.length === visibleYears.length) setSelectedYears([]);
    else setSelectedYears([...visibleYears]);
  };

  const toggleMetric = (key) => {
    setSelectedMetrics(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const toggleGroup = (title) => {
    setExpandedGroups(prev => ({ ...prev, [title]: prev[title] === false ? true : false }));
  };

  const runAnalysis = () => {
    if (!selectedYears.length) { setRunError('Select at least one year.'); return; }
    if (mode === 'yoy' && selectedYears.length < 2) { setRunError('YoY requires at least 2 years.'); return; }
    if (mode !== 'ratios' && mode !== 'reclass' && !selectedMetrics.length) {
      setRunError('Select at least one metric.'); return;
    }
    if (mode === 'ratios' && !ratioPairs.some(p => p.setA.length > 0)) {
      setRunError('Add at least one Numerator (Set A) to a ratio pair.'); return;
    }
    setRunError('');
    setHasRun(true);
  };

  const resetAll = () => {
    setMode('raw'); setActiveStep('mode');
    setSelectedMetrics([]); setSelectedYears([]);
    setRatioPairs([{ id: 1, setA: [], setB: [] }]);
    setSharedDenomOn(false); setSharedDenom([]);
    setHasRun(false); setRunError(''); setNotes('');
  };

  // Picker helpers
  const openPicker = (target) => {
    setPickerTarget(target);
    setPickerSearch('');
    setPickerSelected([]);
    setPickerOpen(true);
  };

  const confirmPicker = () => {
    if (!pickerTarget || !pickerSelected.length) { setPickerOpen(false); return; }
    if (pickerTarget === 'shared') {
      setSharedDenom(prev => [...new Set([...prev, ...pickerSelected])]);
    } else if (pickerTarget.startsWith('setA-')) {
      const idx = parseInt(pickerTarget.split('-')[1]);
      setRatioPairs(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], setA: [...new Set([...next[idx].setA, ...pickerSelected])] };
        return next;
      });
    } else if (pickerTarget.startsWith('setB-')) {
      const idx = parseInt(pickerTarget.split('-')[1]);
      setRatioPairs(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], setB: [...new Set([...next[idx].setB, ...pickerSelected])] };
        return next;
      });
    }
    setPickerOpen(false);
  };

  const removeFromSet = (target, key) => {
    if (target === 'shared') setSharedDenom(prev => prev.filter(k => k !== key));
    else if (target.startsWith('setA-')) {
      const idx = parseInt(target.split('-')[1]);
      setRatioPairs(prev => { const n=[...prev]; n[idx]={...n[idx],setA:n[idx].setA.filter(k=>k!==key)}; return n; });
    } else if (target.startsWith('setB-')) {
      const idx = parseInt(target.split('-')[1]);
      setRatioPairs(prev => { const n=[...prev]; n[idx]={...n[idx],setB:n[idx].setB.filter(k=>k!==key)}; return n; });
    }
  };

  const saveAnalysis = async () => {
    const name = saveName.trim() || `Analysis ${new Date().toLocaleDateString('en-IN')}`;
    const payload = {
      name, createdAt: new Date().toISOString(),
      config: { mode, metrics: selectedMetrics, years: selectedYears,
                ratioPairs, sharedDenomOn, sharedDenom },
      notes
    };
    const next = [...savedList, payload];
    setSavedList(next);
    setSaveName('');
    if (forceSave) {
      try {
        await forceSave({ savedAnalyses: next });
        setSaveStatus('Saved ✓');
      } catch { setSaveStatus('Save failed'); }
    } else {
      setSaveStatus('Saved locally ✓');
    }
    setTimeout(() => setSaveStatus(''), 2500);
  };

  const loadAnalysis = (item) => {
    const cfg = item.config || {};
    setMode(cfg.mode || 'raw');
    setSelectedMetrics(cfg.metrics || []);
    setSelectedYears(cfg.years || []);
    setRatioPairs(cfg.ratioPairs || [{ id: 1, setA: [], setB: [] }]);
    setSharedDenomOn(cfg.sharedDenomOn || false);
    setSharedDenom(cfg.sharedDenom || []);
    setNotes(item.notes || '');
    setHasRun(true);
    setActiveStep('mode');
  };

  // ─── Style constants ───────────────────────────────────────────────────────
  const S = {
    card:    { background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' },
    cardPad: { padding: 20 },
    th:      { padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-strong)', textAlign: 'left' },
    tdSec:   { padding: '11px 16px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)' },
    tdItem:  { padding: '9px 16px 9px 32px', fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' },
    tdVal:   { padding: '9px 16px', fontSize: 12, fontFamily: 'monospace', textAlign: 'right', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' },
    tdTotal: { padding: '13px 16px', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', background: 'var(--bg-hover)', borderBottom: '1px solid var(--accent-color)' },
  };

  // ─── Empty state ───────────────────────────────────────────────────────────
  if (visibleYears.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16, color: 'var(--text-muted)' }}>
        <BarChart2 size={48} style={{ opacity: 0.3 }} />
        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 600 }}>Analysis Workbench Empty</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 320 }}>
          Add fiscal years and enter data in the Financial Input Matrix to unlock analysis.
        </p>
      </div>
    );
  }

  const isStepLocked = (stepKey) => {
    if (stepKey === 'ratios')  return mode !== 'ratios';
    if (stepKey === 'reclass') return mode !== 'reclass';
    if (stepKey === 'metrics') return mode === 'ratios' || mode === 'reclass';
    return false;
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 64, position: 'relative' }}>
      
      {/* Ambient SaaS Glows */}
      <div className="ambient-orb" style={{ top: '10%', left: '-5%', width: 400, height: 400, background: 'var(--accent-color)' }} />
      <div className="ambient-orb" style={{ bottom: '30%', right: '-5%', width: 450, height: 450, background: '#ec4899', animationDelay: '3s' }} />
      
      {/* ── CONFIGURATION PANEL ── */}
      <div className="saas-card fade-in-up" style={{ ...S.card, background: 'var(--bg-secondary)', backdropFilter: 'blur(16px)', zIndex: 10 }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Target size={18} color="var(--accent-color)" />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Analysis Workbench</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={resetAll} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-muted)', padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <RotateCcw size={13} /> Reset
            </button>
            <button onClick={runAnalysis} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent-color)', border: 'none', color: '#fff', padding: '7px 18px', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.35)' }}>
              <Play size={13} /> Run Analysis
            </button>
          </div>
        </div>

        {/* Step Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-subtle)', overflowX: 'auto', padding: '0 8px' }}>
          {STEPS.map(step => (
            <StepTab
              key={step.key}
              step={step}
              active={activeStep === step.key}
              locked={isStepLocked(step.key)}
              onClick={setActiveStep}
              badge={step.key === 'metrics' ? selectedMetrics.length : step.key === 'years' ? selectedYears.length : 0}
            />
          ))}
        </div>

        {/* Step Panels */}
        <div style={{ padding: 20 }}>

          {/* ── Step 1: Mode ── */}
          {activeStep === 'mode' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {MODES.map(m => {
                const Icon = m.icon;
                const active = mode === m.key;
                return (
                  <button
                    key={m.key}
                    onClick={() => { setMode(m.key); setHasRun(false); }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
                      padding: '14px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      background: active ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
                      border: active ? '1px solid var(--accent-color)' : '1px solid var(--border-subtle)',
                      color: active ? 'var(--accent-text)' : 'var(--text-muted)', transition: 'all 0.15s'
                    }}
                  >
                    <Icon size={18} color={active ? 'var(--accent-color)' : 'var(--text-muted)'} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{m.label}</span>
                    <span style={{ fontSize: 11, color: active ? 'var(--accent-text)' : 'var(--text-muted)', lineHeight: 1.4 }}>{m.desc}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Step 2: Metrics ── */}
          {activeStep === 'metrics' && (
            <div>
              {/* Selected chips */}
              {selectedMetrics.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {selectedMetrics.map((k, idx) => (
                    <div key={k} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                      background: 'var(--bg-tertiary)', border: `1px solid ${PALETTE[idx % PALETTE.length]}40`,
                      borderRadius: 8, fontSize: 12, color: 'var(--text-primary)'
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE[idx % PALETTE.length], flexShrink: 0 }} />
                      {getMetricLabel(k)}
                      <button onClick={() => toggleMetric(k)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 0, display: 'flex', lineHeight: 1 }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Search */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  value={metricSearch}
                  onChange={e => setMetricSearch(e.target.value)}
                  placeholder="Search metrics…"
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-tertiary)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', padding: '8px 12px 8px 34px', borderRadius: 8, fontSize: 13, outline: 'none' }}
                />
              </div>
              
              {/* Tabs */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {metricTabs.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveMetricTab(tab)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: activeMetricTab === tab
                        ? '1px solid var(--accent-color)'
                        : '1px solid var(--border-subtle)',
                      background: activeMetricTab === tab
                        ? 'var(--bg-hover)'
                        : 'var(--bg-tertiary)',
                      color: activeMetricTab === tab ? 'var(--accent-text)' : 'var(--text-muted)',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tree */}
              <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 4 }}>
                {activeTabMetrics.map(metric => {
                  const selected = selectedMetrics.includes(metric.key);
                  
                  // Dynamic styling based on hierarchical properties
                  const paddingLeft = metric.isLineItem 
                      ? (metric.indent === 2 ? 44 : 24) 
                      : 12;
                      
                  const isBold = metric.isSectionHeader || metric.isTotal;
                  const displayLabel = metric.isTotal ? `Σ ${metric.label}` : metric.label;
                  
                  return (
                    <button
                      key={metric.key}
                      onClick={() => toggleMetric(metric.key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        paddingLeft: paddingLeft,
                        borderRadius: 7,
                        border: selected ? '1px solid var(--accent-color)' : '1px solid transparent',
                        background: selected ? 'var(--bg-hover)' : (isBold ? 'var(--bg-tertiary)' : 'transparent'),
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: selected ? 'var(--accent-text)' : (isBold ? 'var(--text-primary)' : 'var(--text-secondary)'),
                        borderBottom: !selected && isBold ? '1px solid var(--border-subtle)' : undefined,
                        transition: 'all 0.15s'
                      }}
                    >
                      {selected
                        ? <CheckSquare size={14} color="var(--accent-color)" style={{ flexShrink: 0 }} />
                        : <Square size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
                      
                      <span style={{ fontSize: 13, fontWeight: selected || isBold ? 600 : 400, flex: 1 }}>
                        {metric.isLineItem && metric.indent === 2 && <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>↳</span>}
                        {displayLabel}
                      </span>
                    </button>
                  );
                })}

                {Object.keys(groupedMetrics).length === 0 && (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24, fontSize: 13 }}>
                    No metrics matched.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Years ── */}
          {activeStep === 'years' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <button
                  onClick={selectAllYears}
                  style={{ fontSize: 12, color: 'var(--accent-color)', background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                >
                  {selectedYears.length === visibleYears.length ? 'Deselect All' : 'Select All'}
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedYears.length} of {visibleYears.length} selected</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {visibleYears.map(y => {
                  const sel = selectedYears.includes(y);
                  return (
                    <button
                      key={y}
                      onClick={() => toggleYear(y)}
                      style={{
                        padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        fontSize: 14, fontWeight: 700, transition: 'all 0.15s',
                        background: sel ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
                        color: sel ? 'var(--accent-text)' : 'var(--text-muted)',
                        boxShadow: sel ? '0 0 0 1px var(--accent-color)' : '0 0 0 1px var(--border-subtle)'
                      }}
                    >
                      {(/^\d{4}$/.test(y) ? 'FY ' : '') + y}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 4: Ratio Pairs ── */}
          {activeStep === 'ratios' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Shared denom toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                <input type="checkbox" checked={sharedDenomOn} onChange={e => setSharedDenomOn(e.target.checked)} style={{ accentColor: 'var(--accent-color)', width: 15, height: 15 }} />
                <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>Use a shared Denominator (Set B) for <strong style={{ color: 'var(--accent-text)' }}>all pairs</strong></span>
              </label>

              {sharedDenomOn && (
                <div style={{ padding: 14, background: 'var(--bg-hover)', borderRadius: 8, border: '1px solid var(--border-strong)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Shared Denominator (Set B)</div>
                  <ChipSet keys={sharedDenom} target="shared" onRemove={removeFromSet} getLabel={getMetricLabel} />
                  <button onClick={() => openPicker('shared')} style={addBtn}>+ Add to Denominator</button>
                </div>
              )}

              {ratioPairs.map((pair, pi) => (
                <div key={pair.id} style={{ background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Pair {pi + 1}</span>
                    {ratioPairs.length > 1 && (
                      <button onClick={() => setRatioPairs(prev => prev.filter((_, i) => i !== pi))}
                        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Trash2 size={12} /> Remove
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 0 }}>
                    {/* Numerator */}
                    <div style={{ padding: 14, borderRight: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Numerator (Set A)</div>
                      <ChipSet keys={pair.setA} target={`setA-${pi}`} onRemove={removeFromSet} getLabel={getMetricLabel} />
                      <button onClick={() => openPicker(`setA-${pi}`)} style={addBtn}>+ Add Numerator</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px', fontSize: 22, color: 'var(--text-muted)', fontWeight: 300 }}>÷</div>
                    {/* Denominator */}
                    <div style={{ padding: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Denominator (Set B)</div>
                      {sharedDenomOn
                        ? <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>✓ Using shared denominator</div>
                        : <>
                          <ChipSet keys={pair.setB} target={`setB-${pi}`} onRemove={removeFromSet} getLabel={getMetricLabel} />
                          <button onClick={() => openPicker(`setB-${pi}`)} style={addBtn}>+ Add Denominator</button>
                        </>
                      }
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={() => setRatioPairs(prev => [...prev, { id: Date.now(), setA: [], setB: [] }])}
                style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px dashed var(--accent-color)', color: 'var(--accent-color)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                + Add Another Pair
              </button>
            </div>
          )}

          {/* ── Step 5: Reclass ── */}
          {activeStep === 'reclass' && (
            <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Reclassification mappings are managed in the Analysis settings. Switch to "Statement Review" mode and run to see the adjusted view.
            </div>
          )}
        </div>

        {/* Error banner */}
        {runError && (
          <div style={{ margin: '0 20px 16px', padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#EF4444' }}>
            <AlertCircle size={14} /> {runError}
          </div>
        )}
      </div>

      {/* ── OUTPUT ── */}
      {hasRun && (
        <>
          {/* Raw / YoY / Both — Chart */}
          {(mode === 'raw' || mode === 'yoy' || mode === 'both') && selectedMetrics.length > 0 && chartData.length > 0 && (
            <div className="saas-card fade-in-up" style={{ ...S.card, background: 'var(--bg-secondary)', backdropFilter: 'blur(16px)', zIndex: 10 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
                  {mode === 'raw' ? 'Trend Chart — Raw Values' : mode === 'yoy' ? 'Year-on-Year Change' : 'Raw Values + YoY Overlay'}
                </span>
                <button onClick={copyChartToClipboard} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-strong)', color: 'var(--accent-text)', padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
                  {copiedChart ? <Check size={14} color="#10b981" /> : <Copy size={14} />} {copiedChart ? 'Copied Image' : 'Copy Chart'}
                </button>
              </div>
              <div style={{ padding: 20, height: 360, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 24, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis dataKey="year" stroke="var(--border-strong)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      yAxisId="y" orientation="left" stroke="var(--border-strong)" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={v => {
                        const abs = Math.abs(v);
                        if (abs >= 10000000) return (v/10000000).toFixed(1)+'Cr';
                        if (abs >= 100000) return (v/100000).toFixed(1)+'L';
                        return v;
                      }}
                    />
                    {(mode === 'both') && (
                      <YAxis yAxisId="y1" orientation="right" stroke="var(--border-strong)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => v?.toFixed(1)+'%'} />
                    )}
                    <Tooltip content={<CustomTooltip mode={mode} getMetricLabel={getMetricLabel} configSchemas={configSchemas} />} />
                    <Legend wrapperStyle={{ paddingTop: 16 }} formatter={(value) => <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{getMetricLabel(value)}</span>} />
                    {selectedMetrics.map((k, idx) => {
                      const color = PALETTE[idx % PALETTE.length];
                      if (mode === 'raw') {
                        return idx === 0
                          ? <Bar key={k} dataKey={k} yAxisId="y" fill={color+'33'} stroke={color} strokeWidth={1.5} radius={[4,4,0,0]} maxBarSize={60} />
                          : <Line key={k} type="monotone" dataKey={k} yAxisId="y" stroke={color} strokeWidth={2.5} dot={{ fill: color, r: 4 }} activeDot={{ r: 6, stroke: 'var(--text-primary)', strokeWidth: 2 }} />;
                      }
                      if (mode === 'yoy') {
                        return <Line key={k+'_yoy'} type="monotone" dataKey={k+'_yoy'} yAxisId="y" stroke={color} strokeWidth={2.5} dot={{ fill: color, r: 4 }} activeDot={{ r: 6 }} connectNulls={false} />;
                      }
                      // both
                      return (
                        <React.Fragment key={k}>
                          <Bar dataKey={k} yAxisId="y" fill={color+'22'} stroke={color} strokeWidth={1} radius={[3,3,0,0]} maxBarSize={50} />
                          <Line type="monotone" dataKey={k+'_yoy'} yAxisId="y1" stroke={color} strokeWidth={2} dot={{ fill: color, r: 3 }} strokeDasharray="4 2" connectNulls={false} />
                        </React.Fragment>
                      );
                    })}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Raw / YoY / Both — Table */}
          {(mode === 'raw' || mode === 'yoy' || mode === 'both') && selectedMetrics.length > 0 && (
            <div style={S.card}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
                {mode === 'raw' ? 'Raw Data Table' : mode === 'yoy' ? 'Year-on-Year Table' : 'Raw + YoY Table'}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, minWidth: 200 }}>Metric</th>
                      {selectedYears.map((y, i) => (
                        <th key={y} style={{ ...S.th, textAlign: 'right' }}>
                          {mode === 'yoy' && i === 0 ? `${/^\d{4}$/.test(y) ? 'FY ' : ''}${y} (Base)` : (/^\d{4}$/.test(y) ? 'FY ' : '') + y}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedMetrics.map(key => {
                      const vals = selectedYears.map(y => getMetricValue(key, y));
                      return (
                        <tr key={key}>
                          <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', fontWeight: 500 }}>{getMetricLabel(key)}</td>
                          {selectedYears.map((y, i) => {
                            const val = vals[i];
                            const fmt = formatIN(val);
                            const yoy = i > 0 ? calcYoY(val, vals[i-1]) : null;
                            return (
                              <td key={y} style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'monospace', fontSize: 13 }}>
                                {mode === 'raw' && <span style={{ color: 'var(--text-primary)' }}>{fmt}</span>}
                                {mode === 'yoy' && (i === 0 ? <span style={{ color: 'var(--text-muted)' }}>{fmt}</span> : <YoYBadge value={yoy} />)}
                                {mode === 'both' && (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                    <span style={{ color: 'var(--text-primary)' }}>{fmt}</span>
                                    {i > 0 && <YoYBadge value={yoy} />}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ratio Output */}
          {mode === 'ratios' && (() => {
            const pairs = ratioPairs.filter(p => p.setA.length > 0);
            if (!pairs.length) return null;
            return (
              <>
                {/* Ratio Chart */}
                {ratioChartData.length > 0 && (
                  <div className="saas-card fade-in-up" style={{ ...S.card, background: 'var(--bg-secondary)', backdropFilter: 'blur(16px)', zIndex: 10 }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Ratio Trend</span>
                      <button onClick={copyChartToClipboard} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-strong)', color: 'var(--accent-text)', padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
                        {copiedChart ? <Check size={14} color="#10b981" /> : <Copy size={14} />} {copiedChart ? 'Copied Image' : 'Copy Chart'}
                      </button>
                    </div>
                    <div style={{ padding: 20, height: 300, position: 'relative' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={ratioChartData} margin={{ top: 10, right: 24, left: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                          <XAxis dataKey="year" stroke="var(--border-strong)" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke="var(--border-strong)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => v?.toFixed(1)+'%'} />
                          <Tooltip content={<CustomTooltip mode={mode} getMetricLabel={(k) => `Pair ${parseInt(k.replace('pair_',''))+1}`} configSchemas={configSchemas} />} />
                          <Legend wrapperStyle={{ paddingTop: 12 }} formatter={(v) => <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Pair {parseInt(v.replace('pair_',''))+1}</span>} />
                          {pairs.map((_, pi) => (
                            <Line key={`pair_${pi}`} type="monotone" dataKey={`pair_${pi}`} stroke={PALETTE[pi % PALETTE.length]} strokeWidth={2.5} dot={{ fill: PALETTE[pi % PALETTE.length], r: 5 }} activeDot={{ r: 7 }} connectNulls={false} />
                          ))}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
                {/* Ratio Table */}
                <div className="saas-card fade-in-up" style={{ ...S.card, background: 'var(--bg-secondary)', backdropFilter: 'blur(16px)', zIndex: 10, animationDelay: '0.1s' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Ratio Analysis — A ÷ B</span>
                    <button onClick={copyRatioTableToTSV} style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {copiedTable ? <Check size={14} color="#10b981" /> : <Copy size={14} />} {copiedTable ? 'Copied Data' : 'Copy to Excel'}
                    </button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                      <thead>
                        <tr>
                          <th style={{ ...S.th, minWidth: 220 }}>Description</th>
                          {selectedYears.map(y => <th key={y} style={{ ...S.th, textAlign: 'right' }}>{(/^\d{4}$/.test(y) ? 'FY ' : '') + y}</th>)}
                        </tr>
                      </thead>
<tbody>
                        {sharedDenomOn && sharedDenom.length > 0 ? (
                          <>
                            <tr>
                              <td colSpan={selectedYears.length+1} style={{ padding: '10px 16px', background: 'var(--bg-hover)', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, fontWeight: 700, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Shared Denominator
                              </td>
                            </tr>
                            <tr>
                              <td style={S.tdItem}>
                                <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: '#F59E0B', fontWeight: 700, marginRight: 8 }}>B</span>
                                {sharedDenom.map(k => getMetricLabel(k)).join(' + ') || '—'}
                              </td>
                              {selectedYears.map(y => {
                                const denVal = sharedDenom.reduce((s,k) => s+getMetricValue(k,y), 0);
                                return <td key={y} style={{ ...S.tdVal, color: '#F59E0B' }}>{formatIN(denVal)}</td>;
                              })}
                            </tr>
                            <tr>
                              <td colSpan={selectedYears.length+1} style={{ padding: '10px 16px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Numerators & Ratios
                              </td>
                            </tr>
                            {pairs.map((pair, pi) => {
                              const numVals = selectedYears.map(y => pair.setA.reduce((s,k) => s+getMetricValue(k,y), 0));
                              const denVals = selectedYears.map(y => sharedDenom.reduce((s,k) => s+getMetricValue(k,y), 0));
                              const color = PALETTE[pi % PALETTE.length];
                              return (
                                <tr key={pair.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                  <td style={{ ...S.tdItem, color: 'var(--text-primary)', paddingLeft: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                      {pair.setA.map(k => getMetricLabel(k)).join(' + ') || '—'}
                                    </div>
                                  </td>
                                  {numVals.map((v,i) => {
                                    const ratio = denVals[i] !== 0 ? (v/denVals[i])*100 : null;
                                    return (
                                      <td key={i} style={{ ...S.tdVal, color: 'var(--text-primary)' }}>
                                        {formatIN(v)}
                                        <span style={{ color: ratio === null ? 'var(--text-muted)' : ratio >= 0 ? '#10B981' : '#EF4444', marginLeft: 8, fontWeight: 700 }}>
                                          {ratio === null ? '(—)' : `(${ratio.toFixed(2)}%)`}
                                        </span>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </>
                        ) : (
                          pairs.map((pair, pi) => {
                            const denom = pair.setB;
                            const numVals = selectedYears.map(y => pair.setA.reduce((s,k) => s+getMetricValue(k,y), 0));
                            const denVals = selectedYears.map(y => denom.reduce((s,k) => s+getMetricValue(k,y), 0));
                            const ratios  = numVals.map((n,i) => denVals[i] !== 0 ? (n/denVals[i])*100 : null);
                            const color = PALETTE[pi % PALETTE.length];
                            return (
                              <React.Fragment key={pair.id}>
                                <tr>
                                  <td colSpan={selectedYears.length+1} style={{ padding: '10px 16px', background: `${color}12`, borderBottom: '1px solid var(--border-subtle)', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Pair {pi+1}
                                  </td>
                                </tr>
                                <tr>
                                  <td style={S.tdItem}><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#10B981', fontWeight: 700 }}>A</span> {pair.setA.map(k => getMetricLabel(k)).join(' + ') || '—'}</td>
                                  {numVals.map((v,i) => <td key={i} style={{ ...S.tdVal, color: '#10B981' }}>{formatIN(v)}</td>)}
                                </tr>
                                <tr>
                                  <td style={S.tdItem}><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: '#F59E0B', fontWeight: 700 }}>B</span> {denom.map(k => getMetricLabel(k)).join(' + ') || '—'}</td>
                                  {denVals.map((v,i) => <td key={i} style={{ ...S.tdVal, color: '#F59E0B' }}>{formatIN(v)}</td>)}
                                </tr>
                                <tr style={{ background: 'var(--bg-tertiary)' }}>
                                  <td style={{ ...S.tdItem, fontWeight: 700, color: color }}>A ÷ B (Ratio %)</td>
                                  {ratios.map((v,i) => <td key={i} style={{ ...S.tdVal, fontWeight: 800, color: v === null ? 'var(--text-muted)' : v >= 0 ? '#10B981' : '#EF4444' }}>{v === null ? '—' : v.toFixed(2)+'%'}</td>)}
                                </tr>
                              </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                                          </table>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Statement Review (Reclass) Output */}
          {mode === 'reclass' && (() => {
            const allDocSchemas = configSchemas?.documents || [];
            if (!allDocSchemas.length) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32, fontSize: 13 }}>No document schemas found.</div>;
            return allDocSchemas.map(doc => {
              const structure = configSchemas?.chartOfAccounts?.shared?.[doc.key] || [];
              if (!structure.length) return null;
              return (
                <div key={doc.key} style={S.card}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BookOpen size={15} color="var(--accent-color)" />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{doc.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>Post-Reclassification View</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                      <thead>
                        <tr>
                          <th style={{ ...S.th, minWidth: 220 }}>Line Item</th>
                          {selectedYears.map(y => <th key={y} style={{ ...S.th, textAlign: 'right' }}>{(/^\d{4}$/.test(y) ? 'FY ' : '') + y}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {structure.map((node, ni) => {
                          if (node.type === 'group') {
                            return (
                              <tr key={`g${ni}`}>
                                <td colSpan={selectedYears.length+1} style={{ padding: '12px 16px', fontSize: 12, fontWeight: 800, color: 'var(--accent-color)', background: 'var(--bg-hover)', borderBottom: '1px solid var(--border-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{node.title}</td>
                              </tr>
                            );
                          }
                          if (node.type === 'total') {
                            return (
                              <tr key={`t${ni}`} style={{ background: node.bg || 'var(--bg-tertiary)' }}>
                                <td style={{ ...S.tdTotal }}>Σ {node.title}</td>
                                {selectedYears.map(y => (
                                  <td key={y} style={{ ...S.tdTotal, textAlign: 'right' }}>
                                    {formatValue(node.key, multiYearModel[y]?.[node.key], configSchemas)}
                                  </td>
                                ))}
                              </tr>
                            );
                          }
                          if (node.type === 'section') {
                            return (
                              <React.Fragment key={`s${ni}`}>
                                <tr>
                                  <td style={S.tdSec}>{node.title}</td>
                                  {selectedYears.map(y => (
                                    <td key={y} style={{ ...S.tdSec, textAlign: 'right', fontFamily: 'monospace' }}>
                                      {formatValue(node.key, multiYearModel[y]?.[node.key], configSchemas)}
                                    </td>
                                  ))}
                                </tr>
                                {(node.items || []).map((item, ii) => {
                                  const rawLabel = typeof item === 'string' ? item : (item.label || item.dataKey || '');
                                  const dataKey  = typeof item === 'string' ? rawLabel : (item.dataKey || rawLabel);
                                  const isSub    = rawLabel.includes('||');
                                  const display  = isSub ? rawLabel.split('||')[1] : rawLabel;
                                  const safeKey  = dataKey.replace(/\./g, '');
                                  return (
                                    <tr key={`i${ii}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                      <td style={{ ...S.tdItem, paddingLeft: isSub ? 48 : 32, color: isSub ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{display}</td>
                                      {selectedYears.map(y => {
                                        const docKey = doc.key;
                                        const raw = projectData?.[docKey]?.[node.key]?.[y]?.[safeKey];
                                        const val = raw !== undefined && raw !== null ? parseFloat(raw) : 0;
                                        const reclassed = reclassMap?.[docKey]?.[node.key]?.[safeKey];
                                        return (
                                          <td key={y} style={{ ...S.tdVal, color: reclassed ? '#F59E0B' : 'var(--text-muted)', textDecoration: reclassed ? 'line-through' : 'none' }}>
                                            {val !== 0 ? formatIN(val) : '—'}
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
            });
          })()}
        </>
      )}

      {/* ── NOTES + SAVE ── */}
      <div className="saas-card fade-in-up" style={{ ...S.card, background: 'var(--bg-secondary)', backdropFilter: 'blur(16px)', zIndex: 10 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Analysis Notes</div>
        <div style={S.cardPad}>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add observations, commentary, or conclusions here…"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 100, background: 'var(--bg-tertiary)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', borderRadius: 8, padding: '12px 14px', fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.6 }}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Analysis name (optional)"
              style={{ flex: 1, minWidth: 200, background: 'var(--bg-tertiary)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', borderRadius: 8, padding: '9px 14px', fontSize: 13, outline: 'none' }}
            />
            <button onClick={saveAnalysis} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Save size={14} /> Save Analysis
            </button>
            {saveStatus && <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>{saveStatus}</span>}
          </div>
        </div>
      </div>

      {/* ── SAVED LIST ── */}
      {savedList.length > 0 && (
        <div className="saas-card fade-in-up" style={{ ...S.card, background: 'var(--bg-secondary)', backdropFilter: 'blur(16px)', zIndex: 10 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Saved Analyses</div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedList.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-subtle)', cursor: 'pointer' }} onClick={() => loadAnalysis(item)}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {(item.config?.metrics || []).length} metrics · {(item.config?.years || []).length} years · {item.config?.mode}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); setSavedList(prev => prev.filter((_,j)=>j!==i)); }}
                  style={{ background: 'rgba(239,68,68,0.1)', border: 'none', color: '#EF4444', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', display: 'flex' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── METRIC PICKER MODAL ── */}
      {pickerOpen && (
        <div
          onClick={() => setPickerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)', borderRadius: 14, display: 'flex', flexDirection: 'column', maxHeight: '80vh', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}
          >
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Select Metrics</h3>
              <button onClick={() => setPickerOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Search…"
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-tertiary)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', padding: '8px 12px 8px 34px', borderRadius: 8, fontSize: 13, outline: 'none' }} />
              </div>
            </div>
<div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Object.entries(pickerGrouped).map(([cat, items]) => (
                <div key={cat}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 0 6px' }}>{cat}</div>
                  {items.map(m => {
                    const sel = pickerSelected.includes(m.key);
                    const paddingLeft = m.isLineItem ? (m.indent === 2 ? 44 : 24) : 12;
                    const isBold = m.isSectionHeader || m.isTotal;
                    const displayLabel = m.isTotal ? `Σ ${m.label}` : m.label;
                    
                    return (
                      <button key={m.key}
                        onClick={() => setPickerSelected(prev => sel ? prev.filter(k=>k!==m.key) : [...prev, m.key])}
                        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', paddingLeft: paddingLeft, background: sel ? 'var(--bg-hover)' : (isBold ? 'var(--bg-tertiary)' : 'transparent'), border: sel ? '1px solid var(--accent-color)' : '1px solid transparent', borderBottom: (!sel && isBold) ? '1px solid var(--border-subtle)' : undefined, borderRadius: 7, cursor: 'pointer', marginBottom: 2, transition: 'all 0.12s', textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 13, color: sel ? 'var(--accent-text)' : (isBold ? 'var(--text-primary)' : 'var(--text-primary)'), fontWeight: sel || isBold ? 600 : 400 }}>
                            {m.isLineItem && m.indent === 2 && <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>↳</span>}
                            {displayLabel}
                          </span>
                        </div>
                        {sel ? <CheckSquare size={14} color="var(--accent-color)" style={{ flexShrink: 0 }} /> : <Plus size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pickerSelected.length} selected</span>
              <button onClick={confirmPicker} style={{ background: 'var(--accent-color)', border: 'none', color: '#fff', padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Add to Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chip Set sub-component ────────────────────────────────────────────────────
function ChipSet({ keys, target, onRemove, getLabel }) {
  if (!keys.length) return <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0 8px', fontStyle: 'italic' }}>None selected</div>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
      {keys.map(k => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          {getLabel(k)}
          <button onClick={() => onRemove(target, k)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 0, display: 'flex', lineHeight: 1 }}><X size={11} /></button>
        </div>
      ))}
    </div>
  );
}

// ─── shared inline style ────────────────────────────────────────────────────
const addBtn = {
  background: 'transparent', border: '1px dashed var(--accent-color)',
  color: 'var(--accent-color)', padding: '6px 12px', borderRadius: 7,
  fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 4
};