'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Strategist, Stage } from '@/lib/gameData';

export interface PlayerStats {
  leadership: number;
  martial: number;
  intelligence: number;
  charm: number;
}

export interface PlayerData {
  baseStats: PlayerStats;
  warlordHistory: Record<string, number>;
}

interface GameContextType {
  calibrationOffset: number;
  setCalibrationOffset: (offset: number) => void;
  userGear: string;
  setUserGear: (gear: string) => void;
  clearedStages: string[];
  addClearedStage: (stageId: string) => void;
  currentStrategist: Strategist | null;
  setCurrentStrategist: (strategist: Strategist | null) => void;
  currentStage: Stage | null;
  setCurrentStage: (stage: Stage | null) => void;
  playMode: 'just' | 'laidback';
  setPlayMode: (mode: 'just' | 'laidback') => void;
  playerData: PlayerData;
  updatePlayerData: (sessionStats: PlayerStats, warlord: string) => void;
  resetPlayerData: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

const initialPlayerData: PlayerData = {
  baseStats: { leadership: 0, martial: 0, intelligence: 0, charm: 0 },
  warlordHistory: {}
};

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [calibrationOffset, setCalibrationOffsetState] = useState<number>(0);
  const [userGear, setUserGearState] = useState<string>('');
  const [clearedStages, setClearedStagesState] = useState<string[]>([]);
  const [currentStrategist, setCurrentStrategist] = useState<Strategist | null>(null);
  const [currentStage, setCurrentStage] = useState<Stage | null>(null);
  const [playMode, setPlayModeState] = useState<'just' | 'laidback'>('just');
  const [playerData, setPlayerDataState] = useState<PlayerData>(initialPlayerData);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const savedOffset = localStorage.getItem('tactician_calibrationOffset');
    if (savedOffset) {
        const parsed = parseFloat(savedOffset);
        setCalibrationOffsetState(Number.isNaN(parsed) ? 0 : parsed);
    }
    
    const savedGear = localStorage.getItem('tactician_userGear');
    if (savedGear) setUserGearState(savedGear);
    
    const savedCleared = localStorage.getItem('tactician_clearedStages');
    if (savedCleared) {
      try {
        setClearedStagesState(JSON.parse(savedCleared));
      } catch (e) {
        setClearedStagesState([]);
      }
    }
    
    const savedPlayMode = localStorage.getItem('tactician_playMode');
    if (savedPlayMode === 'just' || savedPlayMode === 'laidback') {
      setPlayModeState(savedPlayMode);
    }
    
    const savedPlayerData = localStorage.getItem('tactician_playerData');
    if (savedPlayerData) {
      try {
        setPlayerDataState(JSON.parse(savedPlayerData));
      } catch (e) {
        setPlayerDataState(initialPlayerData);
      }
    }
    
    setIsLoaded(true);
  }, []);

  const setCalibrationOffset = (offset: number) => {
    setCalibrationOffsetState(offset);
    localStorage.setItem('tactician_calibrationOffset', offset.toString());
  };

  const setUserGear = (gear: string) => {
    setUserGearState(gear);
    localStorage.setItem('tactician_userGear', gear);
  };

  const addClearedStage = (stageId: string) => {
    setClearedStagesState(prev => {
      if (prev.includes(stageId)) return prev;
      const next = [...prev, stageId];
      localStorage.setItem('tactician_clearedStages', JSON.stringify(next));
      return next;
    });
  };

  const updatePlayerData = (sessionStats: PlayerStats, warlord: string) => {
    setPlayerDataState(prev => {
      const next = {
        baseStats: {
          leadership: prev.baseStats.leadership + sessionStats.leadership / 10,
          martial: prev.baseStats.martial + sessionStats.martial / 10,
          intelligence: prev.baseStats.intelligence + sessionStats.intelligence / 10,
          charm: prev.baseStats.charm + sessionStats.charm / 10,
        },
        warlordHistory: {
          ...prev.warlordHistory,
          [warlord]: (prev.warlordHistory[warlord] || 0) + 1
        }
      };
      localStorage.setItem('tactician_playerData', JSON.stringify(next));
      return next;
    });
  };

  const resetPlayerData = () => {
    localStorage.removeItem('tactician_playerData');
    localStorage.removeItem('tactician_clearedStages');
    setPlayerDataState(initialPlayerData);
    setClearedStagesState([]);
  };

  const setPlayMode = (mode: 'just' | 'laidback') => {
    setPlayModeState(mode);
    localStorage.setItem('tactician_playMode', mode);
  };

  if (!isLoaded) return null; // Wait for localStorage to avoid hydration mismatch

  return (
    <GameContext.Provider value={{
      calibrationOffset,
      setCalibrationOffset,
      userGear,
      setUserGear,
      clearedStages,
      addClearedStage,
      currentStrategist,
      setCurrentStrategist,
      currentStage,
      setCurrentStage,
      playMode,
      setPlayMode,
      playerData,
      updatePlayerData,
      resetPlayerData
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
