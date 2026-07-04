import express, { Request, Response, NextFunction } from 'express';
import { meetingRepository, segmentRepository, analysisRepository } from '../repositories/meetingRepository';
import { GeminiProvider } from '../providers/claudeProvider';

const router = express.Router();

// ─── Input Validation ─────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidId = (id: string): boolean => UUID_RE.test(id);

// ─── GET /api/meetings ────────────────────────────────────────────────────────

router.get('/', (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const offset = Number(req.query.offset ?? 0);
    const meetings = meetingRepository.findAll(search || undefined, limit, offset);

    // Attach analysis status
    const meetingsWithAnalysis = meetings.map(m => {
      const analysis = analysisRepository.findByMeetingId(m.id);
      return {
        ...m,
        analysisStatus: analysis?.status ?? null,
        summary: analysis?.summary ?? null,
      };
    });

    res.json({ meetings: meetingsWithAnalysis, total: meetingsWithAnalysis.length });
  } catch (err: any) {
    console.error('[API] GET /meetings error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve meetings' });
  }
});

// ─── GET /api/meetings/:id ────────────────────────────────────────────────────

router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    res.status(400).json({ error: 'Invalid meeting ID' });
    return;
  }

  try {
    const meeting = meetingRepository.findById(id);
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    const segments = segmentRepository.findByMeetingId(id);
    const analysis = analysisRepository.findByMeetingId(id);

    const parsedAnalysis = analysis ? {
      ...analysis,
      keyPoints: safeParseJson(analysis.key_points, []),
      decisions: safeParseJson(analysis.decisions, []),
      actionItems: safeParseJson(analysis.action_items, []),
      followUpQuestions: safeParseJson(analysis.follow_up_questions, []),
    } : null;

    res.json({ meeting, segments, analysis: parsedAnalysis });
  } catch (err: any) {
    console.error('[API] GET /meetings/:id error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve meeting' });
  }
});

// ─── POST /api/meetings/:id/retry-analysis ────────────────────────────────────

router.post('/:id/retry-analysis', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    res.status(400).json({ error: 'Invalid meeting ID' });
    return;
  }

  try {
    const meeting = meetingRepository.findById(id);
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    const segments = segmentRepository.findByMeetingId(id);
    const transcript = segments.map(s => {
      const label = s.speaker !== null ? `Speaker ${(s.speaker as number) + 1}: ` : '';
      return `${label}${s.text}`;
    }).join('\n');

    if (!transcript.trim()) {
      res.status(422).json({ error: 'No transcript content to analyze' });
      return;
    }

    // Mark as running
    analysisRepository.create(id);
    res.json({ status: 'running', message: 'Analysis started' });

    // Run async
    try {
      const gemini = new GeminiProvider();
      const result = await gemini.analyzeTranscript(transcript, meeting.title);
      analysisRepository.complete(id, { ...result, model: gemini.getModel() });
    } catch (err: any) {
      analysisRepository.fail(id, err?.message ?? 'Analysis failed');
    }
  } catch (err: any) {
    console.error('[API] POST retry-analysis error:', err.message);
    res.status(500).json({ error: 'Failed to start analysis' });
  }
});

// ─── PATCH /api/meetings/:id ──────────────────────────────────────────────────

router.patch('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    res.status(400).json({ error: 'Invalid meeting ID' });
    return;
  }

  const { title } = req.body as { title?: unknown };
  if (typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'Invalid title' });
    return;
  }

  try {
    const meeting = meetingRepository.findById(id);
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }
    meetingRepository.updateTitle(id, title.trim());
    res.json({ success: true });
  } catch (err: any) {
    console.error('[API] PATCH /meetings/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeParseJson<T>(val: string | null, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

export default router;
