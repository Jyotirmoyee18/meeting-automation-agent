import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Meeting, TranscriptSegment, MeetingAnalysis, AnalysisActionItem } from '../types';
import { exportTxt, exportMarkdown, exportPdf } from '../services/exportService';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(sec: number | null): string {
  if (sec === null) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const SPEAKER_COLORS = [
  'bg-indigo-50 border-indigo-200 text-indigo-800',
  'bg-emerald-50 border-emerald-200 text-emerald-800',
  'bg-amber-50 border-amber-200 text-amber-800',
  'bg-rose-50 border-rose-200 text-rose-800',
  'bg-cyan-50 border-cyan-200 text-cyan-800',
];

function speakerColor(speaker: number | null): string {
  if (speaker === null) return 'bg-slate-50 border-slate-200 text-slate-700';
  return SPEAKER_COLORS[speaker % SPEAKER_COLORS.length];
}

// ─── Action Item Row ──────────────────────────────────────────────────────────

function ActionItemRow({ item, onToggle }: { item: AnalysisActionItem; onToggle: () => void }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl transition-all ${item.completed ? 'opacity-60' : ''}`}>
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
          item.completed ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 hover:border-indigo-400'
        }`}
      >
        {item.completed && <i className="fas fa-check text-white text-[8px]" />}
      </button>
      <div className="flex-1">
        <p className={`text-sm font-medium ${item.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {item.task}
        </p>
        <div className="flex gap-3 mt-1">
          {item.owner && (
            <span className="text-xs text-slate-500">
              <i className="fas fa-user mr-1" />{item.owner}
            </span>
          )}
          {item.deadline && (
            <span className="text-xs text-slate-500">
              <i className="fas fa-calendar-alt mr-1" />{item.deadline}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ icon, title, iconColor, children }: {
  icon: string; title: string; iconColor: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
        <i className={`fas ${icon} ${iconColor}`} />
        <h3 className="font-bold text-slate-800">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Transcript Search ────────────────────────────────────────────────────────

function TranscriptSearch({
  segments,
  query,
  onQuery,
}: {
  segments: TranscriptSegment[];
  query: string;
  onQuery: (q: string) => void;
}) {
  const filtered = query
    ? segments.filter(s => s.text.toLowerCase().includes(query.toLowerCase()))
    : segments;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
        <i className="fas fa-align-left text-slate-400" />
        <h3 className="font-bold text-slate-800">Full Transcript</h3>
        <div className="ml-auto relative">
          <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
          <input
            id="transcript-search"
            type="text"
            value={query}
            onChange={e => onQuery(e.target.value)}
            placeholder="Search transcript..."
            className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 w-40"
          />
        </div>
      </div>
      <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto">
        {filtered.length === 0 && (
          <div className="py-10 text-center text-slate-400 text-sm">No matching segments</div>
        )}
        {filtered.map(seg => (
          <div key={seg.id} className="p-4 hover:bg-slate-50">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${speakerColor(seg.speaker)}`}>
                {seg.speaker !== null ? `Speaker ${seg.speaker + 1}` : 'Speaker'}
              </span>
              {seg.startTime !== null && (
                <span className="text-[10px] text-slate-400 font-mono">{formatTimestamp(seg.startTime)}</span>
              )}
            </div>
            <p className={`text-sm text-slate-700 leading-relaxed ${
              query && seg.text.toLowerCase().includes(query.toLowerCase()) ? 'bg-yellow-50 px-2 py-1 rounded' : ''
            }`}>
              {seg.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const MeetingDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [analysis, setAnalysis] = useState<MeetingAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [actionItems, setActionItems] = useState<AnalysisActionItem[]>([]);

  const fetchMeeting = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/meetings/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Meeting not found');
        throw new Error(`Server error: ${res.status}`);
      }
      const data = await res.json() as {
        meeting: Meeting;
        segments: Array<{
          id: string; meeting_id: string; text: string; speaker: number | null;
          start_time: number | null; end_time: number | null; confidence: number | null;
          is_final: number; created_at: string;
        }>;
        analysis: MeetingAnalysis | null;
      };

      setMeeting(data.meeting);
      setSegments(data.segments.map(s => ({
        id: s.id,
        meetingId: s.meeting_id,
        text: s.text,
        speaker: s.speaker,
        startTime: s.start_time,
        endTime: s.end_time,
        confidence: s.confidence,
        isFinal: s.is_final === 1,
        createdAt: s.created_at,
      })));
      if (data.analysis) {
        setAnalysis(data.analysis);
        setActionItems(data.analysis.actionItems ?? []);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load meeting');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchMeeting(); }, [fetchMeeting]);

  const retryAnalysis = async () => {
    if (!id) return;
    setRetrying(true);
    try {
      await fetch(`${API_URL}/api/meetings/${id}/retry-analysis`, { method: 'POST' });
      // Poll for completion
      const poll = setInterval(async () => {
        const res = await fetch(`${API_URL}/api/meetings/${id}`);
        const data = await res.json() as { analysis: MeetingAnalysis | null };
        if (data.analysis?.status === 'completed' || data.analysis?.status === 'failed') {
          clearInterval(poll);
          setRetrying(false);
          fetchMeeting();
        }
      }, 2000);
      setTimeout(() => { clearInterval(poll); setRetrying(false); }, 60000);
    } catch (err: any) {
      setRetrying(false);
    }
  };

  const copyTranscript = () => {
    const text = segments.map(s => {
      const label = s.speaker !== null ? `Speaker ${s.speaker + 1}` : 'Speaker';
      const ts = formatTimestamp(s.startTime);
      return `${ts} ${label}: ${s.text}`;
    }).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  const toggleActionItem = (idx: number) => {
    setActionItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, completed: !item.completed } : item
    ));
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Loading meeting...</p>
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <i className="fas fa-exclamation-circle text-red-400 text-4xl mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Failed to load meeting</h2>
          <p className="text-slate-500 text-sm mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center gap-4 sticky top-0 z-10">
        <button
          onClick={() => navigate('/')}
          className="text-slate-400 hover:text-slate-700 transition-colors"
        >
          <i className="fas fa-arrow-left" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold text-slate-800">{meeting.title}</h1>
          <p className="text-xs text-slate-400">
            {formatDate(meeting.created_at)} · {formatDuration(meeting.duration_seconds)}
          </p>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={copyTranscript}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
              copiedTranscript
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            <i className={`fas ${copiedTranscript ? 'fa-check' : 'fa-copy'}`} />
            {copiedTranscript ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={() => exportTxt(meeting, segments)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:border-slate-300 transition-all"
          >
            <i className="fas fa-file-alt" />
            TXT
          </button>
          <button
            onClick={() => exportMarkdown(meeting, segments, analysis)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:border-slate-300 transition-all"
          >
            <i className="fab fa-markdown" />
            MD
          </button>
          <button
            onClick={() => exportPdf(meeting, segments, analysis)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all"
          >
            <i className="fas fa-file-pdf" />
            PDF
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
        {/* Analysis section */}
        {(!analysis || analysis.status === 'failed') && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
            <i className="fas fa-robot text-amber-500 text-xl mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-800 mb-1">
                {analysis?.status === 'failed' ? 'AI analysis failed' : 'No AI analysis yet'}
              </p>
              {analysis?.error_message && (
                <p className="text-amber-600 text-sm mb-3">{analysis.error_message}</p>
              )}
              <button
                id="retry-analysis-btn"
                onClick={retryAnalysis}
                disabled={retrying}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-all disabled:opacity-60"
              >
                {retrying
                  ? <><i className="fas fa-spinner animate-spin" /> Analyzing...</>
                  : <><i className="fas fa-redo" /> {analysis?.status === 'failed' ? 'Retry Analysis' : 'Generate Analysis'}</>
                }
              </button>
            </div>
          </div>
        )}

        {analysis?.status === 'running' && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin flex-shrink-0" />
            <p className="text-purple-800 font-semibold">Generating AI analysis...</p>
          </div>
        )}

        {analysis?.status === 'completed' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Summary */}
            <SectionCard icon="fa-file-alt" title="Summary" iconColor="text-indigo-500">
              <p className="text-slate-700 text-sm leading-relaxed">{analysis.summary}</p>
            </SectionCard>

            {/* Key Points */}
            {analysis.keyPoints.length > 0 && (
              <SectionCard icon="fa-lightbulb" title="Key Discussion Points" iconColor="text-amber-500">
                <ul className="space-y-2">
                  {analysis.keyPoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-indigo-400 mt-1">•</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}

            {/* Decisions */}
            {analysis.decisions.length > 0 && (
              <SectionCard icon="fa-gavel" title="Decisions Made" iconColor="text-emerald-500">
                <ul className="space-y-2">
                  {analysis.decisions.map((dec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <i className="fas fa-check-circle text-emerald-400 mt-0.5" />
                      {dec}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}

            {/* Follow-up Questions */}
            {analysis.followUpQuestions.length > 0 && (
              <SectionCard icon="fa-question-circle" title="Follow-up Questions" iconColor="text-purple-500">
                <ul className="space-y-2">
                  {analysis.followUpQuestions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-purple-400 mt-1">?</span>
                      {q}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}

            {/* Action Items */}
            {actionItems.length > 0 && (
              <div className="xl:col-span-2">
                <SectionCard icon="fa-tasks" title="Action Items" iconColor="text-rose-500">
                  <div className="divide-y divide-slate-50">
                    {actionItems.map((item, i) => (
                      <div key={i}>
                        <ActionItemRow item={item} onToggle={() => toggleActionItem(i)} />
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            )}
          </div>
        )}

        {/* Transcript */}
        <TranscriptSearch
          segments={segments}
          query={transcriptSearch}
          onQuery={setTranscriptSearch}
        />
      </div>
    </div>
  );
};

export default MeetingDetails;
