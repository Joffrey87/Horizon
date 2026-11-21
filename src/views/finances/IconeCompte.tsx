import airbnb from '../../assets/comptes/airbnb.png'
import boursorama from '../../assets/comptes/boursorama.png'
import creditCooperatif from '../../assets/comptes/credit-cooperatif.png'
import cryptoCom from '../../assets/comptes/crypto-com.svg'
import { useCouleurHonorine } from '../../lib/couleurHonorine'
import { titulaireDe, type IndexFinances } from '../../lib/finances'
import { sourceCompte, type CalqueCompte, type LogoCompte } from '../../lib/sourceCompte'
import type { FinAccount, FinOwner, FinTransaction } from '../../lib/types'

const LOGOS: Record<LogoCompte, string> = { boursorama, 'credit-cooperatif': creditCooperatif, 'crypto-com': cryptoCom, airbnb }
const BLEU = '#3b82f6' // seule exception à « pas de bleu » : le calque du compte de Joffrey
const calquesDe = (honorine: string): Record<Exclude<CalqueCompte, null>, string> => ({
  honorine, joffrey: BLEU, partage: `linear-gradient(90deg, ${BLEU} 50%, ${honorine} 50%)`,
})

/** Petite icône (18 px) de provenance, avant l'intitulé : logo de la banque, calque de couleur à 50 % selon le titulaire. */
export function IconeCompte({ tx, idx, taille = 18 }: { tx: FinTransaction; idx: IndexFinances; taille?: number }) {
  const CALQUES = calquesDe(useCouleurHonorine())
  const s = sourceCompte(idx.comptes.get(tx.account_id), titulaireDe(tx, idx))
  const plein = s.logo === 'crypto-com' || s.logo === 'airbnb'
  return (
    <span data-testid="icone-compte" data-logo={s.logo} data-calque={s.calque ?? ''} title={s.nom}
      className="relative inline-flex shrink-0 items-center justify-center self-center overflow-hidden rounded-[28%] bg-white"
      style={{ width: taille, height: taille }}>
      <img src={LOGOS[s.logo]} alt="" className={plein ? 'h-full w-full' : 'h-[74%] w-[74%] object-contain'} />
      {s.calque && <span className="absolute inset-0 opacity-50" style={{ background: CALQUES[s.calque] }} />}
    </span>
  )
}

/** Même icône, à partir du compte lui-même (calque selon son titulaire). */
export function IconeDeCompte({ compte, taille = 18 }: { compte: FinAccount; taille?: number }) {
  const CALQUES = calquesDe(useCouleurHonorine())
  const s = sourceCompte(compte, compte.owner)
  const plein = s.logo === 'crypto-com' || s.logo === 'airbnb'
  return (
    <span data-testid="icone-compte" data-logo={s.logo} data-calque={s.calque ?? ''} title={s.nom}
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%] bg-white"
      style={{ width: taille, height: taille }}>
      <img src={LOGOS[s.logo]} alt="" className={plein ? 'h-full w-full' : 'h-[74%] w-[74%] object-contain'} />
      {s.calque && <span className="absolute inset-0 opacity-50" style={{ background: CALQUES[s.calque] }} />}
    </span>
  )
}

const CALQUE_TITULAIRE: Record<FinOwner, Exclude<CalqueCompte, null>> = { joffrey: 'joffrey', honorine: 'honorine', commun: 'partage' }

/** Pastille d'attribution dans Horizon, sans logo : fond bleu (Joffrey), couleur d'Honorine (choisie) ou bleu/couleur d'Honorine (Commun). */
export function IconeTitulaire({ titulaire, taille = 18 }: { titulaire: FinOwner; taille?: number }) {
  const CALQUES = calquesDe(useCouleurHonorine())
  return (
    <span data-testid={`icone-titulaire-${titulaire}`} data-titulaire={titulaire} title={titulaire === 'commun' ? 'Commun' : titulaire === 'joffrey' ? 'Joffrey' : 'Honorine'}
      className="inline-block shrink-0 self-center rounded-[28%]" style={{ width: taille, height: taille, background: CALQUES[CALQUE_TITULAIRE[titulaire]] }} />
  )
}
