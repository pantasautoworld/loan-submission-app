import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div
      className="flex flex-1 items-center justify-center p-6"
      style={{
        background:
          "radial-gradient(circle at 20% 15%, rgba(245,166,35,0.08), transparent 40%), var(--bg)",
      }}
    >
      <form
        action={login}
        className="w-full max-w-sm space-y-5 rounded-[10px] border border-line bg-panel p-8"
      >
        <div className="mb-1 flex justify-center">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-amber">
            <span className="h-2.5 w-2.5 rounded-full bg-bg" />
          </span>
        </div>

        <div className="text-center">
          <h1 className="text-lg font-semibold text-fg">Pantas Autoworld</h1>
          <p className="text-sm text-muted">Sign in to your staff account</p>
        </div>

        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div>
          <label
            htmlFor="username"
            className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted"
          >
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            className="w-full rounded-[7px] border border-line bg-panel-raised px-3 py-2.5 text-sm text-fg outline-none focus:border-amber"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-[7px] border border-line bg-panel-raised px-3 py-2.5 text-sm text-fg outline-none focus:border-amber"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-[7px] bg-amber px-3 py-2.5 text-sm font-semibold text-amber-fg hover:brightness-110"
        >
          Sign in
        </button>

        <p className="text-xs leading-relaxed text-muted">
          No account? Ask an admin to add you under Manage Staff.
        </p>
      </form>
    </div>
  );
}
