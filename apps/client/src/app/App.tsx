import { AppProviders } from "./providers"
import { AppRouter } from "@/routes/router"

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}
