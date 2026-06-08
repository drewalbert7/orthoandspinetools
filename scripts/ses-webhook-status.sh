#!/usr/bin/env bash
# Check SES + SNS webhook readiness on the production server.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BASE="${BASE_URL:-https://orthoandspinetools.com}"

echo "SES / SNS webhook status"
echo ""

if docker compose -f "$COMPOSE_FILE" ps backend 2>/dev/null | grep -q Up; then
  docker compose -f "$COMPOSE_FILE" exec -T backend sh -c '
    echo "Backend env:"
    test -n "$AWS_ACCESS_KEY_ID" && echo "  AWS_ACCESS_KEY_ID=set" || echo "  AWS_ACCESS_KEY_ID=missing"
    test -n "$AWS_SECRET_ACCESS_KEY" && echo "  AWS_SECRET_ACCESS_KEY=set" || echo "  AWS_SECRET_ACCESS_KEY=missing"
    test -n "$AWS_SES_REGION" && echo "  AWS_SES_REGION=$AWS_SES_REGION" || echo "  AWS_SES_REGION=missing"
    test -n "$EMAIL_FROM" && echo "  EMAIL_FROM=$EMAIL_FROM" || echo "  EMAIL_FROM=missing"
    test -n "$AWS_SES_CONFIGURATION_SET" && echo "  AWS_SES_CONFIGURATION_SET=$AWS_SES_CONFIGURATION_SET" || echo "  AWS_SES_CONFIGURATION_SET=not set (optional)"
    if test -n "$AWS_SES_SNS_TOPIC_ARN"; then
      echo "  AWS_SES_SNS_TOPIC_ARN=$AWS_SES_SNS_TOPIC_ARN"
    else
      echo "  AWS_SES_SNS_TOPIC_ARN=missing — bounce/complaint events will be REJECTED in production"
    fi
  '
else
  echo "Backend container not running; check .env manually."
fi

echo ""
echo "Webhook endpoint: POST $BASE/api/ses/events"
echo "Setup guide: docs/SES_AWS_SETUP.md (sections 3–5)"
echo ""
echo "AWS Console steps still required:"
echo "  1. SES configuration set with SNS destination (bounces + complaints)"
echo "  2. SNS HTTPS subscription → $BASE/api/ses/events"
echo "  3. Set AWS_SES_SNS_TOPIC_ARN in server .env and restart backend"
echo "  4. Request SES production access (leave sandbox)"
