import React from 'react';
import {
  AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig,
  interpolate, spring,
} from 'remotion';

// ── Tutorial composition: title card → numbered steps → outro ────────────
export interface TutorialStep { time: number; text: string; }
export interface VeltroTutorialProps {
  title: string;
  subtitle: string;
  steps: TutorialStep[];      // each: { time (sec), text }
  audioUrl: string;
  brandColor: string;
  durationSec: number;
}

const FONT = "'Archivo','Inter',system-ui,sans-serif";
const MONO = "'Space Mono',monospace";

export const VeltroTutorial: React.FC<VeltroTutorialProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();
  const { title, subtitle, steps, audioUrl, brandColor } = props;
  const titleEnd = 3 * fps;
  const outroStart = durationInFrames - 3 * fps;

  return (
    <AbsoluteFill style={{ background: '#fff' }}>
      {audioUrl ? <Audio src={audioUrl} /> : null}

      {/* Müller-Brockmann left rule */}
      <AbsoluteFill style={{ padding: 80 }}>
        <div style={{ position: 'absolute', left: 80, top: 0, bottom: 0, width: 4, background: brandColor }} />
      </AbsoluteFill>

      {/* Title card */}
      <Sequence from={0} durationInFrames={titleEnd}>
        <TitleCard title={title} subtitle={subtitle} color={brandColor} />
      </Sequence>

      {/* Steps */}
      {steps.map((step, i) => {
        const start = Math.round(step.time * fps);
        const next = steps[i + 1] ? Math.round(steps[i + 1].time * fps) : outroStart;
        return (
          <Sequence key={i} from={start} durationInFrames={Math.max(1, next - start)}>
            <StepCard n={i + 1} total={steps.length} text={step.text} color={brandColor} />
          </Sequence>
        );
      })}

      {/* Outro */}
      <Sequence from={outroStart} durationInFrames={3 * fps}>
        <Outro color={brandColor} />
      </Sequence>

      {/* Folio */}
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-end', padding: 48 }}>
        <div style={{ fontFamily: MONO, fontSize: 18, color: '#111', letterSpacing: '0.08em' }}>VELTRO · TUTORIAL</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const TitleCard: React.FC<{ title: string; subtitle: string; color: string }> = ({ title, subtitle, color }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: 140, paddingRight: 80 }}>
      <div style={{ fontFamily: MONO, fontSize: 22, color, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: s }}>{subtitle}</div>
      <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 96, lineHeight: 0.98, color: '#111', letterSpacing: '-0.02em', marginTop: 16, transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`, opacity: s }}>{title}</div>
    </AbsoluteFill>
  );
};

const StepCard: React.FC<{ n: number; total: number; text: string; color: string }> = ({ n, total, text, color }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: 140, paddingRight: 100 }}>
      <div style={{ fontFamily: MONO, fontSize: 20, color, opacity: o }}>{String(n).padStart(2, '0')} / {String(total).padStart(2, '0')}</div>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 64, lineHeight: 1.1, color: '#111', marginTop: 20, maxWidth: 1400, opacity: o }}>{text}</div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `scale(${interpolate(s, [0, 1], [0.9, 1])})`, opacity: s, textAlign: 'center' }}>
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 80, color: '#111' }}>Start free</div>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 40, color: '#fff', background: color, padding: '14px 32px', display: 'inline-block', marginTop: 20 }}>veltro.io</div>
      </div>
    </AbsoluteFill>
  );
};
