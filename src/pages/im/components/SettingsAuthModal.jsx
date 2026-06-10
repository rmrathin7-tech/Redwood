import React, { useState, useEffect } from 'react';
import { Lock, Scissors, KeyRound, ArrowRight, ShieldAlert, X, Edit3, Settings2 } from 'lucide-react';
import { db } from '../../../firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

export default function SettingsAuthModal({ imId, projectId, projectName, isDark = true, onClose }) {
  const navigate = useNavigate();
  const [view, setView] = useState('menu'); // 'menu', 'auth-master', 'auth-dossier', 'auth-change', 'change-pins'
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  
  // States for changing PINs
  const [newMasterPin, setNewMasterPin] = useState('');
  const [newDossierPin, setNewDossierPin] = useState('');
  const [newSuperPin, setNewSuperPin] = useState('');

  const T = {
    bg:         isDark ? '#0d1117' : '#ffffff',
    surface:    isDark ? '#161b22' : '#f9fafb',
    border:     isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
    text:       isDark ? '#f1f5f9' : '#0f172a',
    textMuted:  isDark ? '#64748b' : '#94a3b8',
    accent:     '#ef4444',
    green:      '#10b981',
    amber:      '#f59e0b',
  };

  // ── 1. BOOTSTRAP PINS ON LOAD ──
  useEffect(() => {
    const bootstrapSecurity = async () => {
      const ref = doc(db, 'config', 'security');
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        // If security doc doesn't exist, create it with default 0000
        await setDoc(ref, {
          masterPin: '0000',
          dossierPin: '0000',
          superPin: '0000'
        });
      }
    };
    bootstrapSecurity();
  }, []);

  // ── 2. HANDLE PIN SUBMISSION ──
  const handleAuthSubmit = async () => {
    setError('');
    const ref = doc(db, 'config', 'security');
    const snap = await getDoc(ref);
    if (!snap.exists()) return setError('Security config missing.');
    
    const { masterPin, dossierPin, superPin } = snap.data();

    if (view === 'auth-master') {
      if (pinInput === masterPin) {
        navigate(`/im-settings?im=${imId}&project=${projectId}&name=${encodeURIComponent(projectName)}&mode=master`);
      } else setError('Incorrect Master PIN');
    } 
    else if (view === 'auth-dossier') {
      if (pinInput === dossierPin) {
        navigate(`/im-settings?im=${imId}&project=${projectId}&name=${encodeURIComponent(projectName)}&mode=dossier`);
      } else setError('Incorrect Dossier PIN');
    }
    else if (view === 'auth-change') {
      if (pinInput === superPin) {
        setView('change-pins');
        setPinInput('');
      } else setError('Incorrect Super PIN');
    }
  };

  // ── 3. SAVE NEW PINS ──
  const handleSavePins = async () => {
    if (!newMasterPin || !newDossierPin || !newSuperPin) {
      setError('All fields are required.');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'security'), {
        masterPin: newMasterPin,
        dossierPin: newDossierPin,
        superPin: newSuperPin
      });
      alert('PINs updated successfully.');
      onClose();
    } catch (err) {
      setError('Failed to update PINs.');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAuthSubmit();
  };

  // ── RENDER ──
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 16, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
        
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.surface }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings2 size={16} style={{ color: T.textMuted }} /> Configuration Protocol
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', padding: 4, display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          
          {/* MENU VIEW */}
          {view === 'menu' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button 
                onClick={() => { setView('auth-master'); setPinInput(''); setError(''); }}
                style={btnStyle(T, true)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Lock size={16} color={T.accent} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Master Schema</div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>Edit the global blueprint for all future dossiers.</div>
                  </div>
                </div>
                <ArrowRight size={14} color={T.textMuted} />
              </button>

              <button 
                onClick={() => { setView('auth-dossier'); setPinInput(''); setError(''); }}
                style={btnStyle(T, false)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Edit3 size={16} color={T.amber} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Local Dossier Schema</div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>Edit the structure for this specific IM only.</div>
                  </div>
                </div>
                <ArrowRight size={14} color={T.textMuted} />
              </button>

              <div style={{ height: 1, background: T.border, margin: '8px 0' }} />

              <button 
                onClick={() => { setView('auth-change'); setPinInput(''); setError(''); }}
                style={{ ...btnStyle(T, false), background: 'transparent', border: 'none', padding: '8px', opacity: 0.8 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <KeyRound size={14} color={T.textMuted} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.textMuted }}>Change Security PINs</span>
                </div>
              </button>
            </div>
          )}

          {/* AUTHENTICATION VIEW */}
          {view.startsWith('auth-') && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Lock size={20} color={T.accent} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Authentication Required</div>
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>
                  {view === 'auth-master' ? 'Enter Admin PIN to access Master Schema.' : view === 'auth-dossier' ? 'Enter Deal Lead PIN to edit local structure.' : 'Enter Super PIN to modify security settings.'}
                </div>
              </div>

              <input 
                type="password" 
                autoFocus
                placeholder="Enter PIN"
                value={pinInput}
                onChange={e => setPinInput(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, color: T.text, padding: '12px', borderRadius: 8, textAlign: 'center', fontSize: 18, letterSpacing: 6, outline: 'none' }}
              />

              {error && <div style={{ color: T.accent, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><ShieldAlert size={12} /> {error}</div>}

              <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 8 }}>
                <button onClick={() => { setView('menu'); setError(''); }} style={{ flex: 1, padding: '10px', background: 'transparent', border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Back</button>
                <button onClick={handleAuthSubmit} style={{ flex: 1, padding: '10px', background: T.accent, border: 'none', color: '#fff', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Unlock</button>
              </div>
            </div>
          )}

          {/* CHANGE PINS VIEW */}
          {view === 'change-pins' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 4 }}>Update Security PINs</div>
              
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, display: 'block', marginBottom: 4 }}>New Master Schema PIN</label>
                <input type="text" value={newMasterPin} onChange={e => setNewMasterPin(e.target.value)} style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, color: T.text, padding: '8px 12px', borderRadius: 6, outline: 'none' }} />
              </div>
              
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, display: 'block', marginBottom: 4 }}>New Local Dossier PIN</label>
                <input type="text" value={newDossierPin} onChange={e => setNewDossierPin(e.target.value)} style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, color: T.text, padding: '8px 12px', borderRadius: 6, outline: 'none' }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, display: 'block', marginBottom: 4 }}>New Super PIN (For this screen)</label>
                <input type="text" value={newSuperPin} onChange={e => setNewSuperPin(e.target.value)} style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, color: T.text, padding: '8px 12px', borderRadius: 6, outline: 'none' }} />
              </div>

              {error && <div style={{ color: T.accent, fontSize: 12, fontWeight: 600 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => setView('menu')} style={{ flex: 1, padding: '10px', background: 'transparent', border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleSavePins} style={{ flex: 1, padding: '10px', background: T.green, border: 'none', color: '#fff', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Save PINs</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── STYLE HELPER ──
function btnStyle(T, isPrimary) {
  return {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
    background: isPrimary ? T.surface : 'transparent',
    border: `1px solid ${isPrimary ? T.border : 'transparent'}`,
  };
}