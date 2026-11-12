import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Pages are code-split (see App.jsx's lazy() calls), and each build's chunk
// files are named with a content hash that changes on every deploy. A
// browser tab left open from before a deploy still has the OLD hashes in
// memory, so the first click into a page it hasn't loaded yet (e.g. Team
// Members) tries to fetch a chunk file that no longer exists on the server
// -- that throws, nothing catches it, and the page goes blank until the
// user manually refreshes. Vite fires this exact event for that failure;
// reload once to pick up the new build. Guarded with sessionStorage so a
// genuine, persistent failure doesn't reload forever.
window.addEventListener('vite:preloadError', () => {
  const key = 'vite-preload-reload-once'
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1')
    window.location.reload()
  }
})
window.addEventListener('load', () => {
  setTimeout(() => sessionStorage.removeItem('vite-preload-reload-once'), 5000)
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// build 1786297405
