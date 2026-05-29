// src/pages/fsa/FSAWorkspace.jsx
import  { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileSpreadsheet, 
  FileText, 
  PieChart, 
  Sun, 
  Moon, 
  Settings, 
  LogOut, 
  CheckCircle2, 
  AlertCircle, 
  UploadCloud, 
  BookOpen, 
  Menu, 
  ChevronLeft
} from 'lucide-react';
import { useFSAWorkspace } from './hooks/useFSAWorkspace';

// Import Modular Functional Interface Components
import FSADataEntry from './components/FSADataEntry';
import FSAStatements from './components/FSAStatements';
import FSADashboard from './components/FSADashboard';
import FSAAnalysis from './components/FSAAnalysis';
import AuditLogbookDrawer from './components/AuditLogbookModal';


export default function FSAWorkspace() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const projectId = searchParams.get('project');
  const fsaId = searchParams.get('fsa');
  const projectName = searchParams.get('name') || 'Financial Analysis Workbench';

  const hubUrl = `/module-hub?project=${projectId}&name=${encodeURIComponent(projectName || '')}`;

  // Core Data Hook Subscriptions
  const {
    projectData, configSchemas, reclassMap, auditLogs,
    activeYear, activeEntityType, theme, activeYearsList, activeItemsMap,
    loading, saving, error, updateDataPath, switchEntityType, toggleTheme, forceSave
  } = useFSAWorkspace(projectId, fsaId);

  // Layout Subscriptions
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [logbookOpen, setLogbookOpen] = useState(false);

  // Derive the active entity string for display
  

  // Navigation config definition map
  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
    { id: 'dataEntry', label: 'Financial Input Matrix', icon: FileSpreadsheet },
    { id: 'statements', label: 'Standard Statements', icon: FileText },
    { id: 'analysis', label: 'Intelligent Analysis', icon: PieChart },
  ];

  const isDark = theme === 'dark';
  const themeStyles = {
    bgApp: 'var(--bg-primary)',
    bgSidebar: 'var(--bg-secondary)',
    bgHeader: 'var(--bg-secondary)',
    bgCard: 'var(--bg-secondary)',
    textMain: 'var(--text-primary)',
    textMuted: 'var(--text-muted)',
    border: 'var(--border-subtle)',
    primary: 'var(--accent-color)',
    accentHover: 'var(--bg-hover)',
    sidebarBorder: '1px solid var(--border-subtle)'
  };

  // ✅ FIX 1: Forces the highest level of your website (HTML tag) to apply the active theme.
  // This physically overrides any default white background trapping the app.
  useEffect(() => {
    const currentTheme = theme || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [theme]);

  if (!projectId || !fsaId) {
    return (
      <div data-theme={theme || 'dark'} style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)', flexDirection: 'column', gap: 16 }}>
        <AlertCircle size={48} color="#ef4444" />
        <h2 style={{ fontSize: 20, margin: 0 }}>Missing Project Identifiers</h2>
        <p style={{ color: 'var(--text-muted)' }}>Please return to the Dashboard and launch FSA from a project.</p>
        <button 
          onClick={() => navigate('/')} 
          style={{ background: 'var(--accent-color)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        /* ✅ FIX 2: Variables injected DIRECTLY into the component scope. */
        /* This guarantees the colors load properly and bypasses index.css entirely */
        :root, [data-theme="dark"] {
          --bg-primary: #0F172A;
          --bg-secondary: #1E293B;
          --bg-tertiary: rgba(0, 0, 0, 0.3);
          --bg-hover: rgba(255, 255, 255, 0.05);
          --text-primary: #F8FAFC;
          --text-secondary: #94A3B8;
          --text-muted: #64748B;
          --border-subtle: rgba(255, 255, 255, 0.08);
          --border-strong: rgba(255, 255, 255, 0.15);
          --accent-color: #6366F1;
          --accent-text: #818CF8;
        }

        [data-theme="light"] {
          --bg-primary: #F8FAFC;
          --bg-secondary: #FFFFFF;
          --bg-tertiary: rgba(0, 0, 0, 0.03);
          --bg-hover: rgba(0, 0, 0, 0.04);
          --text-primary: #0F172A;
          --text-secondary: #475569;
          --text-muted: #94A3B8;
          --border-subtle: rgba(0, 0, 0, 0.08);
          --border-strong: rgba(0, 0, 0, 0.15);
          --accent-color: #4F46E5;
          --accent-text: #4338CA;
        }

        /* Enforce theme background over global web body */
        body {
          background-color: var(--bg-primary) !important;
          color: var(--text-primary) !important;
        }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-6px); } 100% { transform: translateY(0px); } }
        @keyframes pulseGlow { 0% { box-shadow: 0 0 15px rgba(99,102,241,0.2); } 50% { box-shadow: 0 0 30px rgba(99,102,241,0.5); } 100% { box-shadow: 0 0 15px rgba(99,102,241,0.2); } }
        @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .saas-card { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden; }
        .saas-card::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 2px; background: linear-gradient(90deg, transparent, var(--accent-color), transparent); transform: translateX(-100%); transition: transform 0.5s ease; }
        .saas-card:hover::before { transform: translateX(100%); }
        .saas-card:hover { transform: translateY(-5px); box-shadow: 0 15px 30px -10px rgba(0,0,0,0.5), 0 0 20px rgba(99,102,241,0.25); border-color: var(--accent-color) !important; }
        .ambient-orb { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.4; z-index: 0; pointer-events: none; animation: float 10s ease-in-out infinite; }
        .fade-in-up { animation: fadeIn 0.4s ease-out forwards; }
      `}} />
      
      <div data-theme={theme} style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: themeStyles.bgApp, color: themeStyles.textMain, fontFamily: "'DN Sans', system-ui, sans-serif" }}>
      
      {/* ── LEFT SIDEBAR NAVIGATION ── */}
      <aside style={{
        width: sidebarOpen ? 260 : 70,
        background: themeStyles.bgSidebar,
        borderRight: themeStyles.sidebarBorder,
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 40
      }}>
        {/* Toggle Button */}
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{ position: 'absolute', right: -14, top: 20, width: 28, height: 28, borderRadius: '50%', background: themeStyles.bgSidebar, border: themeStyles.sidebarBorder, color: themeStyles.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <Menu size={16} />}
        </button>

        {/* Branding & Project Title */}
        <div style={{ padding: sidebarOpen ? '24px 20px' : '24px 0', display: 'flex', flexDirection: 'column', alignItems: sidebarOpen ? 'flex-start' : 'center', gap: 12, borderBottom: themeStyles.sidebarBorder }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)' }}>
            <FileSpreadsheet size={20} color="#fff" />
          </div>
          {sidebarOpen && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: themeStyles.primary, textTransform: 'uppercase', marginBottom: 4 }}>Financial Analysis</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: themeStyles.textMain, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 200 }}>{projectName}</div>
            </div>
          )}
        </div>

        {/* Navigation Map */}
        <nav style={{ padding: '24px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
                  borderRadius: 8, cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                  background: isActive ? themeStyles.accentHover : 'transparent',
                  color: isActive ? themeStyles.primary : themeStyles.textMuted,
                  justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  fontWeight: isActive ? 700 : 600,
                  fontSize: 14
                }}
                title={!sidebarOpen ? item.label : ''}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                {sidebarOpen && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Utility / Global Navigation Actions */}
        <div style={{ padding: '16px 12px', borderTop: themeStyles.sidebarBorder, display: 'flex', flexDirection: 'column', gap: 8 }}>
          
          <button 
            onClick={() => setLogbookOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 8, cursor: 'pointer', border: 'none', background: 'transparent', color: auditLogs.length > 0 ? '#f59e0b' : themeStyles.textMuted, justifyContent: sidebarOpen ? 'flex-start' : 'center', fontWeight: 600, fontSize: 13 }}
            title="Audit Logbook"
          >
            <BookOpen size={18} />
            {sidebarOpen && <span>Audit Logbook {auditLogs.length > 0 && `(${auditLogs.length})`}</span>}
          </button>
          
          <button 
            onClick={() => navigate(`/fsa-settings?project=${projectId}&fsa=${fsaId}&name=${encodeURIComponent(projectName)}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 8, cursor: 'pointer', border: 'none', background: 'transparent', color: themeStyles.textMuted, justifyContent: sidebarOpen ? 'flex-start' : 'center', fontWeight: 600, fontSize: 13 }}
            title="Enterprise Configurations"
          >
            <Settings size={18} />
            {sidebarOpen && <span>Enterprise Configurations</span>}
          </button>

          <button 
            onClick={() => navigate(hubUrl)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 8, cursor: 'pointer', border: 'none', background: 'transparent', color: '#ef4444', justifyContent: sidebarOpen ? 'flex-start' : 'center', fontWeight: 600, fontSize: 13 }}
            title="Exit Module"
          >
            <LogOut size={18} />
            {sidebarOpen && <span>Exit Module</span>}
          </button>

        </div>
      </aside>

      {/* ── MAIN CONTENT CANVAS ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        
        {/* Top Fixed Action Bar */}
        <header style={{
          height: 64,
          background: themeStyles.bgHeader,
          backdropFilter: 'blur(12px)',
          borderBottom: themeStyles.sidebarBorder,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          zIndex: 30
        }}>
          
          {/* Status Indicator Area */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {loading ? (
              <span style={{ fontSize: 12, color: themeStyles.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UploadCloud size={14} className="animate-pulse" /> Syncing Schema...
              </span>
            ) : error ? (
              <span style={{ fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={14} /> DB Error Detected
              </span>
            ) : saving ? (
              <span style={{ fontSize: 12, color: themeStyles.primary, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UploadCloud size={14} className="animate-bounce" /> Writing Data...
              </span>
            ) : (
              <span style={{ fontSize: 12, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} /> Synchronized
              </span>
            )}
          </div>

          {/* Context Switching & Visual Settings */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            
            {/* Dynamic Entity Type Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: 8, border: themeStyles.sidebarBorder }}>
              <span style={{ fontSize: 11, color: themeStyles.textMuted, padding: '0 8px' }}>Entity:</span>
              <select 
                value={activeEntityType}
                onChange={(e) => switchEntityType(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: themeStyles.textMain, fontSize: 13, fontWeight: 700, outline: 'none', cursor: 'pointer', paddingRight: 8 }}
              >
                {Object.entries(configSchemas?.entityTypes || {}).map(([key, data]) => (
                  <option key={key} value={key} style={{ background: 'var(--bg-secondary)' }}>{data.name}</option>
                ))}
              </select>
            </div>

            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme} 
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'transparent', border: themeStyles.sidebarBorder, color: themeStyles.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

          </div>
        </header>

        {/* Dynamic Route Container for Active Component Tab */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          {loading && Object.keys(projectData).length === 0 ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
              <div style={{ width: 40, height: 40, border: `3px solid ${themeStyles.border}`, borderTopColor: themeStyles.primary, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ color: themeStyles.textMuted, fontSize: 14 }}>Initializing Enterprise FSA Sandbox...</span>
            </div>
          ) : (
            <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
              
              {activeTab === 'dataEntry' && (
                <FSADataEntry 
                  projectData={projectData}
                  configSchemas={configSchemas}
                  activeYear={activeYear}
                  activeEntityType={activeEntityType}
                  updateDataPath={updateDataPath}
                  forceSave={forceSave}
                  setActiveTab={setActiveTab} // <--- ADD THIS LINE
                />
              )}

              {activeTab === 'statements' && (
                <FSAStatements 
                  projectData={projectData}
                  configSchemas={configSchemas}
                  reclassMap={reclassMap}
                  activeEntityType={activeEntityType}
                  activeYearsList={activeYearsList}
                  activeItemsMap={activeItemsMap}
                />
              )}

              {activeTab === 'dashboard' && (
                <FSADashboard 
                  projectData={projectData}
                  configSchemas={configSchemas}
                  reclassMap={reclassMap}
                  activeEntityType={activeEntityType}
                />
              )}

              {activeTab === 'analysis' && (
                <FSAAnalysis 
                  projectId={projectId}
                  fsaId={fsaId}
                  projectData={projectData}
                  configSchemas={configSchemas}
                  reclassMap={reclassMap}
                  activeEntityType={activeEntityType}
                  forceSave={forceSave}
                  activeYearsList={activeYearsList}
                  activeItemsMap={activeItemsMap}
                />
              )}

            </div>
          )}
        </main>
      </div>

      {/* ── MODAL AUDIT LOGBOOK SYSTEM OVERLAY ── */}
      <AuditLogbookDrawer 
        isOpen={logbookOpen}
        onClose={() => setLogbookOpen(false)}
        auditLogs={auditLogs}
        onNavigateToRecord={() => setActiveTab('dataEntry')}
      />

    </div>
    </>
  );
}