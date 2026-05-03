import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { GalleryPage } from './pages/GalleryPage'
import { StudioPage } from './pages/StudioPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/studio/:characterId" element={<StudioPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
