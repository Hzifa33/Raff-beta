import React, { useEffect, useState } from 'react';

export function IntroSplashScreen({ onFinish }: { onFinish: () => void }) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // Snappy non-boring timing: completes in ~1450ms, then fades out smoothly
    const timer = setTimeout(() => {
      setClosing(true);
      setTimeout(onFinish, 420);
    }, 1450);

    const handleKeyOrClick = () => {
      setClosing(true);
      setTimeout(onFinish, 200);
    };

    window.addEventListener('keydown', handleKeyOrClick);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyOrClick);
    };
  }, [onFinish]);

  const handleDismiss = () => {
    setClosing(true);
    setTimeout(onFinish, 200);
  };

  return (
    <div
      className={`raff-intro-overlay ${closing ? 'raff-intro-closing' : ''}`}
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
    >
      {/* Dynamic Ambient Background Glow */}
      <div className="raff-intro-backdrop" />
      <div className="raff-intro-orb-gold" />
      <div className="raff-intro-orb-emerald" />

      {/* Intro Center Card */}
      <div className="raff-intro-card">
        {/* Animated Sacred Geometric Ring & Aura */}
        <div className="raff-intro-logo-stage">
          <div className="raff-intro-radiant-ring" />
          <div className="raff-intro-radiant-ring-outer" />
          <div className="raff-intro-logo-glow" />

          {/* Logo with Specular Light Sweep */}
          <div className="raff-intro-logo-wrapper">
            <img
              src="./assets/logo-512.png"
              alt="RAFF 4.0 Logo"
              className="raff-intro-logo-img"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.src.includes('dev-logo.svg')) {
                  img.src = './assets/dev-logo.svg';
                }
              }}
            />
            <div className="raff-intro-sheen-sweep" />
          </div>
        </div>

        {/* Brand Name with Golden Horizon Bloom */}
        <div className="raff-intro-title-group">
          <h1 className="raff-intro-brand-name">رَفّ</h1>
          <div className="raff-intro-version-tag">
            <span>RAFF</span>
            <span className="raff-intro-version-dot" />
            <span className="raff-intro-version-num">4.0.0</span>
          </div>
          <p className="raff-intro-tagline">
            نظام إدارة وفهرسة المكتبات الحديث — الجيل الرابع
          </p>
        </div>

        {/* Micro Loader Shimmer Bar */}
        <div className="raff-intro-loader-track">
          <div className="raff-intro-loader-fill" />
        </div>

        {/* Developer Attribution Card */}
        <div className="raff-intro-dev-badge">
          <img
            src="./assets/dev-logo.svg"
            alt="Hzifa33 Monogram"
            className="raff-intro-dev-icon"
          />
          <span className="raff-intro-dev-text">تطوير: Hzifa33</span>
        </div>

        {/* Subtle Skip Hint */}
        <div className="raff-intro-skip-hint">
          <span>انقر في أي مكان للتخطي الفوري</span>
        </div>
      </div>
    </div>
  );
}
