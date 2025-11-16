'use client';

import { useEffect, useMemo, useState } from 'react';
import { addHours, format } from 'date-fns';
import clsx from 'clsx';

type ClothingPreset = 'minimal' | 'light' | 'moderate' | 'covered';
type SunscreenPreset = 'none' | 'spf15' | 'spf30' | 'spf50';

const clothingPresets: Record<ClothingPreset, { label: string; attenuation: number }> = {
  minimal: { label: 'Minimal (shorts & tee)', attenuation: 1 },
  light: { label: 'Light layers', attenuation: 0.8 },
  moderate: { label: 'Moderate coverage', attenuation: 0.6 },
  covered: { label: 'Mostly covered', attenuation: 0.4 }
};

const sunscreenPresets: Record<SunscreenPreset, { label: string; attenuation: number }> = {
  none: { label: 'No sunscreen', attenuation: 1 },
  spf15: { label: 'SPF 15', attenuation: 0.6 },
  spf30: { label: 'SPF 30', attenuation: 0.4 },
  spf50: { label: 'SPF 50', attenuation: 0.2 }
};

type HourlyForecast = { hour: string; uv: number };

const STORAGE_KEY = 'uv-tracker-state-v1';

type PersistedState = {
  location: string;
  clothing: ClothingPreset;
  sunscreen: SunscreenPreset;
  vitaminGoal: number;
  vitaminProgress: number;
};

const defaultPersistedState: PersistedState = {
  location: 'San Francisco, CA',
  clothing: 'light',
  sunscreen: 'spf30',
  vitaminGoal: 1000,
  vitaminProgress: 250
};

function normalizeTimer(seconds: number) {
  const hrs = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0');
  const mins = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

function usePersistedState(): [
  PersistedState,
  (updates: Partial<PersistedState>) => void,
  boolean
] {
  const [state, setState] = useState<PersistedState>(defaultPersistedState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        setState({
          location: parsed.location || defaultPersistedState.location,
          clothing: parsed.clothing || defaultPersistedState.clothing,
          sunscreen: parsed.sunscreen || defaultPersistedState.sunscreen,
          vitaminGoal: parsed.vitaminGoal || defaultPersistedState.vitaminGoal,
          vitaminProgress: parsed.vitaminProgress || defaultPersistedState.vitaminProgress
        });
      }
    } catch (error) {
      console.warn('Failed to load state', error);
    } finally {
      setReady(true);
    }
  }, []);

  const updateState = (updates: Partial<PersistedState>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        console.warn('Failed to persist state', error);
      }
      return next;
    });
  };

  return [state, updateState, ready];
}

function generateForecast(baseUv: number): HourlyForecast[] {
  const now = new Date();
  return Array.from({ length: 8 }, (_, index) => {
    const hourDate = addHours(now, index);
    const modifier = Math.sin((index / 8) * Math.PI);
    const uv = Math.max(Number((baseUv * (0.4 + modifier)).toFixed(1)), 0);
    return {
      hour: format(hourDate, 'haaa'),
      uv
    };
  });
}

function deriveBaseUv(location: string): number {
  const hash = location
    .toLowerCase()
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seasonalBoost = Math.sin(((new Date().getMonth() + 1) / 12) * Math.PI);
  const normalized = ((hash % 700) / 700) * 6 + 2;
  return Number(Math.min(normalized + seasonalBoost * 3, 11).toFixed(1));
}

function deriveSunWindow(location: string) {
  const hash = location
    .split('')
    .reduce((acc, char, index) => acc + char.charCodeAt(0) * (index + 1), 0);
  const sunriseHour = 5 + (hash % 120) / 60;
  const sunsetHour = 17 + (hash % 180) / 60;
  const sunrise = formatHours(sunriseHour);
  const sunset = formatHours(sunsetHour);
  return { sunrise, sunset };
}

function formatHours(decimalHours: number) {
  const baseDate = new Date();
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  baseDate.setHours(hours);
  baseDate.setMinutes(minutes);
  return format(baseDate, 'p');
}

function calculateExposureGain(
  seconds: number,
  baseUv: number,
  clothing: ClothingPreset,
  sunscreen: SunscreenPreset
) {
  const minutes = seconds / 60;
  const clothingFactor = clothingPresets[clothing].attenuation;
  const sunscreenFactor = sunscreenPresets[sunscreen].attenuation;
  const effectiveUv = baseUv * clothingFactor * sunscreenFactor;
  const vitaminGain = effectiveUv * minutes * 5;
  return { effectiveUv, vitaminGain };
}

export default function Home() {
  const [persistedState, updatePersistedState, ready] = usePersistedState();
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  useEffect(() => {
    if (!sessionActive) return;
    const interval = setInterval(() => {
      setSessionSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionActive]);

  const baseUv = useMemo(() => deriveBaseUv(persistedState.location), [persistedState.location]);
  const forecast = useMemo(() => generateForecast(baseUv), [baseUv]);
  const { sunrise, sunset } = useMemo(
    () => deriveSunWindow(persistedState.location),
    [persistedState.location]
  );

  useEffect(() => {
    if (!ready) return;
    updatePersistedState({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const handleStart = () => {
    if (sessionActive) return;
    setSessionSeconds(0);
    setSessionActive(true);
  };

  const handleStop = () => {
    if (!sessionActive) return;
    setSessionActive(false);
    const { vitaminGain } = calculateExposureGain(
      sessionSeconds,
      baseUv,
      persistedState.clothing,
      persistedState.sunscreen
    );
    updatePersistedState({
      vitaminProgress: Math.round(persistedState.vitaminProgress + vitaminGain)
    });
  };

  const handleReset = () => {
    setSessionActive(false);
    setSessionSeconds(0);
  };

  const progressPercentage = Math.min(
    (persistedState.vitaminProgress / persistedState.vitaminGoal) * 100,
    100
  );

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-night text-white">
        <span className="animate-pulse text-lg tracking-wide">Loading tracker...</span>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-white">UV &amp; Vitamin D Tracker</h1>
        <p className="text-sm text-sky">Stay on top of your sun exposure and D3 goals.</p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-white">Current UV Index</h2>
          <div className="mt-4 flex items-end gap-3">
            <span className="text-5xl font-bold text-accent">{baseUv.toFixed(1)}</span>
            <div className="flex flex-col text-sm text-slate-200">
              <span>Location: {persistedState.location}</span>
              <span>Exposure level: {determineRiskLabel(baseUv)}</span>
            </div>
          </div>
          <div className="mt-4">
            <label className="text-xs uppercase tracking-wide text-sky">
              Update location
              <input
                className="mt-2 w-full rounded-md bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                value={persistedState.location}
                onChange={event => updatePersistedState({ location: event.target.value })}
                placeholder="City, State"
              />
            </label>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-white">Sunlight Window</h2>
          <div className="mt-4 flex items-center justify-between text-lg text-white">
            <div>
              <p className="text-sky text-sm uppercase">Sunrise</p>
              <p className="font-semibold">{sunrise}</p>
            </div>
            <div>
              <p className="text-sky text-sm uppercase">Sunset</p>
              <p className="font-semibold">{sunset}</p>
            </div>
          </div>
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-white/90">Hourly UV Forecast</h3>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
              {forecast.map(entry => (
                <div
                  key={entry.hour}
                  className="rounded-md bg-white/10 px-3 py-2 text-center backdrop-blur"
                >
                  <p className="text-xs uppercase text-sky">{entry.hour}</p>
                  <p className="mt-1 text-base font-semibold text-white">{entry.uv.toFixed(1)}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-white">Session Controls</h2>
          <div className="mt-4 flex flex-col gap-4">
            <div className="text-sm text-slate-200">
              <p className="uppercase text-xs text-sky">Timer</p>
              <p className="mt-1 text-3xl font-semibold text-white">{normalizeTimer(sessionSeconds)}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleStart}
                className={clsx(
                  'flex-1 rounded-md px-4 py-2 text-sm font-semibold transition',
                  sessionActive
                    ? 'cursor-not-allowed bg-white/20 text-white/60'
                    : 'bg-accent text-night hover:bg-accent-dark'
                )}
                disabled={sessionActive}
              >
                Start
              </button>
              <button
                onClick={handleStop}
                className="flex-1 rounded-md bg-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/40"
              >
                Stop
              </button>
              <button
                onClick={handleReset}
                className="rounded-md border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Reset
              </button>
            </div>
            <ExposureSnapshot
              sessionSeconds={sessionSeconds}
              baseUv={baseUv}
              clothing={persistedState.clothing}
              sunscreen={persistedState.sunscreen}
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-white">Exposure Profile</h2>
          <div className="mt-4 space-y-4 text-sm text-white">
            <div>
              <label className="text-xs uppercase tracking-wide text-sky" htmlFor="clothing-select">
                Clothing coverage
              </label>
              <select
                id="clothing-select"
                className="mt-2 w-full rounded-md bg-white/80 px-3 py-2 text-night focus:outline-none focus:ring-2 focus:ring-accent"
                value={persistedState.clothing}
                onChange={event =>
                  updatePersistedState({ clothing: event.target.value as ClothingPreset })
                }
              >
                {(Object.keys(clothingPresets) as ClothingPreset[]).map(key => (
                  <option key={key} value={key}>
                    {clothingPresets[key].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-sky" htmlFor="sunscreen-select">
                Sunscreen
              </label>
              <select
                id="sunscreen-select"
                className="mt-2 w-full rounded-md bg-white/80 px-3 py-2 text-night focus:outline-none focus:ring-2 focus:ring-accent"
                value={persistedState.sunscreen}
                onChange={event =>
                  updatePersistedState({ sunscreen: event.target.value as SunscreenPreset })
                }
              >
                {(Object.keys(sunscreenPresets) as SunscreenPreset[]).map(key => (
                  <option key={key} value={key}>
                    {sunscreenPresets[key].label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-2">
          <h2 className="text-lg font-semibold text-white">Vitamin D3 Goal</h2>
          <div className="mt-4 flex flex-col gap-4 text-sm text-white">
            <div>
              <label className="text-xs uppercase tracking-wide text-sky" htmlFor="vitamin-goal">
                Daily goal (IU)
              </label>
              <input
                id="vitamin-goal"
                type="number"
                min={200}
                step={50}
                className="mt-2 w-40 rounded-md bg-white/80 px-3 py-2 text-night focus:outline-none focus:ring-2 focus:ring-accent"
                value={persistedState.vitaminGoal}
                onChange={event =>
                  updatePersistedState({ vitaminGoal: Number(event.target.value || 0) })
                }
              />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-sky">Progress</p>
              <div className="mt-2 h-3 w-full rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-slate-200">
                {persistedState.vitaminProgress} IU / {persistedState.vitaminGoal} IU
              </p>
            </div>
            <div className="flex gap-3 text-sm">
              <button
                onClick={() =>
                  updatePersistedState({
                    vitaminProgress: Math.max(persistedState.vitaminProgress - 100, 0)
                  })
                }
                className="rounded-md border border-white/20 px-4 py-2 font-semibold text-white transition hover:bg-white/10"
              >
                -100 IU
              </button>
              <button
                onClick={() =>
                  updatePersistedState({
                    vitaminProgress: persistedState.vitaminProgress + 100
                  })
                }
                className="rounded-md bg-white/30 px-4 py-2 font-semibold text-white transition hover:bg-white/40"
              >
                +100 IU
              </button>
              <button
                onClick={() => updatePersistedState({ vitaminProgress: 0 })}
                className="ml-auto rounded-md bg-red-400/20 px-4 py-2 font-semibold text-red-100 transition hover:bg-red-400/30"
              >
                Reset Progress
              </button>
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}

function Card({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('rounded-2xl bg-white/10 p-6 backdrop-blur-lg shadow-lg', className)}>
      {children}
    </div>
  );
}

function determineRiskLabel(uv: number) {
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very High';
  return 'Extreme';
}

function ExposureSnapshot({
  sessionSeconds,
  baseUv,
  clothing,
  sunscreen
}: {
  sessionSeconds: number;
  baseUv: number;
  clothing: ClothingPreset;
  sunscreen: SunscreenPreset;
}) {
  const { effectiveUv, vitaminGain } = useMemo(
    () => calculateExposureGain(sessionSeconds, baseUv, clothing, sunscreen),
    [sessionSeconds, baseUv, clothing, sunscreen]
  );

  return (
    <div className="rounded-xl bg-white/5 p-4 text-sm text-slate-100">
      <p className="text-xs uppercase tracking-wide text-sky">Current Session</p>
      <div className="mt-2 grid grid-cols-2 gap-4">
        <SnapshotItem label="Effective UV" value={effectiveUv.toFixed(1)} />
        <SnapshotItem label="Estimated D3 Gain" value={`${vitaminGain.toFixed(0)} IU`} />
        <SnapshotItem label="Clothing" value={clothingPresets[clothing].label} />
        <SnapshotItem label="Sunscreen" value={sunscreenPresets[sunscreen].label} />
      </div>
    </div>
  );
}

function SnapshotItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-sky">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}
