import html2pdf from 'html2pdf.js';
import { Meeting, TranscriptSegment, MeetingAnalysis, AnalysisActionItem } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (!seconds) return 'Unknown';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatTimestamp(seconds: number | null): string {
  if (seconds === null) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`;
}

function speakerLabel(speaker: number | null): string {
  return speaker !== null ? `Speaker ${speaker + 1}` : 'Speaker';
}

// ─── TXT Export ───────────────────────────────────────────────────────────────

export function exportTxt(meeting: Meeting, segments: TranscriptSegment[]): void {
  const lines: string[] = [
    `MEETING TRANSCRIPT`,
    `==================`,
    `Title:    ${meeting.title}`,
    `Date:     ${formatDate(meeting.created_at)}`,
    `Duration: ${formatDuration(meeting.duration_seconds)}`,
    ``,
    `TRANSCRIPT`,
    `----------`,
    ``,
  ];

  segments.forEach(seg => {
    const ts = formatTimestamp(seg.startTime);
    const speaker = speakerLabel(seg.speaker);
    lines.push(`${ts} ${speaker}: ${seg.text}`);
  });

  downloadFile(
    `${slugify(meeting.title)}_transcript.txt`,
    lines.join('\n'),
    'text/plain',
  );
}

// ─── Markdown Export ──────────────────────────────────────────────────────────

export function exportMarkdown(
  meeting: Meeting,
  segments: TranscriptSegment[],
  analysis: MeetingAnalysis | null,
): void {
  const lines: string[] = [
    `# ${meeting.title}`,
    ``,
    `**Date:** ${formatDate(meeting.created_at)}  `,
    `**Duration:** ${formatDuration(meeting.duration_seconds)}`,
    ``,
  ];

  if (analysis && analysis.status === 'completed') {
    lines.push(`## Summary`, ``, analysis.summary ?? '', ``);

    if (analysis.keyPoints.length > 0) {
      lines.push(`## Key Discussion Points`, ``);
      analysis.keyPoints.forEach(p => lines.push(`- ${p}`));
      lines.push('');
    }

    if (analysis.decisions.length > 0) {
      lines.push(`## Decisions Made`, ``);
      analysis.decisions.forEach(d => lines.push(`- ${d}`));
      lines.push('');
    }

    if (analysis.actionItems.length > 0) {
      lines.push(`## Action Items`, ``);
      analysis.actionItems.forEach(item => {
        const check = item.completed ? '[x]' : '[ ]';
        const owner = item.owner ? ` *(${item.owner})*` : '';
        const deadline = item.deadline ? ` — due ${item.deadline}` : '';
        lines.push(`- ${check} ${item.task}${owner}${deadline}`);
      });
      lines.push('');
    }

    if (analysis.followUpQuestions.length > 0) {
      lines.push(`## Follow-up Questions`, ``);
      analysis.followUpQuestions.forEach(q => lines.push(`- ${q}`));
      lines.push('');
    }
  }

  lines.push(`## Full Transcript`, ``);
  segments.forEach(seg => {
    const ts = formatTimestamp(seg.startTime);
    const speaker = speakerLabel(seg.speaker);
    lines.push(`**${ts} ${speaker}:** ${seg.text}`, ``);
  });

  downloadFile(
    `${slugify(meeting.title)}_notes.md`,
    lines.join('\n'),
    'text/markdown',
  );
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

export async function exportPdf(
  meeting: Meeting,
  segments: TranscriptSegment[],
  analysis: MeetingAnalysis | null,
): Promise<void> {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = '800px'; // fixed width for PDF rendering
  container.style.fontFamily = 'sans-serif';
  
  let html = `
    <div style="padding: 40px; color: #334155; font-family: sans-serif;">
      <div style="background-color: #4f46e5; color: white; padding: 20px 30px; border-radius: 8px; margin-bottom: 20px;">
        <h1 style="margin: 0; font-size: 24px;">VoxNote AI</h1>
        <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Meeting Transcript & Analysis</p>
      </div>
      
      <div style="margin-bottom: 30px;">
        <h2 style="margin: 0 0 10px 0; font-size: 20px; color: #0f172a;">${meeting.title}</h2>
        <p style="margin: 0 0 5px 0; font-size: 14px;"><strong>Date:</strong> ${formatDate(meeting.created_at)}</p>
        <p style="margin: 0; font-size: 14px;"><strong>Duration:</strong> ${formatDuration(meeting.duration_seconds)}</p>
      </div>
  `;

  if (analysis && analysis.status === 'completed') {
    html += `
      <h2 style="font-size: 18px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 30px;">Summary</h2>
      <p style="font-size: 14px; line-height: 1.6;">${analysis.summary || ''}</p>
    `;

    if (analysis.keyPoints.length > 0) {
      html += `
        <h2 style="font-size: 18px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 20px;">Key Discussion Points</h2>
        <ul style="font-size: 14px; line-height: 1.6; padding-left: 20px;">
          ${analysis.keyPoints.map(p => `<li>${p}</li>`).join('')}
        </ul>
      `;
    }

    if (analysis.decisions.length > 0) {
      html += `
        <h2 style="font-size: 18px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 20px;">Decisions Made</h2>
        <ul style="font-size: 14px; line-height: 1.6; padding-left: 20px;">
          ${analysis.decisions.map(p => `<li>${p}</li>`).join('')}
        </ul>
      `;
    }

    if (analysis.actionItems.length > 0) {
      html += `
        <h2 style="font-size: 18px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 20px;">Action Items</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 10px;">
          <thead>
            <tr style="background-color: #4f46e5; color: white;">
              <th style="padding: 8px; text-align: left;">Status</th>
              <th style="padding: 8px; text-align: left;">Task</th>
              <th style="padding: 8px; text-align: left;">Owner</th>
              <th style="padding: 8px; text-align: left;">Deadline</th>
            </tr>
          </thead>
          <tbody>
            ${analysis.actionItems.map(item => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px;">${item.completed ? '✓' : '○'}</td>
                <td style="padding: 8px;">${item.task}</td>
                <td style="padding: 8px;">${item.owner ?? '—'}</td>
                <td style="padding: 8px;">${item.deadline ?? '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    if (analysis.followUpQuestions.length > 0) {
      html += `
        <h2 style="font-size: 18px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 20px;">Follow-up Questions</h2>
        <ul style="font-size: 14px; line-height: 1.6; padding-left: 20px;">
          ${analysis.followUpQuestions.map(p => `<li>${p}</li>`).join('')}
        </ul>
      `;
    }
  }

  html += `
    <div style="page-break-before: always;"></div>
    <h2 style="font-size: 18px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 20px;">Full Transcript</h2>
  `;

  segments.forEach(seg => {
    const ts = formatTimestamp(seg.startTime);
    const speaker = speakerLabel(seg.speaker);
    html += `
      <div style="margin-bottom: 15px; page-break-inside: avoid;">
        <div style="font-size: 12px; font-weight: bold; color: #4f46e5; margin-bottom: 4px;">
          ${ts} ${speaker}:
        </div>
        <div style="font-size: 14px; line-height: 1.5; color: #334155;">
          ${seg.text}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
  document.body.appendChild(container);

  const opt = {
    margin: 10,
    filename: `${slugify(meeting.title)}_report.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    await html2pdf().set(opt).from(container).save();
  } finally {
    document.body.removeChild(container);
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'meeting';
}

function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
