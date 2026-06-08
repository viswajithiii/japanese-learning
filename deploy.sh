#!/bin/bash
if [ -z "$1" ]; then
    echo "Please provide a commit message."
    exit 1
fi

uv run build.py || exit 1
git add .
git commit -am "$1"
GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new" git push
