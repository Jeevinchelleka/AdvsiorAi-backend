const express = require("express");
const prisma = require("../prisma/prisma");
const router = express.Router();

// GET /conversations/:id — single conversation with messages
router.get("/:id", async (req, res) => {
  try {
    const conv = await prisma.aiConversation.findUnique({
      where: { id: req.params.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    res.json(conv);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

// GET /conversations — all AI conversations
router.get("/", async (req, res) => {
  try {
    const convs = await prisma.aiConversation.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    res.json(convs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// POST /conversations — create new conversation + save messages
router.post("/", async (req, res) => {
  try {
    const { userId, title, contextSummary, messages } = req.body;
    const conv = await prisma.aiConversation.create({
      data: {
        userId: userId || null,
        title: title || "New Conversation",
        contextSummary: contextSummary || null,
        messages: messages?.length
          ? { create: messages.map((m) => ({ sender: m.role || m.sender, message: m.content || m.message })) }
          : undefined,
      },
      include: { messages: true },
    });
    res.json(conv);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// POST /conversations/:id/messages — append a message
router.post("/:id/messages", async (req, res) => {
  try {
    const { sender, message } = req.body;
    const msg = await prisma.aiMessage.create({
      data: { conversationId: req.params.id, sender, message },
    });
    res.json(msg);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to save message" });
  }
});

module.exports = router;
