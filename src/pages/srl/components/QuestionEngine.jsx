import React, { useMemo } from 'react';
import { MessageSquare, PlaySquare, UploadCloud } from 'lucide-react';

export default function QuestionEngine({ question, responseData = {}, updateResponse, viewMode, isDark = true }) {
  const T = useMemo(() => ({
    bg:         isDark ? '#060910' : '#f1f5f9',
    surface2:   isDark ? '#161b22' : '#f8fafc',
    border:     isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    text:       isDark ? '#f1f5f9' : '#0f172a',
    textMuted:  isDark ? '#64748b' : '#94a3b8',
    accent:     '#3b82f6',
  }), [isDark]);

  // Handle saving data to Firebase
  const handleChange = (field, value, event = null) => {
    if (event) {
      event.target.style.height = 'auto';
      event.target.style.height = `${event.target.scrollHeight}px`;
    }
    updateResponse(question.id, field, value);
  };

  if (viewMode === 'client') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
<textarea
          placeholder="Provide your detailed answer here..."
          value={responseData.clientResponse || ''}
          onChange={(e) => handleChange('clientResponse', e.target.value, e)}
          style={{ width: '100%', minHeight: '120px', padding: '14px', borderRadius: '8px', background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '0.9rem', outline: 'none', resize: 'none', overflow: 'hidden', fontFamily: 'inherit' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: T.surface2, border: `1px dashed ${T.textMuted}`, color: T.textMuted, borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
            <UploadCloud size={14} /> Upload Supporting Data
          </button>
          <span style={{ fontSize: '0.7rem', color: T.textMuted }}>Max 10MB per file (PDF, Excel, Images)</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Reference Data Areas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>
            <MessageSquare size={12} /> Response on Mail / Portal
          </label>
         <textarea
            value={responseData.mailResponse || ''}
            onChange={(e) => handleChange('mailResponse', e.target.value, e)}
            placeholder="Data provided via intake forms..."
            style={{ width: '100%', minHeight: '80px', padding: '12px', borderRadius: '6px', background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '0.85rem', resize: 'none', overflow: 'hidden' }}
          />
        </div>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>
            <PlaySquare size={12} /> Response on FC Call
          </label>
          <textarea
            value={responseData.callResponse || ''}
            onChange={(e) => handleChange('callResponse', e.target.value, e)}
            placeholder="Notes from analyst interview..."
            style={{ width: '100%', minHeight: '80px', padding: '12px', borderRadius: '6px', background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '0.85rem', resize: 'none', overflow: 'hidden' }}
          />
        </div>
      </div>

      {/* Analyst Scoring Area */}
      <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          
          <div style={{ flex: 1, paddingRight: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: T.accent, textTransform: 'uppercase', marginBottom: '6px' }}>Evaluation Notes</label>
            <textarea
              value={responseData.evalNotes || ''}
              onChange={(e) => handleChange('evalNotes', e.target.value, e)}
              placeholder="Analyst deductions based on provided data..."
              style={{ width: '100%', minHeight: '60px', padding: '10px', borderRadius: '6px', background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '0.85rem', resize: 'none', overflow: 'hidden' }}
            />
          </div>

          {question.type !== 'no-score' && (
            <div style={{ width: '180px', flexShrink: 0, borderLeft: `1px solid ${T.border}`, paddingLeft: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '6px' }}>Assigned Score</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number" min="0" max={question.maxScore} step="0.5"
                  value={responseData.score || ''}
                  onChange={(e) => handleChange('score', parseFloat(e.target.value) || 0)}
                  style={{ width: '80px', padding: '8px', borderRadius: '6px', background: T.bg, border: `2px solid ${T.accent}`, color: T.text, fontSize: '1rem', fontWeight: 800, textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.85rem', color: T.textMuted, fontWeight: 600 }}>/ {question.maxScore}</span>
              </div>
              <div style={{ marginTop: '12px', fontSize: '0.65rem', color: T.textMuted, lineHeight: 1.4, background: T.bg, padding: '8px', borderRadius: '4px', border: `1px dashed ${T.border}` }}>
                <strong>Basis:</strong> {question.scoringBasis}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}