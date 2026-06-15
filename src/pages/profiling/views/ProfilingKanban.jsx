import React, { useRef, useCallback } from 'react';
import { Lock, Unlock, MessageSquare } from 'lucide-react';

const AVATAR_COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4'];
const avatarColor = (str) => AVATAR_COLORS[(str?.charCodeAt(0) || 0) % AVATAR_COLORS.length];

// 3D Interactive Card Wrapper
const TiltCard = React.memo(function TiltCard({ children, style, onClick, draggable, onDragStart }) {
  const cardRef = useRef(null);
  const glowRef = useRef(null);
  const glareRef = useRef(null);
  const frameRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const card = cardRef.current; if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    const cx = rect.width / 2; const cy = rect.height / 2;
    const rotX = ((y - cy) / cy) * -5; const rotY = ((x - cx) / cx) * 5;
    const glareX = (x / rect.width) * 100; const glareY = (y / rect.height) * 100;

    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      card.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-2px) scale(1.02)`;
      if (glowRef.current) {
        glowRef.current.style.background = `radial-gradient(160px circle at ${x}px ${y}px, rgba(236,72,153,0.15), transparent 70%)`;
        glowRef.current.style.opacity = '1';
      }
      if (glareRef.current) {
        glareRef.current.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.1) 0%, transparent 50%)`;
        glareRef.current.style.opacity = '1';
      }
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    if (cardRef.current) cardRef.current.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1)';
    if (glowRef.current) glowRef.current.style.opacity = '0';
    if (glareRef.current) glareRef.current.style.opacity = '0';
  }, []);

  return (
    <div ref={cardRef} style={{ ...style, transformStyle: 'preserve-3d', willChange: 'transform', position: 'relative', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease' }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onClick={onClick} draggable={draggable} onDragStart={onDragStart}>
      <div ref={glowRef} style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', opacity: 0, pointerEvents: 'none', transition: 'opacity 0.4s ease', zIndex: 0 }} />
      <div ref={glareRef} style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', opacity: 0, pointerEvents: 'none', transition: 'opacity 0.4s ease', zIndex: 2, mixBlendMode: 'overlay' }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</div>
    </div>
  );
});

export default function ProfilingKanban({ filteredTasks, COLUMNS, onUpdateStatus, onOpenEditor, isDark }) {
  const handleDragStart = (e, taskId) => e.dataTransfer.setData('taskId', taskId);
  const handleDrop = (e, statusId) => { e.preventDefault(); const taskId = e.dataTransfer.getData('taskId'); if (taskId) onUpdateStatus(taskId, statusId); };
  const handleDragOver = (e) => e.preventDefault();

  return (
    <div style={{ display: 'flex', gap: 20, height: '100%', overflowX: 'auto', paddingBottom: 16 }}>
      {COLUMNS.map(col => {
        const columnTasks = filteredTasks.filter(t => t.status === col.id);
        return (
          <div key={col.id} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, col.id)} style={{ minWidth: 320, width: 320, display: 'flex', flexDirection: 'column', background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)', borderRadius: 16, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, backdropFilter: 'blur(10px)' }}>
            
            <div style={{ padding: '16px', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.color, boxShadow: `0 0 8px ${col.color}` }} />
                {col.label}
              </div>
              <span style={{ background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700, color: isDark ? '#cbd5e1' : '#475569' }}>
                {columnTasks.length}
              </span>
            </div>

            <div style={{ padding: 16, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {columnTasks.map(task => (
                <TiltCard key={task.id} draggable onDragStart={(e) => handleDragStart(e, task.id)} onClick={() => onOpenEditor(task.id)} style={{ background: isDark ? 'rgba(30,41,59,0.7)' : '#fff', padding: 16, borderRadius: 12, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: isDark ? '#f8fafc' : '#0f172a' }}>{task.companyName}</span>
                    {task.isLocked ? <Lock size={14} color="#ef4444" title="Locked" /> : <Unlock size={14} color={isDark ? '#64748b' : '#94a3b8'} />}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px dashed ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, paddingTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: avatarColor(task.assignedTo), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>
                        {task.assignedTo?.substring(0,2).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }}>{task.assignedTo?.split('@')[0]}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: task.comments?.length > 0 ? '#ec4899' : (isDark ? '#64748b' : '#94a3b8'), fontSize: 12, fontWeight: 600 }}>
                      <MessageSquare size={14} /> {task.comments?.length || 0}
                    </div>
                  </div>
                </TiltCard>
              ))}
            </div>
          </div>
        );
      })}
      <style>{` ::-webkit-scrollbar { width: 6px; height: 6px; } ::-webkit-scrollbar-thumb { background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; border-radius: 4px; } `}</style>
    </div>
  );
}