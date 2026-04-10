export class PlayerUI {
  constructor(container, config) {
    this.container = container;
    this.config = config || {};
    this.video = null;
    this.controlsTimeout = null;
    this.isFocusedFullscreen = false;
  }

  buildDOM() {
    const c = this.config;
    const skin = c.skin || 'dark';
    const primaryColor = c.primary_color || '#6C5CE7';

    this.container.innerHTML = `
      <div class="ecv-container ecv-skin-${skin}" style="--ecv-primary:${primaryColor}">
        <div class="ecv-video-wrapper">
          <video class="ecv-video" playsinline ${c.loop ? 'loop' : ''} ${c.muted !== false ? 'muted' : ''}></video>
          <div class="ecv-poster" ${c.thumbnailUrl ? `style="background-image:url(${c.thumbnailUrl})"` : ''}></div>
          <div class="ecv-controls">
            <div class="ecv-progress-bar">
              <div class="ecv-progress-buffer"></div>
              <div class="ecv-progress-fill"></div>
            </div>
            <div class="ecv-controls-row">
              <button class="ecv-play-btn" aria-label="Play">
                <svg class="ecv-icon-play" viewBox="0 0 24 24" width="22" height="22"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>
                <svg class="ecv-icon-pause" viewBox="0 0 24 24" width="22" height="22" style="display:none"><rect x="5" y="3" width="4" height="18" fill="currentColor"/><rect x="15" y="3" width="4" height="18" fill="currentColor"/></svg>
              </button>
              ${c.show_time !== false ? `<div class="ecv-time">0:00 / 0:00</div>` : ''}
              <div class="ecv-spacer"></div>
              <div class="ecv-volume-wrapper">
                <button class="ecv-volume-btn" aria-label="Volume">🔊</button>
                <input type="range" class="ecv-volume-slider" min="0" max="1" step="0.05" value="${c.muted !== false ? 0 : 1}">
              </div>
              ${c.show_controls !== false ? `
              <select class="ecv-speed-select">
                ${(c.speed_rates || [0.75, 1, 1.25, 1.5, 2]).map(r => `<option value="${r}" ${r === (c.default_speed || 1) ? 'selected' : ''}>${r}x</option>`).join('')}
              </select>
              ` : ''}
              ${c.show_fullscreen !== false ? `<button class="ecv-fullscreen-btn" aria-label="Tela cheia">⛶</button>` : ''}
            </div>
          </div>
          <div class="ecv-cta-overlay" style="display:none"></div>
          <div class="ecv-popup-overlay" style="display:none"></div>
          <div class="ecv-fake-comments"></div>
          <div class="ecv-skip-warning" style="display:none"></div>
          <div class="ecv-recovery-overlay" style="display:none"></div>
          ${c.logo_url ? `<div class="ecv-logo-overlay" style="position:absolute;${this._logoPosition(c.logo_position)};opacity:${c.logo_opacity || 0.7}"><img src="${c.logo_url}" style="max-height:40px"></div>` : ''}
          <div class="ecv-view-counter" style="display:none"></div>
        </div>
      </div>
    `;

    this.video = this.container.querySelector('.ecv-video');
    return this.video;
  }

  _logoPosition(pos) {
    const map = {
      'top-left': 'top:10px;left:10px',
      'top-right': 'top:10px;right:10px',
      'bottom-left': 'bottom:50px;left:10px',
      'bottom-right': 'bottom:50px;right:10px'
    };
    return map[pos] || map['top-right'];
  }

  bindEvents() {
    const v = this.video;
    const playBtn = this.container.querySelector('.ecv-play-btn');
    const volBtn = this.container.querySelector('.ecv-volume-btn');
    const volSlider = this.container.querySelector('.ecv-volume-slider');
    const speedSelect = this.container.querySelector('.ecv-speed-select');
    const fsBtn = this.container.querySelector('.ecv-fullscreen-btn');
    const progressBar = this.container.querySelector('.ecv-progress-bar');
    const poster = this.container.querySelector('.ecv-poster');
    const wrapper = this.container.querySelector('.ecv-video-wrapper');
    const controls = this.container.querySelector('.ecv-controls');

    // Play/Pause
    playBtn?.addEventListener('click', () => this.togglePlay());
    wrapper?.addEventListener('click', (e) => {
      if (e.target.closest('.ecv-controls') || e.target.closest('.ecv-cta-overlay') || e.target.closest('.ecv-popup-overlay') || e.target.closest('.ecv-recovery-overlay')) return;
      this.togglePlay();
    });

    // Video events
    v.addEventListener('play', () => {
      poster.style.display = 'none';
      this._updatePlayIcon(true);
    });
    v.addEventListener('pause', () => this._updatePlayIcon(false));
    v.addEventListener('timeupdate', () => this._onTimeUpdate());
    v.addEventListener('ended', () => this._updatePlayIcon(false));

    // Volume
    volBtn?.addEventListener('click', () => {
      v.muted = !v.muted;
      volSlider.value = v.muted ? 0 : v.volume;
      volBtn.textContent = v.muted ? '🔇' : '🔊';
    });
    volSlider?.addEventListener('input', (e) => {
      v.volume = parseFloat(e.target.value);
      v.muted = v.volume === 0;
      volBtn.textContent = v.muted ? '🔇' : '🔊';
    });

    // Speed
    speedSelect?.addEventListener('change', (e) => { v.playbackRate = parseFloat(e.target.value); });

    // Fullscreen (focused)
    fsBtn?.addEventListener('click', () => this._toggleFocusedFullscreen());

    // Progress bar click
    if (progressBar && this.container._progressMode !== 'accelerated') {
      progressBar.addEventListener('click', (e) => {
        if (this.config.seek_disabled) return;
        const rect = progressBar.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        v.currentTime = pct * v.duration;
      });
    }

    // Auto-hide controls
    wrapper?.addEventListener('mousemove', () => this._showControls());
    wrapper?.addEventListener('mouseleave', () => this._hideControlsDelayed());
    this._showControls();

    // Keyboard
    this.container.setAttribute('tabindex', '0');
    this.container.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); this.togglePlay(); }
      if (e.code === 'KeyF') this._toggleFocusedFullscreen();
      if (e.code === 'KeyM') { v.muted = !v.muted; }
    });
  }

  togglePlay() {
    if (this.video.paused) {
      this.video.play().catch(() => {});
    } else {
      this.video.pause();
    }
  }

  _updatePlayIcon(playing) {
    const playIcon = this.container.querySelector('.ecv-icon-play');
    const pauseIcon = this.container.querySelector('.ecv-icon-pause');
    if (playIcon) playIcon.style.display = playing ? 'none' : 'block';
    if (pauseIcon) pauseIcon.style.display = playing ? 'block' : 'none';
  }

  _onTimeUpdate() {
    const v = this.video;
    if (!v.duration) return;

    // Update progress bar
    const smartplay = this.container._smartplay;
    let progress;
    if (smartplay) {
      progress = smartplay.getDisplayProgress(v.currentTime, v.duration);
    } else {
      progress = v.currentTime / v.duration;
    }

    const fill = this.container.querySelector('.ecv-progress-fill');
    if (fill && this.container._progressMode !== 'hidden') {
      fill.style.width = `${progress * 100}%`;
    } else if (fill && this.container._progressMode === 'hidden') {
      fill.style.width = '0%';
    }

    // Buffer
    if (v.buffered.length > 0) {
      const buffer = this.container.querySelector('.ecv-progress-buffer');
      if (buffer) buffer.style.width = `${(v.buffered.end(v.buffered.length - 1) / v.duration) * 100}%`;
    }

    // Time display
    const timeEl = this.container.querySelector('.ecv-time');
    if (timeEl) {
      timeEl.textContent = `${this._formatTime(v.currentTime)} / ${this._formatTime(v.duration)}`;
    }
  }

  _formatTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  _toggleFocusedFullscreen() {
    const container = this.container.querySelector('.ecv-container');
    if (container.classList.contains('ecv-focused')) {
      container.classList.remove('ecv-focused');
      this.isFocusedFullscreen = false;
    } else {
      container.classList.add('ecv-focused');
      this.isFocusedFullscreen = true;
    }
  }

  _showControls() {
    const controls = this.container.querySelector('.ecv-controls');
    if (controls) controls.style.opacity = '1';
    this._hideControlsDelayed();
  }

  _hideControlsDelayed() {
    clearTimeout(this.controlsTimeout);
    this.controlsTimeout = setTimeout(() => {
      if (this.video && !this.video.paused) {
        const controls = this.container.querySelector('.ecv-controls');
        if (controls) controls.style.opacity = '0';
      }
    }, 3000);
  }
}
