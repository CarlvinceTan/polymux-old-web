import { ref, readonly, onUnmounted } from 'vue'
import type {
  WebRTCAnswerPayload,
  WebRTCICECandidatePayload,
  WebRTCRenegotiatePayload,
  WebRTCOfferPayload,
  WebRTCRenegotiateAnswerPayload,
  TrackAddedPayload,
  TrackRemovedPayload,
} from './types'
import type { SessionHandle } from './useSession'

export function useWebRTC(session: SessionHandle) {
  const streams = ref<Map<string, MediaStream>>(new Map())

  let pc: RTCPeerConnection | null = null
  let remoteDescriptionSet = false
  const iceCandidateQueue: RTCIceCandidateInit[] = []
  const streamIdToAgentId = new Map<string, string>()
  const pendingTracks = new Map<string, RTCTrackEvent>()

  function attachStream(agentId: string, event: RTCTrackEvent) {
    const stream = event.streams[0] ?? new MediaStream([event.track])
    const next = new Map(streams.value)
    next.set(agentId, stream)
    streams.value = next
  }

  async function handleWebRTCAnswer(p: WebRTCAnswerPayload) {
    if (!pc) return
    await pc.setRemoteDescription({ type: 'answer', sdp: p.sdp })
    remoteDescriptionSet = true
    for (const candidate of iceCandidateQueue) {
      await pc.addIceCandidate(candidate)
    }
    iceCandidateQueue.length = 0
  }

  async function handleICECandidate(p: WebRTCICECandidatePayload) {
    const candidate: RTCIceCandidateInit = {
      candidate: p.candidate,
      sdpMid: p.sdp_mid,
      sdpMLineIndex: p.sdp_mline_index,
    }
    if (!remoteDescriptionSet) {
      iceCandidateQueue.push(candidate)
      return
    }
    await pc?.addIceCandidate(candidate)
  }

  async function handleRenegotiate(p: WebRTCRenegotiatePayload) {
    if (!pc) return
    await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    session.send<WebRTCRenegotiateAnswerPayload>('webrtc_renegotiate_answer', {
      sdp: answer.sdp!,
    })
  }

  function handleTrackAdded(p: TrackAddedPayload) {
    streamIdToAgentId.set(p.stream_id, p.agent_id)
    const pending = pendingTracks.get(p.stream_id)
    if (pending) {
      pendingTracks.delete(p.stream_id)
      attachStream(p.agent_id, pending)
    }
  }

  function handleTrackRemoved(p: TrackRemovedPayload) {
    const next = new Map(streams.value)
    next.delete(p.agent_id)
    streams.value = next
    for (const [key, _] of streamIdToAgentId) {
      if (streamIdToAgentId.get(key) === p.agent_id) {
        streamIdToAgentId.delete(key)
        break
      }
    }
  }

  session.on<WebRTCAnswerPayload>('webrtc_answer', handleWebRTCAnswer)
  session.on<WebRTCICECandidatePayload>('webrtc_ice_candidate', handleICECandidate)
  session.on<WebRTCRenegotiatePayload>('webrtc_renegotiate', handleRenegotiate)
  session.on<TrackAddedPayload>('track_added', handleTrackAdded)
  session.on<TrackRemovedPayload>('track_removed', handleTrackRemoved)

  onUnmounted(() => {
    session.off('webrtc_answer', handleWebRTCAnswer)
    session.off('webrtc_ice_candidate', handleICECandidate)
    session.off('webrtc_renegotiate', handleRenegotiate)
    session.off('track_added', handleTrackAdded)
    session.off('track_removed', handleTrackRemoved)
    cleanup()
  })

  async function initiate() {
    if (!import.meta.client) return
    cleanup()

    pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })

    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      session.send<WebRTCICECandidatePayload>('webrtc_ice_candidate', {
        candidate: event.candidate.candidate,
        sdp_mid: event.candidate.sdpMid ?? '',
        sdp_mline_index: event.candidate.sdpMLineIndex ?? 0,
      })
    }

    pc.ontrack = (event) => {
      // event.streams[0].id is mapped from the SDP a=msid attribute (Pion's streamID).
      // event.track.id is a browser-generated UUID and cannot be used for matching.
      const streamId = event.streams[0]?.id ?? ''
      const agentId = streamIdToAgentId.get(streamId)
      if (!agentId) {
        pendingTracks.set(streamId, event)
        return
      }
      attachStream(agentId, event)
    }

    // Add a recvonly video transceiver so the SDP includes ICE credentials.
    // Without media lines, Pion rejects the offer ("no ice-ufrag").
    pc.addTransceiver('video', { direction: 'recvonly' })

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    session.send<WebRTCOfferPayload>('webrtc_offer', { sdp: offer.sdp! })
  }

  function cleanup() {
    if (pc) {
      pc.onicecandidate = null
      pc.ontrack = null
      pc.close()
      pc = null
    }
    streams.value = new Map()
    iceCandidateQueue.length = 0
    remoteDescriptionSet = false
    streamIdToAgentId.clear()
    pendingTracks.clear()
  }

  return {
    streams: readonly(streams),
    initiate,
    cleanup,
  }
}
