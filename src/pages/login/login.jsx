import  { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../firebase.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [focused, setFocused] = useState(null);
  const [showPass, setShowPass] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const trailRef = useRef([]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setTransitioning(true);
      setTimeout(() => navigate('/'), 680);
    } catch {
      setError('Invalid credentials. Access denied.');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    let raf, time = 0, frameCount = 0;

    const PARTICLE_COUNT = 160;
    const CONNECT_DIST_SQ = 18000;
    const MOUSE_DIST = 130;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      buildGradients();
    };
    window.addEventListener('resize', resize);

    const onMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      trailRef.current.push({ x: e.clientX, y: e.clientY, age: 0 });
      if (trailRef.current.length > 14) trailRef.current.shift();
    };
    window.addEventListener('mousemove', onMouseMove);

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // ── PARTICLES ──
    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.55 + 0.15,
      twinkle: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      freq: 0.4 + Math.random() * 0.5,
    }));

    // ── ASTEROIDS ──
    const ASTEROID_COUNT = 7;
    const asteroids = Array.from({ length: ASTEROID_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 10 + 5,
      vx: (Math.random() - 0.5) * 0.55,
      vy: (Math.random() - 0.5) * 0.35,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.012,
      jagged: Array.from({ length: 10 }, () => 0.75 + Math.random() * 0.5),
      alpha: Math.random() * 0.25 + 0.08,
      trail: [],
    }));

    // ── SHOOTING STARS ──
    const shootingStars = [];
    let nextShot = 2000 + Math.random() * 3000;
    let lastTime = performance.now();

    function spawnShootingStar() {
      const startX = Math.random() * window.innerWidth * 0.7;
      const startY = Math.random() * window.innerHeight * 0.4;
      shootingStars.push({
        x: startX, y: startY,
        vx: 6 + Math.random() * 5,
        vy: 2 + Math.random() * 3,
        len: 60 + Math.random() * 80,
        alpha: 1,
        life: 0,
        maxLife: 40 + Math.random() * 20,
      });
    }

    let g1, g2, g3;
    function buildGradients() {
      g1 = ctx.createRadialGradient(canvas.width * 0.1, canvas.height * 0.05, 0, canvas.width * 0.1, canvas.height * 0.05, canvas.width * 0.6);
      g1.addColorStop(0, 'rgba(50,90,210,0.14)');
      g1.addColorStop(1, 'transparent');
      g2 = ctx.createRadialGradient(canvas.width * 0.9, canvas.height * 0.1, 0, canvas.width * 0.9, canvas.height * 0.1, canvas.width * 0.55);
      g2.addColorStop(0, 'rgba(100,50,200,0.12)');
      g2.addColorStop(1, 'transparent');
      g3 = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.95, 0, canvas.width * 0.5, canvas.height * 0.95, canvas.width * 0.4);
      g3.addColorStop(0, 'rgba(185,28,28,0.10)');
      g3.addColorStop(1, 'transparent');
    }
    buildGradients();

    const animate = (now) => {
      const dt = now - lastTime;
      lastTime = now;
      nextShot -= dt;
      if (nextShot <= 0) {
        spawnShootingStar();
        nextShot = 2500 + Math.random() * 4000;
      }

      time += 0.007;
      frameCount++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = g1; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = g2; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = g3; ctx.fillRect(0, 0, canvas.width, canvas.height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // ── Particle physics ──
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const dx = p.x - mx, dy = p.y - my;
        const dSq = dx * dx + dy * dy;
        if (dSq < MOUSE_DIST * MOUSE_DIST) {
          const d = Math.sqrt(dSq);
          const f = (MOUSE_DIST - d) / MOUSE_DIST;
          p.vx += (dx / d) * f * 0.65;
          p.vy += (dy / d) * f * 0.65;
        }
        p.vx *= 0.97; p.vy *= 0.97;
        p.x += p.vx; p.y += p.vy;
        p.twinkle += 0.018;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      }

      // ── Connections ──
      if (frameCount % 2 === 0) {
        for (let a = 0; a < particles.length; a++) {
          for (let b = a + 1; b < particles.length; b++) {
            const dx = particles[a].x - particles[b].x;
            const dy = particles[a].y - particles[b].y;
            const dSq = dx * dx + dy * dy;
            if (dSq < CONNECT_DIST_SQ) {
              const dma = Math.hypot(particles[a].x - mx, particles[a].y - my);
              const dmb = Math.hypot(particles[b].x - mx, particles[b].y - my);
              const near = dma < MOUSE_DIST || dmb < MOUSE_DIST;
              const wave = 0.5 + 0.5 * Math.sin(time * particles[a].freq + particles[a].phase);
              const op = near
                ? (1 - dSq / CONNECT_DIST_SQ) * 0.36
                : (1 - dSq / CONNECT_DIST_SQ) * 0.16 * (0.5 + 0.5 * wave);
              ctx.strokeStyle = near ? `rgba(185,28,28,${op})` : `rgba(180,215,255,${op})`;
              ctx.lineWidth = near ? 1.1 : 0.85;
              ctx.beginPath();
              ctx.moveTo(particles[a].x, particles[a].y);
              ctx.lineTo(particles[b].x, particles[b].y);
              ctx.stroke();
              if (dma < MOUSE_DIST && dma < dmb) {
                const pull = (1 - dma / MOUSE_DIST) * 0.22;
                ctx.strokeStyle = `rgba(185,28,28,${pull})`;
                ctx.lineWidth = 0.6;
                ctx.beginPath();
                ctx.moveTo(particles[a].x, particles[a].y);
                ctx.lineTo(mx, my);
                ctx.stroke();
              }
            }
          }
        }
      }

      // ── Stars ──
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const a = p.alpha * (0.6 + Math.sin(p.twinkle) * 0.4);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210,230,255,${a})`;
        ctx.fill();
      }

      // ── Mouse trail ──
      if (trailRef.current.length > 0) {
        for (let i = 0; i < trailRef.current.length; i++) {
          const pt = trailRef.current[i];
          pt.age++;
          const progress = i / trailRef.current.length;
          const alpha = progress * 0.28 * (1 - pt.age / 50);
          if (alpha > 0) {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, (1 - progress) * 2.2 + 0.4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(185,28,28,${alpha})`;
            ctx.fill();
          }
        }
        trailRef.current = trailRef.current.filter(pt => pt.age < 50);
      }

      // ── Asteroids ──
      for (const ast of asteroids) {
        ast.trail.push({ x: ast.x, y: ast.y });
        if (ast.trail.length > 18) ast.trail.shift();

        for (let t = 0; t < ast.trail.length; t++) {
          const tp = ast.trail[t];
          const ta = (t / ast.trail.length) * ast.alpha * 0.35;
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, ast.r * 0.15 * (t / ast.trail.length), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(185,100,60,${ta})`;
          ctx.fill();
        }

        ast.x += ast.vx; ast.y += ast.vy; ast.rot += ast.rotSpeed;
        if (ast.x < -30) ast.x = canvas.width + 30;
        if (ast.x > canvas.width + 30) ast.x = -30;
        if (ast.y < -30) ast.y = canvas.height + 30;
        if (ast.y > canvas.height + 30) ast.y = -30;

        const adx = ast.x - mx, ady = ast.y - my;
        const adSq = adx * adx + ady * ady;
        if (adSq < 160 * 160) {
          const ad = Math.sqrt(adSq);
          ast.vx += (adx / ad) * 0.4;
          ast.vy += (ady / ad) * 0.4;
        }
        ast.vx *= 0.995; ast.vy *= 0.995;

        ctx.save();
        ctx.translate(ast.x, ast.y);
        ctx.rotate(ast.rot);
        ctx.beginPath();
        const step = (Math.PI * 2) / ast.jagged.length;
        for (let j = 0; j < ast.jagged.length; j++) {
          const angle = j * step;
          const rr = ast.r * ast.jagged[j];
          j === 0
            ? ctx.moveTo(Math.cos(angle) * rr, Math.sin(angle) * rr)
            : ctx.lineTo(Math.cos(angle) * rr, Math.sin(angle) * rr);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(200,140,90,${ast.alpha})`;
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.fillStyle = `rgba(100,55,25,${ast.alpha * 0.28})`;
        ctx.fill();
        ctx.restore();
      }

      // ── Shooting stars ──
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const s = shootingStars[i];
        s.x += s.vx; s.y += s.vy; s.life++;
        s.alpha = Math.max(0, 1 - s.life / s.maxLife);
        const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * (s.len / s.vx), s.y - s.vy * (s.len / s.vx));
        grad.addColorStop(0, `rgba(255,255,255,${s.alpha * 0.9})`);
        grad.addColorStop(0.3, `rgba(200,210,255,${s.alpha * 0.5})`);
        grad.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * (s.len / Math.sqrt(s.vx * s.vx + s.vy * s.vy)), s.y - s.vy * (s.len / Math.sqrt(s.vx * s.vx + s.vy * s.vy)));
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (s.life >= s.maxLife) shootingStars.splice(i, 1);
      }

      raf = requestAnimationFrame(animate);
    };
    animate(performance.now());

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      className={transitioning ? 'login-root login-exit' : 'login-root'}
      style={{
        minHeight: '100vh', width: '100vw', overflow: 'hidden',
        backgroundColor: '#060810',
        fontFamily: '"Inter","system-ui",-apple-system,sans-serif',
        color: '#e6edf3', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }

        @keyframes fadeUp   { from { opacity:0; transform:translateY(22px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse-dot { 0%,100% { box-shadow:0 0 0 0 rgba(185,28,28,0.7); } 50% { box-shadow:0 0 0 9px rgba(185,28,28,0); } }
        @keyframes spin     { to { transform:rotate(360deg); } }
        @keyframes shimmer  { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
        @keyframes errorShake { 0%,100% { transform:translateX(0); } 20% { transform:translateX(-6px); } 40% { transform:translateX(6px); } 60% { transform:translateX(-4px); } 80% { transform:translateX(4px); } }

        /* ── AURORA BANDS ── */
        .aurora-band {
          position: absolute;
          width: 200%;
          left: -50%;
          border-radius: 50%;
          filter: blur(60px);
          mix-blend-mode: screen;
          opacity: 0;
          animation: auroraDrift 14s ease-in-out infinite;
        }
        .aurora-1 {
          height: 280px; top: -80px;
          background: linear-gradient(90deg, transparent 0%, rgba(20,200,160,0.13) 30%, rgba(60,100,220,0.11) 60%, transparent 100%);
          animation-duration: 16s; animation-delay: 0s;
        }
        .aurora-2 {
          height: 200px; top: 60px;
          background: linear-gradient(90deg, transparent 10%, rgba(120,60,255,0.10) 40%, rgba(20,180,180,0.09) 70%, transparent 100%);
          animation-duration: 20s; animation-delay: -6s;
        }
        .aurora-3 {
          height: 150px; top: 10px;
          background: linear-gradient(90deg, transparent 20%, rgba(185,28,28,0.08) 50%, rgba(100,40,200,0.07) 80%, transparent 100%);
          animation-duration: 12s; animation-delay: -3s;
        }
        @keyframes auroraDrift {
          0%   { opacity: 0;   transform: translateX(-8%) scaleY(0.85); }
          15%  { opacity: 1; }
          50%  { opacity: 0.7; transform: translateX(6%)  scaleY(1.1); }
          85%  { opacity: 1; }
          100% { opacity: 0;   transform: translateX(-8%) scaleY(0.85); }
        }

        /* ── LOGIN EXIT TRANSITION ── */
        .login-exit .login-card {
          animation: loginExit 0.65s cubic-bezier(0.4,0,1,1) forwards !important;
        }
        .login-exit canvas {
          animation: canvasFade 0.65s ease forwards !important;
        }
        .login-exit .aurora-band {
          animation: auroraSurge 0.65s ease forwards !important;
        }
        @keyframes loginExit {
          0%   { opacity:1; transform:scale(1)     translateY(0); }
          40%  { opacity:1; transform:scale(1.018) translateY(-6px); }
          100% { opacity:0; transform:scale(0.94)  translateY(24px); }
        }
        @keyframes canvasFade {
          0%   { opacity:1; }
          100% { opacity:0; filter:brightness(2.5); }
        }
        @keyframes auroraSurge {
          0%   { opacity:0.5; }
          60%  { opacity:1.0; transform:scaleY(2.5) translateX(4%); }
          100% { opacity:0; }
        }

        .login-card { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }

        .login-input {
          width: 100%; padding: 14px 16px;
          border-radius: 11px; border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03); color: #f1f5f9;
          font-size: 0.92rem; font-family: inherit; outline: none;
          transition: all 0.22s ease;
        }
        .login-input::placeholder { color: rgba(148,163,184,0.5); }
        .login-input:focus {
          border-color: rgba(185,28,28,0.55);
          background: rgba(255,255,255,0.055);
          box-shadow: 0 0 0 3px rgba(185,28,28,0.13);
        }
        .login-input:hover:not(:focus) {
          border-color: rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.045);
        }

        .login-btn {
          width: 100%; padding: 14px; border-radius: 11px; border: none;
          background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%);
          color: #fff; font-size: 0.88rem; font-weight: 700; font-family: inherit;
          letter-spacing: 0.12em; cursor: pointer; transition: all 0.2s ease;
          box-shadow: 0 4px 20px rgba(185,28,28,0.35), 0 1px 0 rgba(255,255,255,0.08) inset;
          position: relative; overflow: hidden;
        }
        .login-btn::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent);
          background-size: 400px 100%; opacity: 0; transition: opacity 0.2s;
        }
        .login-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(185,28,28,0.5), 0 1px 0 rgba(255,255,255,0.1) inset;
          filter: brightness(1.1);
        }
        .login-btn:hover::after { opacity:1; animation: shimmer 1.2s linear infinite; }
        .login-btn:active:not(:disabled) { transform: translateY(0); }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .input-label {
          font-size: 0.72rem; font-weight: 700; letter-spacing: 0.09em;
          text-transform: uppercase; color: rgba(148,163,184,0.7);
          margin-bottom: 6px; display: block; transition: color 0.2s;
        }
        .input-wrap:focus-within .input-label { color: rgba(185,28,28,0.9); }
        .error-box { animation: errorShake 0.4s ease; }
        .divider-line { flex:1; height:1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent); }
        .split-glow {
          position: absolute; left:50%; top:50%; transform:translate(-50%,-50%);
          width:1px; height:55%;
          background: linear-gradient(to bottom, transparent, rgba(185,28,28,0.25) 40%, rgba(185,28,28,0.25) 60%, transparent);
        }
      `}</style>

      {/* Canvas background */}
      <canvas
        ref={canvasRef}
        style={{ position:'fixed', inset:0, width:'100%', height:'100%', zIndex:0, pointerEvents:'none' }}
      />

      {/* Aurora bands */}
      <div style={{ position:'fixed', inset:0, zIndex:1, pointerEvents:'none', overflow:'hidden' }}>
        <div className="aurora-band aurora-1" />
        <div className="aurora-band aurora-2" />
        <div className="aurora-band aurora-3" />
      </div>

      {/* Glass card */}
      <div className="login-card" style={{
        position:'relative', zIndex:10,
        width:'100%', maxWidth:'860px',
        margin:'0 24px',
        display:'flex',
        borderRadius:'20px',
        overflow:'hidden',
        background:'rgba(10,12,20,0.82)',
        backdropFilter:'blur(28px)',
        WebkitBackdropFilter:'blur(28px)',
        border:'1px solid rgba(255,255,255,0.07)',
        boxShadow:'0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset',
        minHeight:'520px',
      }}>

        {/* ── LEFT BRAND PANEL ── */}
        <div style={{
          flex:'0 0 42%', padding:'52px 44px',
          display:'flex', flexDirection:'column', justifyContent:'space-between',
          position:'relative',
          borderRight:'1px solid rgba(255,255,255,0.05)',
          background:'linear-gradient(145deg, rgba(20,15,30,0.6) 0%, rgba(10,10,18,0.4) 100%)',
          overflow:'hidden',
        }}>
          <div style={{ position:'absolute', top:'-60px', left:'-60px', width:'300px', height:'300px', borderRadius:'50%', background:'radial-gradient(circle, rgba(185,28,28,0.12) 0%, transparent 70%)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:'-80px', right:'-40px', width:'280px', height:'280px', borderRadius:'50%', background:'radial-gradient(circle, rgba(80,60,200,0.10) 0%, transparent 70%)', pointerEvents:'none' }} />

          <div style={{ position:'relative', zIndex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'36px' }}>
              <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:'#b91c1c', animation:'pulse-dot 2s ease infinite', flexShrink:0 }} />
              <span style={{ fontSize:'0.75rem', fontWeight:'700', letterSpacing:'0.2em', color:'rgba(148,163,184,0.6)', textTransform:'uppercase' }}>Secure Portal</span>
            </div>
            <h1 style={{ fontSize:'clamp(2.4rem,4vw,3.2rem)', fontWeight:'800', letterSpacing:'0.12em', margin:'0 0 10px', lineHeight:1, color:'#f1f5f9' }}>
              RED<span style={{ color:'#b91c1c' }}>WOOD</span>
            </h1>
            <div style={{ width:'36px', height:'3px', background:'linear-gradient(90deg,#b91c1c,#7f1d1d)', borderRadius:'2px', marginBottom:'18px', boxShadow:'0 0 10px rgba(185,28,28,0.5)' }} />
            <p style={{ color:'rgba(148,163,184,0.75)', fontSize:'0.9rem', lineHeight:1.6, margin:0, maxWidth:'220px' }}>
              Strategic Intelligence System for Investment Professionals.
            </p>
          </div>

          <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', gap:'12px' }}>
            {[
              { icon:'⬡', text:'Investment Memo Engine' },
              { icon:'◈', text:'Financial Statement Analysis' },
              { icon:'◉', text:'Real-Time Collaboration' },
            ].map((f, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', animation:`fadeUp 0.5s ${0.15 + i * 0.1}s both ease` }}>
                <span style={{ color:'#b91c1c', fontSize:'0.8rem', opacity:0.8 }}>{f.icon}</span>
                <span style={{ fontSize:'0.8rem', color:'rgba(148,163,184,0.65)', fontWeight:'500' }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="split-glow" />

        {/* ── RIGHT FORM PANEL ── */}
        <div style={{ flex:1, padding:'52px 44px', display:'flex', flexDirection:'column', justifyContent:'center', position:'relative' }}>

          <div style={{ marginBottom:'36px', animation:'fadeUp 0.5s 0.1s both ease' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
              <div className="divider-line" style={{ flex:'none', width:'28px' }} />
              <span style={{ fontSize:'0.7rem', fontWeight:'700', letterSpacing:'0.14em', textTransform:'uppercase', color:'rgba(148,163,184,0.5)' }}>Authentication Required</span>
            </div>
            <h2 style={{ fontSize:'1.65rem', fontWeight:'800', margin:0, color:'#f1f5f9', letterSpacing:'-0.02em' }}>Secure Access</h2>
            <p style={{ margin:'6px 0 0', fontSize:'0.85rem', color:'rgba(100,116,139,0.85)' }}>Sign in to your workspace</p>
          </div>

          <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:'18px' }}>

            {/* Email */}
            <div className="input-wrap" style={{ animation:'fadeUp 0.5s 0.18s both ease' }}>
              <label className="input-label">Email Address</label>
              <div style={{ position:'relative' }}>
                <svg style={{ position:'absolute', left:'14px', top:'50%', transform:'translateY(-50%)', opacity: focused==='email' ? 0.7 : 0.3, transition:'opacity 0.2s', pointerEvents:'none' }}
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
                <input type="email" className="login-input" placeholder="you@company.com" value={email}
                  onChange={e => setEmail(e.target.value)} onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                  style={{ paddingLeft:'42px' }} required />
              </div>
            </div>

            {/* Password */}
            <div className="input-wrap" style={{ animation:'fadeUp 0.5s 0.24s both ease' }}>
              <label className="input-label">Password</label>
              <div style={{ position:'relative' }}>
                <svg style={{ position:'absolute', left:'14px', top:'50%', transform:'translateY(-50%)', opacity: focused==='password' ? 0.7 : 0.3, transition:'opacity 0.2s', pointerEvents:'none' }}
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input type={showPass ? 'text' : 'password'} className="login-input" placeholder="••••••••••" value={password}
                  onChange={e => setPassword(e.target.value)} onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                  style={{ paddingLeft:'42px', paddingRight:'44px' }} required />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  style={{ position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'rgba(148,163,184,0.45)', padding:'4px', borderRadius:'4px', transition:'color 0.2s', lineHeight:0 }}
                  onMouseEnter={e => e.currentTarget.style.color='rgba(148,163,184,0.9)'}
                  onMouseLeave={e => e.currentTarget.style.color='rgba(148,163,184,0.45)'}
                  title={showPass ? 'Hide password' : 'Show password'}>
                  {showPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="error-box" style={{
                display:'flex', alignItems:'center', gap:'9px',
                padding:'11px 14px', borderRadius:'9px',
                background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)',
                color:'#f87171', fontSize:'0.83rem', fontWeight:'500',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink:0 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <div style={{ animation:'fadeUp 0.5s 0.3s both ease', marginTop:'4px' }}>
              <button type="submit" className="login-btn" disabled={isLoading}>
                {isLoading ? (
                  <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'9px' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation:'spin 0.7s linear infinite' }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    AUTHENTICATING...
                  </span>
                ) : (
                  <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}>
                    ENTER SYSTEM
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </span>
                )}
              </button>
            </div>

          </form>

          <div style={{ marginTop:'32px', display:'flex', alignItems:'center', gap:'12px', animation:'fadeIn 0.6s 0.5s both ease' }}>
            <div className="divider-line" />
            <span style={{ fontSize:'0.7rem', color:'rgba(100,116,139,0.5)', whiteSpace:'nowrap', fontWeight:'500', letterSpacing:'0.06em' }}>
              REDWOOD · {new Date().getFullYear()}
            </span>
            <div className="divider-line" />
          </div>

        </div>
      </div>
    </div>
  );
}
