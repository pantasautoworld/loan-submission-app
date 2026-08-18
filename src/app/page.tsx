import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";

export default async function HomePage() {
  const { profile } = await requireStaff();

  return (
    <div className="flex flex-1 flex-col">
      <TopNav staffName={profile.full_name} role={profile.role} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-6">
        <h1 className="font-display text-xl text-fg">Welcome, {profile.full_name || "there"}</h1>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/submissions/new"
            className="group rounded-[10px] border border-line bg-panel p-5 transition-colors hover:border-amber"
          >
            <div className="mb-3 flex h-24 w-24 items-center justify-center rounded-[9px] bg-amber/15 transition-colors group-hover:bg-amber/25">
              <svg viewBox="0 0 48 48" className="h-20 w-20">
                <path
                  d="M17 5h9l6 6v13a2 2 0 0 1-2 2H17a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
                  fill="#d6e6ff"
                  stroke="#0f1115"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
                <path
                  d="M26 5v5a1 1 0 0 0 1 1h5"
                  fill="none"
                  stroke="#0f1115"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
                <path
                  d="M21.5 22v-8m0 0-3 3m3-3 3 3"
                  fill="none"
                  stroke="#0f1115"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect
                  x="4"
                  y="29"
                  width="29"
                  height="12"
                  rx="4"
                  fill="#6EE7B7"
                  stroke="#0f1115"
                  strokeWidth="2.2"
                />
                <text
                  x="8.5"
                  y="38"
                  fontFamily="Arial, Helvetica, sans-serif"
                  fontWeight="700"
                  fontSize="8.5"
                  fill="#0f1115"
                >
                  SUBMIT
                </text>
                <path
                  d="M33 37.5 44 42l-4.5 1.8L37.5 48Z"
                  fill="#d6e6ff"
                  stroke="#0f1115"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 className="font-medium text-fg">New Submission</h2>
            <p className="mt-1 text-sm text-muted">
              Start a new hirer/guarantor loan submission.
            </p>
          </Link>
          <Link
            href="/submissions"
            className="group rounded-[10px] border border-line bg-panel p-5 transition-colors hover:border-amber"
          >
            <div className="mb-3 flex h-24 w-24 items-center justify-center rounded-[9px] bg-sync/15 transition-colors group-hover:bg-sync/25">
              <svg viewBox="0 0 48 48" className="h-20 w-20">
                <rect x="3" y="4" width="20" height="9" rx="3" fill="#6b70e6" stroke="#0f1115" strokeWidth="2.2" />
                <rect x="5.5" y="6.5" width="10" height="1.8" rx="0.9" fill="#9ea3f2" />
                <circle cx="17" cy="8.5" r="1" fill="#0f1115" />
                <circle cx="19.3" cy="8.5" r="1" fill="#0f1115" />
                <circle cx="21.6" cy="8.5" r="1" fill="#0f1115" />

                <rect x="3" y="14" width="20" height="9" rx="3" fill="#6b70e6" stroke="#0f1115" strokeWidth="2.2" />
                <rect x="5.5" y="16.5" width="10" height="1.8" rx="0.9" fill="#9ea3f2" />
                <circle cx="17" cy="18.5" r="1" fill="#0f1115" />
                <circle cx="19.3" cy="18.5" r="1" fill="#0f1115" />
                <circle cx="21.6" cy="18.5" r="1" fill="#0f1115" />

                <rect x="3" y="24" width="20" height="9" rx="3" fill="#6b70e6" stroke="#0f1115" strokeWidth="2.2" />
                <rect x="5.5" y="26.5" width="10" height="1.8" rx="0.9" fill="#9ea3f2" />
                <circle cx="17" cy="28.5" r="1" fill="#0f1115" />
                <circle cx="19.3" cy="28.5" r="1" fill="#0f1115" />
                <circle cx="21.6" cy="28.5" r="1" fill="#0f1115" />

                <path
                  d="M23 29h19a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H23z"
                  fill="#c7c2cf"
                  stroke="#0f1115"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />

                <path
                  d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"
                  transform="translate(20 -6) scale(1.3)"
                  fill="#bfe6fa"
                  stroke="#0f1115"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />

                <path
                  d="M31 22 31 14 27 14 33 6 39 14 35 14 35 22 Z"
                  fill="#2ee6b0"
                  stroke="#0f1115"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 className="font-medium text-fg">Submissions</h2>
            <p className="mt-1 text-sm text-muted">
              View past submissions and download generated PDFs.
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
