import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import LiveMeeting from './components/LiveMeeting';
import MeetingDetails from './pages/MeetingDetails';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="flex h-screen bg-slate-50 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-hidden flex flex-col">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/meeting/new" element={<LiveMeeting />} />
              <Route path="/meeting/:id" element={<LiveMeeting />} />
              <Route path="/meeting/:id/details" element={<MeetingDetails />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
};

export default App;