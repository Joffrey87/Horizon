import { extractHourMinute } from '../../lib/logic'

/** Heure de début d'un titre qui commence par une heure (« 19h30 Prière »), sinon null. */
export const heureDebut = (title: string): { hour: number; minute: number } | null =>
  /^\s*\d{1,2}[h:]/i.test(title) ? extractHourMinute(title) : null

/** « 19h », ou « 19h » suivi des minutes en petit exposant (« 19h³⁰ ») : lisible sans prendre de place dans la vue Mois. */
export function HeureExposant({ titre }: { titre: string }) {
  const h = heureDebut(titre)
  if (!h) return null
  return (
    <span className="mr-0.5 shrink-0 font-semibold tabular-nums">
      {h.hour}h{h.minute > 0 && <sup className="ml-px align-super text-[0.65em] leading-none">{String(h.minute).padStart(2, '0')}</sup>}
    </span>
  )
}
