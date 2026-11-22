import { test } from "node:test";
import assert from "node:assert/strict";
import { audioStorageKeys, articleAudioRevision } from "../src/lib/audio-storage";
test("unchanged articles keep both legacy keys", () => {
  assert.deepEqual(audioStorageKeys("slug", "/old.mp3"), {audio: "kalam-audio:slug", position: "kalam-audio-pos:slug"});
});
test("replacement ignores legacy audio and position", () => {
  const old = audioStorageKeys("slug", "/old.mp3");
  const fresh = audioStorageKeys("slug", "/new.mp3", "recording-sha256");
  assert.notEqual(fresh.audio, old.audio); assert.notEqual(fresh.position, old.position);
});
test("same revision restores while changed revision or source is isolated", () => {
  const a = audioStorageKeys("slug", "/new.mp3", "v1");
  assert.deepEqual(a, audioStorageKeys("slug", "/new.mp3", "v1"));
  for (const other of [audioStorageKeys("slug", "/new.mp3", "v2"), audioStorageKeys("slug", "/other.mp3", "v1"), audioStorageKeys("other", "/new.mp3", "v1")]) {
    assert.notEqual(a.audio, other.audio); assert.notEqual(a.position, other.position);
  }
});
test("separators in identities cannot collide", () => {
  assert.notDeepEqual(audioStorageKeys("a:b", "d", "c"), audioStorageKeys("a", "d", "b:c"));
});

test("revision rollout is limited to the chosen article and changes with generation", () => {
  const first = new Date("2026-11-22T14:00:00Z");
  const next = new Date("2026-11-22T15:00:00Z");
  assert.equal(articleAudioRevision("other-article", first), undefined);
  assert.equal(articleAudioRevision("cmve6n9kf0001l607sstryfn0", first), first.toISOString());
  assert.notEqual(articleAudioRevision("cmve6n9kf0001l607sstryfn0", first), articleAudioRevision("cmve6n9kf0001l607sstryfn0", next));
  assert.equal(articleAudioRevision("cmve6n9kf0001l607sstryfn0", null), "recording-aware-v1");
});
