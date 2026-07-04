
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

  const getSubjectAndBody = () => {
    let subject = "Meeting Recap & Next Steps";
    let body = draft;

    const lines = draft.split('\n');
    if (lines[0].startsWith('Subject: ')) {
      subject = lines[0].replace('Subject: ', '').trim();
      body = lines.slice(1).join('\n').trim();
    }
    return { subject, body };
  };

  const handleOpenDefaultMail = () => {
    const { subject, body } = getSubjectAndBody();
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleOpenGmail = () => {
    const { subject, body } = getSubjectAndBody();
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
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
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={handleOpenGmail}
            className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Gmail
          </button>
          <button 
            onClick={handleOpenDefaultMail}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
          >
            <i className="fas fa-envelope-open-text"></i>
            Outlook / Default
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-4 uppercase tracking-widest font-bold">
          Powered by VoxNote AI
        </p>
      </div>
    </div>
  );
};

export default EmailDraftView;
