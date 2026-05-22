const express = require("express");
const prisma = require("../prisma/prisma");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const users = await prisma.user.findMany();

    res.json(users);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: "Internal server error",
    });
  }
});

module.exports = router;
