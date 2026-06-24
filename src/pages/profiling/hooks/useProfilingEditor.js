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

  // ── AUTO-PRESENCE ENGINE ──
  useEffect(() => {
    if (loading || !taskData || !taskId || !currentUserEmail) return;
    
    const docRef = doc(db, 'profiling-tasks', taskId);

    // 1. Claim the lock if the document is free
    if (!taskData.activeEditor) {
      ownsLockRef.current = true;
      updateDoc(docRef, { activeEditor: currentUserEmail });
    } 
    // 2. Acknowledge if we already own it
    else if (taskData.activeEditor === currentUserEmail) {
      ownsLockRef.current = true;
    } 
    // 3. Someone else is here, do not claim
    else {
      ownsLockRef.current = false;
    }
  }, [taskId, currentUserEmail, taskData?.activeEditor, loading]);

  // ── PRESENCE CLEANUP (ON CLOSE/REFRESH) ──
  useEffect(() => {
    if (!taskId) return;
    const docRef = doc(db, 'profiling-tasks', taskId);
    
    const releaseLock = () => {
      // Only clear the activeEditor field if WE were the ones holding it
      if (ownsLockRef.current) {
        updateDoc(docRef, { activeEditor: null }).catch(() => {});
      }
    };

  // Failsafe for hard browser reloads or tab closures
    window.addEventListener('beforeunload', releaseLock);

    return () => {
      window.removeEventListener('beforeunload', releaseLock);
      releaseLock();
    };
  }, [taskId]);

  // ── NEW: Database function to actually save the status ──
  const updateStatus = useCallback(async (newStatus) => {
    if (!taskId) return;
    try {
      const docRef = doc(db, 'profiling-tasks', taskId);
      // 1. Instantly update the UI so it doesn't feel laggy
      setTaskData(prev => prev ? { ...prev, status: newStatus } : prev);
      // 2. Save it permanently to the database
      await updateDoc(docRef, { status: newStatus, updatedAt: serverTimestamp() });
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  }, [taskId]);

  return { taskData, loading, saving, saveContent, updateStatus };
}
