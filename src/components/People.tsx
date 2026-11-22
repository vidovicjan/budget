import type { Member } from '../lib/types';
import { initials } from '../lib/shared';

type AvatarMember = Pick<Member, 'name' | 'color' | 'status'> & { photo?: string };

export function Avatar({ member, size = 28, ring }: { member: AvatarMember; size?: number; ring?: boolean }) {
  const cls = `avatar-m ${member.status === 'invited' && !member.photo ? 'invited' : ''} ${member.photo ? 'photo' : ''} ${ring ? 'ring' : ''}`;
  return (
    <span className={cls} style={{ width: size, height: size, fontSize: Math.round(size * 0.4), ['--m' as string]: member.color }} aria-hidden="true">
      {member.photo ? <img src={member.photo} alt="" draggable={false} /> : initials(member.name)}
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

/** Reads an image file, crops it to a centred square and shrinks it to a small JPEG data URL. */
export async function imageToAvatar(file: File, size = 160): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file (JPG, PNG or WebP).');
  if (file.size > 20 * 1024 * 1024) throw new Error('That image is larger than 20 MB.');
  // Read as a data: URL (the app's security policy blocks blob: images).
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
  {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't read that image."));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Couldn't process that image.");
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  }
}
