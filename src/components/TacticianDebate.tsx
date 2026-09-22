'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useRhythmDetector } from '@/hooks/useRhythmDetector';
import { useGame } from '@/contexts/GameContext';
import { STRATEGISTS, STAGES } from '@/lib/gameData';

type Phase = 'TITLE' | 'CALIBRATION' | 'FACTION_SELECT' | 'STRATEGIST_SELECT' | 'STAGE_SELECT' | 'HEARING' | 'MEASUREMENT' | 'DEBATE';

export default function TacticianDebate() {
  const [phase, setPhase] = useState<Phase>('TITLE');
  const [selectedFaction, setSelectedFaction] = useState<'魏' | '呉' | '蜀' | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const { 
    currentStrategist, setCurrentStrategist, 
    currentStage, setCurrentStage,
    userGear, setUserGear,
    calibrationOffset, setCalibrationOffset,
    clearedStages, addClearedStage,
    playMode, setPlayMode,
    playerData, updatePlayerData, resetPlayerData,
    isLoaded
  } = useGame();
  
  // Rhythm Detector Hook
  const {
    state: detectorState,
    latencyOffset,
    tempo,
    trainingDiffs,
    setTempo,
    startCalibration,
    startTraining,
    stop,
    error: detectorError
  } = useRhythmDetector({
    initialOffset: calibrationOffset,
    onOffsetChange: setCalibrationOffset,
    playMode,
    metronomePattern: (currentStage?.metronomePattern || '全拍') as "全拍" | "2・4拍" | "1・3拍" | "4拍目のみ",
    targetBeat: (currentStage?.targetBeat || '表拍') as "表拍" | "裏拍"
  });
  
  // Measurement Result State
  const [averageDiff, setAverageDiff] = useState<number | null>(null);
  const wasTraining = useRef(false);
  
  // Debate State
  const [userExcuse, setUserExcuse] = useState('');
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [diagnosedWarlord, setDiagnosedWarlord] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState<any | null>(null);
  const [isDebating, setIsDebating] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (detectorState === 'training') {
        wasTraining.current = true;
    }
    
    // When we stop training, calculate the average and proceed
    if (wasTraining.current && detectorState === 'idle') {
        wasTraining.current = false;
        
        if (trainingDiffs && trainingDiffs.length > 0) {
            const sum = trainingDiffs.reduce((acc, val) => acc + Math.abs(val), 0);
            const avg = sum / trainingDiffs.length;
            setAverageDiff(Number(avg.toFixed(2)));
        } else {
            setAverageDiff(0);
        }
        setPhase('DEBATE');
    }
  }, [detectorState, trainingDiffs]);

  useEffect(() => {
    setUserExcuse('');
    setAiReply(null);
    setDiagnosedWarlord(null);
    setSessionStats(null);
    setAverageDiff(null);
  }, [currentStrategist, currentStage]);

  // Update tempo automatically when stage is selected
  useEffect(() => {
    if (currentStage) {
      setTempo(currentStage.bpm);
    }
  }, [currentStage, setTempo]);

  const handleStartMeasurement = () => {
    setUserExcuse('');
    setAiReply(null);
    setDiagnosedWarlord(null);
    setSessionStats(null);
    setAverageDiff(null);
    setPhase('MEASUREMENT');
  };

  const handleDebate = async () => {
    if (!userExcuse.trim() || !currentStrategist || !currentStage) return;
    
    setIsDebating(true);
    setAiReply(null);
    setDiagnosedWarlord(null);
    setSessionStats(null);
    
    try {
      const res = await fetch('/api/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          diffMs: averageDiff, 
          trainingDiffs,
          userExcuse,
          strategistId: currentStrategist.id,
          stageId: currentStage.id,
          userGear,
          playMode
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        setAiReply(data.tacticianMessage);
        setDiagnosedWarlord(data.diagnosedWarlord);
        setSessionStats(data.sessionStats);
        
        if (data.sessionStats && data.diagnosedWarlord) {
            updatePlayerData(data.sessionStats, data.diagnosedWarlord);
        }
        
        if (data.isPassed) {
          addClearedStage(currentStage.id);
        }
      } else {
        setAiReply(`エラーが発生した: ${data.error}`);
      }
    } catch (err) {
      setAiReply('通信に失敗した。');
    } finally {
      setIsDebating(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#0a0806] text-[#d4cbb3] font-serif p-4 md:p-8 flex items-center justify-center">
        <div className="text-xl text-[#b89947] tracking-widest animate-pulse">
          読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1512] text-[#d4cbb3] p-4 md:p-8 font-serif relative" style={{ backgroundImage: 'radial-gradient(#2b221a 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
      
      {/* Toast Notification (光栄風モーダル) */}
      {toastMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in px-4">
          <div className="bg-[#1a1512] border-2 border-[#b89947] max-w-md w-full shadow-[0_0_30px_rgba(184,153,71,0.3)]">
            <div className="bg-[#2b221a] text-[#cda434] text-center py-2 border-b border-[#b89947] tracking-widest font-bold">
              【 伝 令 】
            </div>
            <div className="p-8 text-center text-lg leading-relaxed">
              {toastMessage}
            </div>
            <div className="text-center pb-6">
              <button
                onClick={() => setToastMessage(null)}
                className="px-8 py-2 bg-[#b89947] text-[#14100c] hover:bg-[#cda434] transition-colors font-bold tracking-widest"
              >
                承知
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal (Koei Style) */}
      {confirmMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in px-4">
          <div className="w-full max-w-md bg-[#1a1512] border-2 border-red-900 shadow-[0_0_20px_rgba(150,0,0,0.5)]">
            <div className="bg-red-950 text-red-200 text-center py-2 border-b border-red-900 tracking-widest font-bold">
              【 軍 令 】
            </div>
            <div className="p-8 text-center text-lg leading-relaxed">
              {confirmMessage}
            </div>
            <div className="flex justify-center gap-6 pb-6">
              <button
                onClick={() => {
                  setConfirmMessage(null);
                  setConfirmAction(null);
                }}
                className="px-8 py-2 bg-[#1a1512] border border-[#4a3f32] text-[#8a7f62] hover:text-[#d4cbb3] hover:border-[#8a7f62] transition-colors"
              >
                否
              </button>
              <button
                onClick={() => {
                  if (confirmAction) confirmAction();
                  setConfirmMessage(null);
                  setConfirmAction(null);
                }}
                className="px-8 py-2 bg-red-900 text-red-100 hover:bg-red-800 transition-colors font-bold tracking-widest border border-red-700"
              >
                承知した
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto border-2 border-[#b89947] bg-[#14100c]/90 rounded-sm shadow-[0_0_15px_rgba(184,153,71,0.2)] overflow-hidden p-6 md:p-10">
        
        <h1 className="text-3xl md:text-5xl text-center mb-10 text-[#cda434] tracking-widest border-b border-[#3a2f24] pb-6" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
          裏拍の軍師
        </h1>

        {/* Phase -1: Title */}
        {phase === 'TITLE' && (
          <div className="animate-fade-in flex flex-col items-center justify-center space-y-12 py-10">
            <p className="text-[#b89947] text-lg tracking-widest">～ リズム感を鍛え、軍師と共に天下を獲れ ～</p>
            
            {/* Dashboard / 己の軌跡 */}
            {playerData && Object.keys(playerData.warlordHistory).length > 0 ? (
              <div className="w-full max-w-2xl bg-[#1a1512] border border-[#4a3f32] p-6 space-y-6">
                <h3 className="text-xl text-[#cda434] text-center border-b border-[#3a2f24] pb-2">【己の軌跡（戦歴）】</h3>
                
                <div className="flex flex-col md:flex-row gap-8">
                  <div className="flex-1 space-y-4">
                    <div className="text-center mb-4">
                      <div className="text-sm text-[#8a7f62]">現在の官位</div>
                      <div className="text-3xl text-[#cda434] font-bold">
                        {(() => {
                          const total = (playerData.baseStats.leadership + playerData.baseStats.martial + playerData.baseStats.intelligence + playerData.baseStats.charm);
                          if (total < 10) return '義勇兵';
                          if (total < 30) return '兵卒';
                          if (total < 60) return '什長';
                          if (total < 100) return '百人将';
                          if (total < 200) return '校尉';
                          if (total < 300) return '偏将軍';
                          return '大将軍';
                        })()}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {[
                        { label: '統率', value: playerData.baseStats.leadership },
                        { label: '武力', value: playerData.baseStats.martial },
                        { label: '知力', value: playerData.baseStats.intelligence },
                        { label: '魅力', value: playerData.baseStats.charm },
                      ].map(s => (
                        <div key={s.label} className="flex items-center gap-2">
                          <span className="text-[#b89947] w-12 text-sm">{s.label}</span>
                          <div className="flex-1 bg-[#110e0a] h-2 border border-[#3a2f24]">
                            <div className="bg-[#cda434] h-full" style={{ width: `${Math.min(100, (s.value / 100) * 100)}%` }} />
                          </div>
                          <span className="text-sm text-[#d4cbb3] w-8 text-right">{Math.floor(s.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 space-y-4 border-t md:border-t-0 md:border-l border-[#3a2f24] pt-4 md:pt-0 md:pl-8">
                    <div className="text-sm text-[#8a7f62] text-center mb-4">プレイスタイル傾向</div>
                    <div className="space-y-3">
                      {(() => {
                        const totalDiagnoses = Object.values(playerData.warlordHistory).reduce((a, b) => a + b, 0);
                        const sortedWarlords = Object.entries(playerData.warlordHistory).sort((a, b) => b[1] - a[1]).slice(0, 5);
                        return sortedWarlords.map(([name, count]) => {
                          const percent = Math.round((count / totalDiagnoses) * 100);
                          return (
                            <div key={name} className="space-y-1">
                              <div className="flex justify-between text-xs text-[#b89947]">
                                <span>{name}</span>
                                <span>{percent}%</span>
                              </div>
                              <div className="w-full bg-[#110e0a] h-1.5 border border-[#3a2f24]">
                                <div className="bg-red-800 h-full" style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-2xl bg-[#1a1512] border border-[#4a3f32] p-6 text-center text-[#8a7f62]">
                戦歴なし
              </div>
            )}

            <div className="w-full max-w-lg space-y-4 bg-[#1a1512] p-6 border border-[#4a3f32]">
              <label className="block text-[#b89947] text-center mb-2">【機材・設定の申告】</label>
              <textarea
                value={userGear}
                onChange={(e) => setUserGear(e.target.value)}
                placeholder="例：ストラトキャスター、Kemperを使用。レイテンシには自信がある。"
                className="w-full h-24 bg-[#0a0806] border border-[#4a3f32] text-[#d4cbb3] p-4 focus:outline-none focus:border-[#b89947] resize-none"
              />
              <p className="text-xs opacity-50 text-center">※この情報は保存され、全ての軍師との舌戦に引き継がれます。</p>
            </div>

            <div className="flex flex-col gap-6 w-full max-w-xs">
              <button
                onClick={() => {
                  if (!userGear.trim()) {
                    setToastMessage('機材やこだわりを入力せよ。');
                    return;
                  }
                  if (userGear.length > 200) {
                    setToastMessage('発言が長すぎる。200文字以内で申告せよ。');
                    return;
                  }
                  setPhase('FACTION_SELECT');
                }}
                className="w-full py-4 bg-[#b89947] text-[#14100c] text-2xl font-bold tracking-widest hover:bg-[#cda434] transition-all shadow-[0_0_20px_rgba(184,153,71,0.4)]"
              >
                出 陣
              </button>
              <button
                onClick={() => setPhase('CALIBRATION')}
                className="w-full py-3 border border-[#4a3f32] text-[#d4cbb3] hover:border-[#b89947] hover:text-[#b89947] transition-all"
              >
                軍備（キャリブレーション）
              </button>
            </div>
            
            <div className="mt-8 pt-8 w-full border-t border-[#3a2f24] text-center">
              <button
                onClick={() => {
                  setConfirmMessage('本当にこれまでの戦歴（蓄積データ）を全て破棄し、一介の兵卒に戻りますか？\nこの操作は取り消せません。');
                  setConfirmAction(() => () => {
                    resetPlayerData();
                    setToastMessage('戦歴をすべて初期化し、兵卒に戻りました。');
                  });
                }}
                className="text-xs text-red-900/60 hover:text-red-500 transition-colors"
              >
                戦歴を初期化（データ消去）
              </button>
            </div>
          </div>
        )}

        {/* Phase: Calibration (Global Settings) */}
        {phase === 'CALIBRATION' && (
          <div className="animate-fade-in space-y-8">
            <h2 className="text-2xl text-center text-[#b89947] mb-6">【軍備】遅延測定</h2>
            
            {detectorError && (
              <div className="max-w-2xl mx-auto p-4 bg-red-900/30 border border-red-800 text-red-200 text-sm text-center">
                {detectorError}
              </div>
            )}

            <div className="max-w-2xl mx-auto space-y-6 p-8 border border-[#3a2f24] bg-[#1a1512]">
              <p className="text-sm opacity-80 text-amber-200/90 font-bold mb-2">
                【重要】ヘッドフォンまたはスピーカーを、マイク（ギターのピックアップ等）に近づけてください。
              </p>
              <p className="text-xs opacity-70">
                純粋なハードウェアレイテンシを自動計測します。「測定開始」を押すと、短く甲高い音が8回自動で鳴り、マイクで拾って遅延を算出します（ユーザーの演奏は不要です）。
              </p>
              <p className="text-xs text-[#b89947] opacity-90 mt-2">
                ※検出されない場合は、PCの「マイク入力音量」を上げるか、OS側の「ノイズ抑制」設定をオフにしてください。有線接続（ループバックケーブル）が最も確実です。
              </p>
              
              <div className="text-center pt-6">
                <button
                  onClick={startCalibration}
                  disabled={detectorState !== 'idle'}
                  className="w-full max-w-xs mx-auto py-4 border-2 border-[#b89947] hover:bg-[#b89947] hover:text-[#14100c] transition-colors disabled:opacity-50 font-bold text-lg"
                >
                  {detectorState === 'calibrating' ? '自動測定中...' : '自動測定開始'}
                </button>
              </div>
              
              <div className="flex flex-col items-center gap-4 mt-8 bg-[#0a0806] border border-[#4a3f32] p-4">
                <div className="text-sm opacity-80 mb-2">手動微調整（マニュアルオフセット）</div>
                <div className="flex items-center gap-6">
                  <button
                    onClick={() => setCalibrationOffset(Math.max(0, calibrationOffset - 0.001))}
                    disabled={detectorState !== 'idle'}
                    className="w-12 h-12 flex items-center justify-center border border-[#4a3f32] hover:border-[#b89947] hover:text-[#cda434] bg-[#1a1512] transition-colors disabled:opacity-50 text-xl font-bold"
                  >
                    -
                  </button>
                  <div className="text-center min-w-[120px]">
                    <span className="text-3xl text-[#cda434] font-bold">{(calibrationOffset * 1000).toFixed(1)}</span>
                    <span className="text-lg ml-1">ms</span>
                  </div>
                  <button
                    onClick={() => setCalibrationOffset(calibrationOffset + 0.001)}
                    disabled={detectorState !== 'idle'}
                    className="w-12 h-12 flex items-center justify-center border border-[#4a3f32] hover:border-[#b89947] hover:text-[#cda434] bg-[#1a1512] transition-colors disabled:opacity-50 text-xl font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            
            <div className="text-center mt-8">
              <button onClick={() => setPhase('TITLE')} className="text-sm opacity-70 hover:opacity-100 hover:text-[#b89947] transition-colors">
                タイトルへ戻る
              </button>
            </div>
          </div>
        )}

        {/* Phase: Faction Selection */}
        {phase === 'FACTION_SELECT' && (
          <div className="animate-fade-in space-y-8">
            <h2 className="text-2xl text-center text-[#b89947] mb-6">【開府】勢力選択</h2>
            <div className="flex flex-col md:flex-row justify-center gap-6">
              {(['魏', '呉', '蜀'] as const).map(faction => (
                <button
                  key={faction}
                  onClick={() => {
                    setSelectedFaction(faction);
                    setPhase('STRATEGIST_SELECT');
                  }}
                  className="w-full md:w-48 p-8 border border-[#4a3f32] bg-[#1a1512] hover:bg-[#2b221a] hover:border-[#b89947] transition-all text-center flex flex-col items-center gap-4 group"
                >
                  <div className="w-24 h-24 rounded-full border-2 border-[#4a3f32] group-hover:border-[#cda434] flex items-center justify-center text-4xl text-[#b89947]">
                    {faction}
                  </div>
                </button>
              ))}
            </div>
            <div className="text-center mt-6">
              <button onClick={() => setPhase('TITLE')} className="text-sm opacity-50 hover:opacity-100 transition-opacity">
                タイトルへ戻る
              </button>
            </div>
          </div>
        )}

        {/* Phase 0: Strategist Selection */}
        {phase === 'STRATEGIST_SELECT' && selectedFaction && (
          <div className="animate-fade-in space-y-8">
            <h2 className="text-2xl text-center text-[#b89947] mb-6">【軍師選択】{selectedFaction}軍</h2>
            <div className="grid md:grid-cols-1 gap-4 max-w-3xl mx-auto">
              {STRATEGISTS.filter(s => s.faction === selectedFaction).map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    setCurrentStrategist(s);
                    setPhase('STAGE_SELECT');
                  }}
                  className="p-4 border border-[#4a3f32] bg-[#1a1512] hover:bg-[#2b221a] hover:border-[#b89947] transition-all flex flex-col md:flex-row items-center gap-6 text-left group"
                >
                  <div className="w-20 h-20 shrink-0 rounded-full border-2 border-[#4a3f32] group-hover:border-[#cda434] flex items-center justify-center text-2xl text-[#b89947] font-bold">
                    {s.name}
                  </div>
                  <div className="flex-1 space-y-2 w-full">
                    <div className="flex justify-between items-center border-b border-[#3a2f24] pb-2">
                      <span className="text-sm text-[#b89947]">{s.personality}</span>
                      <span className="text-xs px-2 py-1 bg-red-900/30 text-red-300 border border-red-900/50">許容誤差: {s.toleranceMs}ms</span>
                    </div>
                    <p className="text-[#d4cbb3] italic">
                      「{(() => {
                        const total = playerData.baseStats.leadership + playerData.baseStats.martial + playerData.baseStats.intelligence + playerData.baseStats.charm;
                        const tier = total < 60 ? 'beginner' : total < 200 ? 'veteran' : 'master';
                        return s.quotes[tier];
                      })()}」
                    </p>
                  </div>
                </button>
              ))}
            </div>
            <div className="text-center mt-6">
              <button onClick={() => setPhase('FACTION_SELECT')} className="text-sm opacity-50 hover:opacity-100 transition-opacity">
                勢力選択へ戻る
              </button>
            </div>
          </div>
        )}

        {/* Phase 1: Stage Selection */}
        {phase === 'STAGE_SELECT' && (
          <div className="animate-fade-in space-y-8">
            <h2 className="text-2xl text-center text-[#b89947] mb-6">【練兵選択】陣立て</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {STAGES.map((st, index) => {
                const isLocked = index > 0 && !clearedStages.includes(STAGES[index - 1].id);
                return (
                  <button
                    key={st.id}
                    disabled={isLocked}
                    onClick={() => {
                      if (!isLocked) {
                        setCurrentStage(st);
                        setPhase('HEARING');
                      }
                    }}
                    className={`p-6 border transition-all text-left flex flex-col gap-2 relative ${
                      isLocked 
                        ? 'border-[#2a2218] bg-[#110e0a] opacity-50 cursor-not-allowed' 
                        : 'border-[#4a3f32] bg-[#1a1512] hover:bg-[#2b221a] hover:border-[#b89947]'
                    }`}
                  >
                    {isLocked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <span className="text-[#b89947] font-bold tracking-widest bg-[#1a1512] px-4 py-1 border border-[#b89947]">未開放</span>
                      </div>
                    )}
                    <h3 className="text-xl text-[#cda434] border-b border-[#3a2f24] pb-2 flex justify-between">
                      {st.title}
                      {clearedStages.includes(st.id) && <span className="text-sm text-green-500">✓</span>}
                    </h3>
                    <div className="text-sm space-y-1 mt-2">
                      <p><span className="text-[#b89947]">BPM:</span> {st.bpm}</p>
                      <p><span className="text-[#b89947]">メトロノーム:</span> {st.metronomePattern}</p>
                      <p><span className="text-[#b89947]">ターゲット:</span> {st.targetBeat}</p>
                    </div>
                    <p className="text-xs opacity-70 mt-2">{st.description}</p>
                  </button>
                );
              })}
            </div>
            <div className="text-center mt-6">
              <button onClick={() => setPhase('STRATEGIST_SELECT')} className="text-sm opacity-50 hover:opacity-100 transition-opacity">
                軍師選択へ戻る
              </button>
            </div>
          </div>
        )}

        {/* Phase 2: Hearing */}
        {phase === 'HEARING' && currentStrategist && currentStage && (
          <div className="animate-fade-in space-y-8">
            <div className="text-center mb-6">
              <span className="inline-block border border-[#b89947] px-4 py-1 text-sm text-[#cda434]">
                担当軍師：{currentStrategist.name} ／ 目標陣：{currentStage.title}
              </span>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-20 h-20 bg-[#2b221a] border border-[#b89947] flex items-center justify-center shrink-0 font-bold text-xl">
                {currentStrategist.name}
              </div>
              <div className="flex-1 bg-[#1a1512] border border-[#4a3f32] p-4 text-lg leading-relaxed shadow-inner">
                「{(() => {
                  const total = playerData.baseStats.leadership + playerData.baseStats.martial + playerData.baseStats.intelligence + playerData.baseStats.charm;
                  const tier = total < 60 ? 'beginner' : total < 200 ? 'veteran' : 'master';
                  return currentStrategist.quotes[tier];
                })()}」
              </div>
            </div>
            
            <div className="space-y-4 bg-[#0a0806] border border-[#4a3f32] p-6">
              <label className="block text-[#b89947] mb-2 text-sm">【戦法（プレイスタイル）の選択】</label>
              <div className="flex gap-4">
                <button
                  onClick={() => setPlayMode('just')}
                  className={`flex-1 py-3 border transition-colors ${
                    playMode === 'just' 
                      ? 'border-[#cda434] bg-[#2b221a] text-[#cda434] font-bold' 
                      : 'border-[#4a3f32] bg-[#110e0a] text-[#8a7f62] hover:border-[#b89947]'
                  }`}
                >
                  正攻法（ジャスト）<br/><span className="text-xs opacity-70">目標遅延: 0ms</span>
                </button>
                <button
                  onClick={() => setPlayMode('laidback')}
                  className={`flex-1 py-3 border transition-colors ${
                    playMode === 'laidback' 
                      ? 'border-[#cda434] bg-[#2b221a] text-[#cda434] font-bold' 
                      : 'border-[#4a3f32] bg-[#110e0a] text-[#8a7f62] hover:border-[#b89947]'
                  }`}
                >
                  遅攻法（レイドバック）<br/><span className="text-xs opacity-70">目標遅延: +25ms (タメ)</span>
                </button>
              </div>
            </div>

            <div className="space-y-4 bg-[#0a0806] border border-[#4a3f32] p-6">
              <label className="block text-[#b89947] mb-2 text-sm">【貴公の申告した機材・設定】</label>
              <p className="text-[#d4cbb3] whitespace-pre-wrap">{userGear}</p>
            </div>

            <div className="flex justify-between items-center mt-8">
              <button onClick={() => setPhase('STAGE_SELECT')} className="text-sm opacity-50 hover:opacity-100 transition-opacity">
                陣立てへ戻る
              </button>
              <button
                onClick={handleStartMeasurement}
                className="px-8 py-3 bg-[#b89947] text-[#14100c] font-bold hover:bg-[#cda434] transition-colors"
              >
                出陣する
              </button>
            </div>
          </div>
        )}

        {/* Phase 3: Measurement */}
        {phase === 'MEASUREMENT' && currentStage && (
          <div className="animate-fade-in space-y-8">
            <h2 className="text-2xl text-center text-[#b89947] mb-6">【練兵場】</h2>
            
            {detectorError && (
              <div className="p-4 bg-red-900/30 border border-red-800 text-red-200">
                {detectorError}
              </div>
            )}
            
            <div className="max-w-xl mx-auto space-y-4 p-8 border border-[#3a2f24] bg-[#1a1512]">
              <h3 className="text-xl text-[#cda434] border-b border-[#3a2f24] pb-2 text-center">出陣（リズム測定）</h3>
              <p className="text-sm opacity-80 text-center">
                いざ、演習を開始する。一定の拍に合わせて音を刻むのだ。
              </p>
              
              <div className="flex items-center justify-center gap-4 py-6">
                <label className="text-[#b89947] text-lg">BPM:</label>
                <input
                  type="number"
                  value={tempo}
                  onChange={(e) => setTempo(Number(e.target.value))}
                  disabled={detectorState !== 'idle'}
                  className="w-24 bg-[#0a0806] border border-[#4a3f32] p-2 text-center text-xl focus:outline-none focus:border-[#b89947]"
                />
                <span className="text-sm opacity-50">推奨: {currentStage.bpm}</span>
              </div>
              
              <div className="text-center pt-4">
                {detectorState === 'training' ? (
                  <button
                    onClick={stop}
                    className="w-full max-w-xs mx-auto py-4 bg-red-900/50 border border-red-700 hover:bg-red-800 text-white font-bold transition-colors text-lg"
                  >
                    演習終了
                  </button>
                ) : (
                  <button
                    onClick={startTraining}
                    disabled={detectorState !== 'idle'}
                    className="w-full max-w-xs mx-auto py-4 bg-[#b89947] text-[#14100c] font-bold hover:bg-[#cda434] transition-colors disabled:opacity-50 text-lg"
                  >
                    演習開始
                  </button>
                )}
              </div>
            </div>
            
            <div className="text-center opacity-50 text-sm pt-4">
              状態: {detectorState.toUpperCase()}
            </div>
          </div>
        )}

        {/* Phase 4: Debate */}
        {phase === 'DEBATE' && currentStrategist && (
          <div className="animate-fade-in space-y-8">
            <h2 className="text-2xl text-center text-[#b89947] mb-6">【評定の間】</h2>
            
            <div className="text-center p-6 border border-[#b89947] bg-[#2b221a]">
              <div className="text-lg mb-2">平均のズレ</div>
              <div className="text-5xl text-[#cda434] font-bold tracking-wider">
                {averageDiff !== null ? averageDiff.toFixed(1) : '--'} <span className="text-xl">ms</span>
              </div>
            </div>

            {/* 詳細な戦況（今回の打点履歴） */}
            {trainingDiffs && trainingDiffs.length > 0 && (
              <div className="bg-[#1a1512] border border-[#4a3f32] p-4">
                <details className="group">
                  <summary className="text-[#b89947] font-bold cursor-pointer hover:text-[#cda434] transition-colors outline-none select-none flex justify-between items-center">
                    <span>【詳細な戦況（打点履歴）】</span>
                    <span className="text-sm group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="mt-4 max-h-60 overflow-y-auto pr-2 space-y-2">
                    {trainingDiffs.map((diff, idx) => {
                      // diff is raw diffMs. Negative means early (突っ込み), Positive means late (モタリ)
                      const isPerfect = Math.abs(diff) <= 15;
                      const isEarly = diff < -15;
                      const color = isPerfect ? 'text-green-500' : isEarly ? 'text-blue-400' : 'text-red-400';
                      const label = isPerfect ? '見事' : isEarly ? '走り' : 'モタリ';
                      
                      return (
                        <div key={idx} className="flex justify-between items-center text-sm border-b border-[#3a2f24] pb-1">
                          <span className="text-[#8a7f62]">第 {idx + 1} 打</span>
                          <span className={`font-mono w-24 text-right ${color}`}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(1)} ms
                          </span>
                          <span className={`w-12 text-center ${color}`}>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            )}

            <div className="space-y-4">
              <label className="block text-[#b89947]">【言い訳（反論）】</label>
              <textarea
                value={userExcuse}
                onChange={(e) => setUserExcuse(e.target.value)}
                placeholder="例：このズレは機材のせいだ。あるいは、あえてタメを作ったのだ。"
                className="w-full h-24 bg-[#0a0806] border border-[#4a3f32] text-[#d4cbb3] p-4 focus:outline-none focus:border-[#b89947] resize-none"
              />
              <div className="text-right">
                <button
                  onClick={handleDebate}
                  disabled={isDebating}
                  className="px-8 py-3 bg-[#b89947] text-[#14100c] font-bold hover:bg-[#cda434] transition-colors disabled:opacity-50"
                >
                  {isDebating ? '軍師考考中...' : '反論する'}
                </button>
              </div>
            </div>

            {aiReply && (
              <div className="mt-8 space-y-8 animate-fade-in w-full">
                {/* 1. 今回の軍議（セッション結果） */}
                <div className="flex gap-4 items-start w-full">
                  <div className="w-20 h-20 bg-[#2b221a] border border-[#b89947] flex items-center justify-center shrink-0 font-bold text-xl">
                    {currentStrategist.name}
                  </div>
                  <div className="flex-1 min-w-0 bg-[#1a1512] border border-[#4a3f32] p-6 shadow-inner overflow-hidden">
                    <div className="text-[#d4cbb3] text-lg leading-loose break-words whitespace-pre-wrap markdown-body">
                      <ReactMarkdown>{aiReply}</ReactMarkdown>
                    </div>
                  </div>
                </div>

                {diagnosedWarlord && sessionStats && (
                  <div className="bg-[#110e0a] border border-[#4a3f32] p-6 space-y-6">
                    <h3 className="text-xl text-[#cda434] text-center border-b border-[#3a2f24] pb-2">
                      今回の戦いぶり、まるで【<span className="text-2xl font-bold">{diagnosedWarlord}</span>】の如し
                    </h3>
                    <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
                      {[
                        { label: '統率', value: sessionStats.leadership },
                        { label: '武力', value: sessionStats.martial },
                        { label: '知力', value: sessionStats.intelligence },
                        { label: '魅力', value: sessionStats.charm },
                      ].map(s => (
                        <div key={s.label} className="space-y-1">
                          <div className="flex justify-between text-sm text-[#b89947]">
                            <span>{s.label}</span>
                            <span>{s.value}</span>
                          </div>
                          <div className="w-full bg-[#1a1512] h-2 border border-[#3a2f24]">
                            <div className="bg-[#b89947] h-full" style={{ width: `${Math.max(0, Math.min(100, s.value))}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. 己の軌跡（通算データ） */}
                {playerData && (
                  <div className="bg-[#1a1512] border border-[#4a3f32] p-6 space-y-6">
                    <h3 className="text-xl text-[#cda434] text-center border-b border-[#3a2f24] pb-2">【己の軌跡】</h3>
                    
                    <div className="flex flex-col md:flex-row gap-8">
                      <div className="flex-1 space-y-4">
                        <div className="text-center mb-4">
                          <div className="text-sm text-[#8a7f62]">現在の階級</div>
                          <div className="text-3xl text-[#cda434] font-bold">
                            {(() => {
                              const total = (playerData.baseStats.leadership + playerData.baseStats.martial + playerData.baseStats.intelligence + playerData.baseStats.charm);
                              if (total < 10) return '義勇兵';
                              if (total < 30) return '兵卒';
                              if (total < 60) return '什長';
                              if (total < 100) return '百人将';
                              if (total < 200) return '校尉';
                              if (total < 300) return '偏将軍';
                              return '大将軍';
                            })()}
                          </div>
                        </div>
                        <div className="space-y-2">
                          {[
                            { label: '統率', value: playerData.baseStats.leadership },
                            { label: '武力', value: playerData.baseStats.martial },
                            { label: '知力', value: playerData.baseStats.intelligence },
                            { label: '魅力', value: playerData.baseStats.charm },
                          ].map(s => (
                            <div key={s.label} className="flex items-center gap-2">
                              <span className="text-[#b89947] w-12 text-sm">{s.label}</span>
                              <div className="flex-1 bg-[#110e0a] h-2 border border-[#3a2f24]">
                                <div className="bg-[#cda434] h-full" style={{ width: `${Math.min(100, (s.value / 100) * 100)}%` }} />
                              </div>
                              <span className="text-sm text-[#d4cbb3] w-8 text-right">{Math.floor(s.value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex-1 space-y-4 border-t md:border-t-0 md:border-l border-[#3a2f24] pt-4 md:pt-0 md:pl-8">
                        <div className="text-sm text-[#8a7f62] text-center mb-4">武将診断 傾向</div>
                        <div className="space-y-3">
                          {(() => {
                            const totalDiagnoses = Object.values(playerData.warlordHistory).reduce((a, b) => a + b, 0);
                            if (totalDiagnoses === 0) return <div className="text-center text-xs opacity-50">記録なし</div>;
                            
                            const sortedWarlords = Object.entries(playerData.warlordHistory).sort((a, b) => b[1] - a[1]).slice(0, 5);
                            return sortedWarlords.map(([name, count]) => {
                              const percent = Math.round((count / totalDiagnoses) * 100);
                              return (
                                <div key={name} className="space-y-1">
                                  <div className="flex justify-between text-xs text-[#b89947]">
                                    <span>{name}</span>
                                    <span>{percent}%</span>
                                  </div>
                                  <div className="w-full bg-[#110e0a] h-1.5 border border-[#3a2f24]">
                                    <div className="bg-red-800 h-full" style={{ width: `${percent}%` }} />
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="text-center pt-8">
                <button
                  onClick={() => {
                    setUserExcuse('');
                    setAiReply(null);
                    setDiagnosedWarlord(null);
                    setSessionStats(null);
                    setAverageDiff(null);
                    setPhase('STRATEGIST_SELECT');
                  }}
                  className="text-sm opacity-70 hover:opacity-100 hover:text-[#b89947] transition-colors"
                >
                  最初からやり直す
                </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
