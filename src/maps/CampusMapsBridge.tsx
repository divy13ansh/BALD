/// <reference types="google.maps" />
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APILoadingStatus,
  APIProvider,
  Map as GoogleMap,
  Pin,
  useApiLoadingStatus,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { ExternalLink, MapPin, Navigation, Star, X } from 'lucide-react';
import {
  CAMPUS_BOUNDS,
  CAMPUS_LANDMARKS,
  CAMPUS_ORIGIN,
  GmpPlaceRecord,
  gpsToWorld,
  PlacePhotoAsset,
} from '../campus/campusData';

const GMP_ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

export function getGoogleMapsApiKey(): string {
  const viteKey = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_GOOGLE_MAPS_API_KEY;
  const procKey =
    typeof process !== 'undefined' ? (process.env?.GOOGLE_MAPS_API_KEY as string | undefined) : '';
  return (viteKey || procKey || '').trim();
}

export function buildStaticSatelliteUrl(
  lat: number,
  lng: number,
  zoom = 18,
  width = 640,
  height = 360,
): string | null {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;
  const params = new URLSearchParams({
    center: `${lat.toFixed(6)},${lng.toFixed(6)}`,
    zoom: String(zoom),
    size: `${width}x${height}`,
    scale: '2',
    maptype: 'hybrid',
    key: apiKey,
    solution_id: GMP_ATTRIBUTION_ID,
  });
  params.append('markers', `color:red|${lat.toFixed(6)},${lng.toFixed(6)}`);
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export function buildStreetViewUrl(
  lat: number,
  lng: number,
  heading = 180,
  width = 640,
  height = 360,
): string | null {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;
  const params = new URLSearchParams({
    size: `${width}x${height}`,
    location: `${lat.toFixed(6)},${lng.toFixed(6)}`,
    fov: '90',
    heading: String(Math.round(heading) % 360),
    pitch: '5',
    source: 'outdoor',
    key: apiKey,
    solution_id: GMP_ATTRIBUTION_ID,
  });
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

function handleGmpError(err: unknown) {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (
    /OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|Quota|429|OverQuotaMapError|QuotaExceededError/i.test(text)
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

function mapPlaceToRecord(place: google.maps.places.Place): GmpPlaceRecord | null {
  const loc = place.location;
  if (!loc) return null;
  const lat = loc.lat();
  const lng = loc.lng();
  const world = gpsToWorld(lat, lng);

  // Keep records within full Chitkara Rajpura campus bounds
  if (
    world.x < CAMPUS_BOUNDS.minX ||
    world.x > CAMPUS_BOUNDS.maxX ||
    world.z < CAMPUS_BOUNDS.minZ ||
    world.z > CAMPUS_BOUNDS.maxZ
  ) {
    return null;
  }

  const photos: PlacePhotoAsset[] = (place.photos || []).slice(0, 5).map((photo) => ({
    uri: photo.getURI({ maxWidth: 800, maxHeight: 560 }),
    attributions: (photo.authorAttributions || []).map((attr) => ({
      displayName: attr.displayName || 'Google Maps Contributor',
      uri: attr.uri || null,
    })),
  }));

  return {
    placeId: place.id,
    name: place.displayName || 'Chitkara Campus Location',
    lat,
    lng,
    worldX: world.x,
    worldZ: world.z,
    primaryType: place.primaryType || undefined,
    formattedAddress: place.formattedAddress || undefined,
    rating: typeof place.rating === 'number' ? place.rating : undefined,
    userRatingCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : undefined,
    googleMapsUri: place.googleMapsURI || undefined,
    photos,
  };
}

interface CampusPlacesFetcherProps {
  onPlacesLoaded: (places: GmpPlaceRecord[]) => void;
}

export const CampusPlacesFetcher: React.FC<CampusPlacesFetcherProps> = ({ onPlacesLoaded }) => {
  const placesLib = useMapsLibrary('places');
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!placesLib || fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;

    const loadPlaces = async () => {
      const fields = [
        'id',
        'displayName',
        'location',
        'primaryType',
        'formattedAddress',
        'rating',
        'userRatingCount',
        'googleMapsURI',
        'photos',
      ];

      const collected: Record<string, GmpPlaceRecord> = {};

      const queries: Array<Promise<{ places: google.maps.places.Place[] }>> = [
        placesLib.Place.searchNearby({
          locationRestriction: {
            center: { lat: CAMPUS_ORIGIN.lat, lng: CAMPUS_ORIGIN.lng },
            radius: 480,
          },
          maxResultCount: 20,
          fields,
          internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
        }),
        placesLib.Place.searchByText({
          textQuery:
            'Chitkara University Punjab Rajpura Square Two Exploretorium Turing Newton Hostel',
          locationBias: {
            center: { lat: CAMPUS_ORIGIN.lat, lng: CAMPUS_ORIGIN.lng },
            radius: 650,
          },
          maxResultCount: 20,
          fields,
          internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
        }),
      ];

      const results = await Promise.allSettled(queries);
      for (const res of results) {
        if (res.status === 'fulfilled') {
          for (const place of res.value.places || []) {
            const record = mapPlaceToRecord(place);
            if (record && !collected[record.placeId]) {
              collected[record.placeId] = record;
            }
          }
        } else {
          handleGmpError(res.reason);
        }
      }

      if (!cancelled) {
        onPlacesLoaded(Object.values(collected));
      }
    };

    void loadPlaces().catch(handleGmpError);

    return () => {
      cancelled = true;
    };
  }, [placesLib, onPlacesLoaded]);

  return null;
};

interface GoogleMapsSafeWrapperProps {
  apiKey: string;
  children: React.ReactNode;
}

export const GoogleMapsSafeWrapper: React.FC<GoogleMapsSafeWrapperProps> = ({
  apiKey,
  children,
}) => {
  if (!apiKey) {
    return <>{children}</>;
  }
  return (
    <APIProvider apiKey={apiKey} region="IN" language="en">
      {children}
    </APIProvider>
  );
};

interface GoogleMapsLiveModalProps {
  open: boolean;
  hasApiKey: boolean;
  playerLat: number;
  playerLng: number;
  gmpPlaces: GmpPlaceRecord[];
  onClose: () => void;
  onSelectPlace: (place: GmpPlaceRecord) => void;
  onTeleportCoords: (worldX: number, worldZ: number, label: string) => void;
}

const LiveMapInner: React.FC<{
  playerLat: number;
  playerLng: number;
  gmpPlaces: GmpPlaceRecord[];
  activePlace: GmpPlaceRecord | null;
  onSelectMarker: (place: GmpPlaceRecord) => void;
}> = ({ playerLat, playerLng, gmpPlaces, activePlace, onSelectMarker }) => {
  const status = useApiLoadingStatus();

  if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-center p-6">
        <div className="max-w-sm">
          <p className="text-sm font-semibold text-white">Google Maps unavailable</p>
          <p className="mt-1.5 text-xs text-slate-400">
            Verify your Google Maps API key or quota status to inspect live satellite markers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <GoogleMap
      mapId="DEMO_MAP_ID"
      mapTypeId="hybrid"
      defaultCenter={{ lat: CAMPUS_ORIGIN.lat, lng: CAMPUS_ORIGIN.lng }}
      defaultZoom={17}
      gestureHandling="greedy"
      internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
      className="w-full h-full"
    >
      {/* Live Student 3D Avatar Position */}
      <AdvancedMarker
        position={{ lat: playerLat, lng: playerLng }}
        title="Your 3D Student Position"
        zIndex={50}
      >
        <div className="w-4 h-4 rounded-full bg-sky-400 border-2 border-white shadow-lg" />
      </AdvancedMarker>

      {/* Fetched Google Maps Campus Places */}
      {gmpPlaces.map((place) => {
        const isSelected = activePlace?.placeId === place.placeId;
        return (
          <AdvancedMarker
            key={place.placeId}
            position={{ lat: place.lat, lng: place.lng }}
            title={place.name}
            zIndex={isSelected ? 40 : 20}
            onClick={() => onSelectMarker(place)}
          >
            <Pin
              background={isSelected ? '#ef4444' : '#0284c7'}
              borderColor="#ffffff"
              glyphColor="#ffffff"
            />
          </AdvancedMarker>
        );
      })}
    </GoogleMap>
  );
};

export const GoogleMapsLiveModal: React.FC<GoogleMapsLiveModalProps> = ({
  open,
  hasApiKey,
  playerLat,
  playerLng,
  gmpPlaces,
  onClose,
  onSelectPlace,
  onTeleportCoords,
}) => {
  const [focusedPlace, setFocusedPlace] = useState<GmpPlaceRecord | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const selected = useMemo(() => {
    if (focusedPlace) return focusedPlace;
    return gmpPlaces[0] || null;
  }, [focusedPlace, gmpPlaces]);

  useEffect(() => {
    setImgFailed(false);
  }, [selected?.placeId]);

  if (!open) return null;

  const firstPhoto = selected?.photos?.[0];

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/75"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-slate-950 border border-white/15 rounded-2xl overflow-hidden shadow-2xl text-slate-100 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div>
            <h2 className="text-base font-bold tracking-tight text-white">
              Chitkara University Punjab · Live Google Maps
            </h2>
            <p className="text-xs text-slate-400 font-mono-tabular">
              {CAMPUS_ORIGIN.lat.toFixed(6)}° N, {CAMPUS_ORIGIN.lng.toFixed(6)}° E ·{' '}
              {gmpPlaces.length} Places Synced
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Google Maps view"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative w-full h-[56vh] min-h-[340px] bg-slate-900">
          {hasApiKey ? (
            <LiveMapInner
              playerLat={playerLat}
              playerLng={playerLng}
              gmpPlaces={gmpPlaces}
              activePlace={selected}
              onSelectMarker={(place) => setFocusedPlace(place)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
              <img
                src="/assets/aistudio/image_f7d534df.png"
                alt="Chitkara University Campus Map"
                className="max-h-64 rounded-xl border border-white/15 object-contain"
              />
              <p className="mt-3 text-xs text-slate-400">
                Showing calibrated satellite map reference. Interactive Google Map activates when an API key is available.
              </p>
            </div>
          )}
        </div>

        {/* Selected Place Footer Strip + Quick Fast-Travel */}
        <div className="px-5 py-3.5 border-t border-white/10 bg-slate-950 flex flex-wrap items-center justify-between gap-4">
          {selected ? (
            <>
              <div className="flex items-center gap-3 min-w-0">
                {firstPhoto && !imgFailed ? (
                  <img
                    src={firstPhoto.uri}
                    alt={selected.name}
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="w-16 h-12 rounded-lg object-cover border border-white/12 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-12 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-sky-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">
                      {selected.name}
                    </span>
                    {typeof selected.rating === 'number' && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-300 font-mono-tabular shrink-0">
                        <Star className="w-3 h-3 fill-amber-300" />
                        {selected.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {selected.formattedAddress || `${selected.lat.toFixed(5)}°, ${selected.lng.toFixed(5)}°`}
                  </div>
                  {firstPhoto && firstPhoto.attributions.length > 0 && (
                    <div className="text-[10px] text-slate-500 truncate">
                      Photo:{' '}
                      {firstPhoto.attributions[0].uri ? (
                        <a
                          href={firstPhoto.attributions[0].uri}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-slate-300"
                        >
                          {firstPhoto.attributions[0].displayName}
                        </a>
                      ) : (
                        firstPhoto.attributions[0].displayName
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selected.googleMapsUri && (
                  <a
                    href={selected.googleMapsUri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 hover:text-white bg-white/8 hover:bg-white/14 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Google Maps
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => onSelectPlace(selected)}
                  className="px-3 py-2 text-xs font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  Inspect Photos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onTeleportCoords(selected.worldX, selected.worldZ, selected.name);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Walk Here in 3D
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between w-full text-xs text-slate-400">
              <span>Click any campus landmark to jump straight to it in 3D.</span>
              <div className="flex flex-wrap gap-1.5">
                {CAMPUS_LANDMARKS.slice(0, 4).map((lm) => (
                  <button
                    key={lm.id}
                    type="button"
                    onClick={() => {
                      onTeleportCoords(lm.x, lm.z, lm.shortLabel);
                      onClose();
                    }}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-white/10 rounded-md text-slate-200 cursor-pointer"
                  >
                    {lm.shortLabel}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
