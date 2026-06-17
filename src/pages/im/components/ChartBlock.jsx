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
  const [activeTab, setActiveTab] = useState('chart'); // Default to chart view
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
  
  // Chart type reads from the live workspace value first, falls back to block default
  const chartType = value?.chartType || block.chartType || 'bar';

  // ── FORMATTER ────────────────────────────────────────────────────────────
  const formatValue = useCallback((val, curr = '', mag = '') => {
    if (val === null || val === undefined) return '';
    let formattedNum = val;
    if (!mag && Number(val) >= 1000) {
      formattedNum = `${(Number(val) / 1000).toFixed(1)}k`;
    } else {
      formattedNum = Number(val).toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    return `${curr}${formattedNum}${mag ? ` ${mag}` : ''}`;
  }, []);

  const formatAxisValue = useCallback((val) => {
    if (val >= 1000000000) return `${(val / 1000000000).toFixed(1)}B`;
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    return val;
  }, []);

  // ── DATA MANAGEMENT ──────────────────────────────────────────────────────
  const rows = value?.rows || [];

  useEffect(() => {
    if (!value || !value.rows || value.rows.length === 0) {
      const hasLabels = block.rowLabels && block.rowLabels.length > 0;
      const count = hasLabels ? block.rowLabels.length : Math.max(1, block.baseRowCount || 1);
      const defaultRows = Array.from({ length: count }, (_, i) => ({
        id: `r${i + 1}`,
        label: hasLabels ? block.rowLabels[i] : `Item ${i + 1}`,
        currency: '',
        magnitude: '',
        values: seriesNames.map(() => 0),
      }));
      if (onChange) onChange(block.dataPath, { rows: defaultRows, chartType: block.chartType || 'bar' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, block.dataPath]);

  const save = useCallback((newRows) => {
    if (onChange) onChange(block.dataPath, { ...value, rows: newRows });
  }, [onChange, block.dataPath, value]);

  const updateLabel = (rIdx, newLabel) => {
    const next = [...rows];
    next[rIdx] = { ...next[rIdx], label: newLabel };
    save(next);
  };

  const updateFormat = (rIdx, key, val) => {
    const next = [...rows];
    next[rIdx] = { ...next[rIdx], [key]: val };
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
      { id: crypto.randomUUID().slice(0, 6), label: 'New Item', currency: '', magnitude: '', values: seriesNames.map(() => 0) }
    ];
    save(next);
  };

  const deleteRow = (rIdx) => {
    const next = rows.filter((_, i) => i !== rIdx);
    save(next);
  };

  // ── CHART DATA TRANSFORM ─────────────────────────────────────────────────
  const chartData = rows.map(r => {
    const dataObj = { 
      name: r.label || 'Unnamed', 
      currency: r.currency || '', 
      magnitude: r.magnitude || '' 
    };
    seriesNames.forEach((series, i) => {
      dataObj[series] = Number((r.values || [])[i]) || 0;
    });
    return dataObj;
  });

  const getPieColors = () => {
    if (block.pieColors && block.pieColors.length > 0) {
      return block.pieColors.map(c => c.startsWith('#') ? c : `#${c}`);
    }
    return DEFAULT_COLORS;
  };

  // ── DYNAMIC CHART RENDERER ───────────────────────────────────────────────
  const renderChart = () => {
    if (!chartData || chartData.length === 0) return null;

// ── NESTED CIRCLE (TAM/SAM/SOM) ──
    if (chartType === 'nested-circle') {
      const seriesKey = seriesNames[0]; 
      
      const sortedData = [...chartData]
        .map(d => ({ ...d, value: Number(d[seriesKey]) || 0 }))
        .sort((a, b) => b.value - a.value);

      if (sortedData.length === 0) return null;

      const size = 350; 
      const center = size / 2;
      
      const maxRadius = center - 20; 
      const bottomY = center + maxRadius; 
      const colors = getPieColors();

      // Infographic spacing: forces even gaps and ensures the smallest circle is at least 35% of the total size
      const minScale = 0.35;
      const scaleStep = (1 - minScale) / Math.max(1, sortedData.length - 1);

      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '350px' }}>
          <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="xMidYMid meet">
            {sortedData.map((data, index) => {
              // Bypass pure mathematical area scaling for standard presentation spacing
              const radius = maxRadius * (1 - (index * scaleStep));
              const color = colors[index % colors.length];
              const cy = bottomY - radius;

               return (
                <g key={data.name}>
                  <circle
                    cx={center}
                    cy={cy}
                    r={radius}
                    fill={color}
                    fillOpacity={0.85}
                    stroke={t.bg}
                    strokeWidth="4"
                    style={{ transition: 'all 0.4s ease' }}
                  />
                  {radius > 20 && (
                    <g>
                      <text
                        x={center}
                        y={cy - radius + 24}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="13px"
                        fontWeight="800"
                        style={{ pointerEvents: 'none', textShadow: '0px 2px 4px rgba(0,0,0,0.6)' }}
                      >
                        {data.name}
                      </text>
                      <text
                        x={center}
                        y={cy - radius + 40}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="11px"
                        fontWeight="600"
                        style={{ pointerEvents: 'none', textShadow: '0px 2px 4px rgba(0,0,0,0.6)' }}
                      >
                        {formatValue(data.value, data.currency, data.magnitude)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      );
    }
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
                currency: r.currency || '',
                magnitude: r.magnitude || ''
              }));
              return (
                <div key={sIdx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    fontSize: '11px', fontWeight: 800, color: t.textMuted,
                    textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px'
                  }}>
                    {sName}
                  </div>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70} // Reduced to leave room for permanent labels
                        paddingAngle={2}
                        dataKey="value"
                        labelLine={{ stroke: t.textMuted, strokeWidth: 1 }}
                        label={({ name, percent, value, payload }) => `${name}: ${formatValue(value, payload.currency, payload.magnitude)}`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name, props) => {
                          const { currency, magnitude } = props.payload;
                          return [formatValue(value, currency, magnitude), name];
                        }}
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

      // Single series → single pie
      const pieSeriesIdx = block.pieSeriesIndex ?? 0;
      const pieData = rows.map((r, idx) => ({
        name: r.label || `Item ${idx + 1}`,
        value: Number((r.values || [])[pieSeriesIdx]) || 0,
        currency: r.currency || '',
        magnitude: r.magnitude || ''
      }));

      return (
        <PieChart margin={{ top: 20, right: 30, left: 30, bottom: 20 }}>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={95} // Reduced to leave room for permanent labels
            paddingAngle={2}
            dataKey="value"
            labelLine={{ stroke: t.textMuted, strokeWidth: 1 }}
            label={({ name, percent, value, payload }) => `${name}: ${formatValue(value, payload.currency, payload.magnitude)} (${(percent * 100).toFixed(0)}%)`}
          >
            {pieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name, props) => {
              const { currency, magnitude } = props.payload;
              return [formatValue(value, currency, magnitude), name];
            }}
            contentStyle={{ backgroundColor: t.bg, borderColor: t.border, borderRadius: '8px', color: t.text, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
            itemStyle={{ fontSize: '13px', fontWeight: 600 }}
          />
          {block.showLegend !== false && (
            <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', color: t.textMuted }} iconType="circle" />
          )}
        </PieChart>
      );
    }

    // ── BAR / LINE / AREA / HORIZONTAL BAR ──
    const isHorizontal = chartType === 'horizontal-bar';
    const ChartComponent = chartType === 'line' ? LineChart : chartType === 'area' ? AreaChart : BarChart;
    
    const commonProps = {
      data: chartData,
      layout: isHorizontal ? 'vertical' : 'horizontal',
      margin: { top: 10, right: 20, left: isHorizontal ? 30 : -20, bottom: 0 },
    };

    return (
      <ChartComponent {...commonProps}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.gridLine} horizontal={!isHorizontal} vertical={isHorizontal} />
        <XAxis
          type={isHorizontal ? 'number' : 'category'}
          dataKey={isHorizontal ? undefined : 'name'}
          tick={{ fill: t.textMuted, fontSize: 12 }}
          axisLine={isHorizontal ? false : { stroke: t.border }}
          tickLine={false}
          tickFormatter={isHorizontal ? formatAxisValue : undefined}
          dy={isHorizontal ? 0 : 10}
        />
        <YAxis
          type={isHorizontal ? 'category' : 'number'}
          dataKey={isHorizontal ? 'name' : undefined}
          tick={{ fill: t.textMuted, fontSize: 12 }}
          axisLine={isHorizontal ? { stroke: t.border } : false}
          tickLine={false}
          tickFormatter={isHorizontal ? undefined : formatAxisValue}
          width={isHorizontal ? 100 : 60}
        />
        <Tooltip
          formatter={(value, name, props) => {
            const { currency, magnitude } = props.payload;
            return [formatValue(value, currency, magnitude), name];
          }}
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
          // Flip the radius corners depending on orientation
          const radiusArr = isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
          return <Bar key={series} dataKey={series} fill={color} radius={radiusArr} maxBarSize={isHorizontal ? 40 : 60} />;
        })}
      </ChartComponent>
    );
  };

  const isMultiPie = chartType === 'pie' && seriesNames.length > 1;
  const isCustomSVG = chartType === 'nested-circle';

  // Select Dropdown Styles
  const selectStyle = {
    background: isDark ? 'rgba(0,0,0,0.2)' : '#f1f5f9', 
    color: t.text, 
    border: `1px solid ${t.border}`, 
    borderRadius: '6px', 
    padding: '4px 8px', 
    fontSize: '11px', 
    fontWeight: 600, 
    outline: 'none', 
    cursor: lockedBy ? 'not-allowed' : 'pointer'
  };
  const optionStyle = { background: t.bg, color: t.text };

  return (
    <BlockWrapper block={block} lockedBy={lockedBy} isDark={isDark}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px' }}>
        <div>
          {block.title && (
            <div style={{ fontSize: '16px', fontWeight: 700, color: t.text, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {block.title}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          
          {/* ── WORKSPACE CHART OVERRIDE ── */}
          <select 
            value={chartType} 
            onChange={(e) => onChange && onChange(block.dataPath, { ...value, chartType: e.target.value })}
            disabled={!!lockedBy}
            style={selectStyle}
          >
            <option value="bar" style={optionStyle}>Bar Chart</option>
            <option value="horizontal-bar" style={optionStyle}>Horizontal Bar</option>
            <option value="line" style={optionStyle}>Line Chart</option>
            <option value="area" style={optionStyle}>Area Chart</option>
            <option value="pie" style={optionStyle}>Pie Chart</option>
            <option value="nested-circle" style={optionStyle}>Nested Circles</option>
          </select>

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
                  <th style={{ padding: '10px 14px', background: t.headerBg, borderBottom: `1px solid ${t.border}`, borderRight: `1px solid ${t.border}`, fontSize: '12px', color: t.textMuted, width: '20%' }}>
                    Format
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
                    <td style={{ padding: '10px 14px', borderRight: `1px solid ${t.border}` }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <select 
                          value={row.currency || ''} 
                          onChange={(e) => updateFormat(rIdx, 'currency', e.target.value)}
                          disabled={!!lockedBy}
                          style={selectStyle}
                        >
                          <option value="" style={optionStyle}>Cur.</option>
                          <option value="$" style={optionStyle}>$</option>
                          <option value="₹" style={optionStyle}>₹</option>
                          <option value="€" style={optionStyle}>€</option>
                          <option value="£" style={optionStyle}>£</option>
                        </select>
                        <select 
                          value={row.magnitude || ''} 
                          onChange={(e) => updateFormat(rIdx, 'magnitude', e.target.value)}
                          disabled={!!lockedBy}
                          style={selectStyle}
                        >
                          <option value="" style={optionStyle}>Mag.</option>
                          <option value="k" style={optionStyle}>k</option>
                          <option value="Million" style={optionStyle}>M</option>
                          <option value="Billion" style={optionStyle}>B</option>
                        </select>
                      </div>
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
            {(isMultiPie || isCustomSVG)
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
