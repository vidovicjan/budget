import type { Member } from '../lib/types';
import { initials } from '../lib/shared';

export function Avatar({ member, size = 28, ring }: { member: Pick<Member, 'name' | 'color' | 'status'>; size?: number; ring?: boolean }) {
  return (
    <span
      className={`avatar-m ${member.status === 'invited' ? 'invited' : ''} ${ring ? 'ring' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), ['--m' as string]: member.color }}
      aria-hidden="true"
    >
      {initials(member.name)}
    </span>
  );
}

export function AvatarStack({ members, size = 24, max = 4 }: { members: Member[]; size?: number; max?: number }) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <span className="avatar-stack" aria-label={members.map((m) => m.name).join(', ')} role="img">
      {shown.map((m) => (
        <Avatar key={m.id} member={m} size={size} ring />
      ))}
      {extra > 0 && (
        <span className="avatar-m more ring" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden="true">
          +{extra}
        </span>
      )}
    </span>
  );
}
