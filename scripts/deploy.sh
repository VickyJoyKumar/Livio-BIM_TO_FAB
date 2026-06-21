#!/bin/bash
cd "/d/AI APPS/Liv_DTF"
TOKEN="vcp_..."
echo "Setting env vars..."
npx vercel --token "$TOKEN" env add NEXT_PUBLIC_SUPABASE_URL production --yes <<< "https://vbigfxazqrzrastwafij.supabase.co"
npx vercel --token "$TOKEN" env add NEXT_PUBLIC_SUPABASE_ANON_KEY production --yes <<< "eyJhbG...eyJ..."
npx vercel --token "$TOKEN" env add SUPABASE_SERVICE_ROLE_KEY production --yes <<< "eyJhbG...eyJ..."
echo "Deploying..."
npx vercel --token "$TOKEN" --prod 2>&1