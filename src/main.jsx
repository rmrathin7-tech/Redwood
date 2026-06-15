import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Login from './pages/login/login.jsx';
import Dashboard from './pages/dashboard/Dashboard.jsx';
import ModuleHub from './pages/modulehub/ModuleHub.jsx';
import './pages/dashboard/Dashboard.css';

// IM (Investment Memo)
import IMSettings from './pages/im/IMSettings.jsx';
import IMWorkspace from './pages/im/IMWorkspace.jsx';

// FSA (Financial Analysis)
import FSAWorkspace from './pages/fsa/FSAWorkspace.jsx';
import FSASettings from './pages/fsa/FSASettings.jsx';

// FC (First Connect)
import FCWorkspace from './pages/fc/FCWorkspace.jsx';
import FCSettings from './pages/fc/FCSettings.jsx';

// BSA (Bank Statement Analysis) - ADDED HERE
import BSAWorkspace from './pages/bsa/BSAWorkspace.jsx';

// Profiling Module
import ProfilingWorkspace from './pages/profiling/ProfilingWorkspace.jsx';

import SRLHub from './pages/srl/SRLHub.jsx';
import SRLSettings from './pages/srl/SRLSettings.jsx';
import PublicSRLView from './pages/srl/PublicSRLView.jsx';
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="/module-hub" element={<ModuleHub />} />

        {/* IM Routes */}
        <Route path="/im-settings" element={<IMSettings />} />
        <Route path="/im" element={<IMWorkspace />} />

        {/* FSA Routes */}
        <Route path="/fsa" element={<FSAWorkspace />} />
        <Route path="/fsa-settings" element={<FSASettings />} />
        
        {/* FC Routes */}
        <Route path="/fc" element={<FCWorkspace />} />
        <Route path="/fc-settings" element={<FCSettings />} />

        {/* BSA Route - ADDED HERE */}
        <Route path="/bsa" element={<BSAWorkspace />} />

        {/* Profiling Route */}
        <Route path="/profiling" element={<ProfilingWorkspace />} />

        {/* SRL Routes */}
        <Route path="/srl-hub" element={<SRLHub />} />
        <Route path="/srl-settings" element={<SRLSettings />} />
        <Route path="/public/srl/:srlId" element={<PublicSRLView />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);