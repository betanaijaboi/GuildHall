"use client";

import { Captions, Eraser, Mic, MicOff, MonitorUp, PenLine, PhoneOff, ScreenShareOff, Video, VideoOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { addCaption, endHuddleAction, saveHuddleNotes } from "@/app/actions/huddles";
import { Avatar, type AvatarUser } from "@/components/avatar";

type Participant = { id: string; name: string; handle: string };
type Media = { mic: boolean; cam: boolean; screen: boolean };
type Peer = { pc: RTCPeerConnection; stream: MediaStream };
type Stroke = { points: [number, number][]; color: string; at: number };

const PALETTE = ["#a78bfa", "#22d3ee", "#34d399", "#fbbf24", "#fb7185", "#f472b6", "#60a5fa", "#f97316"];
const colorFor = (id: string) => PALETTE[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const STROKE_LIFE_MS = 8000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionLike = any;

/**
 * A huddle: full-mesh WebRTC (each pair of people connects directly; the server only relays
 * signalling), screen share with draw-over, opt-in captions and shared notes that feed the recap.
 * Everyone announces their browser session on join; for each new session the lower user id
 * makes the offer, so there is never offer glare and a reload reconnects cleanly.
 */
export function HuddleRoom({
  huddleId,
  me,
  users,
  iceServers,
  initialNotes,
  channelLabel,
  backHref,
}: {
  huddleId: string;
  me: Participant & AvatarUser;
  users: Record<string, AvatarUser>;
  iceServers: RTCIceServer[];
  initialNotes: string;
  channelLabel: string;
  backHref: string;
}) {
  const router = useRouter();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteMedia, setRemoteMedia] = useState<Record<string, Media>>({});
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [conn, setConn] = useState<Record<string, RTCPeerConnectionState>>({});
  const [media, setMedia] = useState<Media>({ mic: false, cam: false, screen: false });
  const [localVideo, setLocalVideo] = useState<MediaStream | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [captions, setCaptions] = useState<{ key: number; name: string; text: string }[]>([]);
  const [notes, setNotes] = useState(initialNotes);
  const [notesBy, setNotesBy] = useState<string | null>(null);

  const session = useRef(Math.random().toString(36).slice(2, 12));
  const peers = useRef(new Map<string, Peer>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const sessions = useRef(new Map<string, string>());
  const tracks = useRef<{ audio: MediaStreamTrack | null; cam: MediaStreamTrack | null; screen: MediaStreamTrack | null }>({ audio: null, cam: null, screen: null });
  const mediaRef = useRef(media);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const strokes = useRef<Stroke[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const recognition = useRef<SpeechRecognitionLike>(null);
  const notesFocused = useRef(false);
  mediaRef.current = media;

  /** Signals go out strictly in order (an ICE candidate must never overtake its offer). */
  const send = useCallback(
    (payload: object) => {
      queue.current = queue.current
        .then(() => fetch(`/api/huddles/${huddleId}/signal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }))
        .catch(() => {});
      return queue.current;
    },
    [huddleId],
  );

  const videoTrack = () => tracks.current.screen ?? tracks.current.cam;
  const announce = useCallback(() => send({ kind: "state", session: session.current, ...mediaRef.current }), [send]);

  const dropPeer = useCallback((id: string) => {
    peers.current.get(id)?.pc.close();
    peers.current.delete(id);
    pendingIce.current.delete(id);
    setStreams(({ [id]: _, ...rest }) => rest);
    setConn(({ [id]: _, ...rest }) => rest);
  }, []);

  const makePeer = useCallback(
    (remoteId: string, offerer: boolean) => {
      dropPeer(remoteId);
      const pc = new RTCPeerConnection({ iceServers });
      const peer: Peer = { pc, stream: new MediaStream() };
      peers.current.set(remoteId, peer);
      pc.onicecandidate = (e) => e.candidate && send({ kind: "ice", to: remoteId, data: e.candidate.toJSON() });
      pc.ontrack = (e) => {
        peer.stream.addTrack(e.track);
        const refresh = () => setStreams((s) => ({ ...s, [remoteId]: new MediaStream(peer.stream.getTracks()) }));
        e.track.onunmute = refresh;
        refresh();
      };
      pc.onconnectionstatechange = () => setConn((c) => ({ ...c, [remoteId]: pc.connectionState }));
      if (offerer) {
        const audio = pc.addTransceiver("audio", { direction: "sendrecv" });
        const video = pc.addTransceiver("video", { direction: "sendrecv" });
        void audio.sender.replaceTrack(tracks.current.audio);
        void video.sender.replaceTrack(videoTrack());
        void (async () => {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await send({ kind: "offer", to: remoteId, data: { type: "offer", sdp: offer.sdp } });
        })();
      }
      return peer;
    },
    [dropPeer, iceServers, send],
  );

  const flushIce = async (id: string, pc: RTCPeerConnection) => {
    for (const c of pendingIce.current.get(id) ?? []) await pc.addIceCandidate(c).catch(() => {});
    pendingIce.current.delete(id);
  };

  /** Swap what we send as video (camera ↔ screen ↔ nothing) without renegotiating. */
  const publishVideo = useCallback((track: MediaStreamTrack | null) => {
    for (const { pc } of peers.current.values()) {
      const t = pc.getTransceivers().find((x) => x.receiver.track.kind === "video");
      void t?.sender.replaceTrack(track);
    }
    setLocalVideo(track ? new MediaStream([track]) : null);
  }, []);

  const updateMedia = useCallback(
    (next: Partial<Media>) => {
      mediaRef.current = { ...mediaRef.current, ...next };
      setMedia(mediaRef.current);
      void announce();
    },
    [announce],
  );

  // Join: microphone, then the event stream (which is what puts us in the call).
  useEffect(() => {
    let alive = true;
    let source: EventSource | null = null;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        tracks.current.audio = s.getAudioTracks()[0];
        mediaRef.current = { ...mediaRef.current, mic: true };
        setMedia(mediaRef.current);
      } catch {
        setNotice("No microphone access, so you're listening only. Allow the mic in your browser to talk.");
      }
      if (!alive) return;
      source = new EventSource(`/api/huddles/${huddleId}/events`);
      let greeted = false;
      source.onmessage = async (msg) => {
        const e = JSON.parse(msg.data);
        if (e.type === "presence") {
          const list: Participant[] = e.participants;
          setParticipants(list);
          const ids = new Set(list.map((p) => p.id));
          for (const id of [...peers.current.keys()]) if (!ids.has(id)) dropPeer(id);
          if (!greeted && ids.has(me.id)) {
            greeted = true;
            void announce();
          }
        } else if (e.type === "state") {
          if (e.from === me.id) return;
          const prev = sessions.current.get(e.from);
          sessions.current.set(e.from, e.session);
          setRemoteMedia((m) => ({ ...m, [e.from]: { mic: e.mic, cam: e.cam, screen: e.screen } }));
          if (prev !== e.session) {
            // A new browser session (join or reload): the lower id offers a fresh connection,
            // and we announce ourselves once so they learn our session too.
            if (e.from > me.id) makePeer(e.from, true);
            void announce();
          }
        } else if (e.type === "signal") {
          if (e.kind === "offer") {
            const { pc } = makePeer(e.from, false);
            await pc.setRemoteDescription(e.data);
            for (const t of pc.getTransceivers()) {
              t.direction = "sendrecv";
              await t.sender.replaceTrack(t.receiver.track.kind === "audio" ? tracks.current.audio : videoTrack());
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await send({ kind: "answer", to: e.from, data: { type: "answer", sdp: answer.sdp } });
            await flushIce(e.from, pc);
          } else if (e.kind === "answer") {
            const peer = peers.current.get(e.from);
            if (peer && peer.pc.signalingState === "have-local-offer") {
              await peer.pc.setRemoteDescription(e.data);
              await flushIce(e.from, peer.pc);
            }
          } else if (e.kind === "ice" && e.data) {
            const peer = peers.current.get(e.from);
            if (peer?.pc.remoteDescription) await peer.pc.addIceCandidate(e.data).catch(() => {});
            else pendingIce.current.set(e.from, [...(pendingIce.current.get(e.from) ?? []), e.data]);
          }
        } else if (e.type === "draw") {
          if (e.data.clear) strokes.current = [];
          else if (e.from !== me.id) strokes.current.push({ ...e.data, at: performance.now() });
        } else if (e.type === "caption") {
          setCaptions((c) => [...c.slice(-5), { key: Date.now() + Math.random(), name: e.name, text: e.text }]);
        } else if (e.type === "notes") {
          if (e.from === me.id) return;
          if (notesFocused.current) setNotesBy("Someone else edited the notes. Click outside the box to load their version.");
          else setNotes(e.text);
        } else if (e.type === "ended") {
          alive = false;
          source?.close();
          router.refresh();
        }
      };
      source.onerror = () => {
        // A closed stream (not a retry) means the huddle ended or is full; the page will explain.
        if (source?.readyState === EventSource.CLOSED) router.refresh();
      };
    })();
    const peerMap = peers.current;
    const local = tracks.current;
    return () => {
      alive = false;
      source?.close();
      for (const { pc } of peerMap.values()) pc.close();
      peerMap.clear();
      for (const t of [local.audio, local.cam, local.screen]) t?.stop();
      tracks.current = { audio: null, cam: null, screen: null };
      recognition.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huddleId, me.id]);

  const toggleMic = () => {
    const t = tracks.current.audio;
    if (!t) return setNotice("No microphone available. Check your browser's permissions.");
    t.enabled = !media.mic;
    updateMedia({ mic: t.enabled });
  };

  const toggleCam = async () => {
    if (media.cam) {
      tracks.current.cam?.stop();
      tracks.current.cam = null;
      if (!media.screen) publishVideo(null);
      return updateMedia({ cam: false });
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 } } });
      tracks.current.cam = s.getVideoTracks()[0];
      if (!media.screen) publishVideo(tracks.current.cam);
      updateMedia({ cam: true });
    } catch {
      setNotice("Couldn't start your camera.");
    }
  };

  const stopScreen = useCallback(() => {
    tracks.current.screen?.stop();
    tracks.current.screen = null;
    publishVideo(tracks.current.cam);
    strokes.current = [];
    void send({ kind: "clear" });
    updateMedia({ screen: false });
    setDrawMode(false);
  }, [publishVideo, send, updateMedia]);

  const toggleScreen = async () => {
    if (media.screen) return stopScreen();
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = s.getVideoTracks()[0];
      track.onended = stopScreen;
      tracks.current.screen = track;
      publishVideo(track);
      updateMedia({ screen: true });
    } catch {
      /* picker cancelled */
    }
  };

  const toggleCaptions = () => {
    if (captionsOn) {
      setCaptionsOn(false);
      recognition.current?.stop();
      recognition.current = null;
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return setNotice("Live captions need a browser with speech recognition (Chrome or Edge). You can still type shared notes.");
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = navigator.language || "en-GB";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (ev: any) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const text = ev.results[i].isFinal ? ev.results[i][0].transcript.trim() : "";
        if (text && mediaRef.current.mic) void addCaption(huddleId, text).catch(() => {});
      }
    };
    r.onend = () => recognition.current === r && r.start();
    recognition.current = r;
    r.start();
    setCaptionsOn(true);
  };

  // Shared notes: debounced save; last write wins, but we never clobber text you're typing.
  const notesTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editNotes = (text: string) => {
    setNotes(text);
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => void saveHuddleNotes(huddleId, text).catch(() => {}), 700);
  };

  // Who is presenting? Me first, then whoever else is sharing.
  const presenter = media.screen ? me.id : participants.find((p) => p.id !== me.id && remoteMedia[p.id]?.screen)?.id ?? null;
  const presenterStream = presenter === me.id ? localVideo : presenter ? streams[presenter] : null;

  // Draw-over: strokes fade out after a few seconds.
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const c = canvas.current;
      if (c) {
        const ctx = c.getContext("2d")!;
        const { width, height } = c.getBoundingClientRect();
        if (c.width !== Math.round(width) || c.height !== Math.round(height)) {
          c.width = Math.round(width);
          c.height = Math.round(height);
        }
        ctx.clearRect(0, 0, c.width, c.height);
        const now = performance.now();
        strokes.current = strokes.current.filter((s) => now - s.at < STROKE_LIFE_MS);
        for (const s of strokes.current) {
          ctx.globalAlpha = Math.max(0, 1 - (now - s.at) / STROKE_LIFE_MS);
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.shadowColor = s.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * c.width, y * c.height) : ctx.moveTo(x * c.width, y * c.height)));
          ctx.stroke();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const current = useRef<Stroke | null>(null);
  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    current.current = { points: [pointAt(e)], color: colorFor(me.id), at: performance.now() };
    strokes.current.push(current.current);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = current.current;
    if (!s || s.points.length >= 400) return;
    s.points.push(pointAt(e));
    s.at = performance.now();
  };
  const onUp = () => {
    const s = current.current;
    current.current = null;
    if (s) void send({ kind: "draw", data: { points: s.points, color: s.color } });
  };

  const others = participants.filter((p) => p.id !== me.id);
  const connected = others.filter((p) => conn[p.id] === "connected").length;

  return (
    <div className="space-y-4" data-testid="huddle-room" data-connected={connected} data-peers={others.length}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
        <h1 className="font-display text-xl font-bold tracking-tight">Huddle in {channelLabel}</h1>
        <span className="chip">{participants.length || 1} in call</span>
        {others.length > 0 && <span className="text-xs text-fg-muted">{connected}/{others.length} connected</span>}
        <Link href={backHref} className="btn-ghost ml-auto text-sm">Back to chat</Link>
      </div>
      {notice && <p className="animate-pop rounded-xl border border-amber-400/40 bg-amber-400/5 p-3 text-sm">{notice} <button className="ml-2 underline" onClick={() => setNotice(null)}>Dismiss</button></p>}

      <div className={`grid gap-4 ${presenter ? "lg:grid-cols-[1fr_280px]" : ""}`}>
        {presenter && (
          <div className="card relative aspect-video overflow-hidden bg-black p-0">
            <VideoEl stream={presenterStream} className="h-full w-full object-contain" />
            <canvas
              ref={canvas}
              className={`absolute inset-0 h-full w-full ${drawMode ? "cursor-crosshair" : "pointer-events-none"}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur">
              <MonitorUp size={13} /> {presenter === me.id ? "You're presenting" : `${participants.find((p) => p.id === presenter)?.name} is presenting`}
            </div>
            <div className="absolute right-3 top-3 flex gap-1.5">
              <button className={`rounded-full px-3 py-1 text-xs backdrop-blur ${drawMode ? "bg-violet-500 text-white" : "bg-black/60 text-white"}`} onClick={() => setDrawMode((d) => !d)} aria-pressed={drawMode}>
                <PenLine size={13} className="mr-1 inline" /> Draw
              </button>
              <button className="rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur" onClick={() => { strokes.current = []; void send({ kind: "clear" }); }}>
                <Eraser size={13} className="mr-1 inline" /> Clear
              </button>
            </div>
          </div>
        )}
        <div className={`grid gap-3 ${presenter ? "content-start sm:grid-cols-2 lg:grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          <Tile user={me} label="You" media={media} stream={media.screen ? null : localVideo} mirrored small={Boolean(presenter)} speakingTrack={tracks.current.audio} />
          {others.map((p) => (
            <Tile
              key={p.id}
              user={users[p.id] ?? { handle: p.handle, name: p.name }}
              label={p.name}
              media={remoteMedia[p.id] ?? { mic: true, cam: false, screen: false }}
              stream={remoteMedia[p.id]?.screen ? null : streams[p.id]}
              state={conn[p.id]}
              small={Boolean(presenter)}
              audioStream={streams[p.id]}
            />
          ))}
          {others.length === 0 && (
            <div className="card flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-fg-muted">
              <span className="animate-float text-4xl">🎧</span>
              Waiting for your party. Everyone in {channelLabel} can see the huddle is live.
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-3 z-10 mx-auto flex w-fit flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-surface/90 p-2 shadow-2xl backdrop-blur">
        <CallButton on={media.mic} onClick={toggleMic} label={media.mic ? "Mute" : "Unmute"} icon={media.mic ? Mic : MicOff} />
        <CallButton on={media.cam} onClick={toggleCam} label={media.cam ? "Camera off" : "Camera"} icon={media.cam ? Video : VideoOff} />
        <CallButton on={media.screen} onClick={toggleScreen} label={media.screen ? "Stop sharing" : "Share screen"} icon={media.screen ? ScreenShareOff : MonitorUp} />
        <CallButton on={captionsOn} onClick={toggleCaptions} label={captionsOn ? "Captions on" : "Captions"} icon={Captions} />
        <Link href={backHref} className="btn-secondary py-2">Leave</Link>
        <form action={endHuddleAction.bind(null, huddleId)} onSubmit={() => setEnding(true)}>
          <button className="btn bg-gradient-to-r from-rose-500 to-orange-500 py-2" disabled={ending}>
            <PhoneOff size={16} /> {ending ? "Writing recap…" : "End for all"}
          </button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold">Shared notes</h2>
            <span className="text-xs text-fg-muted">Write &quot;Decision:&quot; or &quot;TODO&quot; lines to seed the recap</span>
          </div>
          <textarea
            className="input min-h-40 font-mono text-sm"
            value={notes}
            onChange={(e) => editNotes(e.target.value)}
            onFocus={() => (notesFocused.current = true)}
            onBlur={() => {
              notesFocused.current = false;
              if (notesBy) {
                setNotesBy(null);
                router.refresh();
              }
            }}
            placeholder={"Decision: ship the storm level first\nTODO @mei fix the dock shader"}
            aria-label="Shared notes"
          />
          {notesBy && <p className="text-xs text-amber-400">{notesBy}</p>}
        </div>
        <div className="card space-y-2">
          <h2 className="font-display font-semibold">Live captions</h2>
          {captions.length === 0 ? (
            <p className="text-sm text-fg-muted">Turn on Captions to transcribe your own mic in your browser. Captions go into the recap; nothing is recorded.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {captions.map((c) => (
                <li key={c.key} className="animate-fade-up"><span className="font-semibold">{c.name}:</span> {c.text}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function CallButton({ on, onClick, label, icon: Icon }: { on: boolean; onClick: () => void; label: string; icon: typeof Mic }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all active:scale-95 ${on ? "bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-lg shadow-violet-500/25" : "bg-muted text-fg-muted hover:text-fg"}`}
    >
      <Icon size={16} /> {label}
    </button>
  );
}

function VideoEl({ stream, className, mirrored }: { stream: MediaStream | null; className?: string; mirrored?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted className={`${className ?? ""} ${mirrored ? "-scale-x-100" : ""}`} />;
}

function AudioEl({ stream }: { stream: MediaStream | undefined }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && stream && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

/** True while the track is carrying speech-level audio. */
function useSpeaking(track: MediaStreamTrack | null | undefined): boolean {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!track || typeof AudioContext === "undefined") return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const timer = setInterval(() => {
      analyser.getByteFrequencyData(data);
      const level = data.reduce((a, b) => a + b, 0) / data.length;
      setSpeaking(track.enabled && level > 18);
    }, 200);
    return () => {
      clearInterval(timer);
      void ctx.close();
    };
  }, [track]);
  return speaking;
}

function Tile({
  user,
  label,
  media,
  stream,
  state,
  mirrored,
  small,
  audioStream,
  speakingTrack,
}: {
  user: AvatarUser;
  label: string;
  media: Media;
  stream: MediaStream | null | undefined;
  state?: RTCPeerConnectionState;
  mirrored?: boolean;
  small?: boolean;
  audioStream?: MediaStream;
  speakingTrack?: MediaStreamTrack | null;
}) {
  const speaking = useSpeaking(speakingTrack ?? audioStream?.getAudioTracks()[0]);
  const showVideo = media.cam && stream && stream.getVideoTracks().length > 0;
  return (
    <div className={`card relative overflow-hidden p-0 transition-shadow ${small ? "aspect-[16/8]" : "aspect-video"} ${speaking ? "ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/20" : ""}`}>
      {audioStream && <AudioEl stream={audioStream} />}
      {showVideo ? (
        <VideoEl stream={stream!} mirrored={mirrored} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500/10 to-cyan-500/5">
          <span className={speaking ? "animate-[bob_0.6s_ease-in-out_infinite]" : ""}>
            <Avatar user={user} size={small ? 48 : 72} ring={speaking} />
          </span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white backdrop-blur">
        {media.mic ? <Mic size={12} /> : <MicOff size={12} className="text-rose-400" />}
        {label}
        {state && state !== "connected" && <span className="text-amber-300">· {state === "new" ? "connecting" : state}</span>}
      </div>
    </div>
  );
}
