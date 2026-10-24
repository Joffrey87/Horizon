import airbnb from '../../assets/comptes/airbnb.png'
import boursorama from '../../assets/comptes/boursorama.png'
import creditCooperatif from '../../assets/comptes/credit-cooperatif.png'
import cryptoCom from '../../assets/comptes/crypto-com.svg'
import { titulaireDe, type IndexFinances } from '../../lib/finances'
import { sourceCompte, type CalqueCompte, type LogoCompte } from '../../lib/sourceCompte'
import type { FinAccount, FinTransaction } from '../../lib/types'

const LOGOS: Record<LogoCompte, string> = { boursorama, 'credit-cooperatif': creditCooperatif, 'crypto-com': cryptoCom, airbnb }
const ROSE = '#e8559a'
const BLEU = '#3b82f6' // seule exception à « pas de bleu » : le calque du compte de Joffrey
const CALQUES: Record<Exclude<CalqueCompte, null>, string> = {
  honorine: ROSE, joffrey: BLEU, partage: `linear-gradient(90deg, ${BLEU} 50%, ${ROSE} 50%)`,
}

/** Petite icône (18 px) de provenance, avant l'intitulé : logo de la banque, calque de couleur à 50 % selon le titulaire. */
export function IconeCompte({ tx, idx, taille = 18 }: { tx: FinTransaction; idx: IndexFinances; taille?: number }) {
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
