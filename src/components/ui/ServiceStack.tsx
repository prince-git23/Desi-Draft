import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ServiceGroup } from '../../data/site';
import Stack from './Stack';
import './ServiceStack.css';

/**
 * ServiceStack — the five services as one tactile deck, for phones only.
 *
 * The data is `serviceGroups`, untouched: every card prints the real number,
 * title, photograph, description, feature list and evidence link from that one
 * source. Nothing here invents a service or a claim.
 *
 * The deck's height is measured, never guessed. A hidden layer renders the same
 * card at the same width (minus the images, which the media box reserves by
 * aspect ratio), the tallest of the five wins, and the deck is given exactly
 * that height. That is what keeps the longest service — content production has
 * seven features — from being clipped at 320 as well as at 430.
 */

/** Crop anchor per photograph, so a 16:10 band keeps the subject in frame. */
const FRAMING: Record<string, string> = {
  production: '50% 46%',
  strategy: '50% 36%',
  digital: '50% 55%',
  visual: '50% 62%',
  spaces: '50% 50%',
};

/** Room above the deck for the two cards that peek out behind it. */
const DECK_ROOM = 52;

function ServiceCard({ item, measure = false }: { item: ServiceGroup; measure?: boolean }) {
  const href = item.evidence ? `/work/${item.evidence.slug}` : '/work';
  const label = item.evidence ? `see ${item.evidence.label}` : 'see the work';

  return (
    <article className="svc-card" style={{ '--svc-accent': item.color } as CSSProperties}>
      <div className="svc-card__media">
        {measure ? null : (
          <img
            src={item.image}
            alt={item.imageAlt}
            width={880}
            height={1100}
            loading="lazy"
            decoding="async"
            draggable={false}
            style={{ objectPosition: FRAMING[item.id] ?? '50% 50%' }}
          />
        )}
      </div>
      <div className="svc-card__body">
        <p className="svc-card__no">
          <span className="svc-card__number">{item.no}</span>
          <span className="svc-card__rule" aria-hidden="true" />
        </p>
        <h3 className="display svc-card__title">{item.title}</h3>
        <p className="svc-card__desc">{item.lede}</p>
        <ul className="svc-card__features">
          {item.items.map((feature) => (
            <li key={feature}>
              <span className="svc-card__dot" aria-hidden="true">
                ✦
              </span>
              {feature}
            </li>
          ))}
        </ul>
        {/* The measuring copy renders the same block without a link, so the
            hidden layer adds no focus stops and no second set of URLs. */}
        {measure ? (
          <span className="svc-card__link" aria-hidden="true">
            {label}
            <span className="btn-arrow">→</span>
          </span>
        ) : (
          <Link to={href} className="svc-card__link">
            {label}
            <span className="btn-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        )}
      </div>
    </article>
  );
}

export function ServiceStack({ items }: { items: ServiceGroup[] }) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(0);
  const [top, setTop] = useState(0);

  useLayoutEffect(() => {
    const layer = measureRef.current;
    if (!layer) return;
    let frame = 0;

    // The probe box carries the same 3px frame as the real card, so its height
    // is already the outer height the deck needs. Two pixels of slack absorb
    // the sub-pixel rounding that would otherwise shave a line off the tallest
    // card.
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const heights = [...layer.querySelectorAll<HTMLElement>('.svc-stack__probe')].map(
          (probe) => probe.getBoundingClientRect().height
        );
        const next = heights.length ? Math.ceil(Math.max(...heights)) + 2 : 0;
        if (next > 0) setCardH((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
      });
    };

    const ro = new ResizeObserver(read);
    ro.observe(layer);
    layer.querySelectorAll('.svc-stack__probe').forEach((probe) => ro.observe(probe));
    read();
    void document.fonts?.ready.then(read);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  const position = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="svc-stack">
      <div className="svc-stack__head">
        <p className="svc-stack__pos" aria-live="polite">
          <span>{position(top + 1)}</span> / {position(items.length)}
        </p>
        <p className="svc-stack__hint">Swipe to explore</p>
      </div>

      <div ref={measureRef} className="svc-stack__measure" aria-hidden="true">
        {items.map((item) => (
          <div className="svc-stack__probe" key={item.id}>
            <ServiceCard item={item} measure />
          </div>
        ))}
      </div>

      <div className="svc-stack__deck" style={{ '--svc-deck-room': `${DECK_ROOM}px` } as CSSProperties}>
        {cardH > 0 && (
          <Stack
            layout="deck"
            visible={3}
            spread={0.65}
            depth={0.25}
            radius={18}
            frame={3}
            frameColor="#f3eee5"
            shadow
            tilt={8}
            threshold={55}
            speed={1.1}
            sendToBackOnClick
            autoplay={false}
            onChange={setTop}
            style={{ height: cardH }}
            className="svc-stack__deck-inner"
            cards={items.map((item) => (
              <ServiceCard key={item.id} item={item} />
            ))}
          />
        )}
      </div>
    </div>
  );
}
