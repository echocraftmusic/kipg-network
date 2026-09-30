const SESSION_KEY = "ec-analytics-session";

function sessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export class ECAnalytics {
  constructor({ endpoint = null, enabled = false } = {}) {
    this.endpoint = endpoint;
    this.enabled = enabled && Boolean(endpoint);
  }

  async track(eventName, properties = {}) {
    if (!this.enabled || navigator.globalPrivacyControl) return false;
    const payload = {
      eventName,
      properties,
      path: location.pathname,
      referrerOrigin: document.referrer ? new URL(document.referrer).origin : null,
      sessionId: sessionId(),
      occurredAt: new Date().toISOString(),
    };

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      return response.ok;
    } catch (error) {
      console.warn("Analytics delivery failed:", error);
      return false;
    }
  }
}

