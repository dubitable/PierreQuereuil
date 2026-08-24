import { useCredit } from '../scene/credit'

/**
 * Names whatever is under the cursor or currently picked, and links back to the
 * service it came from. Apple's and TMDB's terms both expect that link, and
 * this is the smallest surface that gives it honestly.
 */
export function Credit() {
  const credit = useCredit()

  return (
    <div className="credit" data-visible={credit ? true : undefined}>
      {credit && (
        <a
          className="credit__link"
          href={credit.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="credit__track">{credit.title}</span>
          <span className="credit__artist">{credit.subtitle}</span>
          <span className="credit__source">View on {credit.source} ↗</span>
        </a>
      )}
    </div>
  )
}
