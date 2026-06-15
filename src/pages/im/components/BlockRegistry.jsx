import React from 'react';
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

export default function BlockRegistry({
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
}