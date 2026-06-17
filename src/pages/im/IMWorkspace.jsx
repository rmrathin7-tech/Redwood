import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Settings, Sun, Moon, Menu, Search,
  CheckCircle2, ShieldAlert, Loader2, ChevronDown, ChevronRight, Lock, PanelLeftClose,
  MessageSquare, Kanban, User, Scissors, X, Trash2, RotateCcw, Printer,
  Pencil, Check, Blocks, Upload, Download
} from 'lucide-react';
import { auth, db } from '../../firebase.js';
import {
  doc, onSnapshot, updateDoc, serverTimestamp, setDoc, collection,
  query, where, getDocs, writeBatch
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import BlockRegistry from './components/BlockRegistry.jsx';
import CommentsSidebar from './components/CommentsSidebar.jsx';
import IMTaskBoard from './components/IMTaskBoard.jsx';
import IMPrintPreview from './components/IMPrintPreview.jsx';
import CommentSVGOverlay from './components/CommentSVGOverlay.jsx'; 
import SettingsAuthModal from './components/SettingsAuthModal.jsx'; 
import IMSearchWidget from './components/IMSearchWidget.jsx';

// ── AVATAR COLOR POOL ──
const AVATAR_COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4'];
const avatarColor = (uid) => AVATAR_COLORS[(uid?.charCodeAt(0) || 0) % AVATAR_COLORS.length];

// ── STAGGER DELAY per block index ──
const STAGGER_MS = 40;

export default function IMWorkspace() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const imId = searchParams.get('im');
  const projectName = searchParams.get('name') || 'Active Dossier';
  
  const [user, setUser] = useState(null);
  const [workspaceUsers, setWorkspaceUsers] = useState([]); // <-- ADD THIS
  const [schema, setSchema] = useState([]); // Master Schema (Read-Only here)
  const [excludedSections, setExcludedSections] = useState([]); // Local IM Exclusions
  const [customNames, setCustomNames] = useState({}); // Local IM Renames
  const [imData, setImData] = useState({});
  const imDataRef = useRef({}); // <-- Live tracker for the Save Engine
  useEffect(() => { imDataRef.current = imData; }, [imData]);
  const [expandedTailorSections, setExpandedTailorSections] = useState({});
  const [editingTailorName, setEditingTailorName] = useState({ id: null, text: '' });
  const [activeLocks, setActiveLocks] = useState({});
  const [activeSection, setActiveSection] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [theme, setTheme] = useState('dark');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [sectionTransition, setSectionTransition] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [visibleBlocks, setVisibleBlocks] = useState(new Set());
  const [myLockedBlock, setMyLockedBlock] = useState(null);
  const [commentsSidebarOpen, setCommentsSidebarOpen] = useState(false);
  
  // Tailor Template Modal State
  const [showTailorModal, setShowTailorModal] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [showSettingsAuth, setShowSettingsAuth] = useState(false); 
  const [showSearchWidget, setShowSearchWidget] = useState(false);

  // Task Board & Dynamic Columns State
  const [tasks, setTasks] = useState([]);
  const [taskColumns, setTaskColumns] = useState([]);
  const [isTaskBoardOpen, setIsTaskBoardOpen] = useState(false);
  
  const saveTimers = useRef({});
  const savedTimers = useRef({});
  const activeEditPaths = useRef(new Set());
  const mainRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const isDark = theme === 'dark';
  
  // Title Cleaner Helper (Removes hardcoded "1." from DB titles)
  const cleanTitle = (text) => {
    if (!text) return '';
    return text.replace(/^([0-9]+\.)+\s*/, '');
  };

  const T = useMemo(() => ({
    bg:         isDark ? '#060910' : '#f1f5f9',
    surface:    isDark ? '#0d1117' : '#ffffff',
    surface2:   isDark ? '#111827' : '#f8fafc',
    surface3:   isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
    border:     isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)',
    text:       isDark ? '#f1f5f9' : '#0f172a',
    textMuted:  isDark ? '#64748b' : '#94a3b8',
    textSub:    isDark ? '#475569' : '#cbd5e1',
    accent:     '#ef4444',
    accentDim:  isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.07)',
    accentGlow: 'rgba(239,68,68,0.2)',
    green:      '#10b981',
    amber:      '#f59e0b',
    amberDim:   'rgba(245,158,11,0.12)',
    header:     isDark ? 'rgba(6,9,16,0.92)' : 'rgba(255,255,255,0.92)',
    sidebar:    isDark ? '#080c14' : '#ffffff',
    shadow:     isDark ? '0 1px 3px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.06)',
    shadowLg:   isDark ? '0 8px 32px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.1)',
  }), [isDark]);

  useEffect(() => {
    if (!projectId || !imId) { navigate('/module-hub'); return; }
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { navigate('/login'); return; }
      setUser(u);
      const userRef = doc(db, 'workspace-users', u.uid);
      await setDoc(userRef, {
        userId: u.uid, email: u.email, isOnline: true,
        currentPage: 'im', currentIM: { id: projectId, title: projectName },
        currentBlockId: null, lastActive: serverTimestamp(),
      }, { merge: true });
      const hb = setInterval(() => updateDoc(userRef, { lastActive: serverTimestamp() }), 30000);
      const bye = () => updateDoc(userRef, { isOnline: false, currentBlockId: null, lastActive: serverTimestamp() });
      window.addEventListener('beforeunload', bye);
      return () => { clearInterval(hb); window.removeEventListener('beforeunload', bye); };
    });
    return unsub;
  }, [projectId, imId, projectName, navigate]);

  // ── SCHEMA FETCH (THE FORK) ──
  // Checks for a local Dossier Schema first. If none exists, falls back to Master Schema.
  useEffect(() => {
    if (!imId) return;
    
    // First, listen to the local IM document to see if it has a custom schema
    const unsubLocal = onSnapshot(doc(db, 'investment-memos', imId), (localSnap) => {
      if (localSnap.exists() && localSnap.data().dossierSchema) {
        setSchema(localSnap.data().dossierSchema);
      } else {
        // If no local schema exists, fall back to the Master Schema
        const unsubMaster = onSnapshot(doc(db, 'config', 'im-schema'), (masterSnap) => {
          if (masterSnap.exists()) setSchema(masterSnap.data().sections || []);
        });
        return () => unsubMaster();
      }
    });
    
    return () => unsubLocal();
  }, [imId]);

  // Local IM Data & Exclusions Fetch
  useEffect(() => {
    if (!imId) return;
    return onSnapshot(doc(db, 'investment-memos', imId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        
        setImData(prev => {
          const incoming = data.data || {};
          
          // Deep merge engine that respects your active locks
          const mergeSafely = (target, source, currentPath = '') => {
            const result = { ...target };
            for (const key in source) {
              const path = currentPath ? `${currentPath}.${key}` : key;
              
              if (activeEditPaths.current.has(path)) {
                continue; // Skip this field entirely because you are currently typing in it
              }
              
              if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                result[key] = mergeSafely(result[key] || {}, source[key], path);
              } else {
                result[key] = source[key];
              }
            }
            return result;
          };

          return mergeSafely(prev, incoming);
        });

        setExcludedSections(data.excludedSections || []);
        setCustomNames(data.customNames || {});
      }
    });
  }, [imId]); 

  useEffect(() => {
    if (!imId) return;
    const q = query(collection(db, 'im-tasks'), where('imId', '==', imId));
    return onSnapshot(q, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [imId]);

  useEffect(() => {
    if (!imId) return;
    return onSnapshot(doc(db, 'im-task-config', imId), (snap) => {
      if (snap.exists()) setTaskColumns(snap.data().columns || []);
    });
  }, [imId]);

  useEffect(() => {
    if (!projectId) return;
    return onSnapshot(collection(db, 'workspace-users'), (snap) => {
      const now = Date.now();
      const locks = {}, online = [], allUsers = [];
      
      snap.docs.forEach(d => {
        const u = d.data();
        
        // 1. Build the master list of active users
        if (u.isActive !== false) {
          allUsers.push({ uid: u.userId || d.id, email: u.email });
        }

        // 2. Handle online presence & locks
        const lastActive = u.lastActive?.toMillis?.() || 0;
        if (!u.isOnline || now - lastActive > 45_000) return;
        if (u.currentIM?.id !== projectId) return;
        online.push({ uid: u.userId, email: u.email, section: u.currentSection });
        if (u.currentBlockId && user && u.userId !== user.uid) {
          locks[u.currentBlockId] = { email: u.email, uid: u.userId };
        }
      });
      
      setWorkspaceUsers(allUsers); // <-- Set the state here!
      setActiveLocks(locks);
      setOnlineUsers(online);
    });
  }, [projectId, user]);

  // ── VISIBLE SCHEMA CALCULATION ──
  const visibleSchema = useMemo(() => {
    return schema.filter(s => !excludedSections.includes(s.id));
  }, [schema, excludedSections]);

  // Set initial active section safely
  useEffect(() => {
    if (!activeSection && visibleSchema.length > 0) {
      setActiveSection(visibleSchema[0].key);
    }
  }, [visibleSchema, activeSection]);

  // ── DYNAMIC NUMBERING ENGINE (Using visibleSchema) ──
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
    const parents = visibleSchema.filter(s => !s.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const result = [];
    parents.forEach(p => {
      const children = visibleSchema
        .filter(s => s.parentId === p.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      result.push({ ...p, isParent: true, hasChildren: children.length > 0 });
      if (!collapsedGroups[p.id]) children.forEach(c => result.push({ ...c, isParent: false }));
    });
    return result;
  }, [visibleSchema, collapsedGroups]);

  const getSectionName = useCallback((key) => {
    const sec = flatSections.find(s => s.key === key);
    if (!sec) return key;
    const displayName = customNames[sec.id] || cleanTitle(sec.navLabel || sec.heading);
    return `${sectionNumberMap[sec.id]}. ${displayName}`;
  }, [flatSections, sectionNumberMap, customNames]);

//   HANDLE LOCAL EXCLUDE / RESTORE & RENAME (TAILOR TEMPLATE)    
  const handleLocalRename = async (id, newName) => {
    const updatedNames = { ...customNames, [id]: newName };
    setCustomNames(updatedNames); // Optimistic UI update
    try {
      await updateDoc(doc(db, 'investment-memos', imId), {
        customNames: updatedNames,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to rename locally", err);
    }
  };

const toggleSectionExclusion = async (id, isExcluding) => {
    let newExclusions = new Set(excludedSections);
    
    // Helper to deeply exclude a block and all its nested branches/fields
    const excludeBlockRecursive = (b) => {
      newExclusions.add(b.id);
      if (b.branches) b.branches.forEach(br => (br.blocks || []).forEach(excludeBlockRecursive));
      if (b.blocks) b.blocks.forEach(excludeBlockRecursive);
    };

    if (isExcluding) {
      newExclusions.add(id);
      
      // Check if it's a top-level section
      const sec = schema.find(s => s.id === id);
      if (sec) {
        (sec.blocks || []).forEach(excludeBlockRecursive);
        // Auto-exclude child sections
        schema.filter(s => s.parentId === id).forEach(c => {
          newExclusions.add(c.id);
          (c.blocks || []).forEach(excludeBlockRecursive);
        });
      } else {
        // It's a block. Find it and exclude its sub-blocks
        const findAndExclude = (blocks) => {
          for (const b of blocks) {
            if (b.id === id) excludeBlockRecursive(b);
            if (b.branches) b.branches.forEach(br => findAndExclude(br.blocks || []));
            if (b.blocks) findAndExclude(b.blocks);
          }
        };
        schema.forEach(s => findAndExclude(s.blocks || []));
      }
    } else {
      newExclusions.delete(id);
      
      // Deep restore: Restore parent blocks/sections if a deeply nested child is restored
      const restoreParents = (targetId) => {
        schema.forEach(s => {
          if (s.id === targetId && s.parentId) newExclusions.delete(s.parentId);
          
          let foundInSection = false;
          const searchBlocks = (blocks, parentBlockId) => {
            for (const b of blocks) {
              if (b.id === targetId) {
                foundInSection = true;
                if (parentBlockId) newExclusions.delete(parentBlockId);
              }
              if (b.branches) b.branches.forEach(br => searchBlocks(br.blocks || [], b.id));
              if (b.blocks) searchBlocks(b.blocks, b.id);
            }
          };
          searchBlocks(s.blocks || [], null);
          
          if (foundInSection) {
            newExclusions.delete(s.id);
            if (s.parentId) newExclusions.delete(s.parentId);
          }
        });
      };
      restoreParents(id);
    }
    
    const exclusionsArr = Array.from(newExclusions);
    
    setExcludedSections(exclusionsArr); // Optimistic UI update

    // If the active section is suddenly excluded, transition away
    if (isExcluding) {
      const targetSec = schema.find(s => s.id === id);
      const isCurrentlyActive = activeSection === targetSec?.key || schema.filter(s => s.parentId === id).some(c => c.key === activeSection);
      
      if (isCurrentlyActive) {
        const remaining = schema.filter(s => !newExclusions.has(s.id));
        if (remaining.length > 0) {
          setActiveSection(remaining[0].key);
          setSectionTransition(true);
          setTimeout(() => setSectionTransition(false), 130);
        } else {
          setActiveSection(null);
        }
      }
    }

    try {
      await updateDoc(doc(db, 'investment-memos', imId), { 
        excludedSections: exclusionsArr,
        updatedAt: serverTimestamp() 
      });
    } catch (err) {
      console.error("Failed to update exclusions locally", err);
    }
  };

  const handleDataChange = useCallback(async (dataPath, value, blockId) => {
    if (!dataPath || !imId) return;
    activeEditPaths.current.add(dataPath);

    let topLevelKey = dataPath.split('.')[0];
    let newBlockData = null;

    setImData(prev => {
      const next = JSON.parse(JSON.stringify(prev)); // Deep clone preserves array structures safely
      const keys = dataPath.split('.');
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) {
        if (cur[keys[i]] === undefined || cur[keys[i]] === null || typeof cur[keys[i]] !== 'object') {
          cur[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
        }
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      newBlockData = next[topLevelKey];
      return next;
    });
    
    setSaveStatus('saving');
    clearTimeout(saveTimers.current[dataPath]);
    saveTimers.current[dataPath] = setTimeout(async () => {
      try {
        // FIX: Fetch the absolute latest state from the Ref to prevent Stale Closure overwrites!
        const latestBlockData = imDataRef.current[topLevelKey];
        await updateDoc(doc(db, 'investment-memos', imId), {
          [`data.${topLevelKey}`]: latestBlockData !== undefined ? latestBlockData : newBlockData,
          updatedAt: serverTimestamp(),
        });
        setSaveStatus('saved');
        if (blockId) window.dispatchEvent(new CustomEvent('im-block-saved', { detail: { blockId } }));
        clearTimeout(savedTimers.current.main);
        savedTimers.current.main = setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (err) {
        console.error('[IMWorkspace] Save failed:', err);
        setSaveStatus('error');
      } finally {
        // FIX: Guarantee the edit lock is released so the user isn't permanently 
        // blinded to colleague updates if a save fails due to network drop.
        activeEditPaths.current.delete(dataPath);
      }
    }, 700);
  }, [imId]);

  // ── BATCH DATA CHANGE (FOR REPLACE ALL) ──
  const handleBatchDataChange = async (updates) => {
    if (!imId) return;
    
    const topLevelKeysToUpdate = new Set();
    let finalNextState = null;

    setImData(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      Object.entries(updates).forEach(([dataPath, value]) => {
        const keys = dataPath.split('.');
        topLevelKeysToUpdate.add(keys[0]);
        let cur = next;
        for (let i = 0; i < keys.length - 1; i++) {
          if (cur[keys[i]] === undefined || cur[keys[i]] === null || typeof cur[keys[i]] !== 'object') {
            cur[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
          }
          cur = cur[keys[i]];
        }
        cur[keys[keys.length - 1]] = value;
      });
      finalNextState = next;
      return next;
    });

    setSaveStatus('saving');
    try {
      const dbUpdates = { updatedAt: serverTimestamp() };
      // FIX: Apply updates block-by-block to prevent data corruption
      topLevelKeysToUpdate.forEach(key => {
        if (finalNextState[key] !== undefined) {
          dbUpdates[`data.${key}`] = finalNextState[key];
        }
      });

      await updateDoc(doc(db, 'investment-memos', imId), dbUpdates);
      setSaveStatus('saved');
      clearTimeout(savedTimers.current.main);
      savedTimers.current.main = setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('[IMWorkspace] Batch update failed:', err);
      setSaveStatus('error');
    }
  };

  const handleBlockFocus = useCallback(async (blockId) => {
    if (!user) return;
    setMyLockedBlock(blockId);
    await updateDoc(doc(db, 'workspace-users', user.uid), {
      currentBlockId: blockId,
      currentSection: activeSection,
    });
  }, [user, activeSection]);

  const handleBlockBlur = useCallback(async () => {
    if (!user) return;
    setMyLockedBlock(null);
    await updateDoc(doc(db, 'workspace-users', user.uid), { currentBlockId: null });
  }, [user]);

  const handleSectionClick = useCallback(async (sectionKey) => {
    if (sectionKey === activeSection) return;
    setSectionTransition(true);
    setVisibleBlocks(new Set());
    setTimeout(() => {
      setActiveSection(sectionKey);
      setSectionTransition(false);
      if (mainRef.current) mainRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }, 130);
    if (user) await updateDoc(doc(db, 'workspace-users', user.uid), {
      currentBlockId: null,
      currentSection: sectionKey,
    });
  }, [user, activeSection]);

  const toggleGroup = useCallback((groupId) =>
    setCollapsedGroups(p => ({ ...p, [groupId]: !p[groupId] })), []);

  const activeSectionSchema = useMemo(() =>
    visibleSchema.find(s => s.key === activeSection), [visibleSchema, activeSection]);

  const activeSectionChildren = useMemo(() => {
    if (!activeSectionSchema?.id) return [];
    return visibleSchema
      .filter(s => s.parentId === activeSectionSchema.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [visibleSchema, activeSectionSchema]);

  const activeSectionHasBlocks = (activeSectionSchema?.blocks || []).length > 0;
  const showSubsectionPrompt = !!activeSectionSchema && !activeSectionHasBlocks && activeSectionChildren.length > 0;

  useEffect(() => {
    if (!activeSectionSchema) return;
    const blocks = (activeSectionSchema.blocks || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    // FIX: Only wipe the blocks set and run the stagger timeline if the active section KEY has changed.
    // This blocks background database syncs from restarting the animation cascade.
    setVisibleBlocks(new Set(blocks.map(b => b.id)));
  }, [activeSection]); // <-- Locked strictly to tab selection changes only

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const total = scrollHeight - clientHeight;
      setScrollProgress(total > 0 ? (scrollTop / total) * 100 : 0);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const openComments = () => setCommentsSidebarOpen(true);
    const openTailor = () => setShowTailorModal(true);
    
    window.addEventListener('im-open-comments-sidebar', openComments);
    window.addEventListener('im-open-tailor-modal', openTailor);
    
    return () => {
      window.removeEventListener('im-open-comments-sidebar', openComments);
      window.removeEventListener('im-open-tailor-modal', openTailor);
    };
  }, []);

  // ── DEEP LINKING FROM TASK BOARD MATRIX ──
  useEffect(() => {
    const handler = (e) => {
      const { path } = e.detail;
      if (path) {
        // Find the section key based on the path/id provided
        const targetSection = flatSections.find(s => s.key === path || s.id === path);
        if (targetSection) {
          handleSectionClick(targetSection.key);
        }
      }
    };
    window.addEventListener('im-jump-to-section', handler);
    return () => window.removeEventListener('im-jump-to-section', handler);
  }, [handleSectionClick, flatSections]);

  // ── INTELLIGENT COMMENT JUMPING ──
  useEffect(() => {
    const handler = (e) => {
      const { sectionId, dataPath, commentId } = e.detail;
      
      // Safely resolve the section key whether sectionId is the id or the key
      let targetSectionKey = sectionId;
      if (sectionId && sectionId !== 'global') {
        const targetSec = flatSections.find(s => s.id === sectionId || s.key === sectionId);
        if (targetSec) targetSectionKey = targetSec.key;
      }

      const executeJump = () => {
        // 1. Try to find the exact highlighted word span across the DOM
        const exactSpan = document.querySelector(`[data-comment-id="${commentId}"]`);
        
        if (exactSpan) {
          // Force the browser viewport to center perfectly on the specific glowing word
          exactSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Optional visual flair: Briefly pulse the word to draw the eye
          const originalBg = exactSpan.style.backgroundColor;
          exactSpan.style.transition = 'background-color 0.3s ease';
          exactSpan.style.backgroundColor = 'rgba(245, 158, 11, 0.6)'; // Amber pulse
          setTimeout(() => {
            exactSpan.style.backgroundColor = originalBg;
          }, 600);
        } else {
          // 2. Fallback: If the exact span isn't found (e.g., hidden in truncated text), scroll to the parent block
          window.dispatchEvent(new CustomEvent('im-focus-block', { detail: { dataPath } }));
        }
      };

      // If the comment belongs to a different section, switch to it first
      if (targetSectionKey && targetSectionKey !== 'global' && targetSectionKey !== activeSection) {
        handleSectionClick(targetSectionKey);
        
        // Wait 800ms for the section transition and block stagger to finish rendering
        setTimeout(executeJump, 800);
      } else {
        // We are already in the right section, fire the scroll immediately (with a 50ms buffer for DOM paint)
        setTimeout(executeJump, 50); 
      }
    };
  
    window.addEventListener('im-jump-to-comment', handler);
    return () => window.removeEventListener('im-jump-to-comment', handler);
  }, [activeSection, handleSectionClick, flatSections]);

  // ── GLOBAL SEARCH JUMP & HIGHLIGHT ──
  useEffect(() => {
    const handler = (e) => {
      const { sectionId, blockId, dataPath } = e.detail; // Track the exact path
      
      const executeJump = () => {
        // 1. Try to find the EXACT cell first
        const safeDataPath = dataPath ? dataPath.replace(/[^a-zA-Z0-9-]/g, '-') : '';
        const exactCell = document.getElementById(`cell-${safeDataPath}`);
        
        if (exactCell) {
          exactCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const originalBg = exactCell.style.backgroundColor;
          exactCell.style.transition = 'background-color 0.4s ease';
          exactCell.style.backgroundColor = 'rgba(59, 130, 246, 0.4)'; // Direct Blue pulse on cell
          setTimeout(() => { exactCell.style.backgroundColor = originalBg; }, 1200);
        } else {
          // 2. Fallback to the whole block if cell isn't found
          const blockWrapper = document.getElementById(`block-${blockId}`);
          if (blockWrapper) {
            blockWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const originalBg = blockWrapper.style.backgroundColor;
            blockWrapper.style.transition = 'background-color 0.4s ease';
            blockWrapper.style.backgroundColor = 'rgba(59, 130, 246, 0.25)';
            setTimeout(() => { blockWrapper.style.backgroundColor = originalBg; }, 1200);
          }
        }
      };

      // If the search result is in a different section, navigate there first
      if (sectionId) {
        const targetSec = flatSections.find(s => s.id === sectionId);
        if (targetSec && targetSec.key !== activeSection) {
          handleSectionClick(targetSec.key);
          // Wait 800ms for the section transition and block stagger to finish rendering
          setTimeout(executeJump, 800);
          return;
        }
      }
      
      // We are already in the right section, fire the scroll immediately
      setTimeout(executeJump, 50); 
    };
  
    window.addEventListener('im-search-jump', handler);
    return () => window.removeEventListener('im-search-jump', handler);
  }, [activeSection, handleSectionClick, flatSections]);

  const exitToHub = async () => {
    if (user) await updateDoc(doc(db, 'workspace-users', user.uid), {
      currentBlockId: null, currentPage: 'module-hub',
    });
    navigate(`/module-hub?project=${projectId}&name=${encodeURIComponent(projectName)}`);
  };


  // ── FULL PROJECT ARCHIVE ENGINE (IMPORT / EXPORT) ──
  const handleExportJSON = useCallback(async () => {
    setSaveStatus('saving'); // Trigger the UI loading spinner
    
    try {
      // 1. Fetch Comments
      const commentsSnap = await getDocs(query(collection(db, 'im-comments'), where('imId', '==', imId)));
      const commentsExport = commentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 2. Fetch Tasks & Allocations
      const tasksSnap = await getDocs(query(collection(db, 'im-tasks'), where('imId', '==', imId)));
      const tasksExport = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 3. Construct Master Archive
      const archive = {
        exportVersion: '2.0',
        timestamp: new Date().toISOString(),
        data: imData,
        comments: commentsExport,
        tasks: tasksExport
      };

      // 4. Trigger Download
      const dataStr = JSON.stringify(archive, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectName.replace(/\s+/g, '_')}_Master_Archive.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error("Export Failed:", error);
      setSaveStatus('error');
    }
  }, [imData, projectName, imId]);

  const handleImportJSON = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedObj = JSON.parse(event.target.result);
        
        // Backward compatibility: Detect if it's a V1 (just data) or V2 (full archive) file
        const isFullArchive = !!importedObj.exportVersion;
        const newImData = isFullArchive ? importedObj.data : importedObj;

        if (typeof newImData !== 'object' || newImData === null) {
          alert('Invalid JSON structure. Import aborted.');
          return;
        }
        
        if (!window.confirm('⚠️ CRITICAL WARNING: Restoring this archive will overwrite all text, comments, and task allocations in this memo to match the backup state. Proceed?')) {
          e.target.value = '';
          return;
        }

        setImData(newImData); // Instantly update UI
        setSaveStatus('saving');

        // 1. Update Document Data Matrix
        await updateDoc(doc(db, 'investment-memos', imId), {
          data: newImData,
          updatedAt: serverTimestamp()
        });

        // 2. Restore Comments & Tasks via Firebase Batch (Ensures atomic, safe overwrites)
        if (isFullArchive) {
          const MAX_BATCH_SIZE = 450; // Safely below Firestore's 500 limit
          let batch = writeBatch(db);
          let opCount = 0;

          const commitBatchIfFull = async () => {
            if (opCount >= MAX_BATCH_SIZE) {
              await batch.commit();
              batch = writeBatch(db); // Generate a fresh batch
              opCount = 0;
            }
          };
          
          if (importedObj.comments) {
            for (const c of importedObj.comments) {
              const cId = c.id;
              const cData = { ...c };
              delete cData.id; // Clean payload
              batch.set(doc(db, 'im-comments', cId), cData);
              opCount++;
              await commitBatchIfFull();
            }
          }
          
          if (importedObj.tasks) {
            for (const t of importedObj.tasks) {
              const tId = t.id;
              const tData = { ...t };
              delete tData.id; // Clean payload
              batch.set(doc(db, 'im-tasks', tId), tData);
              opCount++;
              await commitBatchIfFull();
            }
          }
          
          if (opCount > 0) {
            await batch.commit(); // Push any remaining items
          }
        }

        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (err) {
        console.error('[IMWorkspace] Import failed:', err);
        alert('Failed to parse or save imported JSON file. Ensure it is a valid backup.');
        setSaveStatus('error');
      }
      e.target.value = ''; // Reset input
    };
    reader.readAsText(file);
  }, [imId]);
  const SaveChip = () => {
    const config = {
      saving: { icon: <Loader2 size={11} style={{ animation: 'imSpin 0.8s linear infinite' }} />, label: 'Saving',  color: T.textMuted, bg: T.surface3, border: 'transparent' },
      error:  { icon: <ShieldAlert size={11} />, label: 'Failed', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)' },
      saved:  { icon: <CheckCircle2 size={11} />, label: 'Saved', color: T.green, bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)' },
      idle:   { icon: <CheckCircle2 size={11} />, label: 'Saved', color: T.textSub, bg: 'transparent', border: 'transparent' },
    }[saveStatus] ?? { icon: null, label: '', color: T.textMuted, bg: 'transparent', border: 'transparent' };
    
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 20,
        background: config.bg, color: config.color,
        fontSize: 11, fontWeight: 700, border: `1px solid ${config.border}`,
        transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {config.icon} {config.label}
      </div>
    );
  };

  const LockIndicator = () => {
    if (!myLockedBlock) return null;
    const othersOnline = onlineUsers.filter(u => u.uid !== user?.uid);
    if (othersOnline.length === 0) return null;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 20,
        background: T.amberDim, border: '1px solid rgba(245,158,11,0.25)',
        fontSize: 11, fontWeight: 700, color: T.amber,
        animation: 'imFadeIn 0.2s ease',
      }}>
        <Lock size={10} /> You're locking a field
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: T.bg, color: T.text,
      fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif",
    }}>
      <aside style={{
        width: isSidebarOpen ? 272 : 0, minWidth: isSidebarOpen ? 272 : 0,
        overflow: 'hidden', background: T.sidebar, borderRight: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1), min-width 0.3s cubic-bezier(0.4,0,0.2,1)',
        flexShrink: 0, zIndex: 20,
      }}>
        <div style={{ padding: '18px 20px 16px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 2.5, textTransform: 'uppercase', color: T.text, marginBottom: 8 }}>
              RED<span style={{ color: T.accent }}>WOOD</span>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: T.accentDim, border: '1px solid rgba(239,68,68,0.15)', borderRadius: 20, padding: '3px 10px 3px 7px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent, boxShadow: `0 0 6px ${T.accentGlow}`, animation: 'imPulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: T.accent, letterSpacing: 0.3 }}>{projectName}</span>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            title="Minimize Sidebar"
            style={{ background: T.surface3, border: `1px solid ${T.border}`, color: T.textMuted, cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s, background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = T.border; e.currentTarget.style.color = T.text; }}
            onMouseLeave={e => { e.currentTarget.style.background = T.surface3; e.currentTarget.style.color = T.textMuted; }}
          >
            <PanelLeftClose size={14} />
          </button>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px', scrollbarWidth: 'thin', scrollbarColor: `${T.border} transparent` }}>
          {flatSections.map(section => {
            const isActive = activeSection === section.key;
            const isCollapsed = collapsedGroups[section.id];
            const viewers = onlineUsers.filter(u => u.section === section.key && u.uid !== user?.uid);
            
            if (section.isParent) return (
              <div key={section.id}>
                <div
                  onClick={() => { handleSectionClick(section.key); if (isCollapsed) toggleGroup(section.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 10px', borderRadius: 7, cursor: 'pointer', marginBottom: 1,
                    color: isActive ? T.text : T.textMuted, background: isActive ? T.accentDim : 'transparent',
                    userSelect: 'none', transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.surface3; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden' }}>
                    {isActive && <div style={{ width: 3, height: 14, borderRadius: 2, background: T.accent, flexShrink: 0, boxShadow: `0 0 8px ${T.accentGlow}` }} />}
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isActive ? T.accent : 'inherit' }}>
                      <span style={{ color: isActive ? T.accent : T.textMuted, marginRight: '6px' }}>{sectionNumberMap[section.id]}.</span>
                      {customNames[section.id] || cleanTitle(section.navLabel)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {viewers.length > 0 && viewers.slice(0, 2).map((v, i) => (
                      <div key={v.uid} title={v.email} style={{ width: 16, height: 16, borderRadius: '50%', fontSize: 8, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', background: avatarColor(v.uid), boxShadow: `0 0 0 2px ${T.sidebar}`, marginLeft: i > 0 ? -5 : 0 }}>
                        {v.email.charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {section.hasChildren && (
                      <div onClick={(e) => { e.stopPropagation(); toggleGroup(section.id); }} style={{ color: T.textSub, transition: 'transform 0.22s ease', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', padding: '4px' }}>
                        <ChevronDown size={13} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
            return (
              <div
                key={section.id}
                onClick={() => handleSectionClick(section.key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px 6px 22px', borderRadius: 7, cursor: 'pointer',
                  marginBottom: 1, userSelect: 'none', position: 'relative',
                  transition: 'all 0.15s ease', background: isActive ? T.accentDim : 'transparent',
                  color: isActive ? T.accent : T.textMuted,
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = T.surface3; e.currentTarget.style.color = T.text; } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted; } }}
              >
                {isActive
                  ? <div style={{ position: 'absolute', left: 10, width: 2, height: 14, borderRadius: 2, background: T.accent, boxShadow: `0 0 6px ${T.accentGlow}` }} />
                  : <div style={{ position: 'absolute', left: 13, width: 4, height: 4, borderRadius: '50%', background: T.textSub }} />
                }
              <span style={{ fontSize: 11.5, fontWeight: isActive ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 6 }}>
                    <span style={{ color: isActive ? T.accent : T.textMuted, marginRight: '6px' }}>{sectionNumberMap[section.id]}.</span>
                    {customNames[section.id] || cleanTitle(section.navLabel)}
                  </span>
                {viewers.length > 0 && (
                  <div style={{ display: 'flex', flexShrink: 0 }}>
                    {viewers.slice(0, 2).map((v, i) => (
                      <div key={v.uid} title={v.email} style={{ width: 14, height: 14, borderRadius: '50%', fontSize: 7, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', background: avatarColor(v.uid), boxShadow: `0 0 0 2px ${T.sidebar}`, marginLeft: i > 0 ? -4 : 0 }}>
                        {v.email.charAt(0).toUpperCase()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        {onlineUsers.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex' }}>
              {onlineUsers.slice(0, 4).map((u, i) => (
                <div key={u.uid} title={u.email} style={{ width: 22, height: 22, borderRadius: '50%', fontSize: 9, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', background: avatarColor(u.uid), boxShadow: `0 0 0 2px ${T.sidebar}`, marginLeft: i > 0 ? -6 : 0 }}>
                  {u.email.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, flexShrink: 0, boxShadow: '0 0 6px rgba(16,185,129,0.5)', animation: 'imPulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted }}>{onlineUsers.length} online</span>
            </div>
          </div>
        )}
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <header style={{
          flexShrink: 0, background: T.header, backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)', position: 'sticky', top: 0, zIndex: 10,
          /* Expose theme to CSS */
          '--t-muted': T.textMuted,
          '--t-text': T.text,
          '--t-surface3': T.surface3,
          '--t-surface': T.surface,
          '--t-border': T.border,
          '--t-shadowLg': T.shadowLg,
        }}>
          <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setIsSidebarOpen(p => !p)}
                data-tip={isSidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}
                className="im-top-btn"
              >
                <Menu size={18} />
              </button>
              <button
                onClick={exitToHub}
                data-tip="Return to Hub"
                className="im-top-btn"
              >
                <ArrowLeft size={15} /> Hub
              </button>
              <div style={{ width: 1, height: 18, background: T.border, margin: '0 4px' }} />
              <div style={{
                fontSize: 13, fontWeight: 700, color: T.text,
                opacity: sectionTransition ? 0 : 1,
                transform: sectionTransition ? 'translateY(4px)' : 'translateY(0)',
                transition: 'opacity 0.15s ease, transform 0.15s ease',
                maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {activeSectionSchema ? `${sectionNumberMap[activeSectionSchema.id]}. ${cleanTitle(activeSectionSchema.heading || activeSectionSchema.navLabel)}` : 'Investment Memo'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {LockIndicator()}
              {SaveChip()}
              <div style={{ width: 1, height: 18, background: T.border, margin: '0 4px' }} />

              <button
                onClick={() => setShowSearchWidget(p => !p)}
                data-tip="Search Document"
                className={`im-top-btn ${showSearchWidget ? 'active' : ''}`}
                style={{ '--hover-bg': 'rgba(59, 130, 246, 0.15)', '--hover-color': '#3b82f6', '--hover-border': 'rgba(59, 130, 246, 0.3)', '--active-bg': 'rgba(59, 130, 246, 0.2)', '--active-color': '#3b82f6', '--active-border': 'rgba(59, 130, 246, 0.5)' }}
              >
                <Search size={18} />
              </button>
              
              <button
                onClick={() => setIsTaskBoardOpen(p => !p)}
                data-tip="Operations Board"
                className={`im-top-btn ${isTaskBoardOpen ? 'active' : ''}`}
                style={{ '--hover-bg': 'rgba(16, 185, 129, 0.15)', '--hover-color': '#10b981', '--hover-border': 'rgba(16, 185, 129, 0.3)', '--active-bg': 'rgba(16, 185, 129, 0.2)', '--active-color': '#10b981', '--active-border': 'rgba(16, 185, 129, 0.5)' }}
              >
                <Kanban size={18} />
              </button>

              <button
                onClick={() => setShowTailorModal(true)}
                data-tip="Tailor Template"
                className={`im-top-btn ${showTailorModal ? 'active' : ''}`}
                style={{ '--hover-bg': 'rgba(239, 68, 68, 0.15)', '--hover-color': '#ef4444', '--hover-border': 'rgba(239, 68, 68, 0.3)', '--active-bg': 'rgba(239, 68, 68, 0.2)', '--active-color': '#ef4444', '--active-border': 'rgba(239, 68, 68, 0.5)' }}
              >
                <Scissors size={18} />
              </button>

              <button
                onClick={() => setCommentsSidebarOpen(p => !p)}
                data-tip="Comments"
                className={`im-top-btn ${commentsSidebarOpen ? 'active' : ''}`}
                style={{ '--hover-bg': 'rgba(245, 158, 11, 0.15)', '--hover-color': '#f59e0b', '--hover-border': 'rgba(245, 158, 11, 0.3)', '--active-bg': 'rgba(245, 158, 11, 0.2)', '--active-color': '#f59e0b', '--active-border': 'rgba(245, 158, 11, 0.5)' }}
              >
                <MessageSquare size={18} />
              </button>

              <button
                onClick={() => setShowSettingsAuth(true)}
                data-tip="Configuration Protocol"
                className={`im-top-btn ${showSettingsAuth ? 'active' : ''}`}
                style={{ '--hover-bg': 'rgba(139, 92, 246, 0.15)', '--hover-color': '#8b5cf6', '--hover-border': 'rgba(139, 92, 246, 0.3)', '--active-bg': 'rgba(139, 92, 246, 0.2)', '--active-color': '#8b5cf6', '--active-border': 'rgba(139, 92, 246, 0.5)' }}
              >
                <Settings size={18} />
              </button>
              
              <div style={{ width: 1, height: 14, background: T.border, margin: '0 2px' }} />

              {/* Hidden file input required to trigger OS file browser */}
              <input type="file" accept=".json" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImportJSON} />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                data-tip="Import JSON Data"
                className="im-top-btn"
                style={{ '--hover-bg': 'rgba(59, 130, 246, 0.15)', '--hover-color': '#3b82f6', '--hover-border': 'rgba(59, 130, 246, 0.3)', '--active-bg': 'rgba(59, 130, 246, 0.2)', '--active-color': '#3b82f6', '--active-border': 'rgba(59, 130, 246, 0.5)' }}
              >
                <Upload size={18} />
              </button>

              <button
                onClick={handleExportJSON}
                data-tip="Export JSON Data"
                className="im-top-btn"
                style={{ '--hover-bg': 'rgba(16, 185, 129, 0.15)', '--hover-color': '#10b981', '--hover-border': 'rgba(16, 185, 129, 0.3)', '--active-bg': 'rgba(16, 185, 129, 0.2)', '--active-color': '#10b981', '--active-border': 'rgba(16, 185, 129, 0.5)' }}
              >
                <Download size={18} />
              </button>

              <div style={{ width: 1, height: 14, background: T.border, margin: '0 2px' }} />

              <button
                onClick={() => setIsPreviewOpen(true)}
                data-tip="Print Preview"
                className="im-top-btn"
                style={{ '--hover-bg': T.surface3, '--hover-color': T.text, '--hover-border': T.border }}
              >
                <Printer size={18} />
              </button>

              <button
                onClick={() => setTheme(p => p === 'dark' ? 'light' : 'dark')}
                data-tip={isDark ? "Light Mode" : "Dark Mode"}
                className="im-top-btn"
                style={{ '--hover-bg': T.surface3, '--hover-color': T.text, '--hover-border': T.border }}
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>
          <div style={{ height: 2, background: T.border, position: 'relative' }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, height: 2, width: `${scrollProgress}%`,
              background: `linear-gradient(90deg, ${T.accent}, #f97316)`, borderRadius: '0 2px 2px 0',
              transition: 'width 0.1s linear', boxShadow: `0 0 8px ${T.accentGlow}`,
              opacity: scrollProgress > 2 ? 1 : 0,
            }} />
          </div>
        </header>

        <main
          ref={mainRef}
          style={{ flex: 1, overflowY: 'auto', padding: '40px 48px', scrollbarWidth: 'thin', scrollbarColor: `${T.border} transparent` }}
        >
          {visibleSchema.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: T.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Settings size={28} style={{ color: T.accent, opacity: 0.6 }} />
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.text }}>No visible schema</div>
              <div style={{ fontSize: 13, color: T.textMuted, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
                You may have excluded all sections, or the template is empty.
              </div>
              <button
                onClick={() => setShowTailorModal(true)}
                style={{ marginTop: 4, padding: '10px 22px', borderRadius: 8, background: T.accent, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: `0 4px 14px ${T.accentGlow}`, transition: 'transform 0.15s, box-shadow 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 20px ${T.accentGlow}`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 4px 14px ${T.accentGlow}`; }}
              >
                Tailor Template (Restore)
              </button>
            </div>
          ) : !activeSectionSchema ? (
            <div style={{ color: T.textMuted, fontSize: 14, textAlign: 'center', marginTop: 80 }}>
              Select a section from the sidebar to begin.
            </div>
          ) : showSubsectionPrompt ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '52vh', gap: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
                <span style={{ color: T.accent, marginRight: '10px' }}>{sectionNumberMap[activeSectionSchema.id]}.</span>
                {cleanTitle(activeSectionSchema.heading || activeSectionSchema.navLabel)}
              </div>
              <div style={{ maxWidth: 420, fontSize: 13, color: T.textMuted, lineHeight: 1.6 }}>
                This section has only subsections. Choose a subsection from the left sidebar to continue.
              </div>
            </div>
          ) : (
            <div style={{
              maxWidth: 820, margin: '0 auto',
              opacity: sectionTransition ? 0 : 1, transform: sectionTransition ? 'translateY(10px)' : 'translateY(0)',
              transition: 'opacity 0.2s ease, transform 0.2s ease',
            }}>
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
                  <div style={{ width: 4, height: 32, borderRadius: 3, flexShrink: 0, background: `linear-gradient(180deg, ${T.accent}, rgba(239,68,68,0.3))` }} />
                  <h2 style={{ fontSize: 24, fontWeight: 800, color: T.text, margin: 0, letterSpacing: -0.3, lineHeight: 1.2 }}>
                    <span style={{ color: T.accent, marginRight: '10px' }}>{sectionNumberMap[activeSectionSchema.id]}.</span>
                    {customNames[activeSectionSchema.id] || cleanTitle(activeSectionSchema.heading || activeSectionSchema.navLabel)}
                  </h2>
                </div>
                
                {(() => {
                  const sectionTask = tasks.find(t => t.linkedSections?.includes(activeSectionSchema.key));
                  if (!sectionTask) return null;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '0 0 16px 18px', padding: '6px 12px', background: T.surface2, borderRadius: '8px', border: `1px solid ${T.border}`, width: 'fit-content' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: T.textMuted, fontWeight: 600 }}>
                        <User size={13} /> {sectionTask.assignee ? sectionTask.assignee.email.split('@')[0] : 'Unassigned'}
                      </div>
                      <div style={{ width: '1px', height: '14px', background: T.border }} />
                      <select 
                value={sectionTask.status}
                onChange={(e) => updateDoc(doc(db, 'im-tasks', sectionTask.id), { status: e.target.value })}
                style={{ background: 'transparent', border: 'none', color: T.text, fontSize: '0.8rem', fontWeight: 700, outline: 'none', cursor: 'pointer' }}
              >
                {taskColumns.map(col => (
                  <option 
                    key={col.id} 
                    value={col.id} 
                    style={{ background: T.surface, color: T.text }}
                  >
                    {col.label}
                  </option>
                ))}
              </select>
                    </div>
                  );
                })()}

                {activeSectionSchema.desc && (
                  <p style={{ margin: '0 0 0 18px', fontSize: 13, color: T.textMuted, lineHeight: 1.6, maxWidth: 560 }}>
                    {activeSectionSchema.desc}
                  </p>
                )}
                <div style={{ marginTop: 16, height: 1, background: `linear-gradient(90deg, ${T.border} 0%, transparent 80%)` }} />
              </div>
              
              {(activeSectionSchema.blocks || [])
                .filter(block => !excludedSections.includes(block.id))
                .slice()
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map(block => {
                  const getValue = (path) => {
                    if (!path) return undefined;
                    return path.split('.').reduce((obj, key) => obj?.[key], imData);
                  };
                  const isVisible = visibleBlocks.has(block.id);
                  return (
                    <div
                      key={block.id}
                      id={`block-${block.id}`}
                      style={{
                        opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(10px)',
                        transition: 'opacity 0.25s ease, transform 0.25s ease',
                        borderRadius: '8px', // Added to make the highlight pulse look cleaner
                      }}
                    >
<BlockRegistry
                        block={{ ...block, label: customNames[block.id] || block.label }}
                        value={getValue(block.dataPath)}
                        onChange={(path, value) => handleDataChange(path, value, block.id)}
                        lockedBy={activeLocks[block.id] || null}
                        onFocus={handleBlockFocus}
                        onBlur={handleBlockBlur}
                        isDark={isDark}
                        excludedSections={excludedSections}
                        customNames={customNames}
                        activeSection={activeSection}
                        projectId={projectId}
                      />
                      </div>
                  );
                })}
            </div>
          )}
        </main>
      </div>

      {/* ── TAILOR TEMPLATE MODAL ── */}
      {showTailorModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '14px', width: '100%', maxWidth: '640px', maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
            
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.surface2, borderRadius: '14px 14px 0 0' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', color: T.text, display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800 }}>
                  <Scissors size={18} color={T.accent} /> Tailor Template Structure
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: T.textMuted }}>Rename, exclude, or restore sections & blocks — for this IM only.</p>
              </div>
              <button onClick={() => setShowTailorModal(false)} style={{ background: 'none', border: `1px solid ${T.border}`, color: T.text, cursor: 'pointer', padding: '6px', borderRadius: '50%' }}>
                <X size={18} />
              </button>
            </div>
            
            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {(() => {
                const parents = schema.filter(s => !s.parentId).sort((a,b) => (a.order||0)-(b.order||0));
                if (parents.length === 0) return (
                  <div style={{ color: T.textMuted, textAlign: 'center', fontSize: '0.85rem' }}>No sections in master schema.</div>
                );

                // ─── Inline rename input row ───
                const RenameRow = ({ sec, isChild }) => {
                  const isEditing = editingTailorName.id === sec.id;
                  const isExcluded = excludedSections.includes(sec.id);
                  const displayName = customNames[sec.id] || cleanTitle(sec.heading || sec.navLabel || (isChild ? 'Untitled Subsection' : 'Untitled Section'));
                  
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      {isEditing ? (
                        <>
                          <input
                            autoFocus
                            value={editingTailorName.text}
                            onChange={e => setEditingTailorName(p => ({ ...p, text: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { const t = editingTailorName.text.trim(); if (t) handleLocalRename(sec.id, t); setEditingTailorName({ id: null, text: '' }); }
                              if (e.key === 'Escape') setEditingTailorName({ id: null, text: '' });
                            }}
                            style={{ flex: 1, background: T.bg, border: `1px solid ${T.accent}`, color: T.text, padding: '4px 8px', borderRadius: '5px', fontSize: isChild ? '0.8rem' : '0.9rem', fontWeight: isChild ? 600 : 700, outline: 'none', minWidth: 0 }}
                          />
                          <button onClick={() => { const t = editingTailorName.text.trim(); if (t) handleLocalRename(sec.id, t); setEditingTailorName({ id: null, text: '' }); }}
                            style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: T.green, padding: '4px 8px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }} title="Confirm">
                            <Check size={13} />
                          </button>
                          <button onClick={() => setEditingTailorName({ id: null, text: '' })}
                            style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.textMuted, padding: '4px 8px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }} title="Cancel">
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ fontWeight: isChild ? 600 : 700, fontSize: isChild ? '0.8rem' : '0.9rem', color: isChild ? T.textMuted : T.text, textDecoration: isExcluded ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayName}
                          </span>
                          {customNames[sec.id] && (
                            <span style={{ fontSize: '0.62rem', color: T.accent, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '4px', padding: '1px 5px', flexShrink: 0, fontWeight: 700 }}>renamed</span>
                          )}
                          {!isExcluded && (
                            <button onClick={() => setEditingTailorName({ id: sec.id, text: displayName })} title="Rename for this IM"
                              style={{ background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0, opacity: 0.6, transition: 'opacity 0.15s' }}
                              onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>
                              <Pencil size={11} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                };

                // ─── Individual block row (inside expanded section) ───
                const BlockRow = ({ block, depth = 0 }) => {
                  const isExcluded = excludedSections.includes(block.id);
                  const isEditingBlock = editingTailorName.id === block.id;
                  const blockName = customNames[block.id] || block.label || 'Untitled Block';
                  
                  return (
                    <div style={{ padding: `7px 16px 7px ${52 + (depth * 20)}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: isExcluded ? 0.45 : 1, borderTop: `1px solid ${T.border}`, background: isExcluded ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                        <Blocks size={11} style={{ color: T.textMuted, flexShrink: 0 }} />
                        {isEditingBlock ? (
                          <>
                            <input autoFocus value={editingTailorName.text}
                              onChange={e => setEditingTailorName(p => ({ ...p, text: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { const t = editingTailorName.text.trim(); if (t) handleLocalRename(block.id, t); setEditingTailorName({ id: null, text: '' }); }
                                if (e.key === 'Escape') setEditingTailorName({ id: null, text: '' });
                              }}
                              style={{ flex: 1, background: T.bg, border: `1px solid ${T.accent}`, color: T.text, padding: '3px 7px', borderRadius: '4px', fontSize: '0.76rem', fontWeight: 600, outline: 'none', minWidth: 0 }}
                            />
                            <button onClick={() => { const t = editingTailorName.text.trim(); if (t) handleLocalRename(block.id, t); setEditingTailorName({ id: null, text: '' }); }}
                              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: T.green, padding: '3px 7px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                              <Check size={12} />
                            </button>
                            <button onClick={() => setEditingTailorName({ id: null, text: '' })}
                              style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.textMuted, padding: '3px 7px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                              <X size={12} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: '0.76rem', fontWeight: 600, color: T.textMuted, textDecoration: isExcluded ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {blockName}
                            </span>
                            {customNames[block.id] && (
                              <span style={{ fontSize: '0.58rem', color: T.accent, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '3px', padding: '1px 4px', flexShrink: 0, fontWeight: 700 }}>renamed</span>
                            )}
                            <span style={{ fontSize: '0.62rem', color: T.textMuted, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '3px', padding: '1px 5px', flexShrink: 0, fontFamily: 'monospace' }}>
                              {block.type}
                            </span>
                            {!isExcluded && (
                              <button onClick={() => setEditingTailorName({ id: block.id, text: blockName })} title="Rename block for this IM"
                                style={{ background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer', padding: '2px 3px', display: 'flex', alignItems: 'center', flexShrink: 0, opacity: 0.55, transition: 'opacity 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.55'}>
                                <Pencil size={10} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <div style={{ flexShrink: 0, marginLeft: '8px' }}>
                        {isExcluded ? (
                          <button onClick={() => toggleSectionExclusion(block.id, false)}
                            style={{ background: 'transparent', border: `1px solid ${T.green}`, color: T.green, padding: '3px 8px', borderRadius: '5px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <RotateCcw size={11} /> Restore
                          </button>
                        ) : (
                          <button onClick={() => toggleSectionExclusion(block.id, true)}
                            style={{ background: 'transparent', border: `1px dashed ${T.border}`, color: T.textMuted, padding: '3px 8px', borderRadius: '5px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.color = T.accent; e.currentTarget.style.borderColor = T.accent; }}
                            onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.borderColor = T.border; }}>
                            <X size={11} /> Exclude
                          </button>
                        )}
                      </div>
                    </div>
                  );
                };

                // ─── Recursive Block Tree ───
                const RecursiveBlockTree = ({ block, depth = 0 }) => {
                  return (
                    <div key={block.id}>
                      <BlockRow block={block} depth={depth} />
                      
                      {/* Conditional Switcher Support */}
                      {block.branches && block.branches.map(branch => {
                        const branchBlocks = branch.blocks || [];
                        if (branchBlocks.length === 0) return null;
                        return (
                          <div key={branch.id}>
                            <div style={{ padding: `4px 16px 4px ${52 + ((depth + 1) * 20)}px`, fontSize: '0.68rem', fontWeight: 700, color: T.textSub, background: 'rgba(0,0,0,0.2)', borderTop: `1px solid ${T.border}` }}>
                              ↳ Branch: {branch.label || 'Option'}
                            </div>
                            {branchBlocks.map(subBlock => (
                              <RecursiveBlockTree key={subBlock.id} block={subBlock} depth={depth + 1} />
                            ))}
                          </div>
                        );
                      })}

                      {/* Standard Nested Blocks Support (Repeating Sets, etc.) */}
                      {block.blocks && block.blocks.length > 0 && (
                        <div>
                          <div style={{ padding: `4px 16px 4px ${52 + ((depth + 1) * 20)}px`, fontSize: '0.68rem', fontWeight: 700, color: T.textSub, background: 'rgba(0,0,0,0.2)', borderTop: `1px solid ${T.border}` }}>
                            ↳ Nested Fields
                          </div>
                          {block.blocks.map(subBlock => (
                            <RecursiveBlockTree key={subBlock.id} block={subBlock} depth={depth + 1} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                };

                // ─── Section / Subsection row ───
                const SectionRow = ({ sec, isChild, parentExcluded }) => {
                  const isExcluded = excludedSections.includes(sec.id) || parentExcluded;
                  const isExpanded = !!expandedTailorSections[sec.id];
                  const hasBlocks = sec.blocks && sec.blocks.length > 0;
                  
                  return (
                    <div style={{ borderTop: isChild ? `1px solid ${T.border}` : 'none' }}>
                      <div style={{ padding: isChild ? '8px 16px 8px 28px' : '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isChild ? 'transparent' : T.surface2, opacity: isExcluded ? 0.5 : 1 }}>
                        
                        {/* Left: expand chevron + rename */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                          {hasBlocks ? (
                            <button
                              onClick={() => setExpandedTailorSections(p => ({ ...p, [sec.id]: !p[sec.id] }))}
                              title={isExpanded ? 'Collapse blocks' : 'Expand blocks'}
                              style={{ background: isExpanded ? 'rgba(239,68,68,0.12)' : T.surface3, border: `1px solid ${isExpanded ? 'rgba(239,68,68,0.25)' : T.border}`, color: isExpanded ? T.accent : T.textMuted, cursor: 'pointer', padding: '3px 5px', borderRadius: '5px', display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                          ) : (
                            <span style={{ width: '25px', flexShrink: 0 }} />
                          )}
                          <RenameRow sec={sec} isChild={isChild} />
                        </div>
                        
                        {/* Right: exclude / restore */}
                        <div style={{ flexShrink: 0, marginLeft: '10px' }}>
                          {isExcluded && !parentExcluded ? (
                            <button onClick={() => toggleSectionExclusion(sec.id, false)}
                              style={{ background: isChild ? 'transparent' : 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: T.green, padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <RotateCcw size={12} /> Restore
                            </button>
                          ) : !parentExcluded ? (
                            <button onClick={() => toggleSectionExclusion(sec.id, true)}
                              style={{ background: isChild ? 'transparent' : 'rgba(239,68,68,0.1)', border: isChild ? `1px dashed ${T.border}` : '1px solid rgba(239,68,68,0.2)', color: isChild ? T.textMuted : T.accent, padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}
                              onMouseEnter={e => { e.currentTarget.style.color = T.accent; e.currentTarget.style.borderColor = T.accent; }}
                              onMouseLeave={e => { e.currentTarget.style.color = isChild ? T.textMuted : T.accent; e.currentTarget.style.borderColor = isChild ? T.border : 'rgba(239,68,68,0.2)'; }}>
                              <X size={12} /> Exclude
                            </button>
                          ) : null}
                        </div>
                      </div>
                      
                      {/* Expanded block list */}
                      {isExpanded && hasBlocks && !isExcluded && (
                        <div style={{ background: 'rgba(0,0,0,0.12)' }}>
                          {sec.blocks.slice().sort((a,b) => (a.order||0)-(b.order||0)).map(block => (
                            <RecursiveBlockTree key={block.id} block={block} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                };

                return parents.map(p => {
                  const children = schema.filter(s => s.parentId === p.id).sort((a,b) => (a.order||0)-(b.order||0));
                  const isParentExcluded = excludedSections.includes(p.id);
                  return (
                    <div key={p.id} style={{ marginBottom: '14px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: '8px', overflow: 'hidden', opacity: isParentExcluded ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                      <SectionRow sec={p} isChild={false} parentExcluded={false} />
                      {children.length > 0 && (
                        <div>
                          {children.map(c => (
                            <SectionRow key={c.id} sec={c} isChild={true} parentExcluded={isParentExcluded} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
            
            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: `1px solid ${T.border}`, background: T.surface2, borderRadius: '0 0 14px 14px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowTailorModal(false)} style={{ padding: '8px 24px', background: T.accent, color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }}>
                Done Tailoring
              </button>
            </div>
          </div>
        </div>
      )}
      
<CommentsSidebar 
        imId={imId} 
        isDark={isDark} 
        isOpen={commentsSidebarOpen} 
        onClose={() => setCommentsSidebarOpen(false)} 
        activeSection={activeSection}
        workspaceUsers={workspaceUsers}
        flatSections={flatSections}
        customNames={customNames}
        excludedSections={excludedSections}
      />
      
      <CommentSVGOverlay /> {/* <-- MOUNT THE SVG OVERLAY HERE */}

      {isTaskBoardOpen && (
        <IMTaskBoard imId={imId} projectId={projectId} isDark={isDark} onClose={() => setIsTaskBoardOpen(false)} />
      )}

      {/* ── PRINT COMPILER MODAL ── */}
      {isPreviewOpen && (
        <div id="print-mount-point">
          <IMPrintPreview 
            schema={schema} 
            imData={imData} 
            excludedSections={excludedSections} 
            customNames={customNames}
            projectName={projectName} 
            onClose={() => setIsPreviewOpen(false)} 
          />
        </div>
      )}

      {/* ── SETTINGS AUTHENTICATION MODAL ── */}
      {showSettingsAuth && (
        <SettingsAuthModal 
          imId={imId} 
          projectId={projectId} 
          projectName={projectName} 
          isDark={isDark} 
          onClose={() => setShowSettingsAuth(false)} 
        />
      )}

      {/* ── SEARCH & REPLACE WIDGET ── */}
      {showSearchWidget && (
        <IMSearchWidget 
          imData={imData} 
          schema={schema}
          customNames={customNames}
          sectionNumberMap={sectionNumberMap}
          isDark={isDark}
          onClose={() => setShowSearchWidget(false)}
          onSingleReplace={(path, newVal) => handleDataChange(path, newVal, null)}
          onBatchReplace={(updates) => handleBatchDataChange(updates)}
        />
      )}
      
      <style>{`
        @keyframes imSpin    { from { transform: rotate(0deg); }   to   { transform: rotate(360deg); } }
        @keyframes imPulse   { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.2); } }
        @keyframes imFadeIn  { from { opacity: 0; transform: translateX(6px); } to { opacity: 1; transform: translateX(0); } }
        ::-webkit-scrollbar       { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }

        .im-top-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 36px;
          min-width: 36px;
          padding: 0 8px;
          border-radius: 8px;
          /* Force a solid, slightly elevated background instead of transparent */
          background: ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'};
          color: var(--t-muted);
          border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'};
          cursor: pointer;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          /* Add a subtle native shadow so it looks like a button */
          box-shadow: ${isDark ? '0 2px 4px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.05)'};
        }
        .im-top-btn:hover {
          background: var(--hover-bg, var(--t-surface));
          color: var(--hover-color, var(--t-text));
          border-color: var(--hover-border, var(--t-border));
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .im-top-btn.active {
          background: var(--active-bg);
          color: var(--active-color);
          border-color: var(--active-border, transparent);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
          transform: translateY(0);
        }
        /* Custom Tooltip Logic */
        .im-top-btn[data-tip]::after {
          content: attr(data-tip);
          position: absolute;
          top: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%) translateY(-4px);
          background: var(--t-surface);
          color: var(--t-text);
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.2px;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: var(--t-shadowLg);
          border: 1px solid var(--t-border);
          z-index: 100;
        }
        .im-top-btn[data-tip]:hover::after {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      `}</style>
    </div>
  );
}