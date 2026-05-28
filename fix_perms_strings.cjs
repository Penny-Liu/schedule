const fs = require('fs');
let code = fs.readFileSync('services/store.ts', 'utf8');

code = code.replace(/perms\.includes\("view_cloud_schedule"\)/g, 'perms.includes(PERMISSIONS.VIEW_CLOUD_SCHEDULE)');
code = code.replace(/perms\.includes\("physician_view"\)/g, 'perms.includes(PERMISSIONS.VIEW_PHYSICIAN)');
code = code.replace(/perms\.includes\("health_mgmt_view"\)/g, 'perms.includes(PERMISSIONS.VIEW_HEALTH_MGMT)');
code = code.replace(/perms\.includes\("anesthesia_view"\)/g, 'perms.includes(PERMISSIONS.VIEW_ANESTHESIA)');
code = code.replace(/perms\.includes\("administrative_view"\)/g, 'perms.includes(PERMISSIONS.VIEW_ADMINISTRATIVE)');
code = code.replace(/perms\.includes\("staff_edit"\)/g, 'perms.includes(PERMISSIONS.EDIT_STAFF)');
code = code.replace(/perms\.includes\("settings_edit"\)/g, 'perms.includes(PERMISSIONS.EDIT_SETTINGS)');
code = code.replace(/perms\.includes\("health_mgmt_edit"\)/g, 'perms.includes(PERMISSIONS.EDIT_HEALTH_MGMT)');
code = code.replace(/perms\.includes\("edit_cloud_schedule"\)/g, 'perms.includes(PERMISSIONS.EDIT_CLOUD_SCHEDULE)');

fs.writeFileSync('services/store.ts', code);
console.log('Fixed permissions string literals in store.ts');
