import React from 'react';
import { Composition } from 'remotion';
import { VeltroVideo, type VeltroVideoProps } from './compositions/VeltroVideo';
import { VeltroTutorial, type VeltroTutorialProps } from './compositions/VeltroTutorial';

const VIDEO_DEFAULTS: VeltroVideoProps = {
  brandName: 'Veltro', brandColor: '#e4002b', lang: 'en', audioUrl: '', clips: [],
  hook: 'Stop guessing what to publish.',
  onScreenText: ['40 small keywords beat 1 big one', 'Working code, not reports'],
  cta: 'Start free', ctaUrl: 'veltro.io', durationSec: 30,
};

const TUTORIAL_DEFAULTS: VeltroTutorialProps = {
  title: 'Getting started', subtitle: 'Tutorial · 90s', brandColor: '#e4002b', audioUrl: '', durationSec: 90,
  steps: [
    { time: 3, text: 'Enter your URL — Veltro detects your stack automatically.' },
    { time: 18, text: 'Connect Search Console and GA4 for real revenue numbers.' },
    { time: 36, text: 'Pick a plan. Your first analysis runs immediately.' },
    { time: 54, text: 'Every Monday: opportunities, pages, and a video — delivered.' },
    { time: 72, text: 'Download the ZIP and deploy in about 30 minutes.' },
  ],
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="VeltroVideo" component={VeltroVideo} durationInFrames={30 * 30} fps={30} width={1920} height={1080} defaultProps={VIDEO_DEFAULTS} />
    <Composition id="VeltroTutorial" component={VeltroTutorial} durationInFrames={90 * 30} fps={30} width={1920} height={1080} defaultProps={TUTORIAL_DEFAULTS} />
  </>
);
