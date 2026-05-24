export type Rank = '1등' | '2등' | '3등';

export interface Participant {
  id: string;
  normalizedId: string;
  maskedId: string;
}

export type InvalidReason = 'EMPTY' | 'INVALID_FORMAT' | 'DUPLICATE';

export interface InvalidRow {
  rowIndex: number;
  rawValue: string;
  reason: InvalidReason;
}

export interface ValidationResult {
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  invalidRows: InvalidRow[];
  participants: Participant[];
}

export interface PrizeConfig {
  rank: Rank;
  name: string;
  count: number;
  revealOrder: number;
}

export interface DrawResult {
  eventName: string;
  participantCount: number;
  participantHash: string;
  seed: string;
  algorithm: string;
  winners: Record<Rank, Participant[]>;
  generatedAt: string;
  appVersion: string;
}
