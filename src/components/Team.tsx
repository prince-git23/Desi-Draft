import { useEffect, useRef } from 'react';
import { gsap } from '../lib/smooth';
import { usePrefersReducedMotion } from '../lib/hooks';
import { team } from '../data/team';
import { ProfileCard } from './ui/ProfileCard';
import { Chapter } from './ui/Chapter';

const COUNT_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/** The studio's own foil tile: sparkle, burst and doodle marks (see the SVG). */
const TEAM_PATTERN = '/images/team/holo-pattern.svg';

/**
 * The people. One holographic ProfileCard per record in `data/team`, on a
 * 4 / 2 / 1 column grid: four across on a laptop, two on a tablet, one on a
 * phone so the portrait and the footer stay legible. The count in the heading
 * and the roles line both come from the data — nothing is hard-coded.
 */
export function Team() {
  const gridRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const count = COUNT_WORD[team.length] ?? String(team.length);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || reduced) return;

    const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-team-card]'));
    if (!cards.length) return;

    const ctx = gsap.context(() => {
      gsap.from(cards, {
        y: 26,
        autoAlpha: 0,
        duration: 0.65,
        ease: 'power3.out',
        stagger: 0.07,
        scrollTrigger: { trigger: grid, start: 'top 88%', once: true },
      });
    }, grid);

    return () => ctx.revert();
  }, [reduced]);

  return (
    <section
      id="team"
      data-theme="motion"
      className="relative isolate scroll-mt-[72px] bg-ink dd-pad pb-[9vh] pt-[10vh] text-cream md:pb-[12vh] md:pt-[14vh]"
    >
      <div className="mx-auto w-full max-w-[1480px]">
        <div className="team-heading mx-auto max-w-[1100px] text-center">
          <Chapter no="05" name="the people" tone="cream" align="center" className="mb-5" />
          <h2 className="display text-[clamp(2.5rem,4.5vw,4.5rem)] leading-[1.02]">
            {count} people, <span className="serif-i">one studio.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-[62ch] text-[10.5px] uppercase leading-[1.9] tracking-[0.14em] text-cream/70">
            {team.map((member) => member.title).join(' · ')}
          </p>
        </div>

        <div
          ref={gridRef}
          className="mt-[6vh] grid grid-cols-1 justify-items-center gap-[clamp(1.5rem,2.4vw,1.75rem)] sm:grid-cols-2 md:mt-[8vh] xl:grid-cols-4"
        >
          {team.map((member) => (
            <div key={member.id} data-team-card className="w-full max-w-[340px]">
              <ProfileCard
                name={member.name}
                title={member.title}
                handle={member.handle}
                status={member.status}
                statusColor={member.statusColor}
                contactText="Instagram"
                contactUrl={member.instagram}
                contactAriaLabel={`View ${member.name} on Instagram`}
                avatarUrl={member.avatarUrl}
                photoPosition={member.photoPosition}
                iconUrl={TEAM_PATTERN}
                holo={0.85}
                glare={0.55}
                tiltStrength={8}
                parallax={6}
                radius={16}
                enableTilt
                intro
                showUserInfo
                enableMobileTilt={false}
                theme="dark"
              />
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-[11px] uppercase tracking-[0.18em] text-cream/70">
          the people behind the work
        </p>
      </div>
    </section>
  );
}
