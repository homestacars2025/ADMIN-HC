/**
 * A short two-note chime, generated so the app ships no audio file. Browsers
 * refuse sound before the first click on a page, in which case it stays silent.
 */
export function playNotificationSound(): void {
  try {
    const context = new AudioContext();
    [880, 1175].forEach((frequency, index) => {
      const start = context.currentTime + index * 0.12;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.24);
    });
    window.setTimeout(() => context.close(), 700);
  } catch {
    // No audio support: a missing chime is not worth surfacing.
  }
}
