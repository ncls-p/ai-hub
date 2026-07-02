#!/usr/bin/env bash
set -euo pipefail

image="${AI_HUB_SANDBOX_IMAGE:-ai-hub-sandbox-runner:local}"
context_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Building AI Hub sandbox runner image: ${image}"
docker build --target sandbox-runner --tag "${image}" "${context_dir}"
