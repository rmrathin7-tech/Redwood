import React, { useState, useMemo, useEffect } from 'react';
import { ShieldCheck, ChevronRight, UploadCloud, CheckCircle2 } from 'lucide-react';
import { useSRLAssessment } from './hooks/useSRLData';
import { srlMasterSchema } from './config/srlMasterSchema';
import QuestionEngine from './components/QuestionEngine';

export default function PublicSRLView({ isDark = true }) {
  // Extracts the ID from the URL (e.g., /public/srl/[id])
  // If you use react-router, replace this with: const { srlId } = useParams();
  const srlId = window.location.pathname.split('/').pop(); 
  
  const { data: srlData, loading, updateResponse } = useSRLAssessment(srlId);
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  const activeSchema = useMemo(() => {
    if (!srlData) return null;
    return srlMasterSchema.stages[srlData.stage];
  }, [srlData]);

  const T = useMemo(() => ({
    bg:         isDark ? '#060910' : '#f1f5f9',
    surface:    isDark ? '#0d1117' : '#ffffff',
    surface2:   isDark ? '#161b22' : '#f8fafc',
    border:     isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    text:       isDark ? '#f1f5f9' : '#0f172a',
    textMuted:  isDark ? '#64748b' : '#94a3b8',
    accent:     '#3b82f6',
  }), [isDark]);

  if (loading) {
    return <div style={{ display: 'flex', height: '100vh', width: '100vw', background: T.bg, color: T.text, alignItems: 'center', justifyContent: 'center' }}>Loading Secure Assessment...</div>;
  }

  if (!srlData || !activeSchema) {
    return <div style={{ display: 'flex', height: '100vh', width: '100vw', background: T.bg, color: T.text, alignItems: 'center', justifyContent: 'center' }}>Assessment not found or link is invalid.</div>;
  }

  if (isCompleted) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', background: T.bg, color: T.text, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <CheckCircle2 size={48} color="#10b981" />
        <h2 style={{ margin: 0 }}>Assessment Submitted</h2>
        <p style={{ color: T.textMuted }}>Thank you. The Redwood team has received your responses.</p>
      </div>
    );
  }

  const activeModule = activeSchema.modules[activeModuleIndex];
  const isLastModule = activeModuleIndex === activeSchema.modules.length - 1;

  const handleNext = () => {
    if (isLastModule) {
      setIsCompleted(true);
    } else {
      setActiveModuleIndex(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div style={{ minHeight: '100vh', width: '100vw', background: T.bg, color: T.text, fontFamily: '"DN Sans", sans-serif', display: 'flex', flexDirection: 'column' }}>
      
      {/* Branded Header */}
      <header style={{ height: '70px', background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '-0.5px' }}>REDWOOD<span style={{ color: T.accent }}>.</span></div>
          <div style={{ width: '1px', height: '24px', background: T.border }} />
          <div style={{ fontWeight: 600 }}>Startup Readiness Assessment</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '6px 12px', borderRadius: '20px', fontWeight: 700 }}>
          <ShieldCheck size={16} /> Secure Portal
        </div>
      </header>

      {/* Main Form Area */}
      <main style={{ flex: 1, padding: '40px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '800px' }}>
          
          <div style={{ marginBottom: '40px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '2rem', margin: '0 0 12px 0' }}>{srlData.companyName}</h1>
            <p style={{ color: T.textMuted, margin: 0, fontSize: '1.1rem' }}>Please complete the following modules to help us evaluate your readiness level.</p>
          </div>

          {/* Progress Bar */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: T.textMuted, marginBottom: '8px', fontWeight: 600 }}>
              <span>Module {activeModuleIndex + 1} of {activeSchema.modules.length}</span>
              <span>{Math.round(((activeModuleIndex) / activeSchema.modules.length) * 100)}% Completed</span>
            </div>
            <div style={{ height: '6px', background: T.surface2, borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${((activeModuleIndex) / activeSchema.modules.length) * 100}%`, background: T.accent, transition: 'width 0.3s ease' }} />
            </div>
          </div>

          {/* Active Module Questions */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '16px', padding: '32px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h2 style={{ marginTop: 0, marginBottom: '24px', fontSize: '1.4rem', borderBottom: `1px solid ${T.border}`, paddingBottom: '16px' }}>
              {activeModule.topic}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {activeModule.questions.map((q, idx) => (
                <div key={q.id}>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ color: T.accent, fontWeight: 800, fontSize: '1.1rem' }}>{idx + 1}.</div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 500, lineHeight: 1.5 }}>{q.text}</h3>
                  </div>
                  {/* We force viewMode="client" so they only see the text area and file upload */}
                  <div style={{ paddingLeft: '24px' }}>
                    <QuestionEngine 
                      question={q}
                      responseData={srlData.responses?.[q.id] || {}}
                      updateResponse={updateResponse}
                      viewMode="client" 
                      isDark={isDark}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              onClick={handleNext}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 32px', background: T.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)' }}
            >
              {isLastModule ? 'Submit Assessment' : 'Save & Continue'} <ChevronRight size={18} />
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}