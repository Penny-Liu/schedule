import re

with open("pages/RadiographerWorkloadPage.tsx", "r") as f:
    content = f.read()

# I want to add console.log before teachingAllocations is assigned
debug_code = """                      if (actualPoints > 0) {
                        if (student.name === "張庭榕" && field === "usPelvisMale") {
                          console.log("TEACHING DEBUG:", {
                            date: shift.date,
                            student: student.name,
                            teacher: t.name,
                            field,
                            actualPoints,
                            weightPerTeacher,
                            assignedVal: actualPoints * weightPerTeacher
                          });
                        }
                        const assignedVal = actualPoints * weightPerTeacher;"""

content = content.replace("                      if (actualPoints > 0) {\n                        const assignedVal = actualPoints * weightPerTeacher;", debug_code)

with open("pages/RadiographerWorkloadPage.tsx", "w") as f:
    f.write(content)
print("Debug added")
