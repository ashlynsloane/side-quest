#!/usr/bin/env bash
# Guard against accidentally committing generated Supabase links and likely
# private credentials. Does not replace GitGuardian or server-side scanning.
set -euo pipefail
cd "$(dirname "$0")/.."
bad=0
while IFS= read -r -d '' tracked; do
  case "$tracked" in
    .env|*/.env|.env.*|*/.env.*)
      case "$tracked" in
        .env.example|*/.env.example|.env.template|*/.env.template) ;;
        *) echo "Forbidden tracked environment file: $tracked" >&2; bad=1 ;;
      esac
      ;;
    supabase/.temp/*|*/.supabase/.temp/*|*/id_rsa|id_rsa|*.pem|*.p12|*.pfx|*.tfstate|*.tfstate.backup)
      echo "Forbidden tracked secret/connection-metadata path: $tracked" >&2
      bad=1
      ;;
    .npmrc|*/.npmrc)
      echo "Unexpected tracked npm credential configuration: $tracked" >&2
      bad=1
      ;;
  esac
done < <(git ls-files -z)
if [[ "$bad" != 0 ]]; then
  echo "Refusing CI: remove sensitive paths from version control." >&2
  exit 1
fi
echo "Tracked sensitive-path audit passed."
