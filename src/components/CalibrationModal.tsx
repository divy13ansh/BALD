import React from 'react';
import { ImagePlus, Keyboard, RotateCcw, SlidersHorizontal, Trash2, X } from 'lucide-react';
import {
  CAMPUS_ORIGIN,
  DEFAULT_MAP_CALIBRATION,
  MapCalibration,
} from '../campus/campusData';

interface CalibrationModalProps {
  open: boolean;
  calibration: MapCalibration;
  onClose: () => void;
  onUploadMap: (dataUrl: string) => void;
  onRestoreSatellite: () => void;
  onClearMap: () => void;
  onChangeCalibration: (next: MapCalibration) => void;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  open,
  calibration,
  onClose,
  onUploadMap,
  onRestoreSatellite,
  onClearMap,
  onChangeCalibration,
}) => {
  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUploadMap(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const update = (patch: Partial<MapCalibration>) => {
    onChangeCalibration({ ...calibration, ...patch });
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-slate-950 border border-white/14 rounded-2xl p-6 shadow-2xl text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">
              Controls & Manual Campus Map Calibration
            </h2>
            <p className="mt-1 text-xs text-slate-400 font-mono-tabular">
              Origin: Chitkara University Punjab · {CAMPUS_ORIGIN.lat.toFixed(6)}° N,{' '}
              {CAMPUS_ORIGIN.lng.toFixed(6)}° E
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close controls and calibration"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Keyboard & Mouse Controls */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-3">
            <Keyboard className="w-3.5 h-3.5 text-red-400" />
            Navigation Controls
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span>Move / Walk</span>
              <span className="font-mono-tabular text-slate-100">WASD / Arrows</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Sprint</span>
              <span className="font-mono-tabular text-slate-100">Hold Shift</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Jump</span>
              <span className="font-mono-tabular text-slate-100">Space</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Orbit Camera</span>
              <span className="font-mono-tabular text-slate-100">Drag + Scroll</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Inspect & Attach Photos</span>
              <span className="font-mono-tabular text-slate-100">Click Block or E</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Hide / Show HUD</span>
              <span className="font-mono-tabular text-slate-100">H Key</span>
            </div>
          </div>
        </div>

        {/* Manual Ground Map Overlay & Fine-Tuning */}
        <div className="mt-5 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-red-400" />
            Hand-Drawn / Annotated Ground Map Alignment
          </div>
          <p className="text-xs text-slate-400 leading-relaxed mb-3">
            Upload your own hand-drawn, annotated, or satellite campus blueprint onto the 3D ground plane and align it live under the extruded buildings and roads.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors cursor-pointer whitespace-nowrap">
              <ImagePlus className="w-3.5 h-3.5" />
              Upload Custom / Hand Map
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            <button
              type="button"
              onClick={onRestoreSatellite}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Default Satellite
            </button>

            {calibration.visible && (
              <button
                type="button"
                onClick={onClearMap}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-white/8 hover:bg-white/14 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hide Overlay
              </button>
            )}
          </div>

          {/* Fine Alignment Sliders */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>East–West Offset (X)</span>
                <span className="font-mono-tabular text-slate-200">{calibration.offsetX.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min={-250}
                max={150}
                step={0.5}
                value={calibration.offsetX}
                onChange={(e) => update({ offsetX: parseFloat(e.target.value), visible: true })}
                className="w-full accent-red-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>North–South Offset (Z)</span>
                <span className="font-mono-tabular text-slate-200">{calibration.offsetZ.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min={-200}
                max={200}
                step={0.5}
                value={calibration.offsetZ}
                onChange={(e) => update({ offsetZ: parseFloat(e.target.value), visible: true })}
                className="w-full accent-red-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Uniform Scale</span>
                <span className="font-mono-tabular text-slate-200">{calibration.scaleX.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min={0.4}
                max={2.0}
                step={0.01}
                value={calibration.scaleX}
                onChange={(e) => {
                  const s = parseFloat(e.target.value);
                  update({ scaleX: s, scaleZ: s, visible: true });
                }}
                className="w-full accent-red-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Rotation Angle</span>
                <span className="font-mono-tabular text-slate-200">{calibration.rotationDeg.toFixed(1)}°</span>
              </div>
              <input
                type="range"
                min={-25}
                max={25}
                step={0.2}
                value={calibration.rotationDeg}
                onChange={(e) => update({ rotationDeg: parseFloat(e.target.value), visible: true })}
                className="w-full accent-red-500 cursor-pointer"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Overlay Opacity</span>
                <span className="font-mono-tabular text-slate-200">
                  {Math.round(calibration.opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={calibration.opacity}
                onChange={(e) => update({ opacity: parseFloat(e.target.value), visible: true })}
                className="w-full accent-red-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 font-mono-tabular">
            <span>
              Base Footprint: {DEFAULT_MAP_CALIBRATION.baseWidth}m × {DEFAULT_MAP_CALIBRATION.baseHeight}m
            </span>
            <button
              type="button"
              onClick={() => onChangeCalibration({ ...DEFAULT_MAP_CALIBRATION })}
              className="text-slate-300 hover:text-white underline cursor-pointer"
            >
              Snap to Exact Default
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
