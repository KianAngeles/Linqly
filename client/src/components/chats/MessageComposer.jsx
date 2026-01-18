import { useEffect, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";

export default function MessageComposer({
  text,
  onChangeText,
  onInputBlur,
  showMentions,
  mentionCandidates,
  onInsertMention,
  showEmojiPicker,
  onToggleEmojiPicker,
  reactIcon,
  imageIcon,
  micIcon,
  sendIcon,
  onInsertEmoji,
  API_BASE,
  onSend,
  onSendImage,
  onSendVoice,
}) {
  const textareaRef = useRef(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [fileError, setFileError] = useState("");
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_FILES = 3;
  const WAVE_BARS = 96;
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordTimerRef = useRef(null);
  const recordChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const rafRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState("");
  const [recordedFile, setRecordedFile] = useState(null);
  const [recordingError, setRecordingError] = useState("");
  const [waveform, setWaveform] = useState(
    Array.from({ length: WAVE_BARS }, () => 0)
  );

  const adjustTextarea = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  };

  const formatBytes = (bytes) => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const idx = Math.min(
      units.length - 1,
      Math.floor(Math.log(bytes) / Math.log(1024))
    );
    const value = bytes / Math.pow(1024, idx);
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  };

  const formatTimer = (seconds) => {
    const m = String(Math.floor(seconds / 60)).padStart(1, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

  const stopRecordingTimer = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const stopWaveform = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    dataArrayRef.current = null;
    setWaveform(Array.from({ length: WAVE_BARS }, () => 0));
  };

  const stopMediaStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  };

  const resetRecording = (options = {}) => {
    stopRecordingTimer();
    stopWaveform();
    stopMediaStream();
    recordChunksRef.current = [];
    setIsRecording(false);
    if (!options.keepTime) {
      setRecordingTime(0);
    }
  };

  useEffect(() => {
    return () => {
      pendingFiles.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [pendingFiles]);

  useEffect(() => {
    return () => {
      if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
      resetRecording();
    };
  }, []);

  useEffect(() => {
    adjustTextarea();
  }, [text, pendingFiles.length]);

  const setPendingFile = (file) => {
    if (!file) return;
    if (pendingFiles.length >= MAX_FILES) {
      setFileError("Max 3 files");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError("File too large (max 10MB)");
      return;
    }
    const isImage = file.type && file.type.startsWith("image/");
    const previewUrl = isImage ? URL.createObjectURL(file) : "";
    setPendingFiles((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl,
      },
    ]);
    setFileError("");
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    files.forEach((file) => setPendingFile(file));
    e.target.value = "";
  };

  const handleClearImage = (id) => {
    if (id) {
      setPendingFiles((prev) => {
        const next = prev.filter((item) => {
          if (item.id === id && item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
          }
          return item.id !== id;
        });
        return next;
      });
      return;
    }
    pendingFiles.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setPendingFiles([]);
    setFileError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pendingFiles.length > 0) {
      for (const item of pendingFiles) {
        await onSendImage?.(item.file);
      }
      handleClearImage();
      if (text.trim()) {
        await onSend?.({ preventDefault() {} });
      }
      return;
    }
    onSend(e);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (!file) continue;
        setPendingFile(file);
        e.preventDefault();
        return;
      }
    }
  };

  const startRecording = async () => {
    if (isRecording) return;
    setRecordingError("");
    if (recordedBlobUrl) {
      URL.revokeObjectURL(recordedBlobUrl);
      setRecordedBlobUrl("");
      setRecordedFile(null);
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        setRecordingError("Recording not supported in this browser");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      dataArrayRef.current = new Uint8Array(analyser.fftSize);
      const candidates = [
        "audio/mpeg",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ];
      const mimeType = candidates.find((t) =>
        window.MediaRecorder && MediaRecorder.isTypeSupported(t)
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recordChunksRef.current = [];

      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          recordChunksRef.current.push(evt.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordChunksRef.current, {
          type: mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        setRecordedBlobUrl(url);
        const ext = blob.type === "audio/mpeg" || blob.type === "audio/mp3" ? "mp3" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${ext}`, {
          type: blob.type,
        });
        setRecordedFile(file);
        resetRecording({ keepTime: true });
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      const updateWaveform = () => {
        if (!analyserRef.current || !dataArrayRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
        let sumSquares = 0;
        for (let i = 0; i < dataArrayRef.current.length; i++) {
          const v = (dataArrayRef.current[i] - 128) / 128;
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / dataArrayRef.current.length);
        const level = Math.min(1, rms * 2.5);
        setWaveform((prev) => {
          const next = prev.slice(1);
          next.push(level);
          return next;
        });
        rafRef.current = requestAnimationFrame(updateWaveform);
      };
      rafRef.current = requestAnimationFrame(updateWaveform);
      recordTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const next = prev + 1;
          if (next >= 60) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      setRecordingError("Microphone access denied");
      resetRecording();
    }
  };

  const stopRecording = () => {
    stopRecordingTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      resetRecording();
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
    setRecordedBlobUrl("");
    setRecordedFile(null);
    resetRecording();
  };

  const sendRecordedVoice = async () => {
    if (!recordedFile) return;
    await onSendVoice?.(recordedFile);
    if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
    setRecordedBlobUrl("");
    setRecordedFile(null);
    setRecordingTime(0);
  };

  return (
    <form className="d-flex gap-2" onSubmit={handleSubmit}>
      <div className="chat-input-stack flex-grow-1">
        {(isRecording || recordedBlobUrl || recordingError) && (
          <div className="chat-voice-panel">
            {recordingError && (
              <div className="chat-voice-error">{recordingError}</div>
            )}
            {isRecording && (
              <div className="chat-voice-bar is-recording">
                <button
                  type="button"
                  className="chat-voice-btn chat-voice-cancel"
                  onClick={cancelRecording}
                  aria-label="Cancel recording"
                >
                  x
                </button>
                <button
                  type="button"
                  className="chat-voice-btn chat-voice-stop"
                  onClick={stopRecording}
                  aria-label="Stop recording"
                >
                  ■
                </button>
                <div className="chat-voice-wave" aria-hidden="true">
                  {waveform.map((v, idx) => {
                    const peak = Math.max(4, v * 28);
                    return (
                      <span
                        key={`w-${idx}`}
                        className="chat-voice-wave-bar"
                        style={{ height: `${peak}px` }}
                      />
                    );
                  })}
                </div>
                <div className="chat-voice-timer">{formatTimer(recordingTime)}</div>
              </div>
            )}
            {!isRecording && recordedBlobUrl && (
              <div className="chat-voice-bar is-ready">
                <button
                  type="button"
                  className="chat-voice-btn chat-voice-cancel"
                  onClick={cancelRecording}
                  aria-label="Cancel voice"
                >
                  x
                </button>
                <audio className="chat-voice-audio" controls src={recordedBlobUrl} />
                <div className="chat-voice-timer">{formatTimer(recordingTime)}</div>
                <button
                  type="button"
                  className="chat-voice-btn chat-voice-send"
                  onClick={sendRecordedVoice}
                  aria-label="Send voice"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )}
        {pendingFiles.length > 0 && (
          <div className="chat-input-preview">
            <div className="chat-input-preview-list">
              {pendingFiles.map((item) => (
                <div key={item.id} className="chat-input-preview-media">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt="Upload preview" />
                  ) : (
                    <div className="chat-input-preview-file">
                      <div className="chat-input-file-icon">FILE</div>
                      <div className="chat-input-file-meta">
                        <div className="chat-input-file-name">
                          {item.file.name || "file"}
                        </div>
                        <div className="chat-input-file-size">
                          {formatBytes(item.file.size || 0)}
                        </div>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    className="chat-input-preview-remove"
                    onClick={() => handleClearImage(item.id)}
                    aria-label="Remove image"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {!isRecording && (
          <div className="chat-input-row">
            <div className="position-relative flex-grow-1">
              <div className="form-control pe-5 chat-input-field">
                <textarea
                  ref={textareaRef}
                  className="chat-input-textarea"
                  placeholder="Type message..."
                  value={text}
                  onChange={(e) => {
                    onChangeText(e.target.value);
                    adjustTextarea();
                  }}
                  onBlur={onInputBlur}
                  onPaste={handlePaste}
                  rows={1}
                />
                {fileError && (
                  <div className="chat-input-file-error" role="alert">
                    {fileError}
                  </div>
                )}
              </div>
              {showMentions && mentionCandidates.length > 0 && (
                <div
                  className="list-group position-absolute w-100"
                  style={{ bottom: "42px", zIndex: 20 }}
                >
                  {mentionCandidates.map((m) => (
                    <button
                      key={m._id || m.id}
                      type="button"
                      className="list-group-item list-group-item-action d-flex align-items-center gap-2"
                      onMouseDown={() => onInsertMention(m.username)}
                    >
                      {m.avatarUrl && (
                        <img
                          src={
                            m.avatarUrl.startsWith("http://") ||
                            m.avatarUrl.startsWith("https://")
                              ? m.avatarUrl
                              : `${API_BASE}${m.avatarUrl}`
                          }
                          alt={m.username}
                          width={28}
                          height={28}
                          style={{ borderRadius: "50%", objectFit: "cover" }}
                        />
                      )}
                      <span>{m.username}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="chat-input-actions">
                <label className="chat-input-action-btn" title="Send file">
                  <img src={imageIcon} alt="Image" width={18} height={18} />
                  <input
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                    multiple
                    className="d-none"
                    onChange={handleImageChange}
                  />
                </label>
                <button
                  type="button"
                  className="chat-input-action-btn"
                  onClick={onToggleEmojiPicker}
                  title="Emoji"
                >
                  <img src={reactIcon} alt="Emoji" width={18} height={18} />
                </button>
              </div>
              {showEmojiPicker && (
                <div
                  className="position-absolute"
                  style={{ bottom: "46px", right: 0, zIndex: 30 }}
                >
                  <EmojiPicker
                    onEmojiClick={(emojiData) =>
                      onInsertEmoji({ native: emojiData.emoji })
                    }
                    height={360}
                    width={320}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              className="chat-voice-trigger"
              onClick={startRecording}
              disabled={isRecording}
              title="Record voice"
            >
              <img src={micIcon} alt="Mic" width={18} height={18} />
            </button>
            <button className="chat-send-btn" type="submit">
              <img src={sendIcon} alt="Send" width={18} height={18} />
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

