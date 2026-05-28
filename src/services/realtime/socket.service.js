/**
 * Socket.io Real-time Event Service
 * Section 7 — Data Streaming Layer (Socket.io replaces Kafka at this scale)
 */

const prisma = require("../../prisma/prisma");

function setupSocket(io) {
  io.on("connection", (socket) => {
    const userId = socket.handshake.auth?.userId;
    const role   = socket.handshake.auth?.role;

    socket.join("dashboard");
    if (role === "compliance" || role === "admin") socket.join("compliance");
    if (userId) socket.join(`user:${userId}`);

    socket.on("disconnect", () => {});
  });

  // Market ticker — broadcast every 30s
  setInterval(async () => {
    try {
      const market = await prisma.marketData.findMany({
        select: { symbol: true, currentPrice: true, dailyChange: true, volume: true, assetType: true },
        orderBy: { marketCap: "desc" },
        take: 10,
      });
      io.to("dashboard").emit("market:tick", market);
    } catch {}
  }, 30_000);

  // Compliance pulse — every 60s
  setInterval(async () => {
    try {
      const count = await prisma.complianceAlert.count({ where: { status: { not: "resolved" } } });
      io.to("compliance").emit("compliance:pulse", { openAlerts: count });
    } catch {}
  }, 60_000);
}

module.exports = setupSocket;

// Helpers for routes to emit events
module.exports.emitNotification = function(io, room, payload) {
  if (!io) return;
  io.to(room).emit("notification", { ...payload, timestamp: new Date().toISOString() });
};

module.exports.emitComplianceAlert = function(io, alert) {
  if (!io) return;
  io.to("compliance").emit("compliance:alert", { latest: alert });
  io.to("dashboard").emit("notification", {
    type: "warning",
    title: `Compliance Alert [${alert.severity}]`,
    body: alert.alertMessage?.slice(0, 80),
    timestamp: new Date().toISOString(),
  });
};
