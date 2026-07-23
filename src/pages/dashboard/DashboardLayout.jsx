import React, { useState, useEffect } from 'react';
import { Search, Kanban, Users, Sun, Moon, LogOut } from 'lucide-react';
import './Dashboard.css';

const DashboardLayout = ({ children }) => {
  // Initialize theme from local storage or default to dark
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('redwood-theme') || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('redwood-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className={`redwood-space ${theme}`} data-theme={theme}>
      {/* Living aurora mesh — three slow-drifting gradient blobs (pure CSS, no JS cost) */}
      <div className="space-background">
        <div className="blob-c" />
      </div>

      {/* Top Fixed Navigation Bar */}
      <header className="top-fixed-bar">
        <div className="brand-zone">
          <div className="brand-pulse"></div>
          <h1 className="brand-title">REDWOOD</h1>
        </div>

        <div className="search-zone">
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="Search memos, data, or projects..."
              className="global-search"
            />
            <span className="search-icon"><Search size={16} strokeWidth={2} /></span>
          </div>
        </div>

        <div className="actions-zone">
          <button className="glass-btn hover-glow">
            <Kanban size={15} /> Task Board
          </button>

          <button className="glass-btn hover-glow">
            <Users size={15} /> Users Panel
          </button>

          <div className="divider"></div>

          <button
            className="theme-toggle-btn glass-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
          </button>

          <button className="glass-btn logout-btn">
            <LogOut size={15} /> Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="workspace-main">
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;