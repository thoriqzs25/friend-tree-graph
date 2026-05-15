"use client";

import Cropper from "react-easy-crop";
import { useState, useCallback } from "react";
import type { CropArea } from "@/lib/crop-image";

type Props = {
  imageSrc: string;
  onConfirm: (cropPx: CropArea) => void;
  onCancel: () => void;
};

export default function ImageCropModal({ imageSrc, onConfirm, onCancel }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPx, setCroppedAreaPx] = useState<CropArea | null>(null);

  const onCropComplete = useCallback((_: unknown, px: CropArea) => {
    setCroppedAreaPx(px);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
      {/* crop area */}
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          style={{
            containerStyle: { background: "transparent" },
          }}
        />
      </div>

      {/* zoom slider */}
      <div className="flex items-center gap-3 border-t border-zinc-800 bg-zinc-950 px-6 py-3">
        <span className="text-xs text-zinc-500">Zoom</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 accent-indigo-500"
        />
      </div>

      {/* actions */}
      <div className="flex gap-3 border-t border-zinc-800 bg-zinc-950 px-6 py-4">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          onClick={() => croppedAreaPx && onConfirm(croppedAreaPx)}
          disabled={!croppedAreaPx}
          className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Apply crop
        </button>
      </div>
    </div>
  );
}
