'use client';

import { useTranslations } from 'next-intl';
import { useRhythmDetector } from '@/hooks/useRhythmDetector';

export default function RhythmDetectorUI() {
  const t = useTranslations('UI');
  const {
    state,
    latencyOffset,
    tempo,
    setTempo,
    startCalibration,
    startTraining,
    stop,
    error
  } = useRhythmDetector();

  return (
    <div className="bg-neutral-800 p-6 rounded-lg shadow-xl">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-neutral-200">Detector Settings</h2>
        <div className="flex items-center gap-2">
          <label htmlFor="tempo" className="text-neutral-400 text-sm">BPM:</label>
          <input
            id="tempo"
            type="number"
            value={tempo}
            onChange={(e) => setTempo(Number(e.target.value))}
            disabled={state !== 'idle'}
            className="w-20 bg-neutral-700 text-white px-2 py-1 rounded border border-neutral-600 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-500 text-red-200 rounded text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-neutral-700/50 p-4 rounded border border-neutral-600">
          <h3 className="text-lg font-medium text-amber-500 mb-2">{t('calibration')}</h3>
          <p className="text-sm text-neutral-400 mb-4">
            Measure audio latency. Play 4 clicks along with the metronome.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={startCalibration}
              disabled={state !== 'idle'}
              className="w-full py-2 bg-neutral-600 hover:bg-neutral-500 disabled:opacity-50 text-white rounded transition-colors"
            >
              {state === 'calibrating' ? t('calibrating') : t('startCalibration')}
            </button>
            <div className="text-sm text-neutral-300">
              {t('latency')}: <span className="font-mono text-amber-400">{(latencyOffset * 1000).toFixed(1)} ms</span>
            </div>
          </div>
        </div>

        <div className="bg-neutral-700/50 p-4 rounded border border-neutral-600">
          <h3 className="text-lg font-medium text-amber-500 mb-2">Training Mode</h3>
          <p className="text-sm text-neutral-400 mb-4">
            Play along! Check the console for millisecond precision JSON output.
          </p>
          <div className="flex flex-col gap-3">
            {state === 'training' ? (
              <button
                onClick={stop}
                className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
              >
                {t('stopTraining')}
              </button>
            ) : (
              <button
                onClick={startTraining}
                disabled={state !== 'idle'}
                className="w-full py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded transition-colors"
              >
                {t('startTraining')}
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="mt-6 pt-4 border-t border-neutral-700 text-xs text-neutral-500">
        Status: <span className="font-mono uppercase">{state}</span>
      </div>
    </div>
  );
}
