import { type CSSProperties, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CHARACTER_OPTIONS } from '../characters/catalog'
import { StageView } from '../components/StageView'
import { ensureBrowserAudioUnlocked } from '../utils/audioPlaybackUnlock'

/** One scale for everyone, so their heights compare. */
const FIGURE = { zoom: 1.62, lift: 0.1 }

export function CharactersPage() {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const character = CHARACTER_OPTIONS[index]
  const count = CHARACTER_OPTIONS.length
  const step = (delta: number) => setIndex((current) => (current + delta + count) % count)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') step(1)
      if (event.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const enter = () => {
    // Unlocks audio inside the click so the first reply can play; not awaited, as Safari can leave it pending.
    void ensureBrowserAudioUnlocked()
    navigate(`/studio/${character.id}`)
  }

  return (
    <div className="characters" style={{ '--tint': character.tint } as CSSProperties}>
      <header className="overlay-bar">
        <Link to="/" className="back-button"><span aria-hidden="true">←</span>Home</Link>
      </header>

      <div className="feature__figure">
        <StageView character={character} bare awake rests zoom={FIGURE.zoom} lift={FIGURE.lift} />
      </div>

      <main className="feature">
        <div className="feature__text" key={`text-${character.id}`}>
          <span className="feature__count">{String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>
          <h1 className="feature__name">{character.label}</h1>
          <p className="feature__quote">“{character.greeting}”</p>
          <p className="feature__tagline">{character.tagline}</p>
          <button type="button" className="button primary" onClick={enter}>
            Enter {character.label}’s room <span aria-hidden="true">→</span>
          </button>
        </div>
        <nav className="roster" aria-label="Characters">
          <button type="button" className="roster__arrow" aria-label="Previous character" onClick={() => step(-1)}>‹</button>
          {CHARACTER_OPTIONS.map((option, position) => (
            <button
              key={option.id}
              type="button"
              className="roster__item"
              aria-pressed={position === index}
              aria-label={option.label}
              onClick={() => setIndex(position)}
            >
              <img src={option.preview} alt="" />
            </button>
          ))}
          <button type="button" className="roster__arrow" aria-label="Next character" onClick={() => step(1)}>›</button>
        </nav>
      </main>
    </div>
  )
}
