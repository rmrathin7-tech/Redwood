import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase';
import { LayoutDashboard, LogOut, Briefcase, Loader2, Menu, ChevronLeft, Sun, Moon, Plus, Target, KanbanSquare, Printer } from 'lucide-react';

import { useProfilingTasks } from './hooks/useProfilingTasks';
import ProfilingTaskboard from './components/ProfilingTaskboard';
import ProfilingEditor from './components/ProfilingEditor';
import CommentsSidebar from '../im/components/CommentsSidebar';
import CommentSVGOverlay from '../im/components/CommentSVGOverlay';
import PrintProfile from './components/PrintProfile';
import MultiPrintModal from './components/MultiPrintModal';
// ── 3D TILT CARD FOR HUB VIEW ──
const TiltCard = React.memo(function TiltCard({ children, style, onClick }) {
  const cardRef = useRef(null);
  const glowRef = useRef(null);
  const frameRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const card = cardRef.current; if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    const cx = rect.width / 2; const cy = rect.height / 2;
    const rotX = ((y - cy) / cy) * -6; const rotY = ((x - cx) / cx) * 6;

    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      card.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-5px) scale(1.02)`;
      if (glowRef.current) {
        glowRef.current.style.background = `radial-gradient(180px circle at ${x}px ${y}px, rgba(236,72,153,0.2), transparent 70%)`;
        glowRef.current.style.opacity = '1';
      }
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    if (cardRef.current) cardRef.current.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1)';
    if (glowRef.current) glowRef.current.style.opacity = '0';
  }, []);

  return (
    <div ref={cardRef} style={{ ...style, transformStyle: 'preserve-3d', willChange: 'transform', position: 'relative', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.4s cubic-bezier(0.23,1,0.32,1), box-shadow 0.4s ease' }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onClick={onClick}>
      <div ref={glowRef} style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', opacity: 0, pointerEvents: 'none', transition: 'opacity 0.4s ease', zIndex: 0 }} />
      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</div>
    </div>
  );
});

export default function ProfilingWorkspace() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectId = searchParams.get('project');
  const projectName = searchParams.get('name') || 'Global Network';

  const [theme, setTheme] = useState('dark');
  const isDark = theme === 'dark';
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const [activeView, setActiveView] = useState('hub'); 
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  
  // ── REUSED IM & WORKSPACE STATE ──
  const [commentsSidebarOpen, setCommentsSidebarOpen] = useState(false);
  const [printTaskId, setPrintTaskId] = useState(null);
  const [workspaceUsers, setWorkspaceUsers] = useState([]);
  const [showMultiPrint, setShowMultiPrint] = useState(false);

  const { tasks, loading, addTask, updateTaskStatus } = useProfilingTasks(projectId);
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => { if (user) setCurrentUserEmail(user.email); });
    return () => unsub();
  }, []);

  // ── EVENT BRIDGE ──
  useEffect(() => {
    const openComments = () => setCommentsSidebarOpen(true);
    const openPrint = (e) => setPrintTaskId(e.detail.taskId);
    
    window.addEventListener('im-open-comments-sidebar', openComments);
    window.addEventListener('profiling-open-print', openPrint);
    
    return () => {
      window.removeEventListener('im-open-comments-sidebar', openComments);
      window.removeEventListener('profiling-open-print', openPrint);
    };
  }, []);

  // ── INTERACTIVE CANVAS ENGINE ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    let raf;
    
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize); resize();
    
    const onMouseMove = (e) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMouseMove);

    const particles = Array.from({ length: 70 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8,
      size: Math.random() * 2.5 + 0.5
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mx = mouseRef.current.x; const my = mouseRef.current.y;

      particles.forEach(p => {
        const dist = Math.hypot(p.x - mx, p.y - my);
        if (dist < 180) {
          p.vx += (p.x - mx) / dist * 0.08;
          p.vy += (p.y - my) / dist * 0.08;
        }
        p.x += p.vx *= 0.98; p.y += p.vy *= 0.98;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? 'rgba(236, 72, 153, 0.5)' : 'rgba(219, 39, 119, 0.4)';
        ctx.fill();
      });

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const d = Math.hypot(particles[i].x - particles[j].x, particles[i].y - particles[j].y);
          if (d < 140) {
            ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = isDark ? `rgba(236, 72, 153, ${0.2 * (1 - d/140)})` : `rgba(219, 39, 119, ${0.25 * (1 - d/140)})`;
            ctx.lineWidth = 1.2; ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(raf);
    };
  }, [isDark]);

  const handleOpenEditor = (id) => {
    setSelectedTaskId(id);
    setActiveView('editor');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: isDark ? '#04060a' : '#f0f4f8', color: isDark ? '#f8fafc' : '#0f172a', fontFamily: "'Inter', sans-serif" }}>
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />
      
      <aside style={{ width: sidebarOpen ? 260 : 70, background: isDark ? 'rgba(10,14,24,0.4)' : 'rgba(255,255,255,0.4)', backdropFilter: 'blur(20px)', borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 40 }}>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ position: 'absolute', right: -14, top: 20, width: 28, height: 28, borderRadius: '50%', background: isDark ? '#1e293b' : '#fff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, color: isDark ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          {sidebarOpen ? <ChevronLeft size={16} /> : <Menu size={16} />}
        </button>

        <div style={{ padding: sidebarOpen ? '24px 20px' : '24px 0', display: 'flex', flexDirection: 'column', alignItems: sidebarOpen ? 'flex-start' : 'center', gap: 12, borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Briefcase size={20} color="#fff" />
          </div>
          {sidebarOpen && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ec4899', textTransform: 'uppercase', marginBottom: 4 }}>Profiling Module</div>
              <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 200 }}>{projectName}</div>
            </div>
          )}
        </div>

        <nav style={{ padding: '24px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => { setActiveView('hub'); setSelectedTaskId(null); }} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 8, cursor: 'pointer', border: 'none', background: activeView === 'hub' ? (isDark ? 'rgba(236,72,153,0.15)' : 'rgba(219,39,119,0.15)') : 'transparent', color: activeView === 'hub' ? '#ec4899' : (isDark ? '#94a3b8' : '#64748b'), justifyContent: sidebarOpen ? 'flex-start' : 'center', fontWeight: 600, fontSize: 14, transition: 'all 0.2s' }}>
            <LayoutDashboard size={18} />
            {sidebarOpen && <span>Dashboard Hub</span>}
          </button>
          
          <button onClick={() => { setActiveView('taskboard'); setSelectedTaskId(null); }} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 8, cursor: 'pointer', border: 'none', background: activeView === 'taskboard' ? (isDark ? 'rgba(236,72,153,0.15)' : 'rgba(219,39,119,0.15)') : 'transparent', color: activeView === 'taskboard' ? '#ec4899' : (isDark ? '#94a3b8' : '#64748b'), justifyContent: sidebarOpen ? 'flex-start' : 'center', fontWeight: 600, fontSize: 14, transition: 'all 0.2s' }}>
            <KanbanSquare size={18} />
            {sidebarOpen && <span>Taskboard Matrix</span>}
          </button>
        </nav>

        <div style={{ padding: '16px 12px', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 8, cursor: 'pointer', border: 'none', background: 'transparent', color: isDark ? '#94a3b8' : '#64748b', justifyContent: sidebarOpen ? 'flex-start' : 'center', fontWeight: 600, fontSize: 13, width: '100%' }}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
            {sidebarOpen && <span>Toggle Theme</span>}
          </button>
          
            <button onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 8, cursor: 'pointer', border: 'none', background: 'transparent', color: '#ef4444', justifyContent: sidebarOpen ? 'flex-start' : 'center', fontWeight: 600, fontSize: 13, width: '100%' }}>
  <LogOut size={18} />
  {sidebarOpen && <span>Exit to Dashboard</span>}
</button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'hidden', position: 'relative', zIndex: 10 }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
            <Loader2 size={32} className="animate-spin" color="#ec4899" />
            <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Establishing Link...</span>
          </div>
        ) : activeView === 'editor' && selectedTaskId ? (
          <ProfilingEditor projectId={projectId} taskId={selectedTaskId} onClose={() => { setActiveView('taskboard'); setSelectedTaskId(null); }} currentUserEmail={currentUserEmail} isDark={isDark} />
        ) : activeView === 'taskboard' ? (
          <ProfilingTaskboard tasks={tasks} loading={loading} onUpdateStatus={updateTaskStatus} onAddTask={addTask} onOpenEditor={handleOpenEditor} currentUserEmail={currentUserEmail} isDark={isDark} />
        ) : (
          /* ── DASHBOARD HUB VIEW ── */
          <div style={{ padding: '60px 40px', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 48 }}>
              <div>
                <h1 style={{ fontSize: '3rem', fontWeight: 200, margin: '0 0 8px 0', letterSpacing: '-1px', color: isDark ? '#fff' : '#000' }}>Company Profiling</h1>
                <p style={{ margin: 0, color: isDark ? '#94a3b8' : '#64748b', fontSize: '1rem', letterSpacing: '1px', textTransform: 'uppercase' }}>Active Targets · {tasks.length} Tracked</p>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setShowMultiPrint(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: isDark ? '#fff' : '#0f172a', border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`, borderRadius: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'} onMouseLeave={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}>
                  <Printer size={18} /> Batch Print
                </button>
                <button onClick={() => setActiveView('taskboard')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 20px rgba(236,72,153,0.3)', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                  <KanbanSquare size={18} /> Open Matrix Taskboard
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
              {tasks.map((task, i) => (
                <TiltCard key={task.id} onClick={() => handleOpenEditor(task.id)} style={{ background: isDark ? 'rgba(10,14,24,0.4)' : 'rgba(255,255,255,0.6)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, backdropFilter: 'blur(16px)', borderRadius: 16, padding: 24, boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 20px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ padding: 10, background: 'rgba(236,72,153,0.1)', borderRadius: 10, color: '#ec4899' }}><Briefcase size={20} /></div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', color: isDark ? '#fff' : '#000', fontWeight: 600 }}>{task.companyName}</h3>
                      <span style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{task.status}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, paddingTop: 16, fontSize: '0.8rem', color: isDark ? '#cbd5e1' : '#475569' }}>
                    <span>Assigned: {task.assignedTo?.split('@')[0] || 'Unassigned'}</span>
                    <span style={{ color: '#ec4899', fontWeight: 700 }}>OPEN ➔</span>
                  </div>
                </TiltCard>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── IM COMMENTING MOUNT ── */}
      {selectedTaskId && (
        <>
          <CommentsSidebar 
            imId={selectedTaskId} 
            isDark={isDark} 
            isOpen={commentsSidebarOpen} 
            onClose={() => setCommentsSidebarOpen(false)} 
            activeSection="global" 
            workspaceUsers={workspaceUsers}
            flatSections={[]}
            customNames={{}}
            excludedSections={[]}
          />
          <CommentSVGOverlay />
        </>
      )}

      {/* ── PRINT COMPILER MOUNT ── */}
      {printTaskId && (
        <PrintProfile 
          projectId={projectId} 
          taskId={printTaskId} 
          onClose={() => setPrintTaskId(null)} 
        />
      )}

      {/* ── BATCH PRINT MOUNT ── */}
      {showMultiPrint && (
        <MultiPrintModal 
          tasks={tasks}
          isDark={isDark}
          onClose={() => setShowMultiPrint(false)}
        />
      )}
    </div>
  );
}
