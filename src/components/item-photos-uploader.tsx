"use client";

import React, { useRef, useState } from "react";
import axios from "axios";
import { Camera, Image as ImageIcon, Trash2, Loader2, AlertCircle, Plus } from "lucide-react";

interface ItemPhotosUploaderProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  maxPhotos?: number;
}

export function ItemPhotosUploader({
  photos = [],
  onChange,
  maxPhotos = 6,
}: ItemPhotosUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);

    try {
      const newUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        if (photos.length + newUrls.length >= maxPhotos) break;
        const file = files[i];

        if (!file.type.startsWith("image/")) {
          setError("Only image files (JPG, PNG, WebP) are allowed");
          continue;
        }

        if (file.size > 10 * 1024 * 1024) {
          setError(`File ${file.name} is too large (max 10MB)`);
          continue;
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("bucket", "pawnify-collateral");

        const res = await axios.post("/api/storage/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        if (res.data?.url) {
          newUrls.push(res.data.url);
        }
      }

      if (newUrls.length > 0) {
        onChange([...photos, ...newUrls]);
      }
    } catch (err: unknown) {
      console.error("Photo upload error:", err);
      let msg = "Failed to upload photo";
      if (axios.isAxiosError(err)) {
        msg = err.response?.data?.error || err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setUploading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const removePhoto = (index: number) => {
    const updated = photos.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-(--text-secondary) flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-(--accent)" />
          Item Photos ({photos.length}/{maxPhotos})
        </label>
        <span className="text-[11px] text-(--text-muted)">
          Upload clear photos of pledged ornament
        </span>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        type="file"
        ref={galleryInputRef}
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={uploading || photos.length >= maxPhotos}
          onClick={() => cameraInputRef.current?.click()}
          className="btn-secondary text-xs px-3 py-2 flex items-center gap-2 hover:border-(--accent-border) hover:text-(--accent) transition-all cursor-pointer"
        >
          <Camera className="w-3.5 h-3.5 text-(--accent)" />
          Take Photo
        </button>

        <button
          type="button"
          disabled={uploading || photos.length >= maxPhotos}
          onClick={() => galleryInputRef.current?.click()}
          className="btn-secondary text-xs px-3 py-2 flex items-center gap-2 hover:border-(--accent-border) hover:text-(--accent) transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-(--accent)" />
          Choose from Gallery
        </button>

        {uploading && (
          <div className="flex items-center gap-2 text-xs text-(--text-muted) animate-pulse font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-(--accent)" />
            Uploading photo...
          </div>
        )}
      </div>

      {/* Thumbnail Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-2">
          {photos.map((url, idx) => (
            <div
              key={idx}
              className="relative group rounded-xl overflow-hidden border border-(--border-primary) bg-(--bg-secondary) aspect-square"
            >
              <img
                src={url}
                alt={`Photo ${idx + 1}`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
              <button
                type="button"
                onClick={() => removePhoto(idx)}
                className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 text-white/80 hover:text-red-400 hover:bg-black transition-all opacity-0 group-hover:opacity-100 cursor-pointer shadow-md"
                title="Remove photo"
              >
                <Trash2 className="w-3 h-3" />
              </button>
              <span className="absolute bottom-1 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono bg-black/60 text-white/90">
                #{idx + 1}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
