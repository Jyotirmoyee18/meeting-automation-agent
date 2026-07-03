import { GoogleGenAI } from '@google/genai';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActionItem {
  task: string;
  owner: string | null;
  deadline: string | null;
  completed: boolean;
}

export interface MeetingAnalysisResult {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  followUpQuestions: string[];
}

// ─── Gemini Analysis Provider ─────────────────────────────────────────────────

export class GeminiProvider {
  private ai: GoogleGenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
  }

  getModel(): string {
    return this.model;
  }

  async analyzeTranscript(
    transcript: string,
    meetingTitle: string,
  ): Promise<MeetingAnalysisResult> {
    if (!transcript.trim()) {
      throw new Error('Cannot analyze an empty transcript');
    }

    const prompt = `You are an expert meeting analyst. Analyze the following meeting transcript and provide a structured analysis.

Meeting Title: ${meetingTitle}

Transcript:
${transcript}

Respond with ONLY valid JSON in exactly this format (no markdown, no code blocks, just raw JSON):
{
  "summary": "A concise 2-4 sentence summary of what was discussed",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3"],
  "decisions": ["Decision 1", "Decision 2"],
  "actionItems": [
    {
      "task": "Description of the task",
      "owner": "Person name or null if unspecified",
      "deadline": "Deadline string or null if unspecified",
      "completed": false
    }
  ],
  "followUpQuestions": ["Question 1", "Question 2"]
}

Rules:
- summary must be a non-empty string
- keyPoints must be an array of strings (can be empty)
- decisions must be an array of strings (can be empty)
- actionItems must be an array of objects matching the schema above
- followUpQuestions must be an array of strings (can be empty)
- All string values must be meaningful and based on the actual transcript content`;

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
    });

    const text = response.text ?? '';
    return this.parseAndValidate(text);
  }

  private parseAndValidate(rawText: string): MeetingAnalysisResult {
    // Strip markdown code fences if present
    let text = rawText.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Gemini returned non-JSON response');
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Gemini returned invalid response structure');
    }

    const obj = parsed as Record<string, unknown>;

    if (typeof obj.summary !== 'string' || !obj.summary.trim()) {
      throw new Error('Analysis missing required field: summary');
    }

    return {
      summary: obj.summary.trim(),
      keyPoints: this.toStringArray(obj.keyPoints),
      decisions: this.toStringArray(obj.decisions),
      actionItems: this.toActionItems(obj.actionItems),
      followUpQuestions: this.toStringArray(obj.followUpQuestions),
    };
  }

  private toStringArray(val: unknown): string[] {
    if (!Array.isArray(val)) return [];
    return val
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map(s => s.trim());
  }

  private toActionItems(val: unknown): ActionItem[] {
    if (!Array.isArray(val)) return [];
    return val
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map(item => ({
        task: typeof item.task === 'string' ? item.task.trim() : String(item.task ?? ''),
        owner: typeof item.owner === 'string' && item.owner.trim() ? item.owner.trim() : null,
        deadline: typeof item.deadline === 'string' && item.deadline.trim() ? item.deadline.trim() : null,
        completed: item.completed === true,
      }))
      .filter(item => item.task.length > 0);
  }
}
