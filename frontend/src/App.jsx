import { Routes, Route } from "react-router-dom"
import Home from "./pages/Home"
import Analysis from "./pages/Analysis"
import Flights from "./pages/Flights"
import Favorites from "./pages/Favorites"
import Notifications from "./pages/Notifications"
import Auth from "./pages/Auth"
import NotFound from "./pages/NotFound"
import ChatWidget from "./components/ChatWidget"

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/flights" element={<Flights />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <ChatWidget />
    </>
  )
}
