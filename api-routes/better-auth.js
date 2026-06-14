"use strict";

module.exports = async function betterAuthHandler(req, res) {
  const { handleBetterAuthNodeRequest } = await import("../lib/better-auth.mjs");
  return handleBetterAuthNodeRequest(req, res);
};
