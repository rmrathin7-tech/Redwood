// src/pages/fsa/hooks/useFSAWorkspace.js
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { doc, onSnapshot, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase.js';
import { buildFinancialModel } from "../core/fsaEngine.js";

// IMPORT THE MASTER BASELINE SCHEMA
import { DEFAULT_CONFIG_SCHEMAS } from "../config/defaultSchema.js";

export function useFSAWorkspace(projectId, fsaId) {
    // Core Application State
    const [projectData, setProjectData] = useState({});
    // Initialize with the master schema as the baseline
    const [configSchemas, setConfigSchemas] = useState(DEFAULT_CONFIG_SCHEMAS);
    const [reclassMap, setReclassMap] = useState({});
const [activeYear, setActiveYear] = useState(null);
    const [activeEntityType, setActiveEntityType] = useState('pvtLtd');
    const [auditLogs, setAuditLogs] = useState([]);
    const [activeYearsList, setActiveYearsList] = useState([]);   // ← ADD THIS
const [activeItemsMap, setActiveItemsMap] = useState({});     // ← ADD THIS

    
    // UI & Status Indicators (Exposed directly for the Top Fixed Action Bar)
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [theme, setTheme] = useState('dark'); // Global SaaS visual theme

    // Persistence Timeout tracking for rapid input editing
    const saveTimeoutRef = useRef(null);
    const pendingUpdatesRef = useRef({});

    // ── 1. Real-time Database Synchronization ─────────────────────────────────
// ── 1. Real-time Database Synchronization ─────────────────────────────────
    useEffect(() => {
        if (!projectId || !fsaId) {
            setLoading(false);
            return;
        }

        const docRef = doc(db, 'projects', projectId, 'fsa', fsaId);        
        setLoading(true);

        const unsubscribe = onSnapshot(docRef, (snapshot) => {
            const data = snapshot.exists() ? snapshot.data() : null;

            // IF the document exists AND it is fully initialized with a schema, load natively.
            if (data && data.configSchemas) {
                setProjectData(data.financialData || {});
                setConfigSchemas(data.configSchemas);
                setReclassMap(data.reclassMap || {});
                if (data.activeYear) setActiveYear(data.activeYear);
                if (data.activeEntityType) setActiveEntityType(data.activeEntityType);
                if (data.themeOptions?.mode) setTheme(data.themeOptions.mode);
                if (data.activeYearsList) setActiveYearsList(data.activeYearsList);
                if (data.activeItemsMap) setActiveItemsMap(data.activeItemsMap);
                
                setLoading(false);
            } else {
                // IF document DOES NOT exist, OR Module Hub just created a skeleton document 
                // without a configSchemas block, we MUST fetch the Global Master Template and inject it.
                (async () => {
                    try {
                        // Fetch from True Enterprise Root
                        const globalRef = doc(db, 'workspace-config', 'fsa-master-template');
                        const globalSnap = await getDoc(globalRef);
                        
                        const masterSchema = globalSnap.exists() && globalSnap.data().configSchemas 
                            ? globalSnap.data().configSchemas 
                            : DEFAULT_CONFIG_SCHEMAS;

                        const initialMap = {};
                        Object.entries(masterSchema.chartOfAccounts?.shared || {}).forEach(([docKey, nodes]) => {
                            initialMap[docKey] = {};
                            nodes.forEach(node => {
                                if (node.type === 'section') initialMap[docKey][node.key] = [];
                                if (node.dynamic && node.key === 'equity_placeholder') initialMap[docKey]['equity'] = [];
                            });
                        });

                        // Use { merge: true } to preserve the Title/Metadata created by the Module Hub
                        await setDoc(docRef, {
                          financialData: data?.financialData || {},
                          configSchemas: masterSchema,
                          reclassMap: data?.reclassMap || {},
                          activeYearsList: data?.activeYearsList || [],
                          activeItemsMap: data?.activeItemsMap || initialMap,
                          activeYear: data?.activeYear || null
                        }, { merge: true });
                        
                        // We purposely do NOT call setLoading(false) here because setDoc will 
                        // instantly trigger onSnapshot again, cleanly falling into the top block above.
                    } catch (seedErr) {
                        console.error("Global schema initialization failure:", seedErr);
                        setLoading(false);
                    }
                })();
            }
        }, (err) => {
            console.error("FSA Realtime sync error:", err);
            setError(err.message);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [projectId, fsaId]);
    // ── 2. Pure Model Evaluation Loop ─────────────────────────────────────────
    const financialModel = useMemo(() => {
        if (!projectData || Object.keys(projectData).length === 0) return {};
        // Engine execution evaluates formulas, mapping custom integer/percentage rules seamlessly
        return buildFinancialModel(
            projectData,
            activeYear,
            reclassMap,
            configSchemas,
            activeEntityType
        );
    }, [projectData, activeYear, reclassMap, configSchemas, activeEntityType]);

    // ── 3. Granular Data Mutations & Debounced Persistence ───────────────────
    const flushPendingSaves = useCallback(async () => {
        if (!projectId || !fsaId || Object.keys(pendingUpdatesRef.current).length === 0) return;
        
        setSaving(true);
        const updatesToPush = { ...pendingUpdatesRef.current };
        pendingUpdatesRef.current = {}; // Flush queue

        try {
            const docRef = doc(db, 'projects', projectId, 'fsa', fsaId);
            await updateDoc(docRef, updatesToPush);
        } catch (err) {
            console.error("Debounced flush failed:", err);
            setError("Failed to persist record updates.");
        } finally {
            setSaving(false);
        }
    }, [projectId, fsaId]);

    /**
     * Updates an input line-item natively inside local state to avoid visual jank,
     * queuing field payloads directly to Firestore backend.
     */
const updateDataPath = useCallback((docKey, sectionKey, itemKey, numericValue, yearOverride = null, confidenceScore = null) => {
  const targetYear = yearOverride || activeYear; // ← use passed year or fallback
   if (!targetYear) return;
  setProjectData(prev => {
    const updated = JSON.parse(JSON.stringify(prev));
    if (!updated[docKey]) updated[docKey] = {};
    if (!updated[docKey][sectionKey]) updated[docKey][sectionKey] = {};
    if (!updated[docKey][sectionKey][targetYear]) updated[docKey][sectionKey][targetYear] = {};
    updated[docKey][sectionKey][targetYear][itemKey] = numericValue;
    return updated;
  });

  const firestorePath = `financialData.${docKey}.${sectionKey}.${targetYear}.${itemKey}`;
  pendingUpdatesRef.current[firestorePath] = numericValue;        // Log to Audit trail IF confidence threshold parameters require review
        if (confidenceScore !== null && confidenceScore < 0.75) {
            setAuditLogs(prev => [
                {
                    id: Date.now().toString(),
                    timestamp: new Date().toLocaleTimeString(),
                    docKey,
                    itemKey,
                    value: numericValue,
                    confidenceScore,
                    message: `Low extraction score detected (${Math.round(confidenceScore * 100)}%). Review required IF adjustment values change.`
                },
                ...prev.slice(0, 49) // Retain rolling window of 50 log events
            ]);
        }

        // Reset Debouncer timer
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            flushPendingSaves();
        }, 1200);
    }, [activeYear, flushPendingSaves]);

    // ── 4. Reclassification Map Modifier ─────────────────────────────────────
    const updateReclassification = useCallback(async (docType, fromSection, itemKey, toSection) => {
        setReclassMap(prev => {
            const updated = JSON.parse(JSON.stringify(prev));
            if (!updated[docType]) updated[docType] = {};
            if (!updated[docType][fromSection]) updated[docType][fromSection] = {};
            
            if (toSection) {
                updated[docType][fromSection][itemKey] = toSection;
            } else {
                delete updated[docType][fromSection][itemKey];
            }
            return updated;
        });

        // Instantly save structure mapping changes
        if (projectId && fsaId) {
            setSaving(true);
            try {
                const docRef = doc(db, 'projects', projectId, 'fsa', fsaId);
                const targetPath = toSection 
                    ? `reclassMap.${docType}.${fromSection}.${itemKey}`
                    : `reclassMap.${docType}.${fromSection}.${itemKey}`;
                
                await updateDoc(docRef, {
                    [targetPath]: toSection || null
                });
            } catch (err) {
                console.error("Reclassification routing failed:", err);
            } finally {
                setSaving(false);
            }
        }
    }, [projectId, fsaId]);

    // ── 5. Layout Controls & Dynamic Environment Interfaces ──────────────────
    const toggleTheme = useCallback(() => {
        setTheme(prev => {
            const newMode = prev === 'dark' ? 'light' : 'dark';
            if (projectId && fsaId) {
                const docRef = doc(db, 'projects', projectId, 'fsa', fsaId);
                updateDoc(docRef, { 'themeOptions.mode': newMode }).catch(() => {});
            }
            return newMode;
        });
    }, [projectId, fsaId]);

    const switchYear = useCallback((yearStr) => {
        setActiveYear(yearStr);
        if (projectId && fsaId) {
            const docRef = doc(db, 'projects', projectId, 'fsa', fsaId);
            updateDoc(docRef, { activeYear: yearStr }).catch(() => {});
        }
    }, [projectId, fsaId]);

    const switchEntityType = useCallback((typeKey) => {
        setActiveEntityType(typeKey);
        if (projectId && fsaId) {
            const docRef = doc(db, 'projects', projectId, 'fsa', fsaId);
            updateDoc(docRef, { activeEntityType: typeKey }).catch(() => {});
        }
    }, [projectId, fsaId]);

return {
  // Data & Model Subscriptions
  projectData,
  configSchemas,
  reclassMap,
  financialModel,
  auditLogs,

  // Active Scope State
  activeYear,
  activeEntityType,
  theme,
  activeYearsList,
  activeItemsMap,

  // Layout Status Payload for Top Bar Integration
  loading,
  saving,
  error,

  // Exposed Engine Methods
  updateDataPath,
  updateReclassification,
  switchYear,
  switchEntityType,
  toggleTheme,
  forceSave: flushPendingSaves
};
}