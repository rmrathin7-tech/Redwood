import React, { useEffect, useState, useRef } from 'react';

export default function CommentSVGOverlay() {
  const [activeLine, setActiveLine] = useState(null); // { commentId, dataPath }
  const svgRef = useRef(null);
  const pathRef = useRef(null);
  const requestRef = useRef(null);

  // Listen for the active comment being broadcasted
  useEffect(() => {
    const handleActive = (e) => {
      if (e.detail?.commentId) {
        setActiveLine(e.detail);
      } else {
        setActiveLine(null);
      }
    };
    window.addEventListener('im-active-comment-changed', handleActive);
    return () => window.removeEventListener('im-active-comment-changed', handleActive);
  }, []);

  // 60FPS Animation Loop to sync the SVG string with scrolling
  const updateLine = () => {
    if (!activeLine || !pathRef.current) {
      requestRef.current = requestAnimationFrame(updateLine);
      return;
    }

    const blockEl = document.querySelector(`[data-block-path="${activeLine.dataPath}"]`);
    const cardEl = document.getElementById(`comment-card-${activeLine.commentId}`);

    if (blockEl && cardEl) {
      const bRect = blockEl.getBoundingClientRect();
      const cRect = cardEl.getBoundingClientRect();

      // Start Point: Right edge of the Workspace Block
      const startX = bRect.right;
      const startY = bRect.top + 30; // Attach 30px down from the top

      // End Point: Left edge of the Sidebar Comment Card
      const endX = cRect.left;
      const endY = cRect.top + 30; // Attach 30px down from the top

      // Bezier curve control points (makes the line curve beautifully)
      const cp1X = startX + 60;
      const cp1Y = startY;
      const cp2X = endX - 60;
      const cp2Y = endY;

      const pathString = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
      pathRef.current.setAttribute('d', pathString);
    } else {
      // Hide line if elements are off-screen or not found
      pathRef.current.setAttribute('d', '');
    }

    requestRef.current = requestAnimationFrame(updateLine);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(updateLine);
    return () => cancelAnimationFrame(requestRef.current);
  }, [activeLine]);

  if (!activeLine) return null;

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none', // Lets you click THROUGH the SVG
        zIndex: 9998, // Above Workspace, Below Sidebar
      }}
    >
      <path
        ref={pathRef}
        fill="none"
        stroke="#f59e0b" // Amber color to match your comments
        strokeWidth="2"
        strokeDasharray="5 5" // Dashed line style
        strokeLinecap="round"
        style={{
          filter: 'drop-shadow(0 2px 6px rgba(245,158,11,0.4))',
          transition: 'stroke 0.2s ease',
          animation: 'dash-flow 25s linear infinite' // Creates a flowing energy effect
        }}
      />
      <style>{`
        @keyframes dash-flow {
          to { stroke-dashoffset: -1000; }
        }
      `}</style>
    </svg>
  );
}
