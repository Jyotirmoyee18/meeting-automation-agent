import React, { useState, useCallback } from 'react';
import { MeetingStatus, MeetingData, TranscriptionEntry, ActionItem } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LiveMeeting from './components/LiveMeeting';
import SummaryView from './components/SummaryView';
import ActionItemView from './components/ActionItemView';
import EmailDraftView from './components/EmailDraftView';


/** Spliting transcript into sentences */
const toSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

/** TF-IDF-style scoring to pick the most important sentences */
const rankSentences = (sentences: string[]): string[] => {
  const wordFreq: Record<string, number> = {};
  const stopWords = new Set([
    'the','a','an','is','it','in','on','at','to','of','and','or','but',
    'so','we','i','you','he','she','they','this','that','was','are','be',
    'been','have','has','had','will','would','could','should','with','for',
    'from','by','as','not','do','did','our','your','its','if','just','also',
    'can','got','get','let','my','me','him','her','us','them','than','then',
  ]);

  sentences.forEach(s => {
    s.toLowerCase().split(/\W+/).forEach(w => {
      if (w.length > 3 && !stopWords.has(w)) {
        wordFreq[w] = (wordFreq[w] || 0) + 1;
      }
    });
  });

  const scored = sentences.map(s => {
    const words = s.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w));
    const score = words.reduce((sum, w) => sum + (wordFreq[w] || 0), 0) / (words.length || 1);
    return { s, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map(x => x.s);
};

/** Extract likely action items — sentences with imperative/task language */
const extractActionItems = (sentences: string[]): ActionItem[] => {
  const actionKeywords = [
    'need to', 'should', 'will', 'must', 'action', 'follow up', 'follow-up',
    'assign', 'task', 'todo', 'to-do', 'deadline', 'due', 'complete',
    'review', 'send', 'schedule', 'update', 'create', 'build', 'fix',
    'prepare', 'write', 'check', 'confirm', 'ensure', 'provide', 'share',
    'implement', 'set up', 'reach out', 'discuss', 'decide', 'finalize',
  ];
  const priorityHigh = ['urgent', 'asap', 'immediately', 'critical', 'important', 'must'];
  const priorityLow  = ['maybe', 'consider', 'possibly', 'eventually', 'nice to have'];

  const items: ActionItem[] = [];
  let id = 1;

  sentences.forEach(sentence => {
    const lower = sentence.toLowerCase();
    const isAction = actionKeywords.some(k => lower.includes(k));
    if (!isAction) return;

    // Extract a name (word after "by" / capitalized word that isn't first)
    const byMatch = sentence.match(/\bby\s+([A-Z][a-z]+)/);
    const nameMatch = sentence.match(/\b([A-Z][a-z]+)\b(?!\s*[.,:;])/g);
    const assignee = byMatch
      ? byMatch[1]
      : nameMatch && nameMatch.length > 0
        ? nameMatch[0]
        : 'Team';

    const priority: 'High' | 'Medium' | 'Low' =
      priorityHigh.some(k => lower.includes(k)) ? 'High' :
      priorityLow.some(k => lower.includes(k))  ? 'Low'  : 'Medium';

    items.push({
      id: String(id++),
      task: sentence.length > 120 ? sentence.slice(0, 117) + '...' : sentence,
      assignee,
      priority,
    });
  });

  return items.slice(0, 8); // cap at 8 action items
};

/** Generate a plain-text follow-up email from the summary */
const buildEmail = (summary: string, items: ActionItem[], date: string): string => {
  const itemLines = items.length > 0
    ? items.map((it, i) => `  ${i + 1}. [${it.priority}] ${it.task} — ${it.assignee}`).join('\n')
    : '  • No specific action items identified.';

  return `Subject: Meeting Follow-Up — ${date}

Hi Team,

Thank you for joining today's meeting. Please find a summary and next steps below.

SUMMARY
-------
${summary}

ACTION ITEMS
------------
${itemLines}

Please review the above and reach out if you have any questions or updates.

Best regards,
Meeting Agent`;
};

/** Master function — takes raw transcript, returns MeetingData fields */
const processTranscriptLocally = (transcript: string): Omit<MeetingData, 'transcript'> => {
  const sentences = toSentences(transcript);

  if (sentences.length === 0) {
    return {
      summary: transcript,
      actionItems: [],
      followUpEmail: buildEmail(transcript, [], new Date().toLocaleDateString()),
    };
  }

  // Summary: top 40% of sentences by relevance score, kept in original order
  const ranked   = rankSentences(sentences);
  const topN     = Math.max(3, Math.ceil(sentences.length * 0.4));
  const topSet   = new Set(ranked.slice(0, topN));
  const summaryLines = sentences.filter(s => topSet.has(s));

  // Group into short paragraphs (3-4 sentences each)
  const paragraphs: string[] = [];
  for (let i = 0; i < summaryLines.length; i += 4) {
    paragraphs.push(summaryLines.slice(i, i + 4).join(' '));
  }
  const summary = paragraphs.join('\n\n') || transcript.slice(0, 500);

  const actionItems = extractActionItems(sentences);
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const followUpEmail = buildEmail(summary, actionItems, date);

  return { summary, actionItems, followUpEmail };
};

// ─────────────────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  const [status, setStatus]       = useState<MeetingStatus>(MeetingStatus.IDLE);
  const [meetingLink, setMeetingLink] = useState<string>('');
  const [transcripts, setTranscripts] = useState<TranscriptionEntry[]>([]);
  const [meetingData, setMeetingData] = useState<MeetingData | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const startMeeting = () => {
    if (meetingLink && !meetingLink.includes('http')) {
      setError('Please enter a valid meeting URL.');
      return;
    }
    setStatus(MeetingStatus.LISTENING);
    setTranscripts([
      {
        speaker: 'System',
        text: meetingLink
          ? `Agent joining meeting: ${meetingLink}. Initializing audio bridge...`
          : 'Meeting Agent initialized. Listening via microphone...',
        timestamp: new Date(),
      },
    ]);
    setMeetingData(null);
    setError(null);
  };

  const stopMeeting = async (fullTranscript: string) => {
    const cleaned = fullTranscript
      .replace('[No speech detected — session ended]', '')
      .trim();

    if (!cleaned) {
      setError(
        'No speech was captured. ' +
        'Make sure your microphone is allowed and, for meeting links, ' +
        '"Share tab audio" was checked in the screen-share popup.'
      );
      setStatus(MeetingStatus.IDLE);
      return;
    }

    setStatus(MeetingStatus.PROCESSING);

    // Small delay so the "Processing" spinner renders before the JS work runs
    await new Promise(r => setTimeout(r, 80));

    try {
      const result = processTranscriptLocally(cleaned);
      setMeetingData({ transcript: cleaned, ...result });
      setStatus(MeetingStatus.COMPLETED);
    } catch (err: any) {
      console.error('Processing error:', err);
      setError(`Failed to process transcript: ${err.message}`);
      setStatus(MeetingStatus.IDLE);
    }
  };

  const handleNewTranscript = useCallback((entry: TranscriptionEntry) => {
    setTranscripts(prev => [...prev, entry]);
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar status={status} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header status={status} onStart={startMeeting} />

        <main className="flex-1 overflow-y-auto p-6 lg:p-10 space-y-8">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 animate-in slide-in-from-top-2">
              <div className="flex">
                <i className="fas fa-exclamation-circle text-red-500 mt-1 mr-3"></i>
                <p className="text-red-700 font-medium">{error}</p>
              </div>
            </div>
          )}

          {status === MeetingStatus.IDLE && !meetingData && (
            <div className="flex flex-col items-center justify-center h-full text-center py-10">
              <div className="w-24 h-24 bg-indigo-100 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-100 rotate-3">
                <i className="fas fa-robot text-indigo-600 text-4xl"></i>
              </div>
              <h2 className="text-3xl font-bold text-slate-800 mb-2">Deploy your Meeting Agent</h2>
              <p className="text-slate-500 max-w-md mx-auto mb-8">
                Paste a Zoom, Google Meet, or Teams link. The agent will join and handle all documentation.
              </p>

              <div className="w-full max-w-lg space-y-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i className="fas fa-link text-slate-400"></i>
                  </div>
                  <input
                    type="text"
                    value={meetingLink}
                    onChange={e => setMeetingLink(e.target.value)}
                    placeholder="https://zoom.us/j/123456789..."
                    className="block w-full pl-11 pr-4 py-4 border border-slate-200 rounded-2xl bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={startMeeting}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                  >
                    
                    Join &amp; Start
                  </button>
                  <button
                    onClick={() => { setMeetingLink(''); startMeeting(); }}
                    className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-8 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                  >
                    
                    Use Local Mic
                  </button>
                </div>

                
              </div>
            </div>
          )}

          {(status === MeetingStatus.LISTENING || status === MeetingStatus.PROCESSING) && (
            <LiveMeeting
              transcripts={transcripts}
              onAddTranscript={handleNewTranscript}
              onStop={stopMeeting}
              isProcessing={status === MeetingStatus.PROCESSING}
              meetingLink={meetingLink}
            />
          )}

          {status === MeetingStatus.COMPLETED && meetingData && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-8">
                <SummaryView summary={meetingData.summary} />
                <ActionItemView actionItems={meetingData.actionItems} />
              </div>
              <div>
                <EmailDraftView draft={meetingData.followUpEmail} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;