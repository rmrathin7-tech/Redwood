import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Kanban, ListTree, Plus, X, Search, Clock, 
  CheckCircle2, CircleDashed, ArrowRight,
  GripVertical, Trash2, UserSearch, UserCheck, 
  MessageSquare, ChevronDown, ChevronUp, Eye, Edit3
} from 'lucide-react';
import { db, auth } from '../../../firebase.js'; 
import { 
  collection, query, where, onSnapshot, addDoc, 
  updateDoc, doc, serverTimestamp, deleteDoc, setDoc
} from 'firebase/firestore';

const AVATAR_COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4'];
const avatarColor = (uid) => AVATAR_COLORS[(uid?.charCodeAt(0) || 0) % AVATAR_COLORS.length];

const DEFAULT_COLUMNS = [
  { id: 'pending', label: 'Pending Allocation', color: '#f59e0b' },
  { id: 'drafting', label: 'Drafting', color: '#3b82f6' },
  { id: 'reviewing', label: 'Reviewing', color: '#a855f7' },
  { id: 'approved', label: 'Approved', color: '#10b981' }
];

export default function IMTaskBoard({ imId, projectId, isDark = true, onClose }) {
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'matrix'
  
  // Data States
  const [tasks, setTasks] = useState([]);
  const [schema, setSchema] = useState([]);
  const [workspaceUsers, setWorkspaceUsers] = useState([]);
  const [columns, setColumns] = useState([]);
  const [comments, setComments] = useState([]);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterReviewer, setFilterReviewer] = useState('');
  
  // UI & Edit States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [newTask, setNewTask] = useState({ title: '', assignee: '', reviewer: '', linkedSections: [] });
  const [expandedComments, setExpandedComments] = useState({});

  // Canvas Refs
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });

  const T = useMemo(() => ({
    bg:         isDark ? '#060910' : '#f1f5f9',
    surface:    isDark ? '#0d1117' : '#ffffff',
    surface2:   isDark ? '#161b22' : '#f8fafc',
    surface3:   isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
    border:     isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    text:       isDark ? '#f1f5f9' : '#0f172a',
    textMuted:  isDark ? '#64748b' : '#94a3b8',
    accent:     '#ef4444',
    amber:      '#f59e0b',
  }), [isDark]);

  // ── INTERACTIVE CANVAS ENGINE ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    let raf;
    const particles = [];
    const numParticles = window.innerWidth > 1024 ? 90 : 40;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize); resize();
    
    const onMouseMove = (e) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMouseMove);

    for(let i = 0; i < numParticles; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 1.2,
        vy: (Math.random() - 0.5) * 1.2,
        size: Math.random() * 2 + 1,
        color: Math.random() > 0.5 
          ? (isDark ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)')  // Red Accent
          : (isDark ? 'rgba(59, 130, 246, 0.4)' : 'rgba(14, 165, 233, 0.3)') // Blue Tech
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      particles.forEach((p, i) => {
        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // Mouse Repel Physics
        if (dist < 180) {
          p.x -= dx * 0.03;
          p.y -= dy * 0.03;
        }

        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        // Draw connections
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const d = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (d < 130) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = isDark ? `rgba(100, 116, 139, ${0.15 - d/800})` : `rgba(148, 163, 184, ${0.2 - d/600})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      });
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(raf);
    };
  }, [isDark]);


  // ── DATA SUBSCRIPTIONS ──
  useEffect(() => {
    if (!imId) return;
    const unsubs = [];
    unsubs.push(onSnapshot(doc(db, 'im-task-config', imId), (snap) => {
      if (snap.exists()) setColumns(snap.data().columns || []);
      else setDoc(doc(db, 'im-task-config', imId), { columns: DEFAULT_COLUMNS });
    }));
    unsubs.push(onSnapshot(doc(db, 'config', 'im-schema'), (snap) => {
      if (snap.exists()) setSchema(snap.data().sections || []);
    }));
    unsubs.push(onSnapshot(query(collection(db, 'im-tasks'), where('imId', '==', imId)), (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    unsubs.push(onSnapshot(collection(db, 'workspace-users'), (snap) => {
      setWorkspaceUsers(snap.docs.map(d => d.data()));
    }));
    unsubs.push(onSnapshot(query(collection(db, 'im-comments'), where('imId', '==', imId)), (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    return () => unsubs.forEach(u => u());
  }, [imId]);


  // ── COMPUTED PROPERTIES ──
  const flatSections = useMemo(() => {
    const result = [];
    const parents = schema.filter(s => !s.parentId).sort((a,b) => (a.order||0) - (b.order||0));
    parents.forEach(p => {
      result.push({ ...p, isParent: true });
      schema.filter(s => s.parentId === p.id).sort((a,b) => (a.order||0) - (b.order||0))
            .forEach(c => result.push({ ...c, isParent: false }));
    });
    return result;
  }, [schema]);

  const getSectionName = useCallback((key) => flatSections.find(s => s.key === key)?.navLabel || key, [flatSections]);

  const sectionComments = useMemo(() => {
    const map = {};
    comments.forEach(c => {
      if (c.status !== 'open') return;
      const sec = schema.find(s => s.blocks?.some(b => b.id === c.blockId));
      if (sec) {
        if (!map[sec.key]) map[sec.key] = [];
        map[sec.key].push(c);
      }
    });
    return map;
  }, [comments, schema]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterAssignee && t.assignee?.uid !== filterAssignee) return false;
      if (filterReviewer && t.reviewer?.uid !== filterReviewer) return false;
      return true;
    });
  }, [tasks, searchQuery, filterAssignee, filterReviewer]);


  // ── INLINE MUTATIONS ──
  const handleUpdateTaskField = async (taskId, field, userId) => {
    const user = workspaceUsers.find(u => u.userId === userId);
    const payload = user ? { uid: user.userId, email: user.email } : null;
    await updateDoc(doc(db, 'im-tasks', taskId), { [field]: payload, updatedAt: serverTimestamp() });
  };

  const handleUpdateStatus = async (taskId, status) => {
    await updateDoc(doc(db, 'im-tasks', taskId), { status, updatedAt: serverTimestamp() });
  };

  const handleDeleteColumn = async (colId) => {
    if (!window.confirm("Remove this pipeline stage?")) return;
    await updateDoc(doc(db, 'im-task-config', imId), { columns: columns.filter(c => c.id !== colId) });
  };

  // ── DRAG AND DROP ──
  const handleDragStart = (e, taskId) => { e.dataTransfer.setData('taskId', taskId); e.currentTarget.style.opacity = '0.4'; };
  const handleDragEnd = (e) => { e.currentTarget.style.opacity = '1'; };
  const handleDragOver = (e) => { e.preventDefault(); e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'; };
  const handleDragLeave = (e) => { e.currentTarget.style.background = 'transparent'; };
  const handleDrop = async (e, newStatus) => {
    e.preventDefault(); e.currentTarget.style.background = 'transparent';
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) handleUpdateStatus(taskId, newStatus);
  };

  // ── MODAL & SAVING LOGIC ──
  const openEditModal = (task) => {
    setEditingTaskId(task.id);
    setNewTask({
      title: task.title,
      assignee: task.assignee?.uid || '',
      reviewer: task.reviewer?.uid || '',
      linkedSections: task.linkedSections || []
    });
    setIsModalOpen(true);
  };

  const openQuickCreate = (secKey) => {
    setEditingTaskId(null);
    setNewTask({ title: `Draft ${getSectionName(secKey)}`, assignee: '', reviewer: '', linkedSections: [secKey] });
    setIsModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!newTask.title.trim()) return alert("Task needs a title");
    
    let assigneeObj = null, reviewerObj = null;
    const aUser = workspaceUsers.find(u => u.userId === newTask.assignee);
    const rUser = workspaceUsers.find(u => u.userId === newTask.reviewer);
    if (aUser) assigneeObj = { uid: aUser.userId, email: aUser.email };
    if (rUser) reviewerObj = { uid: rUser.userId, email: rUser.email };

    if (editingTaskId) {
      await updateDoc(doc(db, 'im-tasks', editingTaskId), {
        title: newTask.title,
        assignee: assigneeObj,
        reviewer: reviewerObj,
        linkedSections: newTask.linkedSections,
        updatedAt: serverTimestamp()
      });
    } else {
      const initialStatus = columns.length > 0 ? columns[0].id : 'pending';
      await addDoc(collection(db, 'im-tasks'), {
        imId, projectId, title: newTask.title, 
        assignee: assigneeObj, reviewer: reviewerObj,
        linkedSections: newTask.linkedSections, status: initialStatus,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
    }
    
    setIsModalOpen(false);
    setEditingTaskId(null);
    setNewTask({ title: '', assignee: '', reviewer: '', linkedSections: [] });
  };

  const toggleSectionLink = (secKey) => {
    setNewTask(prev => {
      const exists = prev.linkedSections.includes(secKey);
      return {
        ...prev,
        linkedSections: exists 
          ? prev.linkedSections.filter(k => k !== secKey)
          : [...prev.linkedSections, secKey]
      };
    });
  };

  // ── RENDERERS ──

  const renderToolbar = () => (
    <div style={{ padding: '0 32px 20px', borderBottom: `1px solid ${T.border}`, marginBottom: '24px', position: 'relative', zIndex: 10 }}>
      {/* BULLETPROOF WRAPPER: Flex container handling wrapping properly */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
        
        {/* Search */}
        <div style={{ flex: '1 1 300px', minWidth: '200px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
          <input 
            type="text" placeholder="Search tasks by title..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 40px', borderRadius: '8px', border: `1px solid ${T.border}`, background: T.surface, color: T.text, outline: 'none', fontSize: '0.85rem' }}
          />
        </div>

        {/* Assignee Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '0 12px', height: '40px', flexShrink: 0 }}>
          <UserCheck size={16} color={T.textMuted} />
          <select className="glass-select" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={{ background: 'transparent', border: 'none', color: filterAssignee ? T.text : T.textMuted, fontSize: '0.85rem', outline: 'none', cursor: 'pointer', height: '100%', maxWidth: '140px' }}>
            <option value="">All Assignees</option>
            {workspaceUsers.map(u => <option key={u.userId} value={u.userId}>{u.email.split('@')[0]}</option>)}
          </select>
        </div>

        {/* Reviewer Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '0 12px', height: '40px', flexShrink: 0 }}>
          <Eye size={16} color={T.textMuted} />
          <select className="glass-select" value={filterReviewer} onChange={e => setFilterReviewer(e.target.value)} style={{ background: 'transparent', border: 'none', color: filterReviewer ? T.text : T.textMuted, fontSize: '0.85rem', outline: 'none', cursor: 'pointer', height: '100%', maxWidth: '140px' }}>
            <option value="">All Reviewers</option>
            {workspaceUsers.map(u => <option key={u.userId} value={u.userId}>{u.email.split('@')[0]}</option>)}
          </select>
        </div>

        {/* Clear Filters */}
        {(searchQuery || filterAssignee || filterReviewer) && (
          <button onClick={() => { setSearchQuery(''); setFilterAssignee(''); setFilterReviewer(''); }} style={{ height: '40px', flexShrink: 0, background: 'transparent', border: `1px dashed ${T.border}`, color: T.textMuted, padding: '0 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
            Clear
          </button>
        )}

      </div>
    </div>
  );

  const renderKanban = () => (
    <div style={{ display: 'flex', gap: '20px', height: '100%', overflowX: 'auto', padding: '0 32px 20px', position: 'relative', zIndex: 10 }}>
      {columns.map(col => {
        const colTasks = filteredTasks.filter(t => t.status === col.id);
        
        return (
          <div 
            key={col.id} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, col.id)}
            style={{ flex: '0 0 300px', display: 'flex', flexDirection: 'column', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '12px', transition: 'background 0.2s ease', backdropFilter: 'blur(16px)' }}
          >
            {/* Column Header */}
            <div style={{ padding: '16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: col.color, fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <CircleDashed size={14} /> {col.label}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ background: T.surface3, color: T.textMuted, padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800 }}>{colTasks.length}</div>
                <button onClick={() => handleDeleteColumn(col.id)} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', opacity: 0.5 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.5}><Trash2 size={12} /></button>
              </div>
            </div>

            {/* Cards */}
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {colTasks.map(task => (
                <div 
                  key={task.id} draggable className="kanban-card" onDragStart={(e) => handleDragStart(e, task.id)} onDragEnd={handleDragEnd}
                  style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '14px', cursor: 'grab', boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.05)', transition: 'all 0.2s cubic-bezier(0.23,1,0.32,1)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: T.text, lineHeight: 1.4 }}>{task.title}</h4>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button onClick={() => openEditModal(task)} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', opacity: 0.5 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.5}>
                        <Edit3 size={14} />
                      </button>
                      <GripVertical size={14} color={T.textMuted} style={{ cursor: 'grab', opacity: 0.5 }} />
                    </div>
                  </div>

                  {task.linkedSections?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                      {task.linkedSections.map(secKey => (
                        <span key={secKey} style={{ fontSize: '0.65rem', fontWeight: 600, color: T.textMuted, background: T.surface3, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '2px 6px' }}>
                          {getSectionName(secKey)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Assignee & Reviewer Footer */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingTop: '12px', borderTop: `1px dashed ${T.border}` }}>
                    
                    {/* Assignee */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.65rem', color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>Assignee</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {task.assignee ? (
                          <>
                            <div style={{ width: 18, height: 18, borderRadius: '50%', background: avatarColor(task.assignee.uid), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.55rem', fontWeight: 800 }}>{task.assignee.email.charAt(0).toUpperCase()}</div>
                            <span style={{ fontSize: '0.75rem', color: T.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.assignee.email.split('@')[0]}</span>
                          </>
                        ) : <span style={{ fontSize: '0.75rem', color: T.textMuted, fontStyle: 'italic' }}>None</span>}
                      </div>
                    </div>

                    {/* Reviewer */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px', borderLeft: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: '0.65rem', color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>Reviewer</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {task.reviewer ? (
                          <>
                            <div style={{ width: 18, height: 18, borderRadius: '50%', background: avatarColor(task.reviewer.uid), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.55rem', fontWeight: 800 }}>{task.reviewer.email.charAt(0).toUpperCase()}</div>
                            <span style={{ fontSize: '0.75rem', color: T.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.reviewer.email.split('@')[0]}</span>
                          </>
                        ) : <span style={{ fontSize: '0.75rem', color: T.textMuted, fontStyle: 'italic' }}>None</span>}
                      </div>
                    </div>

                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ flex: '0 0 300px', display: 'flex', flexDirection: 'column' }}>
        <button 
          onClick={async () => {
            const label = prompt("Enter the name of the new stage:");
            if (label?.trim()) await updateDoc(doc(db, 'im-task-config', imId), { columns: [...columns, { id: `col_${Date.now()}`, label: label.trim(), color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] }] });
          }}
          style={{ height: '56px', borderRadius: '12px', border: `1px dashed ${T.border}`, background: T.surface3, color: T.textMuted, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s', backdropFilter: 'blur(16px)' }}
          onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.textMuted; }}
          onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.borderColor = T.border; }}
        >
          <Plus size={16} /> Add Pipeline Stage
        </button>
      </div>
    </div>
  );

  const renderMatrix = () => (
    <div style={{ padding: '0 32px 40px', position: 'relative', zIndex: 10 }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '12px', overflow: 'hidden', boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 4px 20px rgba(0,0,0,0.05)', backdropFilter: 'blur(16px)' }}>
        
        {/* Matrix Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '16px 24px', background: T.surface2, borderBottom: `1px solid ${T.border}`, fontSize: '0.7rem', fontWeight: 800, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
          <div>Document Section</div>
          <div>Assignee</div>
          <div>Reviewer</div>
          <div>Task Status</div>
          <div>Open Comments</div>
        </div>
        
        {/* Matrix Rows */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {flatSections.map(section => {
            const activeTask = filteredTasks.find(t => t.linkedSections?.includes(section.key));
            const colDef = activeTask ? columns.find(c => c.id === activeTask.status) : null;
            const openComms = sectionComments[section.key] || [];
            const hasComments = openComms.length > 0;
            const isExpanded = expandedComments[section.key];

            if (!activeTask && (searchQuery || filterAssignee || filterReviewer)) return null;

            return (
              <React.Fragment key={section.id}>
                {/* Main Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '12px 24px', borderBottom: `1px solid ${T.border}`, alignItems: 'center', transition: 'background 0.2s', background: isExpanded ? T.surface3 : 'transparent' }} onMouseEnter={e => e.currentTarget.style.background = T.surface3} onMouseLeave={e => e.currentTarget.style.background = isExpanded ? T.surface3 : 'transparent'}>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {!section.isParent && <ArrowRight size={14} color={T.textMuted} style={{ marginLeft: '16px' }} />}
                    <span style={{ fontSize: section.isParent ? '0.9rem' : '0.85rem', fontWeight: section.isParent ? 700 : 500, color: section.isParent ? T.text : T.textMuted }}>{section.navLabel}</span>
                    {activeTask && (
                      <button onClick={() => openEditModal(activeTask)} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', opacity: 0.5 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.5}>
                        <Edit3 size={12} />
                      </button>
                    )}
                  </div>

                  {activeTask ? (
                    <>
                      <div>
                        <select 
                          className="glass-select"
                          value={activeTask.assignee?.uid || ''} 
                          onChange={(e) => handleUpdateTaskField(activeTask.id, 'assignee', e.target.value)}
                          style={{ width: '90%', padding: '6px', borderRadius: '6px', background: T.surface2, border: `1px solid ${T.border}`, color: activeTask.assignee ? T.text : T.textMuted, fontSize: '0.8rem', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
                        >
                          <option value="">Unassigned</option>
                          {workspaceUsers.map(u => <option key={u.userId} value={u.userId}>{u.email.split('@')[0]}</option>)}
                        </select>
                      </div>

                      <div>
                        <select 
                          className="glass-select"
                          value={activeTask.reviewer?.uid || ''} 
                          onChange={(e) => handleUpdateTaskField(activeTask.id, 'reviewer', e.target.value)}
                          style={{ width: '90%', padding: '6px', borderRadius: '6px', background: T.surface2, border: `1px solid ${T.border}`, color: activeTask.reviewer ? T.text : T.textMuted, fontSize: '0.8rem', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
                        >
                          <option value="">No Reviewer</option>
                          {workspaceUsers.map(u => <option key={u.userId} value={u.userId}>{u.email.split('@')[0]}</option>)}
                        </select>
                      </div>

                      <div>
                        <select 
                          className="glass-select"
                          value={activeTask.status} 
                          onChange={(e) => handleUpdateStatus(activeTask.id, e.target.value)}
                          style={{ width: '90%', padding: '6px', borderRadius: '6px', background: colDef ? `${colDef.color}15` : T.surface2, border: colDef ? `1px solid ${colDef.color}40` : `1px solid ${T.border}`, color: colDef ? colDef.color : T.text, fontSize: '0.8rem', fontWeight: 700, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
                        >
                          {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </div>
                    </>
                  ) : (
                    <div style={{ gridColumn: 'span 3', display: 'flex', alignItems: 'center' }}>
                      <button onClick={() => openQuickCreate(section.key)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'transparent', border: `1px dashed ${T.border}`, color: T.textMuted, borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.textMuted; }} onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.borderColor = T.border; }}>
                        <Plus size={12} /> Create Task
                      </button>
                    </div>
                  )}

                  <div>
                    {hasComments ? (
                      <button 
                        onClick={() => setExpandedComments(prev => ({...prev, [section.key]: !prev[section.key]}))}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: T.amber, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        <MessageSquare size={12} /> {openComms.length} Issues {isExpanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: T.textMuted, opacity: 0.5 }}>Clean</span>
                    )}
                  </div>
                </div>

                {isExpanded && hasComments && (
                  <div style={{ padding: '16px 24px 16px 64px', background: T.surface2, borderBottom: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: T.textMuted }}>Unresolved Issues Thread</div>
                    {openComms.map(c => (
                      <div key={c.id} style={{ display: 'flex', gap: '12px', background: T.bg, border: `1px solid ${T.border}`, padding: '12px', borderRadius: '8px' }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: avatarColor(c.createdBy?.uid), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', fontWeight: 800, flexShrink: 0 }}>
                          {(c.createdBy?.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: T.text }}>{c.createdBy?.email?.split('@')[0]}</div>
                          {c.quote && (
                            <div style={{ fontSize: '0.75rem', color: T.textMuted, fontStyle: 'italic', padding: '4px 8px', borderLeft: `2px solid ${T.amber}`, background: 'rgba(245,158,11,0.05)', borderRadius: '0 4px 4px 0', margin: '6px 0' }}>
                              "{c.quote}"
                            </div>
                          )}
                          {c.firstComment && <div style={{ fontSize: '0.85rem', color: T.text, marginTop: '4px' }}>{c.firstComment}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: T.bg, display: 'flex', flexDirection: 'column', animation: 'imFadeIn 0.2s ease-out', overflow: 'hidden' }}>
      
      {/* BACKGROUND CANVAS EFFECT */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }} />

      {/* FOREGROUND UI WRAPPER */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* HEADER */}
        <header style={{ height: '70px', padding: '0 32px', background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: T.text, letterSpacing: '-0.5px' }}>Dossier Mission Control</h1>
              <span style={{ fontSize: '0.75rem', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>Operations Board</span>
            </div>
            <div style={{ width: '1px', height: '32px', background: T.border }} />
            <div style={{ display: 'flex', background: T.surface3, padding: '4px', borderRadius: '8px', border: `1px solid ${T.border}` }}>
              <button onClick={() => setViewMode('kanban')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, background: viewMode === 'kanban' ? (isDark ? 'rgba(255,255,255,0.1)' : '#fff') : 'transparent', color: viewMode === 'kanban' ? T.text : T.textMuted, transition: 'all 0.2s' }}>
                <Kanban size={15} /> Kanban
              </button>
              <button onClick={() => setViewMode('matrix')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, background: viewMode === 'matrix' ? (isDark ? 'rgba(255,255,255,0.1)' : '#fff') : 'transparent', color: viewMode === 'matrix' ? T.text : T.textMuted, transition: 'all 0.2s' }}>
                <ListTree size={15} /> Matrix
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button onClick={() => { setEditingTaskId(null); setNewTask({ title: '', assignee: '', reviewer: '', linkedSections: [] }); setIsModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', borderRadius: '8px', background: T.accent, color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(239,68,68,0.3)', transition: 'transform 0.15s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
              <Plus size={16} /> Create Allocation
            </button>
            <button onClick={onClose} style={{ background: 'none', border: `1px solid ${T.border}`, color: T.textMuted, padding: '8px', borderRadius: '8px', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
        </header>

        {/* TOOLBAR & WORKSPACE */}
        <main style={{ flex: 1, paddingTop: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {renderToolbar()}
          {viewMode === 'kanban' ? renderKanban() : <div style={{ height: '100%', overflowY: 'auto' }}>{renderMatrix()}</div>}
        </main>
      </div>

      {/* CREATE / EDIT TASK MODAL */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '16px', width: '500px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'imFadeIn 0.2s ease' }}>
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: T.text }}>{editingTaskId ? "Edit Task Allocation" : "Create Task Allocation"}</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer' }}><X size={18} /></button>
            </div>
            
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Task Description</label>
                <input type="text" autoFocus placeholder="e.g. Draft Q3 Financial Review" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '8px', background: T.bg, border: `1px solid ${T.border}`, color: T.text, outline: 'none', fontSize: '0.9rem' }} />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Assign To</label>
                  <select className="glass-select" value={newTask.assignee} onChange={e => setNewTask({...newTask, assignee: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '8px', background: T.bg, border: `1px solid ${T.border}`, color: T.text, outline: 'none', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <option value="">Unassigned</option>
                    {workspaceUsers.map(u => <option key={u.userId} value={u.userId}>{u.email}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Reviewer</label>
                  <select className="glass-select" value={newTask.reviewer} onChange={e => setNewTask({...newTask, reviewer: e.target.value})} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '8px', background: T.bg, border: `1px solid ${T.border}`, color: T.text, outline: 'none', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <option value="">No Reviewer</option>
                    {workspaceUsers.map(u => <option key={u.userId} value={u.userId}>{u.email}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Link Sections</label>
                <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '12px', maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {flatSections.map(sec => (
                    <label key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: T.text, cursor: 'pointer', marginLeft: sec.isParent ? '0' : '20px' }}>
                      <input type="checkbox" checked={newTask.linkedSections.includes(sec.key)} onChange={() => toggleSectionLink(sec.key)} style={{ accentColor: T.accent }} />
                      <span style={{ fontWeight: sec.isParent ? 700 : 400 }}>{sec.navLabel}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: '20px 24px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: '12px' }}>
              <button onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `1px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleSaveTask} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: T.accent, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>{editingTaskId ? "Save Changes" : "Create Allocation"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CSS INJECTIONS ── */}
      <style>{`
        /* FIX: Ensure dropdown options render correctly without white background */
        .glass-select option {
          background-color: ${T.surface};
          color: ${T.text};
        }
        
        .kanban-card:hover {
          border-color: ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'} !important;
          box-shadow: 0 8px 24px ${isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.1)'} !important;
        }
      `}</style>
    </div>
  );
}
