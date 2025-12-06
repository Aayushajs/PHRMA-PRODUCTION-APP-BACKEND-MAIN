# 📧 Email Configuration for Production Deployment

## 🚀 Setup Gmail App Password for Production

### Step 1: Enable 2-Step Verification
1. Go to your Google Account: https://myaccount.google.com
2. Navigate to **Security** → **2-Step Verification**
3. Follow the prompts to enable 2-Step Verification

### Step 2: Generate App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Select app: **Mail**
3. Select device: **Other (Custom name)** → Enter "Epharma Backend"
4. Click **Generate**
5. Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)
6. Remove spaces: `abcdefghijklmnop`

### Step 3: Update Environment Variables

#### For Local Development (`config/.env`):
```env
GMAIL_USER=your-email@gmail.com
GMAIL_PASS=your-16-char-app-password
```

#### For Render Deployment:
1. Go to your Render Dashboard
2. Select your service
3. Go to **Environment** tab
4. Add these environment variables:
   - `GMAIL_USER` = `your-email@gmail.com`
   - `GMAIL_PASS` = `your-16-char-app-password`
5. Click **Save Changes**
6. Render will automatically redeploy

---

## ✅ What's Fixed in Production

### 1. **Proper SMTP Configuration**
```typescript
host: 'smtp.gmail.com',
port: 587,              // Correct port for TLS
secure: false,          // false for port 587
tls: {
    rejectUnauthorized: false  // Handles production SSL issues
}
```

### 2. **Connection Verification**
- Server verifies SMTP connection on startup
- Shows ✅ success or ❌ error in logs

### 3. **Retry Logic**
- Automatically retries 3 times if email fails
- Exponential backoff between retries
- Detailed error messages

### 4. **Professional HTML Emails**
- Beautiful OTP email template
- Mobile-responsive design
- Clear expiration notice (3 minutes)

### 5. **Better Error Handling**
```typescript
if (error.code === 'EAUTH') {
    // Shows specific instructions for authentication errors
}
if (error.code === 'ECONNECTION') {
    // Handles network issues with retry
}
```

### 6. **Error Types Handled**
- `EAUTH` - Authentication failed (wrong credentials)
- `ECONNECTION` - Network connection issues
- `ETIMEDOUT` - Timeout errors
- `EMESSAGE` - Invalid email format

---

## 🧪 Testing

### Test Locally:
```bash
npm run dev
```

### Test Email Sending:
```bash
POST http://localhost:5000/api/user/forgot-password
Content-Type: application/json

{
    "email": "test@example.com"
}
```

### Check Logs:
- ✅ "SMTP Server is ready to send emails" = Success
- ❌ "SMTP Connection Error" = Check credentials
- 📧 "Email sent successfully" = Email delivered
- 🔒 "Authentication failed" = Generate new App Password

---

## 🔧 Troubleshooting

### Problem: "Authentication failed"
**Solution:**
1. Verify 2-Step Verification is enabled
2. Generate NEW App Password (old ones expire)
3. Use App Password, NOT your Gmail password
4. Remove all spaces from App Password

### Problem: "SMTP Connection Error"
**Solution:**
1. Check internet connection on server
2. Verify Render environment variables are set
3. Try regenerating App Password
4. Check Gmail account isn't blocked

### Problem: Emails not received
**Solution:**
1. Check spam/junk folder
2. Verify email address is correct
3. Check Gmail "Sent" folder to confirm it was sent
4. Try with different email provider (Yahoo, Outlook)

### Problem: "ETIMEDOUT"
**Solution:**
1. Server firewall might be blocking port 587
2. Try port 465 with `secure: true`
3. Check Render service logs for network issues

---

## 📝 Environment Variables Checklist

### Required Variables:
- ✅ `GMAIL_USER` - Your Gmail address
- ✅ `GMAIL_PASS` - 16-character App Password (NOT regular password)

### Optional (for debugging):
- `NODE_ENV=production` - Set in production
- `DEBUG=smtp` - Enable SMTP debug logs

---

## 🚀 Deployment Checklist

- [ ] 2-Step Verification enabled on Gmail
- [ ] App Password generated
- [ ] Environment variables set in Render
- [ ] Service redeployed
- [ ] Test forgot password API
- [ ] Check email received
- [ ] Verify OTP works
- [ ] Check production logs

---

## 📞 Support

If emails still not working:
1. Check Render logs: `View Logs` in dashboard
2. Look for "✅ SMTP Server is ready" message
3. Test with `node config/testingMailer.ts`
4. Contact support with error messages

---

## 🎯 Production Email Features

✅ **HTML Email Templates** - Professional looking emails  
✅ **Retry Logic** - 3 automatic retries  
✅ **Error Handling** - Detailed error messages  
✅ **Connection Pooling** - Faster email sending  
✅ **Timeout Protection** - Prevents hanging requests  
✅ **Security** - TLS encryption enabled  
✅ **Logging** - Complete audit trail  

---

## 📊 Email Delivery Status

The API now returns proper status:
- ✅ **200**: Email sent successfully
- ❌ **500**: Email sending failed (check logs)

Redis OTP is deleted if email fails, preventing confusion.
