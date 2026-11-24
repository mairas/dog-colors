#!/usr/bin/env bash
#
# usage: scripts/check-pdfs.sh [<base-ref>]
#
# Fails if the git repository in the current directory tracks a PDF file, by
# name (case-insensitive) or by content (a file that starts with %PDF-). Given
# <base-ref>, also fails if any commit in <base-ref>..HEAD added a path named
# like a PDF, or added or changed a file to start with %PDF-, even if a later
# commit deleted it. Fails closed: if git fails, so does the check.
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
readonly SIGPIPE_STATUS=141

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
  readonly PUBLIC="Once pushed they are public: tell the owner now. Rewriting the
branch only keeps them out of main and clears this check; GitHub serves the
pushed commits until GitHub Support purges them:"

  # --diff-merges=separate lists what each merge commit changed against each of
  # its parents, so a file added in the merge itself is seen. It also keeps the
  # path-limited name scan walking a merged side branch whose merge leaves the
  # PDF paths unchanged; --full-history only states that explicitly.
  # --no-renames lists a renamed file as an addition under its new name, so the
  # --diff-filter options below see it.
  function range_log {
    git log --full-history --diff-merges=separate --no-renames --format= \
      "$BASE..HEAD" "$@"
  }

  added_names=$(
    range_log --diff-filter=A --name-only -- "$PDF_PATHS" | sed '/^$/d' | sort -u
  )
  report "Commits in $BASE..HEAD added PDF files. $PUBLIC" "$added_names"

  # Every regular-file blob a commit in the range added or changed, as
  # "<blob><tab><path>". Symlinks (mode 120000) store a target path and gitlinks
  # (160000) name a commit, so neither holds file content.
  added_blobs=$(
    range_log --diff-filter=AMT --raw --no-abbrev |
      awk -F '\t' '{ split($1, meta, " ") } meta[2] ~ /^100/ { print meta[4] "\t" $2 }' |
      sort -u
  )
  # The list is sorted by blob, so each blob is read once. head stops reading
  # after the signature, so git cat-file may be killed by SIGPIPE on a large
  # blob; that status is expected, any other failure is not.
  added_content=$(
    checked_blob=''
    while IFS=$'\t' read -r blob path; do
      [[ -n $blob ]] || continue
      if [[ $blob != "$checked_blob" ]]; then
        checked_blob=$blob
        signature=$(git cat-file blob "$blob" | head -c ${#PDF_SIGNATURE}) ||
          [[ $? -eq $SIGPIPE_STATUS ]] || exit
      fi
      if [[ $signature == "$PDF_SIGNATURE" ]]; then
        printf '%s\n' "$path"
      fi
    done <<<"$added_blobs" | sort -u
  )
  report "Commits in $BASE..HEAD added files with PDF content. $PUBLIC" \
    "$added_content"
fi

if [[ $found -ne 0 ]]; then
  exit 1
fi
if [[ -n $BASE ]]; then
  echo "No PDF files are tracked or added in $BASE..HEAD"
else
  echo "No PDF files are tracked"
fi
