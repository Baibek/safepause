#!/usr/bin/env bash
# Maven Central answers Gradle's parallel bursts with HTTP 429 from some networks. This copies every
# artifact a failed build reported as missing into ~/.m2 one by one (mavenLocal() is listed first).
set -u
LOG="$1"
grep -oE "https://repo\.maven\.apache\.org/maven2/[^ ]+\.(jar|aar|pom)" "$LOG" | sort -u | while read -r url; do
  rel="${url#https://repo.maven.apache.org/maven2/}"
  dest="$HOME/.m2/repository/$rel"
  [ -s "$dest" ] && continue
  mkdir -p "$(dirname "$dest")"
  base="${url%.*}"
  for ext in pom "${url##*.}"; do
    d="${dest%.*}.$ext"; [ -s "$d" ] && continue
    for t in 1 2 3 4 5; do curl -sfL -o "$d" "$base.$ext" && break; sleep $((t * 3)); done
  done
  echo "fetched $rel"
done
