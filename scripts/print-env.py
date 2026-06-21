with open("D:/AI APPS/Liv_DTF/.env.local") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#"):
            print(line)