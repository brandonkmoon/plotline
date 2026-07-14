# Release Runbook — v1.2.1 + server + web

The `fix/review-pass-1` batch (both repos). Follow the phases in order. Nothing
below is deployed until you do it deliberately.

## Where things stand right now

- **Live iOS:** 1.2.0 build 8 (released May 2026). NOT over-the-air-updatable.
- **Live server:** old PartyKit code — still trusts the client `isPremium` flag.
- **Live web:** old code on plotlinegame.com.
- **The fixes:** committed on branch `fix/review-pass-1` in BOTH repos. Not merged, not deployed.
- **1.2.1 build:** in progress (build 10). First OTA-capable build.

## Phase 1 — Test the 1.2.1 build (do before releasing anything)

Install the 1.2.1 build from **TestFlight** on your iPhone. To test multiplayer
solo, open plotlinegame.com in 3–4 laptop browser tabs as the other players
(they share the live server, so they can join the same room code).

Checklist — **do this → expect this:**

- [ ] **Rejoin:** create a room on the phone, force-quit the app, reopen, tap "Rejoin" → drops back into the room (not stuck on "Connecting…").
- [ ] **Share link cold:** create a room on the laptop, tap its `plotlinegame.com/join/CODE` link on the phone after force-quitting → app opens and connects.
- [ ] **Play Again:** finish a classic game (phone + browser tabs), host taps "Play Again" → everyone moves to a fresh lobby.
- [ ] **Swipe-to-leave:** mid-game, swipe from the left edge → shows leave confirmation, does NOT silently drop you. At the End screen, swipe works normally.
- [ ] **Reveal:** finish a game, reveal all stories → every line reveals, no stall.
- [ ] **Room full:** 10 players in, 11th tries → clear "room is full" message.
- [ ] **Purchases** (needs Producer/sandbox account): cancel a purchase → no error popup; complete a sandbox purchase → success message.

NOTE: buying does NOT unlock competitive yet against the live server — that half
is validated in Phase 3. Don't treat it as a bug now.

## Phase 2 — Release the iOS app

If Phase 1 passes:

1. App Store Connect → create the **1.2.1** version, attach **build 10**.
2. Submit for review; release when approved.
3. This makes 1.2.1 your **first OTA-capable build live**. From now on, JS-only
   fixes ship with `eas update --channel production` — no Apple review.

Let 1.2.1 sit live for a few days so Producer users auto-update before Phase 3
(minimizes the premium gap below).

## Phase 3 — Deploy server + web (timing matters)

Most server fixes are compatible with old clients and could ship anytime. The
**premium change is the exception**: once the new server is live, only 1.2.1+
clients can unlock competitive. Producer users still on 1.2.0 build 8 will have
competitive locked until they update (and 1.2.0 can't OTA — they must update via
the App Store). That's why Phase 2 waits a few days first.

When ready:

1. **Set the RevenueCat secret on PartyKit** (from the web project dir), if not done:
   ```
   npx partykit env add REVENUECAT_API_KEY   # a RevenueCat *secret* v1 key
   npx partykit env list                     # confirm it's there
   ```
2. **Merge the branch** to `main` in both repos.
3. **Deploy the server:** `npx partykit deploy` (from web dir). Activates server-side premium verification.
4. **Deploy web:** push `main` → Vercel auto-deploys.
5. **Validate premium:** on your 1.2.1 phone with your Producer account, create a room → competitive should be available. If not: recheck `npx partykit env list` and the RevenueCat key type (secret, not the public `appl_` SDK key). Fixable via OTA if the client side is off.

## Phase 4 — After this release

Future JS/app changes: `eas update --channel production` (OTA, minutes, no Apple).
Server changes: `npx partykit deploy`. Web: push to `main`.

## Rollback

- **iOS:** publish a corrective `eas update` (1.2.1 is OTA-capable), or republish the previous update.
- **Server:** `npx partykit deploy` from a previous commit.
- **Web:** instant rollback in the Vercel dashboard.

## Deliberately NOT in this release (separate future work)

- **Archive endpoint auth** — needs an `ARCHIVE_SECRET` shared between Vercel and PartyKit. Do as its own small release.
- **onConnect identity rework** — too risky to change without careful testing.
- **Next.js 14 → 16 upgrade** (EOL, unpatched CVEs) and **PartyKit → PartyServer migration** (PartyKit frozen). Scheduled work.
- **Monorepo / shared package** — the root cause behind web/mobile drift.

See the full review (228 findings) for the complete backlog.
