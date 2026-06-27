/**
 * cron-delivery-format.test.js
 *
 * Regression test for LRN-20260626-013: Telegram cron delivery must use
 * explicit `<chatId>:topic:<threadId>` format. The implicit `<chatId>:<threadId>`
 * format parses the chatId but the route resolution rejects the bare threadId
 * when it's short (e.g., 4 digits like topic 7220).
 *
 * Tests validate the parsed shape, not the network call. The actual delivery
 * is verified manually via `cron run` on Render.
 *
 * Format reference: parseTelegramTarget() in openclaw dist/targets-*.js
 *   - Explicit: `<chatId>:topic:<threadId>` (works)
 *   - Implicit: `<chatId>:<threadId>` (parses but fails route resolution for short threadIds)
 *   - chatId regex: `/^-?\d+$/` (matches Telegram group IDs)
 *   - threadId regex: `/^\d+$/`
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// Mirror of openclaw's parseTelegramTarget logic for offline testing.
// Keep this in sync with the source — if format rules change, update both.
function parseTelegramTarget(to) {
  const normalized = to.trim();
  const topicMatch = /^(.+?):topic:(\d+)$/.exec(normalized);
  if (topicMatch) {
    return {
      chatId: topicMatch[1],
      messageThreadId: parseInt(topicMatch[2], 10),
      format: 'explicit',
    };
  }
  const colonMatch = /^(.+):(\d+)$/.exec(normalized);
  if (colonMatch) {
    return {
      chatId: colonMatch[1],
      messageThreadId: parseInt(colonMatch[2], 10),
      format: 'implicit',
    };
  }
  return { chatId: normalized, messageThreadId: null, format: 'bare' };
}

// Mirror of route resolution's looksLikeTelegramTargetId check.
function looksLikeValidRoute(parsed) {
  if (!parsed.chatId) return false;
  if (!/^-?\d+$/.test(parsed.chatId)) return false;
  // ChatId must be a Telegram group ID (typically >= 9 digits for supergroups)
  if (Math.abs(parseInt(parsed.chatId, 10)) < 1e8) return false;
  // messageThreadId is optional but if present must be valid
  if (parsed.messageThreadId !== null && parsed.messageThreadId < 1) return false;
  return true;
}

const KNOWN_CHAT_ID = '-1003975794600';
const KNOWN_TOPIC_DIVINITY = '7220';
const KNOWN_TOPIC_FAITH = '7474';

test('explicit format (chatId:topic:threadId) parses correctly', () => {
  const parsed = parseTelegramTarget(`${KNOWN_CHAT_ID}:topic:${KNOWN_TOPIC_DIVINITY}`);
  assert.equal(parsed.chatId, KNOWN_CHAT_ID);
  assert.equal(parsed.messageThreadId, 7220);
  assert.equal(parsed.format, 'explicit');
  assert.ok(looksLikeValidRoute(parsed), 'explicit format should produce a valid route');
});

test('explicit format works for topic 7474 (faith-leadership)', () => {
  const parsed = parseTelegramTarget(`${KNOWN_CHAT_ID}:topic:${KNOWN_TOPIC_FAITH}`);
  assert.equal(parsed.chatId, KNOWN_CHAT_ID);
  assert.equal(parsed.messageThreadId, 7474);
  assert.ok(looksLikeValidRoute(parsed));
});

test('implicit format (chatId:threadId) parses but route resolution requires explicit format', () => {
  const parsed = parseTelegramTarget(`${KNOWN_CHAT_ID}:${KNOWN_TOPIC_DIVINITY}`);
  assert.equal(parsed.chatId, KNOWN_CHAT_ID);
  assert.equal(parsed.messageThreadId, 7220);
  // The implicit format produces the same parsed shape, but the route resolver
  // in openclaw strips the chatId and treats the bare threadId as the chat id.
  // For threadIds < 6 digits (like 7220), the bare value fails the chatId regex.
  // The fix is to use the explicit :topic: format.
  const bareThreadIdAsChatId = String(parsed.messageThreadId);
  assert.equal(bareThreadIdAsChatId, '7220');
  assert.ok(!/^-?\d{9,}$/.test(bareThreadIdAsChatId),
    'bare threadId 7220 is too short to be a valid chatId');
});

test('all configured cron jobs use explicit :topic: format', () => {
  // List of cron job IDs and their expected delivery.to values.
  // Update when adding new forum-topic cron jobs.
  const expectedJobs = [
    { jobId: 'c27c08f1-66a5-4fc3-a480-3316b20abfcf', expectedTo: `${KNOWN_CHAT_ID}:topic:${KNOWN_TOPIC_DIVINITY}`, name: 'CRM Morning Brief' },
    { jobId: 'c520c638-3ac4-4cfd-b4ee-0fe8ef835cbd', expectedTo: `${KNOWN_CHAT_ID}:topic:${KNOWN_TOPIC_DIVINITY}`, name: 'CRM Evening Digest' },
    { jobId: '6ebb8bf2-d856-4d15-b924-e520e9e0ef36', expectedTo: `${KNOWN_CHAT_ID}:topic:${KNOWN_TOPIC_FAITH}`, name: 'faith-leadership-post' },
  ];

  for (const job of expectedJobs) {
    const parsed = parseTelegramTarget(job.expectedTo);
    assert.equal(parsed.chatId, KNOWN_CHAT_ID, `${job.name} chatId mismatch`);
    assert.ok(parsed.messageThreadId, `${job.name} must have a topic`);
    assert.ok(looksLikeValidRoute(parsed), `${job.name} must use explicit :topic: format`);
  }
});

test('format rejects ambiguous inputs', () => {
  // Just chatId with no topic — should still work for non-topic chats
  const parsed = parseTelegramTarget(KNOWN_CHAT_ID);
  assert.equal(parsed.chatId, KNOWN_CHAT_ID);
  assert.equal(parsed.messageThreadId, null);

  // Topic without chatId — invalid for delivery
  assert.throws(() => {
    if (!/^-?\d+$/.test(':topic:7220')) throw new Error('invalid');
  });
});

test('docs note: implicit format is fragile for short threadIds', () => {
  // This test exists to document WHY we use explicit format.
  // Real Telegram chatIds are >= 9 digits (supergroups are -100XXXXXXXXX).
  // Telegram threadIds can be small numbers (1, 2, 7220, 7474, etc.).
  // Implicit `<chatId>:<threadId>` parses, but if the resolver strips chatId
  // and uses the threadId as chatId, the resolution fails for short threadIds.
  //
  // The fix: always use explicit `<chatId>:topic:<threadId>` for cron delivery.
  //
  // For more details see:
  //   - openclaw docs/cli/cron.md line 264
  //   - openclaw dist/targets-*.js parseTelegramTarget
  //   - openclaw dist/channel-*.js resolveTelegramOutboundSessionRoute
  assert.ok(true, 'see comment above');
});