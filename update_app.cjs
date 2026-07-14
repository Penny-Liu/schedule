const fs = require('fs');
const path = require('path');

const appFile = path.join('/Users/liuyaping/Downloads/schedule/', 'App.tsx');
let appContent = fs.readFileSync(appFile, 'utf8');

if (!appContent.includes('GenePage')) {
  appContent = appContent.replace(
    'import MeetingRoomPage from "./pages/MeetingRoomPage";',
    'import MeetingRoomPage from "./pages/MeetingRoomPage";\nimport GenePage from "./pages/GenePage";'
  );

  appContent = appContent.replace(
    'return <MeetingRoomPage currentUser={currentUser} />;',
    'return <MeetingRoomPage currentUser={currentUser} />;\n      case "gene":\n        return <GenePage currentUser={currentUser} />;'
  );

  fs.writeFileSync(appFile, appContent);
}

const sidebarFile = path.join('/Users/liuyaping/Downloads/schedule/components', 'Sidebar.tsx');
let sidebarContent = fs.readFileSync(sidebarFile, 'utf8');

if (!sidebarContent.includes('label: "基因"')) {
  sidebarContent = sidebarContent.replace(
    '          label: "會議室",\n          view: "meeting_room",',
    '          label: "會議室",\n          view: "meeting_room",\n        },\n        {\n          id: "gene",\n          icon: FileText,\n          label: "基因",\n          view: "gene",'
  );

  fs.writeFileSync(sidebarFile, sidebarContent);
}

console.log("Updated App.tsx and Sidebar.tsx");
