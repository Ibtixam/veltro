'use client';
import { useState } from 'react';

/**
 * VideoPlaceholder — responsive demo/tutorial video slot.
 * Renders a poster with a play button; on click, embeds the real source
 * (MP4, YouTube, or Vimeo). Until a src is provided it shows a labelled
 * placeholder so the layout is complete before final videos exist.
 */
export interface VideoPlaceholderProps {
  title: string;
  label?: string;            // e.g. "Tutorial · 2 min" or "Demo"
  src?: string;              // mp4 URL or embed URL; if absent → placeholder only
  poster?: string;
  aspect?: '16/9' | '9/16' | '1/1';
}

export default function VideoPlaceholder({ title, label = 'Demo', src, poster, aspect = '16/9' }: VideoPlaceholderProps) {
  const [playing, setPlaying] = useState(false);
  const isEmbed = src && /youtube|youtu\.be|vimeo/.test(src);

  return (
    <figure style={{ margin: 0 }}>
      <div style={{
        position: 'relative', aspectRatio: aspect, maxWidth: aspect === '9/16' ? 280 : '100%',
        border: '2px solid var(--ink)', overflow: 'hidden', background: '#1a1a1a',
      }}>
        {playing && src ? (
          isEmbed
            ? <iframe src={src + (src.includes('?') ? '&' : '?') + 'autoplay=1'} title={title}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                allow="autoplay; fullscreen" allowFullScreen />
            : <video src={src} controls autoPlay style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <button
            onClick={() => src && setPlaying(true)}
            aria-label={src ? `Play ${title}` : `${title} — coming soon`}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, cursor: src ? 'pointer' : 'default',
              background: poster ? `center/cover url(${poster})` : 'linear-gradient(135deg,#1a1a1a,#2a2a2a)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: '#fff',
            }}
          >
            <span style={{
              width: 64, height: 64, borderRadius: '50%', background: 'var(--swiss-red)',
              display: 'grid', placeItems: 'center', fontSize: 24,
            }} aria-hidden>▶</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.9 }}>
              {src ? label : `${label} · coming soon`}
            </span>
          </button>
        )}
      </div>
      <figcaption className="folio" style={{ marginTop: 8 }}>{title}</figcaption>
    </figure>
  );
}
