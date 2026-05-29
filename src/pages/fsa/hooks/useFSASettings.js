/**
 * src/pages/fsa/hooks/useFSASettings.js
 * * CENTRALIZED SETTINGS STATE HOOK & PERSISTENCE CONTROLLER
 * Consolidates Firestore configuration document synchronization listeners alongside 
 * debounced field mutators to configure shared root documents and advanced machine learning boundaries.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../firebase';

// IMPORT THE MASTER BASELINE SCHEMA
import { DEFAULT_CONFIG_SCHEMAS } from "../config/defaultSchema.js";

export function useFSASettings(projectId, fsaId) {
  // Localized configuration state structures initialized with the master baseline
  const [configSchemas, setConfigSchemas] = useState(DEFAULT_CONFIG_SCHEMAS);
  
  // Status flags
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(false);

  // Auto-Save track buffers
  const timeoutRef = useRef(null);

  // ── 1. Fetch Target Configuration Schema Data ──
  useEffect(() => {
    if (!projectId || !fsaId) {
      setError("Missing identifier payload routes.");
      setLoading(false);
      return;
    }

    async function loadWorkspaceSettings() {
      setLoading(true);
      try {
        // ── PHASE 4: TRUE ENTERPRISE ROUTING (Fetch from Root) ──
        const docRef = doc(db, 'workspace-config', 'fsa-master-template');
        const snap = await getDoc(docRef);
        
        if (snap.exists() && snap.data().configSchemas) {
          setConfigSchemas(prev => ({ ...prev, ...snap.data().configSchemas }));
        }
      } catch (err) {
        console.error("Settings load initialization failure:", err);
        setError("Failed to retrieve enterprise structural configuration records.");
      } finally {
        setLoading(false);
      }
    }

    loadWorkspaceSettings();
  }, [projectId, fsaId]);

  // ── 2. Master Direct Dispatcher: Commit State to Firestore ──
// ── 2. Persist Structural Updates Natively ──
  const commitConfiguration = useCallback(async (currentSchemas) => {
    if (!projectId || !fsaId) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(false);

    try {
      // ── PHASE 4: TRUE ENTERPRISE ROUTING (Write to Root) ──
      const docRef = doc(db, 'workspace-config', 'fsa-master-template');
      await setDoc(docRef, { configSchemas: currentSchemas }, { merge: true });
      setSuccessMsg(true);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setSuccessMsg(false), 3000);
    } catch (err) {
      console.error("Configuration buffer persistent write error:", err);
      setError("Failed to persist schema updates safely.");
    } finally {
      setSaving(false);
    }
  }, [projectId, fsaId]);

  // ── 3. Granular List Operations ──
  const appendCustomRatio = useCallback((newRatioObj) => {
    setConfigSchemas(prev => {
      const updated = {
        ...prev,
        customRatios: [...(prev.customRatios || []), newRatioObj]
      };
      // Auto commit new records directly IF active
      commitConfiguration(updated);
      return updated;
    });
  }, [commitConfiguration]);

  const removeCustomRatio = useCallback((targetRatioKey) => {
    setConfigSchemas(prev => {
      const updated = {
        ...prev,
        customRatios: (prev.customRatios || []).filter(r => r.key !== targetRatioKey)
      };
      commitConfiguration(updated);
      return updated;
    });
  }, [commitConfiguration]);

  const updateConfidenceThresholds = useCallback((levelKey, numericValue) => {
    setConfigSchemas(prev => {
      const updated = {
        ...prev,
        confidenceThresholds: {
          ...prev.confidenceThresholds,
          [levelKey]: numericValue
        }
      };
      return updated;
    });
  }, []);

  return {
    // State Values
    configSchemas,
    loading,
    saving,
    error,
    successMsg,

    // Core Interactivity Setters
    setConfigSchemas,
    commitConfiguration,
    appendCustomRatio,
    removeCustomRatio,
    updateConfidenceThresholds
  };
}