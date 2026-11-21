import type { SyncProvider } from './provider';

/**
 * Cloud sync — NOT ACTIVE YET. This file is the plan and the place to build it.
 *
 * Setup (later):
 *   npm i firebase
 *   Firebase project with Authentication (Google + email link) and Cloud Firestore.
 *   In Electron, Firestore traffic must be allowed: add the Firebase hosts to the CSP
 *   `connect-src` in vite.config.ts (firestore.googleapis.com, *.firebaseio.com,
 *   identitytoolkit.googleapis.com, securetoken.googleapis.com).
 *
 * Firestore layout:
 *   users/{uid}                              { name, email, spaces: [spaceId] }
 *   spaces/{spaceId}                         { name, kind, color, ownerUid, memberUids: [uid] }
 *   spaces/{spaceId}/{collection}/{id}       one document per record, collections from
 *                                            COLLECTIONS in src/sync/records.ts, plus
 *                                            `settings/main` — each with `updatedAt`
 *                                            (serverTimestamp) and `deleted: boolean`
 *   invites/{code}                           { spaceId, memberId, createdBy, expiresAt }
 *
 * Security rules (sketch):
 *   match /spaces/{s}/{document=**} {
 *     allow read, write: if request.auth.uid in get(/databases/$(db)/documents/spaces/$(s)).data.memberUids;
 *   }
 *   invites: readable by anyone signed in who has the code; accepting one adds their uid to
 *   memberUids (do this in a Cloud Function so people can't add themselves elsewhere).
 *
 * Client behaviour:
 *   subscribe(): onSnapshot on each collection → build an AppData of remote records →
 *                mergeSpaces(local, remote) → store. Deleted docs become `data.deleted`.
 *   push():      diff with the last pushed state (the store already stamps `updatedAt` and
 *                logs deletions) → batched writes of changed docs.
 *   invite():    create invites/{code} for a member → share link budgettracker://join/{code}
 *                (register the protocol with app.setAsDefaultProtocolClient in main.cjs).
 *   Member.uid gets set when someone accepts; Member.status → 'active'.
 *
 * Nothing in the UI needs to change: SpaceSync.mode becomes 'cloud' and getProvider()
 * in src/sync/provider.ts returns this provider for that space.
 */

export const firebaseProvider: SyncProvider | null = null;
