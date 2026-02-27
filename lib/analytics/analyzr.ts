interface TrackEventParams {
  name: string;
  properties?: Record<string, unknown>;
}

async function trackEvent({ name, properties }: TrackEventParams): Promise<void> {
  if (typeof window === 'undefined') return; // ignore on server

  try {
    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        domain: window?.location.hostname,
        properties: {
          ...properties,
          url: window?.location.href,
          timestamp: new Date().toISOString(),
        },
        emoji: '📊',
      }),
    });
  } catch (error) {
    // Non‑critical – don't show to user
    console.debug('Analytics event failed:', error);
  }
}

export default trackEvent;