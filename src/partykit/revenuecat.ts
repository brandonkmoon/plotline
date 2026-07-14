// Server-side verification of the "Producer" entitlement.
//
// Competitive mode must never be granted on the client's say-so. The host's
// app sends its RevenueCat App User ID with JOIN_ROOM; the room verifies the
// entitlement against RevenueCat's REST API using a SECRET key stored in the
// PartyKit environment (never shipped to any client).
//
// Set the key once with:  npx partykit env add REVENUECAT_API_KEY
// (use a RevenueCat *secret* v1 API key). Without it, premium is denied.

const ENTITLEMENT_ID = "Plotline: The Party Game Pro";
const SUBSCRIBERS_URL = "https://api.revenuecat.com/v1/subscribers/";

/**
 * Returns true only if RevenueCat confirms `appUserId` currently holds the
 * Producer entitlement. Fails closed: any missing key, network error, non-200
 * response, or absent entitlement returns false.
 */
export async function verifyProducerEntitlement(
  env: Record<string, unknown>,
  appUserId: string
): Promise<boolean> {
  const apiKey = typeof env?.REVENUECAT_API_KEY === "string" ? env.REVENUECAT_API_KEY : "";
  if (!apiKey) {
    console.warn(
      "[revenuecat] REVENUECAT_API_KEY is not set — denying premium (fail-closed)"
    );
    return false;
  }
  if (!appUserId) return false;

  try {
    const res = await fetch(SUBSCRIBERS_URL + encodeURIComponent(appUserId), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      console.warn(`[revenuecat] subscriber lookup returned ${res.status}`);
      return false;
    }

    const data = (await res.json()) as {
      subscriber?: {
        entitlements?: Record<string, { expires_date?: string | null }>;
      };
    };

    const entitlement = data.subscriber?.entitlements?.[ENTITLEMENT_ID];
    if (!entitlement) return false;

    // A lifetime non-consumable has expires_date === null → always active.
    // A dated entitlement is active only while its expiry is in the future.
    const expires = entitlement.expires_date;
    return expires == null || new Date(expires).getTime() > Date.now();
  } catch (err) {
    console.warn("[revenuecat] verification error:", err);
    return false;
  }
}
