import ParticipantCard from "./ParticipantCard";
import CallControls from "./CallControls";
import "./callStyles.css";

export default function CallLayout({
  participants,
  localUserId,
  localMuted,
  localVideoOff,
  onToggleMute,
  onToggleVideo,
  onEndCall,
  onToggleMuteForMe,
  onToggleHideVideoForMe,
  onViewProfile,
  localVideoRef,
  remoteVideoRef,
  remoteAudioRef,
  controlsDisabled,
  isGroupCall = false,
  isGroupAdmin = false,
  onForceMuteParticipant,
  onRemoveParticipant,
  bindGroupRemoteVideo,
  bindGroupRemoteAudio,
}) {
  return (
    <div className="call-ui">
      <div className="call-participants">
        {participants.map((participant) => {
          const isLocal = String(participant.userId) === String(localUserId);
          return (
            <ParticipantCard
              key={participant.userId}
              userId={participant.userId}
              name={participant.displayName}
              role={participant.role}
              avatarUrl={participant.avatarUrl}
              isMuted={participant.isMuted}
              isVideoOff={participant.isVideoOff}
              isSpeaking={participant.isSpeaking}
              isMutedForMe={participant.isMutedForMe}
              isVideoHiddenForMe={participant.isVideoHiddenForMe}
              onToggleMuteForMe={onToggleMuteForMe}
              onToggleHideVideoForMe={onToggleHideVideoForMe}
              onViewProfile={onViewProfile}
              isLocal={isLocal}
              media={
                isGroupCall && !isLocal ? (
                  <video
                    ref={(node) => bindGroupRemoteVideo?.(participant.userId, node)}
                    autoPlay
                    playsInline
                    className="call-card-video"
                  />
                ) : isLocal ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="call-card-video"
                  />
                ) : (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="call-card-video"
                  />
                )
              }
              auxMedia={
                isGroupCall && !isLocal ? (
                  <audio
                    ref={(node) => bindGroupRemoteAudio?.(participant.userId, node)}
                    autoPlay
                  />
                ) : !isGroupCall && !isLocal && participant.isVideoHiddenForMe ? (
                  <audio ref={remoteAudioRef} autoPlay />
                ) : null
              }
              showAdminActions={isGroupCall && isGroupAdmin && !isLocal}
              canForceMute={!participant.isMuted}
              canRemoveFromCall={participant.canBeRemoved !== false}
              onForceMuteParticipant={onForceMuteParticipant}
              onRemoveParticipant={onRemoveParticipant}
            >
            </ParticipantCard>
          );
        })}
      </div>

      <CallControls
        isMuted={localMuted}
        isVideoOff={localVideoOff}
        onToggleMute={onToggleMute}
        onToggleVideo={onToggleVideo}
        onEndCall={onEndCall}
        disabled={controlsDisabled}
      />
    </div>
  );
}
