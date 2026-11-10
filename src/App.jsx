import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Trades from "./pages/Trades.jsx";
import Momentum from "./pages/Momentum.jsx";
import FadeBook from "./pages/FadeBook.jsx";
import Intraday from "./pages/Intraday.jsx";
import { MarketStatusProvider } from "./hooks/useMarketStatus.jsx";

function ModulePage({ title }) {
  return (
    <div className="modulePage">
      <div className="moduleIcon"><InsightsRoundedFallback /></div>
      <div className="eyebrow">RAM MODULE</div>
      <h1>{title}</h1>
      <p>This module is connected to the RAM navigation and ready for its dedicated API integration.</p>
      <button onClick={() => window.history.back()}>← Back to previous screen</button>
    </div>
  );
}
function InsightsRoundedFallback(){ return <span>✦</span>; }

export default function App() {
  return (
    <MarketStatusProvider>
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trades" element={<Trades />} />
        <Route path="/intraday" element={<Intraday />} />
        <Route path="/momentum" element={<Momentum />} />
        <Route path="/fade" element={<FadeBook />} />
        <Route path="/module/:name" element={<ModulePage title="RAM Analytics Module" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
    </MarketStatusProvider>
  );
}
