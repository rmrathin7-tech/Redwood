import React, { useState, useEffect } from 'react';
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
    <div className={`redwood-space ${theme}`}>
      {/* The AliveCanvas component will eventually mount inside this background layer. 
        For now, it acts as the animated gradient base.
      */}
      <div className="space-background"></div>
      
      {/* Top Fixed Navigation Bar */}
      <header className="top-fixed-bar">
        <div className="brand-zone">
          <div className="brand-pulse"></div>
          <h1 className="brand-title">REDWOOD</h1>
        </div>

        <div className="search-zone">
          <div className="search-wrapper">
            <span className="search-icon">🔍</span>
            <input 
              type="text" 
              placeholder="Search memos, data, or projects IF..." 
              className="global-search" 
            />
          </div>
        </div>

        <div className="actions-zone">
          <button className="glass-btn hover-glow">
            <span className="btn-icon">🗂</span> Task Board
          </button>
          
          <button className="glass-btn hover-glow">
            <span className="btn-icon">👥</span> Users Panel
          </button>

          <div className="divider"></div>

          <button 
            className="theme-toggle-btn glass-btn" 
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <button className="glass-btn logout-btn">
            Logout
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