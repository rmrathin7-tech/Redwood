import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase';

export function useProfilingEditor(projectId, taskId, currentUserEmail) {
  const [taskData, setTaskData] = useState(null);
  const ownsLockRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    if (!taskId) return;
    const docRef = doc(db, 'profiling-tasks', taskId); // Changed path
    
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) setTaskData({ id: docSnap.id, ...docSnap.data() });
      setLoading(false);
    });
    return () => unsub();
  }, [taskId]);

  const saveContent = useCallback((newContent) => {
    setTaskData(prev => prev ? { ...prev, content: newContent } : prev);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaving(true);
    
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const docRef = doc(db, 'profiling-tasks', taskId); // Changed path
        await updateDoc(docRef, { content: newContent, updatedAt: serverTimestamp() });
      } catch (err) { console.error("Save failed:", err); } 
      finally { setSaving(false); }
    }, 1200);
  }, [taskId]);

// ── AUTO-PRESENCE ENGINE (WITH VISIBILITY AWARENESS) ──
  useEffect(() => {
    if (loading || !taskData || !taskId || !currentUserEmail) return;

    const docRef = doc(db, 'profiling-tasks', taskId);

    const manageLock = () => {
      // If the tab is hidden (laptop closed, minimized), DO NOT claim the lock
      if (document.visibilityState === 'hidden') return;

      if (!taskData.activeEditor) {
        ownsLockRef.current = true;
        updateDoc(docRef, { activeEditor: currentUserEmail }).catch(() => {});
      } else if (taskData.activeEditor === currentUserEmail) {
        ownsLockRef.current = true;
      } else {
        ownsLockRef.current = false;
      }
    };

    manageLock();

    // If the user opens the laptop/tab again, try to reclaim the lock instantly
    const onVisible = () => {
      if (document.visibilityState === 'visible') manageLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);

  }, [taskId, currentUserEmail, taskData?.activeEditor, loading]);

  // ── PRESENCE CLEANUP (ON CLOSE/SLEEP/REFRESH) ──
  useEffect(() => {
    if (!taskId) return;
    const docRef = doc(db, 'profiling-tasks', taskId);

    const releaseLock = () => {
      if (ownsLockRef.current) {
        ownsLockRef.current = false; // Drop local lock immediately to prevent double-firing
        updateDoc(docRef, { activeEditor: null }).catch(() => {});
      }
    };

    // Trigger on tab hide, which fires the exact millisecond a laptop lid is closed
    const onHide = () => {
      if (document.visibilityState === 'hidden') releaseLock();
    };

    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', releaseLock); // Much more reliable than beforeunload
    window.addEventListener('beforeunload', releaseLock); // Legacy fallback

    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', releaseLock);
      window.removeEventListener('beforeunload', releaseLock);
      releaseLock();
    };
  }, [taskId]);
// Allows an admin/coworker to forcefully clear a zombie lock
  const forceUnlock = () => {
    if (!taskId) return;
    const docRef = doc(db, 'profiling-tasks', taskId);
    updateDoc(docRef, { activeEditor: null }).catch(() => {});
  };

  return { taskData, loading, saving, saveContent, forceUnlock };
}
