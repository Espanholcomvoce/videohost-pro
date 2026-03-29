const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs/promises');
const path = require('path');
const { uploadToR2, getR2PublicUrl } = require('./r2');
const { query } = require('../db/queries');

ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH || '/usr/bin/ffmpeg');
ffmpeg.setFfprobePath(process.env.FFPROBE_PATH || '/usr/bin/ffprobe');

const queue = [];
let processing = null;

const QUALITIES = [
  { name: '360p', width: 640, height: 360, videoBitrate: '800k', audioBitrate: '96k', maxrate: '856k', bufsize: '1200k' },
  { name: '720p', width: 1280, height: 720, videoBitrate: '2500k', audioBitrate: '128k', maxrate: '2672k', bufsize: '3500k' },
  { name: '1080p', width: 1920, height: 1080, videoBitrate: '5000k', audioBitrate: '192k', maxrate: '5350k', bufsize: '7500k' }
];

function getVideoInfo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const video = data.streams.find(s => s.codec_type === 'video');
      const audio = data.streams.find(s => s.codec_type === 'audio');
      resolve({
        duration: data.format.duration,
        width: video?.width || 0,
        height: video?.height || 0,
        videoCodec: video?.codec_name,
        audioCodec: audio?.codec_name
      });
    });
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = require('child_process').spawn(process.env.FFMPEG_PATH || 'ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg exit ${code}: ${stderr.slice(-500)}`)));
    proc.on('error', reject);
  });
}

async function processVideo(videoId) {
  const tmpBase = path.join(process.cwd(), 'tmp');
  const uploadDir = path.join(tmpBase, 'uploads', videoId);
  const outDir = path.join(tmpBase, 'transcoding', videoId);

  try {
    await query('UPDATE videos SET status = $1, updated_at = NOW() WHERE id = $2', ['processing', videoId]);

    // Find original file
    const files = await fs.readdir(uploadDir);
    const original = files.find(f => f.startsWith('original.'));
    if (!original) throw new Error('Original file not found');
    const inputPath = path.join(uploadDir, original);

    // Get video info
    const info = await getVideoInfo(inputPath);
    await fs.mkdir(outDir, { recursive: true });

    // Generate thumbnail at second 5 (or 1 if video shorter)
    const thumbTime = Math.min(5, info.duration * 0.1);
    const thumbPath = path.join(outDir, 'thumbnail.jpg');
    await runFfmpeg(['-i', inputPath, '-ss', String(thumbTime), '-vframes', '1', '-q:v', '2', '-y', thumbPath]);

    // Determine which qualities to generate
    const applicableQualities = QUALITIES.filter(q => q.height <= Math.max(info.height, 360));
    if (applicableQualities.length === 0) applicableQualities.push(QUALITIES[0]);

    // Transcode each quality
    for (const q of applicableQualities) {
      const qDir = path.join(outDir, q.name);
      await fs.mkdir(qDir, { recursive: true });
      await runFfmpeg([
        '-i', inputPath,
        '-vf', `scale=${q.width}:${q.height}:force_original_aspect_ratio=decrease,pad=${q.width}:${q.height}:(ow-iw)/2:(oh-ih)/2`,
        '-c:v', 'libx264', '-crf', '23', '-preset', 'medium',
        '-c:a', 'aac', '-b:a', q.audioBitrate,
        '-maxrate', q.maxrate, '-bufsize', q.bufsize,
        '-hls_time', '6', '-hls_list_size', '0',
        '-hls_segment_filename', path.join(qDir, 'segment_%03d.ts'),
        '-y', path.join(qDir, 'playlist.m3u8')
      ]);
    }

    // Generate master playlist
    let master = '#EXTM3U\n';
    for (const q of applicableQualities) {
      const bw = parseInt(q.videoBitrate) * 1000;
      master += `#EXT-X-STREAM-INF:BANDWIDTH=${bw},RESOLUTION=${q.width}x${q.height}\n`;
      master += `${q.name}/playlist.m3u8\n`;
    }
    const masterPath = path.join(outDir, 'master.m3u8');
    await fs.writeFile(masterPath, master);

    // Upload all to R2
    const r2Prefix = `videos/${videoId}`;

    // Upload thumbnail
    const thumbData = await fs.readFile(thumbPath);
    await uploadToR2(`${r2Prefix}/thumbnail.jpg`, thumbData, 'image/jpeg');

    // Upload master playlist
    const masterData = await fs.readFile(masterPath);
    await uploadToR2(`${r2Prefix}/master.m3u8`, Buffer.from(master), 'application/vnd.apple.mpegurl');

    // Upload each quality
    for (const q of applicableQualities) {
      const qDir = path.join(outDir, q.name);
      const qFiles = await fs.readdir(qDir);
      for (const f of qFiles) {
        const data = await fs.readFile(path.join(qDir, f));
        const ct = f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
        await uploadToR2(`${r2Prefix}/${q.name}/${f}`, data, ct);
      }
    }

    // Update database
    const thumbnailUrl = getR2PublicUrl(`${r2Prefix}/thumbnail.jpg`);
    await query(
      `UPDATE videos SET status='ready', duration_seconds=$1, thumbnail_url=$2, hls_master_url=$3, r2_path=$4, updated_at=NOW() WHERE id=$5`,
      [info.duration, thumbnailUrl, `${r2Prefix}/master.m3u8`, r2Prefix, videoId]
    );

    // Create default config if not exists
    const defaultConfig = {
      autoplay: true, smart_autoplay: true, muted: true, loop: false,
      progress_bar_mode: 'normal', progress_bar_color: '#6C5CE7',
      focused_fullscreen: false, seek_disabled: false, seek_disabled_until_seconds: 0,
      skip_warning_text: 'Não pule! A parte mais importante está chegando',
      cta_enabled: false, cta_text: '', cta_url: '', cta_color: '#6C5CE7',
      cta_time_seconds: 0, cta_behavior: 'new_tab', cta_scroll_enabled: false,
      elements_delay_seconds: 0, popup_enabled: false, popup_config: {},
      recovery_thumbnail_enabled: false, recovery_thumbnail_url: '', recovery_thumbnail_text: 'Continue assistindo',
      continue_watching_enabled: true, fake_views_count: 0, fake_comments: [],
      show_controls: true, logo_url: '', logo_position: 'top-right', logo_opacity: 0.7,
      skin: 'dark', primary_color: '#6C5CE7', speed_rates: [0.75, 1, 1.25, 1.5, 2]
    };
    await query(
      `INSERT INTO video_configs (video_id, config) VALUES ($1, $2) ON CONFLICT (video_id) DO NOTHING`,
      [videoId, JSON.stringify(defaultConfig)]
    );

    console.log(`Transcoding complete: ${videoId}`);
  } catch (err) {
    console.error(`Transcoding failed for ${videoId}:`, err);
    await query('UPDATE videos SET status=$1, updated_at=NOW() WHERE id=$2', ['error', videoId]);
  } finally {
    // Cleanup tmp files
    try {
      await fs.rm(path.join(tmpBase, 'uploads', videoId), { recursive: true, force: true });
      await fs.rm(path.join(tmpBase, 'transcoding', videoId), { recursive: true, force: true });
    } catch {}
    processing = null;
    processNext();
  }
}

function processNext() {
  if (processing || queue.length === 0) return;
  const next = queue.shift();
  processing = next.videoId;
  processVideo(next.videoId);
}

function startTranscoding(videoId) {
  queue.push({ videoId });
  console.log(`Queued for transcoding: ${videoId} (queue: ${queue.length})`);
  processNext();
}

function getQueueStatus() {
  return { processing, queued: queue.map(q => q.videoId) };
}

module.exports = { startTranscoding, getQueueStatus };
