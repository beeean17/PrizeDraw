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
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

const rankOrder: Rank[] = ['3등', '2등', '1등'];
const startPrizeOrder: Rank[] = ['1등', '2등', '3등'];
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

function getFullscreenElement(): Element | null {
  const fullscreenDocument = document as FullscreenDocument;
  return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
}

async function requestAppFullscreen() {
  const root = document.documentElement as FullscreenElement;

  if (root.requestFullscreen) {
    await root.requestFullscreen();
    return;
  }

  if (root.webkitRequestFullscreen) {
    await root.webkitRequestFullscreen();
    return;
  }

  throw new Error('이 브라우저에서 전체화면을 지원하지 않습니다.');
}

async function exitAppFullscreen() {
  const fullscreenDocument = document as FullscreenDocument;

  if (document.exitFullscreen) {
    await document.exitFullscreen();
    return;
  }

  if (fullscreenDocument.webkitExitFullscreen) {
    await fullscreenDocument.webkitExitFullscreen();
  }
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
      {Array.from({ length: 64 }, (_, index) => (
        <span key={index} style={{ '--i': index } as React.CSSProperties} />
      ))}
    </div>
  );
}

function LoadingRunner() {
  const [hasRunnerImage, setHasRunnerImage] = useState(false);

  return (
    <div className="loading-runner" role="img" aria-label="추첨 로딩 중">
      <div className="runner-track">
        <span className="runner-tick t1" />
        <span className="runner-tick t2" />
        <span className="runner-tick t3" />
        <span className="runner-fill" />
        <span className={`runner-sprite ${hasRunnerImage ? 'has-image' : ''}`}>
          <img
            className="runner-sheet"
            src={`${import.meta.env.BASE_URL}runner-character.png`}
            alt=""
            onLoad={() => setHasRunnerImage(true)}
            onError={() => setHasRunnerImage(false)}
            aria-hidden="true"
          />
          <span className="runner-head" />
          <span className="runner-body" />
          <span className="runner-arm left" />
          <span className="runner-arm right" />
          <span className="runner-leg left" />
          <span className="runner-leg right" />
        </span>
      </div>
    </div>
  );
}

function PixelStars() {
  return (
    <div className="pixel-stars" aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => (
        <span key={index} className={`pix-star s-${index % 4}`} style={{ '--i': index } as React.CSSProperties} />
      ))}
    </div>
  );
}

function Hearts({ count = 3 }: { count?: number }) {
  return (
    <div className="hearts" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <span key={index} className={`heart ${index < count ? 'on' : 'off'}`} />
      ))}
    </div>
  );
}

type CabinetAction = { label: string; onClick: () => void; disabled?: boolean };

export default function App() {
  const [view, setView] = useState<AppView>('START');
  const [eventName, setEventName] = useState('ST:talk 경품 추첨');
  const [inputText, setInputText] = useState('');
  const [drawResult, setDrawResult] = useState<DrawResult | null>(null);
  const [activeRank, setActiveRank] = useState<Rank | null>(null);
  const [drawPhase, setDrawPhase] = useState<DrawPhase>('idle');
  const [slotPreview, setSlotPreview] = useState('00****00');
  const [error, setError] = useState('');
  const [confettiActive, setConfettiActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const validation = useMemo(() => parseParticipants(inputText), [inputText]);
  const canLock = validation.validCount >= totalPrizeCount;
  const currentStage = getStageLabel(view, activeRank);

  useEffect(() => {
    if (drawPhase !== 'drawing' || validation.participants.length === 0) return undefined;

    const timer = window.setInterval(() => {
      const randomIndex = Math.floor(Math.random() * validation.participants.length);
      setSlotPreview(validation.participants[randomIndex]?.maskedId ?? '00****00');
    }, 70);

    return () => window.clearInterval(timer);
  }, [drawPhase, validation.participants]);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(Boolean(getFullscreenElement()));

    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('webkitfullscreenchange', syncFullscreenState);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      document.removeEventListener('webkitfullscreenchange', syncFullscreenState);
    };
  }, []);

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

    await delay(2600);
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
    setError('');
  }

  async function enterFullscreen() {
    try {
      setError('');
      await requestAppFullscreen();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '전체화면으로 전환할 수 없습니다.');
    }
  }

  async function exitFullscreen() {
    try {
      setError('');
      if (getFullscreenElement()) {
        await exitAppFullscreen();
      }
    } catch {
      setError('전체화면을 종료할 수 없습니다. Esc 키로 다시 시도해 주세요.');
    }
  }

  async function toggleFullscreen() {
    if (getFullscreenElement()) {
      await exitFullscreen();
      return;
    }

    await enterFullscreen();
  }

  const nextRank = activeRank ? rankOrder[rankOrder.indexOf(activeRank) + 1] : null;

  const livesCount = (() => {
    if (view === 'RESULT') return 0;
    if (view === 'DRAW' && activeRank) {
      return activeRank === '3등' ? 3 : activeRank === '2등' ? 2 : 1;
    }
    if (view === 'READY') return 3;
    return 3;
  })();

  const primaryAction: CabinetAction = (() => {
    if (view === 'START') return { label: 'START', onClick: () => setView('INPUT') };
    if (view === 'INPUT')
      return { label: 'LOCK', onClick: handleLockParticipants, disabled: !canLock };
    if (view === 'READY') return { label: 'DRAW', onClick: () => revealRank('3등') };
    if (view === 'DRAW') {
      if (drawPhase === 'drawing') return { label: '...', onClick: () => {}, disabled: true };
      if (nextRank) return { label: 'NEXT', onClick: () => revealRank(nextRank) };
      return { label: 'RESULT', onClick: () => setView('RESULT') };
    }
    return { label: 'AGAIN', onClick: resetAll };
  })();

  const secondaryAction: CabinetAction = {
    label: isFullscreen ? 'EXIT FULLSCREEN' : 'INSERT COIN',
    onClick: toggleFullscreen,
  };

  const tertiaryAction: CabinetAction = {
    label: 'RESET',
    onClick: resetAll,
  };

  return (
    <main className="app-shell">
      <PixelStars />
      <div className="cabinet">
        <img
          className="cabinet-frame"
          src={`${import.meta.env.BASE_URL}arcade-cabinet.png`}
          alt="Cand:ID ST:talk Prize Draw arcade cabinet"
        />
        <div className="arcade-bezel">
          <section className={`broadcast-frame view-${view.toLowerCase()}`}>
        <div className="scanlines-soft" aria-hidden="true" />
        <header className="topbar">
          <div className="hud-slot">
            <span className="hud-key">P1</span>
            <Hearts count={livesCount} />
          </div>
          <div className="hud-slot center">
            <span className="hud-key">STAGE</span>
            <span className="hud-val">{currentStage}</span>
          </div>
          <div className="hud-slot end">
            <span className="hud-key">SCORE</span>
            <span className="hud-val mono">
              {String((drawResult?.participantCount ?? validation.validCount) * 137).padStart(6, '0')}
            </span>
          </div>
        </header>

        <section className="content">
          {view === 'START' ? (
            <div className="hero">
              <div className="hero-copy">
                <div className="hud-strip center">
                  <span className="hud-chip">STAGE 1-1</span>
                  <span className="hud-chip alt">MODE · DRAW</span>
                  <span className="hud-chip outline">PRIZES · {totalPrizeCount}</span>
                </div>
                <h2 className="title-stack">
                  <span className="t-line t-en">St:talk</span>
                  <span className="t-line t-kr">경품 추첨</span>
                </h2>
                <div className="title-meter" aria-label="추첨 정보">
                  <span>PLAYERS {validation.validCount}</span>
                  <span>PRIZE TARGETS {totalPrizeCount}</span>
                  <span>SHA-256 READY</span>
                </div>
                <div className="game-prompt">
                  <span className="gp-arrow">▶</span>
                  <span>PRESS START BUTTON</span>
                </div>
              </div>
              <div className="prize-stack" aria-hidden="true">
                <div className="prize-stack-title">
                  <span className="psg">◆</span> SELECT TARGET PRIZE <span className="psg">◆</span>
                </div>
                {startPrizeOrder.map((rank, index) => {
                  const prize = prizeByRank[rank];
                  const prizeNumber = index + 1;

                  return (
                    <div className={`prize-card prize-${prizeNumber}`} key={rank}>
                      <span className="prize-no">PRIZE #{String(prizeNumber).padStart(2, '0')}</span>
                      <span className="prize-name">{prize.name}</span>
                      <span className="prize-count">×{prize.count}</span>
                      <img
                        className="prize-img"
                        src={`${import.meta.env.BASE_URL}prize-${prizeNumber}.png`}
                        alt=""
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {view === 'INPUT' ? (
            <div className="input-layout">
              <section className="panel input-panel">
                <div className="panel-head">
                  <div>
                    <p>STEP 01</p>
                    <h2>PLAYER ENTRY</h2>
                  </div>
                  <span className="hud-chip alt">INSERT DATA</span>
                </div>
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
                    샘플 10M~99M
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
                  placeholder={'student_id\n10000000\n11000000\n12000000'}
                />
              </section>

              <section className="panel validation-panel">
                <div className="panel-head">
                  <div>
                    <p>STEP 02</p>
                    <h2>VALIDATION SCAN</h2>
                  </div>
                  <span className="hud-chip outline">MIN · {totalPrizeCount}</span>
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
                <div className="hud-strip">
                  <span className="hud-chip">STAGE 1-2</span>
                  <span className="hud-chip alt">LOCKED IN</span>
                  <span className="hud-chip outline">PLAYERS · {drawResult.participantCount}</span>
                </div>
                <h2>READY?</h2>
                <p>
                  참가자 목록이 고정되었습니다. 방송 화면과 결과 파일에는 마스킹된 학번만 표시되며,
                  seed와 해시는 결과 파일에 같이 저장됩니다.
                </p>
                <div className="game-prompt">
                  <span className="gp-arrow">▶</span>
                  <span>PRESS START BUTTON TO DRAW</span>
                </div>
                <div className="actions">
                  <button className="primary" type="button" onClick={() => revealRank('3등')}>
                    ▶ DRAW
                  </button>
                  <button type="button" onClick={toggleFullscreen}>
                    ▣ {isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}
                  </button>
                  <button type="button" onClick={resetAll}>
                    ◀ EDIT
                  </button>
                </div>
              </div>
              <aside className="audit-panel">
                <div className="audit-title">◆ AUDIT LOG</div>
                <Stat label="PLAYERS" value={`${drawResult.participantCount}`} />
                <div className="audit-line">
                  <span>HASH · SHA-256</span>
                  <code>{drawResult.participantHash}</code>
                </div>
                <div className="audit-line">
                  <span>SEED</span>
                  <code>{drawResult.seed}</code>
                </div>
              </aside>
            </div>
          ) : null}

          {view === 'DRAW' && drawResult && activeRank ? (
            <div className={`draw-layout rank-${activeRank[0]}`}>
              <ConfettiBurst active={confettiActive} />
              <div className="draw-head">
                <h2>{drawPhase === 'drawing' ? 'TARGETING...' : 'WINNER!'}</h2>
              </div>

              {drawPhase === 'drawing' ? (
                <div className="slot-area">
                  <LoadingRunner />
                  <div className="slot-machine">{slotPreview}</div>
                </div>
              ) : (
                <WinnerGrid result={drawResult} rank={activeRank} />
              )}

              <div className="actions draw-actions">
                {drawPhase === 'revealed' && nextRank ? (
                  <button className="primary" type="button" onClick={() => revealRank(nextRank)}>
                    ▶ NEXT · {nextRank}
                  </button>
                ) : null}
                {drawPhase === 'revealed' && !nextRank ? (
                  <button className="primary" type="button" onClick={() => setView('RESULT')}>
                    ▶ FINAL RESULT
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {view === 'RESULT' && drawResult ? (
            <div className="grid grid-rows-[auto_1fr_auto] gap-[18px] h-full min-h-0 overflow-hidden">
              {/* head */}
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-[18px] pb-2.5 border-b-[3px] border-dashed border-pink">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[rgba(255,80,80,0.12)] text-arcade-red font-pixel-en text-[0.78rem] tracking-[0.2em] [box-shadow:0_0_0_2px_rgba(255,120,120,0.55)]">
                  <span className="w-2 h-2 bg-arcade-red-soft shadow-[0_0_8px_#ff7d8a] animate-blink-fast" />
                  GAME OVER
                </div>
                <h2 className="justify-self-center font-pixel-en text-[1.9rem] tracking-[0.08em] text-pink [text-shadow:3px_0_0_var(--color-blue-deep),-3px_0_0_var(--color-blue-deep),0_3px_0_var(--color-blue-deep),0_-3px_0_var(--color-blue-deep),0_0_18px_rgba(236,115,166,0.5)]">
                  FINAL LEADERBOARD
                </h2>
                <span className="justify-self-end text-blue-sky font-pixel-kr text-[1.08rem] tracking-[0.06em]">
                  {drawResult.eventName}
                </span>
              </div>

              {/* board */}
              <div className="grid grid-rows-[auto_1fr] min-h-0 overflow-hidden px-[18px] pt-[18px] pb-2 bg-black/45 backdrop-blur-[2px] [box-shadow:0_0_0_2px_rgba(54,72,154,0.6),inset_0_0_30px_rgba(54,72,154,0.18)]">
                <div className="grid grid-cols-[80px_1fr_1.1fr] gap-4 pb-3 border-b-2 border-[rgba(107,146,203,0.35)] font-pixel-en text-[0.82rem] text-blue-sky tracking-[0.18em]">
                  <div className="text-center">RANK</div>
                  <div className="text-left">WINNER ID</div>
                  <div className="text-right">PRIZE / SCORE</div>
                </div>
                <div className="lb-scroll min-h-0 h-full overflow-y-auto pr-1">
                  {(['1등', '2등', '3등'] as Rank[]).flatMap((rank) =>
                    drawResult.winners[rank].map((winner, idx) => {
                      const tier =
                        rank === '1등' ? 'r1' : rank === '2등' ? 'r2' : 'r3';
                      const rankNum =
                        rank === '1등' ? '01' : rank === '2등' ? '02' : String(idx + 3).padStart(2, '0');
                      const tierLabel =
                        rank === '1등' ? 'GOLD RANK' : rank === '2등' ? 'SILVER RANK' : 'BRONZE RANK';

                      const rowBase =
                        'lb-anim grid grid-cols-[80px_1fr_1.1fr] items-center gap-4 px-1 border-b border-white/5 transition-colors duration-150 hover:bg-white/5';
                      const rowTier =
                        tier === 'r1'
                          ? 'py-[22px] bg-[linear-gradient(90deg,rgba(236,115,166,0.18),transparent_70%)] !border-b-2 !border-b-[rgba(236,115,166,0.6)]'
                          : tier === 'r2'
                            ? 'py-[18px] bg-[linear-gradient(90deg,rgba(107,146,203,0.18),transparent_70%)]'
                            : 'py-[14px]';

                      const rankCls =
                        tier === 'r1'
                          ? 'font-pixel-en tracking-[0.02em] text-[2.65rem] text-pink [text-shadow:0_0_16px_var(--color-pink)]'
                          : tier === 'r2'
                            ? 'font-pixel-en tracking-[0.02em] text-[2.05rem] text-blue-sky'
                            : 'font-pixel-en tracking-[0.02em] text-[1.55rem] text-arcade-text';

                      const winnerCls =
                        tier === 'r1'
                          ? 'font-pixel-mono tracking-[0.04em] text-[2.2rem] text-arcade-yellow [text-shadow:0_0_14px_rgba(244,211,94,0.55)]'
                          : tier === 'r2'
                            ? 'font-pixel-mono tracking-[0.04em] text-[1.9rem] text-arcade-text'
                            : 'font-pixel-mono tracking-[0.04em] text-[1.5rem] text-arcade-text';

                      const prizeNameCls =
                        tier === 'r1'
                          ? 'font-pixel-kr tracking-[-0.01em] text-[1.55rem] text-pink'
                          : tier === 'r2'
                            ? 'font-pixel-kr tracking-[-0.01em] text-[1.48rem] text-pink'
                            : 'font-pixel-kr tracking-[-0.01em] text-[1.3rem] text-pink';

                      const prizeSubCls =
                        tier === 'r1'
                          ? 'font-pixel-en text-[0.7rem] tracking-[0.18em] text-arcade-yellow [text-shadow:2px_2px_0_var(--color-blue-darker)]'
                          : tier === 'r2'
                            ? 'font-pixel-en text-[0.76rem] tracking-[0.08em] text-blue-sky [text-shadow:2px_2px_0_var(--color-blue-darker)]'
                            : 'block font-pixel-en text-[0.7rem] tracking-[0.18em] text-[#c9824c] [text-shadow:2px_2px_0_#5a3425]';

                      return (
                        <div className={`${rowBase} ${rowTier}`} key={`${rank}-${winner.normalizedId}`}>
                          <div className="grid place-items-center">
                            <span className={rankCls}>{rankNum}</span>
                          </div>
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={winnerCls}>{winner.maskedId}</span>
                            {rank === '1등' ? (
                              <span className="px-2 py-[3px] bg-pink text-arcade-ink font-pixel-en text-[0.62rem] font-bold tracking-[0.08em] [box-shadow:0_0_0_2px_var(--color-arcade-bg),0_0_12px_var(--color-pink)] animate-blink-tag">
                                NEW HI-SCORE
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-1 min-w-0 text-right">
                            <span className={prizeNameCls}>{prizeByRank[rank].name}</span>
                            <span className={prizeSubCls}>{tierLabel}</span>
                          </div>
                        </div>
                      );
                    }),
                  )}
                </div>
              </div>

              {/* footer */}
              <div className="flex items-center justify-between gap-4 pt-3.5 border-t-[3px] border-dashed border-pink">
                <div className="flex items-center gap-2.5 text-blue-pale font-pixel-en text-[0.78rem] tracking-[0.15em]">
                  <span>PLAYERS {drawResult.participantCount}</span>
                  <span className="text-pink">·</span>
                  <span>GENERATED {new Date(drawResult.generatedAt).toLocaleString('ko-KR')}</span>
                </div>
                <DownloadButtons result={drawResult} />
              </div>
            </div>
          ) : null}
        </section>
          <footer className="statusbar">
            <div className="status-info">
              <span className="dot" />
              <span>PLAYERS {drawResult?.participantCount ?? validation.validCount}</span>
              <span>SHA-256</span>
              <span>v1.0.0</span>
            </div>
          </footer>
        </section>
          <div className="screen-glass" aria-hidden="true" />
      </div>
      <button
        type="button"
        className="hotspot hotspot-start"
        onClick={primaryAction.onClick}
        disabled={primaryAction.disabled}
        aria-label={primaryAction.label}
      />
      <button
        type="button"
        className="hotspot hotspot-full"
        onClick={secondaryAction.onClick}
        disabled={secondaryAction.disabled}
        aria-label={secondaryAction.label}
      />
      <button
        type="button"
        className="hotspot hotspot-reset"
        onClick={tertiaryAction.onClick}
        disabled={tertiaryAction.disabled}
        aria-label={tertiaryAction.label}
      />
      {isFullscreen ? (
        <button type="button" className="fullscreen-exit" onClick={exitFullscreen} aria-label="전체화면 종료">
          EXIT
        </button>
      ) : null}
    </div>
  </main>
  );
}
