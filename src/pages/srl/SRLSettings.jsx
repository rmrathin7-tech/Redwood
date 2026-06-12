import React, { useState, useEffect, useMemo } from 'react';
import { Settings, Plus, Trash2, Save, ChevronDown, ChevronRight, AlertCircle, Target, Database, GripVertical, X } from 'lucide-react';
import { db } from '../../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// Default template in case the database is completely empty
const DEFAULT_SCHEMA = {
  idea: { id: 'idea', label: 'Idea Stage', modules: [] },
  revenue: { id: 'revenue', label: 'Revenue Stage', modules: [] }
};

export default function SRLSettings({ isDark = true }) {
  const [schema, setSchema] = useState(DEFAULT_SCHEMA);
  const [activeStageId, setActiveStageId] = useState('idea');
  const [expandedModules, setExpandedModules] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const T = useMemo(() => ({
    bg:         isDark ? '#060910' : '#f1f5f9',
    surface:    isDark ? '#0d1117' : '#ffffff',
    surface2:   isDark ? '#161b22' : '#f8fafc',
    border:     isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    text:       isDark ? '#f1f5f9' : '#0f172a',
    textMuted:  isDark ? '#64748b' : '#94a3b8',
    accent:     '#3b82f6',
    green:      '#10b981',
    amber:      '#f59e0b',
    red:        '#ef4444'
  }), [isDark]);

  // Load from Firebase on mount
  useEffect(() => {
    const fetchSchema = async () => {
      try {
        const snap = await getDoc(doc(db, 'workspace-config', 'srlSchema'));
        if (snap.exists()) {
          setSchema(snap.data().stages || DEFAULT_SCHEMA);
        }
      } catch (err) {
        console.error("Failed to load schema:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSchema();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'workspace-config', 'srlSchema'), {
        stages: schema,
        updatedAt: serverTimestamp()
      }, { merge: true });
      alert("Schema saved successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save schema.");
    } finally {
      setIsSaving(false);
    }
  };

  const activeStage = schema[activeStageId];
  
  // Validation: Check if weights equal 100%
  const totalWeight = activeStage?.modules.reduce((sum, mod) => sum + (Number(mod.weight) || 0), 0) || 0;

  // ── Modifiers ──
  const updateStage = (newStageData) => {
    setSchema(prev => ({ ...prev, [activeStageId]: newStageData }));
  };

  const addModule = () => {
    const newMod = { id: `mod_${Date.now()}`, topic: 'New Evaluation Module', weight: 10, questions: [] };
    updateStage({ ...activeStage, modules: [...activeStage.modules, newMod] });
    setExpandedModules(prev => ({ ...prev, [newMod.id]: true }));
  };

  const updateModule = (modId, field, value) => {
    const updated = activeStage.modules.map(m => m.id === modId ? { ...m, [field]: value } : m);
    updateStage({ ...activeStage, modules: updated });
  };

  const deleteModule = (modId) => {
    if(!window.confirm("Delete this entire module and all its questions?")) return;
    const updated = activeStage.modules.filter(m => m.id !== modId);
    updateStage({ ...activeStage, modules: updated });
  };

  const addQuestion = (modId) => {
    const newQ = { id: `q_${Date.now()}`, text: 'New Question', maxScore: 3, scoringBasis: '', type: 'standard' };
    const updated = activeStage.modules.map(m => m.id === modId ? { ...m, questions: [...m.questions, newQ] } : m);
    updateStage({ ...activeStage, modules: updated });
  };

  const updateQuestion = (modId, qId, field, value) => {
    const updated = activeStage.modules.map(m => {
      if (m.id !== modId) return m;
      return { ...m, questions: m.questions.map(q => q.id === qId ? { ...q, [field]: value } : q) };
    });
    updateStage({ ...activeStage, modules: updated });
  };

  const deleteQuestion = (modId, qId) => {
    const updated = activeStage.modules.map(m => {
      if (m.id !== modId) return m;
      return { ...m, questions: m.questions.filter(q => q.id !== qId) };
    });
    updateStage({ ...activeStage, modules: updated });
  };

  if (loading) return <div style={{ padding: 40, color: T.text, background: T.bg, minHeight: '100vh' }}>Loading Architecture Engine...</div>;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: T.bg, color: T.text, fontFamily: '"DN Sans", sans-serif' }}>
      
      {/* SIDEBAR */}
      <aside style={{ width: '280px', background: T.surface, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: T.text, fontWeight: 800, fontSize: '1.1rem' }}>
            <Settings size={20} color={T.accent} /> SRL Blueprint
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: T.textMuted, lineHeight: 1.4 }}>
            Construct and define the evaluation rulesets dynamically.
          </p>
        </div>

        <div style={{ padding: '20px', flex: 1 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: T.textMuted, marginBottom: '12px', letterSpacing: '1px' }}>Assessment Stages</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.values(schema).map(stage => (
              <button
                key={stage.id} onClick={() => setActiveStageId(stage.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: activeStageId === stage.id ? `${T.accent}15` : T.surface2, border: `1px solid ${activeStageId === stage.id ? T.accent : T.border}`, borderRadius: '8px', color: activeStageId === stage.id ? T.accent : T.text, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s' }}
              >
                {stage.label}
                {activeStageId === stage.id && <Target size={14} />}
              </button>
            ))}
            <button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'transparent', border: `1px dashed ${T.border}`, borderRadius: '8px', color: T.textMuted, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', marginTop: '8px' }}>
              <Plus size={14} /> Add New Stage
            </button>
          </div>
        </div>

        <div style={{ padding: '24px', borderTop: `1px solid ${T.border}`, background: T.surface2 }}>
          <button 
            onClick={handleSave} disabled={isSaving}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: T.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.3)' }}
          >
            <Database size={16} /> {isSaving ? 'Deploying...' : 'Deploy to Database'}
          </button>
        </div>
      </aside>

      {/* MAIN BUILDER AREA */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '40px 60px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          
          {/* Header & Weight Tracker */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px', paddingBottom: '24px', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <input 
                type="text" value={activeStage?.label || ''} 
                onChange={e => updateStage({ ...activeStage, label: e.target.value })}
                style={{ background: 'transparent', border: 'none', color: T.text, fontSize: '2rem', fontWeight: 800, outline: 'none', marginBottom: '8px', width: '100%' }}
              />
              <div style={{ color: T.textMuted, fontSize: '0.9rem' }}>Customize the modules and scoring logic for this stage.</div>
            </div>
            
            <div style={{ background: T.surface2, border: `1px solid ${totalWeight === 100 ? T.green : T.red}`, padding: '12px 20px', borderRadius: '12px', textAlign: 'center', minWidth: '140px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: T.textMuted, marginBottom: '4px' }}>Total Weight</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: totalWeight === 100 ? T.green : T.red }}>
                {totalWeight}%
              </div>
              {totalWeight !== 100 && <div style={{ fontSize: '0.65rem', color: T.red, marginTop: '4px' }}>Must equal 100%</div>}
            </div>
          </div>

          {/* Module Builder */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {activeStage?.modules.map((mod, modIdx) => {
              const isExpanded = expandedModules[mod.id];
              return (
                <div key={mod.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                  
                  {/* Module Header */}
                  <div style={{ display: 'flex', alignItems: 'center', background: T.surface2, padding: '16px 20px', borderBottom: isExpanded ? `1px solid ${T.border}` : 'none' }}>
                    <button onClick={() => setExpandedModules(p => ({ ...p, [mod.id]: !isExpanded }))} style={{ background: 'none', border: 'none', color: T.text, cursor: 'pointer', marginRight: '12px', display: 'flex' }}>
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                    
                    <div style={{ flex: 1, display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <span style={{ color: T.accent, fontWeight: 800, fontSize: '0.9rem' }}>M{modIdx + 1}</span>
                      <input 
                        type="text" value={mod.topic} onChange={e => updateModule(mod.id, 'topic', e.target.value)}
                        placeholder="Module Title..."
                        style={{ flex: 1, background: 'transparent', border: 'none', color: T.text, fontSize: '1.05rem', fontWeight: 700, outline: 'none' }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: T.bg, padding: '6px 12px', borderRadius: '6px', border: `1px solid ${T.border}` }}>
                        <span style={{ fontSize: '0.75rem', color: T.textMuted, fontWeight: 700 }}>WEIGHT</span>
                        <input 
                          type="number" value={mod.weight} onChange={e => updateModule(mod.id, 'weight', parseInt(e.target.value)||0)}
                          style={{ width: '40px', background: 'transparent', border: 'none', color: T.text, fontSize: '0.9rem', fontWeight: 800, outline: 'none', textAlign: 'right' }}
                        />
                        <span style={{ color: T.textMuted }}>%</span>
                      </div>
                    </div>

                    <button onClick={() => deleteModule(mod.id)} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', marginLeft: '16px' }} className="action-hover">
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Questions Builder */}
                  {isExpanded && (
                    <div style={{ padding: '24px', background: T.bg }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {mod.questions.map((q, qIdx) => (
                          <div key={q.id} style={{ display: 'flex', gap: '12px', background: T.surface, padding: '16px', borderRadius: '8px', border: `1px solid ${T.border}` }}>
                            <div style={{ color: T.textMuted, marginTop: '8px', cursor: 'grab' }}><GripVertical size={16} /></div>
                            
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <textarea 
                                value={q.text} onChange={e => { e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px'; updateQuestion(mod.id, q.id, 'text', e.target.value); }}
                                placeholder="Enter question text..."
                                style={{ width: '100%', background: 'transparent', border: 'none', color: T.text, fontSize: '0.95rem', fontWeight: 600, outline: 'none', resize: 'none', minHeight: '30px' }}
                              />
                              
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '12px', background: T.surface2, padding: '12px', borderRadius: '6px', border: `1px solid ${T.border}` }}>
                                
                                <div>
                                  <label style={{ display: 'block', fontSize: '0.65rem', color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Question Type</label>
                                  <select 
                                    value={q.type} onChange={e => updateQuestion(mod.id, q.id, 'type', e.target.value)}
                                    style={{ width: '100%', background: T.bg, border: `1px solid ${T.border}`, color: T.text, padding: '6px', borderRadius: '4px', fontSize: '0.8rem', outline: 'none' }}
                                  >
                                    <option value="standard">Standard (Scored)</option>
                                    <option value="no-score">Information Only (No Score)</option>
                                  </select>
                                </div>

                                {q.type === 'standard' ? (
                                  <>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '0.65rem', color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Scoring Basis / Rubric</label>
                                      <input 
                                        type="text" value={q.scoringBasis} onChange={e => updateQuestion(mod.id, q.id, 'scoringBasis', e.target.value)}
                                        placeholder="e.g. 3pts for MRR > 10k..."
                                        style={{ width: '100%', boxSizing: 'border-box', background: T.bg, border: `1px solid ${T.border}`, color: T.text, padding: '6px', borderRadius: '4px', fontSize: '0.8rem', outline: 'none' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '0.65rem', color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Max Score</label>
                                      <input 
                                        type="number" value={q.maxScore} onChange={e => updateQuestion(mod.id, q.id, 'maxScore', parseFloat(e.target.value)||0)}
                                        style={{ width: '100%', boxSizing: 'border-box', background: T.bg, border: `1px solid ${T.border}`, color: T.text, padding: '6px', borderRadius: '4px', fontSize: '0.8rem', outline: 'none' }}
                                      />
                                    </div>
                                  </>
                                ) : (
                                  <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', color: T.textMuted, fontSize: '0.8rem', fontStyle: 'italic' }}>
                                    <AlertCircle size={14} style={{ marginRight: '6px' }}/> This question will collect data but will not contribute to the final math.
                                  </div>
                                )}
                              </div>
                            </div>

                            <button onClick={() => deleteQuestion(mod.id, q.id)} style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', opacity: 0.7, padding: '0 8px' }}>
                              <X size={16} />
                            </button>
                          </div>
                        ))}

                        <button onClick={() => addQuestion(mod.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'transparent', border: `1px dashed ${T.border}`, borderRadius: '8px', color: T.accent, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', justifyContent: 'center' }}>
                          <Plus size={16} /> Add Question to Module
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <button onClick={addModule} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px', background: T.surface2, border: `1px dashed ${T.accent}`, borderRadius: '12px', color: T.accent, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', justifyContent: 'center', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
              <Plus size={18} /> Add New Module
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}