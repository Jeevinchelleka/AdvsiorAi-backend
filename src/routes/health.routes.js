const express = require("express");
const prisma = require("../prisma/prisma");
const supabaseClient = require("../lib/supabase");

const router = express.Router();

router.get("/db", async (req, res) => {
  const status = {
    prisma: { ok: false, message: null },
    supabase: { ok: false, message: null },
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    status.prisma.ok = true;
  } catch (error) {
    status.prisma.message = error?.message || String(error);
  }

  if (!supabaseClient) {
    status.supabase.message =
      "SUPABASE_URL or SUPABASE_KEY is not configured in the backend environment.";
  } else {
    try {
      const { data, error } = await supabaseClient
        .from("clients")
        .select("id")
        .limit(1);

      if (error) {
        throw error;
      }

      status.supabase.ok = true;
      status.supabase.sampleCount = Array.isArray(data) ? data.length : 0;
    } catch (error) {
      status.supabase.message = error?.message || String(error);
    }
  }

  const statusCode = status.prisma.ok && status.supabase.ok ? 200 : 500;
  return res.status(statusCode).json(status);
});

module.exports = router;
