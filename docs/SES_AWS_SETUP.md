# Amazon SES setup — OrthoAndSpineTools (AWS-compliant)

Use this checklist when you have AWS Console access. The application code is ready; you only need AWS resources and server `.env` values.

**Region:** `us-east-2` (Ohio) — must match `AWS_SES_REGION`.

---

## 1. Verify sending identity

1. **SES → Verified identities → Create identity**
2. Choose **Domain**: `orthoandspinetools.com`
3. Add the **DKIM** DNS records SES provides (Route 53 or your DNS host)
4. Wait until status is **Verified**

**From address** (must use verified domain):

```env
EMAIL_FROM=noreply@orthoandspinetools.com
EMAIL_FROM_NAME=OrthoAndSpineTools
EMAIL_REPLY_TO=support@orthoandspinetools.com
```

(`EMAIL_REPLY_TO` is optional but recommended.)

---

## 2. Dedicated IAM user (do not share keys with other projects)

1. **IAM → Users → Create user** — name: `ses-orthoandspinetools-prod`
2. **No console access**
3. Attach inline policy from [`scripts/aws-ses-iam-policy.json`](../scripts/aws-ses-iam-policy.json)
   - Replace `YOUR_AWS_ACCOUNT_ID` with your 12-digit account ID
4. **Security credentials → Create access key** → Application running outside AWS
5. Copy keys once; add **only** to server `~/orthoandspinetools-main/.env`:

```env
AWS_SES_REGION=us-east-2
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Never commit these to git.

---

## 3. Configuration set (metrics + event routing)

1. **SES → Configuration sets → Create**
   - Name: `orthoandspinetools-prod`
2. **Event destinations → Add destination → SNS**
   - Event types: **Bounces**, **Complaints** (optional: Deliveries)
   - SNS topic: create `orthoandspinetools-ses-events` (same region)

```env
AWS_SES_CONFIGURATION_SET=orthoandspinetools-prod
```

---

## 4. SNS topic → HTTPS webhook

1. Open SNS topic `orthoandspinetools-ses-events`
2. **Create subscription**
   - Protocol: **HTTPS**
   - Endpoint: `https://orthoandspinetools.com/api/ses/events`
3. SNS will send a **SubscriptionConfirmation**; the backend auto-confirms when the app is running and the topic ARN matches.

```env
AWS_SES_SNS_TOPIC_ARN=arn:aws:sns:us-east-2:YOUR_AWS_ACCOUNT_ID:orthoandspinetools-ses-events
```

**Security (implemented in app):**

- SNS messages are **signature-verified** (AWS certificate chain)
- Only messages from `AWS_SES_SNS_TOPIC_ARN` are accepted in production
- Bounce/complaint recipients are added to the **email suppression** list

---

## 5. Production access (leave sandbox)

While in **sandbox**, SES only sends to verified recipient addresses.

1. **SES → Account dashboard → Request production access**
2. Explain: transactional mail only (welcome, verify, password reset, optional digest)
3. After approval, mail can go to any valid address

---

## 6. Deploy env and restart

On the server:

```bash
cd ~/orthoandspinetools-main
# Edit .env with all variables above
docker compose -f docker-compose.prod.yml build --no-cache backend
docker compose -f docker-compose.prod.yml up -d backend
./scripts/ses-webhook-status.sh   # confirm AWS_SES_SNS_TOPIC_ARN is set
```

Check logs:

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=50 | grep -i SES
```

Should see: `SES email: ready to send when AWS credentials are valid`

---

## 7. Smoke tests

| Test | Expect |
|------|--------|
| `POST /api/auth/forgot-password` with a registered email | Log: `Password reset email dispatched` |
| Inbox | Reset link from `noreply@orthoandspinetools.com` |
| Invalid IAM keys | Log: `InvalidClientTokenId` — rotate keys |
| SNS test (after subscription) | Bounce/complaint updates suppression table |

---

## Server `.env` reference (complete)

See [`backend/env.example`](../backend/env.example). Required for sending:

- `AWS_SES_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `EMAIL_FROM`
- `PUBLIC_SITE_URL`

Strongly recommended in production:

- `AWS_SES_SNS_TOPIC_ARN`
- `AWS_SES_CONFIGURATION_SET`
- `EMAIL_REPLY_TO`

---

## What the app enforces

- Suppression list before every send (bounces/complaints from SNS)
- No reset tokens in production logs
- Rate limit on forgot-password / resend-verification (5 per 15 min per IP+email)
- HTML escaping in email bodies
- SES message tags: `project=orthoandspinetools`, `kind=transactional|digest`
- Digest emails include preference/unsubscribe footer linking to Profile Settings
