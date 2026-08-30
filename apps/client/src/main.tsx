import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "./app/App.tsx"
import "./index.css"

async function enableMocking() {
  if (import.meta.env.MOCK !== "true") {
    return
  }

  const { worker } = await import("./mocks/browser")

  await worker.start({
    serviceWorker: {
      url: "/mockServiceWorker.js",
    },
    onUnhandledRequest: "bypass",
  })
}

async function bootstrap() {
  await enableMocking()

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
