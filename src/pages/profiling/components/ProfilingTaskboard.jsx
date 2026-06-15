import React, { useState, useEffect, useMemo } from 'react';
import { Kanban, ListTree, Plus, Search, X, AlignLeft } from 'lucide-react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import CreateTaskModal from './CreateTaskModal';
import ProfilingKanban from '../views/ProfilingKanban';
import ProfilingMatrix from '../views/ProfilingMatrix';

const COLUMNS = [
  { id: 'pending allocation', label: 'Pending Allocation', color: '#f59e0b' },
  { id: 'drafting', label: 'Drafting', color: '#3b82f6' },
  { id: 'in review', label: 'In Review', color: '#a855f7' },
  { id: 'resolve comments', label: 'Resolve Comments', color: '#ec4899' },
  { id: 'completed', label: 'Completed', color: '#10b981' }
];

export default function ProfilingTaskboard({ tasks, loading, onUpdateStatus, onAddTask, onOpenEditor, currentUserEmail, isDark }) {
  const [view, setView] = useState('matrix'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [workspaceUsers, setWorkspaceUsers] = useState([]);
  
  // ── NEW STATES FOR IM-GRADE FUNCTIONALITY ──
  const [comments, setComments] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null); // Track task being edited

  useEffect(() => {
    // Fetch Workspace Users
    const unsubUsers = onSnapshot(collection(db, 'workspace-users'), snap => {
      setWorkspaceUsers(snap.docs.map(d => d.data()));
    });
    // Fetch Global Comments for Matrix Analytics Engine
    const unsubComments = onSnapshot(collection(db, 'im-comments'), snap => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubUsers(); unsubComments(); };
  }, []);

  const handleDetailUpdate = async (taskId, field, value) => {
    let payload = value;
    if (field === 'assignedTo' || field === 'reviewer') {
      const user = workspaceUsers.find(u => u.userId === value);
      payload = user ? user.email : '';
    }
    await updateDoc(doc(db, 'profiling-tasks', taskId), { [field]: payload, updatedAt: serverTimestamp() });
    if (activeTask && activeTask.id === taskId) {
      setActiveTask(prev => ({ ...prev, [field]: payload })); // Optimistic sync
    }
  };

  // Inline DB Mutation Handler
  const handleUpdateField = async (taskId, field, value) => {
    let payload = value;
    // If the field is assignee/reviewer, ensure we save the email string to match your profiling architecture
    if (field === 'assignedTo' || field === 'reviewer') {
      const user = workspaceUsers.find(u => u.userId === value);
      payload = user ? user.email : '';
    }
    await updateDoc(doc(db, 'profiling-tasks', taskId), { [field]: payload, updatedAt: serverTimestamp() });
  };
// ── NEW ACTION HANDLERS ──
  const handleDeleteTask = async (taskId) => {
    if (window.confirm("Are you sure you want to permanently delete this profiling task?")) {
      await deleteDoc(doc(db, 'profiling-tasks', taskId));
    }
  };

  const handleArchiveTask = async (taskId) => {
    if (window.confirm("Are you sure you want to archive this task?")) {
      await updateDoc(doc(db, 'profiling-tasks', taskId), { status: 'archived', updatedAt: serverTimestamp() });
    }
  };

  const handleSaveModal = async (taskData) => {
    if (editingTask) {
       await updateDoc(doc(db, 'profiling-tasks', editingTask.id), { ...taskData, updatedAt: serverTimestamp() });
       setEditingTask(null);
    } else {
       onAddTask(taskData);
    }
    setIsCreateModalOpen(false);
  };
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => t.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) || t.assignedTo?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [tasks, searchQuery]);

  const matrixTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      return 0; 
    });
  }, [filteredTasks]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 32, gap: 24 }}>
      
      {/* High-Transparency Glass Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isDark ? 'rgba(10,14,24,0.3)' : 'rgba(255,255,255,0.4)', padding: 16, borderRadius: 16, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, backdropFilter: 'blur(24px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', background: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)', borderRadius: 8, padding: 4, border: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
            <button onClick={() => setView('matrix')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: view === 'matrix' ? (isDark ? 'rgba(255,255,255,0.15)' : '#fff') : 'transparent', color: view === 'matrix' ? (isDark ? '#fff' : '#000') : (isDark ? '#64748b' : '#94a3b8'), transition: 'all 0.2s' }}>
              <ListTree size={16} /> Matrix
            </button>
            <button onClick={() => setView('kanban')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: view === 'kanban' ? (isDark ? 'rgba(255,255,255,0.15)' : '#fff') : 'transparent', color: view === 'kanban' ? (isDark ? '#fff' : '#000') : (isDark ? '#64748b' : '#94a3b8'), transition: 'all 0.2s' }}>
              <Kanban size={16} /> Kanban
            </button>
          </div>

          <div style={{ position: 'relative', width: 280 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: isDark ? '#64748b' : '#94a3b8' }} />
            <input type="text" placeholder="Search companies or assignees..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '10px 12px 10px 36px', background: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, borderRadius: 8, color: isDark ? '#f8fafc' : '#0f172a', outline: 'none', transition: 'border 0.2s' }} onFocus={e => e.target.style.borderColor = '#ec4899'} onBlur={e => e.target.style.borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} />
          </div>
        </div>

        <button onClick={() => setIsCreateModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(236,72,153,0.3)', transition: 'transform 0.2s' }} onMouseEnter={e => e.target.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.target.style.transform = 'translateY(0)'}>
          <Plus size={16} /> New Profiling Task
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'kanban' && <ProfilingKanban filteredTasks={filteredTasks} COLUMNS={COLUMNS} onUpdateStatus={onUpdateStatus} onOpenEditor={onOpenEditor} isDark={isDark} />}
        {view === 'matrix' && <ProfilingMatrix matrixTasks={matrixTasks} COLUMNS={COLUMNS} onOpenEditor={onOpenEditor} onUpdateField={handleUpdateField} workspaceUsers={workspaceUsers} comments={comments} onOpenDetail={(task) => { setActiveTask(task); setIsDetailModalOpen(true); }} onEditTask={(t) => { setEditingTask(t); setIsCreateModalOpen(true); }} onDeleteTask={handleDeleteTask} onArchiveTask={handleArchiveTask} isDark={isDark} />}
      </div>

      <CreateTaskModal isOpen={isCreateModalOpen} onClose={() => { setIsCreateModalOpen(false); setEditingTask(null); }} onSave={handleSaveModal} currentUserEmail={currentUserEmail} workspaceUsers={workspaceUsers} isDark={isDark} editingTask={editingTask} />

      {/* ── TRELLO-STYLE TASK DETAIL MODAL ── */}
      {isDetailModalOpen && activeTask && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 0' }}>
          <div style={{ background: isDark ? '#0d1117' : '#ffffff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 12, width: 750, maxWidth: '95vw', maxHeight: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.2s ease', color: isDark ? '#f1f5f9' : '#0f172a' }}>
            
            <div style={{ padding: '24px 32px', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', lineHeight: 1.3 }}>{activeTask.companyName}</h2>
                <div style={{ fontSize: '0.8rem', color: isDark ? '#64748b' : '#94a3b8' }}>
                  in stage <span style={{ color: COLUMNS.find(c => c.id === activeTask.status)?.color, fontWeight: 700 }}>{COLUMNS.find(c => c.id === activeTask.status)?.label || 'Unknown'}</span>
                </div>
              </div>
              <button onClick={() => { setIsDetailModalOpen(false); setActiveTask(null); }} style={{ background: 'none', border: 'none', color: isDark ? '#64748b' : '#94a3b8', cursor: 'pointer', padding: 4 }}><X size={20} /></button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', flex: 1, overflowY: 'auto' }}>
              
              <div style={{ padding: '24px 32px', borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontWeight: 700 }}>
                  <AlignLeft size={18} /> Description & Brief
                </div>
                <textarea 
                  placeholder="Add a more detailed description..."
                  value={activeTask.description || ''}
                  onChange={(e) => setActiveTask({...activeTask, description: e.target.value})}
                  onBlur={() => handleDetailUpdate(activeTask.id, 'description', activeTask.description)}
                  style={{ width: '100%', boxSizing: 'border-box', minHeight: 200, padding: 16, borderRadius: 8, background: isDark ? '#161b22' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, color: isDark ? '#f1f5f9' : '#0f172a', outline: 'none', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                />
                <div style={{ marginTop: 8, fontSize: '0.75rem', color: isDark ? '#64748b' : '#94a3b8' }}>Changes save automatically when you click outside the box.</div>
              </div>

              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, background: isDark ? '#161b22' : '#f8fafc' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#64748b' : '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Status</label>
                  <select 
                    value={activeTask.status} onChange={(e) => handleDetailUpdate(activeTask.id, 'status', e.target.value)}
                    style={{ width: '100%', padding: 10, borderRadius: 6, background: isDark ? '#0d1117' : '#ffffff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, color: isDark ? '#f1f5f9' : '#0f172a', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
                  >
                    {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#64748b' : '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Assignee</label>
                    <select value={workspaceUsers.find(u => u.email === activeTask.assignedTo)?.userId || ''} onChange={(e) => handleDetailUpdate(activeTask.id, 'assignedTo', e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 6, background: isDark ? '#0d1117' : '#ffffff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, color: isDark ? '#f1f5f9' : '#0f172a', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}>
                      <option value="">Unassigned</option>
                      {workspaceUsers.map(u => <option key={u.userId} value={u.userId}>{u.email}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#64748b' : '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Reviewer</label>
                    <select value={workspaceUsers.find(u => u.email === activeTask.reviewer)?.userId || ''} onChange={(e) => handleDetailUpdate(activeTask.id, 'reviewer', e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 6, background: isDark ? '#0d1117' : '#ffffff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, color: isDark ? '#f1f5f9' : '#0f172a', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}>
                      <option value="">No Reviewer</option>
                      {workspaceUsers.map(u => <option key={u.userId} value={u.userId}>{u.email}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#64748b' : '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Due Date</label>
                  <input
                    type="date" value={activeTask.dueDate || ''} onChange={(e) => handleDetailUpdate(activeTask.id, 'dueDate', e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 6, background: isDark ? '#0d1117' : '#ffffff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, color: isDark ? '#f1f5f9' : '#0f172a', outline: 'none', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}