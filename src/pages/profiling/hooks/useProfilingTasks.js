import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../../../firebase';

export function useProfilingTasks(projectId) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If projectId exists, filter by it. Otherwise, fetch all tasks for the Hub view.
    const q = projectId 
      ? query(collection(db, 'profiling-tasks'), where('projectId', '==', projectId))
      : collection(db, 'profiling-tasks');

    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [projectId]);

  const addTask = useCallback(async (taskData) => {
    // ── FIREBASE DEFENSE: Strip undefined values to prevent setDoc crashes ──
    const cleanData = Object.fromEntries(
      Object.entries(taskData).filter(([_, v]) => v !== undefined)
    );

    try {
      await addDoc(collection(db, 'profiling-tasks'), {
        ...cleanData,
        projectId: projectId || null, // Forces null if undefined
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Task Creation Failed:", error);
    }
  }, [projectId]);

  const updateTaskStatus = useCallback(async (taskId, status) => {
    const docRef = doc(db, 'profiling-tasks', taskId);
    await updateDoc(docRef, { status, updatedAt: serverTimestamp() });
  }, []);

  const deleteTask = useCallback(async (taskId) => {
    await deleteDoc(doc(db, 'profiling-tasks', taskId));
  }, []);

  return { tasks, loading, addTask, updateTaskStatus, deleteTask };
}