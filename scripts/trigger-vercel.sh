#!/bin/bash
cd "/d/AI APPS/Liv_DTF"
TOKEN=$(cat /d/vercel-token.txt)
npx vercel --token "$TOKEN" --prod --yes 2>&1