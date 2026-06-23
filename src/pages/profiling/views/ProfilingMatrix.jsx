import React, { useMemo } from 'react';
import { ArrowRight, MessageSquare, CalendarClock, AlertTriangle, Building2, UserCheck, FileText, Edit3, Archive, Trash2 } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function ProfilingMatrix({ matrixTasks, COLUMNS, onOpenEditor, onUpdateField, workspaceUsers, comments, onOpenDetail, onEditTask, onDeleteTask, onArchiveTask, isDark }) {
  
  const T = useMemo(() => ({
    surface:    isDark ? '#0d1117' : '#ffffff',
    surface2:   isDark ? '#161b22' : '#f8fafc',
    surface3:   isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
    border:     isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    text:       isDark ? '#f1f5f9' : '#0f172a',
    textMuted:  isDark ? '#64748b' : '#94a3b8',
    accent:     '#ec4899',
  }), [isDark]);

  const getDueDateState = (dueDate) => {
    if (!dueDate) return { level: 'none', label: 'No due date', accent: T.textMuted, bg: 'transparent', border: T.border };
    const [year, month, day] = String(dueDate).split('-').map(Number);
    if (!year || !month || !day) return { level: 'none', label: dueDate, accent: T.textMuted, bg: 'transparent', border: T.border };
    
    const dueAt = new Date(year, month - 1, day, 23, 59, 59, 999);
    const now = new Date();
    const daysLeft = Math.ceil((dueAt.getTime() - now.getTime()) / DAY_MS);
    
    if (daysLeft < 0) return { level: 'overdue', label: `Overdue ${Math.abs(daysLeft)}d`, accent: '#ef4444', bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.45)' };
    if (daysLeft <= 2) return { level: 'warning', label: daysLeft === 0 ? 'Due today' : `Due in ${daysLeft}d`, accent: '#f59e0b', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.45)' };
    return { level: 'safe', label: `Due in ${daysLeft}d`, accent: '#10b981', bg: 'rgba(16,185,129,0.14)', border: 'rgba(16,185,129,0.45)' };
  };

  // FIX 1: Increased first column from 200px to 280px to give buttons more space
  const gridColumns = 'minmax(280px, 2.5fr) minmax(140px, 1fr) minmax(140px, 1fr) minmax(170px, 1.2fr) minmax(140px, 1fr) minmax(180px, 1.5fr)';

  return (
    <div style={{ padding: '0 0 40px', position: 'relative', height: '100%', overflowY: 'auto' }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '12px', boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 4px 20px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
        {/* Increased minWidth to prevent squishing */}
        <div style={{ minWidth: '1150px' }}>
          
          {/* Matrix Header */}
          <div style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: '16px', padding: '16px 24px', background: T.surface2, borderBottom: `1px solid ${T.border}`, fontSize: '0.7rem', fontWeight: 800, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
            <div>Target Company</div>
            <div>Assignee</div>
            <div>Reviewer</div>
            <div>Task Status</div>
            <div>Target Due</div>
            <div>Audit / Comments</div>
          </div>
          
          {/* Matrix Rows */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {matrixTasks.map(task => {
              const colDef = COLUMNS.find(c => c.id === task.status);
              const dueState = getDueDateState(task.dueDate);
              
              const assigneeUser = workspaceUsers.find(u => u.email === task.assignedTo);
              const reviewerUser = workspaceUsers.find(u => u.email === task.reviewer);

              const taskComments = (comments || []).filter(c => c.imId === task.id);
              const openComments = taskComments.filter(c => c.status !== 'resolved').length;
              const resolvedComments = taskComments.filter(c => c.status === 'resolved').length;
              const now = Date.now();
              const SLA_MS = 48 * 60 * 60 * 1000;
              const flaggedComments = taskComments.filter(c => c.status !== 'resolved' && (now - (c.createdAt?.toMillis ? c.createdAt.toMillis() : c.createdAt || now)) > SLA_MS).length;
              const hasComments = taskComments.length > 0;

              return (
                <div 
                  key={task.id}
                  style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: '16px', padding: '12px 24px', borderBottom: `1px solid ${T.border}`, alignItems: 'center', transition: 'all 0.2s', background: 'transparent' }} 
                  onMouseEnter={e => e.currentTarget.style.background = T.surface3} 
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  
                  {/* COLUMN 1: Company Name */}
                  {/* FIX 2: Added minWidth: 0 to allow the text to shrink and truncate instead of pushing buttons out */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <Building2 size={16} color={T.accent} style={{ flexShrink: 0 }} />
                    <button 
                      onClick={() => onOpenEditor(task.id)}
                      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}
                      title="Click to launch editor canvas"
                    >
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: T.text, transition: 'color 0.2s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} onMouseEnter={e => e.currentTarget.style.color = T.accent} onMouseLeave={e => e.currentTarget.style.color = T.text}>
                        {task.companyName}
                      </span>
                      <ArrowRight size={14} color={T.textMuted} style={{ marginLeft: '8px', opacity: 0.5, flexShrink: 0 }} />
                    </button>

                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      <button onClick={() => onEditTask(task)} title="Edit Task Config" style={{ background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = T.text; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted; }}><Edit3 size={15} /></button>
                      
                      <button onClick={() => onArchiveTask(task.id)} title="Archive Task" style={{ background: 'transparent', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.1)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}><Archive size={15} /></button>
                      
                      <button onClick={() => onDeleteTask(task.id)} title="Delete Task" style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}><Trash2 size={15} /></button>

                      <div style={{ width: 1, height: 16, background: T.border, margin: '0 4px' }} />

                      <button 
                        onClick={() => onOpenDetail(task)} 
                        title="Open Detailed Task View" 
                        style={{ background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)', border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'}`, color: T.text, cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 8px', transition: 'all 0.2s' }} 
                        onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)'; e.currentTarget.style.color = T.accent; e.currentTarget.style.borderColor = T.accent; }} 
                        onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'; e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'; }}
                      >
                        <FileText size={15} />
                      </button>
                    </div>        
                  </div>

                  {/* COLUMN 2: Assignee */}
                  <div>
                    <select 
                      className="glass-select"
                      value={assigneeUser?.userId || ''} 
                      onChange={(e) => onUpdateField(task.id, 'assignedTo', e.target.value)}
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', background: T.surface2, border: `1px solid ${T.border}`, color: assigneeUser ? T.text : T.textMuted, fontSize: '0.8rem', outline: 'none', cursor: 'pointer' }}
                    >
                      <option value="">Unassigned</option>
                      {workspaceUsers.map(u => <option key={u.userId} value={u.userId}>{u.email.split('@')[0]}</option>)}
                    </select>
                  </div>

                  {/* COLUMN 3: Reviewer */}
                  <div>
                    <select 
                      className="glass-select"
                      value={reviewerUser?.userId || ''} 
                      onChange={(e) => onUpdateField(task.id, 'reviewer', e.target.value)}
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', background: T.surface2, border: `1px solid ${T.border}`, color: reviewerUser ? T.text : T.textMuted, fontSize: '0.8rem', outline: 'none', cursor: 'pointer' }}
                    >
                      <option value="">No Reviewer</option>
                      {workspaceUsers.map(u => <option key={u.userId} value={u.userId}>{u.email.split('@')[0]}</option>)}
                    </select>
                  </div>

                  {/* COLUMN 4: Status */}
                  <div>
                    <select 
                      className="glass-select"
                      value={task.status} 
                      onChange={(e) => onUpdateField(task.id, 'status', e.target.value)}
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', background: colDef ? `${colDef.color}15` : T.surface2, border: colDef ? `1px solid ${colDef.color}40` : `1px solid ${T.border}`, color: colDef ? colDef.color : T.text, fontSize: '0.8rem', fontWeight: 700, outline: 'none', cursor: 'pointer' }}
                    >
                      {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>

                  {/* COLUMN 5: Target Due */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input
                      type="date"
                      value={task.dueDate || ''}
                      onChange={(e) => onUpdateField(task.id, 'dueDate', e.target.value)}
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', background: T.surface2, border: `1px solid ${T.border}`, color: T.text, fontSize: '0.78rem', outline: 'none' }}
                    />
                    {task.dueDate && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content', padding: '2px 8px', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700, color: dueState.accent, background: dueState.bg, border: `1px solid ${dueState.border}` }}>
                        {dueState.level === 'warning' || dueState.level === 'overdue' ? <AlertTriangle size={10} /> : <CalendarClock size={10} />}
                        {dueState.label}
                      </div>
                    )}
                  </div>

                  {/* COLUMN 6: Audit / Comments Deep Link */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {hasComments ? (
                      <button 
                        onClick={() => {
                          onOpenEditor(task.id);
                          setTimeout(() => window.dispatchEvent(new CustomEvent('im-open-comments-sidebar')), 100);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s', width: 'max-content' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = T.textMuted}
                        onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                        title="Open Document Comments"
                      >
                        {openComments > 0 ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', whiteSpace: 'nowrap' }}>
                            <MessageSquare size={12} /> {openComments} Open
                          </span>
                        ) : (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, color: '#10b981', whiteSpace: 'nowrap' }}>
                            <UserCheck size={12} /> 0 Open
                          </span>
                        )}

                        {resolvedComments > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, color: '#10b981', borderLeft: `1px solid ${T.border}`, paddingLeft: '8px', whiteSpace: 'nowrap' }}>
                            {resolvedComments} Resolved
                          </span>
                        )}

                        {flaggedComments > 0 && (
                          <span title={`${flaggedComments} comments open for >48 hours!`} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 800, color: '#ef4444', borderLeft: `1px solid ${T.border}`, paddingLeft: '8px', whiteSpace: 'nowrap' }}>
                            <AlertTriangle size={12} /> {flaggedComments} Flagged
                          </span>
                        )}
                      </button>
                    ) : (
                      <button 
                        onClick={() => {
                          onOpenEditor(task.id);
                          setTimeout(() => window.dispatchEvent(new CustomEvent('im-open-comments-sidebar')), 100);
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: T.textMuted, opacity: 0.6, fontStyle: 'italic', transition: 'opacity 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = 1}
                        onMouseLeave={e => e.currentTarget.style.opacity = 0.6}
                      >
                        <MessageSquare size={14} /> No active audit
                      </button>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        .glass-select option { background-color: ${T.surface}; color: ${T.text}; }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: ${isDark ? 'invert(1) sepia(1) saturate(5) hue-rotate(175deg)' : 'none'};
          cursor: pointer;
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
}
