/**
 * The studio team. One record per person, and the Team section renders one
 * ProfileCard per record — adding or removing a member is a data edit only.
 *
 * Names, roles, handles and contact destinations are supplied by the studio.
 * Nothing here is generated: no biographies, no surnames, no status beyond the
 * team designation.
 */
export type TeamMember = {
  id: string;
  name: string;
  /** Role as credited by the studio, e.g. 'Founder / Strategist'. */
  title: string;
  /** Instagram handle, without the @. */
  handle: string;
  /** That member's own Instagram profile. */
  instagram: string;
  /** Portrait in /public/images/team — a cut-out, so the card backdrop shows. */
  avatarUrl: string;
  /** Per-portrait framing for the 4:5 tile (object-position). */
  photoPosition: string;
  /** Team designation, not a presence indicator. */
  status: string;
  /** Status dot; brand accents, used for the dot only. */
  statusColor: string;
};

export const team: TeamMember[] = [
  {
    id: 'ashlee',
    name: 'Ashlee',
    title: 'Founder / Strategist',
    handle: 'chilly.potatooo',
    instagram: 'https://www.instagram.com/chilly.potatooo/',
    avatarUrl: '/images/team/ashlee.webp',
    photoPosition: 'center 34%',
    status: 'CORE TEAM',
    statusColor: '#4b63e8',
  },
  {
    id: 'riddhi',
    name: 'Riddhi',
    title: 'Coordinator / Insight Planner',
    handle: 'xoxo._.rii_',
    instagram: 'https://www.instagram.com/xoxo._.rii_/',
    avatarUrl: '/images/team/riddhi.webp',
    photoPosition: 'center 34%',
    status: 'CORE TEAM',
    statusColor: '#e8603c',
  },
  {
    id: 'aastha',
    name: 'Aastha',
    title: 'Coordinator / Operations Lead',
    handle: 'aastha.r07',
    instagram: 'https://www.instagram.com/aastha.r07/',
    avatarUrl: '/images/team/aastha.webp',
    photoPosition: 'center 34%',
    status: 'CORE TEAM',
    statusColor: '#2e7d5b',
  },
  {
    id: 'prince',
    name: 'Prince',
    title: 'Editor / Developer',
    handle: 'idiotic_.prince',
    instagram: 'https://www.instagram.com/idiotic_.prince/',
    avatarUrl: '/images/team/prince.webp',
    photoPosition: 'center 34%',
    status: 'CORE TEAM',
    statusColor: '#e8b4f5',
  },
];
