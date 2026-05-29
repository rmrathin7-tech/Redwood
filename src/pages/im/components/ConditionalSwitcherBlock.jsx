import React from 'react';
import BlockWrapper from './BlockWrapper';
import BlockRegistry from './BlockRegistry';
import { GitBranch, CheckCircle2 } from 'lucide-react';

export default function ConditionalSwitcherBlock({
  block, value, onChange, lockedBy, onFocus, onBlur, isDark = true
}) {
  // val typically looks like: { activeBranch: 'some-id', [branchId]: { ...data } }
  const val = value || { activeBranch: null };

  // Safely fallback and migrate legacy data format seamlessly to the new unlimited branches array
  // If block.branches exists, we use it. Otherwise, we synthesize it from old props for compatibility.
  const branches = block.branches || [
    { id: 'branchA', label: block.branchA_label || 'Option A', blocks: block.branchA_blocks || [], desc: block.branchA_desc },
    { id: 'branchB', label: block.branchB_label || 'Option B', blocks: block.branchB_blocks || [], desc: block.branchB_desc }
  ];

  const handleBranchSelect = (branchId) => {
    if (lockedBy) return;
    
    // We update the active branch key. 
    // We preserve existing data in other branches so toggling back and forth doesn't lose user input.
    if (!value) {
      onChange(block.dataPath, { activeBranch: branchId });
    } else {
      onChange(`${block.dataPath}.activeBranch`, branchId);
    }
  };

  const t = {
    bg:           isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
    border:       isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
    text:         isDark ? '#e2e8f0'                : '#111827',
    textMuted:    isDark ? '#94a3b8'                : '#6b7280',
    primary:      isDark ? '#3b82f6'                : '#2563eb',
    activeBg:     isDark ? 'rgba(59,130,246,0.15)'  : '#eff6ff',
    hoverBg:      isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
    activeBorder: isDark ? 'rgba(59,130,246,0.4)'   : '#bfdbfe',
  };

  const branchBtn = (branch) => {
    const isActive = val.activeBranch === branch.id;
    return (
      <button
        key={branch.id}
        onClick={() => handleBranchSelect(branch.id)}
        disabled={!!lockedBy}
        style={{
          flex: '1 1 200px', // Allow growth but keep a reasonable minimum width
          padding: '14px 18px',
          borderRadius: 10,
          border: `1px solid ${isActive ? t.activeBorder : t.border}`,
          background: isActive ? t.activeBg : t.bg,
          cursor: lockedBy ? 'not-allowed' : 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 4,
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          textAlign: 'left'
        }}
        onMouseEnter={e => { if(!lockedBy && !isActive) e.currentTarget.style.background = t.hoverBg; }}
        onMouseLeave={e => { if(!lockedBy && !isActive) e.currentTarget.style.background = t.bg; }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isActive ? t.primary : t.text }}>
            {branch.label}
          </span>
          {isActive && (
            <CheckCircle2 size={16} style={{ color: t.primary, flexShrink: 0 }} />
          )}
        </div>
        {branch.desc && (
          <span style={{ fontSize: '0.75rem', color: t.textMuted, lineHeight: 1.4 }}>
            {branch.desc}
          </span>
        )}
      </button>
    );
  };

  const activeBranchDef = branches.find(b => b.id === val.activeBranch);

  return (
    <BlockWrapper block={block} lockedBy={lockedBy} isDark={isDark}>
      {/* Question Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ background: t.activeBg, padding: 6, borderRadius: 6 }}>
          <GitBranch size={14} style={{ color: t.primary }} />
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
          {block.triggerQuestion || block.label || 'Configuration Required'}
        </span>
      </div>

      {/* Dynamic Branch Selector Grid */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {branches.map(b => branchBtn(b))}
      </div>

      {/* Nested Content Area */}
      {activeBranchDef && (
        <div style={{
          marginTop: 20,
          padding: '20px 0 0 20px',
          borderLeft: `2px solid ${t.border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          animation: 'imFadeIn 0.4s ease-out'
        }}>
          {activeBranchDef.blocks && activeBranchDef.blocks.length > 0 ? (
            activeBranchDef.blocks.map((subBlock) => {
              // Retrieve nested data for this specific branch
              // Path structure: dataPath.[branchId].[subBlockPath]
              const branchData = val[activeBranchDef.id] || {};
              const subValue = branchData[subBlock.dataPath];

              return (
                <BlockRegistry
                  key={subBlock.id}
                  block={subBlock}
                  value={subValue}
                  onChange={(childPath, updatedVal) => {
                    // Forward updates using a precise nested path
                    onChange(`${block.dataPath}.${activeBranchDef.id}.${childPath}`, updatedVal);
                  }}
                  lockedBy={lockedBy}
                  onFocus={onFocus}
                  onBlur={onBlur}
                  isDark={isDark}
                />
              );
            })
          ) : (
            <div style={{ 
              padding: '12px 16px', 
              borderRadius: 8, 
              background: isDark ? 'rgba(255,255,255,0.02)' : '#f9fafb',
              border: `1px dashed ${t.border}`,
              fontSize: '0.8rem',
              color: t.textMuted,
              fontStyle: 'italic'
            }}>
              No specific requirements for this selection.
            </div>
          )}
        </div>
      )}
    </BlockWrapper>
  );
}