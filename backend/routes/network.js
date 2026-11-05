const express = require("express");
const { getNetworkStatus } = require("../services/network-service");
module.exports = () => {
  const router = express.Router();
  router.get("/status", async (_req, res, next) => {
    try { res.set("Cache-Control", "no-store"); res.json(await getNetworkStatus()); }
    catch (error) { next(error); }
  });
  return router;
};
