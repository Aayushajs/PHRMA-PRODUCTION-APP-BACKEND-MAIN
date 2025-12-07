# 🚨 Email Not Working? Quick Fixes

## Current Issue: Connection Timeout on Render

### ⚡ Quick Fix Options (Try in order):

---

## Option 1: Generate New Gmail App Password (RECOMMENDED)

1. **Go to:** https://myaccount.google.com/apppasswords
2. **Login** to your Gmail account
3. **Enable 2-Step Verification** (if not already)
4. **Generate App Password:**
   - App: Mail
   - Device: Other (Custom name) → "Epharma Render"
5. **Copy the 16-character password** (e.g., `abcd efgh ijkl mnop`)
6. **Remove spaces:** `abcdefghijklmnop`
7. **Update Render Environment Variables:**
   ```
   GMAIL_USER=your_email@gmail.com
   GMAIL_PASS=abcdefghijklmnop
   ```
8. **Redeploy** on Render

---

## Option 2: Check Render Environment Variables

```bash
# Go to Render Dashboard → Your Service → Environment

# Verify these are set:
GMAIL_USER=your_email@gmail.com      # ✓ Must be set
GMAIL_PASS=your_app_password         # ✓ Must be 16 chars (no spaces)
NODE_ENV=production                   # ✓ Optional
```

**Common Mistakes:**
- ❌ Using regular Gmail password instead of App Password
- ❌ Including spaces in App Password
- ❌ Not setting environment variables in Render
- ❌ Environment variables set but not redeployed

---

## Option 3: Use Alternative Email Service (SendGrid)

If Gmail keeps failing, use **SendGrid** (Free tier: 100 emails/day):

### Step 1: Sign up for SendGrid
- Go to: https://sendgrid.com/
- Create free account
- Verify email

### Step 2: Generate API Key
- Dashboard → Settings → API Keys
- Create API Key → Full Access
- Copy the key (starts with `SG.`)

### Step 3: Install SendGrid
```bash
npm install @sendgrid/mail
```

### Step 4: Update Render Environment
```
SENDGRID_API_KEY=SG.your_api_key_here
SENDGRID_FROM_EMAIL=your_verified_email@domain.com
USE_SENDGRID=true
```

### Step 5: I'll create a SendGrid mailer for you
Would you like me to implement SendGrid as a backup?

---

## Option 4: Use Render's Recommended SMTP Settings

Some cloud providers block standard SMTP ports. Try:

### Alternative Ports:
- **Port 2525** (SendGrid/Mailgun alternative)
- **Port 25** (Standard SMTP - may be blocked)
- **Port 587** with STARTTLS
- **Port 465** with SSL (current)

---

## Option 5: Use Mailgun (Alternative)

**Free tier:** 5,000 emails/month

1. Sign up: https://www.mailgun.com/
2. Verify domain or use sandbox
3. Get SMTP credentials
4. Update Render:
   ```
   MAILGUN_SMTP_USER=postmaster@sandbox.mailgun.org
   MAILGUN_SMTP_PASS=your_password
   MAILGUN_HOST=smtp.mailgun.org
   MAILGUN_PORT=587
   ```

---

## Current Code Status

✅ **Already Implemented:**
- Dual-port support (465 SSL + 587 TLS fallback)
- 6 retry attempts with exponential backoff
- Automatic transporter switching
- Enhanced error logging
- Connection pooling

🔧 **What's Happening Now:**
```
1. Try Port 465 (SSL) → Timeout
2. Switch to Port 587 (TLS) → Timeout
3. Retry 6 times with backoff → All fail
4. Error: Connection timeout
```

---

## Debugging Commands

### Test from Render Shell:
```bash
# SSH into Render instance
render ssh

# Test SMTP connection
nc -zv smtp.gmail.com 465
nc -zv smtp.gmail.com 587

# Test with curl
curl -v telnet://smtp.gmail.com:465
curl -v telnet://smtp.gmail.com:587
```

### Check Environment Variables:
```bash
echo $GMAIL_USER
echo $GMAIL_PASS
```

---

## Recommended Solution: SendGrid

Since Gmail SMTP keeps timing out on Render, **I strongly recommend switching to SendGrid**:

**Advantages:**
✅ More reliable on cloud platforms
✅ Better delivery rates
✅ No port blocking issues
✅ Free tier sufficient for most apps
✅ Better analytics and logs
✅ Webhook support for delivery tracking

**Would you like me to:**
1. ✅ Implement SendGrid mailer (recommended)
2. ✅ Keep Gmail as fallback
3. ✅ Add automatic switching between services

Let me know and I'll implement it right away! 🚀

---

## Emergency Workaround: Disable Email Verification

**Temporary solution** (not recommended for production):

```typescript
// In forgotPassword API
// Skip email sending for testing
await redis.set(`otp:${user._id}`, otp, { EX: 180 });
return res.json({
  success: true,
  message: "OTP generated",
  otp: otp  // ⚠️ ONLY FOR TESTING - REMOVE IN PRODUCTION
});
```

---

## Next Steps:

**Tell me which option you want:**
1. 🔑 "Generate new Gmail App Password and try again"
2. 📧 "Implement SendGrid" ⭐ RECOMMENDED
3. 🔄 "Try Mailgun instead"
4. 🐛 "Debug Render SMTP ports"
5. ⚠️ "Disable email temporarily for testing"

I'll implement whatever you choose! 💪
