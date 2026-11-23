import type { CSSProperties } from 'react';
import { MASCOT_ART } from '../lib/mascotArt';
import type { MascotInfo, MascotPose } from '../lib/mascots';

const tint = (m: MascotInfo): CSSProperties => ({ background: m.tint });

/** Full-body mascot on its tinted panel. Decorative: the text next to it says the same thing. */
export function Mascot({ mascot, pose = 'wave', animated = false, className = '' }: { mascot: MascotInfo; pose?: MascotPose; animated?: boolean; className?: string }) {
  return (
    <span className={`mascot ${className}`} style={tint(mascot)} aria-hidden="true">
      {/* Keyed so a new pose restarts its animation. The markup is our own static artwork. */}
      <svg
        key={`${mascot.id}-${pose}`}
        viewBox="0 0 240 280"
        className={animated ? `mk-anim mk-${pose}` : undefined}
        dangerouslySetInnerHTML={{ __html: MASCOT_ART[mascot.id].full[pose] }}
      />
    </span>
  );
}

/** Round head crop, used as an avatar. */
export function MascotHead({ mascot, size }: { mascot: MascotInfo; size: number }) {
  const art = MASCOT_ART[mascot.id];
  return (
    <span className="mascot-head" style={{ ...tint(mascot), width: size, height: size }} aria-hidden="true">
      <svg viewBox={art.headBox} dangerouslySetInnerHTML={{ __html: art.head }} />
    </span>
  );
}
