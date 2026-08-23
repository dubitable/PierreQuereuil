import { useCredit } from '../scene/nowPlaying'

/**
 * Names the record under the cursor, or the one playing, and links to it.
 * Apple's terms expect a link back to the store, and this is the smallest
 * surface that does it honestly.
 */
export function NowPlaying() {
  const track = useCredit()

  return (
    <div className="credit" data-visible={track ? true : undefined}>
      {track && (
        <a
          className="credit__link"
          href={track.storeUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="credit__track">{track.trackName}</span>
          <span className="credit__artist">{track.artistName}</span>
          <span className="credit__source">View on Apple Music ↗</span>
        </a>
      )}
    </div>
  )
}
