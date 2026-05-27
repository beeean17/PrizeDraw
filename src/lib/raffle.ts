import type {
  DrawResult,
  InvalidReason,
  InvalidRow,
  Participant,
  PrizeConfig,
  Rank,
  ValidationResult,
} from '../types/raffle';

export const STUDENT_ID_REGEX = /^\d{8}$/;

export const DEFAULT_PRIZES: PrizeConfig[] = [
  { rank: '3등', name: '생협 아메리카노', count: 30, revealOrder: 1 },
  { rank: '2등', name: '팬리스 선풍기', count: 1, revealOrder: 2 },
  { rank: '1등', name: '스탠바이미', count: 1, revealOrder: 3 },
];

export const totalPrizeCount = DEFAULT_PRIZES.reduce(
  (sum, prize) => sum + prize.count,
  0,
);

export function normalizeStudentId(value: string): string {
  return value.trim().replace(/\s+/g, '').replace(/[^\d]/g, '');
}

export function validateStudentId(value: string): boolean {
  return STUDENT_ID_REGEX.test(value);
}

export function maskStudentId(id: string): string {
  if (id.length <= 2) return '*'.repeat(id.length);
  if (id.length <= 4) {
    return `${id[0]}${'*'.repeat(id.length - 2)}${id[id.length - 1]}`;
  }

  return `${id.slice(0, 2)}${'*'.repeat(id.length - 4)}${id.slice(-2)}`;
}

export function reasonLabel(reason: InvalidReason): string {
  const labels: Record<InvalidReason, string> = {
    EMPTY: '빈 행',
    INVALID_FORMAT: '학번 형식 오류',
    DUPLICATE: '중복',
  };

  return labels[reason];
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells;
}

function extractInputRows(input: string): Array<{ rowIndex: number; value: string }> {
  const lines = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  return lines.reduce<Array<{ rowIndex: number; value: string }>>((rows, line, index) => {
    const cells = splitCsvLine(line);
    const firstCell = (cells[0] ?? '').trim();
    const lower = firstCell.toLowerCase();

    if (index === 0 && ['student_id', 'studentid', 'id', '학번'].includes(lower)) {
      return rows;
    }

    rows.push({ rowIndex: index + 1, value: firstCell });
    return rows;
  }, []);
}

export function parseParticipants(input: string): ValidationResult {
  const rows = extractInputRows(input);
  const seen = new Set<string>();
  const invalidRows: InvalidRow[] = [];
  const participants: Participant[] = [];

  for (const row of rows) {
    const rawValue = row.value.trim();

    if (!rawValue) {
      invalidRows.push({ rowIndex: row.rowIndex, rawValue: row.value, reason: 'EMPTY' });
      continue;
    }

    const normalizedId = normalizeStudentId(rawValue);

    if (!validateStudentId(normalizedId)) {
      invalidRows.push({
        rowIndex: row.rowIndex,
        rawValue: row.value,
        reason: 'INVALID_FORMAT',
      });
      continue;
    }

    if (seen.has(normalizedId)) {
      invalidRows.push({ rowIndex: row.rowIndex, rawValue: row.value, reason: 'DUPLICATE' });
      continue;
    }

    seen.add(normalizedId);
    participants.push({
      id: rawValue,
      normalizedId,
      maskedId: maskStudentId(normalizedId),
    });
  }

  participants.sort((a, b) => a.normalizedId.localeCompare(b.normalizedId));

  return {
    totalRows: rows.filter((row) => row.value.trim()).length,
    validCount: participants.length,
    duplicateCount: invalidRows.filter((row) => row.reason === 'DUPLICATE').length,
    invalidRows,
    participants,
  };
}

export async function sha256Hex(input: string): Promise<string> {
  if (!crypto.subtle) {
    throw new Error('현재 브라우저에서 SHA-256 기능을 사용할 수 없습니다.');
  }

  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function generateSeed(): string {
  if (!crypto.getRandomValues) {
    throw new Error('현재 브라우저에서 보안 난수 기능을 사용할 수 없습니다.');
  }

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function createParticipantHash(participants: Participant[]): Promise<string> {
  const sortedIds = participants.map((participant) => participant.normalizedId).sort();
  return sha256Hex(sortedIds.join('\n'));
}

export async function drawWinners(
  eventName: string,
  participants: Participant[],
  seed: string,
  prizes: PrizeConfig[] = DEFAULT_PRIZES,
): Promise<DrawResult> {
  if (participants.length < totalPrizeCount) {
    throw new Error(`참가자가 부족합니다. 현재 ${participants.length}명, 필요 ${totalPrizeCount}명`);
  }

  const scored = await Promise.all(
    participants.map(async (participant) => ({
      participant,
      score: await sha256Hex(`${seed}:${participant.normalizedId}`),
    })),
  );

  scored.sort((a, b) => a.score.localeCompare(b.score));

  const winners = {
    '1등': [],
    '2등': [],
    '3등': [],
  } as Record<Rank, Participant[]>;

  let cursor = 0;
  const drawOrder = [...prizes].sort((a, b) => a.revealOrder - b.revealOrder);

  for (const prize of drawOrder) {
    winners[prize.rank] = scored
      .slice(cursor, cursor + prize.count)
      .map((item) => item.participant);
    cursor += prize.count;
  }

  return {
    eventName,
    participantCount: participants.length,
    participantHash: await createParticipantHash(participants),
    seed,
    algorithm: 'SHA-256(seed + ":" + normalizedStudentId), ascending sort',
    winners,
    generatedAt: new Date().toISOString(),
    appVersion: '1.0.0',
  };
}

export function makeSampleData(): string {
  return Array.from({ length: 90 }, (_, index) => String((10 + index) * 1_000_000)).join('\n');
}

function publicResult(result: DrawResult) {
  return {
    eventName: result.eventName,
    participantCount: result.participantCount,
    participantHash: result.participantHash,
    seed: result.seed,
    algorithm: result.algorithm,
    winners: {
      '1등': result.winners['1등'].map((winner) => winner.normalizedId),
      '2등': result.winners['2등'].map((winner) => winner.normalizedId),
      '3등': result.winners['3등'].map((winner) => winner.normalizedId),
    },
    generatedAt: result.generatedAt,
    appVersion: result.appVersion,
  };
}

export function resultToJson(result: DrawResult): string {
  return JSON.stringify(publicResult(result), null, 2);
}

export function resultToCsv(result: DrawResult): string {
  const lines = ['rank,student_id'];
  const ranks: Rank[] = ['1등', '2등', '3등'];

  for (const rank of ranks) {
    for (const winner of result.winners[rank]) {
      lines.push(`${rank},${winner.normalizedId}`);
    }
  }

  return lines.join('\n');
}

export function downloadTextFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
