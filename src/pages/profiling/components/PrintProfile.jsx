import React from 'react';
import { useProfilingEditor } from '../hooks/useProfilingEditor';
import { X, Printer, Loader2, Building2 } from 'lucide-react';

export default function PrintProfile({ projectId, taskId, onClose }) {
  const { taskData, loading } = useProfilingEditor(projectId, taskId);

  if (loading || !taskData) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} className="animate-spin" color="#ec4899" />
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#e2e8f0', zIndex: 10000, overflowY: 'auto', fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      
      {/* Floating Action Bar (Hidden when printing) */}
      <div className="print-hide" style={{ position: 'sticky', top: 0, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(0,0,0,0.1)', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(236,72,153,0.15) 0%, rgba(190,24,93,0.15) 100%)', color: '#ec4899', padding: '10px', borderRadius: '10px', border: '1px solid rgba(236,72,153,0.2)' }}>
            <Building2 size={20} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', fontWeight: 800, letterSpacing: '-0.3px' }}>{taskData.companyName}</h2>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Print Compiler Preview</span>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(236,72,153,0.3)', transition: 'all 0.2s ease' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
            <Printer size={18} /> Print Document
          </button>
          <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: '#fff', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s ease' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
            <X size={18} /> Close
          </button>
        </div>
      </div>

      {/* A4 Document Area */}
      <div style={{ padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
        <div className="print-document" style={{ background: '#fff', width: '100%', maxWidth: '210mm', minHeight: '297mm', padding: '20mm', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', borderRadius: '8px', position: 'relative' }}>
          
          {/* Document Header */}
          <div style={{ borderBottom: '3px solid #ec4899', paddingBottom: '24px', marginBottom: '36px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 900, letterSpacing: '2.5px', color: '#ec4899', textTransform: 'uppercase', marginBottom: '10px' }}>REDWOOD PARTNERS</div>
              <h1 style={{ margin: 0, fontSize: '2.6rem', color: '#0f172a', fontWeight: 800, letterSpacing: '-1px' }}>{taskData.companyName}</h1>
            </div>
            <div style={{ textAlign: 'right', color: '#64748b', fontSize: '0.9rem' }}>
              <strong>Status:</strong> <span style={{ textTransform: 'capitalize' }}>{taskData.status}</span><br />
              <strong>Exported:</strong> {new Date().toLocaleDateString()}
            </div>
          </div>

          {/* Document Body */}
          <div 
            className="print-content-render"
            style={{ color: '#1e293b', lineHeight: '1.8', fontSize: '11pt' }}
            dangerouslySetInnerHTML={{ __html: taskData.content || '<p style="color:#94a3b8;font-style:italic;">No intelligence compiled for this target yet.</p>' }} 
          />
        </div>
      </div>

      {/* CSS to control OS native printing logic */}
      <style>{`
        @media print {
          @page { margin: 0; size: auto; }
          body { background: #fff; }
          .print-hide { display: none !important; }
          .print-document { 
            box-shadow: none !important; 
            padding: 15mm 20mm !important; 
            margin: 0 !important;
            border-radius: 0 !important;
            max-width: none !important;
            width: 100% !important;
          }
          .print-content-render h1, .print-content-render h2 { break-after: avoid; color: #0f172a; margin-top: 24px; }
          .print-content-render img { max-width: 100%; break-inside: avoid; border-radius: 6px; }
          .print-content-render p { orphans: 3; widows: 3; color: #334155; }
        }
      `}</style>
    </div>
  );
}