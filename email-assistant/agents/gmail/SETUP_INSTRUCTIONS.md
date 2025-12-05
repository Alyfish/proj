# Gmail OAuth Setup Instructions

## ⚠️ Important: Avoid URL Truncation

The OAuth URL is very long. If it gets truncated, you'll see "Error 400: invalid_request".

## ✅ Recommended Method: Use the Interactive Script

This is the **safest and easiest** way to authenticate:

```bash
cd '/Users/aly/Desktop/cirtext clone/email-assistant/agents/gmail'
npx ts-node src/setupAuth.ts
```

The script will:
1. Automatically generate the correct URL
2. Display it in your terminal
3. Wait for you to paste the authorization code
4. Save your token automatically

## 🔗 Manual Method (If Needed)

If you prefer to get the URL manually:

```bash
cd '/Users/aly/Desktop/cirtext clone/email-assistant/agents/gmail'
node generate-auth-link.js
```

Or save the URL to a file:

```bash
cd '/Users/aly/Desktop/cirtext clone/email-assistant/agents/gmail'
node generate-auth-link.js > my_auth_url.txt
open my_auth_url.txt
```

## 🛠️ Troubleshooting "Error 400: invalid_request"

This error means the URL is incomplete. Common causes:

1. **URL was truncated when copying** - The URL is >300 characters
   - Solution: Use the interactive script method above

2. **Line breaks were added** - Some terminals wrap long lines
   - Solution: Copy the ENTIRE URL on one line, or use the script

3. **URL encoding issue** - Special characters weren't properly encoded
   - Solution: The script handles this automatically

## 📝 Step-by-Step (Interactive Method)

1. Open terminal
2. Run: `cd '/Users/aly/Desktop/cirtext clone/email-assistant/agents/gmail'`
3. Run: `npx ts-node src/setupAuth.ts`
4. You'll see: `Authorize this app by visiting this url: <LONG_URL>`
5. **Carefully select and copy the ENTIRE URL** (it's one long line)
6. Paste into your browser
7. Sign in and authorize
8. You'll be redirected to `http://localhost:3000/?code=XXXXXXXX`
9. Copy the `code=XXXXXXXX` part
10. Return to terminal and paste the code
11. Press Enter
12. Done! You'll see: `Token stored to token.json`

## 🔍 Verify Your Token

After successful authentication:

```bash
cd '/Users/aly/Desktop/cirtext clone/email-assistant/agents/gmail'
ls -la token.json
```

You should see the `token.json` file exists.

## 🧪 Test Gmail Connection

```bash
cd '/Users/aly/Desktop/cirtext clone/email-assistant/agents/gmail'
npx ts-node src/testGmail.ts
```

This should display your recent emails.
