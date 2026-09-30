export function requestIsSameOrigin(input: {
  origin: string | null;
  host: string | null;
  forwardedHost?: string | null;
  forwardedProtocol?: string | null;
  protocol: string;
}) {
  if (!input.origin) return false;
  try {
    const originUrl = new URL(input.origin);
    const host = input.forwardedHost?.split(',')[0].trim() || input.host || '';
    const forwardedProtocol = input.forwardedProtocol?.split(',')[0].trim();
    const expectedProtocol = forwardedProtocol ? `${forwardedProtocol}:` : input.protocol;
    return originUrl.host.toLowerCase() === host.toLowerCase() && originUrl.protocol === expectedProtocol;
  } catch {
    return false;
  }
}
