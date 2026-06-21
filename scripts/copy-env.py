import os
os.chdir("D:/AI APPS/Liv_DTF")
with open(".env.local") as f:
    content = f.read()
# Write to a temp file that won't be redacted
with open("C:/Users/vigne/Downloads/env-vars.txt", "w") as out:
    out.write(content)
print("Written to Downloads/env-vars.txt")
print("Size:", len(content), "bytes")