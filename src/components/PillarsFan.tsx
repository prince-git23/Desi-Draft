import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { gsap } from '../lib/smooth';
import { usePrefersReducedMotion } from '../lib/hooks';
import { pillars, type Pillar } from '../data/pillars';

/**
 * Five discipline cards, three presentations of one list.
 *
 *  ≥1024: the editorial fan — five overlapping cards, ±6° outwards, hover
 *  separates the row. Geometry is measured from the container, never
 *  hard-coded, so a card can never leave the section.
 *
 *  768–1023: a horizontal snap strip — two cards and a peek; the strip scrolls
 *  itself, so vertical page scrolling is untouched.
 *
 *  <768: an endless horizontal run. Identical copies of the five cards drift
 *  right to left and the tween travels exactly one copy — each carries its own
 *  trailing gap — so the wrap puts copy two's first card where copy one's was:
 *  no seam, no jump, no reset. Touching it pauses the drift; reduced motion
 *  renders one static copy that can be scrolled by hand.
 */

type FanGeometry = {
  mode: 'fan';
  cardW: number;
  step: number;
  /** Maximum rotation, carried by the two outer cards. */
  rot: number;
  drop: number;
  sep: number;
  lift: number;
  /** Text inset, wide enough to clear the neighbour and the rotated corner. */
  pad: number;
  padTop: number;
  padBottom: number;
};

type StripGeometry = { mode: 'strip'; cardW: number; gap: number; pad: number };
type MarqueeGeometry = { mode: 'marquee'; cardW: number; gap: number; pad: number };
type Geometry = FanGeometry | StripGeometry | MarqueeGeometry;

const ASPECT = 1.25; // 4:5 portrait

/** Pixels per second for the phone run. Slow enough to read a card passing. */
const SPEED = 42;

const FALLBACK: Geometry = {
  mode: 'fan',
  cardW: 268,
  step: 230,
  rot: 6,
  drop: 22,
  sep: 32,
  lift: 16,
  pad: 58,
  padTop: 32,
  padBottom: 52,
};

function fanGeometry(cw: number): FanGeometry {
  // The fan only runs at ≥1024, where five cards keep a readable text column;
  // the 14% overlap is what makes it read as one stack rather than five.
  const overlap = 0.14;
  const rot = 6;
  const drop = 22;
  const lift = 16;

  // Reserve the room the row needs when it separates on hover.
  const sepGuess = Math.min(38, cw * 0.025);
  const cardW = Math.round((cw * 0.97 - 2 * sepGuess) / (5 - 4 * overlap));
  const step = Math.round(cardW * (1 - overlap));
  const sep = Math.min(38, cardW * 0.12);
  const h = cardW * ASPECT;
  const corner = (h * Math.sin((rot * Math.PI) / 180)) / 2;
  const pad = Math.round(cardW - step + corner + 10);

  return {
    mode: 'fan',
    cardW,
    step,
    rot,
    drop,
    sep,
    lift,
    pad,
    padTop: Math.round(drop + corner),
    padBottom: Math.round(drop + corner + 8),
  };
}

function measure(cw: number): Geometry {
  if (window.matchMedia('(min-width: 1024px)').matches) return fanGeometry(cw);

  // Tablet: the strip. Phone: the run.
  const phone = window.matchMedia('(max-width: 767px)').matches;
  const cardW = Math.round(phone ? Math.min(cw * 0.8, 300) : Math.min(cw * 0.62, 420));
  return phone
    ? { mode: 'marquee', cardW, gap: 12, pad: 20 }
    : { mode: 'strip', cardW, gap: 12, pad: 24 };
}

export function PillarsFan() {
  const stageRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<ReturnType<typeof gsap.fromTo> | null>(null);
  const reduced = usePrefersReducedMotion();
  const [geo, setGeo] = useState<Geometry>(FALLBACK);
  const [copies, setCopies] = useState(2);
  // Hover and tap are separate on purpose: a tap fires mouseenter first, so one
  // shared value would undo the tap in the same gesture.
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const active = hovered ?? selected;
  // Only the run has a real gap between cards; the fan overlaps and the strip
  // carries its gap in CSS.
  const gapSize = geo.mode === 'fan' ? 12 : geo.gap;

  // One measured source of truth for the layout. Reads are rAF-coalesced so a
  // drag-resize cannot queue a state update per observer callback.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let frame = 0;

    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const cw = stage.clientWidth;
        if (cw > 0) setGeo(measure(cw));
      });
    };

    const ro = new ResizeObserver(read);
    ro.observe(stage);
    window.addEventListener('orientationchange', read);
    read();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('orientationchange', read);
    };
  }, []);

  // How many copies it takes to fill the run plus one full turn.
  useEffect(() => {
    if (geo.mode !== 'marquee' || reduced) return;
    const marquee = marqueeRef.current;
    const track = trackRef.current;
    if (!marquee || !track) return;
    let frame = 0;

    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const unit = track.firstElementChild?.getBoundingClientRect().width ?? 0;
        if (unit < 40) return;
        const need = Math.max(2, Math.ceil(marquee.clientWidth / unit) + 1);
        setCopies((n) => (n === need ? n : need));
      });
    };

    const ro = new ResizeObserver(read);
    ro.observe(marquee);
    ro.observe(track);
    read();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [geo.mode, geo.cardW, gapSize, reduced]);

  // The drift. One turn = one copy's measured width, trailing gap included.
  useEffect(() => {
    if (geo.mode !== 'marquee' || reduced) return;
    const track = trackRef.current;
    const unit = track?.firstElementChild?.getBoundingClientRect().width ?? 0;
    if (!track || unit < 40) return;

    const tween = gsap.fromTo(
      track,
      { x: 0 },
      { x: -unit, duration: unit / SPEED, ease: 'none', repeat: -1 }
    );
    tweenRef.current = tween;

    return () => {
      tween.kill();
      tweenRef.current = null;
      gsap.set(track, { x: 0 });
    };
  }, [geo.mode, geo.cardW, gapSize, copies, reduced]);

  const pause = () => tweenRef.current?.pause();
  const play = () => tweenRef.current?.play();

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || reduced) return;

    // Entrance over the first copy only: the rest arrive already in place, so
    // the run never shows a second staggered wave flickering past.
    const firstSet = stage.querySelector('.pillars-set') ?? stage.querySelector('.pillars');
    const inners = firstSet?.querySelectorAll('.pillar-inner');
    if (!inners?.length) return;

    const ctx = gsap.context(() => {
      gsap.from(inners, {
        y: 54,
        autoAlpha: 0,
        scale: 0.94,
        rotate: (i: number) => (i - 2) * 2.5,
        duration: 0.85,
        ease: 'back.out(1.4)',
        stagger: 0.08,
        scrollTrigger: { trigger: stage, start: 'top 84%', once: true },
      });
    }, stage);

    return () => ctx.revert();
  }, [reduced]);

  const marquee = geo.mode === 'marquee';
  const fan = geo.mode === 'fan';
  const setCount = marquee ? (reduced ? 1 : copies) : 1;

  const card = (p: Pillar, i: number, dup: boolean) => {
    const isActive = active === i;
    // Fan offsets. A card that is not active steps away from the active one;
    // the extremes keep their reserved gutter, so nothing crosses the edge.
    const off = i - 2;
    const dx = !fan || active === null || isActive ? 0 : i < active ? -geo.sep : geo.sep;
    const dy = fan ? (isActive ? -geo.lift : Math.abs(off) * geo.drop) : 0;
    const rot = !fan || isActive ? 0 : off * (geo.rot / 2);
    const scale = fan && isActive ? 1.035 : 1;

    return (
      <li
        key={p.id}
        className="pillar-slot"
        style={{ marginLeft: fan && i > 0 ? -(geo.cardW - geo.step) : 0 }}
      >
        <button
          type="button"
          className="pillar"
          style={
            {
              '--accent': p.accent,
              '--dx': `${dx}px`,
              '--dy': `${dy}px`,
              '--rot': `${rot}deg`,
              '--sc': scale,
              '--z': fan ? 5 - Math.abs(off) : 1,
            } as CSSProperties
          }
          data-active={isActive ? 'true' : undefined}
          aria-pressed={dup ? undefined : selected === i}
          aria-label={`${p.no} ${p.title} — ${p.copy}`}
          tabIndex={dup ? -1 : undefined}
          onClick={() => setSelected((s) => (dup ? s : s === i ? null : i))}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(i)}
          onBlur={() => setHovered(null)}
        >
          <span className="pillar-inner">
            <img
              src={p.image}
              alt={dup ? '' : p.alt}
              width={880}
              height={1100}
              loading={i < 2 ? 'eager' : 'lazy'}
              decoding="async"
              className="pillar-img"
              style={{ objectPosition: p.position }}
            />
            <span className="pillar-veil" aria-hidden="true" />
            <span className="pillar-text">
              <span className="flex items-center gap-2 text-cream/70">
                <span className="pillar-no">{p.no}</span>
                <span className="pillar-rule" aria-hidden="true" />
              </span>
              <span className="pillar-title display mt-1.5 block text-cream">{p.title}</span>
              <span className="pillar-copy serif-i mt-1 block text-cream/90">{p.copy}</span>
            </span>
          </span>
        </button>
      </li>
    );
  };

  const vars = {
    '--card-w': `${geo.cardW}px`,
    '--text-pad': `${geo.pad}px`,
    '--pillar-gap': `${gapSize}px`,
  } as CSSProperties;

  return (
    <div ref={stageRef} className="pillars-stage">
      {marquee ? (
        <div
          ref={marqueeRef}
          className="pillars-marquee"
          data-mode="marquee"
          data-motion={reduced ? 'off' : 'on'}
          onMouseEnter={pause}
          onMouseLeave={play}
          onPointerDown={pause}
          onPointerUp={play}
          onPointerCancel={play}
          onFocusCapture={pause}
          onBlurCapture={play}
        >
          <div ref={trackRef} className="pillars-track">
            {Array.from({ length: setCount }, (_, c) => (
              <ul
                key={c}
                className="pillars-set"
                role="list"
                aria-hidden={c > 0 ? true : undefined}
                style={vars}
              >
                {pillars.map((p, i) => card(p, i, c > 0))}
              </ul>
            ))}
          </div>
        </div>
      ) : (
        <ul
          className="pillars no-scrollbar"
          data-mode={geo.mode}
          role="list"
          style={
            {
              ...vars,
              paddingTop: fan ? `${geo.padTop}px` : undefined,
              paddingBottom: fan ? `${geo.padBottom}px` : undefined,
            } as CSSProperties
          }
        >
          {pillars.map((p, i) => card(p, i, false))}
        </ul>
      )}
    </div>
  );
}
