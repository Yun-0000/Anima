import { Canvas } from '@react-three/fiber'
import { Suspense, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Character } from '../components/Character'
import type { CharacterControls } from '../components/Character'
import { CHARACTER_OPTIONS, DEFAULT_CHARACTER_ID } from '../characters/catalog'

function HeroPreview() {
  const defaultCharacter =
    CHARACTER_OPTIONS.find((character) => character.id === DEFAULT_CHARACTER_ID) ?? CHARACTER_OPTIONS[0]

  const handleReady = useCallback(async (controls: CharacterControls) => {
    try {
      await controls.playAnimation('idle')
    } catch { /* ignore */ }
  }, [])

  return (
    <Canvas camera={{ position: [0, 1.2, 4.5], fov: 30 }}>
      <ambientLight intensity={1.4} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} color="#b0c4de" />
      <Suspense fallback={null}>
        <Character
          key="landing-preview"
          url={defaultCharacter.modelUrl}
          position={[0, -0.8, 0]}
          onReady={handleReady}
        />
      </Suspense>
    </Canvas>
  )
}

/* Floating particles */
function Particles() {
  const dots = Array.from({ length: 30 }, (_, i) => i)
  return (
    <div className="landing-particles" aria-hidden="true">
      {dots.map((i) => (
        <span
          key={i}
          className="landing-particle"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 8}s`,
            animationDuration: `${6 + Math.random() * 8}s`,
            width: `${2 + Math.random() * 2}px`,
            height: `${2 + Math.random() * 2}px`,
            opacity: 0.15 + Math.random() * 0.25,
          }}
        />
      ))}
    </div>
  )
}

export function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="landing-shell">
      {/* Tech background layers */}
      <Particles />
      <div className="landing-glow landing-glow--1" aria-hidden="true" />
      <div className="landing-glow landing-glow--2" aria-hidden="true" />

      {/* Corner brackets */}
      <div className="landing-bracket landing-bracket--tl" aria-hidden="true" />
      <div className="landing-bracket landing-bracket--tr" aria-hidden="true" />
      <div className="landing-bracket landing-bracket--bl" aria-hidden="true" />
      <div className="landing-bracket landing-bracket--br" aria-hidden="true" />

      {/* Nav */}
      <header className="landing-nav">
        <span className="landing-logo">Anima</span>
        <nav className="landing-nav__links">
          <Link className="landing-nav__link" to="/gallery">Gallery</Link>
        </nav>
      </header>

      {/* Content */}
      <div className="landing-content">
        {/* Left: copy */}
        <div className="landing-copy">
          <div className="landing-copy__inner">
            <p className="landing-mission">Making AI interaction immersive.</p>
            <h1 className="landing-title">
              Characters<br />that feel alive.
            </h1>
            <div className="landing-features-row">
              <span className="landing-pill">Voice</span>
              <span className="landing-pill">Emotion</span>
              <span className="landing-pill">Motion</span>
            </div>
            <button type="button" className="button button--primary landing-cta-btn" onClick={() => navigate('/gallery')}>
              <span>Try it now</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* Right: 3D character */}
        <div className="landing-character">
          <div className="landing-character__ring" aria-hidden="true" />
          <div className="landing-character__scanline" aria-hidden="true" />
          <div className="landing-character__canvas">
            <HeroPreview />
          </div>
        </div>
      </div>
    </div>
  )
}
