import React, { useState, useMemo, useEffect } from 'react';
import { Menu, ChevronRight, Target, Link2, BarChart3, AlertCircle, Users, Plus, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSRLAssessment, useSRLSchema } from './hooks/useSRLData';
import QuestionEngine from './components/QuestionEngine';
import ScoreAnalytics from './components/ScoreAnalytics';

export default function SRLWorkspace({ srlId, isDark = true, onClose }) {
  const { data: srlData, loading, updateResponse } = useSRLAssessment(srlId);
  const { schema: dynamicSchema, loading: schemaLoading } = useSRLSchema();
  const navigate = useNavigate();
  const [activeModuleId, setActiveModuleId] = useState(null);
  // We no longer need the toggle, but we DO need to track WHICH analyst's scorecard we are looking at
  const [activeAnalystId, setActiveAnalystId] = useState('primary'); 

  // Secure Link Generator
  const handleShareLink = () => {
    const publicUrl = `${window.location.origin}/public/srl/${srlId}`;
    navigator.clipboard.writeText(publicUrl).then(() => {
      alert("Secure public link copied to clipboard!\n\nYou can share this with the founder to fill out their assessment without needing a Redwood login.");
    });
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isScorePanelOpen, setIsScorePanelOpen] = useState(true);

  // Load the correct schema (idea vs revenue) using the DYNAMIC schema
  const activeSchema = useMemo(() => {
    if (!srlData || !dynamicSchema) return null;
    return dynamicSchema[srlData.stage]; 
  }, [srlData, dynamicSchema]);

  // Set the first module as active when schema loads
  useEffect(() => {
    if (activeSchema && !activeModuleId && activeSchema.modules?.length > 0) {
      setActiveModuleId(activeSchema.modules[0].id);
    }
  }, [activeSchema, activeModuleId]);

  // Match the visual theme engine
  const T = useMemo(() => ({
    bg:         isDark ? '#060910' : '#f1f5f9',
    surface:    isDark ? '#0d1117' : '#ffffff',
    surface2:   isDark ? '#161b22' : '#f8fafc',
    border:     isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    text:       isDark ? '#f1f5f9' : '#0f172a',
    textMuted:  isDark ? '#64748b' : '#94a3b8',
    accent:     '#3b82f6',
    accentDim:  'rgba(59, 130, 246, 0.1)',
  }), [isDark]);

  if (loading || schemaLoading || !activeSchema) {
    return <div style={{ padding: '40px', color: T.text, background: T.bg, height: '100vh' }}>Loading Dynamic Assessment...</div>;
  }

  const activeModule = activeSchema.modules.find(m => m.id === activeModuleId);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', position: 'fixed', top: 0, left: 0, zIndex: 1000, background: T.bg, color: T.text, fontFamily: '"DN Sans", sans-serif' }}>
      
      {/* SIDEBAR: Framework Navigation */}
      <aside style={{ width: isSidebarOpen ? 280 : 0, background: T.surface, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', transition: 'width 0.3s ease', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '1px', color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>
            Evaluation Framework
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: T.text }}>
            {activeSchema.label}
          </div>
        </div>
        <div style={{ padding: '12px 8px', overflowY: 'auto', flex: 1 }}>
          {activeSchema.modules.map((module) => {
            const isActive = activeModuleId === module.id;
            return (
              <button
                key={module.id} onClick={() => setActiveModuleId(module.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: isActive ? T.accentDim : 'transparent', border: 'none', borderRadius: '8px', color: isActive ? T.accent : T.textMuted, cursor: 'pointer', textAlign: 'left', marginBottom: '4px' }}
              >
                <AlertCircle size={16} />
                <span style={{ fontSize: '0.85rem', fontWeight: isActive ? 700 : 500 }}>{module.topic}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
{/* TOP FIXED BAR */}
        <header style={{ height: '64px', background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0, gap: '12px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 1, minWidth: 0 }}>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer', flexShrink: 0 }}><Menu size={20} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <div style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text, padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {srlData.companyName}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            
            {/* If Internal, show Analyst Sheets. If Client, hide. */}
            {srlData.type === 'internal' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: T.surface2, borderRadius: '8px', padding: '4px', border: `1px solid ${T.border}` }}>
                <select 
                  value={activeAnalystId} 
                  onChange={(e) => setActiveAnalystId(e.target.value)}
                  style={{ background: 'transparent', color: T.text, border: 'none', fontSize: '0.75rem', fontWeight: 600, outline: 'none', cursor: 'pointer' }}
                >
                  <option value="primary">Primary Scorecard</option>
                  <option value="analyst2">Analyst 2 Scorecard</option>
                </select>
                <button title="Add Blank Analyst Sheet" style={{ background: 'transparent', border: 'none', color: T.accent, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Plus size={14} /></button>
              </div>
            )}

            <div style={{ width: '1px', height: '24px', background: T.border }} />

            <button onClick={handleShareLink} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'transparent', border: `1px dashed ${T.textMuted}`, color: T.text, borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <Link2 size={14} /> Share Link
            </button>
            
            {srlData.type === 'internal' && (
              <button onClick={() => setIsScorePanelOpen(!isScorePanelOpen)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: T.accent, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <BarChart3 size={14} /> Analytics
              </button>
            )}

            {onClose && (
               <button onClick={onClose} style={{ padding: '6px 12px', background: T.surface2, border: `1px solid ${T.border}`, color: T.text, borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Close</button>
            )}
          </div>
        </header>

        {/* WORKSPACE CANVAS */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '40px 60px' }}>
          <div style={{ maxWidth: '880px', margin: '0 auto' }}>
            
            {(!activeSchema.modules || activeSchema.modules.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '80px 20px', background: T.surface2, borderRadius: '12px', border: `1px dashed ${T.border}` }}>
                <AlertCircle size={48} color={T.textMuted} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <h2 style={{ margin: '0 0 8px 0', color: T.text, fontSize: '1.2rem' }}>Blueprint Not Deployed</h2>
                <p style={{ color: T.textMuted, fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto', marginBottom: '24px' }}>
                  The scoring logic for this stage is empty. Please go to <strong>SRL Settings</strong>, build your modules, and click <strong>"Deploy to Database"</strong>.
                </p>
                <button 
                  onClick={() => {
                    if (onClose) onClose(); // Closes the overlay if opened from Hub
                    navigate('/srl-settings');
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: T.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.3)' }}
                >
                  <Settings size={16} /> Open Settings Engine
                </button>
              </div>
            ) : activeModule && (
              <>
                <div style={{ marginBottom: '32px' }}>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 8px 0', color: T.text }}>{activeModule.topic}</h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: T.textMuted, fontSize: '0.85rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Target size={14}/> Weight: {activeModule.weight}%</span>
                    <span>•</span>
                    <span>Complete all questions below to calculate section sub-score.</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  {activeModule.questions.map((q, idx) => (
                    <div key={q.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                      <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.border}`, background: T.surface2 }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: T.accentDim, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, flexShrink: 0 }}>{idx + 1}</div>
                          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: T.text, lineHeight: 1.5 }}>{q.text}</h3>
                        </div>
                      </div>
                      <div style={{ padding: '24px' }}>
                        <QuestionEngine 
                          question={q}
                          responseData={srlData.responses?.[q.id] || {}}
                          updateResponse={updateResponse}
                          viewMode={srlData.type}
                          isDark={isDark}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'flex-end' }}>
              <button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: T.surface2, border: `1px solid ${T.border}`, color: T.text, borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                Save & Next Module <ChevronRight size={16} />
              </button>
            </div>

          </div>
        </main>
      </div>

      {/* RENDER SCORE ANALYTICS */}
      {srlData?.type === 'internal' && (
        <ScoreAnalytics 
          srlData={srlData} 
          activeSchema={activeSchema} 
          isScorePanelOpen={isScorePanelOpen} 
          isDark={isDark} 
        />
      )}
    </div>
  );
}   