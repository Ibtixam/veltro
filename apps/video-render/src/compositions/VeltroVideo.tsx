import React from 'react';
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence,
  useCurrentFrame, useVideoConfig, interpolate, spring,
} from 'remotion';

// ── Props contract (mirrors RemotionRenderSpec.props in the backend) ─────
export interface Clip { type: 'video' | 'image'; src: string; start: number; duration: number; attribution: string | null; }
export interface VeltroVideoProps {
  brandName: string;
  brandColor: string;
  lang: string;
  audioUrl: string;
  clips: Clip[];
  hook: string;
  onScreenText: string[];
  cta: string;
  ctaUrl: string;
  durationSec: number;
}

const FONT = "'Archivo','Inter',system-ui,sans-serif";

export const VeltroVideo: React.FC<VeltroVideoProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();
  const { clips, audioUrl, hook, onScreenText, cta, ctaUrl, brandColor } = props;

  const ctaStart = durationInFrames - 5 * fps; // last 5 seconds
  const overlayWindow = onScreenText.length
    ? Math.floor((durationInFrames - 3 * fps) / onScreenText.length)
    : durationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: '#111' }}>
      {/* Narration */}
      {audioUrl ? <Audio src={audioUrl} /> : null}

      {/* B-roll clips (free stock footage / images) */}
      {clips.map((clip, i) => (
        <Sequence key={i} from={clip.start} durationInFrames={clip.duration}>
          <AbsoluteFill>
            {clip.type === 'video'
              ? <OffthreadVideo src={clip.src} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <Img src={clip.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            {/* Legibility scrim */}
            <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.45) 100%)' }} />
          </AbsoluteFill>
        </Sequence>
      ))}

      {/* Hook — first 3 seconds, spring-in */}
      <Sequence from={0} durationInFrames={3 * fps}>
        <Hook text={hook} color={brandColor} />
      </Sequence>

      {/* Timed on-screen text overlays */}
      {onScreenText.map((text, i) => (
        <Sequence key={i} from={3 * fps + i * overlayWindow} durationInFrames={overlayWindow}>
          <Caption text={text} color={brandColor} />
        </Sequence>
      ))}

      {/* CTA — last 5 seconds */}
      <Sequence from={ctaStart} durationInFrames={5 * fps}>
        <CTA text={cta} url={ctaUrl} color={brandColor} />
      </Sequence>

      {/* Brand watermark */}
      <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'flex-end', padding: 40 }}>
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 28, color: '#fff', opacity: 0.85, letterSpacing: '-0.02em' }}>
          {props.brandName}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Hook: React.FC<{ text: string; color: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14 } });
  const y = interpolate(s, [0, 1], [40, 0]);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 8%' }}>
      <div style={{
        fontFamily: FONT, fontWeight: 800, fontSize: 84, lineHeight: 1.05, color: '#fff',
        textAlign: 'center', textShadow: '0 4px 24px rgba(0,0,0,0.6)',
        transform: `translateY(${y}px)`, opacity: s,
      }}>{text}</div>
    </AbsoluteFill>
  );
};

const Caption: React.FC<{ text: string; color: string }> = ({ text, color }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8, 1e6], [0, 1, 1]);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: '12%' }}>
      <div style={{
        fontFamily: FONT, fontWeight: 700, fontSize: 48, color: '#fff', textAlign: 'center',
        background: `${color}E6`, padding: '14px 28px', maxWidth: '82%', opacity,
      }}>{text}</div>
    </AbsoluteFill>
  );
};

const CTA: React.FC<{ text: string; url: string; color: string }> = ({ text, url, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`, opacity: s, textAlign: 'center' }}>
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 64, color: '#fff', marginBottom: 24 }}>{text}</div>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 36, color: '#fff', background: color, padding: '16px 36px', display: 'inline-block' }}>{url}</div>
      </div>
    </AbsoluteFill>
  );
};
