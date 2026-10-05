import { useEffect, useState } from 'react'

/** Vrai tant que la requête média correspond (ex. `(max-width: 767px)`). */
export function useMediaQuery(requete: string): boolean {
  const [ok, setOk] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(requete).matches : false))
  useEffect(() => {
    const mq = window.matchMedia(requete)
    const maj = () => setOk(mq.matches)
    maj()
    mq.addEventListener('change', maj)
    return () => mq.removeEventListener('change', maj)
  }, [requete])
  return ok
}
