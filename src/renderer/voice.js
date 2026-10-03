export function stopSpeech() {
  window.speechSynthesis?.cancel();
}
export function voiceAvailability() {
  if (!window.speechSynthesis) return 'Speech output is unavailable on this system.';
  const voices = window.speechSynthesis.getVoices();
  return voices.length
    ? `${voices.length} operating-system voices available`
    : 'No operating-system speech voice is available yet. Install a voice in system settings.';
}
export function speak(text) {
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined')
    throw new Error('Speech output is unavailable on this system.');
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length)
    throw new Error('No operating-system speech voices are available. Install a voice in system settings.');
  if (!text?.trim()) throw new Error('There is no response to read.');
  stopSpeech();
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 30000));
  utterance.voice =
    voices.find((v) => v.lang.toLowerCase().startsWith(navigator.language.split('-')[0].toLowerCase())) ||
    voices[0];
  window.speechSynthesis.speak(utterance);
  return utterance;
}
const base64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
};
export class VoiceInput {
  constructor({ invoke, onState, onLevel, onText, onError }) {
    Object.assign(this, { invoke, onState, onLevel, onText, onError });
    this.recorder = null;
    this.stream = null;
    this.context = null;
    this.frame = null;
    this.chunks = [];
    this.recording = false;
    this.busy = false;
    this.acquiring = false;
    this.abandoned = false;
  }
  async toggle() {
    if (this.recording) return this.finish();
    if (this.acquiring) return this.stop();
    if (this.busy) throw new Error('Wait for transcription to finish.');
    return this.start();
  }
  async start() {
    if (this.acquiring || this.busy) throw new Error('Wait for the current microphone operation.');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
      throw new Error('Microphone recording is unavailable on this device.');
    this.abandoned = false;
    this.acquiring = true;
    this.onState('Requesting microphone…', false);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (this.abandoned) {
        this.cleanup();
        this.onState('', false);
        return;
      }
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      this.chunks = [];
      this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : {});
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) this.chunks.push(e.data);
      };
      this.recorder.onerror = (e) => {
        this.onError(e.error || new Error('Audio recording failed.'));
        this.stop();
      };
      this.recorder.onstop = () => this.finalized();
      this.context = new AudioContext();
      const source = this.context.createMediaStreamSource(this.stream),
        analyser = this.context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let lastSpeech = performance.now(),
        heard = false,
        started = performance.now();
      const meter = () => {
        if (!this.recording) return;
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
        this.onLevel(Math.min(1, rms * 6));
        if (rms > 0.018) {
          heard = true;
          lastSpeech = performance.now();
          this.onState('Listening…', true);
        } else this.onState(heard ? 'Listening · silence' : 'Listening · speak now', true);
        if (
          performance.now() - started > 60000 ||
          (heard && performance.now() - lastSpeech > 2200 && performance.now() - started > 1800)
        ) {
          this.finish();
          return;
        }
        this.frame = requestAnimationFrame(meter);
      };
      this.recording = true;
      this.recorder.start(250);
      this.onState('Listening…', true);
      meter();
    } catch (e) {
      this.cleanup();
      this.onState('', false);
      if (this.abandoned) return;
      throw new Error(
        e.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow it in your system privacy settings.'
          : e.message || 'Could not open your microphone.',
      );
    } finally {
      this.acquiring = false;
    }
  }
  finish() {
    if (!this.recording) return;
    this.recording = false;
    cancelAnimationFrame(this.frame);
    this.onState('Finalizing audio…', false);
    if (this.recorder?.state !== 'inactive') this.recorder.stop();
  }
  async finalized() {
    const mimeType = this.recorder?.mimeType || this.chunks[0]?.type || 'audio/webm';
    const blob = new Blob(this.chunks, { type: mimeType });
    this.cleanup();
    if (this.abandoned) {
      this.onState('', false);
      return;
    }
    if (blob.size < 128) {
      this.onState('', false);
      this.onError(new Error('No usable recording was captured.'));
      return;
    }
    if (blob.size > 10 * 1024 * 1024) {
      this.onState('', false);
      this.onError(new Error('Recording exceeds 10 MB. Try a shorter recording.'));
      return;
    }
    this.busy = true;
    this.onState('Transcribing…', false);
    try {
      const result = await this.invoke('voice:transcribe', {
        data: base64(await blob.arrayBuffer()),
        mimeType,
        language: navigator.language.split('-')[0],
      });
      if (this.abandoned) return;
      const text = typeof result === 'string' ? result : result.text;
      if (!text?.trim()) throw new Error('The transcription provider returned no text.');
      this.onText(text);
      this.onState('', false);
    } catch (e) {
      if (!this.abandoned) this.onError(e);
      this.onState('', false);
    } finally {
      this.busy = false;
    }
  }
  cleanup() {
    this.recording = false;
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.context?.close().catch(() => {});
    this.context = null;
    this.onLevel(0);
  }
  stop() {
    this.abandoned = true;
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.cleanup();
    this.onState('', false);
  }
}
