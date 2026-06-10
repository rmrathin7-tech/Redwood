import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Kanban, ListTree, Plus, X, Search,
  CircleDashed, ArrowRight, Sparkles,
  GripVertical, Trash2, UserCheck, 
  MessageSquare, ChevronDown, ChevronUp, Eye, Edit3, CalendarClock, AlertTriangle, FileText, AlignLeft
} from 'lucide-react';
import { db } from '../../../firebase.js'; 
import { 
  collection, query, where, onSnapshot, addDoc, 
  updateDoc, doc, serverTimestamp, deleteDoc, setDoc
} from 'firebase/firestore';

const AVATAR_COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4'];
const avatarColor = (uid) => AVATAR_COLORS[(uid?.charCodeAt(0) || 0) % AVATAR_COLORS.length];
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_COLUMNS = [
  { id: 'pending', label: 'Pending Allocation', color: '#f59e0b' },
  { id: 'drafting', label: 'Drafting', color: '#3b82f6' },
  { id: 'reviewing', label: 'Reviewing', color: '#a855f7' },
  { id: 'approved', label: 'Approved', color: '#10b981' }
];

export default function IMTaskBoard({ imId, projectId, isDark = true, onClose }) {
  const [viewMode, setViewMode] = useState('matrix'); // Default to Operations Matrix
  
  // Data States
  const [tasks, setTasks] = useState([]);
  const [schema, setSchema] = useState([]);
  const [excludedSections, setExcludedSections] = useState([]);
  const [workspaceUsers, setWorkspaceUsers] = useState([]);
  const [columns, setColumns] = useState([]);
  const [comments, setComments] = useState([]);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterReviewer, setFilterReviewer] = useState('');
  
  // UI & Edit States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  
  const [activeTask, setActiveTask] = useState(null); // Used for Detail Modal
  const [editingTaskId, setEditingTaskId] = useState(null); // Used for Create/Edit Modal
  const [newTask, setNewTask] = useState({ title: '', description: '', assignee: '', reviewer: '', linkedSections: [], dueDate: '', customTitle: false });
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

  // Title Cleaner Helper (Removes hardcoded "1." from DB titles)
  const cleanTitle = (text) => {
    if (!text) return '';
    return text.replace(/^([0-9]+\.)+\s*/, '');
  };

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
          ? (isDark ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)')  
          : (isDark ? 'rgba(59, 130, 246, 0.4)' : 'rgba(14, 165, 233, 0.3)') 
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
    // Sync with the tailored dossier template schema instead of the static master layout
    unsubs.push(onSnapshot(doc(db, 'investment-memos', imId), (localSnap) => {
      if (localSnap.exists() && localSnap.data().dossierSchema) {
        setSchema(localSnap.data().dossierSchema);
      } else {
        onSnapshot(doc(db, 'config', 'im-schema'), (masterSnap) => {
          if (masterSnap.exists()) setSchema(masterSnap.data().sections || []);
        });
      }
    }));
    // Fetch Local IM Exclusions
    unsubs.push(onSnapshot(doc(db, 'investment-memos', imId), (snap) => {
      if (snap.exists()) setExcludedSections(snap.data().excludedSections || []);
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
  const visibleSchema = useMemo(() => {
    return schema.filter(s => !excludedSections.includes(s.id));
  }, [schema, excludedSections]);

  const sectionNumberMap = useMemo(() => {
    const map = {};
    let parentCounter = 1;
    const parents = visibleSchema.filter(s => !s.parentId).sort((a,b) => (a.order||0) - (b.order||0));
    
    parents.forEach(p => {
      map[p.id] = `${parentCounter}`;
      let childCounter = 1;
      const children = visibleSchema.filter(s => s.parentId === p.id).sort((a,b) => (a.order||0) - (b.order||0));
      
      children.forEach(c => {
        map[c.id] = `${parentCounter}.${childCounter}`;
        childCounter++;
      });
      parentCounter++;
    });
    return map;
  }, [visibleSchema]);

  const flatSections = useMemo(() => {
    const result = [];
    const parents = visibleSchema.filter(s => !s.parentId).sort((a,b) => (a.order||0) - (b.order||0));
    parents.forEach(p => {
      result.push({ ...p, isParent: true });
      visibleSchema.filter(s => s.parentId === p.id).sort((a,b) => (a.order||0) - (b.order||0))
            .forEach(c => result.push({ ...c, isParent: false }));
    });
    return result;
  }, [visibleSchema]);

  const getSectionName = useCallback((key) => {
    const sec = flatSections.find(s => s.key === key);
    if (!sec) {
      // Fallback if task is linked to an excluded section
      const hiddenSec = schema.find(s => s.key === key);
      if (hiddenSec) return `(Excluded) ${cleanTitle(hiddenSec.navLabel || hiddenSec.heading)}`;
      return key;
    }
    return `${sectionNumberMap[sec.id]}. ${cleanTitle(sec.navLabel || sec.heading)}`;
  }, [flatSections, sectionNumberMap, schema]);

  const getDueDateState = useCallback((task) => {
    if (!task?.dueDate) {
      return { level: 'none', label: 'No due date', accent: T.textMuted, bg: 'transparent', border: T.border };
    }
    const [year, month, day] = String(task.dueDate).split('-').map(Number);
    if (!year || !month || !day) {
      return { level: 'none', label: task.dueDate, accent: T.textMuted, bg: 'transparent', border: T.border };
    }
    const dueAt = new Date(year, month - 1, day, 23, 59, 59, 999);
    const now = new Date();
    const daysLeft = Math.ceil((dueAt.getTime() - now.getTime()) / DAY_MS);
    if (daysLeft < 0) {
      return { level: 'overdue', label: `Overdue ${Math.abs(daysLeft)}d`, accent: '#ef4444', bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.45)' };
    }
    if (daysLeft <= 2) {
      return { level: 'warning', label: daysLeft === 0 ? 'Due today' : `Due in ${daysLeft}d`, accent: '#f59e0b', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.45)' };
    }
    return { level: 'safe', label: `Due in ${daysLeft}d`, accent: '#10b981', bg: 'rgba(16,185,129,0.14)', border: 'rgba(16,185,129,0.45)' };
  }, [T.border, T.textMuted]);

  // Extract only users that actually have tasks on this board
  const activeAssignees = useMemo(() => {
    const uniqueMap = new Map();
    tasks.forEach(t => {
      if (t.assignee?.uid) uniqueMap.set(t.assignee.uid, t.assignee);
    });
    return Array.from(uniqueMap.values());
  }, [tasks]);

  const activeReviewers = useMemo(() => {
    const uniqueMap = new Map();
    tasks.forEach(t => {
      if (t.reviewer?.uid) uniqueMap.set(t.reviewer.uid, t.reviewer);
    });
    return Array.from(uniqueMap.values());
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      let passesSearch = true;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const titleMatch = t.title.toLowerCase().includes(q);
        const sectionMatch = (t.linkedSections || []).some(key => {
          const sec = flatSections.find(s => s.key === key);
          return sec && cleanTitle(sec.navLabel || sec.heading).toLowerCase().includes(q);
        });
        passesSearch = titleMatch || sectionMatch;
      }
      if (!passesSearch) return false;
      if (filterAssignee && t.assignee?.uid !== filterAssignee) return false;
      if (filterReviewer && t.reviewer?.uid !== filterReviewer) return false;
      return true;
    });
  }, [tasks, searchQuery, filterAssignee, filterReviewer, flatSections]);

  const sectionChildKeysByParent = useMemo(() => {
    const sectionById = new Map(visibleSchema.map(s => [s.id, s]));
    return visibleSchema.reduce((acc, sec) => {
      if (!sec.parentId) return acc;
      const parent = sectionById.get(sec.parentId);
      if (!parent?.key || !sec.key) return acc;
      if (!acc[parent.key]) acc[parent.key] = [];
      acc[parent.key].push(sec.key);
      return acc;
    }, {});
  }, [visibleSchema]);

  const parentKeyByChild = useMemo(() => {
    const map = {};
    Object.entries(sectionChildKeysByParent).forEach(([parentKey, childKeys]) => {
      childKeys.forEach(childKey => { map[childKey] = parentKey; });
    });
    return map;
  }, [sectionChildKeysByParent]);

  const buildTaskTitleFromSections = useCallback((linkedSections = []) => {
    const unique = Array.from(new Set(linkedSections)).filter(Boolean);
    const collapsed = unique.filter((secKey) => {
      const parentKey = parentKeyByChild[secKey];
      return !(parentKey && unique.includes(parentKey));
    });
    const names = collapsed.map(getSectionName).filter(Boolean);
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} + ${names[1]}`;
    return `${names[0]} + ${names[1]} +${names.length - 2} more`;
  }, [getSectionName, parentKeyByChild]);

  // Global Lockout Mechanism for Allocations
  const globallyAssignedSections = useMemo(() => {
    const locked = new Set();
    tasks.forEach(task => {
      if (editingTaskId && task.id === editingTaskId) return; 
      (task.linkedSections || []).forEach(secKey => locked.add(secKey));
    });
    return locked;
  }, [tasks, editingTaskId]);

  const normalizeLinkedSections = useCallback((linkedSections = []) => {
    const merged = new Set(linkedSections);
    linkedSections.forEach((key) => {
      (sectionChildKeysByParent[key] || []).forEach(childKey => merged.add(childKey));
    });
    return Array.from(merged);
  }, [sectionChildKeysByParent]);

  const taskStats = useMemo(() => {
    const reviewingCol = columns.find(c => c.label.toLowerCase().includes('review'))?.id || 'reviewing';
    const dueSummary = filteredTasks.reduce((acc, task) => {
      const state = getDueDateState(task).level;
      if (state === 'warning') acc.dueSoon += 1;
      if (state === 'overdue') acc.overdue += 1;
      return acc;
    }, { dueSoon: 0, overdue: 0 });
    return {
      total: filteredTasks.length,
      reviewing: filteredTasks.filter(t => t.status === reviewingCol).length,
      unassigned: filteredTasks.filter(t => !t.assignee?.uid).length,
      dueSoon: dueSummary.dueSoon,
      overdue: dueSummary.overdue
    };
  }, [columns, filteredTasks, getDueDateState]);

  // ── COMMENT ANALYTICS & SLA ENGINE ──
  const commentStatsBySection = useMemo(() => {
    const stats = {};
    schema.forEach(sec => {
      if (sec?.key) {
        stats[sec.key] = { total: 0, open: 0, resolved: 0, slaBreached: 0, comments: [] };
      }
    });

    const now = Date.now();
    const SLA_MS = 48 * 60 * 60 * 1000; // 48-hour SLA threshold

    comments.forEach(comment => {
      const cSectionId = comment.sectionId || '';
      const cDataPath = comment.dataPath || '';

      // Bulletproof matching: cross-reference keys and IDs across both fields
      const matchedSec = schema.find(sec => {
        if (!sec) return false;
        return (
          (sec.key && (cSectionId === sec.key || cDataPath.includes(sec.key))) ||
          (sec.id && (cSectionId === sec.id || cDataPath.includes(sec.id)))
        );
      });
      
      if (matchedSec && matchedSec.key) {
        const secKey = matchedSec.key;
        if (!stats[secKey]) stats[secKey] = { total: 0, open: 0, resolved: 0, slaBreached: 0, comments: [] };
        
        stats[secKey].total += 1;
        stats[secKey].comments.push(comment);
        
        if (comment.status === 'resolved') {
          stats[secKey].resolved += 1;
        } else {
          stats[secKey].open += 1;
          const createdAt = comment.createdAt?.toMillis ? comment.createdAt.toMillis() : (comment.createdAt || now);
          if (now - createdAt > SLA_MS) stats[secKey].slaBreached += 1;
        }
      }
    });
    return stats;
  }, [comments, schema]);

  // ORPHAN CATCHER: Sections excluded from the template, but still have active comments
  const excludedSectionsWithComments = useMemo(() => {
    return excludedSections.map(exId => schema.find(s => s.id === exId))
      .filter(sec => {
        if (!sec || !sec.key) return false;
        const stats = commentStatsBySection[sec.key];
        return stats && stats.open > 0;
      });
  }, [excludedSections, schema, commentStatsBySection]);

  const handleDeepLinkSection = (e, path) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('im-jump-to-section', { detail: { path } }));
    if (onClose) onClose();
  };

  const handleDeepLinkComment = (e, path) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('im-open-comments-sidebar'));
    // Slight delay ensures the sidebar renders before trying to jump inside it
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('im-jump-to-section', { detail: { path } }));
    }, 150);
    if (onClose) onClose();
  };

  // ── INLINE MUTATIONS ──
  const handleUpdateTaskField = async (taskId, field, userId) => {
    const user = workspaceUsers.find(u => u.userId === userId);
    const payload = user ? { uid: user.userId, email: user.email } : null;
    await updateDoc(doc(db, 'im-tasks', taskId), { [field]: payload, updatedAt: serverTimestamp() });
    
    // Update local state if Detail Modal is open to reflect immediately
    if (activeTask && activeTask.id === taskId) {
      setActiveTask(prev => ({ ...prev, [field]: payload }));
    }
  };

  const handleUpdateStatus = async (taskId, status) => {
    await updateDoc(doc(db, 'im-tasks', taskId), { status, updatedAt: serverTimestamp() });
    if (activeTask && activeTask.id === taskId) {
      setActiveTask(prev => ({ ...prev, status }));
    }
  };

  const handleUpdateDueDate = async (taskId, dueDate) => {
    await updateDoc(doc(db, 'im-tasks', taskId), { dueDate, updatedAt: serverTimestamp() });
    if (activeTask && activeTask.id === taskId) {
      setActiveTask(prev => ({ ...prev, dueDate }));
    }
  };

  const handleUpdateDescription = async (taskId, description) => {
    await updateDoc(doc(db, 'im-tasks', taskId), { description, updatedAt: serverTimestamp() });
    if (activeTask && activeTask.id === taskId) {
      setActiveTask(prev => ({ ...prev, description }));
    }
  };

  const handleDeleteColumn = async (colId) => {
    if (!window.confirm("Remove this pipeline stage?")) return;
    await updateDoc(doc(db, 'im-task-config', imId), { columns: columns.filter(c => c.id !== colId) });
  };

  const handleDeleteTask = async (task) => {
    if (!window.confirm(`Delete "${task.title}" allocation card?`)) return;
    await deleteDoc(doc(db, 'im-tasks', task.id));
    if (editingTaskId === task.id) {
      setIsCreateModalOpen(false);
      setEditingTaskId(null);
    }
    if (activeTask && activeTask.id === task.id) {
      setIsDetailModalOpen(false);
      setActiveTask(null);
    }
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
      description: task.description || '',
      assignee: task.assignee?.uid || '',
      reviewer: task.reviewer?.uid || '',
      linkedSections: normalizeLinkedSections(task.linkedSections || []),
      dueDate: task.dueDate || '',
      customTitle: task.customTitle ?? true
    });
    setIsCreateModalOpen(true);
  };

  const openDetailModal = (task) => {
    setActiveTask(task);
    setIsDetailModalOpen(true);
  };

  const openQuickCreate = (secKey) => {
    if (globallyAssignedSections.has(secKey)) {
        alert("This section is already allocated to another task. Please edit the existing allocation.");
        return;
    }
    setEditingTaskId(null);
    setNewTask({
      title: buildTaskTitleFromSections([secKey]),
      description: '',
      assignee: '',
      reviewer: '',
      linkedSections: normalizeLinkedSections([secKey]),
      dueDate: '',
      customTitle: false
    });
    setIsCreateModalOpen(true);
  };

  const handleSaveTask = async () => {
    let assigneeObj = null, reviewerObj = null;
    const aUser = workspaceUsers.find(u => u.userId === newTask.assignee);
    const rUser = workspaceUsers.find(u => u.userId === newTask.reviewer);
    if (aUser) assigneeObj = { uid: aUser.userId, email: aUser.email };
    if (rUser) reviewerObj = { uid: rUser.userId, email: rUser.email };

    const normalizedLinkedSections = normalizeLinkedSections(newTask.linkedSections);
    const autoTitle = buildTaskTitleFromSections(normalizedLinkedSections).trim();
    const resolvedTitle = newTask.customTitle ? newTask.title.trim() : autoTitle;
    
    if (!resolvedTitle) {
      return alert(newTask.customTitle ? "Task needs a title" : "Select at least one section or enable custom title");
    }

    if (editingTaskId) {
      await updateDoc(doc(db, 'im-tasks', editingTaskId), {
        assignee: assigneeObj,
        reviewer: reviewerObj,
        linkedSections: normalizedLinkedSections,
        dueDate: newTask.dueDate || '',
        customTitle: !!newTask.customTitle,
        title: resolvedTitle,
        updatedAt: serverTimestamp()
      });
    } else {
      const initialStatus = columns.length > 0 ? columns[0].id : 'pending';
      await addDoc(collection(db, 'im-tasks'), {
        imId, projectId, title: resolvedTitle, description: newTask.description || '',
        assignee: assigneeObj, reviewer: reviewerObj,
        linkedSections: normalizedLinkedSections, status: initialStatus,
        dueDate: newTask.dueDate || '',
        customTitle: !!newTask.customTitle,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
    }
    
    setIsCreateModalOpen(false);
    setEditingTaskId(null);
    setNewTask({ title: '', description: '', assignee: '', reviewer: '', linkedSections: [], dueDate: '', customTitle: false });
  };

  useEffect(() => {
    if (newTask.customTitle) return;
    const autoTitle = buildTaskTitleFromSections(newTask.linkedSections);
    setNewTask(prev => {
      if (prev.customTitle || prev.title === autoTitle) return prev;
      return { ...prev, title: autoTitle };
    });
  }, [buildTaskTitleFromSections, newTask.customTitle, newTask.linkedSections]);

  const toggleSectionLink = (secKey) => {
    // If it's globally locked by another task, prevent checking
    if (globallyAssignedSections.has(secKey) && !newTask.linkedSections.includes(secKey)) return;

    setNewTask(prev => {
      const parentKey = parentKeyByChild[secKey];
      if (parentKey && prev.linkedSections.includes(parentKey)) return prev;

      const childKeys = sectionChildKeysByParent[secKey] || [];
      const exists = prev.linkedSections.includes(secKey);
      
      if (childKeys.length > 0) {
        if (exists) {
          return {
            ...prev,
            linkedSections: prev.linkedSections.filter(k => k !== secKey && !childKeys.includes(k))
          };
        }
        
        // Ensure child keys aren't locked before auto-selecting them
        const assignableChildren = childKeys.filter(k => !globallyAssignedSections.has(k));
        return {
          ...prev,
          linkedSections: Array.from(new Set([...prev.linkedSections, secKey, ...assignableChildren]))
        };
      }
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
        
        <div style={{ flex: '1 1 300px', minWidth: '200px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
          <input 
            type="text" placeholder="Search tasks or sections..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 40px', borderRadius: '8px', border: `1px solid ${T.border}`, background: T.surface, color: T.text, outline: 'none', fontSize: '0.85rem' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '0 12px', height: '40px', flexShrink: 0 }}>
          <UserCheck size={16} color={T.textMuted} />
          <select className="glass-select" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={{ background: 'transparent', border: 'none', color: filterAssignee ? T.text : T.textMuted, fontSize: '0.85rem', outline: 'none', cursor: 'pointer', height: '100%', maxWidth: '140px' }}>
            <option value="">All Assignees</option>
            {activeAssignees.map(u => <option key={u.uid} value={u.uid}>{u.email.split('@')[0]}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '0 12px', height: '40px', flexShrink: 0 }}>
          <Eye size={16} color={T.textMuted} />
          <select className="glass-select" value={filterReviewer} onChange={e => setFilterReviewer(e.target.value)} style={{ background: 'transparent', border: 'none', color: filterReviewer ? T.text : T.textMuted, fontSize: '0.85rem', outline: 'none', cursor: 'pointer', height: '100%', maxWidth: '140px' }}>
            <option value="">All Reviewers</option>
            {activeReviewers.map(u => <option key={u.uid} value={u.uid}>{u.email.split('@')[0]}</option>)}
          </select>
        </div>

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
            style={{ flex: '0 0 320px', minWidth: '320px', display: 'flex', flexDirection: 'column', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '12px', transition: 'background 0.2s ease', backdropFilter: 'blur(16px)' }}
          >
           {/* Column Header */}
            <div style={{ padding: '16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: col.color, fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', flex: 1, minWidth: 0 }}>
                <CircleDashed size={14} style={{ flexShrink: 0 }} />
                <span
                  contentEditable
                  suppressContentEditableWarning
                  title="Click to rename stage"
                  onBlur={async (e) => {
                    const newLabel = e.currentTarget.textContent.trim();
                    if (!newLabel || newLabel === col.label) {
                      e.currentTarget.textContent = col.label; // Revert if left blank
                      return;
                    }
                    const newCols = columns.map(c => c.id === col.id ? { ...c, label: newLabel } : c);
                    await updateDoc(doc(db, 'im-task-config', imId), { columns: newCols });
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                  style={{ outline: 'none', cursor: 'text', borderBottom: '1px dashed transparent', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderBottom = `1px dashed ${col.color}80`}
                  onMouseLeave={e => e.currentTarget.style.borderBottom = '1px dashed transparent'}
                >
                  {col.label}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ background: T.surface3, color: T.textMuted, padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800 }}>{colTasks.length}</div>
                <button onClick={() => handleDeleteColumn(col.id)} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', opacity: 0.5 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.5}><Trash2 size={12} /></button>
              </div>
            </div>

            {/* Cards Area */}
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {colTasks.map(task => (
                (() => {
                  const dueState = getDueDateState(task);
                  const topAccent = dueState.level === 'none' || dueState.level === 'safe' ? col.color : dueState.accent;
                  return (
                <div 
                  key={task.id} 
                  draggable 
                  className="kanban-card" 
                  onDragStart={(e) => handleDragStart(e, task.id)} 
                  onDragEnd={handleDragEnd}
                  onClick={() => openDetailModal(task)}
                  style={{ 
                    flexShrink: 0, 
                    background: `linear-gradient(160deg, ${T.surface2}, ${isDark ? '#1a2330' : '#ffffff'})`, 
                    border: `1px solid ${dueState.level === 'none' || dueState.level === 'safe' ? T.border : dueState.border}`, 
                    borderRadius: '10px', padding: '14px', cursor: 'pointer', 
                    boxShadow: isDark ? '0 10px 24px rgba(0,0,0,0.26)' : '0 4px 14px rgba(0,0,0,0.06)', 
                    transition: 'all 0.2s cubic-bezier(0.23,1,0.32,1)', position: 'relative', overflow: 'hidden' 
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${topAccent}, transparent)` }} />
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: T.text, lineHeight: 1.4, paddingRight: '12px' }}>{task.title}</h4>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); openEditModal(task); }} 
                        style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', opacity: 0.5 }} 
                        onMouseEnter={e => e.currentTarget.style.opacity = 1} 
                        onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
                      >
                        <Edit3 size={14} />
                      </button>
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

                  {task.description && (
                    <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: T.textMuted, fontSize: '0.75rem' }}>
                      <AlignLeft size={12} /> Description
                    </div>
                  )}

                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '12px', background: `${col.color}1a`, border: `1px solid ${col.color}40`, color: col.color, padding: '3px 9px', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 800 }}>
                    <Sparkles size={11} /> {col.label}
                  </div>
                  {task.dueDate && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '12px', marginLeft: '8px', background: dueState.bg, border: `1px solid ${dueState.border}`, color: dueState.accent, padding: '3px 9px', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 800 }}>
                      {dueState.level !== 'safe' && dueState.level !== 'none' ? <AlertTriangle size={11} /> : <CalendarClock size={11} />} {dueState.label}
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
                  );
                })()
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ flex: '0 0 320px', display: 'flex', flexDirection: 'column' }}>
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

  const renderMatrix = () => {
    // INTELLIGENT CHECK: Are we actually hiding anything?
    // We compare the total flat schema items vs the items currently cleared to render.
    const hasActiveExclusions = schema.length > visibleSchema.length;

    return (
    <div style={{ padding: '0 32px 40px', position: 'relative', zIndex: 10 }}>
      
      {/* EXCLUSION PROTOCOL INFORMATIONAL BANNER */}
      {hasActiveExclusions && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          gap: '16px',
          padding: '12px 20px', 
          background: isDark ? 'rgba(239, 68, 68, 0.06)' : 'rgba(239, 68, 68, 0.04)', 
          border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.15)'}`, 
          borderRadius: '10px', 
          marginBottom: '16px',
          animation: 'imFadeIn 0.2s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.82rem', color: isDark ? '#fca5a5' : '#b91c1c', fontWeight: 500, lineHeight: 1.4 }}>
              Some sections/subsections have been excluded. Kindly review the tailor template for more inputs.
            </span>
          </div>
          <button 
            onClick={() => {
              window.dispatchEvent(new CustomEvent('im-open-tailor-modal'));
              if (onClose) onClose();
            }}
            style={{ 
              background: '#ef4444', 
              color: '#ffffff', 
              border: 'none', 
              padding: '6px 14px', 
              borderRadius: '6px', 
              fontSize: '0.78rem', 
              fontWeight: 700, 
              cursor: 'pointer', 
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.25)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#dc2626'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Review Structure
          </button>
        </div>
      )}

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '12px', overflow: 'hidden', boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 4px 20px rgba(0,0,0,0.05)', backdropFilter: 'blur(16px)' }}>
        
     {/* Matrix Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr 1.2fr 1fr 1.5fr', gap: '16px', padding: '16px 24px', background: T.surface2, borderBottom: `1px solid ${T.border}`, fontSize: '0.7rem', fontWeight: 800, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
          <div>Document Section</div>
          <div>Assignee</div>
          <div>Reviewer</div>
          <div>Task Status</div>
          <div>Target Due</div>
          <div>Audit / Comments</div>
        </div>
        
        {/* Matrix Rows */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {flatSections.map(section => {
            // Find the raw task first to determine row visibility independently of the Kanban filters
            const activeTask = tasks.find(t => t.linkedSections?.includes(section.key));
            
            // Intelligent row visibility logic:
            let isVisible = true;
            
            // 1. If filtering by Assignee/Reviewer, we strictly require a matching task
            if (filterAssignee && activeTask?.assignee?.uid !== filterAssignee) isVisible = false;
            if (filterReviewer && activeTask?.reviewer?.uid !== filterReviewer) isVisible = false;
            
            // 2. If searching, the section name OR the task title must match
            if (searchQuery) {
              const q = searchQuery.toLowerCase();
              const secName = cleanTitle(section.navLabel || section.heading).toLowerCase();
              const taskTitle = activeTask ? activeTask.title.toLowerCase() : '';
              if (!secName.includes(q) && !taskTitle.includes(q)) isVisible = false;
            }

            if (!isVisible) return null;

            const colDef = activeTask ? columns.find(c => c.id === activeTask.status) : null;
            const dueState = activeTask ? getDueDateState(activeTask) : null;
            
            const cStats = commentStatsBySection[section.key] || { total: 0, open: 0, resolved: 0, slaBreached: 0 };
            const hasComments = cStats.total > 0;
            const isExpanded = expandedComments[section.key];

            return (
              <React.Fragment key={section.id}>
                {/* Main Row */}
                <div 
                  style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr 1.2fr 1fr 1.5fr', gap: '16px', padding: '12px 24px', borderBottom: `1px solid ${T.border}`, alignItems: 'center', transition: 'all 0.2s', background: isExpanded ? T.surface3 : 'transparent', cursor: 'default' }} 
                  onMouseEnter={e => e.currentTarget.style.background = T.surface3} 
                  onMouseLeave={e => e.currentTarget.style.background = isExpanded ? T.surface3 : 'transparent'}
                >
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {!section.isParent && <ArrowRight size={14} color={T.textMuted} style={{ marginLeft: '16px' }} />}
                    <button 
                      onClick={(e) => handleDeepLinkSection(e, section.key)}
                      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      title="Jump to this section in the workspace"
                    >
                      <span style={{ fontSize: section.isParent ? '0.9rem' : '0.85rem', fontWeight: section.isParent ? 700 : 500, color: section.isParent ? T.text : T.textMuted, transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = T.accent} onMouseLeave={e => e.currentTarget.style.color = section.isParent ? T.text : T.textMuted}>
                        <span style={{ color: T.accent, marginRight: '6px', fontWeight: 800 }}>{sectionNumberMap[section.id]}.</span>
                        {cleanTitle(section.navLabel || section.heading)}
                      </span>
                    </button>
                         {activeTask && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                          onClick={() => openEditModal(activeTask)} 
                          title="Edit Configuration" 
                          style={{ 
                            background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)', 
                            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'}`, 
                            color: T.text, 
                            cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', 
                            justifyContent: 'center', padding: '6px 8px', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' 
                          }} 
                          onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)'; e.currentTarget.style.color = T.accent; e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = isDark ? '0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.1)'; }} 
                          onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'; e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <Edit3 size={15} />
                        </button>
                        <button 
                          onClick={() => openDetailModal(activeTask)} 
                          title="Open Detailed Task View" 
                          style={{ 
                            background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)', 
                            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'}`, 
                            color: T.text, 
                            cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', 
                            justifyContent: 'center', padding: '6px 8px', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' 
                          }} 
                          onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)'; e.currentTarget.style.color = T.accent; e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = isDark ? '0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.1)'; }} 
                          onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'; e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <FileText size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  {activeTask ? (
                    <>
                      <div>
                        <select 
                          className="glass-select"
                          value={activeTask.assignee?.uid || ''} 
                          onChange={(e) => handleUpdateTaskField(activeTask.id, 'assignee', e.target.value)}
                          style={{ width: '100%', minWidth: '100px', padding: '6px', borderRadius: '6px', background: T.surface2, border: `1px solid ${T.border}`, color: activeTask.assignee ? T.text : T.textMuted, fontSize: '0.8rem', outline: 'none', cursor: 'pointer', boxSizing: 'border-box', textOverflow: 'ellipsis' }}
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
                          style={{ width: '100%', minWidth: '100px', padding: '6px', borderRadius: '6px', background: T.surface2, border: `1px solid ${T.border}`, color: activeTask.reviewer ? T.text : T.textMuted, fontSize: '0.8rem', outline: 'none', cursor: 'pointer', boxSizing: 'border-box', textOverflow: 'ellipsis' }}
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
                          style={{ width: '100%', minWidth: '110px', padding: '6px', borderRadius: '6px', background: colDef ? `${colDef.color}15` : T.surface2, border: colDef ? `1px solid ${colDef.color}40` : `1px solid ${T.border}`, color: colDef ? colDef.color : T.text, fontSize: '0.8rem', fontWeight: 700, outline: 'none', cursor: 'pointer', boxSizing: 'border-box', textOverflow: 'ellipsis' }}
                        >
                          {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                        <input
                          type="date"
                          value={activeTask.dueDate || ''}
                          onChange={(e) => handleUpdateDueDate(activeTask.id, e.target.value)}
                          style={{ width: '100%', padding: '6px', borderRadius: '6px', background: T.surface2, border: `1px solid ${T.border}`, color: T.text, fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box' }}
                        />
                        {activeTask.dueDate && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content', padding: '2px 8px', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700, color: dueState?.accent, background: dueState?.bg, border: `1px solid ${dueState?.border}` }}>
                            {dueState?.level === 'warning' || dueState?.level === 'overdue' ? <AlertTriangle size={10} /> : <CalendarClock size={10} />}
                            {dueState?.label}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{ gridColumn: 'span 4', display: 'flex', alignItems: 'center' }}>
                      <button onClick={() => openQuickCreate(section.key)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'transparent', border: `1px dashed ${T.border}`, color: T.textMuted, borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.textMuted; }} onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.borderColor = T.border; }}>
                        <Plus size={12} /> Create Task
                      </button>
                    </div>
                  )}

                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {hasComments ? (
                      <button 
                        onClick={(e) => handleDeepLinkComment(e, section.key)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s', width: 'max-content' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = T.textMuted}
                        onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                      >
                        {cStats.open > 0 ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', whiteSpace: 'nowrap' }}>
                            <MessageSquare size={12} /> {cStats.open} Open
                          </span>
                        ) : (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, color: '#10b981', whiteSpace: 'nowrap' }}>
                            <UserCheck size={12} /> 0 Open
                          </span>
                        )}

                        {cStats.resolved > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, color: '#10b981', borderLeft: `1px solid ${T.border}`, paddingLeft: '8px', whiteSpace: 'nowrap' }}>
                            {cStats.resolved} Resolved
                          </span>
                        )}

                        {cStats.slaBreached > 0 && (
                          <span title={`${cStats.slaBreached} comments open for >48 hours!`} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 800, color: '#ef4444', borderLeft: `1px solid ${T.border}`, paddingLeft: '8px', animation: 'imPulse 2s infinite', whiteSpace: 'nowrap' }}>
                            <AlertTriangle size={12} /> {cStats.slaBreached} Flagged
                          </span>
                        )}
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: T.textMuted, opacity: 0.5, fontStyle: 'italic' }}>No active audit</span>
                    )}
                  </div>
                </div>
              </React.Fragment>
            )
          })}
        </div>
        
        {/* ORPHAN BUCKET FOR EXCLUDED SECTIONS WITH ACTIVE COMMENTS */}
        {excludedSectionsWithComments.length > 0 && (
          <div style={{ borderTop: `2px dashed rgba(239,68,68,0.3)`, background: isDark ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.02)' }}>
            <div style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '1px' }}>
              ⚠️ Archived / Excluded Sections (With Active Comments)
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {excludedSectionsWithComments.map(sec => {
                const cStats = commentStatsBySection[sec.key];
                return (
                  <div key={sec.id} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1.5fr', gap: '16px', padding: '12px 24px', borderBottom: `1px solid rgba(239,68,68,0.1)`, alignItems: 'center' }}>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: 0.7 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#ef4444', textDecoration: 'line-through' }}>
                        {cleanTitle(sec.navLabel || sec.heading)}
                      </span>
                    </div>

                    <div style={{ gridColumn: 'span 4', fontSize: '0.75rem', color: T.textMuted, fontStyle: 'italic' }}>
                      Section is currently excluded from the final memo.
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <button onClick={(e) => handleDeepLinkComment(e, sec.key)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', background: 'rgba(239,68,68,0.1)', border: `1px solid rgba(239,68,68,0.4)`, borderRadius: '6px', cursor: 'pointer', color: '#ef4444' }}>
                        <MessageSquare size={12} /> {cStats.open} Stranded Comments
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
  }; // <-- THIS IS THE MISSING BRACKET

  return (
    <div style={{ fontFamily: '"DN Sans", sans-serif', position: 'fixed', inset: 0, zIndex: 1000, background: T.bg, display: 'flex', flexDirection: 'column', animation: 'imFadeIn 0.2s ease-out', overflow: 'hidden' }}>
      
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
              <button onClick={() => setViewMode('matrix')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, background: viewMode === 'matrix' ? (isDark ? 'rgba(255,255,255,0.1)' : '#fff') : 'transparent', color: viewMode === 'matrix' ? T.text : T.textMuted, transition: 'all 0.2s' }}>
                <ListTree size={15} /> Matrix
              </button>
              <button onClick={() => setViewMode('kanban')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, background: viewMode === 'kanban' ? (isDark ? 'rgba(255,255,255,0.1)' : '#fff') : 'transparent', color: viewMode === 'kanban' ? T.text : T.textMuted, transition: 'all 0.2s' }}>
                <Kanban size={15} /> Kanban
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button onClick={() => { setEditingTaskId(null); setNewTask({ title: '', description: '', assignee: '', reviewer: '', linkedSections: [], dueDate: '', customTitle: false }); setIsCreateModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', borderRadius: '8px', background: T.accent, color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(239,68,68,0.3)', transition: 'transform 0.15s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
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

      {/* ── CREATE / EDIT ALLOCATION MODAL (STRUCTURAL/WIDE LAYOUT) ── */}
      {isCreateModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '16px', width: '850px', maxWidth: '95vw', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'imFadeIn 0.2s ease' }}>
            
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: T.text }}>{editingTaskId ? "Edit Task Allocation" : "Create Task Allocation"}</h2>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer' }}><X size={18} /></button>
            </div>
            
            <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px', maxHeight: '65vh', overflowY: 'auto' }}>
              
              {/* LEFT COLUMN: SECTIONS LOCKOUT */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '12px' }}>
                  <ListTree size={14} style={{display:'inline', verticalAlign:'text-bottom', marginRight:'4px'}}/> Link Document Sections
                </label>
                <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '16px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {flatSections.map(sec => {
                    const isLockedByOther = globallyAssignedSections.has(sec.key) && !newTask.linkedSections.includes(sec.key);
                    return (
                      <label key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: isLockedByOther ? T.textMuted : T.text, cursor: isLockedByOther ? 'not-allowed' : 'pointer', marginLeft: sec.isParent ? '0' : '20px', opacity: isLockedByOther ? 0.5 : 1 }}>
                        <input
                          type="checkbox"
                          checked={newTask.linkedSections.includes(sec.key)}
                          onChange={() => toggleSectionLink(sec.key)}
                          disabled={isLockedByOther || (!sec.isParent && newTask.linkedSections.includes(parentKeyByChild[sec.key]))}
                          style={{ accentColor: T.accent }}
                        />
                        <span style={{ fontWeight: sec.isParent ? 700 : 400 }}>
                          <span style={{ color: T.primary, marginRight: '6px', fontWeight: 800 }}>{sectionNumberMap[sec.id]}.</span>
                          {cleanTitle(sec.navLabel || sec.heading)}
                        </span>
                        {isLockedByOther && (
                          <span style={{ fontSize: '0.65rem', color: T.textMuted, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '2px 6px', marginLeft: 'auto' }}>
                            Assigned
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* RIGHT COLUMN: EXECUTION PARAMS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Task Title</label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontSize: '0.78rem', color: T.textMuted, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newTask.customTitle}
                      onChange={(e) => {
                        const customTitle = e.target.checked;
                        setNewTask(prev => ({
                          ...prev,
                          customTitle,
                          title: customTitle ? prev.title : buildTaskTitleFromSections(prev.linkedSections)
                        }));
                      }}
                      style={{ accentColor: T.accent }}
                    />
                    Custom title
                  </label>
                  <input type="text" autoFocus placeholder={newTask.customTitle ? "Enter distinct title..." : "Auto-generated from linked sections"} value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} disabled={!newTask.customTitle} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '8px', background: T.bg, border: `1px solid ${T.border}`, color: T.text, outline: 'none', fontSize: '0.9rem', opacity: newTask.customTitle ? 1 : 0.65, cursor: newTask.customTitle ? 'text' : 'not-allowed' }} />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Assignee</label>
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

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Target Due Date</label>
                  <input
                    type="date"
                    value={newTask.dueDate}
                    onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '8px', background: T.bg, border: `1px solid ${T.border}`, color: T.text, outline: 'none', fontSize: '0.9rem' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ padding: '20px 24px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: '12px', justifyContent: 'flex-end', background: T.surface2 }}>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ padding: '12px 24px', borderRadius: '8px', border: `1px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleSaveTask} style={{ padding: '12px 32px', borderRadius: '8px', background: T.accent, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>{editingTaskId ? "Save Allocation" : "Create Allocation"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TRELLO-STYLE TASK DETAIL MODAL ── */}
      {isDetailModalOpen && activeTask && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 0' }}>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '12px', width: '750px', maxWidth: '95vw', maxHeight: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'imFadeIn 0.2s ease' }}>
            
            {/* Header */}
            <div style={{ padding: '24px 32px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', color: T.text, lineHeight: 1.3 }}>{activeTask.title}</h2>
                <div style={{ fontSize: '0.8rem', color: T.textMuted }}>
                  in column <span style={{ color: columns.find(c => c.id === activeTask.status)?.color, fontWeight: 700 }}>{columns.find(c => c.id === activeTask.status)?.label || 'Unknown'}</span>
                </div>
              </div>
              <button onClick={() => { setIsDetailModalOpen(false); setActiveTask(null); }} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', padding: '4px' }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', flex: 1, overflowY: 'auto' }}>
              
              {/* Main Content Area (Description) */}
              <div style={{ padding: '24px 32px', borderRight: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: T.text, fontWeight: 700 }}>
                  <AlignLeft size={18} /> Description
                </div>
                <textarea 
                  placeholder="Add a more detailed description..."
                  value={activeTask.description || ''}
                  onChange={(e) => setActiveTask({...activeTask, description: e.target.value})}
                  onBlur={() => handleUpdateDescription(activeTask.id, activeTask.description)}
                  style={{ width: '100%', boxSizing: 'border-box', minHeight: '200px', padding: '16px', borderRadius: '8px', background: T.surface2, border: `1px solid ${T.border}`, color: T.text, outline: 'none', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                />
                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: T.textMuted }}>Changes are saved automatically when you click outside the box.</div>
              </div>

              {/* Sidebar (Attributes) */}
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', background: T.surface2 }}>
                
                {/* Status Dropdown */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Status</label>
                  <select 
                    className="glass-select" value={activeTask.status} onChange={(e) => handleUpdateStatus(activeTask.id, e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
                  >
                    {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>

                {/* Assignment Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Assignee</label>
                    <select className="glass-select" value={activeTask.assignee?.uid || ''} onChange={(e) => handleUpdateTaskField(activeTask.id, 'assignee', e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}>
                      <option value="">Unassigned</option>
                      {workspaceUsers.map(u => <option key={u.userId} value={u.userId}>{u.email}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Reviewer</label>
                    <select className="glass-select" value={activeTask.reviewer?.uid || ''} onChange={(e) => handleUpdateTaskField(activeTask.id, 'reviewer', e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}>
                      <option value="">No Reviewer</option>
                      {workspaceUsers.map(u => <option key={u.userId} value={u.userId}>{u.email}</option>)}
                    </select>
                  </div>
                </div>

                {/* Due Date */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Due Date</label>
                  <input
                    type="date" value={activeTask.dueDate || ''} onChange={(e) => handleUpdateDueDate(activeTask.id, e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '6px', background: T.surface, border: `1px solid ${T.border}`, color: T.text, outline: 'none', fontSize: '0.85rem' }}
                  />
                </div>

                {/* Linked Sections Read-only */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>Linked Sections</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(activeTask.linkedSections || []).map(secKey => (
                      <div key={secKey} style={{ fontSize: '0.8rem', color: T.text, background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px', padding: '6px 10px' }}>
                        {getSectionName(secKey)}
                      </div>
                    ))}
                    {(!activeTask.linkedSections || activeTask.linkedSections.length === 0) && (
                      <span style={{ fontSize: '0.8rem', color: T.textMuted, fontStyle: 'italic' }}>No sections linked.</span>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: `1px dashed ${T.border}` }}>
                  <button onClick={() => handleDeleteTask(activeTask)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: `1px solid rgba(248,113,113,0.3)`, background: 'rgba(248,113,113,0.1)', color: '#fca5a5', cursor: 'pointer', fontWeight: 700, transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(248,113,113,0.1)'}>
                    Delete Task Card
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── CSS INJECTIONS ── */}
      <style>{`
        .glass-select option {
          background-color: ${T.surface};
          color: ${T.text};
        }
        
        /* Localized scrolling override for Kanban Boards */
        .kanban-card:hover {
          border-color: ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'} !important;
          box-shadow: 0 8px 24px ${isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.1)'} !important;
        }

        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: transparent; 
        }
        ::-webkit-scrollbar-thumb {
          background: ${T.border}; 
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: ${T.textMuted}; 
        }
        
        /* Force native HTML5 calendar picker icons to match the theme color instead of breaking in dark mode */
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: ${isDark ? 'invert(1) sepia(1) saturate(5) hue-rotate(175deg)' : 'none'};
          cursor: pointer;
          opacity: 0.8;
          transition: opacity 0.2s;
        }
        input[type="date"]::-webkit-calendar-picker-indicator:hover {
          opacity: 1;
        }

        @keyframes imPulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
