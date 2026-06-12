import React, { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';

export default function ScoreAnalytics({ srlData, activeSchema, isScorePanelOpen, isDark = true }) {
  const T = useMemo(() => ({
    bg:         isDark ? '#060910' : '#f1f5f9',
    surface2:   isDark ? '#161b22' : '#f8fafc',
    border:     isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    text:       isDark ? '#f1f5f9' : '#0f172a',
    textMuted:  isDark ? '#64748b' : '#94a3b8',
    accent:     '#3b82f6',
    green:      '#10b981',
  }), [isDark]);

  // Calculate scores dynamically based on the schema and saved responses
  const analytics = useMemo(() => {
    let totalWeightedScore = 0;
    const moduleScores = [];

    if (!activeSchema || !srlData?.responses) return { totalWeightedScore, moduleScores };

    activeSchema.modules.forEach(module => {
      let moduleEarned = 0;
      let moduleMax = 0;

      module.questions.forEach(q => {
        if (q.type !== 'no-score') {
          moduleMax += (q.maxScore || 0);
          moduleEarned += (srlData.responses[q.id]?.score || 0);
        }
      });

      // Avoid division by zero
      const modulePercentage = moduleMax > 0 ? (moduleEarned / moduleMax) : 0;
      const weightedContribution = modulePercentage * module.weight;
      totalWeightedScore += weightedContribution;

      moduleScores.push({
        id: module.id,
        topic: module.topic,
        weight: module.weight,
        earned: moduleEarned,
        max: moduleMax,
        percentage: modulePercentage * 100,
        contribution: weightedContribution
      });
    });

    return { totalWeightedScore: totalWeightedScore.toFixed(1), moduleScores };
  }, [activeSchema, srlData]);

  return (
    <aside style={{
      width: isScorePanelOpen ? 320 : 0, minWidth: isScorePanelOpen ? 320 : 0,
      background: T.surface2, borderLeft: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column', transition: 'all 0.3s ease',
      overflow: 'hidden', zIndex: 20
    }}>
      <div style={{ padding: '20px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.text, fontWeight: 800, fontSize: '0.9rem' }}>
          <BarChart3 size={18} color={T.accent} /> Scoring Analytics
        </div>
      </div>
      
      <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
        {/* Total Score Widget */}
        <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '20px', textAlign: 'center', marginBottom: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          <div style={{ fontSize: '0.75rem', color: T.textMuted, textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>Weighted Average</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, color: T.green }}>
            {analytics.totalWeightedScore}<span style={{ fontSize: '1.2rem', color: T.textMuted }}>/100</span>
          </div>
        </div>

        {/* Module Breakdown */}
        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: T.textMuted, textTransform: 'uppercase', marginBottom: '16px' }}>Module Breakdown</div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {analytics.moduleScores.map(mod => (
            <div key={mod.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
                <span style={{ color: T.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>{mod.topic}</span>
                <span style={{ color: T.textMuted, flexShrink: 0 }}>W: {mod.weight}%</span>
              </div>
              <div style={{ height: '6px', background: T.bg, borderRadius: '3px', overflow: 'hidden', border: `1px solid ${T.border}` }}>
                <div style={{ height: '100%', width: `${mod.percentage}%`, background: T.accent, borderRadius: '3px', transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ fontSize: '0.65rem', color: T.textMuted, textAlign: 'right', marginTop: '4px' }}>
                {mod.earned} / {mod.max} pts ({mod.contribution.toFixed(1)} weighted)
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}