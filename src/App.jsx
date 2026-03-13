import React, { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Home from "./components/Home";
import UploadVideo from "./components/UploadVideo";
import VideoDetail, { SeriesDetail } from "./components/VideoDetail";
import CreateSeries from "./components/CreateSeries";
import Login from "./components/Login";
import Register from "./components/Register";
import ChangePassword from "./components/ChangePassword";
import { Toaster } from "react-hot-toast";
import { useAuth } from "./context/AuthContext";

// ── Route guards ──────────────────────────────────────────────────────────────

function AuthGate({ children }) {
  const { user, loading, needsPasswordChange } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  if (loading) return null;

  // Not logged in → show login or register
  if (!user) {
    return showRegister
      ? <Register   onShowLogin={() => setShowRegister(false)} />
      : <Login      onShowRegister={() => setShowRegister(true)} />;
  }

  // Logged in but must change temp password first
  if (needsPasswordChange) return <ChangePassword />;

  return children;
}

function AdminRoute({ children }) {
  const { user, loading, isAdmin, needsPasswordChange } = useAuth();
  if (loading)              return null;
  if (!user)                return <Navigate to="/" replace />;
  if (needsPasswordChange)  return <Navigate to="/" replace />;
  if (!isAdmin)             return <Navigate to="/" replace />;
  return children;
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-900">
        <AuthGate>
          <Routes>
            <Route path="/"              element={<Home />} />
            <Route path="/series/:id"    element={<SeriesDetail />} />
            <Route path="/video/:id"     element={<VideoDetail />} />

            {/* Admin-only routes */}
            <Route path="/upload"                       element={<AdminRoute><UploadVideo mode="new" /></AdminRoute>} />
            <Route path="/edit/:id"                     element={<AdminRoute><UploadVideo mode="edit" /></AdminRoute>} />
            <Route path="/series/create"                element={<AdminRoute><CreateSeries mode="create" /></AdminRoute>} />
            <Route path="/series/edit/:id"              element={<AdminRoute><CreateSeries mode="edit" /></AdminRoute>} />
            <Route path="/series/:seriesId/add-episode" element={<AdminRoute><UploadVideo mode="add-episode" /></AdminRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthGate>
        <Toaster position="top-right" />
      </div>
    </BrowserRouter>
  );
}

export default App;