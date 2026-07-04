import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Meeting } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function StatusBadge({ status }: { status: Meeting['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    recording:  { label: 'Recording',  cls: 'bg-red-100 text-red-700' },
    processing: { label: 'Processing', cls: 'bg-amber-100 text-amber-700' },
    completed:  { label: 'Completed',  cls: 'bg-emerald-100 text-emerald-700' },
    failed:     { label: 'Failed',     cls: 'bg-rose-100 text-rose-700' },
    pending:    { label: 'Pending',    cls: 'bg-slate-100 text-slate-600' },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${s.cls}`}>
      {s.label}
    </span>
  );
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchMeetings = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = q ? `?search=${encodeURIComponent(q)}` : '';
      const res = await fetch(`${API_URL}/api/meetings${params}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json() as { meetings: Meeting[] };
      setMeetings(data.meetings);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMeetings(debouncedSearch); }, [debouncedSearch, fetchMeetings]);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hero bar */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-700 px-8 py-10">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-extrabold text-white mb-1">Meeting Dashboard</h1>
          <p className="text-indigo-200 text-sm">Your AI-powered meeting history and transcriptions</p>
          <button
            id="new-transcription-btn"
            onClick={() => navigate('/meeting/new')}
            className="mt-6 inline-flex items-center gap-2 bg-white text-indigo-700 font-bold px-6 py-3 rounded-xl shadow-lg hover:bg-indigo-50 transition-all"
          >
            <i className="fas fa-plus" />
            New Transcription
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Search */}
        <div className="relative mb-6">
          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="meeting-search"
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search meetings by title..."
            className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-800 placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <i className="fas fa-times" />
            </button>
          )}
        </div>

        {/* States */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium">Loading meetings...</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
            <i className="fas fa-exclamation-circle text-red-400 text-3xl mb-3" />
            <p className="text-red-700 font-semibold mb-2">Failed to load meetings</p>
            <p className="text-red-500 text-sm mb-4">{error}</p>
            <button
              onClick={() => fetchMeetings(debouncedSearch)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && meetings.length === 0 && debouncedSearch && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <i className="fas fa-search text-4xl mb-4" />
            <p className="font-semibold text-slate-600">No meetings found</p>
            <p className="text-sm">No results for "{debouncedSearch}"</p>
          </div>
        )}

        {!loading && !error && meetings.length === 0 && !debouncedSearch && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
              <i className="fas fa-wave-square text-indigo-400 text-3xl" />
            </div>
            <h3 className="text-xl font-bold text-slate-700 mb-2">No meetings yet</h3>
            <p className="text-sm mb-6">Start your first transcription to see it here</p>
            <button
              onClick={() => navigate('/meeting/new')}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
            >
              Start Transcription
            </button>
          </div>
        )}

        {!loading && !error && meetings.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              {debouncedSearch ? `${meetings.length} result${meetings.length !== 1 ? 's' : ''}` : `${meetings.length} meeting${meetings.length !== 1 ? 's' : ''}`}
            </p>
            {meetings.map(meeting => (
              <button
                key={meeting.id}
                id={`meeting-${meeting.id}`}
                onClick={() => navigate(`/meeting/${meeting.id}/details`)}
                className="w-full text-left bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold text-slate-800 truncate group-hover:text-indigo-700 transition-colors">
                        {meeting.title}
                      </h3>
                      <StatusBadge status={meeting.status} />
                    </div>
                    {meeting.summary && (
                      <p className="text-sm text-slate-500 line-clamp-2 mb-2">{meeting.summary}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span><i className="far fa-calendar mr-1" />{formatDate(meeting.created_at)}</span>
                      <span><i className="far fa-clock mr-1" />{formatDuration(meeting.duration_seconds)}</span>
                      {meeting.analysisStatus === 'completed' && (
                        <span className="text-indigo-500"><i className="fas fa-robot mr-1" />AI Summary</span>
                      )}
                    </div>
                  </div>
                  <i className="fas fa-chevron-right text-slate-300 group-hover:text-indigo-400 transition-colors mt-1" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
