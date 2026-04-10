import { HlsHandler } from './hls-handler.js';
import { AnalyticsTracker } from './analytics-tracker.js';
import { SmartPlay } from './smartplay.js';
import { PlayerUI } from './ui/player-ui.js';

// Inject CSS once
if (!document.getElementById('ecv-player-styles')) {
  const style = document.createElement('style');
  style.id = 'ecv-player-styles';
  style.textContent = `
    .ecv-hide { display: none !important; }
    .ecv-show { display: block !important; }
    .ecv-container { position:relative; width:100%; max-width:100%; background:#000; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; overflow:hidden; border-radius:8px; }
    .ecv-container.ecv-focused { position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:999999; border-radius:0; }
    .ecv-video-wrapper { position:relative; padding-top:56.25%; background:#000; transition:padding-top 0.1s; }
    .ecv-container.ecv-focused .ecv-video-wrapper { padding-top:0; height:100%; }
    .ecv-video { position:absolute; top:0; left:0; width:100%; height:100%; object-fit:contain; }
    .ecv-poster { position:absolute; top:0; left:0; width:100%; height:100%; background-size:cover; background-position:center; cursor:pointer; z-index:2; }
    .ecv-controls { position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent,rgba(0,0,0,.8)); padding:8px 12px 10px; z-index:10; transition:opacity .3s; }
    .ecv-progress-bar { height:4px; background:rgba(255,255,255,.2); border-radius:2px; cursor:pointer; margin-bottom:8px; position:relative; transition:height .15s; }
    .ecv-progress-bar:hover { height:6px; }
    .ecv-progress-fill { height:100%; background:var(--ecv-primary,#6C5CE7); border-radius:2px; position:absolute; top:0; left:0; z-index:2; transition:width .1s linear; }
    .ecv-progress-buffer { height:100%; background:rgba(255,255,255,.15); border-radius:2px; position:absolute; top:0; left:0; z-index:1; }
    .ecv-controls-row { display:flex; align-items:center; gap:10px; color:#fff; font-size:13px; }
    .ecv-play-btn, .ecv-volume-btn, .ecv-fullscreen-btn { background:none; border:none; color:#fff; cursor:pointer; padding:4px; font-size:18px; display:flex; align-items:center; }
    .ecv-play-btn:hover, .ecv-volume-btn:hover, .ecv-fullscreen-btn:hover { opacity:.8; }
    .ecv-time { white-space:nowrap; font-variant-numeric:tabular-nums; }
    .ecv-spacer { flex:1; }
    .ecv-volume-wrapper { display:flex; align-items:center; gap:4px; }
    .ecv-volume-slider { width:70px; height:4px; -webkit-appearance:none; appearance:none; background:rgba(255,255,255,.3); border-radius:2px; outline:none; cursor:pointer; }
    .ecv-volume-slider::-webkit-slider-thumb { -webkit-appearance:none; width:12px; height:12px; background:#fff; border-radius:50%; cursor:pointer; }
    .ecv-speed-select { background:rgba(255,255,255,.15); color:#fff; border:1px solid rgba(255,255,255,.2); border-radius:4px; padding:2px 4px; font-size:12px; cursor:pointer; }
    .ecv-cta-overlay { position:absolute; bottom:60px; left:0; right:0; display:flex; justify-content:center; z-index:15; animation:ecv-fadeIn .5s; }
    .ecv-cta-button { display:inline-block; padding:14px 36px; color:#fff; text-decoration:none; border-radius:8px; font-size:18px; font-weight:700; text-align:center; animation:ecv-pulse 2s infinite; box-shadow:0 4px 20px rgba(0,0,0,.4); }
    @keyframes ecv-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
    @keyframes ecv-fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    .ecv-popup-overlay { position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; z-index:20; }
    .ecv-popup-card { background:#1a1a2e; color:#fff; padding:24px; border-radius:12px; max-width:400px; width:90%; text-align:center; position:relative; }
    .ecv-popup-close { position:absolute; top:8px; right:12px; background:none; border:none; color:#aaa; font-size:20px; cursor:pointer; }
    .ecv-popup-img { max-width:100%; border-radius:8px; margin-bottom:12px; }
    .ecv-popup-text { margin:12px 0; font-size:15px; line-height:1.5; }
    .ecv-popup-btn { display:inline-block; padding:10px 24px; background:var(--ecv-primary,#6C5CE7); color:#fff; text-decoration:none; border-radius:6px; font-weight:600; }
    .ecv-skip-warning { position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.7); display:flex; align-items:center; justify-content:center; color:#fff; font-size:18px; font-weight:600; z-index:20; text-align:center; padding:20px; }
    .ecv-recovery-overlay { position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.85); display:flex; align-items:center; justify-content:center; z-index:20; }
    .ecv-recovery-content { text-align:center; color:#fff; }
    .ecv-recovery-content p { font-size:18px; margin-bottom:16px; }
    .ecv-recovery-buttons { display:flex; gap:12px; justify-content:center; }
    .ecv-btn-continue, .ecv-btn-restart, .ecv-btn-continue-thumb { padding:10px 24px; border:none; border-radius:6px; font-size:15px; font-weight:600; cursor:pointer; }
    .ecv-btn-continue, .ecv-btn-continue-thumb { background:var(--ecv-primary,#6C5CE7); color:#fff; }
    .ecv-btn-restart { background:rgba(255,255,255,.15); color:#fff; }
    .ecv-recovery-thumb { width:100%; height:100%; background-size:cover; background-position:center; display:flex; flex-direction:column; align-items:center; justify-content:center; }
    .ecv-recovery-text { color:#fff; font-size:22px; font-weight:700; text-shadow:0 2px 8px rgba(0,0,0,.7); margin-bottom:16px; }
    .ecv-fake-comments { position:absolute; bottom:60px; right:10px; max-width:280px; z-index:12; pointer-events:none; }
    .ecv-fake-comment { display:flex; align-items:flex-start; gap:8px; background:rgba(0,0,0,.75); color:#fff; padding:8px 12px; border-radius:10px; margin-top:6px; font-size:13px; opacity:0; transform:translateY(20px); transition:all .4s ease; }
    .ecv-fake-comment.ecv-comment-visible { opacity:1; transform:translateY(0); }
    .ecv-comment-avatar { width:28px; height:28px; border-radius:50%; flex-shrink:0; }
    .ecv-comment-body strong { color:var(--ecv-primary,#6C5CE7); }
    .ecv-view-counter { position:absolute; top:10px; left:10px; background:rgba(0,0,0,.7); color:#fff; padding:6px 12px; border-radius:20px; font-size:13px; z-index:11; }
    .ecv-logo-overlay { z-index:11; pointer-events:none; }
    .ecv-skin-light .ecv-controls { background:linear-gradient(transparent,rgba(255,255,255,.9)); }
    .ecv-skin-light .ecv-controls-row { color:#333; }
    .ecv-skin-light .ecv-play-btn, .ecv-skin-light .ecv-volume-btn, .ecv-skin-light .ecv-fullscreen-btn { color:#333; }
    @media (max-width:480px) {
      .ecv-controls-row { gap:6px; font-size:11px; }
      .ecv-volume-slider { width:50px; }
      .ecv-cta-button { font-size:14px; padding:10px 20px; }
    }
  `;
  document.head.appendChild(style);
}

// Detect API base URL from script src or data-api-base attribute
function getApiBase() {
  const scripts = document.querySelectorAll('script[src]');
  for (const s of scripts) {
    if (s.dataset.apiBase) return s.dataset.apiBase.replace(/\/$/, '');
    if (s.src.includes('player.js') || s.src.includes('ecv-player')) {
      if (!s.src.startsWith(window.location.origin)) {
        try { return new URL(s.src).origin; } catch {}
      }
    }
  }
  return window.location.origin;
}

class EcvPlayer extends HTMLElement {
  static get observedAttributes() { return ['video-id']; }

  connectedCallback() {
    const videoId = this.getAttribute('video-id') || this.getAttribute('id');
    if (!videoId) { this.innerHTML = '<p style="color:red">ecv-player: video-id obrigatório</p>'; return; }
    this._videoId = videoId;
    // Remove id attribute to avoid conflicts
    if (this.getAttribute('id') === videoId) this.removeAttribute('id');
    this._apiBase = getApiBase();
    this._loadConfig();
  }

  disconnectedCallback() {
    this._hlsHandler?.destroy();
    this._tracker?.destroy();
    this._smartplay?.destroy();
  }

  async _loadConfig() {
    try {
      const resp = await fetch(`${this._apiBase}/api/player-config/${this._videoId}`, { credentials: 'include' });
      if (!resp.ok) { this.innerHTML = '<p style="color:#888;text-align:center;padding:40px">Vídeo não disponível</p>'; return; }
      const config = await resp.json();
      config.videoId = this._videoId;
      this._config = config;
      this._initPlayer(config);
    } catch (err) {
      this.innerHTML = '<p style="color:#888;text-align:center;padding:40px">Erro ao carregar vídeo</p>';
      console.error('ECV Player error:', err);
    }
  }

  _initPlayer(config) {
    // Apply traffic filters
    if (config.trafficFilters?.length > 0) {
      const redirectId = this._checkTrafficFilters(config.trafficFilters);
      if (redirectId && redirectId !== this._videoId) {
        this.setAttribute('video-id', redirectId);
        this._videoId = redirectId;
        this._loadConfig();
        return;
      }
    }

    // Build UI
    this._ui = new PlayerUI(this, config);
    const video = this._ui.buildDOM();
    this._ui.bindEvents();

    // Store references for SmartPlay
    this._progressMode = 'normal';

    // Initialize HLS
    this._hlsHandler = new HlsHandler(video, config.hlsUrl, config.segmentBaseUrl);
    this._hlsHandler.init();

    // Initialize Analytics
    this._tracker = new AnalyticsTracker(this._videoId, this._apiBase);
    this._tracker.init(video);

    // Track events
    video.addEventListener('play', () => {
      this._tracker.trackEvent('play');
      this._tracker.startHeartbeat();
    });
    video.addEventListener('pause', () => {
      this._tracker.trackEvent('pause');
      this._tracker.stopHeartbeat();
    });
    video.addEventListener('ended', () => {
      this._tracker.trackEvent('ended');
      this._tracker.stopHeartbeat();
    });
    video.addEventListener('seeked', () => this._tracker.trackEvent('seek'));
    video.addEventListener('volumechange', () => {
      if (!video.muted && video.volume > 0) this._tracker.trackEvent('unmute');
    });

    // Page visibility
    document.addEventListener('visibilitychange', () => {
      this._tracker.trackEvent(document.hidden ? 'page_hidden' : 'page_visible');
    });

    // Initialize SmartPlay
    this._smartplay = new SmartPlay(this);
    this._smartplay.init(video, config);
    this._smartplay = this._smartplay;

    // Fire pixels
    this._setupPixels(config.pixels || [], video);

    // Auto-detect aspect ratio from video metadata
    video.addEventListener('loadedmetadata', () => {
      if (video.videoWidth && video.videoHeight) {
        const wrapper = this.querySelector('.ecv-video-wrapper');
        if (wrapper) {
          wrapper.style.paddingTop = `${(video.videoHeight / video.videoWidth) * 100}%`;
        }
      }
    });

    // Autoplay
    if (config.autoplay) {
      video.muted = true;
      video.play().catch(() => {});
    }
  }

  _checkTrafficFilters(filters) {
    const lang = navigator.language?.toLowerCase() || '';
    const isMobile = /mobile|android|iphone/i.test(navigator.userAgent);
    const device = isMobile ? 'mobile' : 'desktop';
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get('utm_source') || '';

    for (const f of filters.sort((a, b) => (b.priority || 0) - (a.priority || 0))) {
      switch (f.rule_type) {
        case 'language':
          if (lang.startsWith(f.rule_value.toLowerCase())) return f.redirect_video_id;
          break;
        case 'device':
          if (device === f.rule_value.toLowerCase()) return f.redirect_video_id;
          break;
        case 'utm_source':
          if (utmSource.toLowerCase().includes(f.rule_value.toLowerCase())) return f.redirect_video_id;
          break;
      }
    }
    return null;
  }

  _setupPixels(pixels, video) {
    if (!pixels.length) return;

    const firePixel = (pixel, eventName) => {
      if (!pixel.events.includes(eventName)) return;
      switch (pixel.pixel_type) {
        case 'meta':
          if (window.fbq) window.fbq('trackCustom', `Video_${eventName}`, { videoId: this._videoId });
          break;
        case 'ga4':
          if (window.gtag) window.gtag('event', `video_${eventName}`, { video_id: this._videoId });
          break;
        case 'gtm':
          if (window.dataLayer) window.dataLayer.push({ event: `video_${eventName}`, videoId: this._videoId });
          break;
        case 'tiktok':
          if (window.ttq) window.ttq.track(`Video${eventName.charAt(0).toUpperCase() + eventName.slice(1)}`, { videoId: this._videoId });
          break;
        case 'webhook':
          fetch(pixel.pixel_id_or_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: eventName, videoId: this._videoId, timestamp: Date.now() }),
            keepalive: true
          }).catch(() => {});
          break;
      }
    };

    const milestones = { 25: false, 50: false, 75: false };

    video.addEventListener('play', () => pixels.forEach(p => firePixel(p, 'play')));
    video.addEventListener('ended', () => pixels.forEach(p => firePixel(p, 'ended')));
    video.addEventListener('timeupdate', () => {
      if (!video.duration) return;
      const pct = (video.currentTime / video.duration) * 100;
      for (const m of [25, 50, 75]) {
        if (pct >= m && !milestones[m]) {
          milestones[m] = true;
          pixels.forEach(p => firePixel(p, `${m}%`));
        }
      }
    });
  }
}

customElements.define('ecv-player', EcvPlayer);
