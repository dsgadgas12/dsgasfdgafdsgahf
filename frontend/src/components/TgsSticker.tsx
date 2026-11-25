import React, { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  label: string;
  fallback: string;
};

export default function TgsSticker({ src, label, fallback }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let animation: { destroy: () => void } | undefined;
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) throw new Error(`Sticker request failed: ${response.status}`);
        const compressed = await response.arrayBuffer();
        const decompressor = new DecompressionStream("gzip");
        const stream = new Blob([compressed]).stream().pipeThrough(decompressor);
        const animationData = await new Response(stream).json();

        const { default: lottie } = await import("lottie-web");
        if (!alive || !container.current) return;
        animation = lottie.loadAnimation({
          container: container.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
      } catch {
        if (alive) setFailed(true);
      }
    };

    load();
    return () => {
      alive = false;
      controller.abort();
      animation?.destroy();
    };
  }, [src]);

  return (
    <div className="tgs-sticker" role="img" aria-label={label}>
      {failed ? <span className="tgs-sticker-fallback">{fallback}</span> : <div ref={container} className="tgs-sticker-canvas" />}
    </div>
  );
}
