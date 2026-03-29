export class AnalyticsTracker {
  constructor(videoId, apiBaseUrl) {
    this.videoId = videoId;
    this.apiBaseUrl = apiBaseUrl;
    this.sessionId = this._generateId();
    this.visitorId = this._getOrCreateVisitorId();
    this.heartbeatInterval = null;
    this.video = null;
  }

  init(videoElement) {
    this.video = videoElement;
  }

  _generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  _getOrCreateVisitorId() {
    const key = 'ecv_visitor_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = this._generateId();
      localStorage.setItem(key, id);
    }
    return id;
  }

  _getUTMParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      utm_content: params.get('utm_content'),
      referer: document.referrer
    };
  }

  async _send(eventType, extra = {}) {
    const currentTime = this.video ? this.video.currentTime : 0;
    const duration = this.video ? this.video.duration : 0;
    const percentWatched = duration > 0 ? Math.round(currentTime / duration * 100) : 0;

    const payload = {
      videoId: this.videoId,
      sessionId: this.sessionId,
      visitorId: this.visitorId,
      currentTime: Math.round(currentTime * 10) / 10,
      percentWatched,
      isPlaying: this.video ? !this.video.paused : false,
      eventType,
      metadata: { ...this._getUTMParams(), ...extra }
    };

    try {
      await fetch(`${this.apiBaseUrl}/api/analytics/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      });
    } catch (e) {
      // Silent fail — don't break the player
    }
  }

  trackEvent(type, metadata = {}) {
    this._send(type, metadata);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.video && !this.video.paused) {
        this._send('heartbeat');
      }
    }, 5000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  destroy() {
    this.stopHeartbeat();
  }
}
