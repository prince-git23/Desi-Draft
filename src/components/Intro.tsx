import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from '../lib/smooth';
import { usePrefersReducedMotion } from '../lib/hooks';
import { Sticker } from './art/Stickers';
import { LoopArrow } from './art/Doodles';
import { SZ } from './art/sizes';

const SENTENCE = 'we wanna be where the people are';
const P_INDEX = SENTENCE.indexOf('people');

const rand = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

export function Intro() {
  const sectionRef = useRef<HTMLElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const section = sectionRef.current;
    const line = lineRef.current;
    if (!section || !line || reduced) return;

    const ctx = gsap.context(() => {
      const letters = Array.from(line.querySelectorAll<HTMLElement>('.intro-char'));
      const stickers = Array.from(line.querySelectorAll<HTMLElement>('.intro-sticker'));
      let metrics = letters.map((l) => ({ left: l.offsetLeft, w: l.offsetWidth }));

      /** Word spans, measured in the line's own coordinates so stickers stay
       *  glued to their words while the whole line travels and scatters. */
      const placeStickers = () => {
        const span = (word: string) => {
          const start = SENTENCE.indexOf(word);
          const first = letters[start];
          const last = letters[start + word.length - 1];
          if (!first || !last) return { left: 0, width: 0 };
          return { left: first.offsetLeft, width: last.offsetLeft + last.offsetWidth - first.offsetLeft };
        };
        const half = (el: HTMLElement | null) => (el?.offsetWidth || SZ.intro) / 2;

        const wanna = span('wanna');
        if (thumbsRef.current) thumbsRef.current.style.left = `${wanna.left + wanna.width * 0.5 - half(thumbsRef.current)}px`;

        const beWhere = span('be where');
        if (arrowRef.current) {
          arrowRef.current.style.left = `${beWhere.left}px`;
          arrowRef.current.style.width = `${beWhere.width * 0.96}px`;
        }

        const where = span('where');
        if (cursorRef.current) cursorRef.current.style.left = `${where.left + where.width * 0.35 - half(cursorRef.current)}px`;

        const people = span('people');
        if (phoneRef.current) phoneRef.current.style.left = `${people.left + half(phoneRef.current) * 0.4}px`;
      };

      const render = (p: number) => {
        const vw = window.innerWidth;
        const lineW = line.scrollWidth || 1;
        // A phone gets a smaller version of the same idea, not the desktop
        // distances squeezed in: the scatter and the exit drop are re-measured
        // from the viewport so no letter can reach the paragraph below or leak
        // into the next section.
        const narrow = vw < 768;
        // Parked a little inside the right edge, not past it: by the time the
        // pin starts, the first word is already on screen, so the stage never
        // opens on an empty line. A phone's line is small enough that 0.78 would
        // still read as empty cream, so it starts further in.
        const x = (narrow ? vw * 0.62 : vw * 0.78) - p * (lineW + vw * 1.05);
        line.style.transform = `translate3d(${x}px,0,0)`;
        const yAmp = narrow ? 62 : 120;
        const exitAmp = narrow ? 62 : 120;
        const rotAmp = narrow ? 16 : 34;
        const scaleAmp = narrow ? 0.1 : 0.16;

        letters.forEach((el, i) => {
          const m = metrics[i];
          if (!m) return;
          const screenCenter = x + m.left + m.w / 2;
          const d = (screenCenter - vw / 2) / (vw * 0.52);
          const enter = Math.min(Math.max(d, 0), 1.5);
          const exit = Math.max(0, Math.min((-d - 0.18) / 0.9, 1.25));
          const seedA = rand(i + 1);
          const seedB = rand(i + 21);
          const seedC = rand(i + 41);

          let y = seedA * yAmp * enter - 12;
          let rot = seedB * rotAmp * enter;
          let scale = 1 + scaleAmp * enter;
          y += exit * exit * exitAmp * (0.55 + seedC * 0.8);
          rot -= seedC * rotAmp * 0.88 * exit;
          scale -= 0.05 * exit;

          // the P of "people" is extra bouncy
          if (i >= P_INDEX && i < P_INDEX + 6 && SENTENCE[i] === 'p') {
            y *= 1.35;
            scale += 0.1;
          }
          el.style.transform = `translate3d(0,${y.toFixed(2)}px,0) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        });

        stickers.forEach((el, i) => {
          const py = Math.sin(p * Math.PI * 2.2 + i * 1.7) * 12;
          const px = Math.cos(p * Math.PI * 1.6 + i) * 8;
          el.style.transform = `translate3d(${px.toFixed(2)}px,${py.toFixed(2)}px,0)`;
        });

      };

      const trigger = ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        // The sentence crosses the viewport in one screen of travel. The old
        // +=300% held the pin for three screens, which left two of them blank on
        // every device and made the section feel stuck rather than paced.
        // On a phone the next section used to arrive in the bottom half of the
        // screen while the sentence was still crossing, so the pinned line and
        // the manifesto heading read as one muddled composition. The shorter
        // pin plus the removed overlap below means the hand-off happens once the
        // sentence has left the frame.
        end: () => (window.innerWidth < 768 ? '+=85%' : '+=165%'),
        pin: true,
        anticipatePin: 1,
        onUpdate: (self) => render(self.progress),
        onRefresh: (self) => {
          metrics = letters.map((l) => ({ left: l.offsetLeft, w: l.offsetWidth }));
          placeStickers();
          render(self.progress);
        },
      });

      // The lead is the section's own supporting copy, sitting in the band the
      // hero card leaves beneath itself — so it has to be readable there at rest,
      // not faded in 12% into the pin. It leaves as the marquee stage arrives:
      // by the time the section's top edge reaches the fixed header the lead is
      // gone, so the two never overlap. The exit ends at 10% rather than 0 so the
      // last of it is off screen a full 20–130px above the header, instead of
      // ghosting through it.
      gsap.to(paragraphRef.current, {
        autoAlpha: 0,
        y: -18,
        ease: 'none',
        scrollTrigger: { trigger: section, start: 'top 30%', end: 'top 10%', scrub: true },
      });

      placeStickers();
      render(0);
    }, sectionRef.current);

    return () => ctx.revert();
  }, [reduced]);

  const chars = SENTENCE.split('').map((ch, i) => {
    const isP = i >= P_INDEX && i < P_INDEX + 6 && ch === 'p';
    return (
      <span
        key={i}
        className={`intro-char inline-block will-change-transform ${isP ? 'text-[1.1em]' : ''}`}
        aria-hidden="true"
      >
        {ch === ' ' ? '\u00A0' : ch}
      </span>
    );
  });

  return (
    // The hero is now one full viewport with nothing underneath it, so this
    // section follows on the next scroll with no overlap: its own lead copy is
    // the first thing after the film, then the marquee stage.
    <section id="intro" ref={sectionRef} className="relative bg-cream">
      <div className={reduced ? 'relative' : 'relative h-[100svh] overflow-hidden'}>
        {reduced ? (
          <div className="flex flex-col items-start gap-7 px-[var(--dd-gutter)] pb-[10svh] pt-[clamp(1.25rem,3.2vw,3.5rem)]">
            <p className="display max-w-[1100px] text-[clamp(2.4rem,8vw,6rem)] text-ink">
              we wanna be where the people are
            </p>
            <p className="max-w-[30rem] text-[15px] leading-[1.45] text-ink/75 sm:text-[16px]">
              Every feed has its own rhythm. We plan, write, shoot and cut for the one your audience
              actually scrolls — with the same three people from first call to export.
            </p>
          </div>
        ) : (
          <>
            {/* The lead-in: the section's existing description at the top of the
                pin, so the first thing after the film is the studio's own
                sentence. It is paced out before the fixed header can reach it. */}
            <div className="absolute inset-x-0 top-[clamp(1.25rem,3.2vw,3.5rem)] z-[1] px-[var(--dd-gutter)]">
              <p
                ref={paragraphRef}
                className="max-w-[30rem] text-[15px] leading-[1.45] text-ink/80 sm:text-[16px] sm:leading-[1.4]"
              >
                Every feed has its own rhythm. We plan, write, shoot and cut for the one your audience{' '}
                <em className="serif-i">actually</em> scrolls — with the same three people from first call
                to export.
              </p>
            </div>
            <div
              ref={lineRef}
              className="pointer-events-none absolute left-0 top-[30%] whitespace-nowrap will-change-transform md:top-[36%]"
              style={{ fontSize: 'clamp(3rem,12vw,13rem)' }}
              aria-label={SENTENCE}
            >
              <span className="display relative block text-ink">{chars}</span>

              <div ref={thumbsRef} className="intro-sticker absolute top-[-0.62em]" style={{ left: 0 }}>
                <Sticker kind="thumbsUp" size={SZ.intro} rotate={-8} />
              </div>

              <div
                ref={arrowRef}
                className="intro-sticker absolute top-[-1.22em]"
                style={{ left: 0, width: 'clamp(120px,16vw,240px)' }}
              >
                <LoopArrow className="w-full text-ink" strokeWidth={3.6} />
              </div>

              <div ref={cursorRef} className="intro-sticker absolute top-[1.02em]" style={{ left: 0 }}>
                <Sticker kind="cursor" size={SZ.intro} rotate={-12} />
              </div>

              <div ref={phoneRef} className="intro-sticker absolute top-[-0.5em]" style={{ left: 0 }}>
                <Sticker kind="phone" size={SZ.intro} rotate={10} />
              </div>
            </div>

          </>
        )}
      </div>
    </section>
  );
}
