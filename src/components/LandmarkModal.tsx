import React, { useEffect, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImagePlus,
  MapPin,
  Navigation,
  Satellite,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  CampusLandmark,
  GmpPlaceRecord,
  worldToGps,
} from '../campus/campusData';
import {
  buildStaticSatelliteUrl,
  buildStreetViewUrl,
} from '../maps/CampusMapsBridge';

type MediaTab = 'campus' | 'photos' | 'satellite' | 'streetview';

interface LandmarkModalProps {
  landmark: CampusLandmark | null;
  gmpPlace: GmpPlaceRecord | null;
  discovered: boolean;
  customPhotos: string[];
  onAddCustomPhotos: (landmarkId: string, dataUrls: string[]) => void;
  onRemoveCustomPhoto: (landmarkId: string, index: number) => void;
  onClose: () => void;
  onTeleportLandmark: (id: string) => void;
  onTeleportCoords: (worldX: number, worldZ: number, label: string) => void;
}

export const LandmarkModal: React.FC<LandmarkModalProps> = ({
  landmark,
  gmpPlace,
  discovered,
  customPhotos,
  onAddCustomPhotos,
  onRemoveCustomPhoto,
  onClose,
  onTeleportLandmark,
  onTeleportCoords,
}) => {
  const gmpPhotos = gmpPlace?.photos || [];
  const [photoIndex, setPhotoIndex] = useState(0);
  const [customIndex, setCustomIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<MediaTab>('satellite');
  const [imgError, setImgError] = useState(false);

  const entityKey = `${landmark?.id || ''}:${gmpPlace?.placeId || ''}`;

  useEffect(() => {
    setPhotoIndex(0);
    setCustomIndex(0);
    setImgError(false);
    if (customPhotos.length > 0) {
      setActiveTab('campus');
    } else if (gmpPhotos.length > 0) {
      setActiveTab('photos');
    } else {
      setActiveTab('satellite');
    }
  }, [entityKey, customPhotos.length, gmpPhotos.length]);

  useEffect(() => {
    setImgError(false);
  }, [activeTab, photoIndex, customIndex]);

  if (!landmark && !gmpPlace) return null;

  const coords = landmark
    ? worldToGps(landmark.x, landmark.z)
    : { lat: gmpPlace!.lat, lng: gmpPlace!.lng };

  const title = landmark?.name || gmpPlace!.name;
  const subtitle =
    landmark?.zone ||
    (gmpPlace?.primaryType ? gmpPlace.primaryType.replace(/_/g, ' ') : 'Google Maps Place');

  const satelliteUrl = buildStaticSatelliteUrl(coords.lat, coords.lng, 18, 640, 340);
  const streetViewUrl = buildStreetViewUrl(coords.lat, coords.lng, 165, 640, 340);

  const currentGmpPhoto = gmpPhotos[photoIndex] || null;
  const currentCustomPhoto = customPhotos[customIndex] || null;

  const mediaSrc =
    activeTab === 'campus'
      ? currentCustomPhoto
      : activeTab === 'photos'
        ? currentGmpPhoto?.uri || null
        : activeTab === 'satellite'
          ? satelliteUrl
          : streetViewUrl;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!landmark || files.length === 0) return;

    Promise.all(
      files.map(
        (file) =>
          new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          }),
      ),
    ).then((results) => {
      const valid = results.filter((u): u is string => Boolean(u));
      if (valid.length > 0) {
        onAddCustomPhotos(landmark.id, valid);
        setActiveTab('campus');
      }
    });
    e.target.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-slate-950 border border-white/15 rounded-2xl overflow-hidden shadow-2xl text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Visual Header */}
        <div className="relative w-full h-56 bg-slate-900 border-b border-white/10">
          {mediaSrc && !imgError ? (
            <img
              src={mediaSrc}
              alt={`${title} (${activeTab})`}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 px-6 text-center">
              <MapPin className="w-7 h-7 text-red-400 mb-2" />
              <div className="text-sm font-semibold text-white">{title}</div>
              <div className="text-xs text-slate-400 mt-1">
                {coords.lat.toFixed(6)}° N, {coords.lng.toFixed(6)}° E
              </div>
            </div>
          )}

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close location details"
            className="absolute top-3 right-3 p-2 rounded-lg bg-slate-950/85 text-slate-200 hover:text-white border border-white/15 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Media Source Tabs */}
          <div className="absolute top-3 left-3 inline-flex flex-wrap items-center gap-0.5 bg-slate-950/90 border border-white/15 rounded-lg p-0.5 max-w-[calc(100%-64px)]">
            {customPhotos.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('campus')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'campus'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Camera className="w-3 h-3" />
                Building Photos ({customPhotos.length})
              </button>
            )}
            {gmpPhotos.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('photos')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'photos'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Camera className="w-3 h-3" />
                Maps Photos ({gmpPhotos.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('satellite')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'satellite'
                  ? 'bg-red-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Satellite className="w-3 h-3" />
              Satellite
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('streetview')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'streetview'
                  ? 'bg-red-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Navigation className="w-3 h-3" />
              Street View
            </button>
          </div>

          {/* Remove Custom Photo Button */}
          {activeTab === 'campus' && landmark && customPhotos.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onRemoveCustomPhoto(landmark.id, customIndex);
                setCustomIndex(0);
              }}
              aria-label="Remove attached photo"
              className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-950/85 hover:bg-red-600 text-[11px] text-slate-200 hover:text-white border border-white/15 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              Remove Photo
            </button>
          )}

          {/* Custom Photo Carousel Controls */}
          {activeTab === 'campus' && customPhotos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous uploaded photo"
                onClick={() =>
                  setCustomIndex((prev) => (prev - 1 + customPhotos.length) % customPhotos.length)
                }
                className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-slate-950/85 border border-white/15 text-white hover:bg-slate-900 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Next uploaded photo"
                onClick={() => setCustomIndex((prev) => (prev + 1) % customPhotos.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-slate-950/85 border border-white/15 text-white hover:bg-slate-900 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Google Maps Photo Carousel Controls */}
          {activeTab === 'photos' && gmpPhotos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous Google Maps photo"
                onClick={() =>
                  setPhotoIndex((prev) => (prev - 1 + gmpPhotos.length) % gmpPhotos.length)
                }
                className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-slate-950/85 border border-white/15 text-white hover:bg-slate-900 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Next Google Maps photo"
                onClick={() => setPhotoIndex((prev) => (prev + 1) % gmpPhotos.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-slate-950/85 border border-white/15 text-white hover:bg-slate-900 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Mandatory Google Maps Photo Attribution */}
          {activeTab === 'photos' &&
            currentGmpPhoto &&
            currentGmpPhoto.attributions.length > 0 && (
              <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-slate-950/85 text-[10px] text-slate-300 border border-white/10">
                Photo:{' '}
                {currentGmpPhoto.attributions.map((attr, i) => (
                  <React.Fragment key={`${attr.displayName}-${i}`}>
                    {i > 0 && ', '}
                    {attr.uri ? (
                      <a
                        href={attr.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-white"
                      >
                        {attr.displayName}
                      </a>
                    ) : (
                      <span>{attr.displayName}</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
        </div>

        {/* Details Body */}
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono-tabular mb-1">
                <span className="capitalize">{subtitle}</span>
                {landmark && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className={discovered ? 'text-emerald-400' : 'text-amber-400'}>
                      {discovered ? 'Visited' : 'Unvisited'}
                    </span>
                  </>
                )}
                {typeof gmpPlace?.rating === 'number' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <Star className="w-3 h-3 fill-amber-300" />
                      {gmpPlace.rating.toFixed(1)}
                      {gmpPlace.userRatingCount ? ` (${gmpPlace.userRatingCount})` : ''}
                    </span>
                  </>
                )}
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white">{title}</h2>
            </div>

            {landmark && (
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 border border-white/15 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0">
                <ImagePlus className="w-3.5 h-3.5 text-red-400" />
                Attach Real Photo
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="sr-only"
                />
              </label>
            )}
          </div>

          <p className="mt-2.5 text-sm leading-relaxed text-slate-300">
            {landmark?.summary ||
              gmpPlace?.formattedAddress ||
              'Synced directly from Google Maps Places for Chitkara University Punjab.'}
          </p>

          {landmark && landmark.highlights.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-white/10">
              <div className="text-xs font-medium text-slate-400 mb-1.5">Key Spaces</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-200">
                {landmark.highlights.map((item, idx) => (
                  <React.Fragment key={item}>
                    <span>{item}</span>
                    {idx < landmark.highlights.length - 1 && (
                      <span className="text-slate-600" aria-hidden="true">
                        ·
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono-tabular">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-red-400" />
              {coords.lat.toFixed(6)}° N, {coords.lng.toFixed(6)}° E
            </span>
            {landmark && (
              <span>
                {landmark.width}m × {landmark.depth}m · {Math.round(landmark.height)}m tall
              </span>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
            {gmpPlace?.googleMapsUri && (
              <a
                href={gmpPlace.googleMapsUri}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 hover:text-white bg-white/8 hover:bg-white/14 rounded-lg transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in Google Maps
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                if (landmark) {
                  onTeleportLandmark(landmark.id);
                } else if (gmpPlace) {
                  onTeleportCoords(gmpPlace.worldX, gmpPlace.worldZ, gmpPlace.name);
                }
                onClose();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Navigation className="w-3.5 h-3.5" />
              Walk to Entrance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
