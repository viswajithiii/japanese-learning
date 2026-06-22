#!/usr/bin/env python3
"""Validate track JSON files against blueprint quality guardrails."""
import json, glob, sys

def validate(pattern="tracks_*.json", exclude_dir="tracks_v1"):
    files = sorted(f for f in glob.glob(pattern) if exclude_dir not in f)
    if not files:
        print("No track files found matching pattern.")
        sys.exit(1)

    total_tracks = 0
    total_steps = 0
    issues = []

    for filepath in files:
        try:
            with open(filepath) as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"❌ {filepath}: Invalid JSON - {e}")
            continue

        print(f"=== {filepath} ===")
        for t in data["tracks"]:
            tid = t["id"]
            steps = len(t["steps"])
            exercises = sum(1 for s in t["steps"] if s["type"] == "exercise")
            expos = sum(1 for s in t["steps"] if s["type"] == "exposition")
            status = "✅" if steps >= 10 else "❌"
            print(f"  Track {tid}: {steps} steps ({expos} expo + {exercises} ex) {status}")

            if steps < 10:
                issues.append(f"Track {tid}: only {steps} steps (min 10)")

            total_tracks += 1
            total_steps += steps
        print()

    print(f"Total: {total_tracks} tracks, {total_steps} steps")
    if issues:
        print(f"\n⚠️  {len(issues)} issue(s):")
        for i in issues:
            print(f"  - {i}")
    else:
        print("✅ All tracks pass validation!")

if __name__ == "__main__":
    validate()
