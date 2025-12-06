# 🚀 RENDER DEPLOYMENT - EMAIL SETUP QUICK GUIDE

## ⚡ Quick Steps (5 Minutes)

### 1️⃣ Generate Gmail App Password
```
1. Go to: https://myaccount.google.com/apppasswords
2. Select App: "Mail" → Device: "Other" → Name: "Epharma"
3. Click Generate
4. Copy 16-character password (remove spaces)
   Example: abcdefghijklmnop
```

### 2️⃣ Set Environment Variables in Render
```
Go to Render Dashboard → Your Service → Environment

Add these variables:
┌─────────────────┬────────────────────────────────┐
│ GMAIL_USER      │ your-email@gmail.com           │
│ GMAIL_PASS      │ abcdefghijklmnop (16 chars)   │
└─────────────────┴────────────────────────────────┘

Click "Save Changes" → Render will auto-deploy
```

### 3️⃣ Verify Deployment
```bash
# Check logs in Render Dashboard
Look for: ✅ "SMTP Server is ready to send emails"

# Test API
POST https://your-app.onrender.com/api/user/forgot-password
{
    "email": "test@example.com"
}

# Expected Response:
{
    "success": true,
    "message": "OTP sent to your email. Please check your inbox."
}
```

---

## 🔍 Test Before Deploying

```bash
# Run test locally first
npm run test:email
# OR
node config/testingMailer.ts

# If you see ✅, you're good to deploy!
```

---

## ⚠️ Common Issues & Fixes

| Problem | Solution |
|---------|----------|
| ❌ Authentication failed | Use App Password, not Gmail password |
| ❌ SMTP Connection Error | Check 2-Step Verification is enabled |
| ❌ Email not received | Check spam folder |
| ❌ ETIMEDOUT | Render server issue, wait & retry |

---

## 📋 Deployment Checklist

- [ ] Generated Gmail App Password
- [ ] Added `GMAIL_USER` in Render env vars
- [ ] Added `GMAIL_PASS` in Render env vars (16 chars, no spaces)
- [ ] Saved changes in Render (triggers auto-deploy)
- [ ] Checked deployment logs for "✅ SMTP Server is ready"
- [ ] Tested forgot-password API
- [ ] Verified OTP email received
- [ ] Checked email in inbox (not spam)

---

## 🎯 What Changed

### Before (Not Working in Production):
```typescript
service: 'gmail',  // ❌ Too simple for production
port: 465,         // ❌ Wrong port
secure: false      // ❌ Conflicting settings
```

### After (Production Ready):
```typescript
host: 'smtp.gmail.com',  // ✅ Explicit host
port: 587,               // ✅ Correct TLS port  
secure: false,           // ✅ Correct for 587
tls: {
    rejectUnauthorized: false  // ✅ Handles production SSL
},
retry: 3 times,          // ✅ Auto-retry on failure
HTML templates,          // ✅ Professional emails
Better error handling    // ✅ Detailed logs
```

---

## 📞 Still Not Working?

### Check Render Logs:
1. Go to Render Dashboard
2. Click on your service
3. Click "Logs" tab
4. Look for error messages

### Common Log Messages:
```
✅ "SMTP Server is ready to send emails"
   → Everything is working!

❌ "SMTP Connection Error: Invalid login"
   → Wrong GMAIL_USER or GMAIL_PASS

❌ "Authentication failed"
   → Use App Password, not regular password

✅ "Email sent successfully to user@example.com"
   → Email was sent (check spam folder)
```

---

## 🧪 Test Commands

```bash
# Test email configuration
npm run test:email

# Test forgot password API locally
curl -X POST http://localhost:5000/api/user/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@gmail.com"}'

# Test on Render
curl -X POST https://your-app.onrender.com/api/user/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@gmail.com"}'
```

---

## 💡 Pro Tips

1. **Use Gmail Test Account**: Create separate Gmail for testing
2. **Check Spam Folder**: First emails often go to spam
3. **Whitelist in Gmail**: Add your domain to contacts
4. **Monitor Logs**: Keep Render logs open during first test
5. **App Password Expires**: Regenerate if issues after months

---

## ✅ Success Indicators

- ✅ Render logs show: "SMTP Server is ready"
- ✅ API returns 200 status
- ✅ Email received in inbox within 10 seconds
- ✅ OTP code visible in email
- ✅ Email looks professional (HTML template)

---

## 📊 Expected Flow

```
User enters email
    ↓
API generates OTP
    ↓
OTP saved to Redis (3 min expiry)
    ↓
Email sent (with 3 retry attempts)
    ↓
User receives beautiful HTML email
    ↓
User enters OTP
    ↓
OTP verified
    ↓
User can reset password
```

---

Need help? Check `DEPLOYMENT_EMAIL_SETUP.md` for detailed guide.
