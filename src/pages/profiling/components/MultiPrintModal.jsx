import React, { useState, useMemo } from 'react';
import { X, Printer, Search, CheckSquare, Square, Building2, FileText, ChevronRight } from 'lucide-react';

export default function MultiPrintModal({ tasks, isDark, onClose }) {
  const [step, setStep] = useState('select'); // 'select' | 'preview'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  // Filter tasks based on search
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => 
      t.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.status?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [tasks, searchQuery]);

  const handleSelectAll = () => {
    if (selectedIds.length === filteredTasks.length && filteredTasks.length > 0) {
      setSelectedIds([]); // Deselect all
    } else {
      setSelectedIds(filteredTasks.map(t => t.id)); // Select all
    }
  };

  const toggleTask = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]);
  };

  const handleProceed = () => {
    if (selectedIds.length === 0) return alert("Please select at least one target to print.");
    setStep('preview');
  };

  // ── STEP 2: PRINT PREVIEW ENGINE ──
  if (step === 'preview') {
    const selectedTasks = tasks.filter(t => selectedIds.includes(t.id));
    return (
      <div className="print-preview-container" style={{ position: 'fixed', inset: 0, background: '#e2e8f0', zIndex: 10000, overflowY: 'auto', fontFamily: "'Open Sans', sans-serif" }}>
        
        {/* Floating Action Bar */}
        <div className="print-hide" style={{ position: 'sticky', top: 0, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(0,0,0,0.1)', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => setStep('select')} style={{ background: '#f1f5f9', border: 'none', padding: 8, borderRadius: 8, cursor: 'pointer', color: '#64748b' }}>
              <ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', fontWeight: 800 }}>Batch Print Compiler</h2>
              <span style={{ fontSize: '0.8rem', color: '#ec4899', fontWeight: 700, textTransform: 'uppercase' }}>{selectedTasks.length} Profiles Selected</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(236,72,153,0.3)' }}>
              <Printer size={18} /> Print Document(s)
            </button>
            <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: '#fff', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
              <X size={18} /> Cancel
            </button>
          </div>
        </div>

        {/* A4 Document Loop */}
        <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '40px' }}>
          {selectedTasks.map((task, idx) => (
            <div key={task.id} className="print-document" style={{ background: '#fff', width: '100%', maxWidth: '210mm', minHeight: '297mm', padding: '20mm', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', borderRadius: '8px', position: 'relative' }}>
              
              <div style={{ borderBottom: '3px solid #ec4899', paddingBottom: '24px', marginBottom: '36px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 900, letterSpacing: '2.5px', color: '#ec4899', textTransform: 'uppercase', marginBottom: '10px' }}>REDWOOD PARTNERS</div>
                  <h1 style={{ margin: 0, fontSize: '2.6rem', color: '#0f172a', fontWeight: 800, letterSpacing: '-1px' }}>{task.companyName}</h1>
                </div>
                <div style={{ textAlign: 'right', color: '#64748b', fontSize: '0.9rem' }}>
                  <strong>Status:</strong> <span style={{ textTransform: 'capitalize' }}>{task.status}</span><br />
                  <strong>Exported:</strong> {new Date().toLocaleDateString()}
                </div>
              </div>

              <div 
                className="print-content-render"
                style={{ color: '#1e293b', lineHeight: '1.6', fontSize: '12pt' }}
                dangerouslySetInnerHTML={{ __html: task.content || '<p style="color:#94a3b8;font-style:italic;">No intelligence compiled for this target yet.</p>' }} 
              />
            </div>
          ))}
        </div>

        {/* OS Native Printing CSS & Document Formatting */}
        <style>{`
          /* Standardized Document Formatting (Visible in both Preview and Print) */
          .print-content-render {
            font-family: 'Open Sans', sans-serif !important;
            font-size: 12pt !important;
          }
          .print-content-render p, .print-content-render span, .print-content-render li { 
            font-size: 12pt !important; 
            margin-bottom: 12px; 
            color: #1e293b !important;
          }
          
          /* Scaled Headings */
          .print-content-render h1 { font-size: 24pt !important; margin-bottom: 12px; margin-top: 24px; color: #0f172a; font-weight: 800; }
          .print-content-render h2 { font-size: 18pt !important; margin-bottom: 10px; margin-top: 20px; color: #0f172a; font-weight: 700; }
          .print-content-render h3 { font-size: 14pt !important; margin-bottom: 8px; margin-top: 16px; color: #1e293b; font-weight: 700; }
          
          /* Strict Table Formatting - NO OVERFLOW ALLOWED */
          .print-content-render table {
            width: 100% !important;
            max-width: 100% !important;
            border-collapse: collapse !important;
            margin: 20px 0 !important;
            page-break-inside: auto;
            table-layout: fixed !important; /* CRITICAL: Forces table to obey container width */
          }
          .print-content-render tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          .print-content-render th, .print-content-render td {
            border: 1px solid #94a3b8 !important;
            padding: 8px !important;
            text-align: left !important;
            vertical-align: top !important;
            font-size: 10pt !important; /* Scaled down slightly to safely fit rigid columns */
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            word-break: break-word !important;
            white-space: normal !important; /* CRITICAL: Kills any MS Word 'nowrap' */
            overflow: hidden !important;
          }
          .print-content-render th {
            background-color: #f8fafc !important;
            font-weight: 700 !important;
            color: #0f172a !important;
          }
          
          /* Ensures images inside tables also never break the layout */
          .print-content-render img { 
            max-width: 100% !important; 
            height: auto !important;
            break-inside: avoid; 
            border-radius: 6px; 
            margin: 16px 0;
          }

          @media print {
            @page { margin: 0; size: auto; }
            
            /* 1. NUKE ALL GLOBAL SCROLL LOCKS (Fixes the 1-Page Limit) */
            html, body, #root {
              height: auto !important;
              min-height: 100% !important;
              overflow: visible !important;
              position: static !important;
              background: #fff !important;
            }

            /* 2. HIDE THE ENTIRE APP (Kills the Sidebar & Background) */
            body * {
              visibility: hidden !important;
            }

            /* 3. MAKE ONLY OUR DOCUMENTS VISIBLE */
            .print-preview-container, .print-preview-container * {
              visibility: visible !important;
            }

            /* 4. SNAP DOCUMENTS TO THE TOP-LEFT OF THE PAPER */
            .print-preview-container {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              height: auto !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
              background: transparent !important;
            }

            /* 5. HIDE THE MODAL'S OWN UI BUTTONS */
            .print-hide, .print-hide * { 
              display: none !important; 
              visibility: hidden !important;
            }
            
            .print-document { 
              box-shadow: none !important; 
              padding: 15mm 20mm !important; 
              margin: 0 !important;
              border-radius: 0 !important;
              max-width: none !important;
              width: 100% !important;
              page-break-after: always;
              break-after: page;
            }
            .print-document:last-child { page-break-after: auto; break-after: auto; }
            .print-content-render p { orphans: 3; widows: 3; }
          }
        `}</style>
      </div>
    );
  }

  // ── STEP 1: SELECTION UI ──
  const t = {
    bg: isDark ? '#0d1117' : '#ffffff',
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    text: isDark ? '#f1f5f9' : '#0f172a',
    textMuted: isDark ? '#64748b' : '#94a3b8',
    card: isDark ? '#161b22' : '#f8fafc',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '750px', background: t.bg, border: `1px solid ${t.border}`, borderRadius: '16px', display: 'flex', flexDirection: 'column', maxHeight: '85vh', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', overflow: 'hidden' }}>

        {/* Modal Header */}
        <div style={{ padding: '24px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', color: t.text, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Printer size={22} color="#ec4899" /> Batch Print Hub
            </h2>
            <p style={{ margin: '4px 0 0', color: t.textMuted, fontSize: '0.9rem' }}>Select the profiling targets you want to compile into a single document.</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 8 }}><X size={20} /></button>
        </div>

        {/* Search & Select All Bar */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${t.border}`, display: 'flex', gap: 16, alignItems: 'center', background: t.card }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} color={t.textMuted} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search targets or status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, outline: 'none' }}
            />
          </div>
          <button onClick={handleSelectAll} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: t.bg, border: `1px solid ${t.border}`, color: t.text, borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            {selectedIds.length === filteredTasks.length && filteredTasks.length > 0 ? <CheckSquare size={18} color="#ec4899" /> : <Square size={18} color={t.textMuted} />}
            Select All
          </button>
        </div>

        {/* Target List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredTasks.map(task => {
            const isSelected = selectedIds.includes(task.id);
            return (
              <div key={task.id} onClick={() => toggleTask(task.id)} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px', borderRadius: 12, border: `1px solid ${isSelected ? '#ec4899' : t.border}`, background: isSelected ? 'rgba(236,72,153,0.05)' : t.card, cursor: 'pointer', transition: 'all 0.2s' }}>
                <div style={{ color: isSelected ? '#ec4899' : t.textMuted }}>
                  {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                </div>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(236,72,153,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ec4899' }}>
                  <Building2 size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: t.text }}>{task.companyName}</h3>
                  <span style={{ fontSize: '0.8rem', color: t.textMuted, textTransform: 'capitalize' }}>Status: {task.status}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.textMuted, fontSize: '0.8rem' }}>
                  <FileText size={14} /> {(task.content || '').length > 50 ? 'Content Loaded' : 'Empty Draft'}
                </div>
              </div>
            );
          })}
          {filteredTasks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: t.textMuted }}>No targets found matching your search.</div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ padding: '20px 24px', borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: t.bg }}>
          <span style={{ color: t.textMuted, fontSize: '0.9rem', fontWeight: 600 }}>{selectedIds.length} targets selected</span>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
            <button onClick={handleProceed} disabled={selectedIds.length === 0} style={{ padding: '10px 24px', borderRadius: 8, background: selectedIds.length > 0 ? '#ec4899' : t.border, color: selectedIds.length > 0 ? '#fff' : t.textMuted, border: 'none', cursor: selectedIds.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              Compile & Preview <ChevronRight size={18} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
