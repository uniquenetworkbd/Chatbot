const express = require("express");
const { requireAdmin } = require("../middleware/security");
module.exports = ({ db }) => {
  const router = express.Router();
  router.use(requireAdmin);
  router.get("/", (req, res, next) => {
    try {
      const totalChats = db.prepare("SELECT COUNT(*) AS total FROM chat_logs").get().total;
      const totalInteractions = db.prepare("SELECT COUNT(*) AS total FROM interaction_logs").get().total;
      const sessions = db.prepare("SELECT COUNT(DISTINCT session_id) AS total FROM chat_logs").get().total;
      const unanswered = db.prepare("SELECT id, session_id, user_message, created_at FROM chat_logs WHERE bot_response = ? ORDER BY id DESC LIMIT ?")
        .all("দুঃখিত, এই বিষয়টি আমার নলেজ বেসে নেই। সঠিক সহায়তার জন্য দয়া করে আমাদের মাইজদী সদর অফিসে যোগাযোগ করুন অথবা ফেসবুক পেজে ইনবক্স করুন।", Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100));
      const daily = db.prepare("SELECT substr(created_at,1,10) AS day, COUNT(*) AS total FROM chat_logs WHERE created_at >= datetime('now','-13 days') GROUP BY day ORDER BY day").all();
      const categories = db.prepare("SELECT COALESCE(category,'uncategorized') AS category, COUNT(*) AS total FROM chat_logs GROUP BY category ORDER BY total DESC LIMIT 12").all();
      const events = db.prepare("SELECT event_type, COUNT(*) AS total FROM interaction_logs GROUP BY event_type ORDER BY total DESC LIMIT 12").all();
      res.set("Cache-Control", "no-store").json({ generatedAt: new Date().toISOString(), totals: { chats: totalChats, interactions: totalInteractions, sessions }, daily, categories, events, unanswered });
    } catch (error) { next(error); }
  });
  return router;
};
