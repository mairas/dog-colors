#!/usr/bin/env bash
#
# usage: scripts/check-pdfs.sh [<base-ref>]
#
# Fails if the git repository in the current directory tracks a PDF file, by
# name (case-insensitive) or by content (a file that starts with %PDF-). Given
# <base-ref>, also fails if any commit in <base-ref>..HEAD added a path named
# like a PDF, even if a later commit deleted it.
#

set -o nounset
set -o pipefail
set -o errexit

if [[ $# -gt 1 ]]; then
  echo "usage: $0 [<base-ref>]" >&2
  exit 2
fi
readonly BASE=${1:-}
readonly PDF_PATHS=':(icase)*.pdf'
readonly PDF_SIGNATURE='%PDF-'

found=0

function report {
  local heading=$1 paths=$2
  if [[ -n $paths ]]; then
    echo "$heading"
    echo "$paths"
    found=1
  fi
}

# Each scan is assigned on its own line so that errexit and pipefail stop the
# script when git fails, instead of a failed scan reading as a clean one.
tracked_names=$(git ls-files -- "$PDF_PATHS")
report "PDF files must never be committed; these are tracked:" "$tracked_names"

# head reads only the signature's length from each file, so a large file costs
# no more than a small one. Symlinks are skipped: git stores their target path,
# not the target's content.
tracked_content=$(
  git ls-files -z | while IFS= read -r -d '' path; do
    if [[ -f $path && ! -L $path ]]; then
      signature=$(head -c ${#PDF_SIGNATURE} -- "$path") || exit
      if [[ $signature == "$PDF_SIGNATURE" ]]; then
        printf '%s\n' "$path"
      fi
    fi
  done
)
report "These tracked files hold PDF content:" "$tracked_content"

if [[ -n $BASE ]]; then
  if ! git rev-parse --verify --quiet "$BASE^{commit}" >/dev/null; then
    echo "Base ref '$BASE' does not name a commit" >&2
    exit 2
  fi
  # --full-history keeps merged side branches that a path filter would
  # otherwise simplify away; --diff-merges=separate shows files added in a
  # merge itself; --no-renames reports a rename to *.pdf as an addition.
  added_names=$(
    git log --full-history --diff-merges=separate --no-renames \
      --diff-filter=A --name-only --format= "$BASE..HEAD" -- "$PDF_PATHS" |
      sed '/^$/d' | sort -u
  )
  report "Commits in $BASE..HEAD added PDF files. Once pushed they are public:
tell the owner now. Rewriting the branch only keeps them out of main and clears
this check; GitHub serves the pushed commits until GitHub Support purges them:" \
    "$added_names"
fi

if [[ $found -ne 0 ]]; then
  exit 1
fi
if [[ -n $BASE ]]; then
  echo "No PDF files are tracked or added in $BASE..HEAD"
else
  echo "No PDF files are tracked"
fi
