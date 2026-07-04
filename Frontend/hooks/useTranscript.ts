import { useRef, useState, useCallback, useEffect, RefObject } from 'react';
import { TranscriptSegment } from '../types';

interface UseTranscriptReturn {
  segments: TranscriptSegment[];
  interimText: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  addFinalSegment: (seg: Omit<TranscriptSegment, 'createdAt' | 'isInterim'>) => void;
  setInterimText: (text: string, speaker?: number | null) => void;
  clearAll: () => void;
  fullTranscriptText: string;
}

export function useTranscript(): UseTranscriptReturn {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const userScrolledRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll: only when user is near bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    userScrolledRef.current = !nearBottom;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Scroll to bottom when segments or interim change, if not manually scrolled
  useEffect(() => {
    if (userScrolledRef.current) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [segments, interimText]);

  const addFinalSegment = useCallback((seg: Omit<TranscriptSegment, 'createdAt' | 'isInterim'>) => {
    if (seenIdsRef.current.has(seg.id)) return; // dedup
    seenIdsRef.current.add(seg.id);

    const newSeg: TranscriptSegment = {
      ...seg,
      isFinal: true,
      isInterim: false,
      createdAt: new Date().toISOString(),
    };

    setSegments(prev => [...prev, newSeg]);
    setInterimText(''); // Clear interim when final arrives
  }, []);

  const setInterim = useCallback((text: string) => {
    setInterimText(text);
  }, []);

  const clearAll = useCallback(() => {
    setSegments([]);
    setInterimText('');
    seenIdsRef.current.clear();
    userScrolledRef.current = false;
  }, []);

  const fullTranscriptText = segments
    .map(s => {
      const label = s.speaker !== null ? `Speaker ${(s.speaker as number) + 1}: ` : '';
      return `${label}${s.text}`;
    })
    .join('\n');

  return {
    segments,
    interimText,
    scrollRef,
    addFinalSegment,
    setInterimText: setInterim,
    clearAll,
    fullTranscriptText,
  };
}
