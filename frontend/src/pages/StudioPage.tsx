import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { StageView, type CharacterControls } from '../components/StageView'
import { ChatIcon, Conversation, MicIcon, type Mode } from '../components/Conversation'
import { fetchInteractionConfig } from '../api/client'
import { CHARACTER_OPTIONS, findCharacter } from '../characters/catalog'
import { ensureBrowserAudioUnlocked } from '../utils/audioPlaybackUnlock'

const MODE_KEY = 'anima:mode'

function storedMode(): Mode {
  try { return window.localStorage.getItem(MODE_KEY) === 'voice' ? 'voice' : 'chat' } catch { return 'chat' }
}

export function StudioPage() {
  const navigate = useNavigate()
  const { characterId } = useParams<{ characterId: string }>()
  const character = findCharacter(characterId)
  const [controls, setControls] = useState<CharacterControls | null>(null)
  const [mode, setMode] = useState<Mode>(storedMode)
  const [voiceEnabled, setVoiceEnabled] = useState<boolean | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    void ensureBrowserAudioUnlocked()
    let cancelled = false
    fetchInteractionConfig()
      .then((config) => { if (!cancelled) setVoiceEnabled(config.voice_enabled) })
      .catch(() => { if (!cancelled) { setVoiceEnabled(false); setProblem('Could not reach the Anima server. Is the backend running?') } })
    return () => { cancelled = true }
  }, [])

  const choose = (next: Mode) => {
    setMode(next)
    try { window.localStorage.setItem(MODE_KEY, next) } catch { /* private browsing: remember in memory only */ }
  }
  // Without ElevenLabs settings, a remembered voice choice falls back to chat.
  const activeMode: Mode = mode === 'voice' && voiceEnabled !== false ? 'voice' : 'chat'

  return (
    <div className="scene-page">
      {/* Zoomed in and lifted so the character stands above the conversation. */}
      <StageView character={character} onReady={setControls} zoom={1.06} lift={0.12} greet="smile" />
      <header className="overlay-bar">
        <Link to="/characters" className="back-button"><span aria-hidden="true">←</span>Characters</Link>
        <div className="mode-switch" role="group" aria-label="Conversation mode">
          <button type="button" aria-pressed={activeMode === 'chat'} onClick={() => choose('chat')}><ChatIcon />Chat</button>
          <button
            type="button"
            aria-pressed={activeMode === 'voice'}
            disabled={voiceEnabled === false}
            title={voiceEnabled === false ? 'Add ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID to the backend to talk by voice' : undefined}
            onClick={() => choose('voice')}
          >
            <MicIcon />Voice
          </button>
        </div>
        <nav className="picker" aria-label="Characters">
          {CHARACTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="picker__item"
              aria-pressed={option.id === character.id}
              aria-label={option.label}
              title={option.label}
              onClick={() => navigate(`/studio/${option.id}`)}
            >
              <img src={option.preview} alt="" />
            </button>
          ))}
        </nav>
      </header>
      <Conversation key={character.id} characterControls={controls} character={character} mode={activeMode} problem={problem} />
    </div>
  )
}
