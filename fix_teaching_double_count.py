import re

with open("pages/RadiographerWorkloadPage.tsx", "r") as f:
    content = f.read()

# I want to replace lines like:
# stats.mrTeaching += Math.round(teachingAllocations[user.id]?.mrTeaching || 0) + (w.mrTeaching || w.mr_teaching || 0);
# with:
# stats.mrTeaching += Math.round(teachingAllocations[user.id]?.mrTeaching || 0);

def replacer(match):
    # match.group(1) is the left part: 'stats.mrTeaching += Math.round(teachingAllocations[user.id]?.mrTeaching || 0)'
    return match.group(1) + ";"

pattern = re.compile(r'(stats\.[a-zA-Z]+Teaching \+= Math\.round\(teachingAllocations\[user\.id\]\?.[a-zA-Z]+Teaching \|\| 0\))\s*\+\s*\(w\.[a-zA-Z]+Teaching \|\| w\.[a-zA-Z_]+teaching \|\| 0\);')
new_content = pattern.sub(replacer, content)

with open("pages/RadiographerWorkloadPage.tsx", "w") as f:
    f.write(new_content)

print("Done")
EOF
