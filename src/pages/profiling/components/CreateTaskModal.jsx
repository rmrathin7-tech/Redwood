import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function CreateTaskModal({ isOpen, onClose, onSave, currentUserEmail, workspaceUsers, isDark, editingTask }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Pre-fill data if we are editing an existing task
  useEffect(() => {
    if (editingTask && isOpen) {
      setTitle(editingTask.companyName || '');
      setDescription(editingTask.description || '');
      setAssignedTo((workspaceUsers || []).find(u => u.email === editingTask.assignedTo)?.userId || '');
      setReviewer((workspaceUsers || []).find(u => u.email === editingTask.reviewer)?.userId || '');
      setDueDate(editingTask.dueDate || '');
    } else if (isOpen) {
      setTitle(''); setDescription(''); setAssignedTo(''); setReviewer(''); setDueDate('');
    }
  }, [editingTask, isOpen, workspaceUsers]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!title.trim()) return alert("Title is required");
    
    // Map the selected userId back to the email for the database
    const assigneeEmail = (workspaceUsers || []).find(u => u.userId === assignedTo)?.email || '';
    const reviewerEmail = (workspaceUsers || []).find(u => u.userId === reviewer)?.email || '';

    onSave({
      companyName: title,
      description,
      assignedTo: assigneeEmail,
      reviewer: reviewerEmail,
      dueDate,
      status: 'pending allocation'
    });
    
    setTitle(''); setDescription(''); setAssignedTo(''); setReviewer(''); setDueDate('');
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: isDark ? '#0d1117' : '#fff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, borderRadius: 16, width: 500, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', color: isDark ? '#f8fafc' : '#0f172a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{editingTask ? 'Edit Profiling Task' : 'New Profiling Task'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', marginBottom: 6 }}>Company / Target Name</label>
            <input type="text" autoFocus value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: isDark ? '#161b22' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, color: isDark ? '#fff' : '#000', outline: 'none' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', marginBottom: 6 }}>Task Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: isDark ? '#161b22' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, color: isDark ? '#fff' : '#000', outline: 'none', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', marginBottom: 6 }}>Assignee</label>
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: isDark ? '#161b22' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, color: isDark ? '#fff' : '#000', outline: 'none' }}>
                <option value="">Unassigned</option>
                {(workspaceUsers || []).map(u => <option key={u.userId} value={u.userId}>{u.email}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', marginBottom: 6 }}>Reviewer</label>
              <select value={reviewer} onChange={e => setReviewer(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: isDark ? '#161b22' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, color: isDark ? '#fff' : '#000', outline: 'none' }}>
                <option value="">No Reviewer</option>
                {(workspaceUsers || []).map(u => <option key={u.userId} value={u.userId}>{u.email}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', marginBottom: 6 }}>Target Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: isDark ? '#161b22' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, color: isDark ? '#fff' : '#000', outline: 'none' }} />
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, background: 'transparent', color: isDark ? '#fff' : '#000', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
          <button onClick={handleSave} style={{ padding: '10px 24px', borderRadius: 8, background: '#ec4899', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>{editingTask ? 'Save Changes' : 'Create Task'}</button>
        </div>
      </div>
    </div>
  );
}