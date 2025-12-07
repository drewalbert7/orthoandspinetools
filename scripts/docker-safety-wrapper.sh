#!/bin/bash

# DOCKER SAFETY WRAPPER
# This script wraps dangerous docker commands to prevent accidental database deletion
# Usage: source this script or add to your .bashrc to intercept dangerous commands

# Configuration
PROJECT_ROOT="/home/dstrad/orthoandspinetools-main"
PROTECTION_SCRIPT="$PROJECT_ROOT/scripts/database-volume-protection.sh"

# Protected volumes
PROTECTED_VOLUMES=(
    "orthoandspinetools-main_postgres_data"
    "orthoandspinetools-medical-platform_postgres_data"
)

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if command involves protected volumes
check_protected_volumes() {
    local command="$*"
    
    for volume in "${PROTECTED_VOLUMES[@]}"; do
        if [[ "$command" == *"$volume"* ]]; then
            return 0  # Protected volume found
        fi
    done
    
    # Check for dangerous flags
    if [[ "$command" == *"prune"* ]] && [[ "$command" == *"volume"* ]]; then
        return 0  # Volume prune is dangerous
    fi
    
    if [[ "$command" == *"down"* ]] && [[ "$command" == *"-v"* ]]; then
        return 0  # docker compose down -v is dangerous
    fi
    
    return 1  # Not dangerous
}

# Safe docker volume rm wrapper
docker_volume_rm_safe() {
    local volumes=("$@")
    
    for volume in "${volumes[@]}"; do
        for protected in "${PROTECTED_VOLUMES[@]}"; do
            if [[ "$volume" == "$protected" ]]; then
                echo -e "${RED}🚨 PROTECTED VOLUME DETECTED: $volume${NC}"
                echo -e "${YELLOW}Use the protection script to delete protected volumes:${NC}"
                echo "  $PROTECTION_SCRIPT protect $volume"
                return 1
            fi
        done
    done
    
    # Safe to proceed
    command docker volume rm "$@"
}

# Safe docker compose down wrapper
docker_compose_down_safe() {
    local args=("$@")
    
    # Check for -v flag
    for arg in "${args[@]}"; do
        if [[ "$arg" == "-v" ]] || [[ "$arg" == "--volumes" ]]; then
            echo -e "${RED}🚨 DANGEROUS OPERATION DETECTED: docker compose down -v${NC}"
            echo -e "${YELLOW}This will delete ALL volumes including the database!${NC}"
            echo ""
            echo "To proceed, you must:"
            echo "  1. Create a backup first"
            echo "  2. Use: $PROTECTION_SCRIPT backup"
            echo "  3. Then manually confirm the operation"
            return 1
        fi
    done
    
    # Safe to proceed (no -v flag)
    command docker compose down "$@"
}

# Safe docker volume prune wrapper
docker_volume_prune_safe() {
    echo -e "${RED}🚨 DANGEROUS OPERATION DETECTED: docker volume prune${NC}"
    echo -e "${YELLOW}This will delete ALL unused volumes including potentially the database!${NC}"
    echo ""
    echo "This operation is BLOCKED to prevent accidental data loss."
    echo "If you need to prune volumes, do it manually with specific volume names."
    return 1
}

# Main wrapper function
docker_safe() {
    local command="$1"
    shift
    local args=("$@")
    
    case "$command" in
        "volume")
            case "${args[0]}" in
                "rm"|"remove")
                    docker_volume_rm_safe "${args[@]:1}"
                    ;;
                "prune")
                    docker_volume_prune_safe "$@"
                    ;;
                *)
                    command docker volume "$command" "$@"
                    ;;
            esac
            ;;
        "compose"|"docker-compose")
            if [[ "${args[0]}" == "down" ]]; then
                docker_compose_down_safe "${args[@]:1}"
            else
                command docker compose "$@"
            fi
            ;;
        *)
            # Not a dangerous command, proceed normally
            command docker "$command" "$@"
            ;;
    esac
}

# Export functions for use
export -f docker_volume_rm_safe
export -f docker_compose_down_safe
export -f docker_volume_prune_safe
export -f docker_safe

echo -e "${YELLOW}Docker safety wrapper loaded. Protected volumes are:${NC}"
for volume in "${PROTECTED_VOLUMES[@]}"; do
    echo "  - $volume"
done

