import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

const Sidebar: React.FC = () => {
  const navigate = useNavigate();

  return (
    <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-300 flex-shrink-0">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/50">
            <i className="fas fa-wave-square text-white text-xl" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">VoxNote AI</span>
        </div>

        <nav className="space-y-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5'
              }`
            }
          >
            <i className="fas fa-home w-4 text-center" />
            <span className="font-medium">Dashboard</span>
          </NavLink>

          <NavLink
            to="/meeting/new"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5'
              }`
            }
          >
            <i className="fas fa-plus-circle w-4 text-center" />
            <span className="font-medium">New Transcription</span>
          </NavLink>
        </nav>
      </div>

      <div className="mt-auto p-6">
        <button
          onClick={() => navigate('/meeting/new')}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/30"
        >
          <i className="fas fa-microphone" />
          Start Recording
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
