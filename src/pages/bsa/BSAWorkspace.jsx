import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, db } from '../../firebase.js';
import { doc, getDoc, collection, getDocs, setDoc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import Chart from 'chart.js/auto';
import * as XLSX from 'xlsx';
import html2pdf from 'html2pdf.js';
import { ArrowLeft, AlertTriangle, Download, FileText, Upload, Plus, Trash2, Edit3, Save, Search, Flag } from 'lucide-react';
import './BSAWorkspace.css';

const HF_API_URL = "https://rathin-07-bankstatementextractorv1.hf.space/analyze-bank-statement";
const PAGE_SIZE = 100;
const ALL_CATS = ["Salaries", "Rent", "Loans & EMI", "Investments", "Tax & Govt", "Bank Charges", "Utilities", "Food & Dining", "Ecom / Online", "Cash", "Travel & Transport", "Healthcare & Medical", "Professional Fees", "Insurance", "Education", "Income", "Transfers", "Others"];

// ── CATEGORIZATION ENGINE (Reused from your code) ──
function normalizeCategory(cat) {
  if (!cat) return 'Others';
  const map = {
      'Transfer': 'Transfers', 'transfer': 'Transfers', 'Income / Receipt': 'Income',
      'Ecom/Online': 'Ecom / Online', 'Loan & EMI': 'Loans & EMI', 'Tax&Govt': 'Tax & Govt',
      'BankCharges': 'Bank Charges', 'Food&Dining': 'Food & Dining', 'Travel': 'Travel & Transport',
      'Medical': 'Healthcare & Medical', 'Health': 'Healthcare & Medical'
  };
  return map[cat] || cat;
}

function categorizeTransaction(desc, credit, debit) {
  const d = (desc || '').toLowerCase();
  const isCredit = parseFloat(credit) > 0;
  const isDebit = parseFloat(debit) > 0;
  const wb = (word) => new RegExp(`\\b${word}\\b`, 'i').test(desc);
  const has = (...words) => words.some(w => d.includes(w));
  const wbAny = (...words) => words.some(w => wb(w));

  if (wbAny('salary', 'sal', 'payroll') || has('salary credit', 'salary transfer')) return 'Salaries';
  if (wbAny('rent', 'lease') || has('office rent', 'monthly rent')) return 'Rent';
  if (wbAny('emi', 'loan') || has('home loan', 'personal loan', 'bajaj finance')) return 'Loans & EMI';
  if (wbAny('invest', 'equity', 'dividend', 'sip') || has('mutual fund', 'zerodha', 'groww')) return 'Investments';
  if (wbAny('gst', 'tds', 'tax') || has('income tax', 'gst payment')) return 'Tax & Govt';
  if (wbAny('charge', 'fee', 'penalty') || has('bank charge', 'service charge')) return 'Bank Charges';
  if (wbAny('electricity', 'broadband', 'recharge') || has('electricity bill', 'jio', 'airtel')) return 'Utilities';
  if (wbAny('restaurant', 'cafe') || has('zomato', 'swiggy', 'grocery')) return 'Food & Dining';
  if (wbAny('amazon', 'flipkart') || has('online shopping', 'paytm')) return 'Ecom / Online';
  if (has('atm', 'cash withdrawal', 'cash deposit')) return 'Cash';
  if (wbAny('flight', 'train', 'cab', 'fuel') || has('uber', 'ola', 'irctc', 'petrol')) return 'Travel & Transport';
  if (wbAny('hospital', 'clinic', 'pharmacy') || has('apollo', 'practo')) return 'Healthcare & Medical';
  if (wbAny('consult', 'audit', 'legal') || has('professional fee', 'consulting')) return 'Professional Fees';
  if (wbAny('insurance', 'premium') || has('lic', 'hdfc life')) return 'Insurance';
  if (wbAny('school', 'college', 'tuition') || has('school fee', 'byju')) return 'Education';
  
  if (isCredit && (wbAny('interest', 'refund', 'cashback') || has('income', 'received'))) return 'Income';
  if (has('upi', 'imps', 'neft', 'rtgs', 'fund transfer')) return 'Transfers';

  return 'Others';
}

function parseDateStr(dateStr) {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split(/[-/ ]/);
  if (parts.length >= 3) {
      if (parts[0].length === 4) return new Date(dateStr);
      return new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
  }
  return new Date(0);
}


// ── MAIN REACT COMPONENT ──
export default function BSAWorkspace() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const projectName = searchParams.get('name') || 'Active Dossier';
  const bsaId = searchParams.get('bsa');

  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('transactions');
  const [isEditorMode, setIsEditorMode] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [filterFlagged, setFilterFlagged] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  // Modals
  const [showUpload, setShowUpload] = useState(false);
  const [showDedupe, setShowDedupe] = useState(false);
  const [uploadState, setUploadState] = useState({ uploading: false, name: '' });
  const [toast, setToast] = useState(null);

  // Refs for Canvas
  const barChartRef = useRef(null);
  const donutChartRef = useRef(null);
  const lineChartRef = useRef(null);
  const charts = useRef({});

  // ── DATA FETCHING ──
  useEffect(() => {
    if (!projectId || !bsaId) return navigate('/module-hub');
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return navigate('/login');
      loadStatements();
    });
    return unsub;
  }, [projectId, bsaId]);

  const loadStatements = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "projects", projectId, "bsa", bsaId, "statements"));
    setStatements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  const showToastMsg = (msg, type='info') => {
    setToast({msg, type});
    setTimeout(() => setToast(null), 3000);
  };

  // ── MASTER LEDGER COMPUTATION ──
  const { masterTransactions, duplicatesFound, hasGap } = useMemo(() => {
    let arr = [];
    statements.forEach(stmt => {
      (stmt.data || []).forEach((txn, idx) => {
        const parsed = parseDateStr(txn.date);
        arr.push({
          ...txn,
          category: normalizeCategory(txn.category),
          id: `${stmt.id}_${idx}`,
          sourceId: stmt.id,
          sourceName: stmt.name,
          isDuplicate: false,
          isHidden: false,
          _date: parsed,
          _period: parsed.getTime() > 0 ? `${parsed.toLocaleString('default', { month: 'short' })} ${parsed.getFullYear()}` : '',
          _searchIndex: [txn.date, txn.description, txn.debit, txn.credit, txn.notes].join(' ').toLowerCase()
        });
      });
    });

    arr.sort((a, b) => a._date - b._date);

    let dupes = 0;
    for (let i = 0; i < arr.length; i++) {
      const cur = arr[i];
      for (let j = i + 1; j < Math.min(i + 15, arr.length); j++) {
        const nxt = arr[j];
        if (cur.sourceId !== nxt.sourceId && cur.date === nxt.date && cur.debit == nxt.debit && cur.credit == nxt.credit) {
          nxt.isDuplicate = true;
          dupes++;
        }
      }
    }

    const sortedStmts = [...statements].sort((a, b) => parseDateStr(a.data?.[0]?.date) - parseDateStr(b.data?.[0]?.date));
    let running = parseFloat(sortedStmts[0]?.openingBalance) || 0;
    let lastDate = null;
    let gap = false;

    arr.forEach(t => {
      if (!t.isDuplicate) {
        running += (parseFloat(t.credit) || 0) - (parseFloat(t.debit) || 0);
        t.balance = running;
        if (lastDate && (t._date - lastDate) > 45 * 86400000) gap = true;
        lastDate = t._date;
      }
    });

    return { masterTransactions: arr, duplicatesFound: dupes, hasGap: gap };
  }, [statements]);

  // ── FILTERING ──
  const filteredTxns = useMemo(() => {
    return masterTransactions.filter(t => {
      if (t.isDuplicate || t.isHidden) return false;
      if (search && !t._searchIndex.includes(search.toLowerCase())) return false;
      if (filterSource !== 'all' && t.sourceId !== filterSource) return false;
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      if (filterType === 'debit' && !(parseFloat(t.debit) > 0)) return false;
      if (filterType === 'credit' && !(parseFloat(t.credit) > 0)) return false;
      if (filterPeriod !== 'all' && t._period !== filterPeriod) return false;
      if (filterFlagged && !t.flagged) return false;
      return true;
    });
  }, [masterTransactions, search, filterSource, filterCategory, filterType, filterPeriod, filterFlagged]);

  const pagedTxns = filteredTxns.slice(0, (currentPage + 1) * PAGE_SIZE);

  // ── FILE UPLOAD TO HUGGINGFACE ──
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !uploadState.name) return alert("Enter a name and select a PDF.");
    setUploadState({ ...uploadState, uploading: true });
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(HF_API_URL, { method: 'POST', body: formData });
      const rawText = await res.text();
      const result = JSON.parse(rawText);
      if (result.status === 'error') throw new Error(result.message);

      const extraction = result.extractionresults || result;
      let aiData = extraction.data || result.data || [];
      
      let ob = parseFloat(result.opening_balance || extraction.opening_balance || 0);
      if (aiData[0]?.date === 'Opening') {
        if (!ob) ob = parseFloat(aiData[0].balance) || 0;
        aiData = aiData.slice(1);
      }

      aiData.forEach(t => t.category = normalizeCategory(categorizeTransaction(t.description, t.credit, t.debit)));

      const stmtId = `stmt_${crypto.randomUUID()}`;
      await setDoc(doc(db, "projects", projectId, "bsa", bsaId, "statements", stmtId), {
        name: uploadState.name, openingBalance: ob, isLocked: false, data: aiData, createdAt: serverTimestamp()
      });

      showToastMsg(`Extracted ${aiData.length} transactions!`, 'success');
      setShowUpload(false);
      setUploadState({ uploading: false, name: '' });
      loadStatements();
    } catch (err) {
      alert("Extraction Error: " + err.message);
      setUploadState({ ...uploadState, uploading: false });
    }
  };

  // ── INLINE EDITING ──
  const patchRow = (id, field, value) => {
    const txn = masterTransactions.find(t => t.id === id);
    if (!txn) return;
    const stmt = statements.find(s => s.id === txn.sourceId);
    const origIdx = parseInt(id.split('_').pop());
    
    const newStatements = [...statements];
    const targetStmt = newStatements.find(s => s.id === stmt.id);
    targetStmt.data[origIdx][field] = field === 'category' ? normalizeCategory(value) : value;
    setStatements(newStatements);
  };

  const saveToFirebase = useCallback(async () => {
    showToastMsg("Saving...", "info");
    for (let stmt of statements) {
      await updateDoc(doc(db, "projects", projectId, "bsa", bsaId, "statements", stmt.id), { data: stmt.data });
    }
    showToastMsg("Ledger saved!", "success");
    setIsEditorMode(false);
  }, [statements, projectId, bsaId]);

  const deleteTransaction = (id) => {
    if(!window.confirm("Delete transaction?")) return;
    const txn = masterTransactions.find(t => t.id === id);
    const newStmts = [...statements];
    const stmt = newStmts.find(s => s.id === txn.sourceId);
    stmt.data.splice(parseInt(id.split('_').pop()), 1);
    setStatements(newStmts);
  };

  // ── EXPORTS ──
  const handleExportExcel = () => {
    const rows = filteredTxns.map(t => ({
      Date: t.date, Description: t.description, Category: t.category,
      'Debit (Dr)': t.debit || 0, 'Credit (Cr)': t.credit || 0,
      Balance: t.balance || 0, Source: t.sourceName, Notes: t.notes || ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, "Consolidated_Ledger.xlsx");
  };

  const handleExportPDF = () => {
    const el = document.getElementById('pdf-export-area');
    html2pdf().from(el).set({ margin: 1, filename: 'Financial_Summary.pdf', html2canvas: { scale: 2 } }).save();
  };

  // ── RENDER CHARTS ──
  useEffect(() => {
    if (activeTab !== 'analytics') return;
    
    const monthly = {};
    const catBreakdown = {};
    
    filteredTxns.forEach(t => {
      const d = parseFloat(t.debit) || 0;
      const c = parseFloat(t.credit) || 0;
      if (!t._period) return;
      if (!monthly[t._period]) monthly[t._period] = { in: 0, out: 0, bal: 0 };
      monthly[t._period].in += c;
      monthly[t._period].out += d;
      monthly[t._period].bal = t.balance;
      if (d > 0) catBreakdown[t.category] = (catBreakdown[t.category] || 0) + d;
    });

    const labels = Object.keys(monthly).sort((a, b) => new Date(a) - new Date(b));
    const dataIn = labels.map(l => monthly[l].in);
    const dataOut = labels.map(l => monthly[l].out);
    const dataBal = labels.map(l => monthly[l].bal);

    if (charts.current.bar) charts.current.bar.destroy();
    if (barChartRef.current) {
      charts.current.bar = new Chart(barChartRef.current, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Inflow', data: dataIn, backgroundColor: '#10b981' }, { label: 'Outflow', data: dataOut, backgroundColor: '#ef4444' }] }
      });
    }

    if (charts.current.donut) charts.current.donut.destroy();
    if (donutChartRef.current) {
      charts.current.donut = new Chart(donutChartRef.current, {
        type: 'doughnut',
        data: { labels: Object.keys(catBreakdown), datasets: [{ data: Object.values(catBreakdown) }] }
      });
    }

    if (charts.current.line) charts.current.line.destroy();
    if (lineChartRef.current) {
      charts.current.line = new Chart(lineChartRef.current, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Balance', data: dataBal, borderColor: '#4f46e5', fill: true, backgroundColor: 'rgba(79, 70, 229, 0.08)' }] }
      });
    }
  }, [activeTab, filteredTxns]);


  // ── UI RENDERING ──
  if (loading) return <div className="bsa-view items-center justify-center"><div className="loader"></div></div>;

  return (
    <div className="bsa-view bg-slate-50 min-h-screen text-slate-800">
      
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate(`/module-hub?project=${projectId}&name=${encodeURIComponent(projectName)}`)} className="px-4 py-2 border border-slate-300 rounded-md text-sm font-semibold hover:bg-slate-50 flex items-center gap-2">
            <ArrowLeft size={16}/> Back
          </button>
          <div>
            <h1 className="text-lg font-bold m-0">{projectName}</h1>
            <p className="text-xs text-slate-500 m-0">Consolidated Bank Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {duplicatesFound > 0 && (
            <button onClick={() => setShowDedupe(true)} className="px-4 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-md text-sm font-bold flex items-center gap-2">
              <AlertTriangle size={16} /> Resolve {duplicatesFound} Duplicates
            </button>
          )}
          {isEditorMode ? (
            <button onClick={saveToFirebase} className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-bold flex items-center gap-2 hover:bg-indigo-700">
              <Save size={16} /> Save Changes
            </button>
          ) : (
            <button onClick={() => setIsEditorMode(true)} className="px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-bold flex items-center gap-2 hover:bg-slate-50">
              <Edit3 size={16} /> Editor Mode
            </button>
          )}
          <div className="w-px h-6 bg-slate-300"></div>
          <button onClick={handleExportExcel} className="px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-md text-sm font-bold flex items-center gap-2"><Download size={16}/> Excel</button>
          <button onClick={handleExportPDF} className="px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-md text-sm font-bold flex items-center gap-2"><FileText size={16}/> PDF</button>
        </div>
      </header>

      {/* STATEMENTS BAR */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex gap-3 items-center flex-wrap">
        {statements.map(s => (
          <div key={s.id} className="bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2">
            🏦 {s.name} <span className="text-slate-400 font-normal">({(s.data||[]).length} txns)</span>
            <button onClick={async () => { if(window.confirm("Remove statement?")) { await deleteDoc(doc(db,"projects",projectId,"bsa",bsaId,"statements",s.id)); loadStatements(); } }} className="text-red-400 hover:text-red-600 ml-1"><Trash2 size={12}/></button>
          </div>
        ))}
        <button onClick={() => setShowUpload(true)} className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-xs font-bold flex items-center gap-1 hover:bg-blue-100">
          <Plus size={14} /> Add Statement
        </button>
      </div>

      {/* EMPTY STATE */}
      {statements.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-6xl mb-4">🏦</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">No Statements Loaded</h2>
          <p className="text-slate-500 mb-6">Upload a PDF to auto-extract and build the ledger.</p>
          <button onClick={() => setShowUpload(true)} className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold shadow-md">Upload First Statement</button>
        </div>
      ) : (
        <>
          {/* TABS */}
          <div className="flex bg-white border-b border-slate-200 px-6">
            <button onClick={() => setActiveTab('transactions')} className={`px-6 py-4 text-sm font-bold border-b-2 ${activeTab==='transactions'?'border-indigo-600 text-indigo-600':'border-transparent text-slate-500'}`}>📝 Ledger & Transactions</button>
            <button onClick={() => setActiveTab('summary')} className={`px-6 py-4 text-sm font-bold border-b-2 ${activeTab==='summary'?'border-indigo-600 text-indigo-600':'border-transparent text-slate-500'}`}>📊 Financial Summary</button>
            <button onClick={() => setActiveTab('analytics')} className={`px-6 py-4 text-sm font-bold border-b-2 ${activeTab==='analytics'?'border-indigo-600 text-indigo-600':'border-transparent text-slate-500'}`}>📈 Visual Analytics</button>
          </div>

          <main className="flex-1 overflow-auto p-6">
            
            {/* ── TRANSACTIONS TAB ── */}
            {activeTab === 'transactions' && (
              <div className="max-w-7xl mx-auto">
                {/* FILTERS */}
                <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm mb-4 flex flex-col gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                    <input type="text" placeholder="Search descriptions or amounts..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-indigo-500" />
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    <select value={filterSource} onChange={e=>setFilterSource(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded-md text-sm">
                      <option value="all">All Sources</option>
                      {statements.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select value={filterCategory} onChange={e=>setFilterCategory(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded-md text-sm">
                      <option value="all">All Categories</option>
                      {ALL_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button onClick={()=>setFilterFlagged(!filterFlagged)} className={`px-3 py-1.5 border rounded-md text-sm flex items-center gap-1 ${filterFlagged?'bg-red-50 border-red-200 text-red-600':'bg-white border-slate-300'}`}>
                      <Flag size={14}/> Flagged Only
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center mb-2 px-1 text-sm font-semibold text-slate-600">
                  <span>Showing {pagedTxns.length} of {filteredTxns.length} transactions</span>
                  {hasGap && <span className="bg-red-50 text-red-600 px-2 py-1 rounded border border-red-200">⚠️ Date Gap Detected!</span>}
                </div>

                {/* TABLE */}
                <div className="table-container bg-white">
                  <table className="bsa-table w-full">
                    <thead>
                      <tr>
                        <th width="10%">Date</th><th width="25%">Description</th><th width="12%">Category</th>
                        <th width="10%" className="num-col">Debit (Out)</th><th width="10%" className="num-col">Credit (In)</th>
                        <th width="10%" className="num-col">Balance</th><th width="9%">Source</th><th width="10%">Notes</th>
                        <th width="4%">🚩</th>{isEditorMode && <th width="4%"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedTxns.map(txn => {
                        const isCatClass = `cat-${txn.category.replace(/[^a-zA-Z0-9]/g, '-')}`;
                        return (
                          <tr key={txn.id} className={txn.isDuplicate ? 'bg-red-50 opacity-80' : ''}>
                            <td>{isEditorMode ? <input className="inline-input" value={txn.date} onChange={e=>patchRow(txn.id,'date',e.target.value)}/> : txn.date}</td>
                            <td>{isEditorMode ? <input className="inline-input" value={txn.description} onChange={e=>patchRow(txn.id,'description',e.target.value)}/> : txn.description}</td>
                            <td>
                              {isEditorMode ? (
                                <select className={`inline-select cat-chip ${isCatClass}`} value={txn.category} onChange={e=>patchRow(txn.id,'category',e.target.value)}>
                                  {ALL_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              ) : <span className={`cat-chip ${isCatClass}`}>{txn.category}</span>}
                            </td>
                            <td className="num-col val-debit">{txn.debit > 0 ? parseFloat(txn.debit).toLocaleString('en-IN') : '-'}</td>
                            <td className="num-col val-credit">{txn.credit > 0 ? parseFloat(txn.credit).toLocaleString('en-IN') : '-'}</td>
                            <td className="num-col font-bold">{parseFloat(txn.balance).toLocaleString('en-IN')}</td>
                            <td className="text-xs text-slate-500 truncate max-w-[100px]">{txn.sourceName}</td>
                            <td>{isEditorMode ? <input className="inline-input" value={txn.notes||''} placeholder="Note..." onChange={e=>patchRow(txn.id,'notes',e.target.value)}/> : txn.notes}</td>
                            <td className="text-center cursor-pointer" onClick={()=>patchRow(txn.id, 'flagged', !txn.flagged)}>
                              <span className={txn.flagged ? 'opacity-100' : 'opacity-20 grayscale'}>🚩</span>
                            </td>
                            {isEditorMode && <td><button onClick={()=>deleteTransaction(txn.id)} className="text-red-500 font-bold">✕</button></td>}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {pagedTxns.length < filteredTxns.length && (
                  <div className="text-center mt-6">
                    <button onClick={()=>setCurrentPage(p=>p+1)} className="px-6 py-2 bg-white border border-slate-300 rounded-full font-bold shadow-sm">Load More ↓</button>
                  </div>
                )}
              </div>
            )}

            {/* ── SUMMARY TAB ── */}
            {activeTab === 'summary' && (
              <div className="max-w-5xl mx-auto" id="pdf-export-area">
                <div className="grid grid-cols-4 gap-4 mb-6">
                  {(() => {
                    let inF=0, outF=0;
                    filteredTxns.forEach(t => { inF+=parseFloat(t.credit)||0; outF+=parseFloat(t.debit)||0; });
                    return (
                      <>
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><div className="text-xs font-bold text-slate-500 uppercase">Total Inflow</div><div className="text-2xl font-black text-green-600">₹{inF.toLocaleString('en-IN',{maximumFractionDigits:0})}</div></div>
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><div className="text-xs font-bold text-slate-500 uppercase">Total Outflow</div><div className="text-2xl font-black text-red-600">₹{outF.toLocaleString('en-IN',{maximumFractionDigits:0})}</div></div>
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><div className="text-xs font-bold text-slate-500 uppercase">Net Flow</div><div className={`text-2xl font-black ${(inF-outF)>=0?'text-green-600':'text-red-600'}`}>₹{(inF-outF).toLocaleString('en-IN',{maximumFractionDigits:0})}</div></div>
                        <div className="bg-slate-800 p-5 rounded-xl shadow-sm text-white"><div className="text-xs font-bold text-slate-400 uppercase">Current Balance</div><div className="text-2xl font-black">₹{parseFloat(filteredTxns[filteredTxns.length-1]?.balance||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</div></div>
                      </>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* ── ANALYTICS TAB ── */}
            {activeTab === 'analytics' && (
              <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-3 gap-6 mb-6">
                  <div className="col-span-2 bg-white p-6 rounded-xl border border-slate-200"><h3 className="font-bold mb-4">Monthly Cashflow</h3><canvas ref={barChartRef}></canvas></div>
                  <div className="col-span-1 bg-white p-6 rounded-xl border border-slate-200"><h3 className="font-bold mb-4">Expenses by Category</h3><canvas ref={donutChartRef}></canvas></div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200"><h3 className="font-bold mb-4">Running Balance</h3><canvas ref={lineChartRef} height="60"></canvas></div>
              </div>
            )}

          </main>
        </>
      )}

      {/* UPLOAD MODAL */}
      {showUpload && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white w-full max-w-md rounded-xl p-6 relative">
            <button onClick={()=>setShowUpload(false)} className="absolute top-4 right-4 text-slate-400 font-bold text-xl">&times;</button>
            <h2 className="text-xl font-bold mb-4">Add Statement</h2>
            {uploadState.uploading ? (
              <div className="text-center py-8"><div className="loader mx-auto mb-4 border-indigo-200 border-t-indigo-600"></div><p className="font-bold text-indigo-900">AI Engine Extracting Data...</p></div>
            ) : (
              <>
                <input type="text" placeholder="Statement Name (e.g. HDFC 2024)" value={uploadState.name} onChange={e=>setUploadState({...uploadState, name: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-md mb-4" />
                <div className="border-2 border-dashed border-indigo-200 bg-indigo-50 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-400" onClick={()=>document.getElementById('file-upload').click()}>
                  <div className="text-3xl mb-2">📄</div>
                  <p className="font-bold text-indigo-900">Select PDF File</p>
                  <input id="file-upload" type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-6 py-3 rounded-lg shadow-lg font-bold text-white z-50 ${toast.type==='error'?'bg-red-600':'bg-indigo-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}