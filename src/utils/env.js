// src/utils/env.js

const REQUIRED_ENV = [
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "SLACK_APP_TOKEN",
  "ANTHROPIC_API_KEY",
];

const OPTIONAL_ENV = [
  "GEMINI_API_KEY",
];

function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("Missing required environment variables:");
    missing.forEach((key) => console.error(`  - ${key}`));
    process.exit(1);
  }

  // Warn about optional vars
  const missingOptional = OPTIONAL_ENV.filter((key) => !process.env[key]);
  if (missingOptional.length > 0) {
    console.warn("Optional environment variables not set:");
    missingOptional.forEach((key) => console.warn(`  - ${key}`));
  }

  return {
    slack: {
      botToken: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      appToken: process.env.SLACK_APP_TOKEN,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || null,
    },
  };
}

module.exports = { validateEnv };
