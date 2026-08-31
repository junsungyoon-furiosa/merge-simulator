export function formatDuration(value: number | null | undefined): string {
  if (value == null) return "—";
  const roundedMinutes = Math.max(0, Math.round(value));
  if (roundedMinutes >= 24 * 60) {
    const days = Math.floor(roundedMinutes / (24 * 60));
    const hours = (roundedMinutes - days * 24 * 60) / 60;
    return `${days}일 ${hours.toFixed(1)}시간`;
  }
  if (roundedMinutes >= 60) {
    const hours = Math.floor(roundedMinutes / 60);
    return `${hours}시간 ${roundedMinutes % 60}분`;
  }
  return `${value.toFixed(1)}분`;
}

export function formatElapsedTime(value: number): string {
  const roundedMinutes = Math.max(0, Math.round(value));
  if (roundedMinutes < 60) return `${roundedMinutes}분`;
  const hours = Math.floor(roundedMinutes / 60);
  return `${hours}시간 ${roundedMinutes % 60}분`;
}
