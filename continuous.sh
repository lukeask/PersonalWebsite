#!/bin/bash
echo "Starting Server"
while true; do
    git stash
    git pull
    python make_public.py
    timeout 7200 python lukeaskew.py
done
