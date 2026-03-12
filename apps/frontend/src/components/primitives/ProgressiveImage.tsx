/**
 * ProgressiveImage — loads a low-res placeholder first, then backfills
 * with a higher-res version once it finishes loading in the background.
 *
 * Uses a single <img> element to avoid layout issues. The high-res image
 * is preloaded via a hidden Image() object and the src is swapped seamlessly.
 */

import { useEffect, useState } from "react";

interface ProgressiveImageProps {
  /** Low-res URL shown immediately. */
  lowSrc: string;
  /** Higher-res URL loaded in the background and swapped in. */
  highSrc: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
}

export function ProgressiveImage({
  lowSrc,
  highSrc,
  alt,
  className,
  loading = "lazy",
}: ProgressiveImageProps) {
  const [src, setSrc] = useState(lowSrc);

  // Preload high-res in background and swap when ready
  useEffect(() => {
    setSrc(lowSrc);

    const img = new Image();
    img.src = highSrc;

    if (img.complete) {
      setSrc(highSrc);
      return;
    }

    img.onload = () => setSrc(highSrc);

    return () => {
      img.onload = null;
    };
  }, [lowSrc, highSrc]);

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
    />
  );
}
