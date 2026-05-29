import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, FolderOpen, FileText, BarChart3, 
  CheckCircle2, Building2, Kanban, ChevronRight, ChevronDown 
} from 'lucide-react';
import { db } from '../../firebase.js';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import IMTaskBoard from '../im/components/IMTaskBoard.jsx';

// ── INDIVIDUAL PROJECT CARD W/ LISTENERS ──
const ProjectBoardCard = ({ project, isDark, onOpenOps }) => {
  const [ims, setIms] = useState([]);
  const [fsas, setFsas] = useState([]);
  const [fcs, setFcs] = useState([]);
  const [bsas, setBsas] = useState([]);
  const [expanded, setExpanded] = useState(false);

  const T = useMemo(() => ({
    surface: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
    surfaceHover: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    text: isDark ? '#f1f5f9' : '#0f172a',
    textMuted: isDark ? '#64748b' : '#94a3b8',
  }), [isDark]);

  useEffect(() => {
    if (!project?.id) return;
    const unsubIm = onSnapshot(query(collection(db, 'investment-memos'), where('projectId', '==', project.id)), snap => setIms(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    const unsubFc = onSnapshot(query(collection(db, 'first-connect-reports'), where('projectId', '==', project.id)), snap => setFcs(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    const unsubFsa = onSnapshot(collection(db, 'projects', project.id, 'fsa'), snap => setFsas(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    const unsubBsa = onSnapshot(collection(db, 'projects', project.id, 'bsa'), snap => setBsas(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { unsubIm(); unsubFc(); unsubFsa(); unsubBsa(); };
  }, [project.id]);

  const totalModules = ims.length + fsas.length + fcs.length + bsas.length;

  const renderModuleList = (title, items, icon, color, type) => {
    if (items.length === 0) return null;
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
          {React.cloneElement(icon, { size: 14, color })} {title} ({items.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {items.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title || item.name || 'Untitled'}</span>
              
              {/* OPS KANBAN BUTTON FOR IMs */}
              {type === 'im' && (
                <button 
                  onClick={() => onOpenOps(item.id, project.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: isDark ? 'rgba(0,240,255,0.1)' : 'rgba(14,165,233,0.1)', color: isDark ? '#00f0ff' : '#0ea5e9', border: `1px solid ${isDark ? 'rgba(0,240,255,0.3)' : 'rgba(14,165,233,0.3)'}`, padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <Kanban size={12} /> Ops
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ background: isDark ? 'rgba(17,24,39,0.7)' : 'rgba(255,255,255,0.8)', border: `1px solid ${T.border}`, borderRadius: '16px', overflow: 'hidden', backdropFilter: 'blur(20px)', transition: 'all 0.3s' }}>
      <div 
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: expanded ? T.surface : 'transparent', transition: 'background 0.2s' }}
        onMouseEnter={e => e.currentTarget.style.background = T.surfaceHover}
        onMouseLeave={e => e.currentTarget.style.background = expanded ? T.surface : 'transparent'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ padding: '8px', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: '10px' }}>
            <FolderOpen size={20} color={T.text} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: T.text }}>{project.name}</h3>
            <span style={{ fontSize: '0.75rem', color: T.textMuted }}>{totalModules} active modules</span>
          </div>
        </div>
        <div style={{ color: T.textMuted }}>
          {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '20px', borderTop: `1px solid ${T.border}` }}>
          {totalModules === 0 ? (
            <div style={{ fontSize: '0.85rem', color: T.textMuted, fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>No modules initialized in this dossier.</div>
          ) : (
            <>
              {renderModuleList('Investment Memos', ims, <FileText />, isDark ? '#00f0ff' : '#0ea5e9', 'im')}
              {renderModuleList('Financial Analysis', fsas, <BarChart3 />, '#22c55e', 'fsa')}
              {renderModuleList('First Connect', fcs, <CheckCircle2 />, '#f59e0b', 'fc')}
              {renderModuleList('Bank Statements', bsas, <Building2 />, '#a855f7', 'bsa')}
            </>
          )}
        </div>
      )}
    </div>
  );
};


// ── MAIN GLOBAL BOARD OVERLAY ──
export default function GlobalBoard({ projects, isDark, onClose }) {
  const [activeOpsData, setActiveOpsData] = useState(null); // { imId, projectId }

  const T = useMemo(() => ({
    bg: isDark ? '#060910' : '#f1f5f9',
    surface: isDark ? '#0d1117' : '#ffffff',
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    text: isDark ? '#f1f5f9' : '#0f172a',
    textMuted: isDark ? '#64748b' : '#94a3b8',
  }), [isDark]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: isDark ? 'rgba(6,9,16,0.95)' : 'rgba(241,245,249,0.95)', backdropFilter: 'blur(24px)', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.2s ease' }}>
      
      {/* HEADER */}
      <header style={{ height: '70px', padding: '0 32px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: T.surface }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ padding: '8px', background: isDark ? 'rgba(185,28,28,0.1)' : 'rgba(220,38,38,0.1)', borderRadius: '8px' }}>
            <Kanban size={18} color={isDark ? '#ef4444' : '#dc2626'} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: T.text, letterSpacing: '-0.5px' }}>Global Operations Space</h1>
            <span style={{ fontSize: '0.7rem', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>Dossier Matrix</span>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: `1px solid ${T.border}`, color: T.textMuted, padding: '8px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.background = 'transparent' }}>
          <X size={18} />
        </button>
      </header>

      {/* PROJECT GRID */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '40px 32px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {projects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: T.textMuted, fontStyle: 'italic' }}>No active dossiers available.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px', alignItems: 'start' }}>
              {projects.map((proj, i) => (
                <div key={proj.id} style={{ animation: `slideUp 0.4s ${i * 0.05}s both` }}>
                  <ProjectBoardCard 
                    project={proj} 
                    isDark={isDark} 
                    onOpenOps={(imId, projectId) => setActiveOpsData({ imId, projectId })} 
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* RENDER IM TASK BOARD ON TOP IF ACTIVE */}
      {activeOpsData && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1000 }}>
          <IMTaskBoard
            imId={activeOpsData.imId}
            projectId={activeOpsData.projectId}
            isDark={isDark}
            onClose={() => setActiveOpsData(null)}
          />
        </div>
      )}
    </div>
  );
}
