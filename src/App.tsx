import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
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
      {Array.from({ length: 64 }, (_, index) => (
        <span key={index} style={{ '--i': index } as React.CSSProperties} />
      ))}
    </div>
  );
}

function LoadingRunner() {
  const [hasSpriteSheet, setHasSpriteSheet] = useState(false);

  return (
    <div className="loading-runner" role="img" aria-label="추첨 로딩 중">
      <div className="runner-track">
        <span className="runner-tick t1" />
        <span className="runner-tick t2" />
        <span className="runner-tick t3" />
        <span className="runner-fill" />
        <span className={`runner-sprite ${hasSpriteSheet ? 'has-sheet' : ''}`}>
          <img
            className="runner-sheet-probe"
            src={`${import.meta.env.BASE_URL}runner-sprite-sheet.png`}
            alt=""
            onLoad={() => setHasSpriteSheet(true)}
            onError={() => setHasSpriteSheet(false)}
          />
          <span className="runner-sheet" aria-hidden="true" />
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

function ArcadeCabinetPanel({
  primary,
  secondary,
  tertiary,
}: {
  primary: CabinetAction;
  secondary: CabinetAction;
  tertiary: CabinetAction;
}) {
  const joyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const baseTransform = 'translateX(-50%)';
    function onMove(e: MouseEvent) {
      const container = joyRef.current;
      const stick = stickRef.current;
      if (!container || !stick) return;
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 520) {
        // tilt the whole stick (shaft + ball move together as one rigid body)
        const angle = Math.atan2(dy, dx);
        const tiltDeg = Math.cos(angle) * 16; // left/right tilt only, capped
        stick.style.transform = `${baseTransform} rotate(${tiltDeg}deg)`;
      } else {
        stick.style.transform = baseTransform;
      }
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <div className="control-panel">
      <div className="control-panel-inner">
        <div className="cp-cell">
          <div className="joystick-3d" ref={joyRef}>
            <div className="j-base" />
            <div className="j-stick" ref={stickRef}>
              <div className="j-shaft" />
              <div className="j-ball" />
            </div>
          </div>
          <span className="cp-label">MOVE</span>
        </div>

        <div className="btn-group">
          <div className="cp-cell">
            <button
              type="button"
              className="ab3d pink"
              onClick={primary.onClick}
              disabled={primary.disabled}
              title={primary.label}
            >
              <div className="ab3d-cap" />
            </button>
            <span className="cp-label">{primary.label}</span>
          </div>
          <div className="cp-cell">
            <button
              type="button"
              className="ab3d yellow"
              onClick={secondary.onClick}
              disabled={secondary.disabled}
              title={secondary.label}
            >
              <div className="ab3d-cap" />
            </button>
            <span className="cp-label">{secondary.label}</span>
          </div>
          <div className="cp-cell">
            <button
              type="button"
              className="ab3d blue"
              onClick={tertiary.onClick}
              disabled={tertiary.disabled}
              title={tertiary.label}
            >
              <div className="ab3d-cap" />
            </button>
            <span className="cp-label">{tertiary.label}</span>
          </div>
        </div>

        <div className="cp-coin">
          <div className="coin-slot" />
          <span className="cp-label">INSERT COIN</span>
        </div>
      </div>
      <div className="cabinet-base" aria-hidden="true">
        <div className="base-door">
          <span className="base-door-slot" />
          <span className="base-door-label">PRIZE DRAW</span>
        </div>
      </div>
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

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
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
    label: 'FULL',
    onClick: toggleFullscreen,
  };

  const tertiaryAction: CabinetAction = {
    label: view === 'START' ? 'INFO' : 'RESET',
    onClick: () => {
      if (view === 'START') {
        window.alert('Cand:ID × ST:talk Prize Draw\nSHA-256 seed 기반 재현 가능 추첨');
        return;
      }
      resetAll();
    },
  };

  return (
    <main className="app-shell">
      <PixelStars />
      <div className="cabinet relative overflow-hidden">
        <div className="cabinet-shell" aria-hidden="true">
          <span className="cabinet-rail rail-left" />
          <span className="cabinet-rail rail-right" />
          <span className="cabinet-top-lip" />
          <span className="screen-shelf" />
          <span className="cabinet-lower-face" />
          <span className="cabinet-floor-shadow" />
        </div>
        <div className="marquee">
          <span className="m-glyph">◆</span>
          <h1 className="m-title">
            <span className="m-cand">Cand<i>:</i>ID</span>
            <span className="m-sep">×</span>
            <span className="m-sub">ST:talk Prize Draw</span>
          </h1>
          <span className="m-glyph">◆</span>
        </div>
        <div className="arcade-bezel">
          <div className="bezel-glow" aria-hidden="true" />
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
                  <span>PRESS PINK BUTTON TO START</span>
                </div>
              </div>
              <div className="prize-stack" aria-hidden="true">
                <div className="prize-stack-title">
                  <span className="psg">◆</span> SELECT TARGET PRIZE <span className="psg">◆</span>
                </div>
                <div className="prize-card prize-1">
                  <span className="prize-no">PRIZE #01</span>
                  <span className="badge">1등</span>
                  <span className="body">
                    <strong>스탠바이미</strong>
                    <em>×1</em>
                  </span>
                  <img
                    className="prize-img"
                    src={`${import.meta.env.BASE_URL}prize-1.png`}
                    alt=""
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                    }}
                  />
                </div>
                <div className="prize-card prize-2">
                  <span className="prize-no">PRIZE #02</span>
                  <span className="badge">2등</span>
                  <span className="body">
                    <strong>팬리스 선풍기</strong>
                    <em>×1</em>
                  </span>
                  <img
                    className="prize-img"
                    src={`${import.meta.env.BASE_URL}prize-2.png`}
                    alt=""
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                    }}
                  />
                </div>
                <div className="prize-card prize-3">
                  <span className="prize-no">PRIZE #03</span>
                  <span className="badge">3등</span>
                  <span className="body">
                    <strong>
                      생협
                      <br />
                      아메리카노
                    </strong>
                    <em>×30</em>
                  </span>
                  <img
                    className="prize-img"
                    src={`${import.meta.env.BASE_URL}prize-3.png`}
                    alt=""
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                    }}
                  />
                </div>
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
                  <span>PRESS PINK BUTTON TO DRAW</span>
                </div>
                <div className="actions">
                  <button className="primary" type="button" onClick={() => revealRank('3등')}>
                    ▶ DRAW
                  </button>
                  <button type="button" onClick={toggleFullscreen}>
                    ▣ FULLSCREEN
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
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[rgba(255,80,80,0.12)] text-arcade-red font-pixel-en text-[0.7rem] tracking-[0.2em] [box-shadow:0_0_0_2px_rgba(255,120,120,0.55)]">
                  <span className="w-2 h-2 bg-arcade-red-soft shadow-[0_0_8px_#ff7d8a] animate-blink-fast" />
                  GAME OVER
                </div>
                <h2 className="justify-self-center font-pixel-en text-[1.7rem] tracking-[0.08em] text-pink [text-shadow:3px_0_0_var(--color-blue-deep),-3px_0_0_var(--color-blue-deep),0_3px_0_var(--color-blue-deep),0_-3px_0_var(--color-blue-deep),0_0_18px_rgba(236,115,166,0.5)]">
                  FINAL LEADERBOARD
                </h2>
                <span className="justify-self-end text-blue-sky font-pixel-kr text-[0.95rem] tracking-[0.06em]">
                  {drawResult.eventName}
                </span>
              </div>

              {/* board */}
              <div className="grid grid-rows-[auto_1fr] min-h-0 overflow-hidden px-[18px] pt-[18px] pb-2 bg-black/45 backdrop-blur-[2px] [box-shadow:0_0_0_2px_rgba(54,72,154,0.6),inset_0_0_30px_rgba(54,72,154,0.18)]">
                <div className="grid grid-cols-[80px_1fr_1.1fr] gap-4 pb-3 border-b-2 border-[rgba(107,146,203,0.35)] font-pixel-en text-[0.72rem] text-blue-sky tracking-[0.18em]">
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
                          ? 'font-pixel-en tracking-[0.02em] text-[2.4rem] text-pink [text-shadow:0_0_16px_var(--color-pink)]'
                          : tier === 'r2'
                            ? 'font-pixel-en tracking-[0.02em] text-[1.85rem] text-blue-sky'
                            : 'font-pixel-en tracking-[0.02em] text-[1.4rem] text-arcade-text';

                      const winnerCls =
                        tier === 'r1'
                          ? 'font-pixel-mono tracking-[0.04em] text-[2rem] text-arcade-yellow [text-shadow:0_0_14px_rgba(244,211,94,0.55)]'
                          : tier === 'r2'
                            ? 'font-pixel-mono tracking-[0.04em] text-[1.7rem] text-arcade-text'
                            : 'font-pixel-mono tracking-[0.04em] text-[1.35rem] text-arcade-text';

                      const prizeNameCls =
                        tier === 'r1'
                          ? 'font-pixel-kr tracking-[-0.01em] text-[1.4rem] text-pink'
                          : tier === 'r2'
                            ? 'font-pixel-kr tracking-[-0.01em] text-[1.35rem] text-pink'
                            : 'font-pixel-kr tracking-[-0.01em] text-[1.16rem] text-pink';

                      const prizeSubCls =
                        tier === 'r1'
                          ? 'font-pixel-en text-[0.6rem] tracking-[0.18em] text-arcade-yellow [text-shadow:2px_2px_0_var(--color-blue-darker)]'
                          : tier === 'r2'
                            ? 'font-pixel-en text-[0.66rem] tracking-[0.08em] text-blue-sky [text-shadow:2px_2px_0_var(--color-blue-darker)]'
                            : 'block font-pixel-en text-[0.6rem] tracking-[0.18em] text-[#c9824c] [text-shadow:2px_2px_0_#5a3425]';

                      return (
                        <div className={`${rowBase} ${rowTier}`} key={`${rank}-${winner.normalizedId}`}>
                          <div className="grid place-items-center">
                            <span className={rankCls}>{rankNum}</span>
                          </div>
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={winnerCls}>{winner.maskedId}</span>
                            {rank === '1등' ? (
                              <span className="px-2 py-[3px] bg-pink text-arcade-ink font-pixel-en text-[0.55rem] font-bold tracking-[0.08em] [box-shadow:0_0_0_2px_var(--color-arcade-bg),0_0_12px_var(--color-pink)] animate-blink-tag">
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
                <div className="flex items-center gap-2.5 text-blue-pale font-pixel-en text-[0.7rem] tracking-[0.15em]">
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
              <span className="blink" style={{ marginLeft: 'auto', color: 'var(--c-yellow)' }}>
                ▶ PRESS BUTTON
              </span>
            </div>
          </footer>
          <div className="brick-strip" aria-hidden="true" />
        </section>
      </div>
      <ArcadeCabinetPanel
        primary={primaryAction}
        secondary={secondaryAction}
        tertiary={tertiaryAction}
      />
    </div>
  </main>
  );
}
