import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../../firebase.js'; // Adjust path to your firebase config if needed
import { collection, query, where, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { Link as LinkIcon, Activity, ExternalLink, FileText, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';
import BlockWrapper from './BlockWrapper.jsx';

export default function FSALinkBlock({
  block, value, onChange, lockedBy, isDark = true
}) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  
  const [availableFSAs, setAvailableFSAs] = useState([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  
  // Holds the real-time data of the linked FSA
  const [liveFSAData, setLiveFSAData] = useState(null);
  const [loadingLive, setLoadingLive] = useState(false);

  const t = {
    bg:            isDark ? '#0d1117'                : '#ffffff',
    surface:       isDark ? '#161b22'                : '#f8fafc',
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
    if (!projectId) return;
    setLoadingList(true);
    try {
      const q = query(collection(db, 'fsas'), where('projectId', '==', projectId));
      const snap = await getDocs(q);
      const fsas = [];
      snap.forEach(doc => fsas.push({ id: doc.id, ...doc.data() }));
      setAvailableFSAs(fsas);
    } catch (err) {
      console.error('Failed to fetch FSAs:', err);
    }
    setLoadingList(false);
  };

  // 2. Listen to the Live FSA data if one is linked
  useEffect(() => {
    // "value" represents the linked fsaId stored in the IM
    if (!value) {
      setLiveFSAData(null);
      return;
    }

    setLoadingLive(true);
    const unsub = onSnapshot(doc(db, 'fsas', value), (docSnap) => {
      if (docSnap.exists()) {
        setLiveFSAData({ id: docSnap.id, ...docSnap.data() });
      } else {
        setLiveFSAData({ _error: 'FSA Document not found or deleted.' });
      }
      setLoadingLive(false);
    }, (err) => {
      console.error('Live FSA stream error:', err);
      setLoadingLive(false);
    });

    return () => unsub();
  }, [value]);

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
                {block.desc || 'Connect an FSA module to display live financial summaries and compliance metrics within this memo.'}
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
                      <div style={{ color: t.text, fontWeight: 600, fontSize: '0.85rem' }}>{fsa.name || fsa.fsaName || 'Untitled FSA'}</div>
                      <div style={{ color: t.textMuted, fontSize: '0.7rem', marginTop: 2 }}>Last updated: {fsa.updatedAt ? new Date(fsa.updatedAt.toDate()).toLocaleDateString() : 'Unknown'}</div>
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

        {/* --- STATE 3: FSA LINKED (LIVE WINDOW) --- */}
        {value && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Header Bar */}
            <div style={{ padding: '12px 20px', background: t.surface, borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Activity size={16} color={t.accent} />
                <span style={{ color: t.text, fontWeight: 700, fontSize: '0.9rem' }}>
                  {liveFSAData?.name || liveFSAData?.fsaName || 'Loading FSA...'}
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
                  onClick={() => window.open(`/fsa?project=${projectId}&fsa=${value}`, '_blank')}
                  style={{ background: t.accentLight, color: t.accent, border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  Full FSA <ExternalLink size={12} />
                </button>
              </div>
            </div>

            {/* Live Dashboard Area */}
            <div style={{ padding: 20 }}>
              {liveFSAData?._error ? (
                <div style={{ color: t.warning, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                  <AlertCircle size={16} /> {liveFSAData._error}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
                  
                  {/* Metric Card 1: Revenue / Topline */}
                  <div style={{ padding: 16, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8 }}>
                    <div style={{ fontSize: '0.7rem', color: t.textMuted, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>Total Revenue</div>
                    <div style={{ fontSize: '1.2rem', color: t.text, fontWeight: 700 }}>
                      {liveFSAData?.data?.summary?.revenue ? `₹${liveFSAData.data.summary.revenue.toLocaleString()}` : '--'}
                    </div>
                  </div>

                  {/* Metric Card 2: EBITDA */}
                  <div style={{ padding: 16, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8 }}>
                    <div style={{ fontSize: '0.7rem', color: t.textMuted, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>EBITDA</div>
                    <div style={{ fontSize: '1.2rem', color: liveFSAData?.data?.summary?.ebitda < 0 ? '#ef4444' : t.success, fontWeight: 700 }}>
                      {liveFSAData?.data?.summary?.ebitda ? `₹${liveFSAData.data.summary.ebitda.toLocaleString()}` : '--'}
                    </div>
                  </div>

                  {/* Metric Card 3: Status/Compliance */}
                  <div style={{ padding: 16, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8 }}>
                    <div style={{ fontSize: '0.7rem', color: t.textMuted, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>FSA Status</div>
                    <div style={{ fontSize: '0.9rem', color: t.text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: liveFSAData?.status === 'Finalized' ? t.success : t.warning }} />
                      {liveFSAData?.status || 'Draft In Progress'}
                    </div>
                  </div>

                </div>
              )}
              <div style={{ marginTop: 16, fontSize: '0.7rem', color: t.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={12} /> Data is streaming live from the Financial Statement Analysis module.
              </div>
            </div>
          </div>
        )}

      </div>
    </BlockWrapper>
  );
}
