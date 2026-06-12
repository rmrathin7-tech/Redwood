import React, { useState, useEffect, useMemo } from 'react';
import { X, Building2, Target, Link2, Users, Briefcase } from 'lucide-react';
import { db } from "../../../firebase.js";
import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';

export default function SRLCreationWizard({ onClose, isDark = true }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);

  // Form State
  const [formData, setFormData] = useState({
    companyName: '',
    stage: 'idea', // 'idea' | 'revenue'
    type: 'internal', // 'internal' | 'client'
    linkMode: 'standalone', // 'standalone' | 'existing' | 'new'
    selectedProjectId: '',
    newProjectName: ''
  });

  const T = useMemo(() => ({
    bg:         isDark ? '#060910' : '#f1f5f9',
    surface:    isDark ? '#0d1117' : '#ffffff',
    surface2:   isDark ? '#161b22' : '#f8fafc',
    surface3:   isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
    border:     isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    text:       isDark ? '#f1f5f9' : '#0f172a',
    textMuted:  isDark ? '#64748b' : '#94a3b8',
    accent:     '#3b82f6', // SRL Blue
  }), [isDark]);

  // Fetch existing projects for the linking dropdown
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        // Replace 'projects' with your actual ModuleHub projects collection name if different
        const snap = await getDocs(collection(db, 'projects'));
        setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching projects:", err);
      }
    };
    fetchProjects();
  }, []);

  const handleCreate = async () => {
    if (!formData.companyName) return alert("Company Name is required.");
    setLoading(true);

    try {
      let linkedProjectId = null;
      let linkedProjectName = 'Standalone';

      // 1. Handle Project Linking Logic
      if (formData.linkMode === 'existing' && formData.selectedProjectId) {
        linkedProjectId = formData.selectedProjectId;
        linkedProjectName = projects.find(p => p.id === formData.selectedProjectId)?.name || 'Linked Project';
      } else if (formData.linkMode === 'new' && formData.newProjectName) {
        // Create a new project in the ModuleHub first
        const newProjRef = await addDoc(collection(db, 'projects'), {
          name: formData.newProjectName,
          createdAt: serverTimestamp()
        });
        linkedProjectId = newProjRef.id;
        linkedProjectName = formData.newProjectName;
      }

      // 2. Create the SRL Document
      await addDoc(collection(db, 'srl-assessments'), {
        companyName: formData.companyName,
        stage: formData.stage,
        type: formData.type,
        linkedProjectId,
        linkedProjectName,
        totalScore: 0,
        responses: {}, // Will be populated by the Workspace
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      onClose();
    } catch (err) {
      console.error("Error creating SRL:", err);
      alert("Failed to create assessment.");
    } finally {
      setLoading(false);
    }
  };

  const renderOptionCard = (label, description, icon, isSelected, onClick) => (
    <div 
      onClick={onClick}
      style={{
        flex: 1, padding: '16px', borderRadius: '12px', cursor: 'pointer',
        background: isSelected ? `${T.accent}15` : T.surface2,
        border: `1px solid ${isSelected ? T.accent : T.border}`,
        transition: 'all 0.2s'
      }}
    >
      <div style={{ color: isSelected ? T.accent : T.textMuted, marginBottom: '12px' }}>{icon}</div>
      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: T.text, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '0.75rem', color: T.textMuted, lineHeight: 1.4 }}>{description}</div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DN Sans", sans-serif' }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '16px', width: '600px', maxWidth: '95vw', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'imFadeIn 0.2s ease' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: T.text }}>Create Assessment</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer' }}><X size={18} /></button>
        </div>
        
        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', maxHeight: '70vh', overflowY: 'auto' }}>
          
          {/* Identity */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Company / Startup Name</label>
            <div style={{ position: 'relative' }}>
              <Building2 size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
              <input 
                type="text" autoFocus placeholder="e.g., Dhvani Agri-Tech" 
                value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})}
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px 12px 40px', borderRadius: '8px', background: T.bg, border: `1px solid ${T.border}`, color: T.text, outline: 'none', fontSize: '0.9rem' }}
              />
            </div>
          </div>

          {/* Stage Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Development Stage</label>
            <div style={{ display: 'flex', gap: '16px' }}>
              {renderOptionCard('Idea Stage', 'Pre-revenue, prototype, or early MVP. Uses 20% weight for Problem/Solution.', <Target size={20} />, formData.stage === 'idea', () => setFormData({...formData, stage: 'idea'}))}
              {renderOptionCard('Revenue Stage', 'Post-launch, active customers. Emphasizes Traction and GTM strategy.', <Briefcase size={20} />, formData.stage === 'revenue', () => setFormData({...formData, stage: 'revenue'}))}
            </div>
          </div>

          {/* Type Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Assessment Type</label>
            <div style={{ display: 'flex', gap: '16px' }}>
              {renderOptionCard('Internal Analyst', 'For Redwood team members to score based on intake forms and calls.', <Users size={20} />, formData.type === 'internal', () => setFormData({...formData, type: 'internal'}))}
              {renderOptionCard('Client / Founder', 'Generates a clean submission form for the founder to fill out.', <Link2 size={20} />, formData.type === 'client', () => setFormData({...formData, type: 'client'}))}
            </div>
          </div>

          {/* Hierarchy & Linking */}
          <div style={{ padding: '16px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '12px' }}>ModuleHub Integration</label>
            <select 
              value={formData.linkMode} onChange={e => setFormData({...formData, linkMode: e.target.value})}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', background: T.bg, border: `1px solid ${T.border}`, color: T.text, outline: 'none', fontSize: '0.85rem', marginBottom: '12px', cursor: 'pointer' }}
            >
              <option value="standalone">Do not link (Standalone Assessment)</option>
              <option value="existing">Link to existing ModuleHub Project</option>
              <option value="new">Create new ModuleHub Project & Link</option>
            </select>

            {formData.linkMode === 'existing' && (
              <select 
                value={formData.selectedProjectId} onChange={e => setFormData({...formData, selectedProjectId: e.target.value})}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', background: T.bg, border: `1px solid ${T.border}`, color: formData.selectedProjectId ? T.text : T.textMuted, outline: 'none', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                <option value="">-- Select Project --</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}

            {formData.linkMode === 'new' && (
              <input 
                type="text" placeholder="Enter new project name..." 
                value={formData.newProjectName} onChange={e => setFormData({...formData, newProjectName: e.target.value})}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', background: T.bg, border: `1px solid ${T.border}`, color: T.text, outline: 'none', fontSize: '0.85rem' }}
              />
            )}
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '20px 24px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: '12px', justifyContent: 'flex-end', background: T.surface2 }}>
          <button onClick={onClose} disabled={loading} style={{ padding: '12px 24px', borderRadius: '8px', border: `1px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
          <button onClick={handleCreate} disabled={loading} style={{ padding: '12px 32px', borderRadius: '8px', background: T.accent, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Creating...' : 'Create SRL'}
          </button>
        </div>
      </div>
    </div>
  );
}