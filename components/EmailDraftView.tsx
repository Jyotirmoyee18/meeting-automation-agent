
import React, { useState } from 'react';

interface EmailDraftViewProps {
  draft: string;
}

const EmailDraftView: React.FC<EmailDraftViewProps> = ({ draft }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full sticky top-24">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <i className="fas fa-paper-plane text-blue-500"></i>
          <h3 className="font-bold text-slate-800">Follow-up Draft</h3>
        </div>
        <button 
          onClick={copyToClipboard}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
        >
          <i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`}></i>
          {copied ? 'Copied!' : 'Copy Draft'}
        </button>
      </div>
      
      <div className="flex-1 p-6 bg-slate-50/50">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 min-h-[400px]">
          <div className="mb-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-slate-400 w-10">To:</span>
              <span className="text-sm text-slate-600 bg-slate-100 px-2 py-0.5 rounded">all-participants@company.com</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 w-10">Sub:</span>
              <span className="text-sm font-semibold text-slate-800">Meeting Recap & Next Steps</span>
            </div>
          </div>
          <div className="prose prose-sm max-w-none">
            <p className="text-slate-700 whitespace-pre-wrap leading-relaxed font-serif text-base">
              {draft}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-slate-200 bg-white mt-auto">
        <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2">
          <i className="fas fa-envelope-open-text"></i>
          Open in Outlook / Gmail
        </button>
        <p className="text-center text-[10px] text-slate-400 mt-3 uppercase tracking-widest font-bold">
          Powered by Meeting-Automation-Agent
        </p>
      </div>
    </div>
  );
};

export default EmailDraftView;
