// =============================================================
// Telegram routing for CRM cron jobs
// =============================================================
// Required env vars on Render:
//   TELEGRAM_BOT_TOKEN      — bot token from BotFather
//   TELEGRAM_CHAT_ID        — channel/group ID for Ai Rei
//   TOPIC_DIVINITY_CRM      — message_thread_id for topic 7220
//
// To set up:
//   1. Create bot via @BotFather → save token to TELEGRAM_BOT_TOKEN
//   2. Add bot to Ai Rei group
//   3. Get chat_id (negative for groups): curl https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates
//   4. Get topic thread_id: look at /replies in group, or check message_thread_id field on any topic reply
// =============================================================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const TOPIC_DIVINITY_CRM = Number(process.env.TOPIC_DIVINITY_CRM || 7220);

module.exports = { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TOPIC_DIVINITY_CRM };