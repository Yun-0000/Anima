const SILENT_AUDIO_DATA_URI =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='

let audioPlaybackUnlocked = false
let unlockPromise: Promise<boolean> | null = null

export function isBrowserAudioUnlocked() {
  return audioPlaybackUnlocked
}

export async function ensureBrowserAudioUnlocked(): Promise<boolean> {
  if (audioPlaybackUnlocked) {
    return true
  }

  if (unlockPromise) {
    return unlockPromise
  }

  if (typeof Audio === 'undefined') {
    return false
  }

  const audio = new Audio()
  audio.src = SILENT_AUDIO_DATA_URI
  audio.preload = 'auto'
  audio.muted = true
  audio.loop = false

  unlockPromise = Promise.resolve(audio.play())
    .then(() => {
      audio.pause()
      audio.currentTime = 0
      audioPlaybackUnlocked = true
      return true
    })
    .catch(() => false)
    .finally(() => {
      unlockPromise = null
    })

  return unlockPromise
}
