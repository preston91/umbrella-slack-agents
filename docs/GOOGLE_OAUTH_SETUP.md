# Google OAuth Setup for Email & Calendar Integration

This guide explains how to set up Google OAuth credentials to enable email and calendar integration.

## What You Get

Once configured, the system will:
- **Read your Gmail** to track follow-ups and extract meeting notes from Otter.ai/Tactic
- **Access your Calendar** to show today's meetings, send reminders, and identify meetings needing follow-up
- **Auto-remind you** of upcoming meetings (15 min before)
- **Extract action items** from call notes that arrive via email
- **Track who you're waiting to hear back from**

## Setup Steps

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable these APIs:
   - Gmail API
   - Google Calendar API

### 2. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Choose **Desktop app** as the application type
4. Name it something like "Umbrella Bot"
5. Download the credentials JSON

From the JSON, you'll need:
- `client_id` → `GOOGLE_CLIENT_ID`
- `client_secret` → `GOOGLE_CLIENT_SECRET`

### 3. Get a Refresh Token

The easiest way to get a refresh token is using the OAuth 2.0 Playground:

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your Client ID and Client Secret
5. In the left sidebar, select these scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/calendar.readonly`
6. Click **Authorize APIs**
7. Sign in with your Google account and grant permissions
8. Click **Exchange authorization code for tokens**
9. Copy the `refresh_token` → `GOOGLE_REFRESH_TOKEN`

### 4. Add to Environment Variables

Add these to your `.env` file:

```bash
# Google OAuth for Email/Calendar
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REFRESH_TOKEN=your_refresh_token_here
```

### 5. Restart the App

After adding the credentials, restart the bot:

```bash
npm start
```

You should see:
```
Gmail API initialized
Google Calendar API initialized
Email/Calendar integration: ENABLED
- Meeting reminders: every 15 min
- Follow-up tracking: active
- Meeting notes extraction: active
```

## What Happens Automatically

Once enabled:

| Time | What Happens |
|------|--------------|
| 8:45 AM | Syncs follow-ups from email/calendar |
| 9:00 AM | Morning briefing with schedule + priorities |
| Every 15 min | Checks for meetings starting soon, sends reminder |
| Hourly | Checks for new meeting notes, posts team updates |
| 2:00 PM | Afternoon follow-up reminder |
| 6:00 PM | Evening sync of follow-ups |

## Troubleshooting

### "Gmail/Calendar features disabled" on startup
- Check that all three env vars are set
- Make sure there are no extra spaces or quotes around the values

### "Token has been expired or revoked"
- Go back to OAuth Playground and generate a new refresh token
- Update `GOOGLE_REFRESH_TOKEN` in your `.env`

### Not seeing meeting notes from Otter/Tactic
- Make sure Otter.ai and Tactic are sending notes to the Gmail account you authorized
- The system looks for emails from `otter.ai`, `otter`, `tactic`, or `meettactic`

## Security Notes

- The refresh token grants ongoing access to read your email and calendar
- Store it securely (never commit to git)
- You can revoke access anytime at [Google Security Settings](https://myaccount.google.com/permissions)
