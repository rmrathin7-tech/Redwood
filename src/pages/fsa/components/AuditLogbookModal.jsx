/**
 * src/pages/fsa/components/AuditLogbookDrawer.jsx
 * * ENTERPRISE AUDIT LOGBOOK & EXTRACTION HISTORY DRAWER
 * Implements a structured slide-out review panel rendering low-confidence metric flags, 
 * period extraction summaries, and operational user audit history paths.
 */

import React from 'react';
import { BookOpen, AlertTriangle, CheckCircle2, Clock, FileText } from 'lucide-react';
import { formatIN } from '../utils/fsaFormatters';

export default function AuditLogbookDrawer({ 
  isOpen, 
  onClose, 
  auditLogs = [], 
  onNavigateToRecord 
}) {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      
      {/* Drawer Container Panel */}
      <div 
        style={{ width: '100%', maxWidth: 540, background: '#0b0f19', borderLeft: '1px solid #6366f1', display: 'flex', flexDirection: 'column', height: '100vh', boxShadow: '-10px 0 30px rgba(0,0,0,0.5)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header Header block */}
        <div style={{ padding: '20px 24px', background: 'rgba(15,23,42,0.8)', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ padding: 6, background: 'rgba(99,102,241,0.1)', color: '#6366f1', borderRadius: 6 }}>
              <BookOpen size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#f8fafc' }}>Extraction Logbook & Audit Trail</h3>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0 0' }}>
                Review low-confidence records automatically populated below <strong>IF (if applicable)</strong> baseline parameters trigger an alert.
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        {/* History Stream List Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {auditLogs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 12, fontStyle: 'italic', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: 8 }}>
              No operational anomalies or low-confidence parsing notifications registered.
            </div>
          ) : (
            auditLogs.map((log) => {
              const isLowConfidence = log.confidenceScore !== null && log.confidenceScore < 0.75;
              
              return (
                <div 
                  key={log.id} 
                  style={{ background: 'rgba(15,23,42,0.4)', border: `1px solid ${isLowConfidence ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.05)'}`, borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: isLowConfidence ? '#f59e0b' : '#6366f1', fontWeight: 700 }}>
                      {isLowConfidence ? <AlertTriangle size={13} /> : <FileText size={13} />}
                      <span>[{log.docKey ? log.docKey.toUpperCase() : 'SYSTEM'}] {log.itemKey}</span>
                    </span>

                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748b' }}>
                      <Clock size={11} />
                      <span>{log.timestamp}</span>
                    </span>
                  </div>

                  <p style={{ fontSize: 12, color: '#cbd5e1', margin: 0, lineHeight: 1.4 }}>
                    {log.message || `Updated parameter vector value directly to ${formatIN(log.value)}`}
                  </p>

                  {log.confidenceScore !== null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>Extraction ML Accuracy Index:</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: isLowConfidence ? '#f59e0b' : '#10b981' }}>
                        {Math.round(log.confidenceScore * 100)}%
                      </span>
                    </div>
                  )}

                  {onNavigateToRecord && (
                    <button
                      onClick={() => {
                        onClose();
                        onNavigateToRecord(log.docKey, log.itemKey);
                      }}
                      style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: '#00f0ff', fontSize: 11, fontWeight: 700, padding: 0, marginTop: 4, cursor: 'pointer' }}
                    >
                      Inspect Source Vector Cell ➔
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Advisory Context Footer Footer */}
        <div style={{ padding: '12px 24px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: 11, color: '#64748b', textAlign: 'center' }}>
          <span>💡 Synchronizing target model variables flushes state logging queues automatically.</span>
        </div>
      </div>
    </div>
  );
}