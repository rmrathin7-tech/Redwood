import React, { memo } from 'react';
import BasicInputBlock from './BasicInputBlock';
import RichTextBlock from './RichTextBlock';
import SmartTableBlock from './SmartTableBlock';
import RepeatingGroupBlock from './RepeatingGroupBlock';
import RepeatingBlockSet from './RepeatingBlockSet'; 
import ConditionalSwitcherBlock from './ConditionalSwitcherBlock';
import ChartBlock from './ChartBlock';
import FSALinkBlock from './FSALinkBlock';

// Layout-only block types (no data, no wrapper needed)
const LAYOUT_TYPES = ['h3', 'h4', 'divider'];

const BlockRegistry = memo(function BlockRegistry({
  block, value, onChange, lockedBy, onFocus, onBlur, isDark, excludedSections, customNames, activeSection, projectId
}) {
  if (!block || !block.type) return null;

  // ── Layout blocks (headings, dividers) ────────────────────────────────────
  if (block.type === 'h3') {
    return (
      <h3 style={{
        fontSize: '1.1rem', fontWeight: 800, margin: '32px 0 16px',
        color: isDark ? '#f3f4f6' : '#111827',
        paddingBottom: '10px',
        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb'}`,
      }}>
        {block.label}
      </h3>
    );
  }
  if (block.type === 'h4') {
    return (
      <h4 style={{
        fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '1px', margin: '24px 0 12px',
        color: isDark ? '#94a3b8' : '#6b7280',
      }}>
        {block.label}
      </h4>
    );
  }
  if (block.type === 'divider') {
    return <hr style={{ border: 'none', borderTop: `1px dashed ${isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb'}`, margin: '32px 0' }} />;
  }

  // ── Data blocks ───────────────────────────────────────────────────────────
  // Added projectId to commonProps so it filters down securely to FSALinkBlock
  const commonProps = { block, value, onChange, lockedBy, onFocus, onBlur, isDark, excludedSections, customNames, projectId };

  switch (block.type) {
    case 'quill':
      // Forcefully pass down activeSection to link operations board comments natively
      return <RichTextBlock {...commonProps} activeSection={activeSection} />;

    case 'table':
    case 'table-static':
    case 'table-repeating':
      return <SmartTableBlock {...commonProps} />;

    case 'repeating-group':
      return <RepeatingGroupBlock {...commonProps} />;

    case 'repeating-block-set':                
      return <RepeatingBlockSet {...commonProps} />;

    case 'conditional-switch':
      return <ConditionalSwitcherBlock {...commonProps} />;

    case 'chart':                              
      return <ChartBlock {...commonProps} />;

    case 'fsa-link':
      return <FSALinkBlock {...commonProps} />;

    // All simple field types go to BasicInputBlock
    case 'instruction':
    case 'fixed-text':
    case 'text':
    case 'textarea':
    case 'mixed':
    case 'date':
    case 'dropdown':
    case 'select':
    case 'boolean':
    case 'compliance':
    case 'image':
    case 'file':
    default:
      return <BasicInputBlock {...commonProps} />;
  }
}, (prev, next) => {
  // ── TITANIUM RENDER SHIELD (Blocks Render Cascades) ──
  
  // 1. Check basic UI and identity props
  if (prev.block?.id !== next.block?.id) return false;
  if (prev.lockedBy !== next.lockedBy) return false;
  if (prev.isDark !== next.isDark) return false;
  if (prev.activeSection !== next.activeSection) return false;
  if (prev.projectId !== next.projectId) return false;

  // 2. Safely deep-compare the block's specific value
  const valEqual = prev.value === next.value || JSON.stringify(prev.value) === JSON.stringify(next.value);
  if (!valEqual) return false;

  // 3. Safely deep-compare context arrays/objects
  const exclEqual = prev.excludedSections === next.excludedSections || JSON.stringify(prev.excludedSections) === JSON.stringify(next.excludedSections);
  if (!exclEqual) return false;

  const customEqual = prev.customNames === next.customNames || JSON.stringify(prev.customNames) === JSON.stringify(next.customNames);
  if (!customEqual) return false;

  // If we reach here, the block's specific data has not changed. 
  // We block the render cascade entirely!
  return true;
});

export default BlockRegistry;