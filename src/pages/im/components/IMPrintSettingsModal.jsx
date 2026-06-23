import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Check, Trash2, Image as ImageIcon, Loader2, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { db } from '../../../firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const storage = getStorage();

const PRESET_COLORS = ['#8A1538', '#1e293b', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#000000', '#ffffff'];

export default function IMPrintSettingsModal({ projectId, currentConfig, onSave, onClose }) {
  const [config, setConfig] = useState({
    brandName: 'Redwood Partners',
    brandColor: '#8A1538',
    brandNameColor: '#8A1538',
    logoUrl: '',
    coverAlignment: 'center',
    sectionTitleColor: '#2563eb',
    // 3-ZONE HEADERS
    headerLeft: 'INVESTMENT MEMORANDUM',
    headerLeftColor: '#000000',
    headerCenter: '',
    headerCenterColor: '#000000',
    headerRight: 'REDWOOD PARTNERS',
    headerRightColor: '#8A1538',
    // 3-ZONE FOOTERS
    footerLeft: '',
    footerLeftColor: '#000000',
    footerCenter: 'Confidential',
    footerCenterColor: '#000000',
    footerRight: '',
    footerRightColor: '#000000',
    evalParametersText: 'This IM serves to project a detailed picture of the company to the Investor\'s various Investment Committees, supporting meeting the investment objectives and decision-making.\n\nThe IM report addresses the following scope:\n\nFirst Connect:\n• Conduct initial discussions to understand the background, problem statement, services provided, team strength, etc.\n• Assess the entrepreneur\'s commitment to the business.\n• Make a preliminary decision on the fundability of the project.\n\nBusiness, Domain, and Opportunity Analysis:\n• Analyse profit and loss, costing, HR costs, margins, etc.\n• Assess the startup\'s domain, competitive landscape, strength relative to competitors, and market opportunities.\n• Evaluate claims on Unique Selling Proposition (USP) and the scalability of the solution.\n• Analyse the business model, map the business plan, and reach a consensus on the need for funding in relation to the business plan.\n\nFund Quantum Sizing:\n• Analyze capital and operational expenditures.\n• Determine the funding quantum based on business plan analysis and discussions with the promoter.\n\nThe information contained in this IM is strictly confidential and is meant to serve only as an analytical document for the consideration of the Investor\'s various Investment Committees, supporting preliminary decision-making with respect to in-principle investment decisions.\n\nThe final investment decision will need to be made by the Investor in conjunction with the satisfactory completion of financial and legal due diligence processes by the startup.\n\nThe Investor\'s decision is final notwithstanding the recommendations that form part of this IM.',
    ...currentConfig,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!projectId) return;
    const loadSettings = async () => {
      const d = await getDoc(doc(db, 'projects', projectId, 'settings', 'print'));
      if (d.exists()) setConfig(prev => ({ ...prev, ...d.data() }));
    };
    loadSettings();
  }, [projectId]);

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !projectId) return;
    setIsUploading(true);
    try {
      const path = `im-uploads/${projectId}-logo-${Date.now()}-${file.name}`;
      const snap = await uploadBytes(storageRef(storage, path), file);
      const url = await getDownloadURL(snap.ref);
      setConfig(prev => ({ ...prev, logoUrl: url }));
    } catch (err) {
      console.error('Logo upload failed:', err);
      alert(`Upload Failed: ${err.message}`);
    }
    setIsUploading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (projectId) await setDoc(doc(db, 'projects', projectId, 'settings', 'print'), config, { merge: true });
      onSave(config);
      onClose();
    } catch (err) {
      alert('Failed to save print settings.');
    }
    setIsSaving(false);
  };

  const ZoneInput = ({ label, textKey, colorKey }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', width: '50px', flexShrink: 0 }}>{label}</label>
      <input
        type="text"
        value={config[textKey]}
        onChange={e => setConfig({ ...config, [textKey]: e.target.value })}
        placeholder="Leave blank to hide"
        style={{ flex: 1, padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
      />
      <input
        type="color"
        value={config[colorKey]}
        onChange={e => setConfig({ ...config, [colorKey]: e.target.value })}
        style={{ width: '28px', height: '28px', padding: 0, border: 'none', cursor: 'pointer', flexShrink: 0 }}
      />
    </div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10001,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '680px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>

        {/* Modal Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Print Settings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* 1. Cover Page & Branding */}
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '16px' }}>
              1. Cover Page &amp; Branding
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {/* Logo */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Brand Logo</label>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => fileInputRef.current?.click()} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isUploading ? <Loader2 size={14} className="spin" /> : <ImageIcon size={14} />}
                    {isUploading ? 'Uploading...' : 'Upload Logo'}
                  </button>
                  {config.logoUrl && (
                    <button onClick={() => setConfig({ ...config, logoUrl: '' })} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Trash2 size={12} /> Remove
                    </button>
                  )}
                  {config.logoUrl && <img src={config.logoUrl} alt="logo preview" style={{ height: '32px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #e2e8f0' }} />}
                </div>
              </div>

              {/* Brand Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Cover Brand Name</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={config.brandName}
                    onChange={e => setConfig({ ...config, brandName: e.target.value })}
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <span style={{ fontSize: '9px', color: '#94a3b8', whiteSpace: 'nowrap' }}>Color</span>
                    <input type="color" value={config.brandNameColor || config.brandColor} onChange={e => setConfig({ ...config, brandNameColor: e.target.value })} style={{ width: '32px', height: '32px', padding: 0, border: 'none', cursor: 'pointer' }} />
                  </div>
                </div>
              </div>

              {/* Cover Alignment */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Cover Alignment</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { val: 'left', icon: <AlignLeft size={16} /> },
                    { val: 'center', icon: <AlignCenter size={16} /> },
                    { val: 'right', icon: <AlignRight size={16} /> },
                  ].map(({ val, icon }) => (
                    <button
                      key={val}
                      onClick={() => setConfig({ ...config, coverAlignment: val })}
                      style={{
                        padding: '8px 14px', borderRadius: '6px', border: '1px solid',
                        borderColor: config.coverAlignment === val ? '#2563eb' : '#cbd5e1',
                        background: config.coverAlignment === val ? '#eff6ff' : '#f8fafc',
                        color: config.coverAlignment === val ? '#2563eb' : '#475569',
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                      }}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Brand Accent Color */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Brand Accent Color</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setConfig({ ...config, brandColor: c })}
                      style={{
                        width: '24px', height: '24px', borderRadius: '50%', background: c, cursor: 'pointer',
                        border: config.brandColor === c ? '2px solid #2563eb' : '1px solid #cbd5e1',
                        outline: config.brandColor === c ? '2px solid #bfdbfe' : 'none',
                      }}
                    />
                  ))}
                  <input type="color" value={config.brandColor} onChange={e => setConfig({ ...config, brandColor: e.target.value })} style={{ width: '28px', height: '28px', padding: 0, border: 'none', cursor: 'pointer' }} />
                </div>
              </div>
            </div>
          </div>

          {/* 2. Headers & Footers */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>2. Headers &amp; Footers (3-Zone)</h3>
            </div>
            <div style={{ padding: '12px', background: '#fffbeb', borderLeft: '4px solid #f59e0b', borderRadius: '4px', marginBottom: '16px', fontSize: '13px', color: '#b45309' }}>
              Page numbers are automatically added by Puppeteer in the right footer zone during PDF generation.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '12px', color: '#334155' }}>Header Zones</div>
                <ZoneInput label="Left"   textKey="headerLeft"   colorKey="headerLeftColor" />
                <ZoneInput label="Center" textKey="headerCenter" colorKey="headerCenterColor" />
                <ZoneInput label="Right"  textKey="headerRight"  colorKey="headerRightColor" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#334155', marginBottom: '12px' }}>Footer Zones</div>
                <ZoneInput label="Left"   textKey="footerLeft"   colorKey="footerLeftColor" />
                <ZoneInput label="Center" textKey="footerCenter" colorKey="footerCenterColor" />
                <ZoneInput label="Right"  textKey="footerRight"  colorKey="footerRightColor" />
              </div>
            </div>
          </div>

          {/* 3. Section Titles Color (typography is hardcoded — only colour is user-controlled) */}
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '16px' }}>
              3. Section Titles Colour
            </h3>
            <div style={{ padding: '10px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '12px', color: '#0369a1', marginBottom: '16px' }}>
              Typography is fixed: <strong>Open Sans</strong> · Heading 12pt Bold · Sub-heading 11pt Bold · Body 10pt · Line spacing 1.5 (1.0 for numeric tables) · Normal margins · Left alignment.
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="color"
                value={config.sectionTitleColor}
                onChange={e => setConfig({ ...config, sectionTitleColor: e.target.value })}
                style={{ width: '40px', height: '40px', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '6px' }}
              />
              <span style={{ fontSize: '13px', color: '#475569', fontFamily: 'monospace' }}>{config.sectionTitleColor}</span>
              <div style={{ display: 'flex', gap: '6px', marginLeft: '8px', flexWrap: 'wrap' }}>
                {PRESET_COLORS.filter(c => c !== '#ffffff').map(c => (
                  <button
                    key={c}
                    onClick={() => setConfig({ ...config, sectionTitleColor: c })}
                    style={{
                      width: '22px', height: '22px', borderRadius: '50%', background: c, cursor: 'pointer',
                      border: config.sectionTitleColor === c ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 4. Evaluation Parameters Text */}
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '16px' }}>
              4. Evaluation Parameters Text
            </h3>
            <textarea
              value={config.evalParametersText}
              onChange={e => setConfig({ ...config, evalParametersText: e.target.value })}
              style={{ width: '100%', minHeight: '150px', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', fontFamily: "'Open Sans', sans-serif", resize: 'vertical' }}
            />
          </div>

        </div>

        {/* Modal Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={isSaving || isUploading} style={{ padding: '8px 16px', background: '#2563eb', border: 'none', borderRadius: '6px', fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: (isSaving || isUploading) ? 0.6 : 1 }}>
            {isSaving ? <Loader2 size={16} className="spin" /> : <Check size={16} />} Save &amp; Apply
          </button>
        </div>

      </div>
    </div>
  );
}
