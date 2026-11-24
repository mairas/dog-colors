#!/usr/bin/env bash
#
# usage: scripts/check-pdfs.sh <repo-dir>
#
# Fails if the git repository at <repo-dir> tracks a PDF file.
#

set -o nounset
set -o pipefail
set -o errexit

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <repo-dir>" >&2
  exit 2
fi
cd "$1"

tracked=$(git ls-files -- ':(icase)*.pdf')
if [[ -n $tracked ]]; then
  echo "PDF files must never be committed; these are tracked:"
  echo "$tracked"
  exit 1
fi
echo "No PDF files are tracked"
