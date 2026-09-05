import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarPlus, Check, MapPin, Repeat, X } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { Modal } from './ui'

/** Tri des évènements d'agenda externe.
 *
 *  Rien n'entre dans « Temps » sans être choisi ici : un agenda personnel
 *  contient beaucoup de choses qui n'ont pas à encombrer le calendrier.
 *  « Ajouter » fait entrer l'occurrence ; « Écarter » retire la SÉRIE entière
 *  et elle ne sera plus jamais proposée (réversible dans les Paramètres). */
export function AgendaPropositions() {
  const s = useHorizon()
  const [ouvert, setOuvert] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const props = s.propositionsAgenda

  if (props.length === 0) return null

  const ajouter = async (cle: string) => {
    const p = props.find((x) => x.cle === cle)
    if (!p) return
    setBusy(cle); await s.accepterProposition(p); setBusy(null)
  }
  const ecarter = async (cle: string) => {
    const p = props.find((x) => x.cle === cle)
    if (!p) return
    setBusy(cle); await s.ignorerSerie(p.feed_id, p.uid); setBusy(null)
  }

  return (
    <>
      <button onClick={() => setOuvert(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-sun/40 bg-sun/10 px-3 py-2 text-left text-sm transition-colors hover:bg-sun/15">
        <CalendarPlus size={16} className="shrink-0 text-sun" />
        <span className="min-w-0 flex-1 text-ink">
          {props.length} évènement{props.length > 1 ? 's' : ''} d’agenda à trier
        </span>
        <span className="shrink-0 text-xs text-ink-3">choisir</span>
      </button>

      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Évènements d’agenda">
        <p className="mb-3 text-xs text-ink-3">
          Rien n’entre dans « Temps » sans ton accord. « Écarter » retire toute la série :
          elle ne te sera plus proposée.
        </p>
        {props.length === 0 ? (
          <p className="py-4 text-center text-sm text-[#4cc79a]">Tout est trié.</p>
        ) : (
          <ul className="space-y-1.5">
            {props.map((p) => (
              <li key={p.cle} className="flex items-start gap-2 rounded-lg bg-panel-2/60 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{p.titre}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
                    <span className="capitalize">{format(parseISO(p.debut), 'EEE d MMM', { locale: fr })}</span>
                    {p.fin && <span>→ {format(parseISO(p.fin), 'd MMM', { locale: fr })}</span>}
                    {p.recurrent && <span className="flex items-center gap-0.5"><Repeat size={10} /> série</span>}
                    {p.lieu && <span className="flex min-w-0 items-center gap-0.5"><MapPin size={10} /><span className="truncate">{p.lieu}</span></span>}
                    {s.calendarFeeds.length > 1 && <span>· {p.feed_label}</span>}
                  </p>
                </div>
                <button onClick={() => void ajouter(p.cle)} disabled={busy !== null}
                  title="Ajouter à Temps"
                  className="btn-ghost shrink-0 p-1.5 text-[#4cc79a] disabled:opacity-40">
                  <Check size={15} />
                </button>
                <button onClick={() => void ecarter(p.cle)} disabled={busy !== null}
                  title={p.recurrent ? 'Écarter toute la série' : 'Écarter'}
                  className="btn-ghost shrink-0 p-1.5 text-ink-3 hover:text-[#ec7f97] disabled:opacity-40">
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  )
}
