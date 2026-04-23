
export enum MeetingStatus {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED'
}

export interface ActionItem {
  id: string;
  task: string;
  assignee: string;
  priority: 'High' | 'Medium' | 'Low';
}

export interface MeetingData {
  transcript: string;
  summary: string;
  actionItems: ActionItem[];
  followUpEmail: string;
}

export interface TranscriptionEntry {
  speaker: 'User' | 'Model' | 'System';
  text: string;
  timestamp: Date;
}
