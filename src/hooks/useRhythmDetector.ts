'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// --- Type Definitions ---
export interface RhythmDataJSON {
  expectedTime: number;
  actualDetectedTime: number;
  diffMs: number;
}

export type DetectorState = 'idle' | 'calibrating' | 'training';

export interface UseRhythmDetectorReturn {
  state: DetectorState;
  latencyOffset: number;
  tempo: number;
  trainingDiffs: number[];
  setTempo: (tempo: number) => void;
  startCalibration: () => Promise<void>;
  startTraining: () => Promise<void>;
  stop: () => void;
  error: string | null;
}

// Configuration constants
const LOOKAHEAD = 25.0; // ms
const SCHEDULE_AHEAD_TIME = 0.1; // s
const TRANSIENT_THRESHOLD = 0.1; // amplitude threshold for detecting transient

interface UseRhythmDetectorProps {
  initialOffset: number;
  onOffsetChange: (offset: number) => void;
  playMode: 'just' | 'laidback';
}

export const useRhythmDetector = ({ initialOffset, onOffsetChange, playMode }: UseRhythmDetectorProps): UseRhythmDetectorReturn => {
  const [state, setState] = useState<DetectorState>('idle');
  const [latencyOffset, setLatencyOffsetState] = useState<number>(initialOffset);
  const latencyOffsetRef = useRef<number>(initialOffset);

  const setLatencyOffset = (val: number) => {
    setLatencyOffsetState(val);
    latencyOffsetRef.current = val;
    onOffsetChange(val);
  };

  const [tempo, setTempoState] = useState<number>(120);
  const tempoRef = useRef<number>(120);
  const setTempo = useCallback((t: number) => {
    tempoRef.current = t;
    setTempoState(t);
  }, []);

  useEffect(() => {
    setLatencyOffsetState(initialOffset);
    latencyOffsetRef.current = initialOffset;
  }, [initialOffset]);
  
  const playModeRef = useRef<'just' | 'laidback'>(playMode);
  useEffect(() => {
    playModeRef.current = playMode;
  }, [playMode]);

  const [error, setError] = useState<string | null>(null);

  const [trainingDiffs, setTrainingDiffs] = useState<number[]>([]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Scheduling state
  const nextNoteTimeRef = useRef<number>(0);
  const current16thNoteRef = useRef<number>(0);
  const timerIDRef = useRef<number | null>(null);
  const beatsToScheduleRef = useRef<{ beatNumber: number; time: number }[]>([]);

  // Calibration state
  const calibrationClicksRef = useRef<number>(0);
  const clickTimesRef = useRef<number[]>([]);
  const detectedTimesRef = useRef<number[]>([]);
  const trainingDiffsRef = useRef<number[]>([]);
  const isCalibratingRef = useRef<boolean>(false);
  const isTrainingRef = useRef<boolean>(false);

  // Transient detection state
  const lastPeakTimeRef = useRef<number>(0);

  const initAudioContext = async () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContextClass({ latencyHint: 'interactive' });
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
    
    if (!micStreamRef.current) {
      try {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: {
            echoCancellation: false,
            autoGainControl: false,
            noiseSuppression: false
        } });
        sourceNodeRef.current = audioCtxRef.current.createMediaStreamSource(micStreamRef.current);
        analyserRef.current = audioCtxRef.current.createAnalyser();
        analyserRef.current.fftSize = 2048;
        // 完全な平滑化の排除
        analyserRef.current.smoothingTimeConstant = 0;
        sourceNodeRef.current.connect(analyserRef.current);
      } catch (err: any) {
        setError('Microphone access denied or error occurred.');
        throw err;
      }
    }
  };

  const playImpulse = (time: number) => {
    if (!audioCtxRef.current) return;
    const osc = audioCtxRef.current.createOscillator();
    const gainNode = audioCtxRef.current.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtxRef.current.destination);
    
    // ノイズキャンセルに潰されにくい2500Hzの三角波
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2500, time);
    
    // 0.05秒 (50ms) のバースト
    gainNode.gain.setValueAtTime(1, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    
    osc.start(time);
    osc.stop(time + 0.05);
  };

  const playClick = (time: number) => {
    if (!audioCtxRef.current) return;
    const osc = audioCtxRef.current.createOscillator();
    const gainNode = audioCtxRef.current.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtxRef.current.destination);
    
    osc.frequency.setValueAtTime(800, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.1);
    
    gainNode.gain.setValueAtTime(1, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    
    osc.start(time);
    osc.stop(time + 0.1);
  };

  const nextNote = () => {
    const secondsPerBeat = 60.0 / tempoRef.current;
    nextNoteTimeRef.current += secondsPerBeat;
    current16thNoteRef.current++;
  };

  const scheduleNote = (beatNumber: number, time: number) => {
    beatsToScheduleRef.current.push({ beatNumber, time });
    playClick(time);
  };

  const dynamicThresholdRef = useRef<number>(TRANSIENT_THRESHOLD);
  const noiseBaselineSamplesRef = useRef<number[]>([]);
  const isMeasuringNoiseRef = useRef<boolean>(false);

  const scheduler = () => {
    if (!audioCtxRef.current) return;
    
    if (isTrainingRef.current) {
      while (nextNoteTimeRef.current < audioCtxRef.current.currentTime + SCHEDULE_AHEAD_TIME) {
        scheduleNote(current16thNoteRef.current, nextNoteTimeRef.current);
        nextNote();
      }
    } else if (isCalibratingRef.current && !isMeasuringNoiseRef.current) {
      // Auto-calibration scheduling
      if (calibrationClicksRef.current < 8 && nextNoteTimeRef.current < audioCtxRef.current.currentTime + SCHEDULE_AHEAD_TIME) {
        const time = nextNoteTimeRef.current;
        clickTimesRef.current.push(time);
        playImpulse(time);
        calibrationClicksRef.current++;
        // Schedule next impulse 0.5s later
        nextNoteTimeRef.current += 0.5;
        
        if (calibrationClicksRef.current >= 8) {
          setTimeout(() => {
            if (isCalibratingRef.current) finishCalibration();
          }, 1500);
        }
      }
    }
  };

  const dataArrayRef = useRef<Float32Array | null>(null);

  const detectTransient = () => {
    if (!analyserRef.current || !audioCtxRef.current) return;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    if (!dataArrayRef.current || dataArrayRef.current.length !== bufferLength) {
        dataArrayRef.current = new Float32Array(bufferLength);
    }
    const dataArray = dataArrayRef.current;
    analyserRef.current.getFloatTimeDomainData(dataArray);

    if (isMeasuringNoiseRef.current) {
        let maxVal = 0;
        for (let i = 0; i < bufferLength; i++) {
            if (Math.abs(dataArray[i]) > maxVal) {
                maxVal = Math.abs(dataArray[i]);
            }
        }
        noiseBaselineSamplesRef.current.push(maxVal);
        return;
    }

    const currentThreshold = dynamicThresholdRef.current;
    let peakIndex = -1;
    let maxVal = 0;

    for (let i = 0; i < bufferLength; i++) {
        const absVal = Math.abs(dataArray[i]);
        if (absVal > maxVal) {
            maxVal = absVal;
        }
        // 最初の手前にあるアタックポイントを捉える
        if (peakIndex === -1 && absVal > currentThreshold) {
            peakIndex = i;
        }
    }
    
    if (peakIndex === -1) return;

    // サンプルレートから正確な発音時間を逆算
    const exactTime = audioCtxRef.current.currentTime - ((bufferLength - peakIndex) / audioCtxRef.current.sampleRate);
    
    // 0.1秒のデバウンス（二重検知防止）
    if (exactTime - lastPeakTimeRef.current > 0.1) {
        lastPeakTimeRef.current = exactTime;
        
        if (isCalibratingRef.current) {
            detectedTimesRef.current.push(exactTime);
        } else if (isTrainingRef.current) {
            const history = beatsToScheduleRef.current;
            if (history.length > 0) {
                // exactTimeを基準に古いヒストリーを破棄
                beatsToScheduleRef.current = history.filter(b => b.time > exactTime - 2.0);
                
                // キャリブレーションで得た補正値(ms)
                const offsetMs = latencyOffsetRef.current * 1000;
                
                // 遅攻法（レイドバック）の場合は目標を25ms後ろにシフト
                const targetShiftSeconds = playModeRef.current === 'laidback' ? 0.025 : 0;
                
                let nearestBeat = history[0];
                let minAbsDiff = Infinity;
                let finalRealDiffMs = 0;
                
                for (let i = 0; i < history.length; i++) {
                    // 1. 生遅延(ms)の算出 (exactTimeを使用、さらにシフトを考慮)
                    const shiftedTargetTime = history[i].time + targetShiftSeconds;
                    const rawDelayMs = (exactTime - shiftedTargetTime) * 1000;
                    
                    // 2. 補正の適用: 実質のズレ(ms)
                    const realDiffMs = rawDelayMs - offsetMs;
                    
                    // 3. 絶対値の処理: 最も近いビート（補正後のズレが最小のもの）を探す
                    const absDiff = Math.abs(realDiffMs);
                    
                    if (absDiff < minAbsDiff) {
                        minAbsDiff = absDiff;
                        nearestBeat = history[i];
                        finalRealDiffMs = realDiffMs;
                    }
                }
                
                const result: RhythmDataJSON = {
                    expectedTime: nearestBeat.time,
                    actualDetectedTime: exactTime,
                    diffMs: parseFloat(finalRealDiffMs.toFixed(2))
                };
                
                // 平均スコア計算などのために絶対値を保存する
                trainingDiffsRef.current.push(Math.abs(result.diffMs));
                if (process.env.NODE_ENV === 'development') {
                    console.log(JSON.stringify(result));
                }
            }
        }
    }
  };

  const loop = useCallback(() => {
    if (!isCalibratingRef.current && !isTrainingRef.current) return;
    
    scheduler();
    detectTransient();
    
    timerIDRef.current = requestAnimationFrame(loop);
  }, []);

  const stopScheduling = () => {
    if (timerIDRef.current !== null) {
      cancelAnimationFrame(timerIDRef.current);
      timerIDRef.current = null;
    }
  };

  const finishCalibration = () => {
    isCalibratingRef.current = false;
    stopScheduling();
    
    const clicks = clickTimesRef.current;
    let detections = [...detectedTimesRef.current];
    
    let validDelays: number[] = [];
    
    // Map each click to the first detection that comes AFTER it
    clicks.forEach(click => {
      const detIndex = detections.findIndex(det => det > click && det - click < 0.4);
      if (detIndex !== -1) {
        validDelays.push(detections[detIndex] - click);
        // 一度マッチした検知音は削除（重複利用を防ぐ）
        detections.splice(0, detIndex + 1);
      }
    });
    
    if (validDelays.length > 0) {
        // 外れ値を除外するため、中央値（Median）を計算する
        validDelays.sort((a, b) => a - b);
        let medianLatency = 0;
        const half = Math.floor(validDelays.length / 2);
        if (validDelays.length % 2 === 0) {
            medianLatency = (validDelays[half - 1] + validDelays[half]) / 2.0;
        } else {
            medianLatency = validDelays[half];
        }
        
        setLatencyOffset(medianLatency);
        
        const minLatency = Math.min(...validDelays);
        const maxLatency = Math.max(...validDelays);
        const jitter = maxLatency - minLatency;
        
        console.log(`Auto Calibration complete.`);
        console.log(`- Median Latency: ${medianLatency * 1000} ms`);
        console.log(`- Jitter (Variance): ${jitter * 1000} ms`);
        console.log(`- Valid Samples: ${validDelays.length}/8`);
    } else {
        setError('インパルス音を検出できませんでした。音量を上げるか、マイクをスピーカーに近づけてください。');
    }
    
    setState('idle');
  };

  const startCalibration = async () => {
    setError(null);
    try {
        await initAudioContext();
    } catch (e) {
        return;
    }
    
    setState('calibrating');
    isCalibratingRef.current = true;
    isTrainingRef.current = false;
    
    calibrationClicksRef.current = 0;
    clickTimesRef.current = [];
    detectedTimesRef.current = [];
    
    // Start measuring noise baseline
    isMeasuringNoiseRef.current = true;
    noiseBaselineSamplesRef.current = [];
    
    timerIDRef.current = requestAnimationFrame(loop);
    
    // Measure for 1000ms, then calculate dynamic threshold and start impulsing
    setTimeout(() => {
        if (!isCalibratingRef.current) return;
        
        isMeasuringNoiseRef.current = false;
        
        const samples = noiseBaselineSamplesRef.current;
        const avgNoise = samples.length > 0 
            ? samples.reduce((a, b) => a + b, 0) / samples.length 
            : 0;
        
        // Dynamic threshold: Base noise + margin (e.g. 0.05). Ensure minimum is 0.05
        const dynamicThresh = Math.min(Math.max(avgNoise + 0.05, 0.05), 0.5);
        dynamicThresholdRef.current = dynamicThresh;
        
        console.log(`Measured Noise Baseline: ${avgNoise.toFixed(4)}, Threshold set to: ${dynamicThresh.toFixed(4)}`);
        
        if (audioCtxRef.current) {
            nextNoteTimeRef.current = audioCtxRef.current.currentTime + 0.1;
        }
    }, 1000);
  };

  const startTraining = async () => {
    setError(null);
    try {
        await initAudioContext();
    } catch (e) {
        return;
    }
    
    setState('training');
    isTrainingRef.current = true;
    isCalibratingRef.current = false;
    beatsToScheduleRef.current = [];
    trainingDiffsRef.current = [];
    
    if (audioCtxRef.current) {
        nextNoteTimeRef.current = audioCtxRef.current.currentTime + 0.1;
        current16thNoteRef.current = 0;
    }
    
    timerIDRef.current = requestAnimationFrame(loop);
  };

  const stop = () => {
    isCalibratingRef.current = false;
    isTrainingRef.current = false;
    stopScheduling();
    setTrainingDiffs([...trainingDiffsRef.current]);
    setState('idle');
  };

  useEffect(() => {
    return () => {
      stop();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return {
    state,
    latencyOffset,
    tempo,
    trainingDiffs,
    setTempo,
    startCalibration,
    startTraining,
    stop,
    error
  };
};
