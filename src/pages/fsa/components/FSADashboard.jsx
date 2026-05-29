/**
 * src/pages/fsa/components/FSADashboard.jsx
 * * DYNAMIC EXECUTIVE FINANCIAL DASHBOARD & KPI VISUALIZER
 * Fully upgraded to support Global SaaS Theme Variables (Light/Dark Mode)
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid 
} from 'recharts';
import { LayoutDashboard, TrendingUp, TrendingDown, Sparkles, Calendar } from 'lucide-react';
import { formatValue } from '../utils/fsaFormatters.js';
import { buildFinancialModel } from '../core/fsaEngine.js';

const CHART_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#8b5cf6', 
  '#06b6d4', '#ec4899', '#f97316', '#a3e635'
];

export default function FSADashboard({
  projectData,
  configSchemas,
  reclassMap,
  activeEntityType
}) {
  // ── 1. CHRONOLOGICAL YEARS DETECTOR ──
  const visibleYears = useMemo(() => {
    const yearsSet = new Set();
    Object.values(projectData || {}).forEach(docStore => {
      Object.values(docStore || {}).forEach(sectionStore => {
        Object.keys(sectionStore || {}).forEach(year => yearsSet.add(year));
      });
    });
    return Array.from(yearsSet).sort((a, b) => parseInt(a) - parseInt(b));
  }, [projectData]);

  // ── 2. PRE-COMPUTE HOURLY FINANCIAL MODELS ──
  const multiYearModel = useMemo(() => {
    if (visibleYears.length === 0) return {};
    const models = {};
    visibleYears.forEach(year => {
      models[year] = buildFinancialModel(projectData, year, reclassMap, configSchemas, activeEntityType)[year] || {};
    });
    return models;
  }, [projectData, visibleYears, reclassMap, configSchemas, activeEntityType]);

  // ── 3. VISIBILITY CONFIGURATIONS ──
  const visibleKPIKeys = configSchemas?.dashboardConfig?.visibleKPIs || [];
  const configuredCharts = configSchemas?.dashboardConfig?.charts || [];

  // Define full list of available KPIs (Standard + Custom)
  const availableKPIs = useMemo(() => {
    const std = configSchemas?.chartOfAccounts?.shared?.pnl?.filter(n => n.type === 'total').map(n => ({ key: n.key, label: n.title, isPercentage: false })) || [];
    const ratios = (configSchemas?.customRatios || []).map(r => ({ key: r.key, label: r.name, isPercentage: r.isPercentage }));
    const kpis = (configSchemas?.customKPIs || []).map(k => ({ key: k.key, label: k.label, isPercentage: k.isPercentage }));
    return [...std, ...ratios, ...kpis];
  }, [configSchemas]);

  // Filter only those explicitly enabled in Settings
  const activeKPIs = availableKPIs.filter(kpi => visibleKPIKeys.includes(kpi.key));
  const activeCharts = configuredCharts.filter(c => c.isVisible);

  // ── 4. CHART DATA FORMATTER ──
  const chartData = useMemo(() => {
    return visibleYears.map(year => {
      const point = { year };
      const yearModel = multiYearModel[year] || {};
      
      activeCharts.forEach(chart => {
        chart.datasets.forEach(dsKey => {
          point[dsKey] = yearModel[dsKey] || 0;
        });
      });
      return point;
    });
  }, [visibleYears, multiYearModel, activeCharts]);

  // Dynamic Theme-Aware Tooltip for Recharts
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', backdropFilter: 'blur(8px)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 4 }}>FY {label}</div>
          {payload.map((entry, index) => {
             const def = availableKPIs.find(k => k.key === entry.dataKey);
             const isPerc = def ? def.isPercentage : false;
             let displayValue = entry.value;
             if (isPerc) {
                displayValue = (entry.value * 100).toFixed(2) + '%';
             } else if (entry.value >= 10000000 || entry.value <= -10000000) {
                displayValue = '₹' + (entry.value / 10000000).toFixed(2) + ' Cr';
             } else if (entry.value >= 100000 || entry.value <= -100000) {
                displayValue = '₹' + (entry.value / 100000).toFixed(2) + ' L';
             } else {
                displayValue = '₹' + entry.value.toLocaleString('en-IN');
             }

             return (
              <div key={`item-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, margin: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color }}></span>
                  <span style={{ color: 'var(--text-muted)' }}>{entry.name}</span>
                </div>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'monospace' }}>
                  {displayValue}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  if (visibleYears.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <LayoutDashboard size={48} opacity={0.2} />
        <h2 style={{ fontSize: 20, color: 'var(--text-primary)', margin: 0 }}>Dashboard Awaiting Data</h2>
        <p style={{ maxWidth: 400, lineHeight: 1.6 }}>Initialize the Financial Input Matrix and configure your Enterprise Settings to generate executive analytics.</p>
      </div>
    );
  }

  const latestYear = visibleYears[visibleYears.length - 1];
  const previousYear = visibleYears.length > 1 ? visibleYears[visibleYears.length - 2] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, paddingBottom: 24, animation: 'fadeIn 0.4s ease-out' }}>
      
      {/* ── KPI SCORECARDS (CONFIG-DRIVEN) ── */}
      {activeKPIs.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {activeKPIs.map(kpi => {
            const currentVal = multiYearModel[latestYear]?.[kpi.key] || 0;
            const prevVal = previousYear ? (multiYearModel[previousYear]?.[kpi.key] || 0) : null;
            
            let yoyGrowth = null;
            let isPositive = null;
            if (prevVal !== null && prevVal !== 0) {
              yoyGrowth = ((currentVal - prevVal) / Math.abs(prevVal)) * 100;
              isPositive = yoyGrowth > 0;
            }

            return (
              <div key={kpi.key} className="saas-card" style={{ background: 'var(--bg-secondary)', borderRadius: 16, padding: 20, border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>{kpi.label}</span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={16} color="var(--accent-color)" />
                  </div>
                </div>
                
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatValue(kpi.isPercentage ? 'margin' : 'default', currentVal, configSchemas)}
                </div>
                
                <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto', paddingTop: 8, borderTop: '1px dashed var(--border-subtle)' }}>
                  {yoyGrowth !== null ? (
                    <>
                      <span style={{ 
                        display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                        background: isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: isPositive ? '#10b981' : '#ef4444'
                      }}>
                        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {Math.abs(yoyGrowth).toFixed(1)}%
                      </span>
                      vs FY {previousYear}
                    </>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.6 }}>
                      <Calendar size={12} /> Baseline Year (FY {latestYear})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: 20, textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: 12, border: '1px dashed var(--border-strong)', color: 'var(--text-muted)', fontSize: 13 }}>
          No KPIs configured for visibility. Add metrics via Enterprise Configurations.
        </div>
      )}

      {/* ── COMPARATIVE CHARTS (CONFIG-DRIVEN) ── */}
      {activeCharts.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: 24 }}>
          {activeCharts.map((chartDef, index) => (
            <div key={chartDef.id} className="saas-card" style={{ background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed var(--border-strong)', paddingBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <LayoutDashboard size={18} color="var(--accent-color)" /> {chartDef.title}
                </h3>
              </div>
              
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }} dy={10} />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'monospace' }} 
                      tickFormatter={(val) => {
                        if (val >= 10000000 || val <= -10000000) return (val / 10000000).toFixed(1) + 'Cr';
                        if (val >= 100000 || val <= -100000) return (val / 100000).toFixed(0) + 'L';
                        if (val >= 1000 || val <= -1000) return (val / 1000).toFixed(0) + 'k';
                        return val;
                      }}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-tertiary)' }} />
                    <Legend wrapperStyle={{ paddingTop: 20, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }} iconType="circle" />
                    
                    {chartDef.datasets.map((dsKey, dIdx) => {
                      const color = CHART_COLORS[dIdx % CHART_COLORS.length];
                      const isLine = chartDef.type === 'line' || (chartDef.type === 'combo' && dIdx > 0);

                      if (isLine) {
                        return (
                          <Line 
                            key={dsKey} 
                            type="monotone" 
                            dataKey={dsKey} 
                            stroke={color} 
                            strokeWidth={2.5} 
                            dot={{ fill: color, r: 3.5 }} 
                            activeDot={{ r: 5, stroke: 'var(--bg-secondary)', strokeWidth: 1.5 }} 
                          />
                        );
                      }

                      return (
                        <Bar 
                          key={dsKey} 
                          dataKey={dsKey} 
                          fill={color} 
                          radius={[4, 4, 0, 0]} 
                          maxBarSize={45} 
                        />
                      );
                    })}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: 12, border: '1px dashed var(--border-strong)', color: 'var(--text-muted)', fontSize: 13 }}>
          No charts are currently set to visible. Please enable them in your Enterprise Configurations.
        </div>
      )}

    </div>
  );
}