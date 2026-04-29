import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

type RoomHeaderProps = {
  /** Element rendered in the icon slot, to the left of the title. Typically
   *  the room's themed icon or a compact all-lights toggle. */
  leading: ReactNode;
  title: string;
  subtitle: string;
  /** Where the back arrow points. Defaults to "/". */
  backTo?: string;
  /** Optional trailing slot, rendered on the right (e.g. a gear icon). */
  trailing?: ReactNode;
};

export function RoomHeader({
  leading,
  title,
  subtitle,
  backTo = "/",
  trailing,
}: RoomHeaderProps): JSX.Element {
  return (
    <div className="flex items-center gap-3.5 py-1 pb-5">
      <Link
        to={backTo}
        aria-label="Back"
        className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition hover:text-ink-text active:bg-white/5"
      >
        <ArrowLeft size={22} strokeWidth={2} />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {leading}
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em]">
            {title}
          </h1>
          <div className="mt-0.5 truncate text-[13px] font-medium text-ink-muted">{subtitle}</div>
        </div>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
