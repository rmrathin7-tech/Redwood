import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useProfilingTasks } from './hooks/useProfilingTasks';
import ProfilingTaskboard from './components/ProfilingTaskboard';
import ProfilingEditor from './components/ProfilingEditor';

export default function ProfilingDashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const projectId = searchParams.get('project');
  const projectName = searchParams.get('name') || 'Profiling Module';
  
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const currentUserEmail = auth.currentUser?.email || 'Unknown User';

  const { tasks, loading, addTask, updateTaskStatus } = useProfilingTasks(projectId);

  // ── CENTRALIZED ACTION HANDLERS ──
  const handleDeleteTask = async (taskId) => {
    if (window.confirm("Are you sure you want to permanently delete this profiling task?")) {
      await deleteDoc(doc(db, 'projects', projectId, 'profiling', taskId));
    }
  };

  const handleArchiveTask = async (taskId) => {
    if (window.confirm("Are you sure you want to archive this task?")) {
      await updateDoc(doc(db, 'projects', projectId, 'profiling', taskId), { 
        archived: true, 
        archivedAt: serverTimestamp() 
      });
    }
  };

  if (!projectId) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)', flexDirection: 'column', gap: 16 }}>
        <AlertCircle size={48} color="#ef4444" />
        <h2 style={{ fontSize: 20, margin: 0 }}>Missing Project Identifiers</h2>
        <p style={{ color: 'var(--text-muted)' }}>Please return to the Dashboard and launch Profiling from a project.</p>
        <button onClick={() => navigate('/')} style={{ background: 'var(--accent-color)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (loading) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}><Loader2 size={32} className="animate-spin" color="var(--accent-color)" /></div>;
  }

  return (
    <div style={{ height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      
      {/* Module Header (Only visible when NOT in the full-screen editor) */}
      {!selectedTaskId && (
        <header style={{ height: 64, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-strong)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16 }}>
          <button 
            onClick={() => navigate(`/module-hub?project=${projectId}&name=${encodeURIComponent(projectName)}`)} 
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 8, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex' }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>Profiling Taskboard</h1>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{projectName}</span>
          </div>
        </header>
      )}

      {/* View Router */}
      <main style={{ flex: 1, overflow: 'hidden' }}>
        {selectedTaskId ? (
          <ProfilingEditor 
            projectId={projectId} 
            taskId={selectedTaskId} 
            onClose={() => setSelectedTaskId(null)}
            currentUserEmail={currentUserEmail}
          />
        ) : (
          <ProfilingTaskboard 
            tasks={tasks}
            loading={loading}
            onUpdateStatus={updateTaskStatus}
            onAddTask={addTask}
            onOpenEditor={setSelectedTaskId}
            onDeleteTask={handleDeleteTask}
            onArchiveTask={handleArchiveTask}
            currentUserEmail={currentUserEmail}
          />
        )}
      </main>
    </div>
  );
}