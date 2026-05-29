/**
 * src/pages/fsa/FSASettings.jsx
 * * CENTRALIZED ENTERPRISE CONFIGURATION CONSOLE
 * Configures document structures, line-item taxonomies, dynamic ratios, 
 * dashboard layouts (KPIs & Charts), and operational ML confidence boundaries 
 * backed by Firestore persistence.
 * * Phase 3 Upgrade: Custom KPI Formula Builder & Dashboard Visibility Console.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { 
  ArrowLeft, Save, Plus, Trash2, Sliders, CheckCircle2, AlertCircle, Layers, Percent, FileText, ChevronDown, ChevronRight, LayoutDashboard, BarChart3, LineChart, Calculator, Eye, EyeOff, Upload, Download
} from 'lucide-react';
import { DEFAULT_CONFIG_SCHEMAS } from './config/defaultSchema';

export default function FSASettings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const fsaId = searchParams.get('fsa');

  // Core Configuration Schema State
  const [schemas, setSchemas] = useState(DEFAULT_CONFIG_SCHEMAS);

  // UI Status Indicators
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(false);

  // Active sub-tab routing inside the configuration matrix
  const [activeTab, setActiveTab] = useState('chartOfAccounts'); 

  // --- Chart of Accounts UI State ---
  const [selectedDocCoA, setSelectedDocCoA] = useState('pnl');
  const [expandedSections, setExpandedSections] = useState({});

  // --- Ratios UI State ---
  const [newRatio, setNewRatio] = useState({
    key: '',
    name: '',
    numerator: '',
    denominator: '',
    isPercentage: true
  });

  // --- Dashboard Config UI State ---
  const [newKPI, setNewKPI] = useState({
    key: '',
    label: '',
    formula: '',
    isPercentage: false
  });

  const [newChart, setNewChart] = useState({
    title: '',
    type: 'combo',
    datasets: []
  });
  const [tempDatasetSelect, setTempDatasetSelect] = useState('');

  // ── 1. Fetch Existing Configuration Nodes ──
  useEffect(() => {
    if (!projectId || !fsaId) {
      setError("Missing routing identifiers. Return to the Module Hub.");
      setLoading(false);
      return;
    }

    async function loadSettings() {
      try {
        // 1. Prefer True Enterprise Master Template
        const globalRef = doc(db, 'workspace-config', 'fsa-master-template');
        const globalSnap = await getDoc(globalRef);
        
        let targetData = null;
        if (globalSnap.exists() && globalSnap.data().configSchemas) {
            targetData = globalSnap.data();
        } else {
            // 2. Fallback to local if global doesn't exist yet
            const localRef = doc(db, 'projects', projectId, 'fsa', fsaId);
            const localSnap = await getDoc(localRef);
            if (localSnap.exists()) targetData = localSnap.data();
        }

        if (targetData && targetData.configSchemas) {
          // Merge to ensure no missing baseline arrays/objects
          setSchemas(prev => ({ 
            ...DEFAULT_CONFIG_SCHEMAS, 
            ...targetData.configSchemas,
            customKPIs: targetData.configSchemas.customKPIs || DEFAULT_CONFIG_SCHEMAS.customKPIs,
            dashboardConfig: {
              ...DEFAULT_CONFIG_SCHEMAS.dashboardConfig,
              ...(targetData.configSchemas.dashboardConfig || {})
            }
          }));
        }
      } catch (err) {
        console.error("Failed to load FSA target settings:", err);
        setError("Could not retrieve enterprise configuration payload.");
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [projectId, fsaId]);

  // ── 2. Persist Structural Updates Natively ──
  const saveConfiguration = async () => {
    if (!projectId || !fsaId) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(false);

    try {
      // 1. Save to True Enterprise Master Template (Seeds ALL projects across the app)
      const globalRef = doc(db, 'workspace-config', 'fsa-master-template');
      await setDoc(globalRef, { configSchemas: schemas }, { merge: true });

      // 2. Save to the current local FSA (Keeps active workspace intact)
      const localRef = doc(db, 'projects', projectId, 'fsa', fsaId);
      await setDoc(localRef, { configSchemas: schemas }, { merge: true });

      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 3000);
    } catch (err) {
      console.error("Configuration sync failure:", err);
      setError("Failed to persist modified mapping values.");
    } finally {
      setSaving(false);
    }
  };

  // ── 2.5. Settings JSON Export & Import ──
  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(schemas, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `FSA_Settings_Schema_${projectId || 'export'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedSchemas = JSON.parse(e.target.result);
        if (importedSchemas && typeof importedSchemas === 'object') {
            // Apply the imported JSON to the live state
            setSchemas(importedSchemas);
            alert("Settings Schema successfully loaded into the preview UI!\n\nClick 'Commit Configuration' in the top right to permanently save this to the database.");
        } else {
            alert("Invalid settings JSON structure.");
        }
      } catch (err) {
        console.error("Parse error:", err);
        alert("Invalid JSON format.");
      }
    };
    reader.readAsText(file);
    event.target.value = null; // reset input
  };

  // ── 3. DYNAMIC METRIC DISCOVERY ENGINE ──
  // Scans all document heads, formulas, custom KPIs, and ratios to build a master selectable list
  const masterMetricsList = useMemo(() => {
    const list = [];
    
    // Add items from standard Chart of Accounts
    Object.entries(schemas?.chartOfAccounts?.shared || {}).forEach(([docKey, nodes]) => {
      nodes.forEach(node => {
        if (node.type === 'total' || node.type === 'section') {
          list.push({ key: node.key, label: `${node.title} (${docKey.toUpperCase()})` });
        }
        if (node.dynamic && node.key === 'equity_placeholder') {
          list.push({ key: 'equity', label: `Total Equity (${docKey.toUpperCase()})` });
        }
      });
    });

    // Add pre-configured core margins & KPIs
    (schemas?.metricsFormulas || []).forEach(m => {
      list.push({ key: m.key, label: `${m.label} [Core Margin]` });
    });

    // Add custom dynamic ratio keys
    (schemas?.customRatios || []).forEach(r => {
      list.push({ key: `cr__${r.key}`, label: `${r.name} [Custom Ratio]` });
    });

    // Add custom KPI formula keys
    (schemas?.customKPIs || []).forEach(k => {
      list.push({ key: k.key, label: `${k.label} [Custom KPI Card]` });
    });

    return list;
  }, [schemas]);

  // ── 4. Mutator Utilities: Custom KPI Formula Builder ──
  const handleAddCustomKPI = () => {
    if (!newKPI.key || !newKPI.label || !newKPI.formula) {
      alert("Please provide a key, label, and mathematical equation formula.");
      return;
    }
    const cleanKey = newKPI.key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    
    setSchemas(prev => {
      const currentKPIs = prev.customKPIs || [];
      if (currentKPIs.find(k => k.key === cleanKey)) {
        alert("A KPI scorecard with this key already exists.");
        return prev;
      }
      return {
        ...prev,
        customKPIs: [...currentKPIs, { ...newKPI, key: cleanKey }],
        dashboardConfig: {
          ...prev.dashboardConfig,
          visibleKPIs: [...(prev.dashboardConfig?.visibleKPIs || []), cleanKey] // Auto toggle visibility on creation
        }
      };
    });
    setNewKPI({ key: '', label: '', formula: '', isPercentage: false });
  };

  const handleRemoveCustomKPI = (targetKey) => {
    setSchemas(prev => ({
      ...prev,
      customKPIs: (prev.customKPIs || []).filter(k => k.key !== targetKey),
      dashboardConfig: {
        ...prev.dashboardConfig,
        visibleKPIs: (prev.dashboardConfig?.visibleKPIs || []).filter(k => k !== targetKey)
      }
    }));
  };

  // ── 5. Mutator Utilities: Dashboard Layout Visibility Toggles ──
  const toggleKPIVisibility = (kpiKey) => {
    setSchemas(prev => {
      const currentVisible = prev.dashboardConfig?.visibleKPIs || [];
      const updatedVisible = currentVisible.includes(kpiKey)
        ? currentVisible.filter(k => k !== kpiKey)
        : [...currentVisible, kpiKey];
      return {
        ...prev,
        dashboardConfig: {
          ...prev.dashboardConfig,
          visibleKPIs: updatedVisible
        }
      };
    });
  };

  const toggleChartVisibility = (chartIdx) => {
    setSchemas(prev => {
      const updatedCharts = [...(prev.dashboardConfig?.charts || [])];
      if (updatedCharts[chartIdx]) {
        // Toggles local property fallback or handles initialization smoothly
        updatedCharts[chartIdx].isVisible = updatedCharts[chartIdx].isVisible === false ? true : false;
      }
      return {
        ...prev,
        dashboardConfig: {
          ...prev.dashboardConfig,
          charts: updatedCharts
        }
      };
    });
  };

  // ── 6. Mutator Utilities: Visual Charts Config ──
  const handleAddChartDataset = (dsKey) => {
    if (!dsKey || newChart.datasets.includes(dsKey)) return;
    setNewChart(prev => ({
      ...prev,
      datasets: [...prev.datasets, dsKey]
    }));
    setTempDatasetSelect('');
  };

  const handleRemoveChartDataset = (dsKey) => {
    setNewChart(prev => ({
      ...prev,
      datasets: prev.datasets.filter(k => k !== dsKey)
    }));
  };

  const handleCommitNewChart = () => {
    if (!newChart.title.trim() || newChart.datasets.length === 0) {
      alert("Please provide a chart title and at least one dataset series series.");
      return;
    }
    setSchemas(prev => ({
      ...prev,
      dashboardConfig: {
        ...prev.dashboardConfig,
        charts: [...(prev.dashboardConfig?.charts || []), { ...newChart, isVisible: true }]
      }
    }));
    setNewChart({ title: '', type: 'combo', datasets: [] });
  };

  const handleRemoveChart = (idx) => {
    setSchemas(prev => {
      const updatedCharts = [...(prev.dashboardConfig?.charts || [])];
      updatedCharts.splice(idx, 1);
      return {
        ...prev,
        dashboardConfig: {
          ...prev.dashboardConfig,
          charts: updatedCharts
        }
      };
    });
  };

  // ── 7. Mutator Utility: Custom Ratios Array ──
  const handleAddRatio = () => {
    if (!newRatio.key || !newRatio.name || !newRatio.numerator || !newRatio.denominator) return;

    const cleanKey = newRatio.key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    const numArr = newRatio.numerator.split(',').map(s => s.trim()).filter(Boolean);
    const denArr = newRatio.denominator.split(',').map(s => s.trim()).filter(Boolean);

    setSchemas(prev => ({
      ...prev,
      customRatios: [
        ...(prev.customRatios || []),
        {
          key: cleanKey,
          name: newRatio.name.trim(),
          numerator: numArr,
          denominator: denArr,
          isPercentage: newRatio.isPercentage
        }
      ]
    }));

    setNewRatio({ key: '', name: '', numerator: '', denominator: '', isPercentage: true });
  };

  const handleRemoveRatio = (targetKey) => {
    setSchemas(prev => ({
      ...prev,
      customRatios: (prev.customRatios || []).filter(r => r.key !== targetKey)
    }));
  };

  // ── 8. Mutator Utility: ML Extraction Confidence Boundaries ──
  const handleThresholdChange = (level, val) => {
    const numeric = parseFloat(val) || 0;
    setSchemas(prev => ({
      ...prev,
      confidenceThresholds: {
        ...prev.confidenceThresholds,
        [level]: Math.min(Math.max(numeric, 0), 1)
      }
    }));
  };

  // ── 9. Mutator Utility: Chart of Accounts (CoA) ──
  const toggleSectionExpansion = (secKey) => {
    setExpandedSections(prev => ({ ...prev, [secKey]: !prev[secKey] }));
  };

  const handleAddLineItemToSection = (docKey, sectionIndex) => {
    const newItemName = prompt("Enter new main line item name:");
    if (!newItemName || !newItemName.trim()) return;

    setSchemas(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const section = updated.chartOfAccounts.shared[docKey][sectionIndex];
      
      if (!section.items) section.items = [];
      section.items.push(newItemName.trim());
      
      return updated;
    });
  };

  const handleAddSubItem = (docKey, sectionIndex, parentName) => {
    const subName = prompt(`Enter sub-item name under '${parentName}':`);
    if (!subName || !subName.trim()) return;

    setSchemas(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const section = updated.chartOfAccounts.shared[docKey][sectionIndex];
      
      if (!section.items) section.items = [];
      section.items.push(`${parentName}||${subName.trim()}`);
      
      return updated;
    });
  };

  const handleRemoveItemAndSubs = (docKey, sectionIndex, parentName) => {
    if (!confirm(`Are you sure you want to remove '${parentName}' and all its sub-items?`)) return;
    
    setSchemas(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const items = updated.chartOfAccounts.shared[docKey][sectionIndex].items || [];
      
      updated.chartOfAccounts.shared[docKey][sectionIndex].items = items.filter(itm => {
        const str = typeof itm === 'string' ? itm : (itm.label || itm.dataKey);
        return str !== parentName && !str.startsWith(`${parentName}||`);
      });
      
      return updated;
    });
  };

  const handleRemoveExactItem = (docKey, sectionIndex, exactString) => {
    setSchemas(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const items = updated.chartOfAccounts.shared[docKey][sectionIndex].items || [];
      
      updated.chartOfAccounts.shared[docKey][sectionIndex].items = items.filter(itm => {
        const str = typeof itm === 'string' ? itm : (itm.label || itm.dataKey);
        return str !== exactString;
      });
      
      return updated;
    });
  };
const handleAddTotalRow = (docKey) => {
    const title = prompt("Enter Total Row title (e.g., Gross Profit):");
    if (!title || !title.trim()) return;
    const key = title.toLowerCase().replace(/[^a-z0-9_]/g, '');
    
    setSchemas(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      if (!updated.chartOfAccounts.shared[docKey]) updated.chartOfAccounts.shared[docKey] = [];
      updated.chartOfAccounts.shared[docKey].push({
        type: 'total',
        key: key,
        title: title.trim(),
        formula: '',
        color: '#6366f1',
        bg: 'rgba(99,102,241,0.1)'
      });
      return updated;
    });
  };

  const handleMoveNode = (docKey, index, direction) => {
    setSchemas(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const nodes = updated.chartOfAccounts.shared[docKey];
      if (direction === 'up' && index > 0) {
        [nodes[index - 1], nodes[index]] = [nodes[index], nodes[index - 1]];
      } else if (direction === 'down' && index < nodes.length - 1) {
        [nodes[index + 1], nodes[index]] = [nodes[index], nodes[index + 1]];
      }
      return updated;
    });
  };

  const handleUpdateNodeField = (docKey, index, field, value) => {
    setSchemas(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      updated.chartOfAccounts.shared[docKey][index][field] = value;
      return updated;
    });
  };
  const handleAddSection = (docKey) => {
     const sectionTitle = prompt("Enter new section title (e.g., 'Operating Expenses'):");
     if (!sectionTitle || !sectionTitle.trim()) return;
     
     const sectionKey = sectionTitle.toLowerCase().replace(/[^a-z0-9]/g, '');

     setSchemas(prev => {
        const updated = JSON.parse(JSON.stringify(prev));
        if(!updated.chartOfAccounts.shared[docKey]) updated.chartOfAccounts.shared[docKey] = [];
        
        updated.chartOfAccounts.shared[docKey].push({
            type: 'section',
            key: sectionKey,
            title: sectionTitle.trim(),
            items: []
        });
        return updated;
     });
  };

  const handleRemoveNode = (docKey, nodeIndex) => {
      if(!confirm("Are you sure you want to remove this entire section/total node? This may break downstream formulas.")) return;
      
      setSchemas(prev => {
          const updated = JSON.parse(JSON.stringify(prev));
          updated.chartOfAccounts.shared[docKey].splice(nodeIndex, 1);
          return updated;
      });
  };

  const handleAddDocument = () => {
    const docName = prompt("Enter Document Name (e.g., Cash Flow Statement):");
    if (!docName || !docName.trim()) return;
    
    const docKey = docName.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    setSchemas(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      if (!updated.documents.find(d => d.key === docKey)) {
        updated.documents.push({ id: docKey, key: docKey, name: docName.trim() });
      }
      if (!updated.chartOfAccounts.shared[docKey]) {
        updated.chartOfAccounts.shared[docKey] = [];
      }
      return updated;
    });
  };

  const handleRemoveDocument = (docKey) => {
    if (!confirm("Are you sure you want to remove this document and its entire Chart of Accounts?")) return;
    setSchemas(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      updated.documents = updated.documents.filter(d => d.key !== docKey);
      delete updated.chartOfAccounts.shared[docKey];
      if (selectedDocCoA === docKey) {
        setSelectedDocCoA(updated.documents[0]?.key || '');
      }
      return updated;
    });
  };

  const handleAddEntityType = () => {
    const entName = prompt("Enter new Entity Name (e.g., Limited Liability Partnership):");
    if (!entName || !entName.trim()) return;

    const entKey = entName.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '');

    setSchemas(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      if (!updated.entityTypes[entKey]) {
        updated.entityTypes[entKey] = {
          name: entName.trim(),
          equitySchema: [{
            type: "section",
            key: "equity",
            title: `${entName.trim()} Equity`,
            items: []
          }]
        };
      }
      return updated;
    });
  };

  const handleRemoveEntityType = (entKey) => {
    if (!confirm("Delete this Entity Type structure?")) return;
    setSchemas(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      delete updated.entityTypes[entKey];
      return updated;
    });
  };

  const handleAddEquityItem = (entKey) => {
    const label = prompt("Enter Equity Line Item Name:");
    if (!label || !label.trim()) return;

    const dataKey = label.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');

    setSchemas(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      if (!updated.entityTypes[entKey].equitySchema[0].items) {
        updated.entityTypes[entKey].equitySchema[0].items = [];
      }
      updated.entityTypes[entKey].equitySchema[0].items.push({ dataKey, label: label.trim(), entityType: entKey });
      return updated;
    });
  };

  const handleRemoveEquityItem = (entKey, itemIndex) => {
    setSchemas(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      if (updated.entityTypes[entKey].equitySchema[0].items) {
        updated.entityTypes[entKey].equitySchema[0].items.splice(itemIndex, 1);
      }
      return updated;
    });
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#030712', color: '#94a3b8' }}>
        <span>Loading Configuration Workspace Parameters...</span>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f8fafc', fontFamily: "'DN Sans', system-ui, sans-serif" }}>
      
      {/* ── MANDATED TOP FIXED ACTION BAR ── */}
      <header style={{
        height: 56,
        background: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button 
            onClick={() => navigate(`/fsa?project=${projectId}&fsa=${fsaId}`)}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}
          >
            <ArrowLeft size={14} /> Back to Workbench
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Enterprise Scope Schema Mapping</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          
          {/* Export / Import Settings Tools */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', marginRight: 8 }}>
             <button onClick={handleExportJSON} style={{ background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.08)', color: '#cbd5e1', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Export Schema to JSON">
                <Download size={14} />
             </button>
             <label style={{ background: 'transparent', border: 'none', color: '#cbd5e1', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', margin: 0 }} title="Import Schema from JSON">
                <Upload size={14} />
                <input type="file" accept=".json" onChange={handleImportJSON} style={{ display: 'none' }} />
             </label>
          </div>

          {successMsg && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontSize: 12, fontWeight: 600 }}>
              <CheckCircle2 size={14} /> Synchronized
            </span>
          )}
          <button
            onClick={saveConfiguration}
            disabled={saving}
            style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, opacity: saving ? 0.7 : 1 }}
          >
            <Save size={14} /> {saving ? 'Writing Schema...' : 'Commit Configuration'}
          </button>
        </div>
      </header>

      {/* ── CENTRAL LAYOUT BODY ── */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {error && (
          <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Tab Routing Controls */}
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 16, marginBottom: 24, overflowX: 'auto' }}>
          {[
            { id: 'chartOfAccounts', label: 'Chart of Accounts (CoA)', icon: FileText },
            { id: 'dashboard', label: 'Executive Dashboard Layout', icon: LayoutDashboard },
            { id: 'ratios', label: 'Dynamic Custom Ratios', icon: Percent },
            { id: 'thresholds', label: 'Extraction Validation Boundaries', icon: Sliders },
            { id: 'docs', label: 'Documents & Entities', icon: Layers }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{ background: active ? 'rgba(99,102,241,0.15)' : 'transparent', border: active ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent', color: active ? '#6366f1' : '#94a3b8', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
              >
                <Icon size={16} /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── SUB-VIEW A: CHART OF ACCOUNTS MANAGER ── */}
        {activeTab === 'chartOfAccounts' && (
           <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
             
             {/* CoA Document Selector */}
             <div style={{ display: 'flex', gap: 8 }}>
                {(schemas.documents || []).map(doc => (
                    <button
                        key={doc.id}
                        onClick={() => setSelectedDocCoA(doc.key)}
                        style={{ 
                            background: selectedDocCoA === doc.key ? '#6366f1' : 'rgba(255,255,255,0.05)', 
                            border: 'none', 
                            color: selectedDocCoA === doc.key ? '#fff' : '#94a3b8', 
                            padding: '8px 16px', 
                            borderRadius: 6, 
                            fontSize: 13, 
                            fontWeight: 700, 
                            cursor: 'pointer' 
                        }}
                    >
                        {doc.name}
                    </button>
                ))}
             </div>

             <div style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 24 }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                     <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                         {schemas.documents?.find(d => d.key === selectedDocCoA)?.name || "Select Document"} Structure
                     </h3>
                     <div style={{ display: 'flex', gap: 10 }}>
                         <button 
                            onClick={() => handleAddSection(selectedDocCoA)}
                            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#6366f1', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                         >
                            <Plus size={14}/> Add Section
                         </button>
                         <button 
                            onClick={() => handleAddTotalRow(selectedDocCoA)}
                            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                         >
                            <Plus size={14}/> Add Total Row
                         </button>
                     </div>
                 </div>

                 {/* Render CoA Structure Array */}
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(schemas.chartOfAccounts?.shared?.[selectedDocCoA] || []).map((node, index) => {
                        
                        // Render Group Headers (e.g., "I. ASSETS")
                        if (node.type === 'group') {
                            return (
                                <div key={`grp_${index}`} style={{ background: 'rgba(99,102,241,0.05)', borderLeft: '3px solid #6366f1', padding: '10px 16px', marginTop: 12, fontSize: 13, fontWeight: 800, color: '#6366f1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <input 
                                        type="text" 
                                        value={node.title || ''} 
                                        onChange={(e) => handleUpdateNodeField(selectedDocCoA, index, 'title', e.target.value)}
                                        style={{ background: 'transparent', border: 'none', borderBottom: '1px dashed rgba(99,102,241,0.4)', color: '#6366f1', fontSize: 13, fontWeight: 800, outline: 'none', flex: 1, maxWidth: 300 }}
                                        placeholder="Group Title"
                                    />
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <button onClick={() => handleMoveNode(selectedDocCoA, index, 'up')} style={{ background: 'rgba(99,102,241,0.1)', border: 'none', color: '#6366f1', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>↑</button>
                                        <button onClick={() => handleMoveNode(selectedDocCoA, index, 'down')} style={{ background: 'rgba(99,102,241,0.1)', border: 'none', color: '#6366f1', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>↓</button>
                                        <button onClick={() => handleRemoveNode(selectedDocCoA, index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}><Trash2 size={14}/></button>
                                    </div>
                                </div>
                            );
                        }

                        // Render Total/Formula Nodes
                        if (node.type === 'total') {
                            return (
                                <div key={`tot_${index}`} style={{ background: node.bg || 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'center' }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: node.color || '#fff' }}>Σ</span>
                                            <input 
                                                type="text" 
                                                value={node.title || ''} 
                                                onChange={(e) => handleUpdateNodeField(selectedDocCoA, index, 'title', e.target.value)}
                                                style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.2)', color: node.color || '#fff', fontSize: 13, fontWeight: 700, outline: 'none', flex: 1, maxWidth: 200 }}
                                                placeholder="Total Title"
                                            />
                                            <input 
                                                type="text" 
                                                value={node.key || ''} 
                                                onChange={(e) => handleUpdateNodeField(selectedDocCoA, index, 'key', e.target.value)}
                                                style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.2)', color: '#94a3b8', fontSize: 11, outline: 'none', flex: 1, maxWidth: 150, fontFamily: 'monospace' }}
                                                placeholder="Data Key"
                                            />
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <button onClick={() => handleMoveNode(selectedDocCoA, index, 'up')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>↑</button>
                                            <button onClick={() => handleMoveNode(selectedDocCoA, index, 'down')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>↓</button>
                                            <button onClick={() => handleRemoveNode(selectedDocCoA, index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}><Trash2 size={16}/></button>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>formula:</span>
                                        <input 
                                            type="text" 
                                            value={Array.isArray(node.formula) ? node.formula.join(', ') : node.formula || ''} 
                                            onChange={(e) => handleUpdateNodeField(selectedDocCoA, index, 'formula', e.target.value)}
                                            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#a5b4fc', fontSize: 12, outline: 'none', flex: 1, padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace' }}
                                            placeholder="e.g. revenue - directCosts"
                                        />
                                    </div>
                                </div>
                            );
                        }

                        // Render Standard Sections with Line Items
                        if (node.type === 'section') {
                            const isExpanded = expandedSections[node.key] || false;
                            return (
                                <div key={`sec_${index}`} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden' }}>
                                    {/* Section Header */}
                                    <div 
                                        onClick={() => toggleSectionExpansion(node.key)}
                                        style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                                            {isExpanded ? <ChevronDown size={16} color="#94a3b8"/> : <ChevronRight size={16} color="#94a3b8"/>}
                                            <input 
                                                type="text" 
                                                value={node.title || ''} 
                                                onChange={(e) => handleUpdateNodeField(selectedDocCoA, index, 'title', e.target.value)}
                                                onClick={e => e.stopPropagation()}
                                                style={{ background: 'transparent', border: 'none', borderBottom: '1px dashed rgba(255,255,255,0.2)', color: '#e2e8f0', fontSize: 13, fontWeight: 700, outline: 'none', flex: 1, maxWidth: 200 }}
                                                placeholder="Section Title"
                                            />
                                            <span style={{ fontSize: 10, color: '#94a3b8' }}>key:</span>
                                            <input 
                                                type="text" 
                                                value={node.key || ''} 
                                                onChange={(e) => handleUpdateNodeField(selectedDocCoA, index, 'key', e.target.value)}
                                                onClick={e => e.stopPropagation()}
                                                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 10, padding: '2px 6px', borderRadius: 4, outline: 'none', maxWidth: 120, fontFamily: 'monospace' }}
                                                placeholder="Data Key"
                                            />
                                        </div>
                                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                            <span style={{ fontSize: 12, color: '#64748b' }}>{(node.items || []).length} items</span>
                                            <button onClick={(e) => { e.stopPropagation(); handleMoveNode(selectedDocCoA, index, 'up'); }} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>↑</button>
                                            <button onClick={(e) => { e.stopPropagation(); handleMoveNode(selectedDocCoA, index, 'down'); }} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>↓</button>
                                            <button onClick={(e) => { e.stopPropagation(); handleRemoveNode(selectedDocCoA, index); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}><Trash2 size={14}/></button>
                                        </div>
                                    </div>

                                    {/* Line Items & Sub-Items List */}
                                    {isExpanded && (
                                        <div style={{ padding: '8px 16px 16px 42px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {(() => {
                                                const itemsList = node.items || [];
                                                const mainItems = new Set();
                                                const subItemsMap = {};

                                                // Build hierarchy map from items string array
                                                itemsList.forEach((item) => {
                                                    const label = typeof item === 'string' ? item : item.label || item.dataKey;
                                                    if (label.includes('||')) {
                                                        const [parent, sub] = label.split('||');
                                                        mainItems.add(parent);
                                                        if (!subItemsMap[parent]) subItemsMap[parent] = [];
                                                        subItemsMap[parent].push({ fullString: label, subName: sub });
                                                    } else {
                                                        mainItems.add(label);
                                                    }
                                                });

                                                // Render main items and their nested sub-items
                                                return Array.from(mainItems).map((parentName, pIdx) => {
                                                    const subs = subItemsMap[parentName] || [];
                                                    return (
                                                        <div key={`parent_${pIdx}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.04)' }}>
                                                                <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{parentName}</span>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                    <button 
                                                                        onClick={() => handleAddSubItem(selectedDocCoA, index, parentName)}
                                                                        style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '2px 6px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}
                                                                    >
                                                                        + Sub
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleRemoveItemAndSubs(selectedDocCoA, index, parentName)}
                                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2, opacity: 0.8 }}
                                                                        title="Remove item and all sub-items"
                                                                    >
                                                                        <Trash2 size={13}/>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            
                                                            {subs.map((sub, sIdx) => (
                                                                <div key={`sub_${sIdx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px 4px 30px', background: 'rgba(255,255,255,0.01)', borderRadius: 4, borderLeft: '1px dashed rgba(255,255,255,0.05)', marginLeft: 8 }}>
                                                                    <span style={{ fontSize: 11, color: '#94a3b8' }}>↳ {sub.subName}</span>
                                                                    <button 
                                                                        onClick={() => handleRemoveExactItem(selectedDocCoA, index, sub.fullString)}
                                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2, opacity: 0.6 }}
                                                                    >
                                                                        <Trash2 size={12}/>
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                });
                                            })()}
                                            <button 
                                                onClick={() => handleAddLineItemToSection(selectedDocCoA, index)}
                                                style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', color: '#94a3b8', padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', marginTop: 8 }}
                                            >
                                                + Add Main Line Item
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        }
                        
                        // Handle Dynamic placeholders (e.g. Equity)
                        if (node.dynamic) {
                             return (
                                <div key={`dyn_${index}`} style={{ background: 'rgba(245,158,11,0.05)', border: '1px dashed rgba(245,158,11,0.2)', padding: '12px 16px', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', fontStyle: 'italic' }}>
                                        ⚡ Dynamic Insertion Point: [{node.key}] - Resolved based on Active Entity Type
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <button onClick={() => handleMoveNode(selectedDocCoA, index, 'up')} style={{ background: 'rgba(245,158,11,0.1)', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>↑</button>
                                        <button onClick={() => handleMoveNode(selectedDocCoA, index, 'down')} style={{ background: 'rgba(245,158,11,0.1)', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>↓</button>
                                        <button onClick={() => handleRemoveNode(selectedDocCoA, index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}><Trash2 size={16}/></button>
                                    </div>
                                </div>
                            );
                        }

                        return null;
                    })}
                 </div>
             </div>
           </div>
        )}

        {/* ── SUB-VIEW B: EXECUTIVE DASHBOARD LAYOUT CONFIGURATOR ── */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            
            {/* 1. CUSTOM KPI SCORECARD FORMULA BUILDER */}
            <div style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Calculator size={18} color="#00f0ff" /> Custom KPI Formula Scorecards
              </h3>
              <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>
                Define mathematical formulas across line items to generate standalone scorecard KPIs (e.g., <code>currentAssets - currentliablities</code> for Working Capital).
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 2fr auto', gap: 12, alignItems: 'end', background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8, border: '1px dashed rgba(255,255,255,0.05)', marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Unique Token Key</label>
                  <input 
                    type="text" 
                    placeholder="e.g. working_capital" 
                    value={newKPI.key} 
                    onChange={e => setNewKPI({ ...newKPI, key: e.target.value })} 
                    style={{ width: '100%', background: '#0b0f19', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 12, outline: 'none' }} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Display Card Title</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Working Capital" 
                    value={newKPI.label} 
                    onChange={e => setNewKPI({ ...newKPI, label: e.target.value })} 
                    style={{ width: '100%', background: '#0b0f19', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 12, outline: 'none' }} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Formula Expression</label>
                  <input 
                    type="text" 
                    placeholder="e.g. currentAssets - currentliablities" 
                    value={newKPI.formula} 
                    onChange={e => setNewKPI({ ...newKPI, formula: e.target.value })} 
                    style={{ width: '100%', background: '#0b0f19', border: '1px solid rgba(255,255,255,0.1)', color: '#00f0ff', padding: '8px 12px', borderRadius: 6, fontSize: 12, outline: 'none', fontFamily: 'monospace' }} 
                  />
                </div>
                <button 
                  onClick={handleAddCustomKPI} 
                  style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', height: 35 }}
                >
                  Save KPI
                </button>
              </div>

              {/* Render Configured Custom KPIs */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {(schemas.customKPIs || []).map(kpi => (
                  <div key={kpi.key} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div>
                      <span style={{ fontSize: 12, color: '#fff', fontWeight: 600, display: 'block' }}>{kpi.label}</span>
                      <code style={{ fontSize: 10, color: '#00f0ff' }}>ƒ = {kpi.formula}</code>
                    </div>
                    <button onClick={() => handleRemoveCustomKPI(kpi.key)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. EXECUTIVE DASHBOARD VISIBILITY MANAGER CONSOLE */}
            <div style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Eye size={18} color="#6366f1" /> Dashboard Content Controls
              </h3>
              <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>
                Toggle which scorecards, custom KPIs, ratios, and created metrics are rendered explicitly inside the Executive Dashboard tab.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {masterMetricsList.map(metric => {
                  const isVisible = (schemas.dashboardConfig?.visibleKPIs || []).includes(metric.key);
                  return (
                    <div 
                      key={metric.key} 
                      onClick={() => toggleKPIVisibility(metric.key)}
                      style={{ 
                        background: isVisible ? 'rgba(99,102,241,0.08)' : 'rgba(0,0,0,0.2)', 
                        border: isVisible ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.05)', 
                        padding: '12px 14px', 
                        borderRadius: 8, 
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        transition: 'all 0.2s' 
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: isVisible ? 700 : 500, color: isVisible ? '#fff' : '#cbd5e1' }}>{metric.label}</span>
                      {isVisible ? <Eye size={15} color="#00f0ff" /> : <EyeOff size={15} color="#475569" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. VISUAL CHARTS CONFIGURATOR & LAYOUT toggles */}
            <div style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={18} color="#6366f1" /> Interactive Visual Chart Builder
              </h3>
              <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>
                Configure multi-metric charts, group variable datasets into timelines, and toggle layout visibility.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24, background: 'rgba(0,0,0,0.2)', padding: 20, borderRadius: 8, border: '1px dashed rgba(255,255,255,0.05)' }}>
                <div>
                  <h4 style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 12 }}>Construct New Chart Object</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Chart Header / Title</label>
                      <input 
                        type="text"
                        placeholder="e.g. Operating Performance"
                        value={newChart.title}
                        onChange={e => setNewChart({...newChart, title: e.target.value})}
                        style={{ width: '100%', background: '#0b0f19', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 12, outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Rendering Projection Style</label>
                      <select
                        value={newChart.type}
                        onChange={e => setNewChart({...newChart, type: e.target.value})}
                        style={{ width: '100%', background: '#0b0f19', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}
                      >
                        <option value="combo">Combo Plot (Bar + Line Overlay)</option>
                        <option value="bar">Grouped Column Bar Chart</option>
                        <option value="line">Continuous Trend Line Chart</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1', marginBottom: 12 }}>Dataset Assignment ({newChart.datasets.length} Active)</h4>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                    <select
                      value={tempDatasetSelect}
                      onChange={e => setTempDatasetSelect(e.target.value)}
                      style={{ flex: 1, background: '#0b0f19', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 10px', borderRadius: 6, fontSize: 12, outline: 'none' }}
                    >
                      <option value="">-- Pick Series Variable --</option>
                      {masterMetricsList.map(m => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAddChartDataset(tempDatasetSelect)}
                      style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#6366f1', padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Add Dataset
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {newChart.datasets.map(dsKey => {
                      const found = masterMetricsList.find(m => m.key === dsKey);
                      return (
                        <div key={dsKey} style={{ background: '#030712', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                          <span style={{ color: '#cbd5e1' }}>{found?.label || dsKey}</span>
                          <button onClick={() => handleRemoveChartDataset(dsKey)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}>&times;</button>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={handleCommitNewChart}
                    style={{ width: '100%', background: '#10b981', color: '#fff', border: 'none', padding: '10px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer', marginTop: 16 }}
                  >
                    + Append Chart to Dashboard Config
                  </button>
                </div>
              </div>

              {/* List of Configured Charts with Individual Toggles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Registered Charts Layout</h4>
                {(schemas.dashboardConfig?.charts || []).length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12, color: '#64748b', fontSize: 12 }}>
                    No custom visual charts configured. Build one above.
                  </div>
                ) : (
                  (schemas.dashboardConfig.charts || []).map((chart, cIdx) => {
                    const isChartVisible = chart.isVisible !== false;
                    return (
                      <div key={cIdx} style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.08)', padding: 16, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{chart.title}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'flex', gap: 12 }}>
                            <span style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '2px 6px', borderRadius: 4 }}>Type: {chart.type}</span>
                            <span><strong>Series:</strong> {chart.datasets?.map(dsKey => masterMetricsList.find(m => m.key === dsKey)?.label || dsKey).join(', ')}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <button 
                            onClick={() => toggleChartVisibility(cIdx)}
                            style={{ background: isChartVisible ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: '1px solid transparent', color: isChartVisible ? '#10b981' : '#ef4444', borderRadius: 6, cursor: 'pointer', padding: '6px 12px', fontSize: 11, fontWeight: 800 }}
                          >
                            {isChartVisible ? "ACTIVE ON DASHBOARD" : "MUTED"}
                          </button>
                          <button 
                            onClick={() => handleRemoveChart(cIdx)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        )}

        {/* ── SUB-VIEW C: CUSTOM RATIO CONFIGURATOR ── */}
        {activeTab === 'ratios' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 32 }}>
            <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', padding: 20, borderRadius: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Register Ratio Evaluation Node</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Unique Evaluation Key</label>
                  <input 
                    type="text" 
                    placeholder="e.g. quick_ratio"
                    value={newRatio.key}
                    onChange={e => setNewRatio({...newRatio, key: e.target.value})}
                    style={{ width: '100%', background: '#0b0f19', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 12, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Frontend Label String</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Acid-Test Ratio"
                    value={newRatio.name}
                    onChange={e => setNewRatio({...newRatio, name: e.target.value})}
                    style={{ width: '100%', background: '#0b0f19', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 12, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Numerator Keys (Comma Separated)</label>
                  <input 
                    type="text" 
                    placeholder="cash, marketable_securities, receivables"
                    value={newRatio.numerator}
                    onChange={e => setNewRatio({...newRatio, numerator: e.target.value})}
                    style={{ width: '100%', background: '#0b0f19', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 12, outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Denominator Keys (Comma Separated)</label>
                  <input 
                    type="text" 
                    placeholder="currentliablities"
                    value={newRatio.denominator}
                    onChange={e => setNewRatio({...newRatio, denominator: e.target.value})}
                    style={{ width: '100%', background: '#0b0f19', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 12, outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input 
                    type="checkbox" 
                    id="isPerc" 
                    checked={newRatio.isPercentage}
                    onChange={e => setNewRatio({...newRatio, isPercentage: e.target.checked})}
                  />
                  <label htmlFor="isPerc" style={{ fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>Render as Percentage (%) IF matching</label>
                </div>
                <button
                  onClick={handleAddRatio}
                  style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#6366f1', padding: '8px', borderRadius: 6, fontWeight: 700, fontSize: 12, marginTop: 8, cursor: 'pointer' }}
                >
                  + Append Dynamic Ratio Vector
                </button>
              </div>
            </div>

            {/* Ratios Mapping Log */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700 }}>Configured Metrics Array</h3>
              {(schemas.customRatios || []).length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12, color: '#64748b', fontSize: 13 }}>
                  No structural mappings appended. Enter operational ratios on the left panel.
                </div>
              ) : (
                (schemas.customRatios || []).map(r => (
                  <div key={r.key} style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.08)', padding: 16, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{r.name}</span>
                        <span style={{ fontSize: 10, background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '2px 6px', borderRadius: 4 }}>cr__{r.key}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, display: 'flex', gap: 16 }}>
                        <span><strong>Num:</strong> {r.numerator?.join(' + ')}</span>
                        <span><strong>Den:</strong> {r.denominator?.join(' + ')}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleRemoveRatio(r.key)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── SUB-VIEW D: THRESHOLD BOUNDARIES ── */}
        {activeTab === 'thresholds' && (
          <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)', padding: 24, borderRadius: 12, maxWidth: 600 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Confidence Metrics Threshold Adjuster</h3>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 24, lineHeight: 1.5 }}>
              Establishes automated logbook generation limits. Document nodes scoring below these confidence intervals trigger review items automatically <strong>IF (if applicable)</strong> threshold criteria breach operational targets.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>High Confidence Target (&gt;= {schemas.confidenceThresholds?.high * 100 || 85}%)</span>
                  <span style={{ color: '#94a3b8' }}>{schemas.confidenceThresholds?.high || 0.85}</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="1.0" 
                  step="0.01"
                  value={schemas.confidenceThresholds?.high || 0.85}
                  onChange={e => handleThresholdChange('high', e.target.value)}
                  style={{ width: '100%', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: '#f59e0b', fontWeight: 600 }}>Medium Review Threshold (&gt;= {schemas.confidenceThresholds?.medium * 100 || 70}%)</span>
                  <span style={{ color: '#94a3b8' }}>{schemas.confidenceThresholds?.medium || 0.70}</span>
                </div>
                <input 
                  type="range" 
                  min="0.3" 
                  max="0.9" 
                  step="0.01"
                  value={schemas.confidenceThresholds?.medium || 0.70}
                  onChange={e => handleThresholdChange('medium', e.target.value)}
                  style={{ width: '100%', cursor: 'pointer' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── SUB-VIEW E: MASTER DOCUMENTS & ENTITIES ── */}
        {activeTab === 'docs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            
            {/* Documents Section */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Active Shared Workspace Documents</h3>
                    <button 
                        onClick={handleAddDocument}
                        style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        <Plus size={14}/> Add Document
                    </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(schemas.documents || []).map(d => (
                    <div key={d.key} style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.08)', padding: 16, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 6, color: '#94a3b8' }}>
                                <Layers size={16} />
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{d.name}</div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Shared Model Token: [ {d.key.toUpperCase()} ]</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <span style={{ fontSize: 11, background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '4px 8px', borderRadius: 12, fontWeight: 600 }}>
                                Active Root Schema
                            </span>
                            <button 
                                onClick={() => handleRemoveDocument(d.key)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                                title="Remove Document"
                            >
                                <Trash2 size={16}/>
                            </button>
                        </div>
                    </div>
                    ))}
                </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)' }} />

            {/* Entities Section */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Configured Entity Structures</h3>
                    <button 
                        onClick={handleAddEntityType}
                        style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#6366f1', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        <Plus size={14}/> Add Entity Type
                    </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                    {Object.entries(schemas.entityTypes || {}).map(([entKey, entData]) => (
                        <div key={entKey} style={{ background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.08)', padding: 20, borderRadius: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#00f0ff' }}>{entData.name}</div>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>System Key: {entKey}</div>
                                </div>
                                <button 
                                    onClick={() => handleRemoveEntityType(entKey)}
                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                                    title="Delete Entity Type"
                                >
                                    <Trash2 size={16}/>
                                </button>
                            </div>
                            
                            <div style={{ marginTop: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Equity Line Overrides</div>
                                    <button 
                                        onClick={() => handleAddEquityItem(entKey)}
                                        style={{ background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', color: '#94a3b8', padding: '2px 6px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}
                                    >
                                        + Add Line
                                    </button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {(entData.equitySchema?.[0]?.items || []).length === 0 && (
                                        <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>No equity items defined.</div>
                                    )}
                                    {entData.equitySchema?.[0]?.items?.map((itm, iIdx) => (
                                        <div key={iIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.04)' }}>
                                            <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                                                {itm.label} <span style={{ color: '#475569' }}>({itm.dataKey})</span>
                                            </div>
                                            <button 
                                                onClick={() => handleRemoveEquityItem(entKey, iIdx)}
                                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2, opacity: 0.7 }}
                                            >
                                                <Trash2 size={12}/>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}