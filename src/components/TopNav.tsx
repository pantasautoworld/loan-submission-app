import Link from "next/link";
import { logout } from "@/app/login/actions";
import { initialsOf } from "@/lib/avatar";

interface Props {
  staffName: string;
  /** Shows the "Manage Staff" link when "admin". */
  role?: string;
  /** Breadcrumb trail after "Applications", e.g. ["New Submission"]. */
  breadcrumb?: string[];
}

export function TopNav({ staffName, role, breadcrumb = [] }: Props) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-panel">
      <div className="flex items-center justify-between px-6 py-3">
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/" className="flex items-center gap-2 font-semibold text-fg">
            <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-amber">
              <span className="h-2 w-2 rounded-full bg-bg" />
            </span>
            Applications
          </Link>
          {breadcrumb.map((label, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="text-muted">/</span>
              <span
                className={i === breadcrumb.length - 1 ? "font-semibold text-fg" : "text-muted"}
              >
                {label}
              </span>
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-amber-dim py-1 pl-1 pr-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber text-xs font-semibold text-amber-fg">
              {initialsOf(staffName)}
            </span>
            <span className="text-sm font-medium text-amber">{staffName}</span>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-amber hover:text-fg"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="flex items-center gap-5 border-t border-line px-6 py-2 text-xs font-medium text-muted">
        <Link href="/submissions" className="hover:text-amber">
          Submissions
        </Link>
        <Link href="/submissions/new" className="hover:text-amber">
          New Submission
        </Link>
        <Link href="/stock-board" className="hover:text-amber">
          Stock Board
        </Link>
        {role === "admin" && (
          <Link href="/staff" className="hover:text-amber">
            Manage Staff
          </Link>
        )}
      </div>
    </header>
  );
}
