import React, { useEffect, useState, useRef } from 'react';

export default function CommentSVGOverlay() {
  const [activeLine, setActiveLine] = useState(null); // { commentId, dataPath }
  const [zIndex, setZIndex] = useState(9998); // Default above workspace, below standard sidebar
  
  const svgRef = useRef(null);
  const pathRef = useRef(null);
  const requestRef = useRef(null);
  
  // Caching references to bypass expensive DOM queries in the 60fps loop
  const sourceNodeRef = useRef(null);
  const cardNodeRef = useRef(null);

  // 1. Listen for the active comment being broadcasted
  useEffect(() => {
    const handleActive = (e) => {
      if (e.detail?.commentId) {
        setActiveLine(e.detail);
      } else {
        setActiveLine(null);
        if (pathRef.current) pathRef.current.setAttribute('d', '');
      }
    };
    window.addEventListener('im-active-comment-changed', handleActive);
    return () => window.removeEventListener('im-active-comment-changed', handleActive);
  }, []);

  // 2. High-Performance Coordinate Sync
  useEffect(() => {
    if (!activeLine) return;

    const updateLine = () => {
      // Re-acquire the target nodes ONLY if they don't exist or were unmounted 
      // (e.g., swapping from standard view to the Fullscreen Portal view)
      if (!cardNodeRef.current || !cardNodeRef.current.isConnected) {
        cardNodeRef.current = document.getElementById(`comment-card-${activeLine.commentId}`);
      }
      
      if (!sourceNodeRef.current || !sourceNodeRef.current.isConnected) {
        // First priority: Target the exact glowing text span
        let target = document.querySelector(`[data-comment-id="${activeLine.commentId}"]`);
        
        // Fallback: If the exact word isn't rendered, target the parent block
        if (!target) {
          target = document.querySelector(`[data-block-path="${activeLine.dataPath}"]`);
        }
        
        sourceNodeRef.current = target;

        // Dynamic Z-Index elevation:
        // If the exact text is inside the fullscreen portal, float the SVG over the portal
        if (sourceNodeRef.current) {
          const isFullscreen = !!sourceNodeRef.current.closest('.im-fs-shell');
          setZIndex(isFullscreen ? 100001 : 9998); 
        }
      }

      // Draw the line if both anchors are firmly in the DOM
      if (sourceNodeRef.current && cardNodeRef.current && pathRef.current) {
        const sRect = sourceNodeRef.current.getBoundingClientRect();
        const cRect = cardNodeRef.current.getBoundingClientRect();

        // Only calculate the curve if both elements are actually visible
        if (sRect.width > 0 && cRect.width > 0 && sRect.top !== 0) {
          
          // Target Point: Exact right side of the highlighted word/block, vertically centered
          const startX = sRect.right;
          const startY = sRect.top + (sRect.height / 2);

          // Dest Point: Left edge of the comment card, aligning with the profile picture
          const endX = cRect.left;
          const endY = cRect.top + 30; 

          // Bezier curve tension
          const cp1X = startX + 50;
          const cp1Y = startY;
          const cp2X = endX - 50;
          const cp2Y = endY;

          const pathString = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
          pathRef.current.setAttribute('d', pathString);
        } else {
          pathRef.current.setAttribute('d', '');
        }
      } else if (pathRef.current) {
         pathRef.current.setAttribute('d', '');
      }

      requestRef.current = requestAnimationFrame(updateLine);
    };

    // Initialize the loop
    requestRef.current = requestAnimationFrame(updateLine);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      sourceNodeRef.current = null;
      cardNodeRef.current = null;
    };
  }, [activeLine]);

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none', // Allows clicking through the SVG canvas
        zIndex: zIndex,
        transition: 'z-index 0.2s'
      }}
    >
      <path
        ref={pathRef}
        fill="none"
        stroke="#f59e0b" // Amber accent mapping to the active comment styles
        strokeWidth="2"
        strokeDasharray="5 5"
        strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 2px 6px rgba(245,158,11,0.4))' }}
      />
    </svg>
  );
}