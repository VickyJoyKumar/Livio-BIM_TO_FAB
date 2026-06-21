#!/bin/bash
curl -s -X POST \
  -H "Authorization: Bearer vcp_25Sj5viOursqfHbypHI4vVLUzhtHqtS0VLw3LqToIi7Rpct3Uf0aZZO3" \
  -H "Content-Type: application/json" \
  -d '{"name":"livio-bim-to-fab","gitSource":{"type":"github","repo":"VickyJoyKumar/Livio-BIM_TO_FAB","ref":"master"}}' \
  "https://api.vercel.com/v13/deployments"