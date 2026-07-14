import { useEffect, useRef, useState } from 'react';
import { IconMic, IconStopCircle } from './Icons.jsx';

// Matches the server's own cap (functions/index.js's TRANSCRIBE_MAX_DURATION_SECONDS).
// See docs/llm-pipeline.md, Stage 1, for the reasoning.
const MAX_DURATION_SECONDS = 300;
const WARN_BEFORE_CAP_SECONDS = 15;

function formatTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) || '';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Mic control: record, transcribe via POST /api/transcribe, hand the final
 * text up to the parent. Owns permission state, MediaRecorder, and a Web
 * Audio level indicator against the live stream (not the recorded blob).
 * Never auto-submits anything; the caller decides what to do with the
 * transcript. See docs/llm-pipeline.md, Stage 1, and docs/brief.md's
 * "nothing writes without explicit confirmation."
 *
 * Two variants, one component, so a single instance can stay mounted across
 * both: `variant="compact"` (default) is the small control next to the
 * textarea, used while idle. `variant="full"` is a dedicated, centered view
 * (bigger level meter, a timer, an unmistakable stop button), used while
 * actually recording or transcribing. `onActiveChange(active)` tells the
 * parent when to switch which variant it renders; the same VoiceRecorder
 * instance must stay mounted through that switch (never remount it based on
 * variant), or the active MediaRecorder/stream/AudioContext this component
 * owns would be torn down mid-recording. See docs/design-system.md's
 * "Recording indicator" section and docs/resolution-log.md, 2026-07-08.
 *
 * State read inside long-lived callbacks (MediaRecorder's onstop, the
 * interval timer) comes from refs, not component state, so a stale closure
 * from an earlier render can never read an outdated value; state is used
 * only to trigger re-renders for what's on screen.
 *
 * @param {{ variant?: 'compact' | 'full', onActiveChange?: (active: boolean) => void, onTranscript: (text: string) => void, getAuthToken: () => Promise<string|null>, disabled?: boolean }} props
 */
export default function VoiceRecorder({ variant = 'compact', onActiveChange, onTranscript, getAuthToken, disabled = false }) {
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  // A live counter, not a fixed estimate: unlike Structure
  // (scripts/structure-timing-stats.mjs, SuperRambleModal.jsx), there is no
  // historical timing data for /api/transcribe yet. functions/index.js's
  // own "transcribe phase timings" log line (docs/resolution-log.md's
  // async-Structure entry) only started recording real calls from that
  // pass forward, so there is nothing to compute a percentile from today;
  // this just ticks up so a wait of more than a couple seconds still reads
  // as active progress, not a frozen screen.
  const [transcribingSeconds, setTranscribingSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState(null);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeTypeRef = useRef('');
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const intervalRef = useRef(null);
  const transcribingIntervalRef = useRef(null);
  const secondsRef = useRef(0);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  useEffect(() => {
    const ok =
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices) &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof window.MediaRecorder !== 'undefined';
    setSupported(ok);
  }, []);

  useEffect(() => {
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanup() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (transcribingIntervalRef.current) clearInterval(transcribingIntervalRef.current);
    rafRef.current = null;
    intervalRef.current = null;
    transcribingIntervalRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }

  function tickLevel() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
    rafRef.current = requestAnimationFrame(tickLevel);
  }

  async function start() {
    if (disabled || recording || transcribing) return;
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      const mimeType = pickMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = handleStop;
      recorderRef.current = recorder;
      recorder.start();

      secondsRef.current = 0;
      setSeconds(0);
      setRecording(true);
      onActiveChangeRef.current?.(true);
      tickLevel();
      intervalRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= MAX_DURATION_SECONDS) stop();
      }, 1000);
    } catch (err) {
      if (err && err.name === 'NotAllowedError') {
        setMessage("Microphone access is blocked. Enable it in your browser's site settings to use voice.");
      } else if (err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')) {
        setMessage('No microphone found.');
      } else {
        setMessage('Could not start recording.');
      }
    }
  }

  function stop() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    intervalRef.current = null;
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setRecording(false);
    setLevel(0);
  }

  async function handleStop() {
    try {
      const durationSeconds = secondsRef.current;
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' });
      chunksRef.current = [];

      if (blob.size === 0 || durationSeconds < 1) {
        setMessage("Didn't catch anything. Try again.");
        return;
      }

      setTranscribing(true);
      setTranscribingSeconds(0);
      transcribingIntervalRef.current = setInterval(() => setTranscribingSeconds((s) => s + 1), 1000);
      try {
        const audioBase64 = await blobToBase64(blob);
        const token = await getAuthToken();
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ audioBase64, mimeType: blob.type, durationSeconds })
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Transcription failed (${res.status}).`);
        }
        const body = await res.json();
        const transcript = (body.transcript || '').trim();
        if (!transcript) {
          setMessage("Didn't catch anything. Try again.");
        } else {
          onTranscript(transcript);
        }
      } catch (err) {
        setMessage(err.message || 'Could not transcribe that recording.');
      } finally {
        if (transcribingIntervalRef.current) clearInterval(transcribingIntervalRef.current);
        transcribingIntervalRef.current = null;
        setTranscribing(false);
      }
    } finally {
      // Recording and transcribing are both "active" from the parent's
      // point of view (the full view stays up through both); only once
      // this whole cycle is done, one way or another, does idle return.
      onActiveChangeRef.current?.(false);
    }
  }

  function toggle() {
    if (recording) stop();
    else start();
  }

  if (!supported) {
    return (
      <button
        type="button"
        className="icon-btn voice-mic"
        disabled
        aria-label="Voice recording isn't available in this browser"
        title="Voice recording isn't available in this browser"
      >
        <IconMic />
      </button>
    );
  }

  const nearCap = recording && MAX_DURATION_SECONDS - seconds <= WARN_BEFORE_CAP_SECONDS;

  if (variant === 'full') {
    return (
      <div className="voice-full">
        {transcribing ? (
          <>
            <div className="voice-full-ring voice-full-ring-pulse" />
            <p className="voice-full-status">Transcribing what you said.</p>
            <p className="voice-full-status-elapsed">{formatTimer(transcribingSeconds)}</p>
          </>
        ) : (
          <>
            <div className="voice-full-stage">
              <div className="voice-full-ring" style={{ transform: `scale(${1 + level * 0.6})` }} />
              <button type="button" className="voice-full-stop" onClick={stop} aria-label="Stop recording">
                <IconStopCircle />
              </button>
            </div>
            <div className={`voice-full-timer ${nearCap ? 'voice-full-timer-warn' : ''}`}>{formatTimer(seconds)}</div>
            {nearCap ? <p className="voice-full-hint">Wrapping up soon, five minutes max.</p> : null}
          </>
        )}
        {message ? <p className="voice-hint">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="voice-recorder">
      <button
        type="button"
        className={`icon-btn voice-mic ${recording ? 'recording' : ''}`}
        onClick={toggle}
        disabled={disabled || transcribing}
        aria-label={recording ? 'Stop recording' : 'Start voice recording'}
        title={recording ? 'Stop recording' : 'Record voice'}
      >
        {recording ? <IconStopCircle /> : <IconMic />}
      </button>

      {message ? <span className="voice-hint">{message}</span> : null}
    </div>
  );
}
