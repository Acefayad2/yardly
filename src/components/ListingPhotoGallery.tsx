"use client";

import { useEffect, useRef, useState } from "react";

type ListingPhotoGalleryProps = {
  images: string[];
  title: string;
};

export default function ListingPhotoGallery({ images, title }: ListingPhotoGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const photoCount = images.length;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (activeIndex === null) {
      if (dialog.open) dialog.close();
    } else if (!dialog.open) {
      dialog.showModal();
    }
  }, [activeIndex]);

  function openPhoto(index: number, opener: HTMLButtonElement) {
    openerRef.current = opener;
    setActiveIndex(index);
  }

  function closeGallery() {
    setActiveIndex(null);
  }

  function movePhoto(direction: number) {
    setActiveIndex((current) => current === null ? null : (current + direction + photoCount) % photoCount);
  }

  if (!photoCount) {
    return (
      <div className="mt-5 grid h-64 place-items-center rounded-2xl bg-surface-soft text-sm font-medium text-muted sm:h-80" role="img" aria-label={`${title}. Photos unavailable`}>
        Photos unavailable
      </div>
    );
  }

  return (
    <>
      <div className="relative mt-5 overflow-hidden rounded-2xl">
        <PhotoButton
          className="block h-64 w-full sm:h-80 md:hidden"
          imageClassName="h-full w-full object-cover"
          src={images[0]}
          alt={`${title}, main view`}
          label={photoCount === 1 ? "View photo" : `Show all ${photoCount} photos`}
          onOpen={(button) => openPhoto(0, button)}
        />
        <div className="hidden grid-cols-4 grid-rows-2 gap-2 md:grid" style={{ height: 420 }}>
          <PhotoButton
            className={`${photoCount === 1 ? "col-span-4" : "col-span-2"} row-span-2 h-full w-full`}
            imageClassName="h-full w-full object-cover transition duration-200 hover:brightness-90"
            src={images[0]}
            alt={`${title}, main view`}
            label="View photo 1"
            onOpen={(button) => openPhoto(0, button)}
          />
          {images.slice(1, 5).map((src, index) => (
            <PhotoButton
              key={`${src}-${index}`}
              className="h-full w-full"
              imageClassName="h-full w-full object-cover transition duration-200 hover:brightness-90"
              src={src}
              alt={`${title}, view ${index + 2}`}
              label={`View photo ${index + 2}`}
              onOpen={(button) => openPhoto(index + 1, button)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={(event) => openPhoto(0, event.currentTarget)}
          className="absolute bottom-3 right-3 rounded-lg border border-foreground/20 bg-white px-3 py-2 text-xs font-semibold text-foreground shadow-sm transition hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:text-sm"
        >
          {photoCount === 1 ? "View photo" : `Show all ${photoCount} photos`}
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="photo-gallery-title"
        className="m-auto h-full max-h-none w-full max-w-none bg-foreground/95 p-0 text-white backdrop:bg-black/80"
        onCancel={(event) => {
          event.preventDefault();
          closeGallery();
        }}
        onClose={() => {
          setActiveIndex(null);
          openerRef.current?.focus();
        }}
        onKeyDown={(event) => {
          if (photoCount < 2) return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            movePhoto(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            movePhoto(1);
          } else if (event.key === "Home") {
            event.preventDefault();
            setActiveIndex(0);
          } else if (event.key === "End") {
            event.preventDefault();
            setActiveIndex(photoCount - 1);
          }
        }}
      >
        {activeIndex !== null && (
          <div className="flex min-h-full flex-col px-4 pb-4 pt-3 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 id="photo-gallery-title" className="font-semibold">{title}</h2>
                <p className="text-sm text-white/70" aria-live="polite">Photo {activeIndex + 1} of {photoCount}</p>
              </div>
              <button type="button" onClick={closeGallery} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-2xl hover:bg-white/20" aria-label="Close photo gallery">×</button>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center py-4 sm:px-16">
              <GalleryImage key={images[activeIndex]} src={images[activeIndex]} alt={`${title}, photo ${activeIndex + 1} of ${photoCount}`} className="max-h-[calc(100dvh-12rem)] max-w-full rounded-xl object-contain" fallbackClassName="grid h-72 w-full max-w-3xl place-items-center rounded-xl bg-white/10 text-sm font-medium text-white/75" />
              {photoCount > 1 && (
                <>
                  <button type="button" onClick={() => movePhoto(-1)} className="absolute left-0 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-2xl hover:bg-white/20" aria-label="Previous photo">‹</button>
                  <button type="button" onClick={() => movePhoto(1)} className="absolute right-0 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-2xl hover:bg-white/20" aria-label="Next photo">›</button>
                </>
              )}
            </div>

            {photoCount > 1 && (
              <div className="mx-auto flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="Choose a photo">
                {images.map((src, index) => (
                  <button key={`${src}-${index}`} type="button" onClick={() => setActiveIndex(index)} className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${index === activeIndex ? "border-white" : "border-transparent opacity-65 hover:opacity-100"}`} aria-label={`View photo ${index + 1}`} aria-current={index === activeIndex ? "true" : undefined}>
                    <GalleryImage src={src} alt="" className="h-full w-full object-cover" fallbackClassName="grid h-full w-full place-items-center bg-white/10 text-[10px] text-white/75" compact />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}

function PhotoButton({ className, imageClassName, src, alt, label, onOpen }: { className: string; imageClassName: string; src: string; alt: string; label: string; onOpen: (button: HTMLButtonElement) => void }) {
  return (
    <button type="button" className={`overflow-hidden bg-surface-soft text-left focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white ${className}`} onClick={(event) => onOpen(event.currentTarget)} aria-label={label}>
      <GalleryImage src={src} alt={alt} className={imageClassName} fallbackClassName="grid h-full w-full place-items-center bg-surface-soft px-4 text-center text-sm font-medium text-muted" />
    </button>
  );
}

function GalleryImage({ src, alt, className, fallbackClassName, compact = false }: { src: string; alt: string; className: string; fallbackClassName: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span className={fallbackClassName} role="img" aria-label={alt ? `${alt}. Image unavailable` : "Image unavailable"}>{compact ? "Unavailable" : "Photo unavailable"}</span>;
  }

  // Listing photos are stored as public URLs and may come from more than one host,
  // so keep the existing unoptimized image path and handle load failures in-place.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} />;
}
