import React, { useState, useMemo } from 'react';
import { Plus, Search, Target, Briefcase, ChevronRight, BarChart3, X, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAllSRLs } from './hooks/useSRLData';
import SRLCreationWizard from './components/SRLCreationWizard';
import SRLWorkspace from './SRLWorkspace';

export default function SRLHub({ isDark = true, onClose }) {
  const { srls, loading } = useAllSRLs();
  const navigate = useNavigate();
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSrlId, setActiveSrlId] = useState(null); // Controls the Workspace overlay

  const T = useMemo(() => ({
    bg:         isDark ? '#060910' : '#f1f5f9',
    surface:    isDark ? '#0d1117' : '#ffffff',
    surface2:   isDark ? '#161b22' : '#f8fafc',
    border:     isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    text:       isDark ? '#f1f5f9' : '#0f172a',
    textMuted:  isDark ? '#64748b' : '#94a3b8',
    accent:     '#3b82f6',
  }), [isDark]);

  const filteredSRLs = srls.filter(srl => 
    srl.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    srl.linkedProjectName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', flexDirection: 'column', background: T.bg, color: T.text, fontFamily: '"DN Sans", sans-serif', animation: 'fadeIn 0.2s ease' }}>
      
      {/* HEADER */}
      <header style={{ height: '70px', padding: '0 32px', background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: T.text, letterSpacing: '-0.5px' }}>SRL Assessment Hub</h1>
          <span style={{ fontSize: '0.75rem', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>Startup Readiness Level Database</span>
        </div>

        <div style={{ display: 'flex', gap: '16px' }}>
          <button onClick={() => navigate('/srl-settings')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', borderRadius: '8px', background: T.surface2, color: T.text, border: `1px solid ${T.border}`, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
            <Settings size={16} /> Settings
          </button>
          <button onClick={() => setIsWizardOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', borderRadius: '8px', background: T.accent, color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.3)' }}>
            <Plus size={16} /> New Assessment
          </button>
          {onClose && (
            <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.text, padding: '8px 12px', borderRadius: '8px', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          )}
        </div>
      </header>

      {/* TOOLBAR */}
      <div style={{ padding: '24px 32px 0' }}>
        <div style={{ position: 'relative', width: '300px' }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
          <input 
            type="text" placeholder="Search by company or project..." 
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 40px', borderRadius: '8px', border: `1px solid ${T.border}`, background: T.surface, color: T.text, outline: 'none', fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {/* LIST OF SRLS */}
      <main style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ color: T.textMuted, fontSize: '0.85rem' }}>Loading assessments...</div>
        ) : filteredSRLs.length === 0 ? (
          <div style={{ color: T.textMuted, fontSize: '0.85rem', fontStyle: 'italic' }}>No assessments found. Create one to get started.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
            {filteredSRLs.map(srl => (
              <div 
                key={srl.id} 
                onClick={() => setActiveSrlId(srl.id)}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '20px', cursor: 'pointer', transition: 'all 0.2s' }} 
                onMouseEnter={e => e.currentTarget.style.borderColor = T.accent} 
                onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{srl.companyName || 'Unknown Company'}</h3>
                  <div style={{ background: T.surface2, color: T.textMuted, fontSize: '0.7rem', padding: '4px 8px', borderRadius: '6px', fontWeight: 700, textTransform: 'uppercase' }}>
                    {srl.stage === 'idea' ? 'Idea Stage' : 'Revenue Stage'}
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: T.textMuted }}>
                    <Briefcase size={14} /> Linked to: <span style={{ color: T.text, fontWeight: 600 }}>{srl.linkedProjectName || 'Standalone'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: T.textMuted }}>
                    <Target size={14} /> Type: <span style={{ color: T.text, fontWeight: 600 }}>{srl.type === 'internal' ? 'Internal Team' : 'Client Submission'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: `1px dashed ${T.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: T.accent, fontSize: '0.85rem', fontWeight: 700 }}>
                    <BarChart3 size={14} /> Open Assessment
                  </div>
                  <ChevronRight size={16} color={T.textMuted} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* OVERLAYS */}
      {isWizardOpen && (
        <SRLCreationWizard onClose={() => setIsWizardOpen(false)} isDark={isDark} />
      )}
      
      {activeSrlId && (
        <SRLWorkspace srlId={activeSrlId} onClose={() => setActiveSrlId(null)} isDark={isDark} />
      )}
    </div>
  );
}