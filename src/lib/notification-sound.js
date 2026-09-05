let audioContext;

export async function unlockNotificationSound() {
  if (typeof window === "undefined") return false;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return false;

  audioContext ||= new AudioContext();
  if (audioContext.state === "suspended") await audioContext.resume();
  return audioContext.state === "running";
}

export async function playNotificationSound() {
  if (!await unlockNotificationSound()) return false;

  const startedAt = audioContext.currentTime;
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, startedAt);
  gain.gain.exponentialRampToValueAtTime(0.12, startedAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.42);
  gain.connect(audioContext.destination);

  for (const [frequency, delay] of [[880, 0], [1174.66, 0.12]]) {
    const oscillator = audioContext.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startedAt + delay);
    oscillator.connect(gain);
    oscillator.start(startedAt + delay);
    oscillator.stop(startedAt + delay + 0.28);
  }
  return true;
}
