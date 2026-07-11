/**
 * Icônes SVG « maison » (tracés fournis par le projet), thémables via `color`
 * (fill = couleur passée). Ratio d'origine préservé : `size` fixe la hauteur.
 */
type IconProps = { size?: number; color?: string; title?: string; className?: string };

/** Calendrier — récompense journalière (viewBox 18×20). */
export function DailyRewardIcon({ size = 16, color = 'currentColor', title, className }: IconProps) {
  return (
    <svg
      width={(size * 18) / 20}
      height={size}
      viewBox="0 0 18 20"
      fill="none"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <title>{title}</title>}
      <path
        d="M16 18H2V7H16M13 0V2H5V0H3V2H2C0.89 2 0 2.89 0 4V18C0 18.5304 0.210714 19.0391 0.585786 19.4142C0.960859 19.7893 1.46957 20 2 20H16C16.5304 20 17.0391 19.7893 17.4142 19.4142C17.7893 19.0391 18 18.5304 18 18V4C18 3.46957 17.7893 2.96086 17.4142 2.58579C17.0391 2.21071 16.5304 2 16 2H15V0M14 11H9V16H14V11Z"
        fill={color}
      />
    </svg>
  );
}

/** Ticket / coupon — codes de récompense (viewBox 20×16). */
export function RedeemTicketIcon({ size = 16, color = 'currentColor', title, className }: IconProps) {
  return (
    <svg
      width={size}
      height={(size * 16) / 20}
      viewBox="0 0 20 16"
      fill="none"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <title>{title}</title>}
      <path
        d="M2 0C1.46957 0 0.960859 0.210714 0.585786 0.585786C0.210714 0.960859 0 1.46957 0 2V6C0.530433 6 1.03914 6.21071 1.41421 6.58579C1.78929 6.96086 2 7.46957 2 8C2 8.53043 1.78929 9.03914 1.41421 9.41421C1.03914 9.78929 0.530433 10 0 10V14C0 14.5304 0.210714 15.0391 0.585786 15.4142C0.960859 15.7893 1.46957 16 2 16H18C18.5304 16 19.0391 15.7893 19.4142 15.4142C19.7893 15.0391 20 14.5304 20 14V10C19.4696 10 18.9609 9.78929 18.5858 9.41421C18.2107 9.03914 18 8.53043 18 8C18 7.46957 18.2107 6.96086 18.5858 6.58579C18.9609 6.21071 19.4696 6 20 6V2C20 1.46957 19.7893 0.960859 19.4142 0.585786C19.0391 0.210714 18.5304 0 18 0H2ZM2 2H18V4.54C16.76 5.25 16 6.57 16 8C16 9.43 16.76 10.75 18 11.46V14H2V11.46C3.24 10.75 4 9.43 4 8C4 6.57 3.24 5.25 2 4.54V2Z"
        fill={color}
      />
    </svg>
  );
}
