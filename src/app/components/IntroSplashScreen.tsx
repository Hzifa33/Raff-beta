import React, { useEffect, useState } from 'react';

export function IntroSplashScreen({ onFinish }: { onFinish: () => void }) {
  // Choreography Steps:
  // 0: Corner swoop -> geometric center
  // 1: Center rest & radiant ring aura
  // 2: Smooth side-shift
  // 3: Name "رَفّ" 3D kinetic unfold
  // 4: Version "4.0.0" elastic spring pop
  // 5: Tagline letter-tracking reveal
  // 6: Developer container unmasks & word "تطوير:" reveals
  // 7: Developer logo (Monogram) 3D coin-flip
  // 8: Developer name "Hzifa33" specular liquid shimmer
  // (Full 2.2s resting window for reading)
  // 9: Smooth blur-fade exit
  const [animStep, setAnimStep] = useState(0);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setAnimStep(1), 600),   // Settle in exact center
      setTimeout(() => setAnimStep(2), 1100),  // Glides smoothly to the side
      setTimeout(() => setAnimStep(3), 1450),  // Name "رَفّ" unrolls
      setTimeout(() => setAnimStep(4), 1700),  // Version "4.0.0" pops
      setTimeout(() => setAnimStep(5), 1950),  // Tagline appears
      setTimeout(() => setAnimStep(6), 2200),  // Dev container & word "تطوير:"
      setTimeout(() => setAnimStep(7), 2400),  // Dev monogram spins in
      setTimeout(() => setAnimStep(8), 2600),  // Dev name "Hzifa33" shines
      // 2.2 full seconds to read and admire the finished composition:
      setTimeout(() => {
        setClosing(true);
        setTimeout(onFinish, 420);
      }, 4850),
    ];

    const handleKeyOrClick = () => {
      setClosing(true);
      setTimeout(onFinish, 160);
    };

    window.addEventListener('keydown', handleKeyOrClick);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', handleKeyOrClick);
    };
  }, [onFinish]);

  const handleDismiss = () => {
    setClosing(true);
    setTimeout(onFinish, 160);
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

        {/* Sequential Information Wing - ZERO width/space when animStep < 2 */}
        {animStep >= 2 && (
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

            {/* Step 6, 7 & 8: Developer Credit Chain - Only appears at Step 6+ */}
            {animStep >= 6 && (
              <div className="splash-dev-chain">
                {/* Step 6: Word "تطوير:" */}
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
            )}
          </div>
        )}
      </div>

      {/* Subtle Skip Prompt */}
      <div className="splash-skip-note">
        <span>انقر في أي مكان للتخطي الفوري</span>
      </div>
    </div>
  );
}
