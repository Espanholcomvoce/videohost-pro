import Hls from 'hls.js';

export class HlsHandler {
  constructor(videoElement, hlsUrl, segmentBaseUrl) {
    this.video = videoElement;
    this.hlsUrl = hlsUrl;
    this.segmentBaseUrl = segmentBaseUrl;
    this.hls = null;
  }

  init() {
    if (!this.hlsUrl) return;

    if (Hls.isSupported()) {
      this.hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: -1, // auto
        xhrSetup: (xhr, url) => {
          // Rewrite playlist URLs to go through our segment proxy
          if (this.segmentBaseUrl && !url.includes('/api/player-config/')) {
            // Only rewrite relative URLs within HLS
          }
        }
      });

      this.hls.loadSource(this.hlsUrl);
      this.hls.attachMedia(this.video);

      this.hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('HLS network error, attempting recovery...');
              this.hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('HLS media error, attempting recovery...');
              this.hls.recoverMediaError();
              break;
            default:
              console.error('HLS fatal error:', data);
              this.destroy();
              break;
          }
        }
      });

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Quality levels available
      });

    } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari)
      this.video.src = this.hlsUrl;
    }
  }

  setQuality(levelIndex) {
    if (this.hls) {
      this.hls.currentLevel = levelIndex; // -1 for auto
    }
  }

  getQualities() {
    if (!this.hls) return [];
    return this.hls.levels.map((l, i) => ({
      index: i,
      height: l.height,
      width: l.width,
      bitrate: l.bitrate,
      label: `${l.height}p`
    }));
  }

  destroy() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }
}
