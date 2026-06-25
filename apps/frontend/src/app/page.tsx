// Root page — renders VeltroApp (full SPA: landing → pricing → onboard → dashboard)
// All routing is internal to VeltroApp for simplicity
// Locale autodetected from browser navigator.language

import VeltroApp from './VeltroApp';

export default function Page() {
  return <VeltroApp />;
}
