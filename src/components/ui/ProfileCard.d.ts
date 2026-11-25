import type { ReactElement } from 'react';

export type ProfileCardProps = {
  /** Portrait in the 4:5 tile. A cut-out stays transparent over the backdrop. */
  avatarUrl?: string;
  /** Tileable foil pattern; the holographic layer shows only through it. */
  iconUrl?: string;
  miniAvatarUrl?: string;
  name?: string;
  title?: string;
  /** Footer handle, without the @. */
  handle?: string;
  status?: string;
  statusColor?: string;
  contactText?: string;
  /** Member-specific destination, opened in a new tab. Falls back to onContactClick. */
  contactUrl?: string;
  /** Accessible name for the contact control. */
  contactAriaLabel?: string;
  showUserInfo?: boolean;
  onContactClick?: () => void;
  theme?: 'dark' | 'light';
  backdropColor?: string;
  radius?: number;
  holo?: number;
  glare?: number;
  enableTilt?: boolean;
  tiltStrength?: number;
  parallax?: number;
  enableMobileTilt?: boolean;
  mobileTiltSensitivity?: number;
  intro?: boolean;
  /** object-position for the portrait, e.g. 'center 34%'. */
  photoPosition?: string;
  className?: string;
};

export function ProfileCard(props: ProfileCardProps): ReactElement;
export default ProfileCard;
