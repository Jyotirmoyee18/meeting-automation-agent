import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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

export function exportPdf(
  meeting: Meeting,
  segments: TranscriptSegment[],
  analysis: MeetingAnalysis | null,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const addPage = () => {
    doc.addPage();
    y = margin;
  };

  const checkPageBreak = (needed = 10) => {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      addPage();
    }
  };

  const addHeading = (text: string, size = 14) => {
    checkPageBreak(12);
    doc.setFontSize(size);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(text, margin, y);
    y += size * 0.5 + 3;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  };

  const addBody = (text: string, size = 9) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(text, contentW) as string[];
    lines.forEach(line => {
      checkPageBreak(size * 0.5 + 2);
      doc.text(line, margin, y);
      y += size * 0.5 + 2;
    });
  };

  const addBullet = (text: string) => {
    checkPageBreak(6);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const wrapped = doc.splitTextToSize(`• ${text}`, contentW - 4) as string[];
    wrapped.forEach((line, i) => {
      checkPageBreak(5);
      doc.text(line, margin + (i > 0 ? 4 : 0), y);
      y += 5;
    });
  };

  // ── Title page header ────────────────────────────────────────────────────
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageW, 30, 'F');
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('VoxNote AI', margin, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Meeting Transcript & Analysis', margin, 20);
  y = 38;

  // ── Meeting metadata ──────────────────────────────────────────────────────
  addHeading(meeting.title, 14);
  addBody(`Date: ${formatDate(meeting.created_at)}`);
  addBody(`Duration: ${formatDuration(meeting.duration_seconds)}`);
  y += 4;

  // ── Analysis ──────────────────────────────────────────────────────────────
  if (analysis && analysis.status === 'completed') {
    addHeading('Summary');
    addBody(analysis.summary ?? '');
    y += 3;

    if (analysis.keyPoints.length > 0) {
      addHeading('Key Discussion Points');
      analysis.keyPoints.forEach(p => addBullet(p));
      y += 3;
    }

    if (analysis.decisions.length > 0) {
      addHeading('Decisions Made');
      analysis.decisions.forEach(d => addBullet(d));
      y += 3;
    }

    if (analysis.actionItems.length > 0) {
      addHeading('Action Items');
      const tableData = analysis.actionItems.map(item => [
        item.completed ? '✓' : '○',
        item.task,
        item.owner ?? '—',
        item.deadline ?? '—',
      ]);
      autoTable(doc, {
        startY: y,
        head: [['', 'Task', 'Owner', 'Deadline']],
        body: tableData,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [79, 70, 229] as [number, number, number] },
        columnStyles: { 0: { cellWidth: 8 }, 2: { cellWidth: 30 }, 3: { cellWidth: 25 } },
        didDrawPage: () => { y = (doc as any).lastAutoTable.finalY + 4; },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    if (analysis.followUpQuestions.length > 0) {
      addHeading('Follow-up Questions');
      analysis.followUpQuestions.forEach(q => addBullet(q));
      y += 3;
    }
  }

  // ── Transcript ────────────────────────────────────────────────────────────
  addHeading('Full Transcript');

  segments.forEach(seg => {
    const ts = formatTimestamp(seg.startTime);
    const speaker = speakerLabel(seg.speaker);
    const label = `${ts} ${speaker}:`;

    checkPageBreak(10);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(79, 70, 229);
    doc.text(label, margin, y);
    y += 4;

    addBody(seg.text, 9);
    y += 2;
  });

  doc.save(`${slugify(meeting.title)}_report.pdf`);
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
