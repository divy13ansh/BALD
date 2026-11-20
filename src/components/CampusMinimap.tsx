import React from 'react';
import {
  ALL_CAMPUS_BUILDINGS,
  ALL_CAMPUS_ROADS,
  ALL_CAMPUS_ZONES,
  CAMPUS_BOUNDS,
  CAMPUS_LANDMARKS,
  CAMPUS_TOKENS,
  GmpPlaceRecord,
} from '../campus/campusData';

interface CampusMinimapProps {
  playerX: number;
  playerZ: number;
  headingRad: number;
  discoveredIds: string[];
  collectedTokenIds: string[];
  gmpPlaces: GmpPlaceRecord[];
  onSelectLandmarkId: (id: string) => void;
  onSelectGmpPlace: (place: GmpPlaceRecord) => void;
}

export const CampusMinimap: React.FC<CampusMinimapProps> = ({
  playerX,
  playerZ,
  headingRad,
  discoveredIds,
  collectedTokenIds,
  gmpPlaces,
  onSelectLandmarkId,
  onSelectGmpPlace,
}) => {
  const svgW = 192;
  const svgH = 188;
  const spanX = CAMPUS_BOUNDS.maxX - CAMPUS_BOUNDS.minX;
  const spanZ = CAMPUS_BOUNDS.maxZ - CAMPUS_BOUNDS.minZ;

  const toX = (wx: number) => ((wx - CAMPUS_BOUNDS.minX) / spanX) * svgW;
  const toY = (wz: number) => ((wz - CAMPUS_BOUNDS.minZ) / spanZ) * svgH;
  const toPts = (ring: Array<[number, number]>) =>
    ring.map(([x, z]) => `${toX(x).toFixed(1)},${toY(z).toFixed(1)}`).join(' ');

  const landmarkByOsmId = new Map(
    CAMPUS_LANDMARKS.filter((lm) => lm.osmId).map((lm) => [lm.osmId!, lm]),
  );

  const px = toX(playerX);
  const py = toY(playerZ);
  const headingDeg = (-headingRad * 180) / Math.PI + 180;

  return (
    <div className="bg-slate-950/92 border border-white/12 rounded-xl p-2.5 shadow-xl">
      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono-tabular mb-1.5 px-0.5">
        <span>CAMPUS VECTOR RADAR</span>
        <span>N ↑</span>
      </div>
      <div className="relative w-[192px] h-[188px] bg-slate-900 rounded-lg overflow-hidden border border-white/8">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full block">
          {/* Parks, Sports Grounds, Water Pond & Parking Aprons */}
          {ALL_CAMPUS_ZONES.map((z) => {
            if (z.polygon.length < 3) return null;
            let fill = '#1e293b';
            let opacity = 0.45;
            if (z.kind === 'water') {
              fill = '#0c4a6e';
              opacity = 0.9;
            } else if (z.kind === 'pitch' || z.kind === 'soccer') {
              fill = '#166534';
              opacity = 0.72;
            } else if (z.kind === 'park' || z.kind === 'grass' || z.kind === 'forest') {
              fill = '#14532d';
              opacity = 0.55;
            } else if (z.kind === 'basketball' || z.kind === 'tennis' || z.kind === 'volleyball') {
              fill = '#0f766e';
              opacity = 0.6;
            } else if (z.kind === 'parking') {
              fill = '#334155';
              opacity = 0.4;
            } else {
              return null;
            }
            return (
              <polygon
                key={z.id}
                points={toPts(z.polygon)}
                fill={fill}
                fillOpacity={opacity}
              />
            );
          })}

          {/* Cricket Oval Ring at Omega Zone */}
          <ellipse
            cx={toX(63)}
            cy={toY(42)}
            rx={(43 / spanX) * svgW}
            ry={(40 / spanZ) * svgH}
            fill="none"
            stroke="#34d399"
            strokeWidth={0.6}
          />

          {/* Exact OSM Road & Highway Polylines */}
          {ALL_CAMPUS_ROADS.map((road) => {
            if (road.points.length < 2) return null;
            const isHighway = road.highway === 'trunk' || road.highway === 'trunk_link';
            const isFoot = road.highway === 'footway' || road.highway === 'pedestrian';
            return (
              <polyline
                key={road.id}
                points={toPts(road.points)}
                fill="none"
                stroke={isHighway ? '#d9c27e' : isFoot ? '#64748b' : '#475569'}
                strokeWidth={isHighway ? 2.4 : isFoot ? 0.7 : 1.3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {/* Exact Building Footprints */}
          {ALL_CAMPUS_BUILDINGS.map((b) => {
            if (b.polygon.length < 3) return null;
            const lm = landmarkByOsmId.get(b.id);
            const found = lm ? discoveredIds.includes(lm.id) : false;
            return (
              <polygon
                key={b.id}
                points={toPts(b.polygon)}
                fill={lm ? (found ? '#10b981' : '#dc2626') : '#64748b'}
                fillOpacity={lm ? 0.88 : 0.7}
                stroke="#f8fafc"
                strokeWidth={0.45}
                className={lm ? 'cursor-pointer hover:opacity-100' : undefined}
                onClick={lm ? () => onSelectLandmarkId(lm.id) : undefined}
              >
                <title>{lm ? lm.shortLabel : b.name}</title>
              </polygon>
            );
          })}

          {/* Synced Google Maps Place Pins */}
          {gmpPlaces.map((place) => {
            const x = toX(place.worldX);
            const y = toY(place.worldZ);
            if (x < 0 || x > svgW || y < 0 || y > svgH) return null;
            return (
              <circle
                key={place.placeId}
                cx={x}
                cy={y}
                r={1.8}
                fill="#0ea5e9"
                stroke="#0f172a"
                strokeWidth={0.5}
                className="cursor-pointer"
                onClick={() => onSelectGmpPlace(place)}
              >
                <title>{place.name}</title>
              </circle>
            );
          })}

          {/* Uncollected Crests */}
          {CAMPUS_TOKENS.filter((t) => !collectedTokenIds.includes(t.id)).map((t) => (
            <circle
              key={t.id}
              cx={toX(t.x)}
              cy={toY(t.z)}
              r={1.35}
              fill="#fbbf24"
            />
          ))}

          {/* Player Directional Marker */}
          <g transform={`translate(${px}, ${py}) rotate(${headingDeg})`}>
            <polygon
              points="0,-4.5 3.2,3.6 0,1.8 -3.2,3.6"
              fill="#38bdf8"
              stroke="#0f172a"
              strokeWidth={0.8}
            />
          </g>
        </svg>
      </div>
    </div>
  );
};
