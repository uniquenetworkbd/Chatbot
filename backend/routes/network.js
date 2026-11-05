const express = require("express");
const { getNetworkStatus } = require("../services/network-service");
const { requireAdmin } = require("../middleware/security");
module.exports = () => {
  const router = express.Router();\n  router.use(require("./network-config")());
  router.get("/status", requireAdmin, async (_req, res, next) => {
    try { res.set("Cache-Control", "no-store"); res.json(await getNetworkStatus()); }
    catch (error) { next(error); }
  });
  return router;
};
