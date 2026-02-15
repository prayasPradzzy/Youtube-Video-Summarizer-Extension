# 🚦 Gemini API Rate Limits Guide

## Understanding the Issue

The error you're seeing:
```
Rate limit exceeded. The free tier has strict limits (15 requests/minute).
Please wait a minute and try again, or upgrade to a paid tier for higher limits.
```

This happens because **Google's Gemini API free tier has strict rate limits**.

---

## 📊 Current Gemini API Rate Limits (as of Feb 2026)

### Free Tier (API Key without billing)
- **Requests per minute (RPM):** 15
- **Requests per day (RPD):** 1,500
- **Tokens per minute (TPM):** 1 million

### Paid Tier (With billing enabled)
- **Requests per minute (RPM):** 360+ (varies by model)
- **Requests per day (RPD):** Higher or unlimited
- **Tokens per minute (TPM):** 4+ million

For the most current limits, check: https://ai.google.dev/gemini-api/docs/rate-limits

---

## 🔍 Why This Happens

Your extension:
1. Sends transcripts to Gemini for summarization
2. Long videos are split into chunks (each chunk = 1 API request)
3. Multiple retries for errors = more requests
4. **15 requests/minute limit is quickly reached**

Example: A 30-minute video might need 2-3 chunks = 2-3 requests. If you summarize 5 videos quickly, you'll hit the limit.

---

## ✅ Solutions & Workarounds

### Solution 1: Wait Between Requests (Already Implemented ✅)

**What changed:**
- ✅ Updated to use **Gemini 2.5 Flash** (newest, fastest model)
- ✅ Added **1.5 second delay between chunks**
- ✅ Increased **retry delays** (2s, 4s, 8s exponential backoff)
- ✅ Better **error messages**

**What this means:**
- Processing is slower but more reliable
- Less likely to hit rate limits
- Better handling when limits are hit

### Solution 2: Wait Before Retrying

When you see the rate limit error:
1. **Wait 60 seconds** before trying again
2. The limit resets every minute
3. Try summarizing shorter videos first

### Solution 3: Use Caching (Already Implemented ✅)

The extension caches summaries for 7 days:
- Same video won't be summarized twice
- Saves API requests
- Faster results on repeat views

### Solution 4: Upgrade to Paid Tier (Recommended for Heavy Use)

**How to enable billing:**
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click on "Get API Key"
3. Follow the billing setup process
4. Your rate limits increase 24x (15 → 360 RPM)

**Cost estimate:**
- Gemini 2.5 Flash: **Free tier** includes generous usage
- Beyond free tier: Very affordable for personal use
- Check current pricing: https://ai.google.dev/pricing

### Solution 5: Optimize Usage

**Tips to minimize API calls:**
1. **Shorter videos** = fewer chunks = fewer requests
2. **Don't repeatedly summarize** the same video (use cache)
3. **Wait between videos** if summarizing multiple
4. **Avoid rapid clicking** "Summarize" button

---

## 🔧 What We've Updated

### New Configuration

**[config.ts](src/config.ts):**
```typescript
model: 'gemini-2.5-flash' // Upgraded from 2.0-flash-lite
```

**[gemini.ts](src/services/gemini.ts):**
```typescript
PREFERRED_MODELS: [
  'gemini-2.5-flash',      // ⭐ Newest, fastest
  'gemini-2.5-pro',        // ⭐ Newest, most capable
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  // ... older models as fallbacks
]
CHUNK_DELAY: 1500ms        // Wait between chunks
INITIAL_RETRY_DELAY: 2000ms // Longer retry delays
```

### Why Gemini 2.5?

- **Faster processing** = quicker summaries
- **Better quality** = more accurate summaries
- **Same rate limits** but more efficient
- **Latest features** from Google

---

## 📈 Rate Limit Monitoring

### How to Check Your Usage

Currently, there's no built-in usage viewer in the extension, but you can:

1. **Check API Console:**
   - Visit [Google Cloud Console](https://console.cloud.google.com/)
   - View API usage and quotas

2. **Count Requests:**
   - Open browser console (F12)
   - Look for: `[YouTube Summarizer] Processing X chunk(s)`
   - Each chunk = 1 request

3. **Watch for Patterns:**
   - If you frequently hit limits, consider paid tier
   - If occasional, just wait 60 seconds

---

## 🚀 Quick Reference

### When You Hit Rate Limit:

```
❌ Error: "Rate limit exceeded..."
```

**Do this:**
1. ⏰ **Wait 60 seconds**
2. 🔄 Try again
3. 📊 If it happens often, consider paid tier

### To Rebuild Extension with Updates:

```bash
npm run build

# Then reload in chrome://extensions/
```

### To Check Logs:

1. Open Chrome DevTools (F12)
2. Go to extension service worker
3. Look for `[YouTube Summarizer]` logs

---

## 🎯 Best Practices

### For Free Tier Users:
- ✅ Summarize 1-2 videos at a time
- ✅ Wait 10-15 seconds between videos
- ✅ Use shorter videos when possible
- ✅ Let retries complete (don't spam the button)

### For Paid Tier Users:
- ✅ Summarize as many videos as you need
- ✅ Faster processing without delays
- ✅ More concurrent requests
- ✅ Peace of mind

---

## 📞 Troubleshooting

### "Still hitting rate limits after updates"

1. **Rebuild the extension:**
   ```bash
   npm run build
   ```

2. **Reload in Chrome:**
   - Go to `chrome://extensions/`
   - Click the reload icon on your extension

3. **Clear cache (if needed):**
   - Open extension popup
   - Right-click → Inspect
   - Application tab → Clear storage

### "Want to see current rate limits"

Check the official documentation:
- **Rate limits:** https://ai.google.dev/gemini-api/docs/rate-limits
- **Pricing:** https://ai.google.dev/pricing
- **Quota management:** https://console.cloud.google.com/

### "How to upgrade to paid tier"

1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Click "Get API Key" → "Enable billing"
3. Add payment method
4. Your rate limits automatically increase
5. No code changes needed!

---

## 💡 Summary

**Current Status:** ✅ Extension updated with:
- Newer, faster Gemini 2.5 Flash model
- Automatic delays between chunks
- Better rate limit handling
- Improved error messages

**What You Need to Do:**
1. Rebuild: `npm run build`
2. Reload extension in Chrome
3. Try summarizing again (wait 60s if you just hit the limit)
4. Consider paid tier if you use it frequently

**Free Tier is fine for:**
- Personal use
- 1-2 videos per session
- Occasional summaries

**Upgrade to paid if:**
- Frequent use (many videos per day)
- Professional/work use
- Want faster processing
- Don't want to wait between requests

---

## 📖 Additional Resources

- **Gemini API Docs:** https://ai.google.dev/docs
- **Rate Limits:** https://ai.google.dev/gemini-api/docs/rate-limits
- **Pricing:** https://ai.google.dev/pricing
- **API Keys:** https://aistudio.google.com/app/apikey
- **Support:** https://ai.google.dev/support

---

**Need help?** Check the [README.md](README.md) for development workflow and debugging tips.
