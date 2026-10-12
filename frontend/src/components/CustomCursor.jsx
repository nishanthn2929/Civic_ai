import React, { useEffect, useState, useRef } from 'react';

/**
 * Sleek Cyber Neon Arrow Cursor
 * High-precision futuristic vector pointer with zero-lag tracking,
 * neon cyan/emerald bloom, and interactive targeting micro-animations.
 */
export default function CustomCursor() {
  const pointerRef = useRef(null);
  const trailRef = useRef(null);
  const clickRingsRef = useRef([]);

  const mousePos = useRef({ x: -100, y: -100 });
  const trailPos = useRef({ x: -100, y: -100 });
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [cursorType, setCursorType] = useState('default'); // 'default' | 'pointer' | 'text'
  const isTouchDevice = useRef(false);

  useEffect(() => {
    // Disable on primary touch devices
    if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
      isTouchDevice.current = true;
      return;
    }

    document.documentElement.classList.add('has-custom-cursor');

    const onMouseMove = (e) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
      if (!isVisible) setIsVisible(true);

      // Instant 1:1 hardware-accelerated pointer position (zero latency for clicks)
      if (pointerRef.current) {
        pointerRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      }

      // Check element under cursor for interactive hover states
      const target = e.target;
      if (!target) return;

      const isInteractive = target.closest(
        'button, a, input, select, textarea, [role="button"], .cursor-pointer, .nav-btn, .leaflet-interactive, .glass-card, [tabindex]:not([tabindex="-1"])'
      );

      if (isInteractive) {
        setIsHovered(true);
        if (target.closest('input, textarea')) {
          setCursorType('text');
        } else {
          setCursorType('pointer');
        }
      } else {
        setIsHovered(false);
        setCursorType('default');
      }
    };

    const onMouseDown = (e) => {
      setIsClicking(true);
      // Spawn subtle cyber click wave at click point
      const ring = document.createElement('div');
      ring.className = 'cyber-click-wave';
      ring.style.left = `${e.clientX}px`;
      ring.style.top = `${e.clientY}px`;
      document.body.appendChild(ring);
      setTimeout(() => {
        if (ring.parentNode) ring.parentNode.removeChild(ring);
      }, 500);
    };

    const onMouseUp = () => setIsClicking(false);
    const onMouseLeave = () => setIsVisible(false);
    const onMouseEnter = () => setIsVisible(true);

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    document.documentElement.addEventListener('mouseleave', onMouseLeave);
    document.documentElement.addEventListener('mouseenter', onMouseEnter);

    let animationFrameId;

    // Smooth soft-trailing cyber wake
    const render = () => {
      const ease = 0.24;
      trailPos.current.x += (mousePos.current.x - trailPos.current.y); // placeholder
      trailPos.current.x = trailPos.current.x + (mousePos.current.x - trailPos.current.x) * ease;
      trailPos.current.y = trailPos.current.y + (mousePos.current.y - trailPos.current.y) * ease;

      if (trailRef.current) {
        trailRef.current.style.transform = `translate3d(${trailPos.current.x}px, ${trailPos.current.y}px, 0)`;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      document.documentElement.classList.remove('has-custom-cursor');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.documentElement.removeEventListener('mouseleave', onMouseLeave);
      document.documentElement.removeEventListener('mouseenter', onMouseEnter);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isVisible]);

  if (isTouchDevice.current) return null;

  return (
    <div className={`cyber-cursor-root ${isVisible ? 'opacity-100' : 'opacity-0'} pointer-events-none transition-opacity duration-200`}>
      {/* 1. Soft Ambient Trailing Wake */}
      <div 
        ref={trailRef} 
        className={`cyber-cursor-trail ${isHovered ? 'trail-hover' : ''}`}
      />

      {/* 2. Precision Main Cyber Arrow Pointer */}
      <div
        ref={pointerRef}
        className={`cyber-cursor-arrow-wrapper ${isClicking ? 'is-clicking' : ''} ${isHovered ? 'is-hovering' : ''} type-${cursorType}`}
      >
        {cursorType === 'text' ? (
          // Cyber Text I-Beam Reticle
          <svg width="20" height="26" viewBox="0 0 20 26" fill="none" className="cyber-ibeam">
            <line x1="4" y1="2" x2="16" y2="2" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
            <line x1="10" y1="2" x2="10" y2="24" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
            <line x1="4" y1="24" x2="16" y2="24" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
            <circle cx="10" cy="13" r="2" fill="#34d399" />
          </svg>
        ) : (
          // Sleek Cyber Neon Arrow
          <svg 
            width="32" 
            height="32" 
            viewBox="0 0 32 32" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            className="cyber-arrow-svg"
          >
            <defs>
              <linearGradient id="arrowBorderGrad" x1="0" y1="0" x2="26" y2="26" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#67e8f9" />
                <stop offset="50%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
              <linearGradient id="arrowFillGrad" x1="2" y1="2" x2="20" y2="20" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#09111e" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#042f2e" stopOpacity="0.9" />
              </linearGradient>
              <filter id="neonArrowBloom" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="2.2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Glowing Secondary Targeting Chevron on Hover */}
            {isHovered && (
              <path
                d="M12 18L17 23M18 12L23 17"
                stroke="#34d399"
                strokeWidth="2"
                strokeLinecap="round"
                className="animate-pulse"
                opacity="0.9"
              />
            )}

            {/* Aerodynamic Cyber Arrow Shell */}
            <path
              d="M2 2L10.5 24L14.8 14.8L24 10.5L2 2Z"
              fill="url(#arrowFillGrad)"
              stroke="url(#arrowBorderGrad)"
              strokeWidth="1.8"
              strokeLinejoin="round"
              filter="url(#neonArrowBloom)"
            />

            {/* Internal Center Laser Spine */}
            <line 
              x1="2" 
              y1="2" 
              x2="14.8" 
              y2="14.8" 
              stroke="#ffffff" 
              strokeWidth="1.2" 
              strokeLinecap="round" 
              opacity="0.9"
            />

            {/* High-Precision Apex Diamond Tip */}
            <circle cx="2" cy="2" r="1.6" fill="#ffffff" />
            <circle cx="2" cy="2" r="2.8" stroke="#67e8f9" strokeWidth="0.8" opacity="0.8" />
          </svg>
        )}
      </div>
    </div>
  );
}
