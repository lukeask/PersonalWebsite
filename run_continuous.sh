
echo "Starting Server"
while timeout -k 70 python test.py; do
    git stash
    git pull
    python make_public.py
    python lukeaskew.py
done
