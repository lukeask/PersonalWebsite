#!/bin/bash
echo "Starting Server"
while true; do
    git stash
    git pull
    python make_public.py
    timeout 70 python lukeaskew.py
done
