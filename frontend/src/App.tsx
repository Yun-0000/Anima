import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { CharactersPage } from './pages/CharactersPage'
import { StudioPage } from './pages/StudioPage'
import { LabPage } from './pages/LabPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/characters" element={<CharactersPage />} />
        <Route path="/studio/:characterId" element={<StudioPage />} />
        <Route path="/lab" element={<LabPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
