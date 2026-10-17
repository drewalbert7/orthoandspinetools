#!/bin/bash
# Rollback helpers for deploy.sh (sourced, not executed).
#
# Why this exists: the old rollback tagged the previous images as
# orthoandspinetools-{backend,frontend}:rollback, names compose never uses, then ran
# "compose up" on the compose image names, which by then pointed at the NEW build.
# A failed deploy therefore came back up on the new (failing) images.
#
# How it works now:
#   1. dr_record   (before build) resolves the exact image name compose uses for each
#                  app service (from the running container, cross-checked against
#                  "docker compose config --images"), records the running image ID and
#                  tags it as <name>:pre-deploy-<ts>. Those tags are kept on purpose.
#   2. dr_rollback (on failure) retags <name>:pre-deploy-<ts> back to the exact compose
#                  name (<name>:latest), runs "up -d --no-build --no-deps --force-recreate"
#                  for the app services, force-recreates the proxy, verifies the running
#                  image IDs equal the recorded ones and re-runs a health check.
#                  It never runs compose with --build and never touches postgres.
#
# Inputs (globals, set by the caller):
#   COMPOSE_FILE            compose file to use (required)
#   DEPLOY_APP_SERVICES     app services to record/roll back (default "backend frontend")
#   DEPLOY_PROXY_SERVICE    proxy to force-recreate after rollback (default "nginx", "" to skip)
#   ROLLBACK_HEALTH_TIMEOUT seconds to wait for health after rollback (default 60)
#   ROLLBACK_HEALTH_INTERVAL seconds between health attempts (default 5)
#   dr_health_check         function the caller defines; returns 0 when healthy

DEPLOY_APP_SERVICES="${DEPLOY_APP_SERVICES:-backend frontend}"
DEPLOY_PROXY_SERVICE="${DEPLOY_PROXY_SERVICE-nginx}"
ROLLBACK_HEALTH_TIMEOUT="${ROLLBACK_HEALTH_TIMEOUT:-60}"
ROLLBACK_HEALTH_INTERVAL="${ROLLBACK_HEALTH_INTERVAL:-5}"

declare -gA DR_IMAGE_NAME=()   # service -> compose image name with tag (e.g. proj-backend:latest)
declare -gA DR_OLD_ID=()       # service -> image ID the running container used before deploy
DR_TS=""

dr_compose() {
    docker compose -f "$COMPOSE_FILE" "$@"
}

# Add ":latest" when an image reference has no tag (compose and docker both mean :latest).
dr_with_tag() {
    local ref="$1"
    local last="${ref##*/}"
    case "$last" in
        *@*) echo "$ref" ;;
        *:*) echo "$ref" ;;
        *)   echo "$ref:latest" ;;
    esac
}

# Strip the tag from an image reference (keeps registry host:port intact).
dr_repo() {
    local ref="$1"
    local last="${ref##*/}"
    if [[ "$last" == *:* ]]; then
        echo "${ref%:*}"
    else
        echo "$ref"
    fi
}

# Print the image name compose uses for a running service, normalized to name:tag.
# Fails if the service is not running or the name is not one compose would use.
dr_resolve_image_name() {
    local svc="$1" cid name images
    cid="$(dr_compose ps -q "$svc" 2>/dev/null | head -n1)"
    if [ -z "$cid" ]; then
        return 1
    fi
    name="$(docker inspect --format '{{.Config.Image}}' "$cid")" || return 1
    name="$(dr_with_tag "$name")"
    images="$(dr_compose config --images 2>/dev/null)" || return 1
    local img
    while IFS= read -r img; do
        [ -z "$img" ] && continue
        if [ "$(dr_with_tag "$img")" = "$name" ]; then
            echo "$name"
            return 0
        fi
    done <<< "$images"
    echo "   ❌ $svc runs image '$name' which is not in 'docker compose config --images'" >&2
    return 1
}

# Record running image IDs and tag them <name>:pre-deploy-<ts>.
# Returns 0 if every app service was recorded, 1 if any service is not running
# (first deploy; no rollback possible), 2 on an inconsistency that should abort the deploy.
dr_record() {
    DR_TS="${1:-$(date -u +%Y%m%d-%H%M%S)}"
    local svc cid name id missing=0
    for svc in $DEPLOY_APP_SERVICES; do
        cid="$(dr_compose ps -q "$svc" 2>/dev/null | head -n1)"
        if [ -z "$cid" ]; then
            echo "   $svc: (not running, nothing to roll back to)"
            missing=1
            continue
        fi
        name="$(dr_resolve_image_name "$svc")" || return 2
        id="$(docker inspect --format '{{.Image}}' "$cid")" || return 2
        docker tag "$id" "$(dr_repo "$name"):pre-deploy-$DR_TS" || return 2
        DR_IMAGE_NAME[$svc]="$name"
        DR_OLD_ID[$svc]="$id"
        echo "   $svc: ${id#sha256:} -> tagged $(dr_repo "$name"):pre-deploy-$DR_TS (compose name $name)"
    done
    return $missing
}

# Print the image ID the running container of a service uses (empty if none).
dr_running_id() {
    local cid
    cid="$(dr_compose ps -q "$1" 2>/dev/null | head -n1)"
    if [ -n "$cid" ]; then docker inspect --format '{{.Image}}' "$cid"; fi
}

dr_wait_healthy() {
    local elapsed=0
    while [ "$elapsed" -lt "$ROLLBACK_HEALTH_TIMEOUT" ]; do
        if dr_health_check > /dev/null 2>&1; then
            return 0
        fi
        sleep "$ROLLBACK_HEALTH_INTERVAL"
        elapsed=$((elapsed + ROLLBACK_HEALTH_INTERVAL))
        echo "   Waiting for health after rollback... ($elapsed/${ROLLBACK_HEALTH_TIMEOUT}s)"
    done
    dr_health_check > /dev/null 2>&1
}

dr_rollback() {
    echo ""
    echo "🔙 ROLLING BACK to pre-deploy images (tag pre-deploy-$DR_TS)..."
    local svc name pre ok=0
    for svc in $DEPLOY_APP_SERVICES; do
        if [ -z "${DR_OLD_ID[$svc]:-}" ]; then
            echo "   ❌ No previous image recorded for $svc. Cannot roll back."
            echo "      Manual intervention required!"
            return 1
        fi
    done

    # Point the exact compose names back at the old images.
    for svc in $DEPLOY_APP_SERVICES; do
        name="${DR_IMAGE_NAME[$svc]}"
        pre="$(dr_repo "$name"):pre-deploy-$DR_TS"
        if [ "$(docker image inspect --format '{{.Id}}' "$pre" 2>/dev/null)" != "${DR_OLD_ID[$svc]}" ]; then
            echo "   ❌ $pre is missing or no longer points at ${DR_OLD_ID[$svc]#sha256:}"
            return 1
        fi
        docker tag "$pre" "$name" || return 1
        echo "   $svc: $name -> ${DR_OLD_ID[$svc]#sha256:}"
    done

    # Recreate app containers from the retagged images. Never --build; --no-deps so
    # postgres (and anything else) is left alone.
    # shellcheck disable=SC2086
    dr_compose up -d --no-build --no-deps --force-recreate $DEPLOY_APP_SERVICES || return 1
    if [ -n "$DEPLOY_PROXY_SERVICE" ]; then
        echo "   🔄 Refreshing $DEPLOY_PROXY_SERVICE upstream connections..."
        dr_compose up -d --no-build --no-deps --force-recreate "$DEPLOY_PROXY_SERVICE" || return 1
    fi

    # Verify the containers really are back on the recorded image IDs.
    local running
    for svc in $DEPLOY_APP_SERVICES; do
        running="$(dr_running_id "$svc")"
        if [ "$running" = "${DR_OLD_ID[$svc]}" ]; then
            echo "   ✅ $svc running ${running#sha256:} (matches pre-deploy)"
        else
            echo "   ❌ $svc running '${running#sha256:}', expected ${DR_OLD_ID[$svc]#sha256:}"
            ok=1
        fi
    done
    [ "$ok" -eq 0 ] || return 1

    if dr_wait_healthy; then
        echo "   ✅ Rollback health check passed"
        return 0
    fi
    echo "   ❌ Rollback health check failed"
    return 1
}
