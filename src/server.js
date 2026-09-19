import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173" || "https://lucas-graham.github.io")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: false,
  }),
);

app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please try again later.",
  },
});

app.use("/api", apiLimiter);

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const sanitizeTheme = (theme) => {
  if (typeof theme !== "string") {
    return "";
  }

  return theme.trim().replace(/[^a-zA-Z0-9\s-]/g, "").slice(0, 40);
};

const parsePuzzleResponse = (raw) => {
  if (!raw || typeof raw !== "string") {
    throw new Error("Empty model response.");
  }

  const cleaned = raw.replace(/```json|```/gi, "").trim();

  let puzzle;
  try {
    puzzle = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Puzzle response could not be parsed.");
    }

    puzzle = JSON.parse(match[0]);
  }

  if (Array.isArray(puzzle)) {
    if (puzzle.length === 0) {
      throw new Error("Puzzle response was an empty array.");
    }

    return puzzle[0];
  }

  if (puzzle && typeof puzzle === "object" && Array.isArray(puzzle.groups)) {
    return puzzle;
  }

  throw new Error("Puzzle response did not include valid groups.");
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "connections-api" });
});

app.post("/api/ai", async (req, res) => {
  const theme = sanitizeTheme(req.body?.theme);

  if (!theme) {
    return res.status(400).json({
      error: "A valid theme is required.",
    });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({
      error: "AI service is not configured.",
    });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a clever puzzle maker. Create a Connections-style puzzle with four distinct grouping categories and exactly four unique words in each category. Return valid JSON in this exact shape:
          { "title": "Puzzle Title", "groups": [{ "name": "Category Name", "words": ["WORD1", "WORD2", "WORD3", "WORD4"], "color": "yellow" }, ... ] }
          The color must be one of: yellow, green, blue, purple.
          Make sure all words are uppercase and each category has exactly 4 words.`,
        },
        {
          role: "user",
          content: `Create a new Connections-inspired puzzle with a ${theme} theme.`,
        },
      ],
      temperature: 0.8,
    });

    const modelResponse = completion.choices?.[0]?.message?.content;
    const puzzle = parsePuzzleResponse(modelResponse);

    return res.json({ puzzle });
  } catch (error) {
    console.error("OpenRouter request failed:", error);
    return res.status(500).json({
      error: "Failed to generate a puzzle.",
    });
  }
});

const distPath = path.join(projectRoot, "dist");

if (fs.existsSync(path.join(distPath, "index.html"))) {
  app.use(express.static(distPath));

  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }

    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  if (error?.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Origin not allowed." });
  }

  console.error("Unhandled server error:", error);
  return res.status(500).json({ error: "Internal server error." });
});

app.listen(port, host, () => {
  console.log(`Secure Express API listening on http://${host}:${port}`);
});
