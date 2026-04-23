
import React from 'react';
import { MeetingStatus } from '../types';

interface SidebarProps {
  status: MeetingStatus;
}

const Sidebar: React.FC<SidebarProps> = ({ status }) => {
  return (
    <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-300">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/50">
            <i className="fas fa-robot text-white text-xl"></i>
          </div>
          <span className="text-xl font-bold text-white tracking-tight">MeetingAI</span>
        </div>

        <nav className="space-y-1">
          <a href="#" className="flex items-center gap-3 px-4 py-3 bg-white/10 text-white rounded-lg transition-colors">
            <i className="fas fa-home"></i>
            <span className="font-medium">Dashboard</span>
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-lg transition-colors">
            <i className="fas fa-history"></i>
            <span className="font-medium">Past Meetings</span>
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-lg transition-colors">
            <i className="fas fa-cog"></i>
            <span className="font-medium">Settings</span>
          </a>
        </nav>
      </div>

      <div className="mt-auto p-6">
        <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-xl p-4">
          <p className="text-xs font-semibold text-indigo-400 uppercase mb-2">Current Status</p>
          <p className="text-sm text-white font-medium flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status === MeetingStatus.IDLE ? 'bg-slate-500' : 'bg-green-500'}`}></span>
            {status.charAt(0) + status.slice(1).toLowerCase()}
          </p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
