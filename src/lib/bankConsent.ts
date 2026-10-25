import { consentDaysLeft, consentNeedsAlert } from '../../supabase/functions/_shared/bankSync'

export type BankConnection = {
  id: string; source: string; aspsp_name: string; valid_until: string; status: string
  last_sync_at: string | null; last_error: string | null
}

/** Connexions à renouveler bientôt (≤ 14 j) ou expirées, avec le nombre de jours restants. */
export function consentAlerts(conns: BankConnection[], now = new Date()) {
  return conns.filter((c) => consentNeedsAlert(c.valid_until, now))
    .map((c) => ({ ...c, daysLeft: consentDaysLeft(c.valid_until, now) }))
}
