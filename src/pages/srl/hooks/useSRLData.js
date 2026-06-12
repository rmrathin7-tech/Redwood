import { useState, useEffect } from 'react';
import { db } from '../../../firebase.js'; // Adjust path based on your exact setup
import { doc, onSnapshot, updateDoc, collection, query, where } from 'firebase/firestore';

// 1. Hook to manage a single SRL assessment (used inside the Workspace)
export function useSRLAssessment(srlId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!srlId) return;
    const unsub = onSnapshot(doc(db, 'srl-assessments', srlId), (docSnap) => {
      if (docSnap.exists()) {
        setData({ id: docSnap.id, ...docSnap.data() });
      } else {
        setData(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [srlId]);

  // Updates a specific field for a specific question (e.g., saving an analyst's score)
  const updateResponse = async (questionId, field, value) => {
    if (!srlId) return;
    // Responses are stored in a map: responses.questionId.score
    const fieldPath = `responses.${questionId}.${field}`;
    await updateDoc(doc(db, 'srl-assessments', srlId), {
      [fieldPath]: value
    });
  };

  return { data, loading, updateResponse };
}

// 2. Hook to fetch all SRLs (used in the Hub to list them)
export function useAllSRLs(linkedProjectId = null) {
  const [srls, setSrls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q = collection(db, 'srl-assessments');
    
    // If we only want SRLs for a specific project
    if (linkedProjectId) {
       q = query(q, where('linkedProjectId', '==', linkedProjectId));
    }
    
    const unsub = onSnapshot(q, (snap) => {
      setSrls(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [linkedProjectId]);

  return { srls, loading };
}

const FALLBACK_SCHEMA = {
  idea: { id: 'idea', label: 'Idea Stage', modules: [] },
  revenue: { id: 'revenue', label: 'Revenue Stage', modules: [] }
};

// 3. Hook to fetch the Dynamic Schema from Firebase Settings
export function useSRLSchema() {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'workspace-config', 'srlSchema'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().stages) {
        setSchema(docSnap.data().stages);
      } else {
        setSchema(FALLBACK_SCHEMA); // Fix: Use fallback so the UI never gets stuck on null
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { schema, loading };
}