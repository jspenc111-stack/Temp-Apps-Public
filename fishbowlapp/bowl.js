// Everything that talks to Firebase: sign-in, the live listener, and the
// transactions that change a bowl. The game rules themselves live in
// fish-rules.js; this file just reads the latest bowl, applies a rule, and
// saves the result as one step.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore, doc, onSnapshot, runTransaction, getDoc, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import * as R from './fish-rules.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const roomRef = (code) => doc(db, 'rooms', code);

let signingIn = null;
// Anonymous sign-in: invisible to the user, but lets the database rules
// reject traffic that isn't from the app. A phone that signed in before is
// remembered, so it can start listening without another trip to the server.
export function ensureSignedIn() {
  if (!signingIn) {
    signingIn = auth.authStateReady()
      .then(() => auth.currentUser || signInAnonymously(auth).then((cred) => cred.user))
      .catch((e) => { signingIn = null; throw e; });
  }
  return signingIn;
}
// Start signing in as soon as this file loads, alongside everything else.
ensureSignedIn().catch(() => {});

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

// Firestore → plain object the game rules understand.
function fromFirestore(data) {
  return {
    createdAt: data.createdAt ?? null,
    lastFedAt: data.lastFedAt ?? null,
    lastFedBy: data.lastFedBy ?? null,
    feedLog: Array.isArray(data.feedLog) ? data.feedLog : [],
    fish: data.fish && typeof data.fish === 'object' ? data.fish : {},
    hearts: Array.isArray(data.hearts) ? data.hearts : [],
    week: data.week ?? null,
    lastWeek: data.lastWeek ?? null,
    record: data.record ?? null
  };
}

// Plain object → what we save. createdAt is passed through untouched (the
// rules require it never changes); lastFedAt is stored as a timestamp.
function toFirestore(room) {
  return {
    createdAt: room.createdAt,
    lastFedAt: typeof room.lastFedAt === 'number' ? Timestamp.fromMillis(room.lastFedAt) : (room.lastFedAt ?? null),
    lastFedBy: room.lastFedBy ?? null,
    feedLog: room.feedLog,
    fish: room.fish,
    hearts: room.hearts ?? [],
    // The blame board fields only appear once there's something in them.
    ...(room.week ? { week: room.week } : {}),
    ...(room.lastWeek ? { lastWeek: room.lastWeek } : {}),
    ...(room.record ? { record: room.record } : {})
  };
}

// Make a new bowl with a random, unused code.
export async function createRoom() {
  await ensureSignedIn();
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = R.makeRoomCode(randomBytes(R.ROOM_CODE_LENGTH));
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef(code));
        if (snap.exists()) throw new R.RuleError('taken', 'Code taken');
        tx.set(roomRef(code), { ...R.emptyRoom(), createdAt: serverTimestamp() });
      });
      return code;
    } catch (e) {
      if (e.code !== 'taken') throw e;
    }
  }
  throw new Error('Could not find a free room code. Please try again.');
}

export async function roomExists(code) {
  await ensureSignedIn();
  const snap = await getDoc(roomRef(code));
  return snap.exists();
}

// Live updates: calls onData(room | null) whenever anyone changes the bowl.
export function watchRoom(code, onData, onError) {
  let stop = () => {};
  let cancelled = false;
  ensureSignedIn().then(() => {
    if (cancelled) return;
    stop = onSnapshot(roomRef(code), { includeMetadataChanges: false }, (snap) => {
      onData(snap.exists() ? fromFirestore(snap.data()) : null);
    }, onError);
  }, onError);
  return () => { cancelled = true; stop(); };
}

// Read the latest bowl, apply `change`, save — as one transaction, so two
// friends tapping at the same moment can't overwrite each other.
// `at` is the moment of the tap. The phone already showed the change using
// the same time, so the saved result matches what's on screen.
async function change(code, at, fn) {
  await ensureSignedIn();
  for (let attempt = 1; ; attempt++) {
    try {
      return await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef(code));
        if (!snap.exists()) throw new R.RuleError('missing', 'This bowl no longer exists');
        const result = fn(fromFirestore(snap.data()), at);
        if (result.write !== false) tx.set(roomRef(code), toFirestore(result.room));
        return result;
      });
    } catch (e) {
      // If a friend saved at the same instant, the database can refuse our
      // save because it was built on an older copy of the feed log. Trying
      // again (after a short random pause) re-reads the latest bowl.
      if (e.code !== 'permission-denied' || attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 50 * attempt + Math.random() * 150));
    }
  }
}

// `id` is picked on the phone, so the phone and the database make the same fish.
export function addFish(code, nickname, id, at) {
  return change(code, at, (room, now) =>
    R.addFish(room, { id, by: nickname, now, rand: R.seededRandom(id) })
  );
}

export function feed(code, nickname, fishId, at) {
  return change(code, at, (room, now) => R.feed(room, { fishId, by: nickname, now }));
}

// ❤️ Send love to everyone (fishId = null) or to one fish.
export function sendHeart(code, nickname, fishId, at) {
  return change(code, at, (room, now) => R.sendHeart(room, { fishId, by: nickname, now }));
}

// Record starvations and remove long-dead fish. Only writes if needed.
export function housekeeping(code) {
  return change(code, Date.now(), (room, now) => {
    const res = R.recordDeaths(room, now);
    return { ...res, write: res.changed };
  });
}
