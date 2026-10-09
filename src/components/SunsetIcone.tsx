import type { ComponentType } from 'react'

export type IconeProps = { size?: number; className?: string; strokeWidth?: number }

/** Coucher de soleil SANS la flèche du `sunset` de lucide : un demi-soleil sur
 *  la ligne d'horizon, avec ses rayons. */
export const Sunset: ComponentType<IconeProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M12 10V8" />
    <path d="m4.93 10.93 1.41 1.41" />
    <path d="m19.07 10.93-1.41 1.41" />
    <path d="M2 18h2" />
    <path d="M20 18h2" />
    <path d="M16 18a4 4 0 0 0-8 0" />
    <path d="M22 22H2" />
  </svg>
)

