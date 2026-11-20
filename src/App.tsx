import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  Footprints,
  Globe,
  Map as MapIcon,
  Moon,
  Satellite,
  Sun,
  Sunrise,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { campusAudio } from './campus/audio';
import {
  CAMPUS_LANDMARKS,
  CAMPUS_TOKENS,
  CameraMode,
  CampusLandmark,
  DEFAULT_MAP_CALIBRATION,
  GmpPlaceRecord,
  MapCalibration,
  TimeOfDay,
  worldToGps,
} from './campus/campusData';
import { CampusEngine, CampusHudSnapshot } from './campus/CampusEngine';
import { CalibrationModal } from './components/CalibrationModal';
import { CampusMinimap } from './components/CampusMinimap';
import { LandmarkModal } from './components/LandmarkModal';
import {
  CampusPlacesFetcher,
  getGoogleMapsApiKey,
  GoogleMapsLiveModal,
  GoogleMapsSafeWrapper,
} from './maps/CampusMapsBridge';

const INITIAL_GPS = worldToGps(-10.8, -102);

const INITIAL_HUD: CampusHudSnapshot = {
  playerX: -10.8,
  playerZ: -102,
  headingRad: 0,
  lat: INITIAL_GPS.lat,
  lng: INITIAL_GPS.lng,
  speedMps: 0,
  nearbyLandmark: null,
  discoveredIds: ['turing-block', 'edison-block'],
  collectedTokenIds: [],
  totalTokens: CAMPUS_TOKENS.length,
  totalLandmarks: CAMPUS_LANDMARKS.length,
  lastEventText: null,
};

function findMatchingGmpPlace(
  landmark: CampusLandmark | null,
  places: GmpPlaceRecord[],
): GmpPlaceRecord | null {
  if (!landmark || places.length === 0) return null;

  for (const kw of landmark.matchKeywords) {
    const lowerKw = kw.toLowerCase();
    const matched = places.find((p) => p.name.toLowerCase().includes(lowerKw));
    if (matched) return matched;
  }

  let best: GmpPlaceRecord | null = null;
  let bestDist = 65;
  for (const place of places) {
    const d = Math.hypot(place.worldX - landmark.x, place.worldZ - landmark.z);
    if (d < bestDist) {
      bestDist = d;
      best = place;
    }
  }
  return best;
}

export default function App() {
  const apiKey = useMemo(() => getGoogleMapsApiKey(), []);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CampusEngine | null>(null);
  const gmpPlacesRef = useRef<GmpPlaceRecord[]>([]);

  const [hud, setHud] = useState<CampusHudSnapshot>(INITIAL_HUD);
  const [cameraMode, setCameraMode] = useState<CameraMode>('walk');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('morning');
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [muted, setMuted] = useState(false);

  const [selectedLandmark, setSelectedLandmark] = useState<CampusLandmark | null>(null);
  const [selectedGmpPlace, setSelectedGmpPlace] = useState<GmpPlaceRecord | null>(null);
  const [gmpPlaces, setGmpPlaces] = useState<GmpPlaceRecord[]>([]);

  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [liveMapOpen, setLiveMapOpen] = useState(false);
  const [mapCalibration, setMapCalibration] = useState<MapCalibration>(DEFAULT_MAP_CALIBRATION);
  const [customPhotosByLandmark, setCustomPhotosByLandmark] = useState<Record<string, string[]>>({});
  const [contextLost, setContextLost] = useState(false);
  const [jumpTargetId, setJumpTargetId] = useState('turing-block');
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [quotaBannerDismissed, setQuotaBannerDismissed] = useState(false);

  useEffect(() => {
    gmpPlacesRef.current = gmpPlaces;
  }, [gmpPlaces]);

  useEffect(() => {
    const onQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const engine = new CampusEngine(mountEl, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onSelectLandmark: (landmark) => {
        setSelectedGmpPlace(null);
        setSelectedLandmark(landmark);
      },
      onSelectGmpPlace: (placeId) => {
        const found = gmpPlacesRef.current.find((p) => p.placeId === placeId) || null;
        if (found) {
          setSelectedLandmark(null);
          setSelectedGmpPlace(found);
        }
      },
      onContextLost: (lost) => setContextLost(lost),
    });
    engineRef.current = engine;

    if (gmpPlacesRef.current.length > 0) {
      engine.syncGooglePlaces(gmpPlacesRef.current);
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      if (e.code === 'KeyH') {
        setHudCollapsed((prev) => !prev);
      } else if (e.code === 'Escape') {
        setSelectedLandmark(null);
        setSelectedGmpPlace(null);
        setCalibrationOpen(false);
        setLiveMapOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handlePlacesLoaded = useCallback((places: GmpPlaceRecord[]) => {
    setGmpPlaces(places);
    engineRef.current?.syncGooglePlaces(places);
  }, []);

  const handleCameraMode = (mode: CameraMode) => {
    setCameraMode(mode);
    engineRef.current?.setCameraMode(mode);
  };

  const handleTimeOfDay = (preset: TimeOfDay) => {
    setTimeOfDay(preset);
    engineRef.current?.setTimeOfDay(preset);
  };

  const handleTeleportLandmark = (landmarkId: string) => {
    setJumpTargetId(landmarkId);
    engineRef.current?.teleportToLandmark(landmarkId);
  };

  const handleTeleportCoords = (worldX: number, worldZ: number, label: string) => {
    engineRef.current?.teleportToCoordinates(worldX, worldZ, label);
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    campusAudio.setMuted(next);
  };

  const handleCalibrationChange = (next: MapCalibration) => {
    setMapCalibration(next);
    engineRef.current?.setMapCalibration(next);
  };

  const handleUploadMap = (dataUrl: string) => {
    const next = { ...mapCalibration, visible: true };
    setMapCalibration(next);
    engineRef.current?.setCustomMapOverlay(dataUrl, next.opacity);
    engineRef.current?.setMapCalibration(next);
  };

  const handleRestoreSatellite = () => {
    const next = { ...DEFAULT_MAP_CALIBRATION };
    setMapCalibration(next);
    engineRef.current?.resetDefaultSatelliteMap(next.opacity);
    engineRef.current?.setMapCalibration(next);
  };

  const handleClearMap = () => {
    const next = { ...mapCalibration, visible: false };
    setMapCalibration(next);
    engineRef.current?.setMapCalibration(next);
  };

  const handleToggleSatellite = () => {
    if (mapCalibration.visible) {
      handleClearMap();
    } else {
      const next = { ...mapCalibration, visible: true, opacity: mapCalibration.opacity || 0.78 };
      setMapCalibration(next);
      engineRef.current?.setMapCalibration(next);
    }
  };

  const handleAddCustomPhotos = (landmarkId: string, dataUrls: string[]) => {
    setCustomPhotosByLandmark((prev) => {
      const existing = prev[landmarkId] || [];
      const merged = [...existing, ...dataUrls];
      engineRef.current?.setBuildingFacadePhoto(landmarkId, merged[0]);
      return { ...prev, [landmarkId]: merged };
    });
  };

  const handleRemoveCustomPhoto = (landmarkId: string, index: number) => {
    setCustomPhotosByLandmark((prev) => {
      const list = prev[landmarkId] || [];
      const next = list.filter((_, idx) => idx !== index);
      engineRef.current?.setBuildingFacadePhoto(landmarkId, next[0] || null);
      return { ...prev, [landmarkId]: next };
    });
  };

  const handleVirtualStep = (x: number, y: number) => {
    engineRef.current?.setVirtualInput(x, y);
  };

  const activeGmpPlace = useMemo(() => {
    if (selectedGmpPlace) return selectedGmpPlace;
    return findMatchingGmpPlace(selectedLandmark, gmpPlaces);
  }, [selectedGmpPlace, selectedLandmark, gmpPlaces]);

  return (
    <GoogleMapsSafeWrapper apiKey={apiKey}>
      {apiKey && <CampusPlacesFetcher onPlacesLoaded={handlePlacesLoaded} />}

      <div className="relative w-screen h-screen overflow-hidden bg-slate-950">
        {quotaExceeded && !quotaBannerDismissed && (
          <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-slate-950 px-4 py-2 text-xs font-medium flex items-center justify-between gap-3 shadow-lg">
            <span>
              <strong>Google Maps Demo Quota Exceeded:</strong> The app&apos;s Google Maps features have reached their demo usage limit. To restore full functionality, switch to a Google Cloud project API key with billing enabled.{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold"
              >
                Learn more
              </a>
            </span>
            <button
              type="button"
              onClick={() => setQuotaBannerDismissed(true)}
              className="px-2 py-0.5 rounded bg-slate-950/15 hover:bg-slate-950/25 font-semibold cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Isolated WebGL Viewport */}
        <div
          ref={canvasMountRef}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
        />

        {contextLost && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/90 text-center p-6">
            <div className="max-w-sm bg-slate-900 border border-white/15 rounded-xl p-6">
              <h2 className="text-base font-bold text-white">3D Viewport Paused</h2>
              <p className="mt-2 text-xs text-slate-300">
                Graphics context was interrupted. Waiting for WebGL recovery or reload the page.
              </p>
            </div>
          </div>
        )}

        {/* Top-Left Minimal Brand & Coordinates */}
        {!hudCollapsed && (
          <header className="pointer-events-none absolute top-4 left-4 z-10 max-w-[calc(100vw-230px)]">
            <div className="pointer-events-auto inline-flex flex-col bg-slate-950/88 border border-white/12 rounded-xl px-4 py-2.5 shadow-xl">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold tracking-tight text-white whitespace-nowrap">
                  Chitkara Campus 3D
                </span>
                <span className="text-slate-600" aria-hidden="true">
                  ·
                </span>
                <span className="text-xs text-slate-300 font-mono-tabular whitespace-nowrap">
                  {hud.lat.toFixed(4)}° N, {hud.lng.toFixed(4)}° E
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 font-mono-tabular">
                <span>
                  Blocks {hud.discoveredIds.length}/{hud.totalLandmarks}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Crests {hud.collectedTokenIds.length}/{hud.totalTokens}
                </span>
                {gmpPlaces.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-sky-400">{gmpPlaces.length} Maps Places</span>
                  </>
                )}
                {hud.lastEventText && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-300 truncate max-w-[240px]">
                      {hud.lastEventText}
                    </span>
                  </>
                )}
              </div>
            </div>
          </header>
        )}

        {/* Top-Right Compact Campus Vector Radar */}
        {!hudCollapsed && (
          <aside className="absolute top-4 right-4 z-10">
            <CampusMinimap
              playerX={hud.playerX}
              playerZ={hud.playerZ}
              headingRad={hud.headingRad}
              discoveredIds={hud.discoveredIds}
              collectedTokenIds={hud.collectedTokenIds}
              gmpPlaces={gmpPlaces}
              onSelectLandmarkId={(id) => {
                const lm = CAMPUS_LANDMARKS.find((item) => item.id === id);
                if (lm) {
                  setSelectedGmpPlace(null);
                  setSelectedLandmark(lm);
                }
              }}
              onSelectGmpPlace={(place) => {
                setSelectedLandmark(null);
                setSelectedGmpPlace(place);
              }}
            />
          </aside>
        )}

        {/* Mobile Touch D-Pad */}
        {!hudCollapsed && cameraMode === 'walk' && (
          <div className="md:hidden absolute bottom-28 left-4 z-10 grid grid-cols-3 gap-1 w-28 h-28">
            <div />
            <button
              type="button"
              aria-label="Walk forward"
              onPointerDown={() => handleVirtualStep(0, 1)}
              onPointerUp={() => handleVirtualStep(0, 0)}
              onPointerLeave={() => handleVirtualStep(0, 0)}
              className="bg-slate-950/88 border border-white/15 rounded-lg text-white text-xs font-bold active:bg-red-600"
            >
              ↑
            </button>
            <div />
            <button
              type="button"
              aria-label="Walk left"
              onPointerDown={() => handleVirtualStep(-1, 0)}
              onPointerUp={() => handleVirtualStep(0, 0)}
              onPointerLeave={() => handleVirtualStep(0, 0)}
              className="bg-slate-950/88 border border-white/15 rounded-lg text-white text-xs font-bold active:bg-red-600"
            >
              ←
            </button>
            <div />
            <button
              type="button"
              aria-label="Walk right"
              onPointerDown={() => handleVirtualStep(1, 0)}
              onPointerUp={() => handleVirtualStep(0, 0)}
              onPointerLeave={() => handleVirtualStep(0, 0)}
              className="bg-slate-950/88 border border-white/15 rounded-lg text-white text-xs font-bold active:bg-red-600"
            >
              →
            </button>
            <div />
            <button
              type="button"
              aria-label="Walk backward"
              onPointerDown={() => handleVirtualStep(0, -1)}
              onPointerUp={() => handleVirtualStep(0, 0)}
              onPointerLeave={() => handleVirtualStep(0, 0)}
              className="bg-slate-950/88 border border-white/15 rounded-lg text-white text-xs font-bold active:bg-red-600"
            >
              ↓
            </button>
            <div />
          </div>
        )}

        {/* Bottom Collapsible Control Dock */}
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-20 flex flex-col items-center transition-transform duration-200 ease-out ${
            hudCollapsed ? 'bottom-3 translate-y-[calc(100%-34px)]' : 'bottom-4 translate-y-0'
          }`}
          style={{ maxWidth: 'min(1060px, 96vw)' }}
        >
          {!hudCollapsed && hud.nearbyLandmark && (
            <button
              type="button"
              onClick={() => {
                setSelectedGmpPlace(null);
                setSelectedLandmark(hud.nearbyLandmark);
              }}
              className="mb-2 inline-flex items-center gap-2 px-4 py-1.5 bg-slate-950/92 hover:bg-slate-900 border border-white/15 rounded-lg text-xs text-slate-100 shadow-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Compass className="w-3.5 h-3.5 text-red-400" />
              <span>
                Near{' '}
                <strong className="font-semibold text-white">
                  {hud.nearbyLandmark.shortLabel}
                </strong>
              </span>
              <span className="text-slate-500" aria-hidden="true">
                ·
              </span>
              <span className="font-mono-tabular text-slate-300">
                Press E to inspect or attach photo
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setHudCollapsed((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-950/92 hover:bg-slate-900 border border-b-0 border-white/12 rounded-t-lg text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            {hudCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Show Controls (H)
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Hide Controls (H)
              </>
            )}
          </button>

          <div className="w-full bg-slate-950/92 border border-white/14 rounded-xl px-3 py-2.5 shadow-2xl flex flex-wrap items-center justify-center gap-2">
            {/* Camera Mode Switch */}
            <div
              role="group"
              aria-label="Camera Mode"
              className="inline-flex items-center bg-slate-900 border border-white/10 rounded-lg p-0.5"
            >
              <button
                type="button"
                onClick={() => handleCameraMode('walk')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  cameraMode === 'walk'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Footprints className="w-3.5 h-3.5" />
                Walk
              </button>
              <button
                type="button"
                onClick={() => handleCameraMode('drone')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  cameraMode === 'drone'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Drone
              </button>
            </div>

            {/* Time of Day Switch */}
            <div
              role="group"
              aria-label="Time of Day"
              className="inline-flex items-center bg-slate-900 border border-white/10 rounded-lg p-0.5"
            >
              <button
                type="button"
                onClick={() => handleTimeOfDay('morning')}
                className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  timeOfDay === 'morning'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                Day
              </button>
              <button
                type="button"
                onClick={() => handleTimeOfDay('golden')}
                className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  timeOfDay === 'golden'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sunrise className="w-3.5 h-3.5" />
                Sunset
              </button>
              <button
                type="button"
                onClick={() => handleTimeOfDay('night')}
                className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  timeOfDay === 'night'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                Night
              </button>
            </div>

            {/* Fast Travel Block Jump */}
            <div className="inline-flex items-center gap-1.5 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1">
              <label htmlFor="landmark-jump" className="text-[11px] text-slate-400 whitespace-nowrap">
                Go to
              </label>
              <select
                id="landmark-jump"
                value={jumpTargetId}
                onChange={(e) => handleTeleportLandmark(e.target.value)}
                className="bg-transparent text-xs font-medium text-white focus:outline-none cursor-pointer pr-1 max-w-[140px]"
              >
                {CAMPUS_LANDMARKS.map((lm) => (
                  <option key={lm.id} value={lm.id} className="bg-slate-900 text-white">
                    {lm.shortLabel}
                  </option>
                ))}
              </select>
            </div>

            {/* Live Google Maps Modal */}
            <button
              type="button"
              onClick={() => setLiveMapOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Globe className="w-3.5 h-3.5" />
              Google Maps
            </button>

            {/* Toggle 3D Satellite Ground Overlay */}
            <button
              type="button"
              onClick={handleToggleSatellite}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mapCalibration.visible
                  ? 'bg-emerald-700/80 border-emerald-500/40 text-white hover:bg-emerald-700'
                  : 'bg-slate-900 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Satellite className="w-3.5 h-3.5" />
              Satellite Ground
            </button>

            {/* Audio Mute */}
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={muted ? 'Unmute campus audio' : 'Mute campus audio'}
              className="inline-flex items-center justify-center p-2 bg-slate-900 hover:bg-slate-800 border border-white/10 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Map Calibration & Controls */}
            <button
              type="button"
              onClick={() => setCalibrationOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-white/10 rounded-lg text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <MapIcon className="w-3.5 h-3.5 text-red-400" />
              Calibrate Map
            </button>
          </div>
        </div>

        {/* Landmark & Google Maps Place Detail Modal */}
        <LandmarkModal
          landmark={selectedLandmark}
          gmpPlace={activeGmpPlace}
          discovered={
            selectedLandmark ? hud.discoveredIds.includes(selectedLandmark.id) : false
          }
          customPhotos={
            selectedLandmark ? customPhotosByLandmark[selectedLandmark.id] || [] : []
          }
          onAddCustomPhotos={handleAddCustomPhotos}
          onRemoveCustomPhoto={handleRemoveCustomPhoto}
          onClose={() => {
            setSelectedLandmark(null);
            setSelectedGmpPlace(null);
          }}
          onTeleportLandmark={handleTeleportLandmark}
          onTeleportCoords={handleTeleportCoords}
        />

        {/* Interactive Live Google Maps Overlay Modal */}
        <GoogleMapsLiveModal
          open={liveMapOpen}
          hasApiKey={Boolean(apiKey)}
          playerLat={hud.lat}
          playerLng={hud.lng}
          gmpPlaces={gmpPlaces}
          onClose={() => setLiveMapOpen(false)}
          onSelectPlace={(place) => {
            setLiveMapOpen(false);
            setSelectedLandmark(null);
            setSelectedGmpPlace(place);
          }}
          onTeleportCoords={handleTeleportCoords}
        />

        {/* Controls & Manual Campus Map Calibration Studio */}
        <CalibrationModal
          open={calibrationOpen}
          calibration={mapCalibration}
          onClose={() => setCalibrationOpen(false)}
          onUploadMap={handleUploadMap}
          onRestoreSatellite={handleRestoreSatellite}
          onClearMap={handleClearMap}
          onChangeCalibration={handleCalibrationChange}
        />
      </div>
    </GoogleMapsSafeWrapper>
  );
}
