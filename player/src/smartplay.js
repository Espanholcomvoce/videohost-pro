export class SmartPlay {
  constructor(player) {
    this.player = player;
    this.video = null;
    this.config = {};
    this.observer = null;
    this.saveInterval = null;
    this.ctaShown = false;
    this.popupShown = false;
    this.fakeCommentIndex = 0;
    this.elementsRevealed = false;
  }

  init(videoElement, config) {
    this.video = videoElement;
    this.config = config || {};
    this._setupSmartAutoplay();
    this._setupProgressBarMode();
    this._setupSeekBlocking();
    this._setupContinueWatching();
    this._setupTimedFeatures();
    this._setupRecoveryThumbnail();
    this._setupViewCounter();
  }

  _setupSmartAutoplay() {
    if (!this.config.smart_autoplay) return;
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (this.video.paused && this.video.readyState >= 2) {
            if (this.config.muted !== false) this.video.muted = true;
            this.video.play().catch(() => {});
          }
        }
      });
    }, { threshold: 0.5 });
    this.observer.observe(this.player);
  }

  _setupProgressBarMode() {
    const mode = this.config.progress_bar_mode || 'normal';
    if (mode === 'returning_only') {
      const key = `ecv_watched_${this.config.videoId || ''}`;
      const watched = localStorage.getItem(key);
      this.player._progressMode = watched ? 'normal' : 'hidden';
      // Mark as watched on first play
      this.video.addEventListener('play', () => localStorage.setItem(key, '1'), { once: true });
    } else {
      this.player._progressMode = mode;
    }
  }

  getDisplayProgress(currentTime, duration) {
    if (this.player._progressMode === 'accelerated' && duration > 0) {
      // First 30%: advance 2x faster
      const threshold = duration * 0.3;
      if (currentTime <= threshold) {
        return (currentTime / threshold) * 0.6; // maps 0-30% real to 0-60% display
      } else {
        return 0.6 + ((currentTime - threshold) / (duration - threshold)) * 0.4;
      }
    }
    return duration > 0 ? currentTime / duration : 0;
  }

  _setupSeekBlocking() {
    if (!this.config.seek_disabled) return;
    let lastTime = 0;
    this.video.addEventListener('timeupdate', () => {
      const untilSec = this.config.seek_disabled_until_seconds || Infinity;
      if (this.video.currentTime <= untilSec) {
        if (Math.abs(this.video.currentTime - lastTime) > 2) {
          this.video.currentTime = lastTime;
          this._showSkipWarning();
        }
      }
      lastTime = this.video.currentTime;
    });
  }

  _showSkipWarning() {
    const text = this.config.skip_warning_text || 'Não pule! A parte mais importante está chegando';
    const el = this.player.querySelector('.ecv-skip-warning');
    if (el) {
      el.textContent = text;
      el.style.display = 'flex';
      setTimeout(() => { el.style.display = 'none'; }, 3000);
    }
  }

  _setupContinueWatching() {
    if (!this.config.continue_watching_enabled) return;
    const key = `ecv_position_${this.config.videoId || ''}`;

    // Save position periodically
    this.saveInterval = setInterval(() => {
      if (this.video && !this.video.paused && this.video.currentTime > 5) {
        localStorage.setItem(key, String(Math.floor(this.video.currentTime)));
      }
    }, 5000);

    // Check saved position
    const saved = localStorage.getItem(key);
    if (saved && parseFloat(saved) > 5) {
      this._showContinuePrompt(parseFloat(saved));
    }

    // Clear on finish
    this.video.addEventListener('ended', () => localStorage.removeItem(key));
  }

  _showContinuePrompt(savedTime) {
    const overlay = this.player.querySelector('.ecv-recovery-overlay');
    if (!overlay) return;

    const mins = Math.floor(savedTime / 60);
    const secs = Math.floor(savedTime % 60);
    overlay.innerHTML = `
      <div class="ecv-recovery-content">
        <p style="font-size:18px;font-weight:700;margin-bottom:20px;text-align:center">Você já começou a assistir esse vídeo</p>
        <div class="ecv-recovery-buttons" style="flex-direction:column;gap:12px">
          <button class="ecv-btn-continue" style="display:flex;align-items:center;gap:8px;background:none;border:none;color:#fff;font-size:15px;font-weight:600;cursor:pointer">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:2px solid #fff;border-radius:50%">▶</span>
            Continuar assistindo?
          </button>
          <button class="ecv-btn-restart" style="display:flex;align-items:center;gap:8px;background:none;border:none;color:#fff;font-size:15px;font-weight:600;cursor:pointer">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:2px solid #fff;border-radius:50%;font-size:12px">↺</span>
            Assistir do início?
          </button>
        </div>
      </div>
    `;
    overlay.style.display = 'flex';

    overlay.querySelector('.ecv-btn-continue').addEventListener('click', () => {
      this.video.currentTime = savedTime;
      this.video.play().catch(() => {});
      overlay.style.display = 'none';
    });
    overlay.querySelector('.ecv-btn-restart').addEventListener('click', () => {
      this.video.currentTime = 0;
      this.video.play().catch(() => {});
      overlay.style.display = 'none';
    });
  }

  _setupRecoveryThumbnail() {
    if (!this.config.recovery_thumbnail_enabled) return;
    const key = `ecv_left_${this.config.videoId || ''}`;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.video.paused) {
        localStorage.setItem(key, '1');
      }
    });

    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      const overlay = this.player.querySelector('.ecv-recovery-overlay');
      if (overlay && this.config.recovery_thumbnail_url) {
        overlay.innerHTML = `
          <div class="ecv-recovery-thumb" style="background-image:url(${this.config.recovery_thumbnail_url})">
            <div class="ecv-recovery-text">${this.config.recovery_thumbnail_text || 'Continue assistindo'}</div>
            <button class="ecv-btn-continue-thumb">▶ Continuar</button>
          </div>
        `;
        overlay.style.display = 'flex';
        overlay.querySelector('.ecv-btn-continue-thumb')?.addEventListener('click', () => {
          overlay.style.display = 'none';
          this.video.play().catch(() => {});
        });
      }
    }
  }

  _setupTimedFeatures() {
    this.video.addEventListener('timeupdate', () => {
      const t = this.video.currentTime;
      this._checkCTA(t);
      this._checkPopup(t);
      this._checkFakeComments(t);
      this._checkElementsDelay(t);
      this._checkFocusedFullscreen();
    });
  }

  _checkCTA(time) {
    if (!this.config.cta_enabled || this.ctaShown) return;
    if (time >= (this.config.cta_time_seconds || 0)) {
      this.ctaShown = true;
      const cta = this.player.querySelector('.ecv-cta-overlay');
      if (!cta) return;
      cta.innerHTML = `<a href="${this.config.cta_url || '#'}" target="${this.config.cta_behavior === 'redirect' ? '_self' : '_blank'}"
        class="ecv-cta-button" style="background:${this.config.cta_color || '#6C5CE7'}">${this.config.cta_text || 'Clique aqui'}</a>`;
      cta.style.display = 'flex';

      // Track CTA shown
      this.player._tracker?.trackEvent('cta_shown');

      // CTA click tracking
      cta.querySelector('.ecv-cta-button')?.addEventListener('click', () => {
        this.player._tracker?.trackEvent('cta_click');
      });

      // Scroll to CTA if configured
      if (this.config.cta_scroll_enabled) {
        cta.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  _checkPopup(time) {
    if (!this.config.popup_enabled || this.popupShown) return;
    const pc = this.config.popup_config || {};
    if (time >= (pc.time_seconds || 0)) {
      this.popupShown = true;
      const popup = this.player.querySelector('.ecv-popup-overlay');
      if (!popup) return;
      popup.innerHTML = `
        <div class="ecv-popup-card">
          <button class="ecv-popup-close">✕</button>
          ${pc.image_url ? `<img src="${pc.image_url}" class="ecv-popup-img">` : ''}
          <p class="ecv-popup-text">${pc.text || ''}</p>
          ${pc.button_text ? `<a href="${pc.button_url || '#'}" target="_blank" class="ecv-popup-btn">${pc.button_text}</a>` : ''}
        </div>
      `;
      popup.style.display = 'flex';
      popup.querySelector('.ecv-popup-close')?.addEventListener('click', () => { popup.style.display = 'none'; });
      if (pc.auto_close_seconds) {
        setTimeout(() => { popup.style.display = 'none'; }, pc.auto_close_seconds * 1000);
      }
    }
  }

  _checkFakeComments(time) {
    const comments = this.config.fake_comments || [];
    while (this.fakeCommentIndex < comments.length && time >= comments[this.fakeCommentIndex].time) {
      const c = comments[this.fakeCommentIndex];
      this._showFakeComment(c.name, c.avatar, c.text);
      this.fakeCommentIndex++;
    }
  }

  _showFakeComment(name, avatar, text) {
    const container = this.player.querySelector('.ecv-fake-comments');
    if (!container) return;
    container.style.display = 'block';
    const comment = document.createElement('div');
    comment.className = 'ecv-fake-comment';
    comment.innerHTML = `
      <img src="${avatar || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><circle cx=%2220%22 cy=%2215%22 r=%228%22 fill=%22%23888%22/><circle cx=%2220%22 cy=%2240%22 r=%2215%22 fill=%22%23888%22/></svg>'}" class="ecv-comment-avatar">
      <div class="ecv-comment-body"><strong>${name || 'Anônimo'}</strong> ${text || ''}</div>
    `;
    container.appendChild(comment);
    setTimeout(() => comment.classList.add('ecv-comment-visible'), 50);
    setTimeout(() => {
      comment.classList.remove('ecv-comment-visible');
      setTimeout(() => comment.remove(), 500);
    }, 8000);
  }

  _checkElementsDelay(time) {
    if (this.elementsRevealed) return;
    const delay = this.config.elements_delay_seconds || 0;
    if (delay > 0 && time >= delay) {
      this.elementsRevealed = true;
      document.querySelectorAll('.ecv-hide').forEach(el => {
        el.classList.remove('ecv-hide');
        el.classList.add('ecv-show');
      });
    }
  }

  _checkFocusedFullscreen() {
    if (!this.config.focused_fullscreen) return;
    const container = this.player.querySelector('.ecv-container');
    if (!container) return;
    if (!this.video.paused && !container.classList.contains('ecv-focused')) {
      container.classList.add('ecv-focused');
    } else if (this.video.paused && container.classList.contains('ecv-focused')) {
      container.classList.remove('ecv-focused');
    }
  }

  _setupViewCounter() {
    if (!this.config.fake_views_count) return;
    const counter = this.player.querySelector('.ecv-view-counter');
    if (counter) {
      const count = this.config.fake_views_count + Math.floor(Math.random() * 20);
      counter.innerHTML = `<span class="ecv-eye">👁</span> ${count} assistindo agora`;
      counter.style.display = 'block';
    }
  }

  destroy() {
    if (this.observer) this.observer.disconnect();
    if (this.saveInterval) clearInterval(this.saveInterval);
  }
}
