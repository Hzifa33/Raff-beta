import React, { useEffect, useState } from 'react';

export function IntroSplashScreen({ onFinish }: { onFinish: () => void }) {
  // Cinematic choreographic stages:
  // 0: Swoop in from corner -> center
  // 1: Settle in center & expand radiant aura
  // 2: Shift smoothly to the side
  // 3: Reveal App Name ("رَفّ")
  // 4: Reveal Version Badge ("4.0.0")
  // 5: Reveal Tagline word
  // 6: Reveal Developer Word ("تطوير:")
  // 7: Reveal Developer Logo (Monogram)
  // 8: Reveal Developer Name ("Hzifa33")
  // 9: Closing fade-out
  const [animStep, setAnimStep] = useState(0);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setAnimStep(1), 600),   // Settles in center
      setTimeout(() => setAnimStep(2), 950),   // Glides gracefully to the side
      setTimeout(() => setAnimStep(3), 1200),  // Name "رَفّ" reveals
      setTimeout(() => setAnimStep(4), 1400),  // Version "4.0.0" pops
      setTimeout(() => setAnimStep(5), 1600),  // Tagline appears
      setTimeout(() => setAnimStep(6), 1800),  // Word "تطوير:" reveals
      setTimeout(() => setAnimStep(7), 1950),  // Dev logo spins in
      setTimeout(() => setAnimStep(8), 2150),  // Dev name "Hzifa33" shines
      setTimeout(() => {
        setClosing(true);
        setTimeout(onFinish, 400);
      }, 2500),
    ];

    const handleKeyOrClick = () => {
      setClosing(true);
      setTimeout(onFinish, 180);
    };

    window.addEventListener('keydown', handleKeyOrClick);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', handleKeyOrClick);
    };
  }, [onFinish]);

  const handleDismiss = () => {
    setClosing(true);
    setTimeout(onFinish, 180);
  };

  return (
    <div
      className={`raff-splash-screen ${closing ? 'splash-closing' : ''}`}
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
    >
      {/* Light Luxury Alabaster Canvas matching original app palette */}
      <div className="splash-ambient-canvas" />
      <div className="splash-radial-sheen" />

      {/* Main Orchestration Stage */}
      <div className={`splash-stage ${animStep >= 2 ? 'stage-shifted' : 'stage-centered'}`}>
        
        {/* App Logo Stage with Corner-Swoop & Side-Shift Physics */}
        <div className={`splash-logo-pod step-${animStep}`}>
          <div className="splash-logo-aura-outer" />
          <div className="splash-logo-aura-inner" />
          
          <div className="splash-logo-box">
            <img
              src="./assets/logo-512.png"
              alt="RAFF Logo"
              className="splash-logo-img"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.src.includes('dev-logo.svg')) {
                  img.src = './assets/dev-logo.svg';
                }
              }}
            />
            <div className="splash-logo-specular-light" />
          </div>
        </div>

        {/* Sequential Information Wing (Reveals next to the logo) */}
        <div className="splash-info-wing">
          {/* Step 3: Brand Name "رَفّ" */}
          <div className={`splash-brand-row ${animStep >= 3 ? 'revealed' : ''}`}>
            <h1 className="splash-app-title">رَفّ</h1>
            
            {/* Step 4: Version Badge */}
            <span className={`splash-version-capsule ${animStep >= 4 ? 'revealed' : ''}`}>
              <span className="splash-version-dot" />
              <span className="splash-version-text">4.0.0</span>
            </span>
          </div>

          {/* Step 5: Tagline Word */}
          <div className={`splash-tagline ${animStep >= 5 ? 'revealed' : ''}`}>
            نظام إدارة وفهرسة المكتبات الحديث
          </div>

          {/* Step 6, 7 & 8: Developer Credit Chain */}
          <div className="splash-dev-chain">
            {/* Step 6: Word "تطوير" */}
            <span className={`splash-dev-label ${animStep >= 6 ? 'revealed' : ''}`}>
              تطوير:
            </span>

            {/* Step 7: Developer Logo / Monogram */}
            <div className={`splash-dev-icon-pod ${animStep >= 7 ? 'revealed' : ''}`}>
              <img
                src="./assets/dev-logo.svg"
                alt="Hzifa33 Monogram"
                className="splash-dev-svg"
              />
            </div>

            {/* Step 8: Developer Name "Hzifa33" */}
            <span className={`splash-dev-name ${animStep >= 8 ? 'revealed' : ''}`}>
              Hzifa33
            </span>
          </div>
        </div>
      </div>

      {/* Subtle Skip Prompt */}
      <div className="splash-skip-note">
        <span>انقر للتخطي الفوري</span>
      </div>
    </div>
  );
}
