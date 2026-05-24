import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PRIZES,
  downloadTextFile,
  drawWinners,
  generateSeed,
  makeSampleData,
  parseParticipants,
  reasonLabel,
  resultToCsv,
  resultToJson,
  totalPrizeCount,
} from './lib/raffle';
import type { DrawResult, Rank, ValidationResult } from './types/raffle';

type AppView = 'START' | 'INPUT' | 'READY' | 'DRAW' | 'RESULT';
type DrawPhase = 'idle' | 'drawing' | 'revealed';

const rankOrder: Rank[] = ['3등', '2등', '1등'];
const prizeByRank = Object.fromEntries(
  DEFAULT_PRIZES.map((prize) => [prize.rank, prize]),
) as Record<Rank, (typeof DEFAULT_PRIZES)[number]>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function rankTitle(rank: Rank): string {
  const prize = prizeByRank[rank];
  return `${rank} ${prize.name} ${prize.count}명`;
}

function getStageLabel(view: AppView, activeRank: Rank | null): string {
  if (view === 'START') return '시작';
  if (view === 'INPUT') return '참가자 입력';
  if (view === 'READY') return '목록 고정 완료';
  if (view === 'RESULT') return '최종 결과';
  return activeRank ? `${activeRank} 추첨` : '추첨 진행';
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ValidationSummary({ validation }: { validation: ValidationResult }) {
  const errorCount = validation.invalidRows.filter((row) => row.reason !== 'DUPLICATE').length;

  return (
    <div className="summary-grid">
      <Stat label="입력 행" value={validation.totalRows} />
      <Stat label="유효 참가자" value={validation.validCount} tone="good" />
      <Stat label="중복" value={validation.duplicateCount} tone="warn" />
      <Stat label="오류" value={errorCount} tone={errorCount ? 'danger' : 'good'} />
    </div>
  );
}

function InvalidRowsTable({ validation }: { validation: ValidationResult }) {
  const rows = validation.invalidRows.slice(0, 8);

  if (!rows.length) {
    return <p className="quiet">오류나 중복 없이 정리되었습니다.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>행</th>
            <th>입력값</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.rowIndex}-${row.rawValue}-${row.reason}`}>
              <td>{row.rowIndex}</td>
              <td>{row.rawValue || '(빈 값)'}</td>
              <td>{reasonLabel(row.reason)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {validation.invalidRows.length > rows.length ? (
        <p className="quiet">외 {validation.invalidRows.length - rows.length}건이 더 있습니다.</p>
      ) : null}
    </div>
  );
}

function WinnerCard({ rank, maskedId, spotlight }: { rank: Rank; maskedId: string; spotlight?: boolean }) {
  return (
    <div className={`winner-card ${spotlight ? 'spotlight' : ''}`}>
      <span>
        {rank} {prizeByRank[rank].name}
      </span>
      <strong>{maskedId}</strong>
    </div>
  );
}

function WinnerGrid({ result, rank }: { result: DrawResult; rank: Rank }) {
  const winners = result.winners[rank];

  if (rank !== '3등') {
    return <WinnerCard rank={rank} maskedId={winners[0]?.maskedId ?? '-'} spotlight={rank === '1등'} />;
  }

  return (
    <div className="winner-grid">
      {winners.map((winner, index) => (
        <div className="small-winner" key={winner.normalizedId}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <strong>{winner.maskedId}</strong>
        </div>
      ))}
    </div>
  );
}

function DownloadButtons({ result }: { result: DrawResult }) {
  const stamp = result.generatedAt.slice(0, 10);

  return (
    <div className="actions">
      <button
        className="primary"
        type="button"
        onClick={() =>
          downloadTextFile(
            `raffle-result-${stamp}.json`,
            resultToJson(result),
            'application/json;charset=utf-8',
          )
        }
      >
        JSON 저장
      </button>
      <button
        type="button"
        onClick={() =>
          downloadTextFile(`raffle-result-${stamp}.csv`, resultToCsv(result), 'text/csv;charset=utf-8')
        }
      >
        CSV 저장
      </button>
    </div>
  );
}

function ConfettiBurst({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 42 }, (_, index) => (
        <span key={index} style={{ '--i': index } as React.CSSProperties} />
      ))}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<AppView>('START');
  const [eventName, setEventName] = useState('ST:talk 경품 추첨');
  const [inputText, setInputText] = useState('');
  const [drawResult, setDrawResult] = useState<DrawResult | null>(null);
  const [activeRank, setActiveRank] = useState<Rank | null>(null);
  const [drawPhase, setDrawPhase] = useState<DrawPhase>('idle');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [slotPreview, setSlotPreview] = useState('2026***000');
  const [error, setError] = useState('');
  const [confettiActive, setConfettiActive] = useState(false);

  const validation = useMemo(() => parseParticipants(inputText), [inputText]);
  const canLock = validation.validCount >= totalPrizeCount;
  const currentStage = getStageLabel(view, activeRank);

  useEffect(() => {
    if (drawPhase !== 'drawing' || validation.participants.length === 0) return undefined;

    const timer = window.setInterval(() => {
      const randomIndex = Math.floor(Math.random() * validation.participants.length);
      setSlotPreview(validation.participants[randomIndex]?.maskedId ?? '2026***000');
    }, 70);

    return () => window.clearInterval(timer);
  }, [drawPhase, validation.participants]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setInputText(await file.text());
      setError('');
    } catch {
      setError('파일을 읽을 수 없습니다. CSV 형식이나 인코딩을 확인해 주세요.');
    }
  }

  async function handleLockParticipants() {
    try {
      const seed = generateSeed();
      const result = await drawWinners(eventName.trim() || '경품 추첨', validation.participants, seed);
      setDrawResult(result);
      setActiveRank(null);
      setDrawPhase('idle');
      setCountdown(null);
      setError('');
      setView('READY');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '참가자 목록을 고정할 수 없습니다.');
    }
  }

  async function revealRank(rank: Rank) {
    if (!drawResult) return;

    setView('DRAW');
    setActiveRank(rank);
    setDrawPhase('drawing');
    setConfettiActive(false);

    for (const value of [3, 2, 1]) {
      setCountdown(value);
      await delay(850);
    }

    setCountdown(null);
    setDrawPhase('revealed');

    if (rank === '1등') {
      setConfettiActive(true);
      window.setTimeout(() => setConfettiActive(false), 2800);
    }
  }

  function resetAll() {
    const shouldReset =
      !drawResult ||
      window.confirm('참가자 목록을 다시 수정하면 현재 seed와 추첨 결과가 모두 초기화됩니다. 계속할까요?');

    if (!shouldReset) return;

    setView('INPUT');
    setDrawResult(null);
    setActiveRank(null);
    setDrawPhase('idle');
    setCountdown(null);
    setError('');
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  const nextRank = activeRank ? rankOrder[rankOrder.indexOf(activeRank) + 1] : null;

  return (
    <main className="app-shell">
      <section className="broadcast-frame">
        <header className="topbar">
          <div>
            <p>Prize Draw</p>
            <h1>{eventName || '경품 추첨'}</h1>
          </div>
          <div className="stage-pill">{currentStage}</div>
        </header>

        <section className="content">
          {view === 'START' ? (
            <div className="hero">
              <div className="hero-copy">
                <span className="eyebrow">방송용 데스크탑 웹</span>
                <h2>학번 기반 경품 추첨</h2>
                <p>
                  CSV 또는 텍스트로 참가자를 입력하고, seed와 참가자 해시가 남는 재현 가능한 방식으로
                  3등, 2등, 1등을 순서대로 공개합니다.
                </p>
                <div className="actions">
                  <button className="primary" type="button" onClick={() => setView('INPUT')}>
                    시작하기
                  </button>
                  <button type="button" onClick={toggleFullscreen}>
                    전체 화면
                  </button>
                </div>
              </div>
              <div className="prize-stack" aria-hidden="true">
                <div>
                  <span>1등</span>
                  스탠바이미 1명
                </div>
                <div>
                  <span>2등</span>
                  선풍기 1명
                </div>
                <div>
                  <span>3등</span>
                  생협 아메리카노 30명
                </div>
              </div>
            </div>
          ) : null}

          {view === 'INPUT' ? (
            <div className="input-layout">
              <section className="panel input-panel">
                <label className="field-label" htmlFor="event-name">
                  행사명
                </label>
                <input
                  id="event-name"
                  value={eventName}
                  onChange={(event) => setEventName(event.target.value)}
                  placeholder="행사명을 입력하세요"
                />

                <div className="upload-row">
                  <label className="file-button">
                    CSV 선택
                    <input accept=".csv,.txt,text/csv,text/plain" type="file" onChange={handleFileChange} />
                  </label>
                  <button type="button" onClick={() => setInputText(makeSampleData())}>
                    샘플 120명
                  </button>
                  <button type="button" onClick={() => setInputText('')}>
                    비우기
                  </button>
                </div>

                <label className="field-label" htmlFor="participant-input">
                  참가자 학번
                </label>
                <textarea
                  id="participant-input"
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                  placeholder={'student_id\n202612345\n202612346\n202612347'}
                />
              </section>

              <section className="panel validation-panel">
                <div className="panel-head">
                  <div>
                    <p>검증 결과</p>
                    <h2>참가자 목록 확인</h2>
                  </div>
                  <span>{totalPrizeCount}명 이상 필요</span>
                </div>
                <ValidationSummary validation={validation} />
                <InvalidRowsTable validation={validation} />
                {error ? <p className="error">{error}</p> : null}
                <div className="actions">
                  <button className="primary" type="button" disabled={!canLock} onClick={handleLockParticipants}>
                    참가자 목록 고정
                  </button>
                  <button type="button" onClick={() => setView('START')}>
                    처음으로
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          {view === 'READY' && drawResult ? (
            <div className="ready-layout">
              <div className="ready-main">
                <span className="eyebrow">목록 고정 완료</span>
                <h2>추첨을 시작할 준비가 끝났습니다.</h2>
                <p>
                  참가자 원본은 저장하지 않고, 방송 화면과 결과 파일에는 마스킹된 학번만 표시됩니다.
                </p>
                <div className="actions">
                  <button className="primary" type="button" onClick={() => revealRank('3등')}>
                    추첨 시작
                  </button>
                  <button type="button" onClick={toggleFullscreen}>
                    전체 화면
                  </button>
                  <button type="button" onClick={resetAll}>
                    목록 수정
                  </button>
                </div>
              </div>
              <aside className="audit-panel">
                <Stat label="참가자" value={`${drawResult.participantCount}명`} />
                <div className="audit-line">
                  <span>참가자 해시</span>
                  <code>{drawResult.participantHash}</code>
                </div>
                <div className="audit-line">
                  <span>Seed</span>
                  <code>{drawResult.seed}</code>
                </div>
              </aside>
            </div>
          ) : null}

          {view === 'DRAW' && drawResult && activeRank ? (
            <div className={`draw-layout rank-${activeRank[0]}`}>
              <ConfettiBurst active={confettiActive} />
              <div className="draw-head">
                <span className="eyebrow">{rankTitle(activeRank)}</span>
                <h2>{drawPhase === 'drawing' ? '추첨 중입니다' : '당첨자를 공개합니다'}</h2>
              </div>

              {drawPhase === 'drawing' ? (
                <div className="slot-area">
                  <div className="countdown">{countdown}</div>
                  <div className="slot-machine">{slotPreview}</div>
                </div>
              ) : (
                <WinnerGrid result={drawResult} rank={activeRank} />
              )}

              <div className="actions draw-actions">
                {drawPhase === 'revealed' && nextRank ? (
                  <button className="primary" type="button" onClick={() => revealRank(nextRank)}>
                    {nextRank} 추첨
                  </button>
                ) : null}
                {drawPhase === 'revealed' && !nextRank ? (
                  <button className="primary" type="button" onClick={() => setView('RESULT')}>
                    최종 결과
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {view === 'RESULT' && drawResult ? (
            <div className="result-layout">
              <div className="result-head">
                <span className="eyebrow">최종 결과</span>
                <h2>{drawResult.eventName}</h2>
              </div>
              <div className="result-columns">
                {(['1등', '2등', '3등'] as Rank[]).map((rank) => (
                  <section className="result-rank" key={rank}>
                    <h3>
                      {rank} <span>{prizeByRank[rank].name}</span>
                    </h3>
                    <div className="result-list">
                      {drawResult.winners[rank].map((winner) => (
                        <span key={winner.normalizedId}>{winner.maskedId}</span>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <div className="result-footer">
                <div>
                  <span>참가자 {drawResult.participantCount}명</span>
                  <span>생성 {new Date(drawResult.generatedAt).toLocaleString('ko-KR')}</span>
                </div>
                <DownloadButtons result={drawResult} />
              </div>
            </div>
          ) : null}
        </section>

        <footer className="statusbar">
          <span>참가자 {drawResult?.participantCount ?? validation.validCount}명</span>
          <span>방식 SHA-256 seed sort</span>
          <span>v1.0.0</span>
        </footer>
      </section>
    </main>
  );
}
