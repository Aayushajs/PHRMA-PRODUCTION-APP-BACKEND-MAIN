# 📧 Email Configuration for Render Deployment

## Problem: Email not working after deployment to Render

### Root Causes:
1. ❌ Port 587 may be blocked by Render
2. ❌ Connection timeouts on cloud platforms
3. ❌ Invalid Gmail App Password
4. ❌ 2-Step Verification not enabled

---

## ✅ Solution: Step-by-Step Fix

### Step 1: Generate Gmail App Password

1. Go to your Google Account: https://myaccount.google.com/
2. Navigate to **Security** → **2-Step Verification**
3. Enable 2-Step Verification if not already enabled
4. Scroll down to **App passwords**
5. Click **App passwords** (you may need to re-enter your password)
6. Select:
   - **App:** Mail
   - **Device:** Other (Custom name) → Enter "Epharma API"
7. Click **Generate**
8. **Copy the 16-character password** (format: xxxx xxxx xxxx xxxx)

### Step 2: Configure Render Environment Variables

1. Go to your Render Dashboard
2. Select your Web Service
3. Go to **Environment** tab
4. Add/Update these variables:

```env
GMAIL_USER=your_actual_gmail@gmail.com
GMAIL_PASS=your_16_character_app_password (remove spaces)
NODE_ENV=production
```

**Important:** 
- Use the 16-character App Password, NOT your regular Gmail password
- Remove all spaces from the App Password
- Example: `abcdabcdabcdabcd` (not `abcd abcd abcd abcd`)

### Step 3: Verify SMTP Configuration

Our updated configuration uses:
- **Port:** 465 (SSL) - Better for cloud deployments
- **Secure:** true
- **Connection Timeout:** 30 seconds
- **Retry Logic:** 5 attempts with exponential backoff

### Step 4: Test Locally First

```bash
# Install dependencies
npm install

# Create .env file with your credentials
cp .env.example .env
# Edit .env and add your GMAIL_USER and GMAIL_PASS

# Test email sending
npm run test:email

# If successful, you should see:
# ✅ SMTP Server is ready to send emails
# ✅ Email sent successfully
```

### Step 5: Deploy to Render

```bash
# Commit changes
git add .
git commit -m "Fix email configuration for production"
git push origin main

# Render will auto-deploy
# Check logs for: ✅ SMTP Server is ready to send emails
```

---

## 🔍 Troubleshooting

### Error: "Connection timeout"
**Solution:** 
- Use port 465 instead of 587
- Increase timeout to 30 seconds
- Check if Render blocks SMTP ports (rare but possible)

### Error: "EAUTH - Authentication failed"
**Solution:**
- Regenerate Gmail App Password
- Ensure 2-Step Verification is enabled
- Double-check GMAIL_USER and GMAIL_PASS in Render environment variables
- Remove all spaces from App Password

### Error: "ESOCKET - Socket connection error"
**Solution:**
- Use `service: 'gmail'` in transporter config
- Enable `pool: true` for connection pooling
- Use SSL (port 465) instead of TLS (port 587)

### Email works locally but not on Render
**Solution:**
- Verify environment variables are set in Render (not just locally)
- Check Render logs for SMTP connection errors
- Ensure App Password is correct (regenerate if needed)
- Test with curl from Render shell:
  ```bash
  curl -v telnet://smtp.gmail.com:465
  ```

---

## 📊 Updated Configuration

```typescript
// Production-optimized SMTP settings
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,          // SSL port (better for cloud)
    secure: true,       // Use SSL
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
    },
    connectionTimeout: 30000,  // 30 seconds
    pool: true,                // Connection pooling
    maxConnections: 5,
    rateDelta: 1000,
    rateLimit: 5
});
```

---

## ✅ Verification Checklist

Before deploying, ensure:

- [ ] 2-Step Verification enabled on Gmail
- [ ] Gmail App Password generated
- [ ] GMAIL_USER set in Render environment
- [ ] GMAIL_PASS set in Render environment (16 chars, no spaces)
- [ ] Email tested locally: `npm run test:email`
- [ ] Logs show: `✅ SMTP Server is ready to send emails`
- [ ] OTP email received in inbox/spam

---

## 🚀 Production Best Practices

1. **Rate Limiting:** Gmail allows ~500 emails/day
2. **Error Handling:** Retry with exponential backoff
3. **Logging:** Log all email attempts for debugging
4. **Fallback:** Consider backup email service (SendGrid, AWS SES)
5. **Monitoring:** Set up alerts for email failures

---

## 📞 Support

If issues persist:
1. Check Render logs: `render logs --tail`
2. Test SMTP connection from Render shell
3. Verify Gmail account security settings
4. Consider using dedicated email service (SendGrid, Mailgun)

---

## 🔗 Useful Links

- Gmail App Passwords: https://myaccount.google.com/apppasswords
- Nodemailer Docs: https://nodemailer.com/
- Render Docs: https://render.com/docs
- Gmail SMTP Settings: https://support.google.com/mail/answer/7126229
