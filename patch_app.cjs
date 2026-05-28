const fs = require('fs');

let code = fs.readFileSync('App.tsx', 'utf8');

// 1. Replace db.initializeData() with db.initializeAuthData()
code = code.replace(/await db\.initializeData\(\);/g, 'await db.initializeAuthData();');
code = code.replace(/db\.initializeData\(true\);/g, 'db.initializeAuthData(true);');

// 2. Update handleLogin
const loginRegex = /const handleLogin = \(user: User\) => \{\n    setCurrentUser\(user\);\n    db\.currentUser = user;/m;

const newLogin = `const handleLogin = async (user: User) => {
    setIsLoading(true);
    setCurrentUser(user);
    db.currentUser = user;
    
    try {
      await db.initializeDataForUser(user);
    } catch (e) {
      console.error("Error loading user data", e);
    }
    
    setIsLoading(false);`;

code = code.replace(loginRegex, newLogin);

fs.writeFileSync('App.tsx', code);
console.log('Patched App.tsx successfully');
