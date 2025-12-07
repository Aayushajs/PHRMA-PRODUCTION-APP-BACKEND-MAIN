# 📧 Email Service - Triple Redundancy System

## 🎯 How It Works

**Smart Round-Robin + Auto-Fallback System:**

```
Request #1: Mailjet → (if fails) → SendGrid → (if fails) → Gmail
Request #2: SendGrid → (if fails) → Mailjet → (if fails) → Gmail  
Request #3: Mailjet → (if fails) → SendGrid → (if fails) → Gmail
Request #4: SendGrid → (if fails) → Mailjet → (if fails) → Gmail
... (continues alternating)
```

**Benefits:**
- ✅ **Load Balancing**: Distributes emails across providers
- ✅ **Auto-Fallback**: Instant switch if primary fails
- ✅ **Limit Protection**: Uses alternate when one reaches limit
- ✅ **Maximum Reliability**: 3-tier backup system

**Total Daily Capacity: 800 emails/day (free)** 🎉

---

## ⚙️ Setup

### 1. SendGrid (Primary - Recommended)
```env
SENDGRID_API_KEY=SG.your_key_here
SENDGRID_FROM_EMAIL=support@yourdomain.com
```
- Sign up: https://sendgrid.com/
- Dashboard → Settings → API Keys → Create
- Free: 100 emails/day forever

### 2. Mailjet (Secondary - Automatic Fallback)
```env
MAILJET_API_KEY=your_api_key_here
MAILJET_SECRET_KEY=your_secret_key_here
MAILJET_FROM_EMAIL=support@yourdomain.com
```
- Sign up: https://www.mailjet.com/
- Account Settings → API Keys (REST API)
- Free: 200 emails/day forever

### 3. Gmail SMTP (Last Resort)
```env
GMAIL_USER=your_email@gmail.com
GMAIL_PASS=your_16_char_app_password
```
- Generate App Password: https://myaccount.google.com/apppasswords
- Free: 500 emails/day
- May not work on Render (SMTP ports blocked)

---

## 📝 Usage

### Send OTP Email
```typescript
import { sendEmail } from './Utils/mailer';

const result = await sendEmail('user@example.com', 'otp', { otp: 1234 });
console.log(result.provider); // "SendGrid", "Mailjet", or "Gmail"
```

### Response Includes Provider Info
```typescript
// Normal alternation (primary provider worked)
{
  "success": true,
  "message": "OTP sent via Mailjet",
  "provider": "Mailjet",
  "alternated": false
}

// Backup was used (primary failed, secondary worked)
{
  "success": true,
  "message": "OTP sent via SendGrid (backup used)",
  "provider": "SendGrid",
  "alternated": true
}
```

### All Email Types
```typescript
// OTP Email
await sendEmail('user@example.com', 'otp', { otp: 1234 });

// Welcome Email
await sendEmail('user@example.com', 'welcome', { name: 'John' });

// Notification
await sendEmail('user@example.com', 'notification', { 
    subject: 'Alert',
    message: 'Order shipped!' 
});
```

---

## 🚀 Production Deployment

### Render Environment Variables
```env
# Primary (SendGrid)
SENDGRID_API_KEY=SG.xxxxx
SENDGRID_FROM_EMAIL=support@domain.com

# Secondary (Mailjet)  
MAILJET_API_KEY=xxxxx
MAILJET_SECRET_KEY=xxxxx
MAILJET_FROM_EMAIL=support@domain.com

# Backup (Gmail) - Optional
GMAIL_USER=email@gmail.com
GMAIL_PASS=16charapppassword
```

---

## ✅ Benefits

| Feature | This Setup | Single Provider |
|---------|------------|-----------------|
| **Reliability** | 99.9%+ | Variable |
| **Daily Limit** | 800 emails | 100-200 |
| **Auto Failover** | ✅ Yes | ❌ No |
| **Cost** | ✅ Free | ✅ Free |
| **Downtime Risk** | ⬇️ Very Low | ⬆️ High |
| **Provider Info** | ✅ Logged | ❌ Unknown |

---

## 🔍 Monitoring

Check logs to see which provider is being used:
```
✅ Email sent via SendGrid to user@example.com
✅ Email sent via Mailjet to user@example.com  
✅ Email sent via Gmail to user@example.com
```

If SendGrid consistently fails, Mailjet automatically takes over! 🎯

---

## 📊 Free Tier Comparison

| Provider | Free Limit | Best For |
|----------|-----------|----------|
| **SendGrid** | 100/day | Primary production |
| **Mailjet** | 200/day | Automatic backup |
| **Gmail** | 500/day | Local development |

**Combined: 800 emails/day without spending a penny!** 💰

---

## 🛡️ Production Checklist

- [ ] All 3 providers configured in Render
- [ ] Sender emails verified on each platform
- [ ] Tested forgot password flow
- [ ] Checked logs for provider confirmation
- [ ] Monitoring setup for email failures

**Your email system is now bulletproof!** 🚀
