# Email Deliverability Guide - Preventing Spam Classification

## ✅ What Was Fixed

I've updated your email service with the following anti-spam improvements:

### 1. **Enhanced Email Headers**
- Added `X-Priority`, `X-MSMail-Priority`, and `Importance` headers
- Added `List-Unsubscribe` header (required by many email providers)
- Added `X-Mailer` identification
- Added `Precedence: bulk` for transactional emails

### 2. **Improved Email Template**
- Better HTML structure with proper meta tags
- Added security warnings and instructions
- Included unsubscribe link in footer
- More professional formatting and styling
- Added clear plain text alternative
- Improved subject line to be more descriptive

### 3. **Enhanced SMTP Configuration**
- Better Gmail SMTP settings with connection pooling
- Rate limiting to prevent spam triggers
- TLS security enabled
- DKIM support preparation

---

## 🔧 Additional Steps Required (CRITICAL)

To ensure your emails consistently reach the inbox, you MUST configure the following:

### 1. **Domain Authentication (HIGHEST PRIORITY)**

#### A. SPF Record
Add this TXT record to your domain's DNS:

```
Type: TXT
Name: @
Value: v=spf1 include:_spf.google.com include:sendgrid.net include:spf.mailjet.com ~all
```

**For SendGrid specifically:**
```
v=spf1 include:sendgrid.net ~all
```

**For Mailjet specifically:**
```
v=spf1 include:spf.mailjet.com ~all
```

#### B. DKIM (DomainKeys Identified Mail)

**For SendGrid:**
1. Go to SendGrid Dashboard → Settings → Sender Authentication
2. Click "Authenticate Your Domain"
3. Follow the wizard to add CNAME records to your DNS
4. Verify the domain

**For Mailjet:**
1. Go to Mailjet Dashboard → Account Settings → Sender Domains & Addresses
2. Add your domain
3. Add the provided DNS records (TXT and CNAME)
4. Verify the domain

**For Gmail:**
1. Generate DKIM keys using your domain provider
2. Add the private key to your `.env` file:
   ```
   DKIM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
   Your private key here
   -----END PRIVATE KEY-----"
   ```

#### C. DMARC Record
Add this TXT record to your domain's DNS:

```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com; ruf=mailto:dmarc@yourdomain.com; pct=100
```

**Explanation:**
- `p=quarantine` - Quarantine suspicious emails (start with this, then upgrade to `reject` later)
- `rua` - Aggregate reports email
- `ruf` - Forensic reports email

---

### 2. **Use a Verified Sender Email**

**Current Issue:** Using a generic Gmail account can trigger spam filters.

**Solution:**
1. Use a custom domain email (e.g., `noreply@velcart.com` or `support@velcart.com`)
2. Verify this sender email with SendGrid and Mailjet
3. Update your `.env` file:

```env
# SendGrid
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=noreply@velcart.com

# Mailjet
MAILJET_API_KEY=your_mailjet_api_key
MAILJET_SECRET_KEY=your_mailjet_secret_key
MAILJET_FROM_EMAIL=noreply@velcart.com

# Gmail (Fallback only)
GMAIL_USER=noreply@velcart.com
GMAIL_PASS=your_app_specific_password
```

---

### 3. **SendGrid Domain Authentication** ⭐ RECOMMENDED

SendGrid provides the best deliverability when properly configured:

1. **Sign up / Log in** to SendGrid
2. Navigate to: **Settings → Sender Authentication**
3. Click **"Authenticate Your Domain"**
4. Choose your domain provider (GoDaddy, Namecheap, Cloudflare, etc.)
5. Follow the steps to add DNS records:
   - 3 CNAME records for DKIM
   - Verify SPF record exists
6. Wait for DNS propagation (can take up to 48 hours)
7. Verify the domain in SendGrid

**Benefits:**
- 95%+ inbox placement rate
- Email authentication badges (Gmail shows verified checkmark)
- Better sender reputation

---

### 4. **Mailjet Domain Authentication**

1. Log in to Mailjet Dashboard
2. Go to **Account Settings → Sender Domains & Addresses**
3. Click **"Add a new domain"**
4. Add your domain (e.g., `velcart.com`)
5. Add the DNS records they provide:
   - TXT record for SPF
   - TXT records for DKIM
6. Verify the domain

---

### 5. **Email Content Best Practices**

✅ **DO:**
- Use clear, descriptive subject lines
- Include plain text version (already implemented)
- Add unsubscribe link (already implemented)
- Keep HTML simple and well-formatted
- Include company name and address in footer
- Use professional email addresses

❌ **DON'T:**
- Use ALL CAPS in subject lines
- Use words like "FREE", "WINNER", "URGENT", "CLICK HERE"
- Send too many emails in short time
- Use URL shorteners
- Include too many links or images
- Use misleading subject lines

---

### 6. **Warm Up Your Email Domain**

If this is a new domain or you're just starting to send emails:

1. **Week 1:** Send to 50-100 recipients/day
2. **Week 2:** Increase to 500 recipients/day
3. **Week 3:** Increase to 1,000 recipients/day
4. **Week 4+:** Gradually increase volume

This helps build your sender reputation with email providers.

---

### 7. **Monitor Email Reputation**

Check your domain's email reputation regularly:

- **Google Postmaster Tools:** https://postmaster.google.com
- **Microsoft SNDS:** https://sendersupport.olc.protection.outlook.com/snds/
- **SenderScore:** https://www.senderscore.org
- **MXToolbox:** https://mxtoolbox.com/blacklists.aspx

---

### 8. **Test Email Deliverability**

Use these tools to test before sending to users:

1. **Mail Tester:** https://www.mail-tester.com
   - Send a test email to the provided address
   - Get a spam score out of 10
   - Follow recommendations to improve

2. **GlockApps:** https://glockapps.com
   - Test inbox placement across different providers

3. **Send Test Emails:**
   ```bash
   # Test to Gmail
   curl -X POST http://localhost:5000/api/test-email \
     -H "Content-Type: application/json" \
     -d '{"email": "your-gmail@gmail.com"}'
   
   # Test to Outlook
   curl -X POST http://localhost:5000/api/test-email \
     -H "Content-Type: application/json" \
     -d '{"email": "your-outlook@outlook.com"}'
   ```

---

### 9. **Configure Rate Limiting**

The code already includes rate limiting, but monitor your logs:

```typescript
// Current settings in mailer.ts:
maxConnections: 5,
maxMessages: 100,
rateDelta: 1000,
rateLimit: 5,
```

Adjust based on your email provider's limits:
- **SendGrid:** 100 emails/second (on paid plans)
- **Mailjet:** Varies by plan
- **Gmail:** 500 emails/day (free), 2000/day (Google Workspace)

---

### 10. **Update Environment Variables**

Make sure your `.env` file has all required values:

```env
# SendGrid (Recommended)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@velcart.com

# Mailjet (Backup)
MAILJET_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
MAILJET_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
MAILJET_FROM_EMAIL=noreply@velcart.com

# Gmail (Development/Fallback)
GMAIL_USER=noreply@velcart.com
GMAIL_PASS=xxxx xxxx xxxx xxxx  # App-specific password

# Optional: DKIM Private Key for Gmail
DKIM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"
```

---

## 📊 Quick Action Checklist

Priority | Task | Status
---------|------|-------
🔴 **HIGH** | Add SPF record to DNS | ⬜ 
🔴 **HIGH** | Authenticate domain in SendGrid | ⬜ 
🔴 **HIGH** | Use custom domain email (not Gmail) | ⬜ 
🟡 **MEDIUM** | Add DKIM records to DNS | ⬜ 
🟡 **MEDIUM** | Add DMARC record to DNS | ⬜ 
🟡 **MEDIUM** | Authenticate domain in Mailjet | ⬜ 
🟢 **LOW** | Test with mail-tester.com | ⬜ 
🟢 **LOW** | Set up Google Postmaster Tools | ⬜ 

---

## 🎯 Expected Results After Implementation

After completing all steps above:

1. **Inbox Placement Rate:** 95%+ (currently might be 50-70%)
2. **Spam Score:** Less than 2/10 (currently might be 5-7/10)
3. **Email Authentication:** All checks passing (SPF, DKIM, DMARC)
4. **Sender Reputation:** Good to Excellent
5. **Gmail:** Shows verified checkmark ✓ next to sender

---

## 🚨 Common Issues & Solutions

### Issue: Emails still going to spam after fixes

**Solutions:**
1. Check if DNS records have propagated (use https://dnschecker.org)
2. Verify domain authentication in SendGrid/Mailjet
3. Test email with mail-tester.com
4. Check if your IP is blacklisted (use MXToolbox)
5. Ensure you're using verified sender email

### Issue: SPF record fails

**Solution:**
- Make sure you have only ONE SPF record
- Include all email service providers in the record
- Use `~all` (soft fail) not `-all` (hard fail) initially

### Issue: DKIM fails

**Solution:**
- Verify DKIM keys are correctly added to DNS
- Check for typos in DNS records
- Wait for DNS propagation (up to 48 hours)
- Use DNS checker tools to verify

---

## 📧 Need Help?

1. **SendGrid Support:** https://support.sendgrid.com
2. **Mailjet Support:** https://www.mailjet.com/support/
3. **DNS Configuration:** Contact your domain provider (GoDaddy, Namecheap, Cloudflare, etc.)

---

## 🔄 Testing Your Fixes

After implementing the above changes, test with:

```bash
# Start your server
cd PHRMA-PRODUCTION-APP-BACKEND-MAIN
bun run dev

# Send a test OTP email
# (Use your actual API endpoint)
```

Check:
1. ✅ Email arrives in inbox (not spam)
2. ✅ Shows verified sender badge
3. ✅ Gmail shows authentication passed
4. ✅ Email formatting looks professional

---

**Last Updated:** February 12, 2026
**Status:** Code fixes implemented ✅ | DNS configuration required ⚠️
