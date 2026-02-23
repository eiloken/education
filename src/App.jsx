import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Home from "./components/Home";
import UploadVideo from "./components/UploadVideo";
import VideoDetail, { SeriesDetail } from "./components/VideoDetail";
import CreateSeries from "./components/CreateSeries";
import { Toaster } from "react-hot-toast";

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-900">
      {children}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="/series/create" element={<CreateSeries mode="create" />} />
          <Route path="/series/edit/:id" element={<CreateSeries mode="edit" />} />
          <Route path="/series/:id" element={<SeriesDetail />} />
          <Route path="/series/:seriesId/add-episode" element={<UploadVideo mode="add-episode" />} />
          <Route path="/video/:id" element={<VideoDetail />} />
          <Route path="/edit/:id" element={<UploadVideo mode="edit" />} />
          <Route path="/upload" element={<UploadVideo mode="new" />} />
        </Routes>

        <Toaster position="top-right" />
      </Layout>
    </BrowserRouter>
  );
}

export default App;