import { Link } from 'react-router-dom'
import { StageView } from '../components/StageView'
import { CHARACTER_OPTIONS } from '../characters/catalog'

const host = CHARACTER_OPTIONS[0]

/** The intro: the first character in their room, waving, next to a short description of the project. */
export function LandingPage() {
  return (
    <div className="scene-page landing">
      <StageView character={host} idle="idle_249" rests />
      <header className="overlay-bar">
        <span className="brand">anima</span>
      </header>
      <div className="landing__copy">
        <h1>Characters<br />that feel alive.</h1>
        <p>Anime characters with little rooms of their own. Say hi, and they turn to you, by text or by voice.</p>
        <Link to="/characters" className="button primary">Meet them <span aria-hidden="true">→</span></Link>
      </div>
    </div>
  )
}
