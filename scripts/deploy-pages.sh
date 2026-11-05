#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run build
# copy models+posters into dist
cp -R public/models dist/models
cp -R public/posters dist/posters
# publish dist to gh-pages
tmpdir=$(mktemp -d)
cp -a dist/. "$tmpdir/"
cd "$tmpdir"
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.email="227950577+smartlotus@users.noreply.github.com" -c user.name="smartlotus" commit -qm "Deploy lotus30 figures showcase"
git remote add origin https://github.com/smartlotus/lotus30-figures-web.git
git push -qf origin gh-pages
echo "pushed gh-pages → https://smartlotus.github.io/lotus30-figures-web/"
