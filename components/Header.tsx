
import React from 'react';
import { MeetingStatus } from '../types';

interface HeaderProps {
  status: MeetingStatus;
  onStart: () => void;
}

const Header: React.FC<HeaderProps> = ({ status, onStart }) => {
  return (
    <header className="h-20 border-b border-slate-200 bg-white px-8 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-slate-800">VoxNote AI</h1>
        {status === MeetingStatus.LISTENING && (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-100 rounded-full">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">Live Transcription</span>
          </div>
        )}
        {status === MeetingStatus.PROCESSING && (
          <div className="flex items-center gap-2 px-3 py-1 bg-amber-100 rounded-full">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-bounce"></span>
            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Analyzing Context</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {status === MeetingStatus.COMPLETED && (
          <button 
            onClick={onStart}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600 font-medium"
          >
            <i className="fas fa-plus"></i>
            New Session
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
            <i className="fas fa-user text-slate-500 text-sm"></i>
          </div>
          <span className="text-sm font-medium text-slate-700">Team Agent</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
