import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../../firebase.js'; 
import { collection, query, where, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { Link as LinkIcon, Activity, ExternalLink, FileText, TrendingUp, AlertCircle, RefreshCw, Maximize, X, Plus, Minus } from 'lucide-react';
import BlockWrapper from './BlockWrapper.jsx';

// ââ NATIVE FSA COMPONENT IMPORTS ââ
import FSAStatements from '../../fsa/components/FSAStatements.jsx';
import { DEFAULT_CONFIG_SCHEMAS } from '../../fsa/config/defaultSchema.js';

export default function FSALinkBlock({
  block, value, onChange, lockedBy, isDark = false, projectId
}) {
  const [searchParams] = useSearchParams();
  
  const [availableFSAs, setAvailableFSAs] = useState([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  
  // Holds the real-time data of the linked FSA
  const [liveFSAData, setLiveFSAData] = useState(null);
  const [loadingLive, setLoadingLive] = useState(false);

  // Controls
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCashflow, setShowCashflow] = useState(false);

  // ââ DYNAMIC THEME ENGINE (Fully supports Light & Dark Mode) ââ
  const t = {
    bg:            isDark ? '#0d1117'                : '#ffffff',
    surface:       isDark ? '#161b22'                : '#f8fafc',
    surface2:      isDark ? '#21262d'                : '#f1f5f9',
    border:        isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
    text:          isDark ? '#e2e8f0'                : '#111827',
    textMuted:     isDark ? '#94a3b8'                : '#64748b',
    accent:        '#3b82f6',
    accentLight:   isDark ? 'rgba(59,130,246,0.1)'   : '#eff6ff',
    success:       '#10b981',
    warning:       '#f59e0b',
  };

  // 1. Fetch available FSAs for the modal
  const fetchAvailableFSAs = async () => {
    const currentProjectId = projectId || searchParams.get('project') || searchParams.get('projectId');
    if (!currentProjectId) return;

    setLoadingList(true);
    try {
      const fsas = [];
      const fsaRef = collection(db, 'projects', currentProjectId, 'fsa');
      const snap = await getDocs(fsaRef);
      snap.forEach(doc => fsas.push({ id: doc.id, ...doc.data() }));

      if (fsas.length === 0) {
        const rootQ = query(collection(db, 'fsas'), where('projectId', '==', currentProjectId));
        const rootSnap = await getDocs(rootQ);
        rootSnap.forEach(doc => fsas.push({ id: doc.id, ...doc.data() }));
      }

      setAvailableFSAs(fsas);
    } catch (err) {
      console.error('Failed to fetch FSAs:', err);
    }
    setLoadingList(false);
  };

  // 2. Listen to the Live FSA data if one is linked
  useEffect(() => {
    const currentProjectId = projectId || searchParams.get('project') || searchParams.get('projectId');
    
    if (!value || !currentProjectId) {
      setLiveFSAData(null);
      return;
    }

    setLoadingLive(true);
    
    const unsub = onSnapshot(doc(db, 'projects', currentProjectId, 'fsa', value), (docSnap) => {
      if (docSnap.exists()) {
        setLiveFSAData({ id: docSnap.id, ...docSnap.data() });
        setLoadingLive(false);
      } else {
        onSnapshot(doc(db, 'fsas', value), (rootSnap) => {
            if (rootSnap.exists()) {
                setLiveFSAData({ id: rootSnap.id, ...rootSnap.data() });
            } else {
                setLiveFSAData({ _error: 'FSA Document not found or deleted.' });
            }
            setLoadingLive(false);
        });
      }
    }, (err) => {
      console.error('Live FSA stream error:', err);
      setLoadingLive(false);
    });

    return () => unsub();
  }, [value, searchParams, projectId]);

  // ââ REMOVE CASHFLOW BY DEFAULT ââ
  const getFilteredSchemas = () => {
    const baseSchema = liveFSAData?.configSchemas || DEFAULT_CONFIG_SCHEMAS;
    if (showCashflow) return baseSchema;
    
    const docs = baseSchema.documents || [
      { key: 'pnl', label: 'Profit & Loss Statement' },
      { key: 'bs', label: 'Balance Sheet' },
      { key: 'cashflow', label: 'Cash Flow Statement' }
    ];

    return {
      ...baseSchema,
      documents: docs.filter(d => d.key !== 'cashflow')
    };
  };

  const handleLinkFSA = (fsaId) => {
    if (onChange) onChange(block.dataPath, fsaId);
    setIsSelecting(false);
  };

  const handleUnlink = () => {
    if (lockedBy) return;
    if (window.confirm('Are you sure you want to unlink this FSA from the memo?')) {
      if (onChange) onChange(block.dataPath, null);
    }
  };

  return (
    <BlockWrapper block={block} lockedBy={lockedBy} isDark={isDark}>
      <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden', background: t.bg }}>
        
        {/* --- STATE 1: NO FSA LINKED --- */}
        {!value && !isSelecting && (
          <div style={{ padding: '40px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: t.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.accent }}>
              <LinkIcon size={24} />
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px', color: t.text, fontSize: '0.95rem' }}>No Financial Analysis Linked</h4>
              <p style={{ margin: 0, color: t.textMuted, fontSize: '0.8rem', maxWidth: 300 }}>
                {block.desc || 'Connect an FSA module to display live financial statements natively within this memo.'}
              </p>
            </div>
            {!lockedBy && (
              <button
                onClick={() => { fetchAvailableFSAs(); setIsSelecting(true); }}
                style={{ marginTop: 8, background: t.accent, color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Activity size={16} /> Select FSA Module
              </button>
            )}
          </div>
        )}

        {/* --- STATE 2: SELECTING AN FSA --- */}
        {!value && isSelecting && (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h4 style={{ margin: 0, color: t.text, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={16} color={t.accent} /> Select Project FSA
              </h4>
              <button onClick={() => setIsSelecting(false)} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
            </div>

            {loadingList ? (
              <div style={{ padding: 30, textAlign: 'center', color: t.textMuted, fontSize: '0.8rem' }}><RefreshCw size={16} className="spin" /> Loading available FSAs...</div>
            ) : availableFSAs.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: t.textMuted, fontSize: '0.8rem', background: t.surface, borderRadius: 8 }}>
                No FSA documents found for this project. Please create one in the Module Hub first.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {availableFSAs.map(fsa => (
                  <div key={fsa.id}
                    onClick={() => handleLinkFSA(fsa.id)}
                    style={{ padding: '12px 16px', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = t.accent}
                    onMouseLeave={e => e.currentTarget.style.borderColor = t.border}
                  >
                    <div>
                      <div style={{ color: t.text, fontWeight: 600, fontSize: '0.85rem' }}>
                        {fsa.title || fsa.name || fsa.fsaName || 'Financial Statement Analysis'}
                      </div>
                      <div style={{ color: t.textMuted, fontSize: '0.7rem', marginTop: 2 }}>
                        Last updated: {fsa.updatedAt ? new Date(fsa.updatedAt.toDate()).toLocaleDateString() : 'Just now'}
                      </div>
                    </div>
                    <button style={{ background: t.accentLight, color: t.accent, border: 'none', padding: '4px 12px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                      Link
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- STATE 3: FSA LINKED (COMPACT PREVIEW) --- */}
        {value && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 20px', background: t.surface, borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Activity size={16} color={t.accent} />
                <span style={{ color: t.text, fontWeight: 700, fontSize: '0.9rem' }}>
                  {liveFSAData?.title || liveFSAData?.name || liveFSAData?.fsaName || 'Loading FSA...'}
                </span>
                {loadingLive && <RefreshCw size={12} color={t.textMuted} className="spin" />}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {!lockedBy && (
                  <button onClick={handleUnlink} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '0.75rem', cursor: 'pointer' }}>
                    Unlink
                  </button>
                )}
                <button
                  onClick={() => window.open(`/fsa?project=${projectId || searchParams.get('project')}&fsa=${value}`, '_blank')}
                  style={{ background: t.accentLight, color: t.accent, border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  Full FSA <ExternalLink size={12} />
                </button>
              </div>
            </div>

            <div style={{ padding: '40px 20px', background: t.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ padding: '16px 24px', background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, textAlign: 'center', width: 160, boxShadow: `0 4px 20px rgba(0,0,0,0.15)` }}>
                      <FileText size={28} color={t.accent} style={{ marginBottom: 12, opacity: 0.9 }} />
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: t.text }}>Profit & Loss</div>
                  </div>
                  <div style={{ padding: '16px 24px', background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, textAlign: 'center', width: 160, boxShadow: `0 4px 20px rgba(0,0,0,0.15)` }}>
                      <Activity size={28} color={t.success} style={{ marginBottom: 12, opacity: 0.9 }} />
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: t.text }}>Balance Sheet</div>
                  </div>
              </div>
              
              <p style={{ fontSize: '0.85rem', color: t.textMuted, margin: 0, fontWeight: 500 }}>
                 Live Financial Matrix is active and embedded.
              </p>
              
              <button 
                  onClick={() => setIsExpanded(true)} 
                  style={{ background: t.accent, color: '#fff', border: 'none', padding: '12px 32px', borderRadius: 8, fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', boxShadow: `0 8px 24px ${t.accentLight}`, transition: 'all 0.2s' }}
              >
                  <Maximize size={18} /> Expand Full Matrix
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ââ STATE 4: THE FULL SCREEN MATRIX MODAL ââ */}
      {isExpanded && createPortal(
         <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2vh 2vw', animation: 'imModalFade 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
            <div style={{ width: '100%', height: '100%', maxWidth: 1600, background: t.bg, borderRadius: 16, border: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
               
               {/* Modal Header */}
               <div style={{ padding: '16px 32px', background: t.surface, borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                     <Activity size={20} color={t.accent} />
                     <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: t.text }}>
                        {liveFSAData?.title || liveFSAData?.name || 'Financial Statements Matrix'}
                     </h2>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                     <button onClick={() => setShowCashflow(!showCashflow)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: showCashflow ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)', border: `1px solid ${showCashflow ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}`, color: showCashflow ? '#ef4444' : t.accent, padding: '8px 16px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
                         {showCashflow ? <Minus size={16} /> : <Plus size={16} />}
                         {showCashflow ? 'Remove Cash Flow' : 'Add Cash Flow'}
                     </button>
                     
                     <div style={{ width: 1, height: 24, background: t.border }} />
                     
                     <button onClick={() => setIsExpanded(false)} style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                         <X size={28} />
                     </button>
                  </div>
               </div>

               {/* Modal Body with the Native FSA Statements */}
               <div className="fsa-matrix-wrapper" style={{ flex: 1, overflowY: 'auto', padding: 40, background: t.bg }}>
                   {liveFSAData?._error ? (
                      <div style={{ color: t.warning }}>{liveFSAData._error}</div>
                   ) : (
                      <FSAStatements
                        /* ââ FIX 1: READ FINANCIALDATA FIRST TO PREVENT THE "0" BUG ââ */
                        projectData={liveFSAData?.financialData || liveFSAData?.data || {}}
                        configSchemas={getFilteredSchemas()}
                        reclassMap={liveFSAData?.reclassMap || {}}
                        activeEntityType={liveFSAData?.activeEntityType || liveFSAData?.entityType || 'pvtLtd'}
                        activeYearsList={liveFSAData?.activeYearsList || liveFSAData?.years || []}
                        activeItemsMap={liveFSAData?.activeItemsMap || {}}
                      />
                   )}
               </div>
            </div>

            {/* ââ FIX 2: SAAS CSS INJECTION (MAPS THEME VARIABLES FOR COMPONENT NATIVITY) ââ */}
            <style>{`
               @keyframes imModalFade {
                  from { opacity: 0; transform: scale(0.98) translateY(10px); }
                  to { opacity: 1; transform: scale(1) translateY(0); }
               }
               
               /* Inject CSS Root Variables so FSAStatements can read Light/Dark mode colors natively! */
               .fsa-matrix-wrapper {
                  --bg-primary: ${t.bg};
                  --surface-color: ${t.surface};
                  --border-color: ${t.border};
                  --text-primary: ${t.text};
                  --text-secondary: ${t.textMuted};
                  --text-muted: ${t.textMuted};
                  --accent-color: ${t.accent};
                  --success-color: ${t.success};
                  color: var(--text-primary);
               }

               /* Hide the generic borders from the outer wrapper */
               .fsa-matrix-wrapper > div {
                   border: none !important;
                   background: transparent !important;
               }

               /* Auto-Style Native HTML Elements inside the component */
               .fsa-matrix-wrapper button {
                   background: var(--surface-color);
                   color: var(--text-primary);
                   border: 1px solid var(--border-color);
                   border-radius: 8px;
                   padding: 8px 16px;
                   font-size: 0.8rem;
                   font-weight: 600;
                   cursor: pointer;
                   transition: all 0.2s;
               }
               
               .fsa-matrix-wrapper button:hover {
                   border-color: var(--accent-color);
                   color: var(--accent-color);
               }

               /* Auto-detect the "Active" state buttons in FSAStatements (which use inline accent color) */
               .fsa-matrix-wrapper button[style*="var(--accent-color)"],
               .fsa-matrix-wrapper button[style*="rgb(59, 130, 246)"] {
                   background: rgba(59, 130, 246, 0.1) !important;
                   border-color: var(--accent-color) !important;
               }

               .fsa-matrix-wrapper select {
                   background-color: var(--surface-color) !important;
                   background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") !important;
                   background-repeat: no-repeat !important;
                   background-position: right 12px center !important;
                   -webkit-appearance: none !important;
                   appearance: none !important;
                   color: var(--text-primary) !important;
                   border: 1px solid var(--border-color) !important;
                   border-radius: 8px !important;
                   padding: 8px 32px 8px 16px !important; /* Extra padding on right for the custom arrow */
                   font-size: 0.8rem !important;
                   font-weight: 600 !important;
                   outline: none !important;
                   cursor: pointer !important;
                   transition: all 0.2s ease !important;
               }

               .fsa-matrix-wrapper select option {
                   background-color: var(--bg-tertiary);
                   color: var(--text-primary);
               }

               .fsa-matrix-wrapper select:focus {
                   border-color: var(--accent-color) !important;
                   box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15) !important;
               }

               /* Top Control Panel Layout Fixes */
               .fsa-matrix-wrapper > div > div:first-child {
                   display: flex;
                   flex-wrap: wrap;
                   gap: 16px;
                   margin-bottom: 24px;
                   padding-bottom: 24px;
                   border-bottom: 1px dashed var(--border-color);
               }
            `}</style>
         </div>,
         document.body
      )}
    </BlockWrapper>
  );
}