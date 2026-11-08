/**
 * Generates an SVG data URI for image previews and thumbnails in Demo Mode.
 */
export function createDemoSvgDataUri(title: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="960" height="540">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="50%" stop-color="#1e1b4b"/>
        <stop offset="100%" stop-color="#311042"/>
      </linearGradient>
      <radialGradient id="glow1" cx="25%" cy="30%" r="45%">
        <stop offset="0%" stop-color="#6366f1" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glow2" cx="75%" cy="70%" r="45%">
        <stop offset="0%" stop-color="#ec4899" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#ec4899" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="960" height="540" fill="url(#bg)"/>
    <circle cx="240" cy="160" r="320" fill="url(#glow1)"/>
    <circle cx="720" cy="380" r="320" fill="url(#glow2)"/>
    <rect x="280" y="170" width="400" height="200" rx="24" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.18"/>
    <text x="480" y="258" text-anchor="middle" fill="#ffffff" font-family="Inter, sans-serif" font-size="28" font-weight="700">${title}</text>
    <text x="480" y="298" text-anchor="middle" fill="#94a3b8" font-family="Inter, sans-serif" font-size="14">Dufs Lume UI · Rich Media Preview</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Generates a synthesized ambient WAV audio data URI for Demo Mode audio previews and Mini Player.
 */
export function createDemoWavDataUri(seedName = ''): string {
  const sampleRate = 22050;
  const durationSeconds = 4;
  const numSamples = sampleRate * durationSeconds;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const isAlt = seedName.toLowerCase().includes('lofi') || seedName.toLowerCase().includes('chime');
  const f1 = isAlt ? 392.0 : 440.0;
  const f2 = isAlt ? 493.88 : 554.37;
  const f3 = isAlt ? 587.33 : 659.25;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 0.75) * Math.min(1, t * 15);
    const wave =
      Math.sin(2 * Math.PI * f1 * t) * 0.5 +
      Math.sin(2 * Math.PI * f2 * t) * 0.3 +
      Math.sin(2 * Math.PI * f3 * t) * 0.2;
    const sample = Math.max(-1, Math.min(1, wave * envelope * 0.5));
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}
