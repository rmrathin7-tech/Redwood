import React, { useState, useEffect } from 'react';
import { ArrowLeft, MessageSquare, Save, Loader2, AlertTriangle, Building2, Sun, Moon, Printer, User, Maximize2, FileText } from 'lucide-react';
import { useProfilingEditor } from '../hooks/useProfilingEditor';

// ── DIRECTLY IMPORTING IM BLOCKS FOR 100% FEATURE PARITY ──
import RichTextBlock from '../../im/components/RichTextBlock';

export default function ProfilingEditor({ projectId, taskId, onClose, currentUserEmail, isDark: globalDark }) {
  const { taskData, loading, saving, saveContent, forceUnlock } = useProfilingEditor(projectId, taskId, currentUserEmail);
  const [editorDark, setEditorDark] = useState(true);
  
  // ── DOM Highlight Scroll Bridge ──
  useEffect(() => {
    const handleJumpToComment = (e) => {
      const { commentId, dataPath } = e.detail;
      
      // 1. Force the block to expand if it is collapsed
      window.dispatchEvent(new CustomEvent('im-focus-block', { detail: { dataPath: dataPath || 'profiling-content' } }));

      // 2. Retry loop to wait for React to physically render the expanded block
      let attempts = 0;
      const tryScroll = () => {
        const exactSpan = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (exactSpan) {
          exactSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          const originalBg = exactSpan.style.backgroundColor;
          exactSpan.style.transition = 'background-color 0.3s ease';
          exactSpan.style.backgroundColor = 'rgba(245, 158, 11, 0.6)';
          setTimeout(() => { exactSpan.style.backgroundColor = originalBg; }, 600);
          
          // Force continuous scroll events so the SVG string follows the text as it moves
          let frames = 0;
          const animateScroll = () => {
            window.dispatchEvent(new Event('scroll', { bubbles: true }));
            if (++frames < 45) requestAnimationFrame(animateScroll);
          };
          animateScroll();
        } else if (attempts < 8) {
          attempts++;
          setTimeout(tryScroll, 50); // Try again in 50ms
        }
      };
      
      setTimeout(tryScroll, 10);
    };

    window.addEventListener('im-jump-to-comment', handleJumpToComment);
    return () => window.removeEventListener('im-jump-to-comment', handleJumpToComment);
  }, []);

  if (loading || !taskData) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={32} className="animate-spin" color="#ec4899" /></div>;

  // ── AUTO-PRESENCE ENGINE ──
  const activeEditor = taskData.activeEditor || null;
  const isLockedByOther = activeEditor && activeEditor !== currentUserEmail;
  const isReadOnly = isLockedByOther || taskData.status === 'in review' || taskData.status === 'completed';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: globalDark ? 'transparent' : '#f0f4f8' }}>
      
      <header style={{ height: 64, flexShrink: 0, background: editorDark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.9)', borderBottom: `1px solid ${editorDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onClose} style={{ background: editorDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', border: `1px solid ${editorDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, borderRadius: 8, padding: 8, color: editorDark ? '#fff' : '#000', cursor: 'pointer', display: 'flex' }}><ArrowLeft size={18} /></button>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: editorDark ? '#f8fafc' : '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={18} color="#ec4899" /> {taskData.companyName}
            </h2>
            <span style={{ fontSize: 12, color: editorDark ? '#94a3b8' : '#64748b' }}>Status: <strong style={{ color: editorDark ? '#cbd5e1' : '#334155', textTransform: 'capitalize' }}>{taskData.status}</strong></span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => setEditorDark(!editorDark)} style={{ background: 'transparent', border: `1px solid ${editorDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, borderRadius: '50%', padding: 8, color: editorDark ? '#94a3b8' : '#64748b', cursor: 'pointer', display: 'flex', transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)' }} onMouseEnter={e => e.currentTarget.style.background = editorDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} title="Toggle Document Theme">
            {editorDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button onClick={() => window.dispatchEvent(new CustomEvent('profiling-open-print', { detail: { taskId } }))} style={{ background: 'transparent', border: `1px solid ${editorDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, borderRadius: '50%', padding: 8, color: editorDark ? '#94a3b8' : '#64748b', cursor: 'pointer', display: 'flex', transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(236,72,153,0.1)'; e.currentTarget.style.color = '#ec4899'; e.currentTarget.style.borderColor = 'rgba(236,72,153,0.3)'; e.currentTarget.style.boxShadow = '0 0 12px rgba(236,72,153,0.2)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = editorDark ? '#94a3b8' : '#64748b'; e.currentTarget.style.borderColor = editorDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'; e.currentTarget.style.boxShadow = 'none'; }} title="Print Profile">
            <Printer size={16} />
          </button>

          <div style={{ width: 1, height: 24, background: editorDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', margin: '0 4px' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: saving ? '#ec4899' : (editorDark ? '#94a3b8' : '#64748b'), fontWeight: 600 }}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving</> : <><Save size={14} /> Saved</>}
          </div>

{isLockedByOther ? (
            <button 
              onClick={forceUnlock}
              title="Click to forcefully take over the document lock"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b', borderRadius: 8, fontSize: 12, fontWeight: 700, animation: 'fadeIn 0.3s ease', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.2)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.1)'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <User size={14} /> Locked by {activeEditor.split('@')[0]} (Click to Take Over)
            </button>
          ) : isReadOnly ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: 8, fontSize: 12, fontWeight: 700, animation: 'fadeIn 0.3s ease' }}>
              <AlertTriangle size={14} /> Read-Only
            </div>
          ) : null}

          <button onClick={() => window.dispatchEvent(new CustomEvent('im-open-comments-sidebar'))} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(236,72,153,0.35)', transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)', marginLeft: 8 }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(236,72,153,0.5)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(236,72,153,0.35)'; }}>
            <MessageSquare size={16} /> Comments
          </button>
        </div>
      </header>

      <main id="profiling-canvas" style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px' }}>
        
        {/* ── SEAMLESS EDITOR CANVAS ── */}
        <div style={{ width: '100%', maxWidth: 900, position: 'relative', padding: '0 20px', animation: 'fadeIn 0.3s ease' }}>
          
          {/* Reusing the exact IM Rich Text Block */}
          <RichTextBlock 
            block={{ id: 'profiling-content', dataPath: 'profiling-content', label: 'Profiling Data' }}
            value={taskData.content || ''}
            onChange={(path, val) => saveContent(val)}
            lockedBy={isLockedByOther ? activeEditor : (isReadOnly ? 'System' : null)}
            isDark={editorDark}
            placeholder="Start drafting profiling brief here..."
          />
        </div>
      </main>

    </div>
  );
}
