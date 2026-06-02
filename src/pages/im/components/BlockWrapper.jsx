import React, { useState, useEffect, useRef } from 'react';
import { Lock, MessageSquare } from 'lucide-react';

export default function BlockWrapper({ block, lockedBy, children, isDark = true }) {
  const [isFocused, setIsFocused]   = useState(false);
  const [saveFlash, setSaveFlash]   = useState(false);
  const [isHovered, setIsHovered]   = useState(false);
  const prevChildren                = useRef(null);
  const flashTimer                  = useRef(null);
  const isLocked                    = Boolean(lockedBy);

  const isInstruction = block?.type === 'instruction' || block?.type === 'fixed-text' || block?.type === 'h3' || block?.type === 'h4';

  // ── THEME ──────────────────────────────────────────────────────────────────
  const T = {
    surface:     isDark ? '#0d1117'                      : '#ffffff',
    surface2:    isDark ? 'rgba(255,255,255,0.03)'       : '#f8fafc',
    border:      isDark ? 'rgba(255,255,255,0.07)'       : 'rgba(0,0,0,0.09)',
    borderFocus: 'rgba(239,68,68,0.45)',
    borderSave:  'rgba(16,185,129,0.6)',
    borderLock:  'rgba(245,158,11,0.45)',
    glow:        'rgba(239,68,68,0.08)',
    glowSave:    'rgba(16,185,129,0.07)',
    glowLock:    'rgba(245,158,11,0.07)',
    text:        isDark ? '#e2e8f0'                      : '#0f172a',
    textMuted:   isDark ? '#64748b'                      : '#94a3b8',
    accent:      '#ef4444',
    amber:       '#f59e0b',
    shadow:      isDark ? '0 2px 12px rgba(0,0,0,0.3)'  : '0 2px 12px rgba(0,0,0,0.06)',
    shadowHover: isDark ? '0 8px 28px rgba(0,0,0,0.45)' : '0 8px 28px rgba(0,0,0,0.1)',
  };

  // ── SAVE FLASH — trigger on children data change ───────────────────────────
  // Expose a triggerSave method via a custom event so blocks can fire it
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.blockId !== block?.id) return;
      clearTimeout(flashTimer.current);
      setSaveFlash(true);
      flashTimer.current = setTimeout(() => setSaveFlash(false), 700);
    };
    window.addEventListener('im-block-saved', handler);
    return () => window.removeEventListener('im-block-saved', handler);
  }, [block?.id]);

  // ── DYNAMIC BORDER & SHADOW ────────────────────────────────────────────────
  const getBorder = () => {
    if (isLocked)    return `1px solid ${T.borderLock}`;
    if (saveFlash)   return `1px solid ${T.borderSave}`;
    if (isFocused)   return `1px solid ${T.borderFocus}`;
    return `1px solid ${T.border}`;
  };

  const getBoxShadow = () => {
    if (isLocked)    return `${T.shadowHover}, 0 0 0 3px ${T.glowLock}`;
    if (saveFlash)   return `${T.shadow}, 0 0 0 3px ${T.glowSave}`;
    if (isFocused)   return `${T.shadow}, 0 0 0 3px ${T.glow}`;
    if (isHovered)   return T.shadowHover;
    return T.shadow;
  };

  // ── INSTRUCTION / HEADING BLOCKS — minimal styling ─────────────────────────
  if (isInstruction) {
    return (
      <div style={{ marginBottom: '8px' }}>
        {children}
      </div>
    );
  }

return (
    <div
      className={`block-wrapper ${isFocused ? 'focused' : ''} ${saveFlash ? 'save-flash' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={() => setIsFocused(false)}
      data-block-label={block?.label || block?.type || 'General Context'}
      data-block-path={block?.dataPath || block?.id || 'global'}
      style={{
        position:     'relative',
        marginBottom: '20px',
        borderRadius: '12px',
        background:   T.surface,
        border:       getBorder(),
        boxShadow:    getBoxShadow(),
        transform:    isHovered && !isLocked ? 'translateY(-1px)' : 'translateY(0)',
        transition:   'border 0.2s ease, box-shadow 0.25s ease, transform 0.2s ease',
        fontFamily:   '"Inter", sans-serif',
        overflow:     'hidden',
      }}
    >
      {/* ── FOCUS ACCENT BAR — top edge red line when editing ─────────────── */}
      <div style={{
        position:   'absolute',
        top:        0, left: 0, right: 0,
        height:     '2px',
        background: saveFlash
          ? 'linear-gradient(90deg, #10b981, #34d399)'
          : isFocused
          ? 'linear-gradient(90deg, #ef4444, #f97316)'
          : isLocked
          ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
          : 'transparent',
        transition: 'background 0.3s ease',
        borderRadius: '12px 12px 0 0',
      }} />

      {/* ── BLOCK HEADER ──────────────────────────────────────────────────── */}
      {(block?.label || block?.desc) && (
        <div style={{
          padding:         '14px 18px 0 18px',
          display:         'flex',
          justifyContent:  'space-between',
          alignItems:      'center',
          marginBottom:    '10px',
        }}>
          {/* Label with required dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            {block?.required && (
              <div style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: T.accent, flexShrink: 0,
                boxShadow: `0 0 6px ${T.accent}`,
              }} />
            )}
            <label style={{
              fontSize:      '10.5px',
              fontWeight:    800,
              color:         isFocused ? T.text : T.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '1.2px',
              transition:    'color 0.2s ease',
              cursor:        'default',
            }}>
              {block.label}
            </label>
          </div>

          </div>
      )}

      {/* ── CONTENT ───────────────────────────────────────────────────────── */}
      <div style={{
        padding:       block?.label ? '6px 18px 16px 18px' : '16px 18px',
        opacity:       isLocked ? 0.25 : 1,
        pointerEvents: isLocked ? 'none' : 'auto',
        transition:    'opacity 0.25s ease',
      }}>
        {children}
      </div>

      {/* ── LOCK OVERLAY ──────────────────────────────────────────────────── */}
      {isLocked && (
        <div style={{
          position:       'absolute',
          inset:          0,
          zIndex:         50,
          borderRadius:   '12px',
          background:     isDark
            ? 'rgba(8, 12, 20, 0.55)'
            : 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(4px)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            '10px',
        }}>
          {/* Avatar circle */}
          <div style={{
            width:          '30px', height: '30px',
            borderRadius:   '50%',
            background:     'linear-gradient(135deg, #f59e0b, #d97706)',
            display:        'flex', alignItems: 'center', justifyContent: 'center',
            fontSize:       '12px', fontWeight: 800, color: '#fff',
            boxShadow:      '0 0 0 2px rgba(245,158,11,0.3)',
          }}>
            {lockedBy.email.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: T.amber }}>
              {lockedBy.email.split('@')[0]}
            </div>
            <div style={{ fontSize: '10px', color: T.textMuted, marginTop: '1px' }}>
              is editing this field
            </div>
          </div>
        </div>
      )}

      {/* ── SAVE FLASH KEYFRAME STYLES ─────────────────────────────────────── */}
      <style>{`
        @keyframes saveFlashAnim {
          0%   { opacity: 1; }
          50%  { opacity: 0.6; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
