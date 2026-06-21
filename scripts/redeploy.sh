#!/bin/bash
# Redeploy the latest deployment in the Vercel project
# Uses the existing project ID from .vercel/project.json
cd "/d/AI APPS/Liv_DTF"
TOKEN=*** .vercel/project.json)
# Deploy local directory
npx vercel --token "$TOKEN" --prod --yes 2>&1