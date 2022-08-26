#!/bin/bash
echo "Starting Server"
while true; do
    git stash
    git pull
    python make_public.py
    timeout 1800 python lukeaskew.py
done
