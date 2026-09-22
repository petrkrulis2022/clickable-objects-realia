#!/usr/bin/env bash
# Stand-in for scripts/generate-audio.ts in an environment with no
# ElevenLabs account. Generates a short tone per word (NOT speech) so
# the reveal-card audio mechanic — file-based playback, slow-replay
# being audibly slower — can be exercised end to end. Replace these by
# running generate-audio.ts with a real ELEVENLABS_API_KEY before this
# ever reaches a real lesson; do not ship tones to a real student.
set -euo pipefail

OUT_DIR="$(dirname "$0")/../../extension/public/audio"
mkdir -p "$OUT_DIR"

# id:frequency(Hz) — just gives each word a distinct pitch so they're
# tellable apart while testing.
WORDS=(
  "keys:660"
  "ball:550"
  "cup:440"
  "apple:494"
  "phone:587"
  "book:392"
)

for entry in "${WORDS[@]}"; do
  id="${entry%%:*}"
  freq="${entry##*:}"
  normal="$OUT_DIR/${id}-normal.mp3"
  slow="$OUT_DIR/${id}-slow.mp3"

  ffmpeg -v error -y -f lavfi -i "sine=frequency=${freq}:duration=0.45" \
    -af "afade=t=out:st=0.35:d=0.1" -codec:a libmp3lame -qscale:a 4 "$normal"

  # Same tone, time-stretched to half speed: audibly slower AND longer,
  # standing in for ElevenLabs' slow-speed narration.
  ffmpeg -v error -y -f lavfi -i "sine=frequency=${freq}:duration=0.45" \
    -af "afade=t=out:st=0.35:d=0.1,atempo=0.5" -codec:a libmp3lame -qscale:a 4 "$slow"
done

echo "[generate-placeholder-audio] wrote $(( ${#WORDS[@]} * 2 )) placeholder tone files to $OUT_DIR"
