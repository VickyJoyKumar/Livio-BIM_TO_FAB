#!/bin/bash
# Deploy to Vercel using token from environment
# Usage: VERCEL_TOKEN="xxxx" ./scripts/vercel-deploy.sh
cd "/d/AI APPS/Liv_DTF"
export VERCEL_TOKEN
npx vercel --token "$VERCEL_TOKEN" --yes --prod 2>&1