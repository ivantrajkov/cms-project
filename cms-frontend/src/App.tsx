import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import EditorPage from "./pages/EditorPage";
import LivePage from "./pages/LivePage";

export default function App() {
  return (
    <Routes>
      {/* Dashboard */}
      <Route path="/" element={<HomePage />} />

      {/* Admin editor */}
      <Route path="/admin/edit/:slug" element={<EditorPage />} />

      {/* Public live page (keep last — it's the catch-all slug route) */}
      <Route path="/:slug" element={<LivePage />} />
    </Routes>
  );
}
