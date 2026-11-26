import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBrokerSheet, findActiveBroker } from "@/lib/brokerSheet";
import { BrokerStockView } from "@/components/brokerSheet/BrokerStockView";

// A broker's personal stock page. No staff login: the secret key in the URL is the access
// check, and blocking the broker on /broker-sheet makes this page refuse at once.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stock List",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function BrokerStockPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const admin = createAdminClient();
  const broker = await findActiveBroker(admin, key);

  if (!broker) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <div>
          <h1 className="font-display text-xl font-semibold text-fg">This link is not active</h1>
          <p className="mt-2 text-sm text-muted">Please contact us for a new link.</p>
        </div>
      </main>
    );
  }

  let sheet;
  try {
    sheet = await buildBrokerSheet(admin);
  } catch {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-sm text-muted">The stock list is temporarily unavailable. Please try again in a minute.</p>
      </main>
    );
  }

  return <BrokerStockView sheet={sheet} brokerName={broker.name} excelPath={`/broker/${key}/excel`} />;
}
