import React from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import BlockWrapper from './BlockWrapper.jsx';
import BlockRegistry from './BlockRegistry.jsx';

export default function RepeatingBlockSet({
  block, value, onChange, lockedBy, onFocus, onBlur, isDark = true,
  excludedSections = [], customNames = {}
}) {
  // Value payload expects: { instances: [ { _setId: '123', name: '...', sub_table_1: {...} } ] }
  const val = value || { instances: [] };
  const instances = val.instances || [];
  const subBlocks = block.blocks || [];

  const t = {
    bg:          isDark ? 'rgba(255,255,255,0.03)'  : '#ffffff',
    border:      isDark ? 'rgba(255,255,255,0.08)'  : '#e5e7eb',
    text:        isDark ? '#e2e8f0'                 : '#111827',
    textMuted:   isDark ? '#94a3b8'                 : '#6b7280',
    accent:      '#ef4444',
    cardBg:      isDark ? 'rgba(255,255,255,0.015)' : '#f8fafc',
  };

  const genId = () => `set_${Date.now()}_${Math.random().toString(36).substr(2,6)}`;

  const addSet = () => {
    const nextInstances = [...instances, { _setId: genId(), name: '' }];
    onChange(block.dataPath, { ...val, instances: nextInstances });
  };

  const removeSet = (idx) => {
    const nextInstances = instances.filter((_, i) => i !== idx);
    onChange(block.dataPath, { ...val, instances: nextInstances });
  };

  const updateInstanceName = (idx, newName) => {
    const nextInstances = [...instances];
    nextInstances[idx] = { ...nextInstances[idx], name: newName };
    onChange(block.dataPath, { ...val, instances: nextInstances });
  };

  const handleSubBlockChange = (idx, childPath, childVal) => {
    const nextInstances = [...instances];
    nextInstances[idx] = { ...nextInstances[idx], [childPath]: childVal };
    onChange(block.dataPath, { ...val, instances: nextInstances });
  };

  return (
    <BlockWrapper block={block} lockedBy={lockedBy} isDark={isDark}>


      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {instances.map((instance, idx) => (
          <div key={instance._setId || idx} style={{ 
            background: t.cardBg, 
            border: `1px solid ${t.border}`, 
            borderRadius: '8px', 
            padding: '16px' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: `1px solid ${t.border}`, paddingBottom: '8px' }}>
              
              {/* EDITABLE SET NAME */}
              <input
                value={instance.name ?? ''}
                onChange={e => updateInstanceName(idx, e.target.value)}
                placeholder={`Set #${idx + 1}`}
                disabled={!!lockedBy}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid transparent',
                  outline: 'none',
                  color: t.accent,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  padding: '2px 4px 2px 0',
                  width: '100%',
                  maxWidth: '300px',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => { 
                  e.currentTarget.style.borderBottomColor = t.accent; 
                  if(onFocus) onFocus(block.id); 
                }}
                onBlur={(e) => { 
                  e.currentTarget.style.borderBottomColor = 'transparent'; 
                  if(onBlur) onBlur(block.id); 
                }}
              />

              {!lockedBy && (
                <button onClick={() => removeSet(idx)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0.6}
                >
                  <Trash2 size={14} /> Remove Set
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {subBlocks
                .filter(subConfig => !excludedSections.includes(subConfig.id))
                .map((subConfig, subIdx) => {
                const subValue = instance[subConfig.dataPath] || '';
                return (
                  <BlockRegistry
                    key={subConfig.id || subIdx}
                    block={{ ...subConfig, label: customNames[subConfig.id] || subConfig.label }}
                    value={subValue}
                    onChange={(childPath, childVal) => handleSubBlockChange(idx, childPath, childVal)}
                    lockedBy={lockedBy}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    isDark={isDark}
                    excludedSections={excludedSections}
                    customNames={customNames}
                  />
                );
              })}
              {subBlocks.filter(subConfig => !excludedSections.includes(subConfig.id)).length === 0 && (
                <div style={{ color: t.textMuted, fontSize: '0.8rem', textAlign: 'center', padding: '10px' }}>
                  No visible blocks in this set.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {!lockedBy && (
        <button onClick={addSet}
          style={{
            marginTop: '16px', width: '100%', padding: '10px',
            borderRadius: '8px', border: `1px dashed ${t.border}`,
            background: 'transparent', color: t.textMuted,
            fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.color = t.accent; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.textMuted; }}
        >
          <Plus size={14} /> {block.addLabel || 'Add Set'}
        </button>
      )}

    </BlockWrapper>
  );
}