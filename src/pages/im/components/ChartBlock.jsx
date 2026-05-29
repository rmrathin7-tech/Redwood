import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Table2, Plus, Trash2 } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, Cell
} from 'recharts';

// Inline fallback for BlockWrapper to resolve compilation error
const BlockWrapper = ({ children, isDark }) => (
  <div style={{
    padding: '24px',
    background: isDark ? '#0d1117' : '#ffffff',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb'}`,
    borderRadius: '12px',
    marginBottom: '24px',
    position: 'relative'
  }}>
    {children}
  </div>
);

export default function ChartBlock({ block, value, onChange, lockedBy, onFocus, onBlur, isDark = true }) {
  const [activeTab, setActiveTab] = useState('data');
  const [isFocused, setIsFocused] = useState(false);

  // ── THEME TOKENS ─────────────────────────────────────────────────────────
  const t = {
    bg:          isDark ? '#0d1117' : '#ffffff',
    border:      isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
    text:        isDark ? '#e2e8f0' : '#111827',
    textMuted:   isDark ? '#94a3b8' : '#6b7280',
    headerBg:    isDark ? 'rgba(255,255,255,0.03)' : '#f3f4f6',
    inputBg:     'transparent',
    accent:      '#ef4444',
    tabActiveBg: isDark ? 'rgba(59,130,246,0.15)' : '#eff6ff',
    tabActiveTx: isDark ? '#60a5fa' : '#2563eb',
    gridLine:    isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
  };

  const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

  const seriesNames  = block.series     || ['Actual', 'Projected'];
  const seriesColors = block.colors     || DEFAULT_COLORS;
  const xAxisLabel   = block.xAxisLabel || 'Category';
  const chartType    = block.chartType  || 'bar';

  // ── DATA MANAGEMENT ──────────────────────────────────────────────────────
  const rows = value?.rows || [];

  useEffect(() => {
    if (!value || !value.rows || value.rows.length === 0) {
      const hasLabels = block.rowLabels && block.rowLabels.length > 0;
      const count = hasLabels ? block.rowLabels.length : Math.max(1, block.baseRowCount || 1);
      const defaultRows = Array.from({ length: count }, (_, i) => ({
        id: `r${i + 1}`,
        label: hasLabels ? block.rowLabels[i] : `Item ${i + 1}`,
        values: seriesNames.map(() => 0),
      }));
      if (onChange) onChange(block.dataPath, { rows: defaultRows });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, block.dataPath]);

  const save = useCallback((newRows) => {
    if (onChange) onChange(block.dataPath, { rows: newRows });
  }, [onChange, block.dataPath]);

  const updateLabel = (rIdx, newLabel) => {
    const next = [...rows];
    next[rIdx] = { ...next[rIdx], label: newLabel };
    save(next);
  };

  const updateValue = (rIdx, sIdx, newValue) => {
    const next = [...rows];
    const newValues = [...(next[rIdx].values || [])];
    newValues[sIdx] = newValue;
    next[rIdx] = { ...next[rIdx], values: newValues };
    save(next);
  };

  const addRow = () => {
    const next = [
      ...rows,
      { id: crypto.randomUUID().slice(0, 6), label: 'New Item', values: seriesNames.map(() => 0) }
    ];
    save(next);
  };

  const deleteRow = (rIdx) => {
    const next = rows.filter((_, i) => i !== rIdx);
    save(next);
  };

  // ── CHART DATA TRANSFORM ─────────────────────────────────────────────────
  const chartData = rows.map(r => {
    const dataObj = { name: r.label || 'Unnamed' };
    seriesNames.forEach((series, i) => {
      dataObj[series] = Number((r.values || [])[i]) || 0;
    });
    return dataObj;
  });

  // ── PIE COLORS HELPER ────────────────────────────────────────────────────
  const getPieColors = () => {
    if (block.pieColors && block.pieColors.length > 0) {
      // pieColors stored without '#', so prepend it
      return block.pieColors.map(c => c.startsWith('#') ? c : `#${c}`);
    }
    return DEFAULT_COLORS;
  };

  // ── DYNAMIC CHART RENDERER ───────────────────────────────────────────────
  const renderChart = () => {
    if (!chartData || chartData.length === 0) return null;

    // ── PIE CHART ──
    if (chartType === 'pie') {
      const pieColors = getPieColors();

      // Multiple series → render one pie per series side by side
      if (seriesNames.length > 1) {
        return (
          <div style={{ display: 'flex', gap: '12px', width: '100%', height: '100%', alignItems: 'flex-start' }}>
            {seriesNames.map((sName, sIdx) => {
              const pieData = rows.map((r, idx) => ({
                name: r.label || `Item ${idx + 1}`,
                value: Number((r.values || [])[sIdx]) || 0,
              }));
              return (
                <div key={sIdx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    fontSize: '11px', fontWeight: 800, color: t.textMuted,
                    textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px'
                  }}>
                    {sName}
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={85}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: t.bg, borderColor: t.border, borderRadius: '8px', color: t.text, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
                        itemStyle={{ fontSize: '13px', fontWeight: 600 }}
                      />
                      {block.showLegend !== false && (
                        <Legend wrapperStyle={{ fontSize: '11px', color: t.textMuted }} iconType="circle" />
                      )}
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        );
      }

      // Single series → single pie (original behaviour)
      const pieSeriesIdx = block.pieSeriesIndex ?? 0;
      const pieData = rows.map((r, idx) => ({
        name: r.label || `Item ${idx + 1}`,
        value: Number((r.values || [])[pieSeriesIdx]) || 0,
      }));

      return (
        <PieChart margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={110}
            paddingAngle={2}
            dataKey="value"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {pieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: t.bg, borderColor: t.border, borderRadius: '8px', color: t.text, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
            itemStyle={{ fontSize: '13px', fontWeight: 600 }}
          />
          {block.showLegend !== false && (
            <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', color: t.textMuted }} iconType="circle" />
          )}
        </PieChart>
      );
    }

    // ── BAR / LINE / AREA ──
    const commonProps = {
      data: chartData,
      margin: { top: 10, right: 10, left: -20, bottom: 0 },
    };
    const ChartComponent = chartType === 'line' ? LineChart : chartType === 'area' ? AreaChart : BarChart;

    return (
      <ChartComponent {...commonProps}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.gridLine} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: t.textMuted, fontSize: 12 }}
          axisLine={{ stroke: t.border }}
          tickLine={false}
          dy={10}
        />
        <YAxis
          tick={{ fill: t.textMuted, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
        />
        <Tooltip
          cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
          contentStyle={{ backgroundColor: t.bg, borderColor: t.border, borderRadius: '8px', color: t.text, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
          itemStyle={{ fontSize: '13px', fontWeight: 600 }}
          labelStyle={{ color: t.textMuted, fontSize: '12px', marginBottom: '4px' }}
        />
        {block.showLegend !== false && (
          <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', color: t.textMuted }} iconType="circle" />
        )}
        {seriesNames.map((series, i) => {
          const color = seriesColors[i % seriesColors.length];
          if (chartType === 'line') {
            return <Line key={series} type="monotone" dataKey={series} stroke={color} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />;
          }
          if (chartType === 'area') {
            return <Area key={series} type="monotone" dataKey={series} stroke={color} fill={color} fillOpacity={0.3} strokeWidth={2} />;
          }
          return <Bar key={series} dataKey={series} fill={color} radius={[4, 4, 0, 0]} maxBarSize={60} />;
        })}
      </ChartComponent>
    );
  };

  // ── CHART TAB CONTAINER ──────────────────────────────────────────────────
  // Multi-pie needs its own height and skips the outer ResponsiveContainer
  const isMultiPie = chartType === 'pie' && seriesNames.length > 1;

  return (
    <BlockWrapper block={block} lockedBy={lockedBy} isDark={isDark}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px' }}>
        <div>
      
          {block.title && (
            <div style={{ fontSize: '16px', fontWeight: 700, color: t.text, marginTop: '4px' }}>{block.title}</div>
          )}
        </div>

        {/* ── TAB SWITCHER ── */}
        <div style={{ display: 'flex', background: isDark ? 'rgba(0,0,0,0.2)' : '#f1f5f9', padding: '4px', borderRadius: '8px', border: `1px solid ${t.border}` }}>
          <button
            onClick={() => setActiveTab('data')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '5px',
              border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
              background: activeTab === 'data' ? t.tabActiveBg : 'transparent',
              color: activeTab === 'data' ? t.tabActiveTx : t.textMuted,
              transition: 'all 0.2s'
            }}
          >
            <Table2 size={14} /> Data Table
          </button>
          <button
            onClick={() => setActiveTab('chart')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '5px',
              border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
              background: activeTab === 'chart' ? t.tabActiveBg : 'transparent',
              color: activeTab === 'chart' ? t.tabActiveTx : t.textMuted,
              transition: 'all 0.2s'
            }}
          >
            <BarChart3 size={14} /> Live Chart
          </button>
        </div>
      </div>

      <div style={{ border: `1px solid ${t.border}`, borderRadius: '10px', background: t.bg, overflow: 'hidden' }}>

        {/* ── DATA TAB ── */}
        {activeTab === 'data' && (
          <div style={{ padding: '0', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 14px', background: t.headerBg, borderBottom: `1px solid ${t.border}`, borderRight: `1px solid ${t.border}`, fontSize: '12px', color: t.textMuted, width: '25%' }}>
                    {xAxisLabel}
                  </th>
                  {seriesNames.map((series, i) => (
                    <th key={i} style={{ padding: '10px 14px', background: t.headerBg, borderBottom: `1px solid ${t.border}`, borderRight: i < seriesNames.length - 1 ? `1px solid ${t.border}` : 'none', fontSize: '12px', color: t.textMuted }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: seriesColors[i % seriesColors.length] }} />
                        {series}
                      </div>
                    </th>
                  ))}
                  <th style={{ padding: '10px', background: t.headerBg, borderBottom: `1px solid ${t.border}`, width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={row.id || rIdx} style={{ borderBottom: `1px solid ${t.border}` }}>
                    <td style={{ padding: '0', borderRight: `1px solid ${t.border}` }}>
                      <input
                        type="text"
                        value={row.label || ''}
                        onChange={(e) => updateLabel(rIdx, e.target.value)}
                        disabled={!!lockedBy}
                        onFocus={() => { setIsFocused(true); if (onFocus) onFocus(block.id); }}
                        onBlur={() => { setIsFocused(false); if (onBlur) onBlur(block.id); }}
                        style={{ width: '100%', border: 'none', background: 'transparent', color: t.text, padding: '10px 14px', outline: 'none', fontSize: '13px', fontWeight: 600 }}
                        placeholder="Row Label"
                      />
                    </td>
                    {seriesNames.map((_, sIdx) => (
                      <td key={sIdx} style={{ padding: '0', borderRight: sIdx < seriesNames.length - 1 ? `1px solid ${t.border}` : 'none' }}>
                        <input
                          type="number"
                          value={(row.values || [])[sIdx] ?? ''}
                          onChange={(e) => updateValue(rIdx, sIdx, e.target.value)}
                          disabled={!!lockedBy}
                          onFocus={() => { setIsFocused(true); if (onFocus) onFocus(block.id); }}
                          onBlur={() => { setIsFocused(false); if (onBlur) onBlur(block.id); }}
                          style={{ width: '100%', border: 'none', background: 'transparent', color: t.text, padding: '10px 14px', outline: 'none', fontSize: '13px', fontFamily: 'monospace' }}
                          placeholder="0"
                        />
                      </td>
                    ))}
                    <td style={{ padding: '0', textAlign: 'center' }}>
                      <button
                        onClick={() => deleteRow(rIdx)}
                        disabled={!!lockedBy}
                        style={{ background: 'none', border: 'none', color: t.textMuted, cursor: lockedBy ? 'not-allowed' : 'pointer', padding: '8px' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {block.allowAddRows !== false && (
              <div style={{ padding: '10px' }}>
                <button
                  onClick={addRow}
                  disabled={!!lockedBy}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', padding: '8px', background: 'transparent', border: `1px dashed ${t.border}`, borderRadius: '6px', color: t.textMuted, fontSize: '12px', fontWeight: 600, cursor: lockedBy ? 'not-allowed' : 'pointer' }}
                >
                  <Plus size={14} /> Add Row
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── CHART TAB ── */}
        {activeTab === 'chart' && (
          <div style={{ padding: '24px', width: '100%', height: isMultiPie ? 'auto' : '350px' }}>
            {isMultiPie
              ? renderChart()
              : (
                <ResponsiveContainer width="100%" height="100%">
                  {renderChart()}
                </ResponsiveContainer>
              )
            }
          </div>
        )}
      </div>
    </BlockWrapper>
  );
}