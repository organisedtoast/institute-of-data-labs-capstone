export default function normalizeTickerIdentifier(value) {
  return String(value || '').trim().toUpperCase();
}
