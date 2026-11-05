#!/usr/bin/env bash
# Build and publish dist/ to gh-pages as a normal (fast-forward) commit on top of the existing branch — never a force push.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run build
SRC=$(git rev-parse --short HEAD)
tmpdir=$(mktemp -d)
git clone -q --branch gh-pages --single-branch https://github.com/smartlotus/lotus30-figures-web.git "$tmpdir"
find "$tmpdir" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a dist/. "$tmpdir/"
cd "$tmpdir"
git add -A
if git diff --cached --quiet; then echo "gh-pages already up to date"; exit 0; fi
git -c user.email="227950577+smartlotus@users.noreply.github.com" -c user.name="smartlotus" commit -qm "Deploy lotus30 figures showcase @ $SRC"
git push -q origin gh-pages
echo "pushed gh-pages $(git rev-parse --short HEAD) → https://smartlotus.github.io/lotus30-figures-web/"
